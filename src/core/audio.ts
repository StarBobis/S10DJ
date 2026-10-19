import { LAYERS, type Layer, type LayerSetting } from './types';

export interface MixerOptions {
  /** Maps a stem base name to a playable URL (asset protocol or relative path). */
  urlFor: (file: string) => string;
  /** Second URL scheme, tried when the first one is unreachable. */
  fallbackUrlFor?: (file: string) => string | null;
  /** Base names that exist on disk; null disables the check. */
  available?: Set<string> | null;
  /** Mirror of load results, forwarded to the backend log. */
  onEvent?: (message: string) => void;
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
  private loading = new Map<string, Promise<AudioBuffer | null>>();
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
  private applyToken = 0;

  constructor(private options: MixerOptions) {}

  get isPlaying(): boolean {
    return this.playing;
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

  private emit(message: string) {
    this.options.onEvent?.(message);
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
    if (fallback && fallback !== urls[0]) urls.push(fallback);
    for (const url of urls) {
      const scheme = url.startsWith('http') ? 'asset protocol' : 'dev server';
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this.buffers.set(file, buffer);
        this.emit(`stem ok: ${file} (${buffer.duration.toFixed(1)}s) via ${scheme}`);
        return buffer;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit(`stem failed: ${file} via ${scheme} - ${message}`);
      }
    }
    return null;
  }

  /** Try one specific URL and report whether it decodes (used by diagnostics). */
  async probe(file: string, url: string): Promise<boolean> {
    const scheme = url.startsWith('http') ? 'asset protocol' : 'dev server';
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      const buffer = await this.ensureContext().decodeAudioData(data);
      this.emit(`probe ok: ${file} via ${scheme} (${buffer.duration.toFixed(1)}s)`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit(`probe failed: ${file} via ${scheme} - ${message}`);
      return false;
    }
  }

  /** Decode a set of stems and report the outcome, used by the diagnostics card. */
  async selfTest(files: string[]): Promise<{ ok: string[]; failed: string[] }> {
    const results = await Promise.all(files.map(async (file) => ({ file, buffer: await this.load(file) })));
    const ok = results.filter((item) => item.buffer).map((item) => item.file);
    const failed = results.filter((item) => !item.buffer).map((item) => item.file);
    this.emit(
      `selftest: ${ok.length}/${files.length} stems decodable${failed.length ? ` (missing: ${failed.join(', ')})` : ''}`,
    );
    return { ok, failed };
  }

  /** Transport position in seconds, clamped so scheduling never goes negative. */
  private position(): number {
    if (!this.playing || !this.ctx) return this.offset;
    return Math.max(0, this.offset + (this.ctx.currentTime - this.startedAt));
  }

  private activeFiles(): string[] {
    const files: string[] = [];
    for (const layer of LAYERS) {
      const file = this.planFiles[layer];
      if (file && this.has(file)) files.push(file);
    }
    return files;
  }

  private activeLoop(): number | null {
    if (!this.lockLoop) return null;
    const lengths = [...new Set(this.activeFiles())]
      .map((file) => this.buffers.get(file)?.duration)
      .filter((value): value is number => typeof value === 'number' && value > 0.05);
    if (!lengths.length) return null;
    return Math.min(...lengths);
  }

  private voiceTarget(file: string): number {
    let target = 0;
    for (const layer of LAYERS) {
      const setting = this.layerSettings[layer];
      if (!setting.enabled || this.planFiles[layer] !== file) continue;
      target = Math.max(target, setting.volume);
    }
    return target;
  }

  private applyGains(when?: number) {
    if (!this.ctx) return;
    const at = when ?? this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      voice.gain.gain.setTargetAtTime(this.voiceTarget(voice.file), at, 0.04);
    }
  }

  /**
   * Update the loop region of every live voice. Locked mode wraps at the
   * shortest active stem; unlocked mode wraps each stem at its own duration.
   */
  private syncLoopRegions() {
    const loop = this.activeLoop();
    for (const voice of this.voices.values()) {
      const duration = this.buffers.get(voice.file)?.duration ?? 0;
      const end = loop ? Math.min(loop, duration) : duration;
      if (end <= 0.05) {
        voice.node.loop = false;
        continue;
      }
      voice.node.loop = true;
      voice.node.loopStart = 0;
      voice.node.loopEnd = end;
    }
  }

  async start(
    plan: Record<Layer, string | null>,
    settings: Record<Layer, LayerSetting>,
    master: number,
    lockLoop: boolean,
  ) {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    this.layerSettings = settings;
    this.master = master;
    this.lockLoop = lockLoop;
    if (this.masterGain) this.masterGain.gain.value = master;
    this.offset = 0;
    this.playing = true;
    this.startedAt = ctx.currentTime + 0.08;
    await this.applyPlan(plan, { hard: true });
  }

  async applyPlan(plan: Record<Layer, string | null>, { hard = false } = {}) {
    this.planFiles = { ...plan };
    if (!this.playing || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const token = (this.applyToken += 1);
    const files = [...new Set(this.activeFiles())];

    await Promise.all(files.map((file) => this.load(file)));
    if (token !== this.applyToken || !this.playing || !this.ctx) return;

    this.syncLoopRegions();

    const loop = this.activeLoop();
    const startAt = hard ? this.startedAt : ctx.currentTime + 0.02;
    const raw = hard ? 0 : this.position();

    for (const file of files) {
      const buffer = this.buffers.get(file);
      if (!buffer) continue;
      let voice = this.voices.get(file);
      if (!voice) {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        const region = loop ? Math.min(loop, buffer.duration) : buffer.duration;
        if (region > 0.05) {
          node.loop = true;
          node.loopStart = 0;
          node.loopEnd = region;
        }
        const gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.masterGain);

        // Never hand a negative or past-the-end offset to start(): a start time
        // in the future made position() negative in the old implementation.
        const span = region > 0.05 ? region : buffer.duration;
        const wrapped = span > 0.05 ? raw % span : 0;
        const safeOffset = Math.max(0, Math.min(wrapped, Math.max(0, span - 0.01)));
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
    if (this.lockLoop === value) return;
    this.lockLoop = value;
    this.syncLoopRegions();
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
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.05);
      voice.node.stop(now + 0.3);
    }
    this.voices.clear();
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
  }

  /** Drop decoded buffers, used by the diagnostic reset. */
  clearCache() {
    this.buffers.clear();
  }
}
