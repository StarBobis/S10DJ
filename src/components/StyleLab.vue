<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n, type MessageKey } from '../i18n';
import { styleColor, styleFrequency, styleGlyph } from '../core/rules';
import { comboLabel } from '../core/combos';
import { LAYERS, type Layer } from '../core/types';
import {
  applyCombo,
  clearManualStyles,
  setMixMode,
  setOverride,
  styleCombos,
  useDesk,
} from '../stores/desk';
import {
  comboScore,
  comboLikes,
  isComboDisliked,
  isComboLiked,
  isStyleLiked,
  styleLikes,
  toggleComboLike,
  toggleStyleLike,
} from '../stores/likes';
import StyleBadge from './StyleBadge.vue';

const state = useDesk();
const { t, styleName } = useI18n();

const LAYER_LABEL: Record<Layer, MessageKey> = {
  drums: 'layer.drums',
  chords: 'layer.chords',
  top: 'layer.top',
};

const comboFilter = ref<'all' | 'maestro' | 'liked'>('all');

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

function comboHasMaestro(combo: { styles: string[] }): boolean {
  return combo.styles.includes('classical');
}

const rankedCombos = computed(() =>
  [...styleCombos.value]
    .map((combo) => ({
      combo,
      label: comboLabel(combo, styleName),
      score: comboScore(combo),
      maestro: comboHasMaestro(combo),
      disliked: isComboDisliked(combo.id),
    }))
    .sort((a, b) => {
      // Banned combos fall to the bottom: the radio will never play them, so
      // they should not sit on top of the recommendations either.
      if (a.disliked !== b.disliked) return a.disliked ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      if (a.maestro !== b.maestro) return a.maestro ? -1 : 1;
      return a.label.localeCompare(b.label);
    }),
);

const visibleCombos = computed(() => {
  if (comboFilter.value === 'maestro') {
    return rankedCombos.value.filter((item) => item.maestro);
  }
  if (comboFilter.value === 'liked') {
    return rankedCombos.value.filter((item) => isComboLiked(item.combo.id));
  }
  return rankedCombos.value;
});

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

    <div class="lab-section-head">
      <h3>
        {{ t('lab.combos') }}
        <span class="lab-count">{{ rankedCombos.length }}</span>
      </h3>
      <div class="lab-filters">
        <button :class="{ active: comboFilter === 'all' }" @click="comboFilter = 'all'">
          {{ t('lab.filterAll') }}
        </button>
        <button :class="{ active: comboFilter === 'maestro' }" @click="comboFilter = 'maestro'">
          {{ t('lab.filterMaestro') }}
        </button>
        <button :class="{ active: comboFilter === 'liked' }" @click="comboFilter = 'liked'">
          {{ t('lab.filterLiked') }}
        </button>
      </div>
    </div>

    <div class="lab-combos">
      <div
        v-for="item in visibleCombos"
        :key="item.combo.id"
        class="lab-combo"
        :class="{
          featured: item.maestro,
          liked: isComboLiked(item.combo.id),
          disliked: item.disliked,
        }"
        role="button"
        tabindex="0"
        :title="item.label"
        @click="applyCombo(item.combo.id)"
        @keydown.enter.prevent="applyCombo(item.combo.id)"
        @keydown.space.prevent="applyCombo(item.combo.id)"
      >
        <span class="lab-combo-main">
          <span class="lab-combo-label">
            {{ item.label }}
            <em v-if="item.maestro">{{ t('lab.maestroBadge') }}</em>
            <em v-if="item.disliked" class="disliked-badge">{{ t('lab.disliked') }}</em>
          </span>
          <span class="lab-combo-layers">
            <i
              v-for="layer in LAYERS"
              :key="layer"
              :style="{ '--style': styleColor(item.combo.layers[layer]) }"
            >
              {{ t(LAYER_LABEL[layer]) }}
            </i>
          </span>
        </span>
        <button
          class="like-button"
          :class="{ active: isComboLiked(item.combo.id) }"
          :title="isComboLiked(item.combo.id) ? t('lab.unlike') : t('lab.like')"
          @click.stop="toggleComboLike(item.combo.id)"
        >
          <span aria-hidden="true">{{ isComboLiked(item.combo.id) ? '\u2665' : '\u2661' }}</span>
          {{ comboLikes(item.combo.id) }}
        </button>
      </div>
      <p v-if="!visibleCombos.length" class="hint">{{ t('lab.noLiked') }}</p>
    </div>

    <h3>{{ t('lab.styles') }}</h3>
    <div class="lab-styles">
      <div
        v-for="style in allStyles"
        :key="style"
        class="lab-style"
        :class="{ liked: isStyleLiked(style) }"
        :style="{ '--style': styleColor(style) }"
        role="button"
        tabindex="0"
        :title="`${styleName(style)} ${styleFrequency(style)} FM`"
        @click="useStyle(style)"
        @keydown.enter.prevent="useStyle(style)"
        @keydown.space.prevent="useStyle(style)"
      >
        <span class="lab-style-glyph" aria-hidden="true">{{ styleGlyph(style) }}</span>
        <span class="lab-style-text">
          <b>{{ styleName(style) }}</b>
          <em>{{ styleFrequency(style) }} FM</em>
        </span>
        <span class="lab-style-layers">
          <i v-for="layer in styleLayers(style)" :key="layer">{{ t(LAYER_LABEL[layer]) }}</i>
        </span>
        <button
          class="like-button"
          :class="{ active: isStyleLiked(style) }"
          :title="isStyleLiked(style) ? t('lab.unlike') : t('lab.like')"
          @click.stop="toggleStyleLike(style)"
        >
          <span aria-hidden="true">{{ isStyleLiked(style) ? '\u2665' : '\u2661' }}</span>
          {{ styleLikes(style) }}
        </button>
      </div>
    </div>

    <p class="hint lab-note">{{ t('lab.noChampions') }}</p>
  </section>
</template>
