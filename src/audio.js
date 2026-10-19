/**
 * Web Audio playback for the Set 10 stems.
 *
 * Every style provides one file per layer (drums / chords / top) and per era
 * (early / late). Voices are keyed by file, so a file shared by several layers
 * (the base piano track, ILLBEATS) is played once instead of being stacked.
 */

const LAYERS = ['drums', 'chords', 'top'];

export class StemMixer {
  constructor({ audioDir = 'assets/audio_ogg', durationsUrl = 'assets/audio_ogg/durations.json', stems = {} } = {}) {
    this.audioDir = audioDir;
    this.durationsUrl = durationsUrl;
    this.stems = stems;              // style -> layer -> era -> file base name
    this.ctx = null;
    this.layerGain = { drums: 1, chords: 1, top: 1 };
    this.layerPlan = {};             // layer -> file currently feeding it
    this.voices = new Map();         // file -> { node, gain }
    this.buffers = new Map();        // file -> AudioBuffer
    this.available = new Set();      // file base names that exist on disk
    this.durations = {};             // file -> seconds
    this.master = 0.9;
    this.playing = false;
    this.startedAt = 0;
    this.offset = 0;
    this.era = 'late';
    this.lockLoop = true;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.master;
    this.masterGain.connect(this.ctx.destination);
    this.gains = new Map();
    for (const layer of LAYERS) {
      const gain = this.ctx.createGain();
      gain.gain.value = this.layerGain[layer];
      gain.connect(this.masterGain);
      this.gains.set(layer, gain);
    }
    try {
      const response = await fetch(this.durationsUrl);
      this.durations = await response.json();
      for (const [name, seconds] of Object.entries(this.durations)) {
        if (seconds && seconds > 30) {           // ignore stingers
          this.available.add(name);
        }
      }
    } catch (error) {
      console.warn('durations.json unavailable, assuming every stem exists', error);
      this.available = null;
    }
  }

  has(file) {
    return !this.available || this.available.has(file);
  }

  /** Resolve a style/layer/era triple into a stem file base name (or null). */
  fileFor(style, layer, era) {
    const layerStems = (this.stems[style] || {})[layer] || {};
    const candidates = [layerStems[era], layerStems[era === 'late' ? 'early' : 'late']];
    for (const candidate of candidates) {
      if (candidate && this.has(candidate)) return candidate;
    }
    return null;
  }

  /** Resolve a layer assignment into file base names per layer. */
  planFor(assignment, era) {
    const plan = {};
    for (const layer of LAYERS) {
      const info = assignment[layer];
      plan[layer] = info ? this.fileFor(info.style, layer, era) : null;
    }
    return plan;
  }

  async loadFile(base) {
    if (this.buffers.has(base)) return this.buffers.get(base);
    const response = await fetch(`${this.audioDir}/${base}.ogg`);
    if (!response.ok) throw new Error(`missing stem ${base}`);
    const data = await response.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.buffers.set(base, buffer);
    return buffer;
  }

  position() {
    if (!this.playing) return this.offset;
    return this.offset + (this.ctx.currentTime - this.startedAt);
  }

  /** Seconds since the transport started, wrapped to the shared loop length. */
  loopPosition(loopLength) {
    const raw = this.position();
    return loopLength ? raw % loopLength : raw;
  }

  loopLengthFor(plan) {
    const files = [...new Set(Object.values(plan).filter(Boolean))];
    const lengths = files
      .map((file) => this.buffers.get(file)?.duration)
      .filter((value) => typeof value === 'number');
    if (!lengths.length) return null;
    return Math.min(...lengths);
  }

  voiceTarget(file, plan) {
    const layers = LAYERS.filter((layer) => plan[layer] === file);
    if (!layers.length) return 0;
    return Math.max(...layers.map((layer) => this.layerGain[layer]));
  }

  async start(assignment, era = this.era) {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.era = era;
    this.offset = 0;
    this.startedAt = this.ctx.currentTime + 0.08;
    this.playing = true;
    await this.apply(assignment, { hard: true });
  }

  restart(assignment) {
    if (!this.playing) return;
    this.offset = 0;
    this.startedAt = this.ctx.currentTime + 0.05;
    for (const [, voice] of this.voices) {
      voice.node.stop(this.ctx.currentTime + 0.05);
    }
    this.voices.clear();
    return this.apply(assignment, { hard: true });
  }

  stop() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    for (const [, voice] of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.05);
      voice.node.stop(now + 0.3);
    }
    this.voices.clear();
    this.playing = false;
  }

  /** Re-apply every voice level after a fader move. */
  refreshGains(plan = this.layerPlan) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [file, voice] of this.voices) {
      voice.gain.gain.setTargetAtTime(this.voiceTarget(file, plan) * this.master, now, 0.03);
    }
    for (const layer of LAYERS) {
      const gain = this.gains.get(layer);
      if (gain) gain.gain.setTargetAtTime(this.layerGain[layer] * this.master, now, 0.02);
    }
  }

  setLayerGain(layer, value) {
    this.layerGain[layer] = value;
    this.refreshGains();
  }

  setMaster(value) {
    this.master = value;
    this.refreshGains();
  }

  setLockLoop(value) {
    this.lockLoop = Boolean(value);
  }

  /** Apply a new layer plan, starting, fading and retiring voices as needed. */
  async apply(assignment, { hard = false } = {}) {
    if (!this.playing) return;
    const plan = this.planFor(assignment, this.era);
    this.layerPlan = plan;
    const now = this.ctx.currentTime;
    const startAt = hard ? this.startedAt : now + 0.02;

    const files = [...new Set(Object.values(plan).filter(Boolean))];
    for (const file of files) {
      try {
        await this.loadFile(file);
      } catch (error) {
        console.warn(String(error));
      }
    }

    const loopLength = this.lockLoop ? this.loopLengthFor(plan) : null;
    const offset = this.loopPosition(loopLength);

    for (const file of files) {
      const buffer = this.buffers.get(file);
      if (!buffer) continue;
      let voice = this.voices.get(file);
      if (!voice) {
        const node = this.ctx.createBufferSource();
        node.buffer = buffer;
        node.loop = true;
        if (loopLength) {
          node.loopStart = 0;
          node.loopEnd = Math.min(loopLength, buffer.duration);
        }
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.masterGain);
        node.start(startAt, loopLength ? offset % node.loopEnd : offset % buffer.duration);
        voice = { node, gain };
        this.voices.set(file, voice);
      }
      voice.gain.gain.setTargetAtTime(this.voiceTarget(file, plan) * this.master, startAt, 0.1);
    }

    for (const [file, voice] of [...this.voices]) {
      if (files.includes(file)) continue;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.08);
      voice.node.stop(now + 0.4);
      this.voices.delete(file);
    }
  }
}
