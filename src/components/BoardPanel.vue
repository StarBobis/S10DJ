<script setup lang="ts">
import { useI18n } from '../i18n';
import { STYLE_LABEL } from '../core/rules';
import { addUnit, boardUnits, clearBoard, unitsByCost, useDesk } from '../stores/desk';

const state = useDesk();
const { t } = useI18n();
const board = boardUnits;

function copies(apiName: string): number {
  return state.roster[apiName] ?? 0;
}

function onContext(event: MouseEvent, apiName: string) {
  event.preventDefault();
  addUnit(apiName, -1);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>{{ t('board.title') }}</h2>
      <button class="ghost" @click="clearBoard()">{{ t('board.clear') }}</button>
    </div>
    <p class="hint">{{ t('board.hint') }}</p>

    <div class="cost-rows">
      <div v-for="[cost, units] in unitsByCost" :key="cost" class="cost-row">
        <span class="cost-tag" :class="`cost-${cost}`">{{ cost }}g</span>
        <button
          v-for="unit in units"
          :key="unit.apiName"
          class="unit"
          :class="{ on: copies(unit.apiName) > 0 }"
          @click="addUnit(unit.apiName, 1)"
          @contextmenu="onContext($event, unit.apiName)"
        >
          <span class="unit-name">{{ unit.name }}</span>
          <span class="unit-style">{{ STYLE_LABEL[unit.style] ?? unit.style }}</span>
          <span v-if="copies(unit.apiName)" class="unit-copies">x{{ copies(unit.apiName) }}</span>
        </button>
      </div>
    </div>

    <h3>{{ t('board.boardUnits') }}</h3>
    <div v-if="board.length" class="board-units">
      <span v-for="unit in board" :key="unit.apiName" class="chip">{{ unit.name }}</span>
    </div>
    <p v-else class="hint">{{ t('board.empty') }}</p>
  </section>
</template>
