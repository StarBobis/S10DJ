import type { MixerOptions } from './audio';
import type { Layer, LayerSetting } from './types';
import { LAYERS } from './types';

/** One switch-selected clip on the game's music-segment timeline. */
export interface ClipSpec {
  /** Desk stem file. */
  file: string;
  /** Segment time where the clip enters, in seconds. */
  playAt: number;
  /** Media offset applied when the clip enters, in seconds. */
  begin: number;
  /** Playable media length, in seconds. */
  duration: number;
}

export interface SongSpec {
  /** Loop point: the Wwise exit marker, in seconds. */
  loop: number;
  /** Entry marker, kept for diagnostics. */
  entry: number;
}

type Voice = {
  layer: Layer;
  clip: ClipSpec;
  node: AudioBufferSourceNode;
  gain: GainNode;
  startAt: number;
  offset: number;
  stopAt: number;
  loopIndex: number;
};

const SCHEDULE_LEAD = 0.12;
const LOOKAHEAD = 0.8;
const FADE = 0.04;

/**
 * Segment-timeline mixer for the Set 10 soundtrack.
 *
 * The game plays one Wwise music segment with three switch-selected tracks. A
 * clip enters at its authored `fPlayAt` (1.659 s, 8.516 s, ...), plays from its
 * media offset until the segment's exit marker, and the whole segment loops
 * there. This class schedules those clips per loop instead of looping each file
 * on its own duration, so the desk and the game share one bar grid.
 *
 * One voice per layer is kept in `voices`; earlier voices are faded out and
 * left to stop on their own. Every loop pass is scheduled ahead of time on the
 * audio clock, so a plan edit can join the running pass at the right media
 * offset without restarting the other layers.
 */
