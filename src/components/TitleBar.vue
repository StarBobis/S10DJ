<script setup lang="ts">
import { computed } from 'vue';
import { inTauri } from '../core/data';
import { useI18n } from '../i18n';

const { t } = useI18n();
const isTauri = computed(() => inTauri());

async function windowAction(action: 'minimize' | 'maximize' | 'close') {
  if (!isTauri.value) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  if (action === 'minimize') await win.minimize();
  else if (action === 'maximize') await win.toggleMaximize();
  else await win.close();
}
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <span class="brand-mark" data-tauri-drag-region>S10</span>
    <div class="title-block" data-tauri-drag-region>
      <span class="app-title" data-tauri-drag-region>{{ t('app.title') }}</span>
      <span class="app-subtitle" data-tauri-drag-region>{{ t('app.subtitle') }}</span>
    </div>
    <div class="titlebar-spacer" data-tauri-drag-region />
    <div v-if="isTauri" class="window-controls">
      <button class="window-button" @click="windowAction('minimize')">&#9472;</button>
      <button class="window-button" @click="windowAction('maximize')">&#9723;</button>
      <button class="window-button close" @click="windowAction('close')">&#10005;</button>
    </div>
  </header>
</template>
