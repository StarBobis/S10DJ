<script setup lang="ts">
import { computed } from 'vue';
import { useI18n, type MessageKey } from '../i18n';
import { styleColor, styleGlyph } from '../core/rules';
import { LAYERS, type Layer } from '../core/types';
import { boardCount, musicTraitRows, otherTraitRows, useDesk } from '../stores/desk';

const state = useDesk();
const { t, traitName, styleName, championName } = useI18n();

const LAYER_LABEL: Record<Layer, MessageKey> = {
  drums: 'layer.drums',
  chords: 'layer.chords',
  top: 'layer.top',
};

const TIER_LABEL: MessageKey[] = [
  'desk.tier.off',
  'desk.tier.bronze',
  'desk.tier.silver',
  'desk.tier.gold',
  'desk.tier.prismatic',
];

const plan = computed(() =>
  LAYERS.map((layer) => {
    const style = state.plan[layer]?.style ?? 'none';
    return {
      layer,
      style,
      label: styleName(style),
      color: styleColor(style),
      weight: state.plan[layer]?.weight ?? 0,
    };
  }),
);

const manualMode = computed(() => state.settings.mixMode === 'manual');
const badgeCount = computed(() => (manualMode.value ? LAYERS.length : boardCount.value));

function tierLabel(tier: number): string {
  return t(TIER_LABEL[Math.min(Math.max(tier, 0), TIER_LABEL.length - 1)]);
}
</script>

<template>
  <section class="panel traits-panel">
    <header class="panel-head">
      <div>
        <h2>{{ t('desk.traits') }}</h2>
        <p class="panel-sub">{{ t('desk.traitsHint') }}</p>
      </div>
      <span class="traits-count">{{ badgeCount }}</span>
    </header>

    <div class="plan-mini">
      <span
        v-for="item in plan"
        :key="item.layer"
        class="plan-mini-item"
        :style="{ '--style': item.color }"
        :title="`Set_Switch_set10_${item.style}_${item.layer}`"
      >
        <i />
        <em>{{ t(LAYER_LABEL[item.layer]) }}</em>
        <b>{{ item.label }}</b>
        <u>{{ item.weight }}</u>
      </span>
    </div>

    <div v-if="musicTraitRows.length" class="trait-list">
      <article
        v-for="row in musicTraitRows"
        :key="row.trait"
        class="trait-row"
        :style="{ '--trait': row.color }"
        :title="row.units.map((unit) => championName(unit)).join(', ')"
      >
        <div class="trait-head">
          <span class="trait-emblem" aria-hidden="true">{{ styleGlyph(row.style ?? 'none') }}</span>
          <span class="trait-name">{{ traitName(row.trait) }}</span>
          <span class="trait-tier" :class="`tier-${row.tier}`">{{ tierLabel(row.tier) }}</span>
          <span class="trait-count">
            {{ row.count }}<template v-if="row.next">/{{ row.next }}</template>
          </span>
        </div>
        <div class="trait-meter">
          <span :style="{ width: `${Math.round(row.ratio * 100)}%` }" />
        </div>
        <div class="trait-sub">
          <span>{{ styleName(row.style ?? 'none') }}</span>
          <span v-if="row.next">{{ t('desk.next', { count: (row.next ?? 0) - row.count }) }}</span>
          <span v-else>{{ t('desk.weight') }} {{ state.weights[row.style ?? 'none'] ?? 0 }}</span>
        </div>
      </article>
    </div>
    <p v-else class="hint">{{ manualMode ? t('lab.noChampions') : t('desk.noTraits') }}</p>

    <template v-if="otherTraitRows.length">
      <h3>{{ t('desk.otherTraits') }}</h3>
      <div class="other-traits">
        <span v-for="row in otherTraitRows" :key="row.trait" class="other-trait">
          <i>{{ row.count }}</i>{{ traitName(row.trait) }}
        </span>
      </div>
    </template>
  </section>
</template>
