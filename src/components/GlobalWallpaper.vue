<script setup lang="ts">
import { computed } from 'vue';
import { boardStage, heroWallpaper } from '../core/art';
import { unitByApi, useDesk } from '../stores/desk';

const state = useDesk();
const unit = computed(() => unitByApi(state.selected));
const art = computed(() => (unit.value ? heroWallpaper(unit.value.art) : null));
const stage = boardStage();
</script>

<template>
  <div class="global-wallpaper" aria-hidden="true">
    <div class="wall-base" :style="stage ? { backgroundImage: `url(${stage})` } : undefined" />
    <Transition name="wall">
      <div
        v-if="art"
        :key="art"
        class="wall-layer"
        :style="{ backgroundImage: `url(${art})` }"
      />
    </Transition>
    <div class="wall-veil" />
    <div class="wall-grid" />
  </div>
</template>
