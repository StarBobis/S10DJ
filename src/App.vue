<script setup lang="ts">
import { onMounted, ref } from 'vue';
import SideBar from './components/SideBar.vue';
import TitleBar from './components/TitleBar.vue';
import BoardPanel from './components/BoardPanel.vue';
import MixerPanel from './components/MixerPanel.vue';
import TraitsPanel from './components/TraitsPanel.vue';
import SettingsPage from './components/SettingsPage.vue';
import { initDesk, useDesk } from './stores/desk';
import { useI18n } from './i18n';

const state = useDesk();
const { t } = useI18n();
const view = ref<'board' | 'mixer' | 'traits' | 'settings'>('mixer');

onMounted(() => {
  void initDesk();
});
</script>

<template>
  <div class="app-shell" :class="{ collapsed: state.settings.sidebarCollapsed }">
    <TitleBar />
    <div class="app-body">
      <SideBar :view="view" @navigate="view = $event" />
      <main class="content">
        <p v-if="state.error" class="banner error">{{ state.error }}</p>
        <p v-else-if="!state.ready" class="banner">{{ t('app.subtitle') }}</p>

        <MixerPanel v-if="view === 'mixer'" />
        <BoardPanel v-else-if="view === 'board'" />
        <TraitsPanel v-else-if="view === 'traits'" />
        <SettingsPage v-else />
      </main>
    </div>
  </div>
</template>
