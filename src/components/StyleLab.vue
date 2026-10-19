<script setup lang="ts">
import { computed } from 'vue';
import { useI18n, type MessageKey } from '../i18n';
import { STYLE_COMBOS } from '../core/combos';
import { styleColor, styleFrequency, styleGlyph } from '../core/rules';
import { LAYERS, type Layer } from '../core/types';
import {
  applyCombo,
  clearManualStyles,
  setMixMode,
  setOverride,
  useDesk,
} from '../stores/desk';
import StyleBadge from './StyleBadge.vue';

const state = useDesk();
const { t, styleName } = useI18n();

const LAYER_LABEL: Record<Layer, MessageKey> = {
  drums: 'layer.drums',
  chords: 'layer.chords',
  top: 'layer.top',
};

const layerStyles = computed(() => {
  const map = {} as Record<Layer, string[]>;
  for (const layer of LAYERS) {
    map[layer] = Object.entries(state.rules?.styles ?? {})
      .filter(([style, info]) => style !== 'none' && info.layers.includes(layer))
      .map(([style]) => style)
      .sort((a, b) => styleName(a).localeCompare(styleName(b)));
  }
  return map;
});

const allStyles = computed(() =>
  Object.keys(state.rules?.styles ?? {})
    .filter((style) => style !== 'none')
    .sort((a, b) => styleName(a).localeCompare(styleName(b))),
);

const combos = computed(() =>
  STYLE_COMBOS.map((combo) => ({
    id: combo.id,
    layers: combo.layers,
    styles: [...new Set(Object.values(combo.layers))],
    label: [...new Set(Object.values(combo.layers))]
      .map((style) => styleName(style))
      .join(' + '),
  })),
);

const currentPlan = computed(() =>
  LAYERS.map((layer) => {
    const style = state.plan[layer]?.style ?? 'none';
    return {
      layer,
      style,
      label: styleName(style),
      color: styleColor(style),
    };
  }),
);

function currentStyle(layer: Layer): string {
  return state.settings.layers[layer].override ?? 'none';
}

function isActive(layer: Layer, style: string): boolean {
  return currentStyle(layer) === style;
}

function setLayer(layer: Layer, style: string) {
  setOverride(layer, style === 'none' ? null : style);
}

function useStyle(style: string) {
  for (const layer of LAYERS) {
    if (state.rules?.styles?.[style]?.layers.includes(layer)) setOverride(layer, style);
  }
}

function styleLayers(style: string): Layer[] {
  return state.rules?.styles?.[style]?.layers ?? [];
}
</script>

<template>
  <section class="panel style-lab">
    <header class="panel-head">
      <div>
        <h2>{{ t('lab.title') }}</h2>
        <p class="panel-sub">{{ t('lab.hint') }}</p>
      </div>
      <div class="lab-actions">
        <button class="ghost small" @click="clearManualStyles()">{{ t('lab.clear') }}</button>
        <button class="ghost small" @click="setMixMode('board')">{{ t('lab.backToBoard') }}</button>
      </div>
    </header>

    <div class="lab-current">
      <span
        v-for="item in currentPlan"
        :key="item.layer"
        class="lab-current-item"
        :style="{ '--style': item.color }"
      >
        <i />
        <em>{{ t(LAYER_LABEL[item.layer]) }}</em>
        <b>{{ item.label }}</b>
      </span>
    </div>

    <div class="lab-layers">
      <article
        v-for="(layer, index) in LAYERS"
        :key="layer"
        class="lab-layer"
        :style="{ '--style': styleColor(currentStyle(layer)) }"
      >
        <header>
          <span class="lab-index">{{ index + 1 }}</span>
          <span class="lab-layer-name">{{ t(LAYER_LABEL[layer]) }}</span>
          <StyleBadge :style="currentStyle(layer)" label />
        </header>
        <div class="lab-chips">
          <button
            class="lab-chip"
            :class="{ active: currentStyle(layer) === 'none' }"
            @click="setLayer(layer, 'none')"
          >
            {{ t('lab.none') }}
          </button>
          <button
            v-for="style in layerStyles[layer]"
            :key="style"
            class="lab-chip"
            :class="{ active: isActive(layer, style) }"
            :style="{ '--style': styleColor(style) }"
            @click="setLayer(layer, style)"
          >
            <i />
            {{ styleName(style) }}
          </button>
        </div>
      </article>
    </div>

    <h3>{{ t('lab.combos') }}</h3>
    <div class="lab-combos">
      <button
        v-for="combo in combos"
        :key="combo.id"
        class="lab-combo"
        :title="combo.label"
        @click="applyCombo(combo.id)"
      >
        <span class="lab-combo-label">{{ combo.label }}</span>
        <span class="lab-combo-layers">
          <i
            v-for="layer in LAYERS"
            :key="layer"
            :style="{ '--style': styleColor(combo.layers[layer]) }"
          >
            {{ t(LAYER_LABEL[layer]) }}
          </i>
        </span>
      </button>
    </div>

    <h3>{{ t('lab.styles') }}</h3>
    <div class="lab-styles">
      <button
        v-for="style in allStyles"
        :key="style"
        class="lab-style"
        :style="{ '--style': styleColor(style) }"
        :title="`${styleName(style)} ${styleFrequency(style)} FM`"
        @click="useStyle(style)"
      >
        <span class="lab-style-glyph" aria-hidden="true">{{ styleGlyph(style) }}</span>
        <span class="lab-style-text">
          <b>{{ styleName(style) }}</b>
          <em>{{ styleFrequency(style) }} FM</em>
        </span>
        <span class="lab-style-layers">
          <i v-for="layer in styleLayers(style)" :key="layer">{{ t(LAYER_LABEL[layer]) }}</i>
        </span>
      </button>
    </div>

    <p class="hint lab-note">{{ t('lab.noChampions') }}</p>
  </section>
</template>
