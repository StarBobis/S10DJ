<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { heroArt } from '../core/art';

const props = defineProps<{
  art: string;
  alt?: string;
  eager?: boolean;
}>();

const failed = ref(false);
const url = computed(() => heroArt(props.art));
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
