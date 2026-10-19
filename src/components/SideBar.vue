<script setup lang="ts">
import { useI18n } from '../i18n';
import { toggleSidebar, useDesk } from '../stores/desk';

defineProps<{ view: 'desk' | 'settings' }>();
const emit = defineEmits<{ (event: 'navigate', view: 'desk' | 'settings'): void }>();
const { t } = useI18n();
const state = useDesk();
</script>

<template>
  <nav class="sidebar">
    <button
      class="nav-item"
      :class="{ active: view === 'desk' }"
      :title="t('nav.desk')"
      @click="emit('navigate', 'desk')"
    >
      <span class="glyph">&#9638;</span>
      <span class="label">{{ t('nav.desk') }}</span>
    </button>

    <span class="sidebar-spacer" />

    <button
      class="nav-item collapse-item"
      :title="state.settings.sidebarCollapsed ? t('nav.expand') : t('nav.collapse')"
      @click="toggleSidebar()"
    >
      <span class="glyph">&#9776;</span>
      <span class="label">
        {{ state.settings.sidebarCollapsed ? t('nav.expand') : t('nav.collapse') }}
      </span>
    </button>

    <button
      class="nav-item settings-item"
      :class="{ active: view === 'settings' }"
      :title="t('nav.settings')"
      @click="emit('navigate', 'settings')"
    >
      <span class="glyph">&#9881;</span>
      <span class="label">{{ t('nav.settings') }}</span>
    </button>
  </nav>
</template>