export class SegmentMixer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private layerGains: Record<Layer, GainNode> | null = null;
  private layerSettings: Record<Layer, LayerSetting> = {
    drums: { enabled: true, volume: 1, override: null },
    chords: { enabled: true, volume: 1, override: null },
    top: { enabled: true, volume: 1, override: null },
  };
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<Layer, Voice>();
  /** Every scheduled voice, including ones waiting for a future loop. */
  private allVoices = new Set<Voice>();
  private plan: Record<Layer, ClipSpec | null> = { drums: null, chords: null, top: null };
  private song: SongSpec = { loop: 0, entry: 0 };
  private master = 0.9;
  private playing = false;
  private startedAt = 0;
  private scheduled = new Set<number>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private applyToken = 0;

  constructor(private options: MixerOptions) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  songSeconds(): number | null {
    return this.song.loop > 0.05 ? this.song.loop : null;
  }

  /**
   * Continuous time since the song started, not wrapped at the loop. The radio
   * compares this against `songSeconds()`; a wrapped value never reaches the
   * song length and the station would never rotate.
   */
  get positionSeconds(): number {
    if (!this.playing || !this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  has(file: string): boolean {
    const available = this.options.available;
    return !available || available.has(file);
  }

  private emit(message: string) {
    this.options.onEvent?.(message);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.master;
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 1024;
      this.analyserNode.smoothingTimeConstant = 0.82;
      this.masterGain.connect(this.analyserNode).connect(this.ctx.destination);
      this.layerGains = {
        drums: this.ctx.createGain(),
        chords: this.ctx.createGain(),
        top: this.ctx.createGain(),
      };
      for (const layer of LAYERS) this.layerGains[layer].connect(this.masterGain);
      this.applyLayerGains(this.ctx.currentTime);
    }
    return this.ctx;
  }

  private applyLayerGains(when: number) {
    if (!this.ctx || !this.layerGains) return;
    for (const layer of LAYERS) {
      const setting = this.layerSettings[layer];
      const target = setting.enabled ? setting.volume : 0;
      const gain = this.layerGains[layer].gain;
      gain.cancelScheduledValues(when);
      gain.setTargetAtTime(target, when, 0.02);
    }
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) return Promise.resolve(cached);
    const running = this.loading.get(file);
    if (running) return running;

    const task = this.fetchAndDecode(file).finally(() => this.loading.delete(file));
    this.loading.set(file, task);
    return task;
  }

  private async fetchAndDecode(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    const urls = [this.options.urlFor(file)];
    const fallback = this.options.fallbackUrlFor?.(file);
    if (fallback) urls.push(fallback);
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const data = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this.buffers.set(file, buffer);
        this.emit(`stem ok: ${file} (${buffer.duration.toFixed(1)}s) via ${url}`);
        return buffer;
      } catch (error) {
        this.emit(`stem failed: ${file} via ${url}: ${String(error)}`);
      }
    }
    this.emit(`stem missing: ${file}`);
    return null;
  }

  /** Segment position at an arbitrary audio-clock time. */
  private positionAt(time: number): number {
    if (!this.playing || this.song.loop <= 0.05) return 0;
    return Math.max(0, time - this.startedAt) % this.song.loop;
  }

  private position(): number {
    return this.ctx ? this.positionAt(this.ctx.currentTime) : 0;
  }

  private loopIndexAt(now: number): number {
    if (this.song.loop <= 0.05) return 0;
    return Math.floor(Math.max(0, now - this.startedAt) / this.song.loop);
  }

  private loopStart(index: number): number {
    return this.startedAt + index * this.song.loop;
  }

  private clipDuration(clip: ClipSpec): number {
    return Math.max(0.05, clip.duration);
  }

  private createVoice(
    layer: Layer,
    clip: ClipSpec,
    startAt: number,
    offset: number,
    duration: number,
    loopIndex: number,
  ): Voice | null {
    const ctx = this.ctx;
    const gains = this.layerGains;
    const buffer = this.buffers.get(clip.file);
    if (!ctx || !gains || !buffer) return null;
    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.02)));
    const maxDuration = Math.max(0, Math.min(duration, buffer.duration - safeOffset));
    if (maxDuration <= 0.02) return null;

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    const gain = ctx.createGain();
    const start = Math.max(ctx.currentTime, startAt);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(1, start + FADE);
    node.connect(gain).connect(gains[layer]);
    node.start(start, safeOffset, maxDuration);
    const voice: Voice = {
      layer,
      clip,
      node,
      gain,
      startAt: start,
      offset: safeOffset,
      stopAt: start + maxDuration,
      loopIndex,
    };
    this.allVoices.add(voice);
    node.onended = () => {
      gain.disconnect();
      node.disconnect();
      this.allVoices.delete(voice);
      if (this.voices.get(layer) === voice) this.voices.delete(layer);
    };
    return voice;
  }

  private fadeStop(voice: Voice, now: number) {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.02);
    try {
      voice.node.stop(now + 0.18);
    } catch {
      /* already stopped */
    }
  }

  /** Schedule every clip of one loop pass. */
  private scheduleLoop(index: number) {
    if (!this.ctx || this.song.loop <= 0.05) return;
    if (this.scheduled.has(index)) return;
    this.scheduled.add(index);
    const start = this.loopStart(index);
    let created = 0;
    for (const layer of LAYERS) {
      const clip = this.plan[layer];
      if (!clip) continue;
      const existing = [...this.allVoices].find(
        (voice) => voice.layer === layer && voice.loopIndex === index,
      );
      if (existing) continue;
      const playAt = Math.max(0, clip.playAt);
      const offset = clip.begin + Math.max(0, -clip.playAt);
      const duration = Math.min(this.clipDuration(clip) - Math.max(0, -clip.playAt), this.song.loop - playAt);
      if (duration <= 0.05) continue;
      const voice = this.createVoice(layer, clip, start + playAt, offset, duration, index);
      if (voice) {
        this.voices.set(layer, voice);
        created += 1;
      }
    }
    this.emit(`loop ${index}: ${created} voice(s) scheduled at ${start.toFixed(2)}s`);
  }

  private sameClip(a: ClipSpec | null | undefined, b: ClipSpec | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    return a.file === b.file && a.playAt === b.playAt && a.begin === b.begin;
  }

  /** Join a clip at the current transport position (in-place switch). */
  private joinClip(layer: Layer, clip: ClipSpec | null) {
    const ctx = this.ctx;
    if (!ctx || this.song.loop <= 0.05) return;
    const now = ctx.currentTime;
    const existing = this.voices.get(layer);
    if (existing && this.sameClip(existing.clip, clip)) return;
    if (existing) this.fadeStop(existing, now);
    // A loop pass may already be scheduled ahead with the old clip; cancel the
    // future voices for this layer or they would re-enter after the switch.
    for (const voice of [...this.allVoices]) {
      if (voice.layer !== layer || voice.startAt <= now + 0.01) continue;
      if (this.sameClip(voice.clip, clip)) continue;
      this.fadeStop(voice, now);
    }
    this.voices.delete(layer);
    if (!clip) return;

    const buffer = this.buffers.get(clip.file);
    if (!buffer) return;
    // Offset the clip against the position at its scheduled start, not at
    // "now": a 20 ms lead would otherwise leave every joined layer 20 ms late.
    const startAt = now + 0.02;
    const startPosition = this.positionAt(startAt);
    const index = this.loopIndexAt(startAt);
    const duration = Math.min(this.clipDuration(clip), buffer.duration);
    let offset: number;
    let playDuration: number;
    if (startPosition < clip.playAt) {
      playDuration = Math.min(duration - Math.max(0, -clip.playAt), this.song.loop - clip.playAt);
      offset = clip.begin;
    } else {
      const advanced = startPosition - clip.playAt;
      offset = clip.begin + advanced;
      playDuration = Math.min(duration - advanced, this.song.loop - startPosition);
      if (advanced >= duration || playDuration <= 0.02) {
        // The clip already finished in this pass; wait for the next one.
        const next = this.loopStart(index + 1) + Math.max(0, clip.playAt);
        offset = clip.begin + Math.max(0, -clip.playAt);
        playDuration = Math.min(duration - Math.max(0, -clip.playAt), this.song.loop - Math.max(0, clip.playAt));
        const voice = this.createVoice(layer, clip, next, offset, playDuration, index + 1);
        if (voice) this.voices.set(layer, voice);
        return;
      }
    }
    const voice = this.createVoice(layer, clip, startAt, offset, playDuration, index);
    if (voice) this.voices.set(layer, voice);
  }

  private tick() {
    if (!this.playing || !this.ctx || this.song.loop <= 0.05) return;
    const now = this.ctx.currentTime;
    const index = this.loopIndexAt(now);
    const nextStart = this.loopStart(index + 1);
    if (nextStart < now + LOOKAHEAD) {
      this.scheduleLoop(index + 1);
    }
    // A background tab can skip several loops; re-seat rather than pile up.
    const currentStart = this.loopStart(index);
    if (now - currentStart > this.song.loop * 2) {
      this.reseat(now);
    }
  }

  private async apply(plan: Record<Layer, ClipSpec | null>, hard: boolean) {
    if (!this.ctx) this.ensureContext();
    const ctx = this.ctx;
    if (!ctx) return;
    this.plan = { ...plan };
    if (!this.playing) return;

    const token = ++this.applyToken;
    const files = [...new Set(LAYERS.map((layer) => plan[layer]?.file).filter((file): file is string => Boolean(file)))];
    await Promise.all(files.map((file) => this.load(file)));
    if (token !== this.applyToken || !this.playing) return;
    this.emit(
      `apply ${hard ? 'hard' : 'soft'}: loop ${this.song.loop.toFixed(3)}s ` +
        LAYERS.map((layer) => `${layer}=${plan[layer]?.file ?? '-'}`).join(' '),
    );

    if (hard) {
      const now = ctx.currentTime;
      // Every layer and every pending loop pass belongs to the old song; stop
      // all of them, otherwise their old loopIndex blocks the new schedule.
      for (const voice of [...this.allVoices]) {
        this.fadeStop(voice, now);
      }
      this.allVoices.clear();
      this.voices.clear();
      this.scheduled.clear();
      this.startedAt = Math.max(this.startedAt, now + SCHEDULE_LEAD);
      this.scheduleLoop(0);
      const files = LAYERS.map((layer) => plan[layer]?.file).filter(
        (file): file is string => Boolean(file),
      );
      this.emit(
        `hard start: ${files.length} stems at offset 0 (song ${this.song.loop.toFixed(2)}s): ${files.join(', ')}`,
      );
      this.emit(
        `re-seated ${files.length} voices at ${this.positionAt(now).toFixed(2)}s (loop ${this.song.loop.toFixed(2)}s)`,
      );
      return;
    }

    for (const layer of LAYERS) this.joinClip(layer, plan[layer]);
  }

  /** Start a new song from segment time zero. */
  async start(
    plan: Record<Layer, ClipSpec | null>,
    settings: Record<Layer, LayerSetting>,
    master: number,
    _lockLoop: boolean,
    song: SongSpec,
  ) {
    this.ensureContext();
    this.layerSettings = settings;
    this.master = master;
    this.song = song;
    this.playing = true;
    this.startedAt = (this.ctx?.currentTime ?? 0) + SCHEDULE_LEAD;
    this.scheduled.clear();
    await this.apply(plan, true);
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => this.tick(), 200);
    this.emit(`segment start: loop ${song.loop.toFixed(3)}s, entry ${song.entry.toFixed(3)}s`);
  }

  async applyPlan(plan: Record<Layer, ClipSpec | null>, song?: SongSpec) {
    if (song && Math.abs(song.loop - this.song.loop) > 0.001) {
      this.song = song;
      await this.apply(plan, true);
      return;
    }
    if (song) this.song = song;
    await this.apply(plan, false);
  }

  async restart(plan?: Record<Layer, ClipSpec | null>) {
    if (!this.playing) return;
    await this.apply(plan ?? this.plan, true);
  }

  updateLayers(settings: Record<Layer, LayerSetting>) {
    this.layerSettings = settings;
    if (this.ctx) this.applyLayerGains(this.ctx.currentTime);
  }

  /** Kept for the old transport control; the segment loop is always exact. */
  setLockLoop(_lock: boolean) {
    /* the game's segment loop is not optional */
  }

  setMaster(value: number) {
    this.master = value;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
  }

  stop() {
    const now = this.ctx?.currentTime ?? 0;
    for (const voice of [...this.allVoices]) this.fadeStop(voice, now);
    this.allVoices.clear();
    this.voices.clear();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.playing = false;
    this.scheduled.clear();
  }

  private reseat(now: number) {
    for (const voice of [...this.allVoices]) this.fadeStop(voice, now);
    this.allVoices.clear();
    this.voices.clear();
    this.scheduled.clear();
    this.startedAt = now + 0.02;
    this.scheduleLoop(0);
  }

  async selfTest(files: string[]): Promise<{ ok: string[]; failed: string[] }> {
    const ok: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const buffer = await this.load(file);
      (buffer ? ok : failed).push(file);
    }
    return { ok, failed };
  }

  clearCache() {
    this.buffers.clear();
  }

  phaseReport() {
    const ctx = this.ctx;
    const loop = this.song.loop > 0.05 ? this.song.loop : null;
    const transport = this.position();
    if (!ctx) return { playing: false, loop, transport, voices: [] as Array<Record<string, unknown>> };
    const now = ctx.currentTime;
    const voices = [...this.voices.values()].map((voice) => {
      const playAt = voice.clip.playAt;
      const expected =
        voice.clip.begin +
        (playAt < 0 ? transport - playAt : transport >= playAt ? transport - playAt : 0);
      const mediaPosition = voice.offset + Math.max(0, now - voice.startAt);
      const audible = now >= voice.startAt && now < voice.stopAt;
      return {
        layer: voice.layer,
        file: voice.clip.file,
        playAt,
        startAt: voice.startAt,
        offset: voice.offset,
        phase: transport,
        expected,
        mediaPosition,
        delta: audible && now >= voice.startAt ? mediaPosition - expected : 0,
        audible,
      };
    });
    return { playing: this.playing, loop, transport, voices };
  }
}
