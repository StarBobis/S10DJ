<script setup lang="ts">
import { useI18n } from '../i18n';

withDefaults(defineProps<{ view: 'board' | 'mixer' | 'traits' | 'settings' }>(), {});
const emit = defineEmits<{ (event: 'navigate', view: 'board' | 'mixer' | 'traits' | 'settings'): void }>();
const { t } = useI18n();

const items = [
  { id: 'board', key: 'nav.board', glyph: '\u25a6' },
  { id: 'mixer', key: 'nav.mixer', glyph: '\u2261' },
  { id: 'traits', key: 'nav.traits', glyph: '\u25c8' },
  { id: 'settings', key: 'nav.settings', glyph: '\u2699' },
] as const;
</script>

<template>
  <nav class="sidebar">
    <button
      v-for="item in items"
      :key="item.id"
      class="nav-item"
      :class="{ active: view === item.id }"
      :title="t(item.key)"
      @click="emit('navigate', item.id)"
    >
      <span class="glyph">{{ item.glyph }}</span>
      <span class="label">{{ t(item.key) }}</span>
    </button>
  </nav>
</template>
