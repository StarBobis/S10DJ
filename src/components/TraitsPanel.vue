<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';
import { tierName } from '../core/rules';
import { traitRow, useDesk } from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const musicTraits = computed(() =>
  Object.keys(state.traits)
    .filter((trait) => Boolean(state.rules?.traitToStyle?.[trait]))
    .sort((a, b) => (state.traits[b] ?? 0) - (state.traits[a] ?? 0)),
);

const otherTraits = computed(() =>
  Object.keys(state.traits)
    .filter((trait) => !state.rules?.traitToStyle?.[trait])
    .sort((a, b) => (state.traits[b] ?? 0) - (state.traits[a] ?? 0)),
);
</script>

<template>
  <section class="panel">
    <h2>{{ t('traits.title') }}</h2>
    <div v-if="musicTraits.length" class="trait-list">
      <div v-for="trait in musicTraits" :key="trait" class="trait-row">
        <span class="trait-name">{{ trait }}</span>
        <span class="trait-count">{{ traitRow(trait).count }}<template v-if="traitRow(trait).next"> / {{ traitRow(trait).next }}</template></span>
        <span class="trait-tier">{{ traitRow(trait).tier ? tierName(traitRow(trait).tier) : '-' }}</span>
      </div>
    </div>
    <p v-else class="hint">{{ t('traits.empty') }}</p>

    <template v-if="otherTraits.length">
      <h3>{{ t('traits.other') }}</h3>
      <div class="trait-list muted">
        <div v-for="trait in otherTraits" :key="trait" class="trait-row">
          <span class="trait-name">{{ trait }}</span>
          <span class="trait-count">{{ traitRow(trait).count }}</span>
          <span class="trait-tier">-</span>
        </div>
      </div>
    </template>
  </section>
</template>
