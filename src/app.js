/**
 * Set 10 mixing desk UI.
 *
 * Board units -> style weights -> one style per layer (drums / chords / top)
 * -> stem playback through Web Audio.
 */
import { StemMixer } from './audio.js';
import {
  LAYERS,
  STYLE_LAYERS,
  STYLE_LABEL,
  TRAIT_TO_STYLE,
  assignLayers,
  styleCounts,
  tierIndex,
  tierName,
} from './rules.js';

const state = {
  units: [],
  rules: null,
  roster: new Map(),   // apiName -> copies
  assignment: null,
  weights: {},
  overrides: {},       // layer -> style (manual desk override)
};

const mixer = new StemMixer();

const el = (id) => document.getElementById(id);

async function loadData() {
  const [unitsRes, rulesRes] = await Promise.all([
    fetch('data/set10_units.json'),
    fetch('data/music_rules.json'),
  ]);
  const units = await unitsRes.json();
  state.rules = await rulesRes.json();
  state.units = units.units;
  mixer.stems = state.rules.stems || {};
}

function rosterByCost() {
  const groups = new Map();
  for (const unit of state.units) {
    if (!groups.has(unit.cost)) groups.set(unit.cost, []);
    groups.get(unit.cost).push(unit);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

function renderRoster() {
  const host = el('roster');
  host.innerHTML = '';
  for (const [cost, units] of rosterByCost()) {
    const row = document.createElement('div');
    row.className = 'cost-row';
    const label = document.createElement('span');
    label.className = `cost-tag cost-${cost}`;
    label.textContent = `${cost}g`;
    row.append(label);
    for (const unit of units) {
      const copies = state.roster.get(unit.apiName) || 0;
      const button = document.createElement('button');
      button.className = `unit style-${unit.style}`;
      button.innerHTML = `<span class="unit-name">${unit.name}</span><span class="unit-style">${STYLE_LABEL[unit.style]}</span>`;
      if (copies) button.classList.add('on');
      button.addEventListener('click', () => addUnit(unit.apiName, 1));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        addUnit(unit.apiName, -1);
      });
      row.append(button);
    }
    host.append(row);
  }
}

function addUnit(apiName, delta) {
  const copies = (state.roster.get(apiName) || 0) + delta;
  if (copies <= 0) state.roster.delete(apiName);
  else state.roster.set(apiName, Math.min(copies, 3));
  render();
}

function boardUnits() {
  const board = [];
  for (const [apiName, copies] of state.roster) {
    const unit = state.units.find((item) => item.apiName === apiName);
    if (!unit) continue;
    for (let i = 0; i < copies; i += 1) board.push(unit);
  }
  return board;
}

function traitCounts(units) {
  const counts = {};
  for (const unit of units) {
    for (const trait of unit.traits || []) counts[trait] = (counts[trait] || 0) + 1;
  }
  return counts;
}

function traitTiers(counts) {
  const tiers = {};
  for (const [trait, thresholds] of Object.entries(state.rules.traitThresholds || {})) {
    tiers[trait] = { active: tierIndex(thresholds, counts[trait] || 0), count: counts[trait] || 0 };
  }
  return tiers;
}

function renderBoard(units) {
  const host = el('boardUnits');
  host.innerHTML = '';
  if (!units.length) {
    host.innerHTML = '<p class="hint">No units yet - click champions above.</p>';
    return;
  }
  const grouped = new Map();
  for (const unit of units) grouped.set(unit.apiName, (grouped.get(unit.apiName) || 0) + 1);
  for (const [apiName, copies] of grouped) {
    const unit = state.units.find((item) => item.apiName === apiName);
    const chip = document.createElement('span');
    chip.className = `chip style-${unit.style}`;
    chip.textContent = `${unit.name}${copies > 1 ? ` x${copies}` : ''}`;
    chip.title = `style: ${STYLE_LABEL[unit.style]} (${unit.style})`;
    host.append(chip);
  }
}

function renderLayers(assignment) {
  const host = el('layerGrid');
  host.innerHTML = '';
  const era = el('era')?.value || 'late';
  for (const layer of LAYERS) {
    const info = assignment[layer];
    const card = document.createElement('div');
    card.className = `layer-card style-${info.style}`;
    const file = mixer.fileFor(info.style, layer, era);
    if (!file) card.classList.add('no-stem');
    const options = ['auto', ...Object.keys(STYLE_LAYERS).filter((style) => STYLE_LAYERS[style].includes(layer))]
      .map((style) => `<option value="${style}" ${state.overrides[layer] === style ? 'selected' : ''}>${style === 'auto' ? 'auto' : STYLE_LABEL[style]}</option>`)
      .join('');
    card.innerHTML = `
      <span class="layer-name">${layer}</span>
      <span class="layer-style">${STYLE_LABEL[info.style]}</span>
      <span class="layer-weight">weight ${info.weight}${info.spotlight ? ' &middot; spotlight' : ''}</span>
      <select class="layer-select" data-layer="${layer}">${options}</select>
      <span class="layer-switch">Set_Switch_set10_${info.style}_${layer}</span>
      <span class="layer-stem">${file ? `${file} (${era})` : `no ${era} stem`}</span>`;
    card.querySelector('select').addEventListener('change', (event) => {
      const value = event.target.value;
      if (value === 'auto') delete state.overrides[layer];
      else state.overrides[layer] = value;
      render();
    });
    host.append(card);
  }
}

