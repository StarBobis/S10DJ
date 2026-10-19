/**
 * Web Audio playback for the Set 10 stems.
 *
 * Every style provides one file per layer (drums / chords / top) and per era
 * (early / late). The engine keeps a single transport position, starts all
 * active stems from that position and crossfades when the layer assignment
 * changes.
 */

export class StemMixer {
  constructor({ audioDir = 'assets/audio_ogg', durationsUrl = 'assets/audio_ogg/durations.json', stems = {} } = {}) {
    this.audioDir = audioDir;
    this.durationsUrl = durationsUrl;
    this.stems = stems;          // style -> layer -> era -> file base name
    this.ctx = null;
    this.gains = new Map();      // layer -> GainNode
    this.sources = new Map();    // layer -> { node, gain, file }
    this.buffers = new Map();    // file -> AudioBuffer
    this.durations = {};
    this.playing = false;
    this.startedAt = 0;
    this.offset = 0;
    this.era = 'late';
    this.layerGain = { drums: 1, chords: 1, top: 1 };
    this.master = 0.9;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.master;
    this.masterGain.connect(this.ctx.destination);
    for (const layer of ['drums', 'chords', 'top']) {
      const gain = this.ctx.createGain();
      gain.gain.value = this.layerGain[layer];
      gain.connect(this.masterGain);
      this.gains.set(layer, gain);
    }
    try {
      const response = await fetch(this.durationsUrl);
      this.durations = await response.json();
    } catch (error) {
      console.warn('durations.json missing, loop length falls back to buffer length', error);
      this.durations = {};
    }
  }

  /** Resolve a style/layer/era triple into a stem file base name. */
  fileFor(style, layer, era) {
    const styleStems = this.stems[style] || {};
    const layerStems = styleStems[layer] || {};
    if (layerStems[era]) return layerStems[era];
    const other = era === 'late' ? 'early' : 'late';
    if (layerStems[other]) return layerStems[other];
    return `${style}_${era}`;
  }

  /** Resolve a layer assignment into concrete files. */
  planFor(assignment, era) {
    const plan = {};
    for (const [layer, info] of Object.entries(assignment)) {
      plan[layer] = { style: info.style, file: this.fileFor(info.style, layer, era) };
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

  async start(assignment, era = this.era) {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.era = era;
    this.offset = 0;
    this.startedAt = this.ctx.currentTime + 0.08;
    this.playing = true;
    await this.apply(assignment, { hard: true });
  }

  stop() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    for (const [, entry] of this.sources) {
      entry.gain.gain.cancelScheduledValues(now);
      entry.gain.gain.setTargetAtTime(0, now, 0.05);
      entry.node.stop(now + 0.3);
    }
    this.sources.clear();
    this.playing = false;
  }

  setLayerGain(layer, value) {
    this.layerGain[layer] = value;
    const gain = this.gains.get(layer);
    if (gain) gain.gain.setTargetAtTime(value * this.master, this.ctx.currentTime, 0.02);
  }

  setMaster(value) {
    this.master = value;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Apply a new layer plan, crossfading changed layers. */
  async apply(assignment, { hard = false } = {}) {
    if (!this.playing) return;
    const era = this.era;
    const plan = this.planFor(assignment, era);
    const now = this.ctx.currentTime;
    const startAt = hard ? this.startedAt : now + 0.02;

    const needed = new Set(Object.values(plan).map((item) => item.file));
    for (const file of needed) {
      try {
        await this.loadFile(file);
      } catch (error) {
        console.warn(String(error));
      }
    }

    for (const layer of ['drums', 'chords', 'top']) {
      const target = plan[layer];
      const current = this.sources.get(layer);
      if (current && current.file === target.file) continue;
      if (current) {
        current.gain.gain.cancelScheduledValues(now);
        current.gain.gain.setTargetAtTime(0, now, 0.08);
        current.node.stop(now + 0.4);
        this.sources.delete(layer);
      }
      const buffer = this.buffers.get(target.file);
      if (!buffer) continue;
      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(this.gains.get(layer));
      const offset = this.position() % buffer.duration;
      node.start(startAt, offset);
      gain.gain.setTargetAtTime(this.layerGain[layer], startAt, 0.12);
      this.sources.set(layer, { node, gain, file: target.file });
    }
  }
}
