<script setup lang="ts">
import { computed } from 'vue';
import ArtImage from './ArtImage.vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n } from '../i18n';
import { heroArt } from '../core/art';
import { STYLE_LABEL, styleColor } from '../core/rules';
import {
  focusBoardUnit,
  focusUnit,
  removeFromBoard,
  upgradeBoardUnit,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const unit = computed(() => focusUnit.value);
const entry = computed(() => focusBoardUnit.value);
const backdrop = computed(() => (unit.value ? heroArt(unit.value.art) : null));
const accent = computed(() => styleColor(unit.value?.style ?? 'none'));

const chips = computed(() => {
  const styles = state.rules?.traitDisplayStyle ?? {};
  return (unit.value?.traits ?? []).map((trait) => {
    const style = styles[trait] ?? null;
    return { trait, style, color: styleColor(style ?? 'none') };
  });
});

function upgrade() {
  if (entry.value) upgradeBoardUnit(entry.value.apiName);
}

function remove() {
  if (entry.value) removeFromBoard(entry.value.apiName);
}
</script>

<template>
  <section class="panel spotlight" :style="{ '--style': accent }">
    <template v-if="unit">
      <div
        v-if="backdrop"
        class="spot-backdrop"
        :style="{ backgroundImage: `url(${backdrop})` }"
        aria-hidden="true"
      />
      <div class="spot-veil" aria-hidden="true" />
      <div class="spot-content">
        <header class="spot-head">
          <span class="spot-art-wrap">
            <ArtImage class="spot-art" :art="unit.art" :alt="unit.name" eager />
          </span>
          <span class="spot-title">
            <span class="spot-cost" :style="{ '--cost': `var(--cost-${unit.cost})` }">{{ unit.cost }}g</span>
            <h2>{{ unit.name }}</h2>
            <StyleBadge :style="unit.style" label />
          </span>
          <span v-if="entry" class="spot-stars">{{ '\u2605'.repeat(entry.star) }}</span>
        </header>

        <div class="spot-traits">
          <span
            v-for="chip in chips"
            :key="chip.trait"
            class="trait-chip"
            :class="{ music: Boolean(chip.style) }"
            :style="{ '--chip': chip.color }"
            :title="chip.style ? STYLE_LABEL[chip.style] : chip.trait"
          >
            {{ chip.trait }}
          </span>
        </div>

        <footer class="spot-actions">
          <template v-if="entry">
            <span class="spot-onboard">{{ t('desk.onBoard') }}</span>
            <button class="ghost small" @click="upgrade">{{ t('desk.upgrade') }}</button>
            <button class="ghost small danger" @click="remove">{{ t('desk.remove') }}</button>
          </template>
          <p v-else class="spot-hint">{{ t('desk.poolHint') }}</p>
        </footer>
      </div>
    </template>

    <div v-else class="spot-empty">
      <span class="spot-empty-glyph" aria-hidden="true">&#9835;</span>
      <h3>{{ t('desk.focusEmpty') }}</h3>
      <p>{{ t('desk.focusEmptyHint') }}</p>
    </div>
  </section>
</template>
