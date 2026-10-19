<script setup lang="ts">
/**
 * The League client's new-item halo: the loop-able clip the client plays behind
 * the artwork of a freshly acquired item. The clip is opaque (black around the
 * energy ring), so it has to sit behind the portrait exactly like the client
 * does - the art covers the black and only the ring shows around it.
 */
import { lingerGlow } from '../core/art';

const url = lingerGlow();
</script>

<template>
  <video
    v-if="url"
    class="linger-glow"
    :src="url"
    autoplay
    loop
    muted
    playsinline
    preload="auto"
    aria-hidden="true"
  />
</template>