function renderWeights(weights, counts) {
  const host = el('weights');
  host.innerHTML = '';
  const entries = Object.entries(weights)
    .filter(([style]) => style !== 'none')
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    host.innerHTML = '<p class="hint">Base track only (no music style on the board).</p>';
    return;
  }
  for (const [style, weight] of entries) {
    const bar = document.createElement('div');
    bar.className = 'weight-bar';
    bar.innerHTML = `
      <span class="weight-label style-${style}">${STYLE_LABEL[style]}</span>
      <span class="weight-meter"><i style="width:${Math.min(weight * 18, 100)}%"></i></span>
      <span class="weight-value">${weight}</span>
      <span class="weight-layers">${STYLE_LAYERS[style].join(' + ')}</span>`;
    host.append(bar);
  }
}

function renderTraits(counts, tiers) {
  const host = el('traitList');
  host.innerHTML = '';
  const music = Object.entries(counts)
    .filter(([trait]) => TRAIT_TO_STYLE[trait])
    .sort((a, b) => b[1] - a[1]);
  const other = Object.entries(counts)
    .filter(([trait]) => !TRAIT_TO_STYLE[trait])
    .sort((a, b) => b[1] - a[1]);
  const makeRow = (trait, count) => {
    const tier = tiers[trait] || { active: 0 };
    const thresholds = state.rules.traitThresholds?.[trait] || [];
    const row = document.createElement('div');
    row.className = 'trait-row';
    const next = thresholds.find((threshold) => threshold > count);
    row.innerHTML = `
      <span class="trait-name">${trait}</span>
      <span class="trait-count">${count}${next ? ` / ${next}` : ''}</span>
      <span class="trait-tier">${tier.active ? tierName(tier.active) : '-'}</span>`;
    return row;
  };
  for (const [trait, count] of music) host.append(makeRow(trait, count));
  if (other.length) {
    const divider = document.createElement('p');
    divider.className = 'hint';
    divider.textContent = 'non-music traits';
    host.append(divider);
    for (const [trait, count] of other) host.append(makeRow(trait, count));
  }
}

function renderSliders() {
  const host = el('sliders');
  if (host.childElementCount) return;
  const rows = [...LAYERS.map((layer) => ({ key: layer, label: layer })), { key: 'master', label: 'master' }];
  for (const { key, label } of rows) {
    const wrap = document.createElement('label');
    wrap.className = 'slider';
    wrap.innerHTML = `<span>${label}</span><input type="range" min="0" max="1" step="0.01" value="${key === 'master' ? mixer.master : 1}" />`;
    wrap.querySelector('input').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (key === 'master') mixer.setMaster(value);
      else mixer.setLayerGain(key, value);
    });
    host.append(wrap);
  }
}

function render() {
  const units = boardUnits();
  const counts = traitCounts(units);
  const tiers = traitTiers(counts);
  const { assignment, weights } = assignLayers(units, {
    traitTiers: tiers,
    priority: state.rules.priority,
    spotlightAlwaysOccupies: state.rules.specialRules?.classicalAlwaysOccupiesALayer !== false,
  });
  for (const [layer, style] of Object.entries(state.overrides)) {
    if (STYLE_LAYERS[style]?.includes(layer)) {
      assignment[layer] = { style, weight: weights[style] || 0, manual: true };
    }
  }
  state.assignment = assignment;
  state.weights = weights;
  renderRoster();
  renderBoard(units);
  renderLayers(assignment);
  renderWeights(weights, styleCounts(units));
  renderTraits(counts, tiers);
  if (mixer.playing) mixer.apply(assignment);
}

function setStatus(text) {
  el('status').textContent = text;
}

async function wireTransport() {
  el('play').addEventListener('click', async () => {
    try {
      await mixer.start(state.assignment, el('era').value);
      setStatus(`playing ${el('era').value} stems`);
    } catch (error) {
      setStatus(`playback failed: ${error.message}`);
    }
  });
  el('stop').addEventListener('click', () => {
    mixer.stop();
    setStatus('stopped');
  });
  el('era').addEventListener('change', async () => {
    if (!mixer.playing) return;
    mixer.stop();
    await mixer.start(state.assignment, el('era').value);
    setStatus(`playing ${el('era').value} stems`);
  });
  el('clearBoard').addEventListener('click', () => {
    state.roster.clear();
    render();
  });
}

async function main() {
  await loadData();
  renderSliders();
  await wireTransport();
  render();
}

main();
