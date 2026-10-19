<script setup lang="ts">
import { useI18n } from '../i18n';

defineProps<{ view: 'desk' | 'settings' }>();
const emit = defineEmits<{ (event: 'navigate', view: 'desk' | 'settings'): void }>();
const { t } = useI18n();

const items = [
  { id: 'desk', key: 'nav.desk', glyph: '\u25a6' },
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
