<script setup lang="ts">
import { computed, ref } from 'vue';
import ArtImage from './ArtImage.vue';
import LingerHalo from './LingerHalo.vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n } from '../i18n';
import type { Unit } from '../core/types';
import { addToBoard, previewUnit, removeFromBoard, useDesk } from '../stores/desk';

const props = defineProps<{ unit: Unit }>();
const state = useDesk();
const { championName, language } = useI18n();

/** Units on the board keep the halo; the rest light up under the cursor. */
const hovered = ref(false);

const entry = computed(
  () => state.board.find((item) => item.apiName === props.unit.apiName) ?? null,
);

function onEnter() {
  hovered.value = true;
  previewUnit(props.unit.apiName);
}

function onLeave() {
  hovered.value = false;
}

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
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focus="onEnter"
    @blur="onLeave"
    @dragstart="onDragStart"
  >
    <span class="pool-banner">
      <LingerHalo v-if="entry || hovered" />
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
