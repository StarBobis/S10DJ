<script setup lang="ts">
import { computed } from 'vue';
import ArtImage from './ArtImage.vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n } from '../i18n';
import type { Unit } from '../core/types';
import { addToBoard, previewUnit, removeFromBoard, useDesk } from '../stores/desk';

const props = defineProps<{ unit: Unit }>();
const state = useDesk();
const { championName, language } = useI18n();

const entry = computed(
  () => state.board.find((item) => item.apiName === props.unit.apiName) ?? null,
);

function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', `shop:${props.unit.apiName}`);
}
</script>

<template>
  <button
    class="pool-card"
    :class="{ owned: Boolean(entry) }"
    draggable="true"
    :title="`${championName(unit)} - ${unit.cost}g`"
    @click="addToBoard(unit.apiName)"
    @contextmenu.prevent="removeFromBoard(unit.apiName)"
    @mouseenter="previewUnit(unit.apiName)"
    @focus="previewUnit(unit.apiName)"
    @dragstart="onDragStart"
  >
    <span class="pool-banner">
      <ArtImage class="pool-banner-art" :art="unit.art" :alt="championName(unit)" />
      <span class="pool-banner-shade" />
      <span class="pool-cost" :style="{ '--cost': `var(--cost-${unit.cost})` }">{{ unit.cost }}</span>
      <span v-if="entry" class="pool-star">{{ '\u2605'.repeat(entry.star) }}</span>
      <span class="pool-name">{{ championName(unit) }}</span>
    </span>
    <span class="pool-meta">
      <StyleBadge :style="unit.style" small />
      <span v-if="language === 'zh-CN'" class="pool-en">{{ unit.name }}</span>
    </span>
  </button>
</template>
