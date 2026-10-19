<script setup lang="ts">
import { computed, ref } from 'vue';
import ArtImage from './ArtImage.vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n } from '../i18n';
import { type BoardUnit, type Unit } from '../core/types';
import {
  addToBoard,
  artCount,
  boardCount,
  boardLimit,
  previewUnit,
  removeFromBoard,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const query = ref('');
const cost = ref(0);

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return state.units.filter((unit) => {
    if (cost.value && unit.cost !== cost.value) return false;
    if (!needle) return true;
    const haystack = `${unit.name} ${unit.traits.join(' ')} ${unit.style}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const groupCounts = computed(() => {
  const counts = new Map<number, number>();
  for (const unit of state.units) counts.set(unit.cost, (counts.get(unit.cost) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
});

function entryFor(apiName: string): BoardUnit | null {
  return state.board.find((entry) => entry.apiName === apiName) ?? null;
}

function onDragStart(event: DragEvent, unit: Unit) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', `shop:${unit.apiName}`);
}
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

    <label class="search-field">
      <span aria-hidden="true">&#8981;</span>
      <input v-model="query" type="search" :placeholder="t('desk.search')" spellcheck="false" />
    </label>

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

    <div class="pool-scroll" @mouseleave="previewUnit(null)">
      <div v-if="filtered.length" class="pool-grid">
        <button
          v-for="unit in filtered"
          :key="unit.apiName"
          class="pool-card"
          :class="{ owned: Boolean(entryFor(unit.apiName)) }"
          draggable="true"
          :title="`${unit.name} - ${unit.cost}g`"
          @click="addToBoard(unit.apiName)"
          @contextmenu.prevent="removeFromBoard(unit.apiName)"
          @mouseenter="previewUnit(unit.apiName)"
          @focus="previewUnit(unit.apiName)"
          @dragstart="onDragStart($event, unit)"
        >
          <span class="pool-art-wrap" :style="{ '--cost': `var(--cost-${unit.cost})` }">
            <ArtImage class="pool-art" :art="unit.art" :alt="unit.name" />
          </span>
          <span class="pool-info">
            <span class="pool-name">{{ unit.name }}</span>
            <span class="pool-meta">
              <span class="cost-pip" :style="{ '--cost': `var(--cost-${unit.cost})` }">{{ unit.cost }}</span>
              <StyleBadge :style="unit.style" small />
            </span>
          </span>
          <span v-if="entryFor(unit.apiName)" class="pool-star">
            {{ '\u2605'.repeat(entryFor(unit.apiName)?.star ?? 1) }}
          </span>
        </button>
      </div>
      <p v-else class="hint">{{ t('desk.noResults') }}</p>
    </div>

    <footer class="pool-footer">
      <span>{{ t('desk.boardCount', { count: boardCount, limit: boardLimit }) }}</span>
      <span>{{ t('desk.art', { count: artCount }) }}</span>
    </footer>
  </section>
</template>
