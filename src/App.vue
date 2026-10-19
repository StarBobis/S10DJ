<script setup lang="ts">
import { onMounted, ref } from 'vue';
import SideBar from './components/SideBar.vue';
import TitleBar from './components/TitleBar.vue';
import DeskView from './components/DeskView.vue';
import SettingsPage from './components/SettingsPage.vue';
import { initDesk, useDesk, clearError } from './stores/desk';
import { useI18n } from './i18n';

const state = useDesk();
const { t } = useI18n();
const view = ref<'desk' | 'settings'>('desk');

onMounted(() => {
  void initDesk();
});
</script>

<template>
  <div class="app-shell" :class="{ collapsed: state.settings.sidebarCollapsed }">
    <TitleBar />
    <div class="app-body">
      <SideBar :view="view" @navigate="view = $event" />
      <main class="content" :class="{ 'settings-view': view === 'settings' }">
        <p v-if="state.error" class="banner error">
          <strong>{{ t('app.error') }}</strong>
          <span>{{ state.error }}</span>
          <button v-if="state.ready" class="banner-close" :title="t('app.dismiss')" @click="clearError()">&#10005;</button>
        </p>
        <p v-else-if="!state.ready" class="banner loading">{{ t('app.loading') }}</p>

        <DeskView v-if="state.ready && view === 'desk'" />
        <SettingsPage v-else-if="state.ready && view === 'settings'" />
      </main>
    </div>
  </div>
</template>
