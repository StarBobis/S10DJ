<script setup lang="ts">
import { computed } from 'vue';
import ArtImage from './ArtImage.vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n } from '../i18n';
import { styleColor } from '../core/rules';
import {
  focusBoardUnit,
  focusUnit,
  removeFromBoard,
  upgradeBoardUnit,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t, championName, traitName, language } = useI18n();

const unit = computed(() => focusUnit.value);
const entry = computed(() => focusBoardUnit.value);
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
      <div class="spot-banner">
        <ArtImage class="spot-banner-art" :art="unit.art" kind="banner" :alt="championName(unit)" eager />
        <span class="spot-banner-shade" />
        <span class="spot-cost" :style="{ '--cost': `var(--cost-${unit.cost})` }">{{ unit.cost }}g</span>
        <span v-if="entry" class="spot-stars">{{ '\u2605'.repeat(entry.star) }}</span>
        <div class="spot-banner-text">
          <h2>{{ championName(unit) }}</h2>
          <span v-if="language === 'zh-CN'" class="spot-en">{{ unit.name }}</span>
          <StyleBadge :style="unit.style" label />
        </div>
      </div>

      <div class="spot-content">
        <div class="spot-traits">
          <span
            v-for="chip in chips"
            :key="chip.trait"
            class="trait-chip"
            :class="{ music: Boolean(chip.style) }"
            :style="{ '--chip': chip.color }"
            :title="traitName(chip.trait)"
          >
            {{ traitName(chip.trait) }}
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
