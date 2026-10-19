import { LAYERS, type Layer, type LayerSetting } from './types';

export interface MixerOptions {
  /** Maps a stem base name to a playable URL (asset protocol or relative path). */
  urlFor: (file: string) => string;
  /** Base names that exist on disk; null disables the check. */
  available?: Set<string> | null;
}

type Voice = { node: AudioBufferSourceNode; gain: GainNode; file: string };

/**
 * Layer mixer for the Set 10 stems.
 *
 * One voice per stem file: files shared by several layers (the base piano
 * track, ILLBEATS) are played once instead of being stacked. Voices keep
 * running while layers are toggled, so switching during playback stays in sync
 * and only ramps gain.
 */
export class StemMixer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private buffers = new Map<string, AudioBuffer>();
  private planFiles: Record<Layer, string | null> = { drums: null, chords: null, top: null };
  private layerSettings: Record<Layer, LayerSetting> = {
    drums: { enabled: true, volume: 1, override: null },
    chords: { enabled: true, volume: 1, override: null },
    top: { enabled: true, volume: 1, override: null },
  };
  private master = 0.9;
  private lockLoop = true;
  private playing = false;
  private startedAt = 0;
  private offset = 0;

  constructor(private options: MixerOptions) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.master;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  has(file: string): boolean {
    const available = this.options.available;
    return !available || available.has(file);
  }

  private async load(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file) ?? null;
    const ctx = this.ensureContext();
    try {
      const response = await fetch(this.options.urlFor(file));
      const data = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      this.buffers.set(file, buffer);
      return buffer;
    } catch (error) {
      console.warn(`stem not playable: ${file}`, error);
      return null;
    }
  }

  /** Transport position in seconds, clamped so scheduling never goes negative. */
  private position(): number {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.max(0, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  private loopLength(): number | null {
    const files = [...new Set(this.activeFiles())];
    const lengths = files
      .map((file) => this.buffers.get(file)?.duration)
      .filter((value): value is number => typeof value === 'number');
    if (!lengths.length) return null;
    return Math.min(...lengths);
  }

  private activeFiles(): string[] {
    const files: string[] = [];
    for (const layer of LAYERS) {
      const file = this.planFiles[layer];
      if (file && this.has(file)) files.push(file);
    }
    return files;
  }

  private voiceTarget(file: string): number {
    let target = 0;
    for (const layer of LAYERS) {
      const setting = this.layerSettings[layer];
      if (!setting.enabled || this.planFiles[layer] !== file) continue;
      target = Math.max(target, setting.volume);
    }
    return target * this.master;
  }

  private applyGains(when?: number) {
    if (!this.ctx) return;
    const at = when ?? this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      voice.gain.gain.setTargetAtTime(this.voiceTarget(voice.file), at, 0.04);
    }
  }

  async start(settings: Record<Layer, LayerSetting>, master: number, lockLoop: boolean) {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.layerSettings = settings;
    this.master = master;
    this.lockLoop = lockLoop;
    this.offset = 0;
    this.playing = true;
    this.startedAt = ctx.currentTime + 0.08;
    await this.applyPlan(this.planFiles, { hard: true });
  }

  async applyPlan(plan: Record<Layer, string | null>, { hard = false } = {}) {
    this.planFiles = { ...plan };
    if (!this.playing || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const startAt = hard ? this.startedAt : ctx.currentTime + 0.02;
    const files = [...new Set(this.activeFiles())];

    for (const file of files) await this.load(file);

    const loop = this.lockLoop ? this.loopLength() : null;
    const rawPosition = this.position();
    const offset = loop ? rawPosition % loop : rawPosition;

    for (const file of files) {
      const buffer = this.buffers.get(file);
      if (!buffer) continue;
      let voice = this.voices.get(file);
      if (!voice) {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        const target = loop ? Math.min(loop, buffer.duration) : buffer.duration;
        // A degenerate loop region would make Web Audio throw; fall back to a
        // one-shot source instead.
        if (target > 0.05) {
          node.loop = true;
          node.loopStart = 0;
          node.loopEnd = target;
        }
        const gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.masterGain);
        // Clamp the schedule offset: a start time in the future must not yield a
        // negative offset, which is what AudioBufferSourceNode.start rejects.
        const limit = target > 0.05 ? Math.max(0, target - 0.01) : Math.max(0, buffer.duration - 0.01);
        const safeOffset = Math.max(0, Math.min(hard ? 0 : offset, limit));
        node.start(startAt, safeOffset);
        voice = { node, gain, file };
        this.voices.set(file, voice);
      }
      voice.gain.gain.setTargetAtTime(this.voiceTarget(file), startAt, 0.12);
    }

    for (const [file, voice] of [...this.voices]) {
      if (files.includes(file)) continue;
      voice.gain.gain.cancelScheduledValues(ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      voice.node.stop(ctx.currentTime + 0.4);
      this.voices.delete(file);
    }
  }

  /** Live layer edit: toggle, fader or style override. */
  updateLayers(settings: Record<Layer, LayerSetting>) {
    this.layerSettings = settings;
    this.applyGains();
  }

  setMaster(value: number) {
    this.master = value;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    }
    this.applyGains();
  }

  setLockLoop(value: boolean) {
    this.lockLoop = value;
  }

  restart() {
    if (!this.ctx || !this.playing) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      voice.node.stop(now + 0.05);
    }
    this.voices.clear();
    this.offset = 0;
    this.startedAt = now + 0.06;
    void this.applyPlan(this.planFiles, { hard: true });
  }

  stop() {
    if (!this.ctx || !this.playing) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.05);
      voice.node.stop(now + 0.3);
    }
    this.voices.clear();
    this.playing = false;
  }
}
