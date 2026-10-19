<script setup lang="ts">
import { computed } from 'vue';
import ChampionPool from './ChampionPool.vue';
import BoardStage from './BoardStage.vue';
import HeroSpotlight from './HeroSpotlight.vue';
import TraitsPanel from './TraitsPanel.vue';
import MixerPanel from './MixerPanel.vue';
import StyleLab from './StyleLab.vue';
import TransportBar from './TransportBar.vue';
import { useI18n, type MessageKey } from '../i18n';
import { useDesk, type NoticeCode } from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const NOTICE_KEY: Record<Exclude<NoticeCode, ''>, MessageKey> = {
  boardFull: 'notice.boardFull',
  maxStars: 'notice.maxStars',
  notPlaying: 'notice.notPlaying',
};

const noticeText = computed(() => (state.notice ? t(NOTICE_KEY[state.notice]) : ''));
const manualMode = computed(() => state.settings.mixMode === 'manual');
</script>

<template>
  <div class="desk-view">
    <TransportBar />

    <div class="desk-grid" :class="{ manual: manualMode }">
      <ChampionPool :class="{ 'manual-dim': manualMode }" />
      <StyleLab v-if="manualMode" />
      <BoardStage v-else />
      <aside class="desk-side">
        <HeroSpotlight />
        <TraitsPanel />
      </aside>
    </div>

    <MixerPanel />

    <Transition name="toast">
      <div v-if="noticeText" class="toast">{{ noticeText }}</div>
    </Transition>
  </div>
</template>
