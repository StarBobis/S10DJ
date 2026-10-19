<script setup lang="ts">
import { computed } from 'vue';
import { STYLE_LABEL, styleColor, styleGlyph } from '../core/rules';

const props = withDefaults(
  defineProps<{
    style: string;
    label?: boolean;
    small?: boolean;
  }>(),
  { label: false, small: false },
);

const accent = computed(() => styleColor(props.style));
const glyph = computed(() => styleGlyph(props.style));
const name = computed(() => STYLE_LABEL[props.style] ?? props.style);
</script>

<template>
  <span
    class="style-badge"
    :class="{ 'with-label': label, small }"
    :style="{ '--style': accent }"
    :title="name"
  >
    <span class="style-glyph" aria-hidden="true">{{ glyph }}</span>
    <span v-if="label" class="style-name">{{ name }}</span>
  </span>
</template>
