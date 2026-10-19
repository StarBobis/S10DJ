<script setup lang="ts">
import { computed, ref } from 'vue';
import ArtImage from './ArtImage.vue';
import { useI18n } from '../i18n';
import { boardStage } from '../core/art';
import { STYLE_LABEL, styleColor } from '../core/rules';
import { BOARD_COLUMNS, BOARD_ROWS, type BoardUnit, type Unit } from '../core/types';
import {
  addToBoard,
  boardCount,
  boardLimit,
  clearBoard,
  moveBoardUnit,
  previewUnit,
  removeFromBoard,
  selectUnit,
  slots,
  unitByApi,
  upgradeBoardUnit,
  useDesk,
} from '../stores/desk';

interface Cell {
  slot: number;
  entry: BoardUnit | null;
  unit: Unit | null;
}

const state = useDesk();
const { t } = useI18n();

const stage = boardStage();
const dragging = ref<number | null>(null);

const rows = computed<Cell[][]>(() => {
  const list: Cell[] = slots.value.map((entry, slot) => ({
    slot,
    entry,
    unit: entry ? unitByApi(entry.apiName) : null,
  }));
  const grid: Cell[][] = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    grid.push(list.slice(row * BOARD_COLUMNS, (row + 1) * BOARD_COLUMNS));
  }
  return grid;
});

function cellStyle(cell: Cell): Record<string, string> {
  return {
    '--cost': `var(--cost-${cell.unit?.cost ?? 1})`,
    '--style': styleColor(cell.unit?.style ?? 'none'),
  };
}

function onDragStart(event: DragEvent, cell: Cell) {
  if (!event.dataTransfer || !cell.entry) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `board:${cell.entry.apiName}`);
}

function onDrop(event: DragEvent, slot: number) {
  event.preventDefault();
  dragging.value = null;
  const raw = event.dataTransfer?.getData('text/plain') ?? '';
  const [kind, apiName] = raw.split(':');
  if (!apiName) return;
  if (kind === 'shop') addToBoard(apiName, slot);
  else if (kind === 'board') moveBoardUnit(apiName, slot);
}

function upgrade(cell: Cell) {
  if (cell.entry) upgradeBoardUnit(cell.entry.apiName);
}

function remove(cell: Cell) {
  if (cell.entry) removeFromBoard(cell.entry.apiName);
}
</script>

<template>
  <section class="panel board-panel">
    <header class="panel-head">
      <div>
        <h2>{{ t('desk.board') }}</h2>
        <p class="panel-sub">{{ t('desk.boardHint') }}</p>
      </div>
      <div class="board-tools">
        <span class="board-count">{{ t('desk.boardCount', { count: boardCount, limit: boardLimit }) }}</span>
        <button class="ghost small" :disabled="!boardCount" @click="clearBoard()">{{ t('desk.clear') }}</button>
      </div>
    </header>

    <div
      class="board-stage"
      :style="stage ? { backgroundImage: `url(${stage})` } : undefined"
      @mouseleave="previewUnit(null)"
    >
      <div class="stage-haze" />
      <div class="hex-board">
        <div
          v-for="(row, rowIndex) in rows"
          :key="rowIndex"
          class="hex-row"
          :class="{ offset: rowIndex % 2 === 1 }"
        >
          <div
            v-for="cell in row"
            :key="cell.slot"
            class="hex-slot"
            :class="{
              filled: Boolean(cell.entry),
              selected: Boolean(cell.entry && state.selected === cell.entry.apiName),
              hovered: dragging === cell.slot,
            }"
            :style="cellStyle(cell)"
            @click="selectUnit(cell.entry?.apiName ?? null)"
            @dblclick="upgrade(cell)"
            @contextmenu.prevent="remove(cell)"
            @mouseenter="cell.entry && previewUnit(cell.entry.apiName)"
            @dragover.prevent="dragging = cell.slot"
            @dragleave="dragging = null"
            @drop="onDrop($event, cell.slot)"
          >
            <div
              class="hex-fill"
              :draggable="Boolean(cell.entry)"
              @dragstart="onDragStart($event, cell)"
            >
              <template v-if="cell.entry && cell.unit">
                <ArtImage class="hex-art" :art="cell.unit.art" :alt="cell.unit.name" />
                <span class="hex-shade" />
                <span class="hex-cost">{{ cell.unit.cost }}</span>
                <span class="hex-stars">{{ '\u2605'.repeat(cell.entry.star) }}</span>
                <span class="hex-label">
                  <b>{{ cell.unit.name }}</b>
                  <em>{{ STYLE_LABEL[cell.unit.style] ?? cell.unit.style }}</em>
                </span>
              </template>
              <span v-else class="hex-plus" aria-hidden="true">+</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
