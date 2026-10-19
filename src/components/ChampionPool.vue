<script setup lang="ts">
import { computed, ref } from 'vue';
import PoolCard from './PoolCard.vue';
import { useI18n } from '../i18n';
import { styleColor } from '../core/rules';
import type { Unit } from '../core/types';
import {
  artCount,
  boardCount,
  boardLimit,
  previewUnit,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t, traitName } = useI18n();

const query = ref('');
const cost = ref(0);
const groupMode = ref<'cost' | 'trait'>('cost');
const traitFilter = ref('');
const manualMode = computed(() => state.settings.mixMode === 'manual');

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return state.units.filter((unit) => {
    if (cost.value && unit.cost !== cost.value) return false;
    if (!needle) return true;
    const haystack = `${unit.name} ${unit.nameZh ?? ''} ${unit.traits.join(' ')} ${unit.style}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const groupCounts = computed(() => {
  const counts = new Map<number, number>();
  for (const unit of state.units) counts.set(unit.cost, (counts.get(unit.cost) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
});

const costGroups = computed(() => {
  const groups = new Map<number, Unit[]>();
  for (const unit of filtered.value) {
    const list = groups.get(unit.cost) ?? [];
    list.push(unit);
    groups.set(unit.cost, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
});

const traitGroups = computed(() => {
  const groups = new Map<string, Unit[]>();
  for (const unit of filtered.value) {
    for (const trait of unit.traits) {
      const list = groups.get(trait) ?? [];
      list.push(unit);
      groups.set(trait, list);
    }
  }
  return [...groups.entries()]
    .map(([trait, units]) => {
      const style = state.rules?.traitDisplayStyle?.[trait] ?? null;
      return {
        trait,
        units,
        style,
        color: styleColor(style ?? 'none'),
      };
    })
    .sort((a, b) => {
      if (Boolean(a.style) !== Boolean(b.style)) return a.style ? -1 : 1;
      return b.units.length - a.units.length || traitName(a.trait).localeCompare(traitName(b.trait));
    });
});

const traitOptions = computed(() =>
  [...traitGroups.value].sort((a, b) =>
    traitName(a.trait).localeCompare(traitName(b.trait)),
  ),
);

const visibleTraitGroups = computed(() =>
  traitFilter.value
    ? traitGroups.value.filter((group) => group.trait === traitFilter.value)
    : traitGroups.value,
);
</script>

<template>
  <section class="panel pool-panel">
    <header class="panel-head">
      <div>
        <h2>{{ t('desk.pool') }}</h2>
        <p class="panel-sub">{{ t('desk.poolHint') }}</p>
      </div>
      <span class="pool-count">{{ filtered.length }}/{{ state.units.length }}</span>
    </header>

    <p v-if="manualMode" class="pool-mode-note">{{ t('lab.poolIgnored') }}</p>

    <label class="search-field">
      <span aria-hidden="true">&#8981;</span>
      <input v-model="query" type="search" :placeholder="t('desk.search')" spellcheck="false" />
    </label>

    <div class="pool-group-toggle">
      <span class="control-label">{{ t('pool.groupBy') }}</span>
      <div class="segmented">
        <button :class="{ active: groupMode === 'cost' }" @click="groupMode = 'cost'">
          {{ t('pool.cost') }}
        </button>
        <button :class="{ active: groupMode === 'trait' }" @click="groupMode = 'trait'">
          {{ t('pool.trait') }}
        </button>
      </div>
    </div>

    <div class="cost-filter">
      <button class="cost-chip" :class="{ active: cost === 0 }" @click="cost = 0">
        {{ t('desk.all') }}
      </button>
      <button
        v-for="[value, count] in groupCounts"
        :key="value"
        class="cost-chip"
        :class="[`cost-${value}`, { active: cost === value }]"
        @click="cost = value"
      >
        {{ value }}g <i>{{ count }}</i>
      </button>
    </div>

    <select v-if="groupMode === 'trait'" v-model="traitFilter" class="pool-trait-select">
      <option value="">{{ t('pool.allTraits') }}</option>
      <option v-for="group in traitOptions" :key="group.trait" :value="group.trait">
        {{ traitName(group.trait) }} ({{ group.units.length }})
      </option>
    </select>

    <div class="pool-scroll" @mouseleave="previewUnit(null)">
      <template v-if="groupMode === 'cost'">
        <section v-for="[value, units] in costGroups" :key="value" class="pool-group">
          <header class="pool-group-head">
            <span class="cost-tag" :class="`cost-${value}`">{{ value }}g</span>
            <i>{{ units.length }}</i>
          </header>
          <div class="pool-grid">
            <PoolCard v-for="unit in units" :key="unit.apiName" :unit="unit" />
          </div>
        </section>
      </template>
      <template v-else>
        <section
          v-for="group in visibleTraitGroups"
          :key="group.trait"
          class="pool-group"
          :style="{ '--trait': group.color }"
        >
          <header class="pool-group-head trait-group-head">
            <span class="trait-group-dot" />
            <b>{{ traitName(group.trait) }}</b>
            <em v-if="group.style">{{ t('desk.mix') }}</em>
            <i>{{ group.units.length }}</i>
          </header>
          <div class="pool-grid">
            <PoolCard v-for="unit in group.units" :key="`${group.trait}:${unit.apiName}`" :unit="unit" />
          </div>
        </section>
      </template>
      <p v-if="!filtered.length" class="hint">{{ t('desk.noResults') }}</p>
      <p v-else-if="groupMode === 'trait' && !visibleTraitGroups.length" class="hint">
        {{ t('desk.noResults') }}
      </p>
    </div>

    <footer class="pool-footer">
      <span>{{ t('desk.boardCount', { count: boardCount, limit: boardLimit }) }}</span>
      <span>{{ t('desk.art', { count: artCount }) }}</span>
    </footer>
  </section>
</template>
