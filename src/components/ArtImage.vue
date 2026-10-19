<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { heroBanner, heroWallpaper } from '../core/art';

const props = withDefaults(
  defineProps<{
    art: string;
    alt?: string;
    eager?: boolean;
    /** Banner is the TFT UI asset; wallpaper is only for the global backdrop. */
    kind?: 'banner' | 'wallpaper';
  }>(),
  { kind: 'banner', eager: false },
);

const failed = ref(false);
const url = computed(() =>
  props.kind === 'wallpaper' ? heroWallpaper(props.art) : heroBanner(props.art),
);
const initials = computed(() => props.art.slice(0, 2).toUpperCase());

watch(url, () => {
  failed.value = false;
});
</script>

<template>
  <img
    v-if="url && !failed"
    :src="url"
    :alt="alt ?? art"
    :loading="eager ? 'eager' : 'lazy'"
    draggable="false"
    @error="failed = true"
  />
  <span v-else class="art-fallback" aria-hidden="true">{{ initials }}</span>
</template>
