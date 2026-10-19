<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';
import { missingStems, setEra, setLanguage, setLockLoop, setMaster, useDesk } from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const missing = computed(() => missingStems());
const stemCount = computed(() => state.scan?.files.length ?? 0);

function onLanguage(event: Event) {
  setLanguage((event.target as HTMLSelectElement).value as 'en' | 'zh-CN');
}

function onEra(event: Event) {
  setEra((event.target as HTMLSelectElement).value as 'early' | 'late');
}

function onMaster(event: Event) {
  setMaster(Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <section class="panel">
    <h2>{{ t('settings.title') }}</h2>
    <div class="settings-grid">
      <label class="field">
        <span>{{ t('settings.language') }}</span>
        <select :value="state.settings.language" @change="onLanguage">
          <option value="en">English</option>
          <option value="zh-CN">&#31616;&#20307;&#20013;&#25991;</option>
        </select>
      </label>

      <label class="field">
        <span>{{ t('settings.era') }}</span>
        <select :value="state.settings.era" @change="onEra">
          <option value="late">{{ t('transport.era.late') }}</option>
          <option value="early">{{ t('transport.era.early') }}</option>
        </select>
      </label>

      <label class="field checkbox">
        <input
          type="checkbox"
          :checked="state.settings.lockLoop"
          @change="setLockLoop(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('settings.lockLoop') }}</span>
      </label>

      <label class="field">
        <span>{{ t('settings.master') }}</span>
        <input type="range" min="0" max="1" step="0.01" :value="state.settings.master" @input="onMaster" />
      </label>
    </div>

    <dl class="facts">
      <dt>{{ t('settings.audioRoot') }}</dt>
      <dd>{{ state.scan?.root ?? '-' }}</dd>
      <dt>{{ t('settings.stems') }}</dt>
      <dd>{{ stemCount }}</dd>
      <dt>{{ t('settings.missing') }}</dt>
      <dd>{{ missing.length ? missing.join(', ') : t('settings.none') }}</dd>
    </dl>

    <p class="hint">{{ t('settings.about') }}</p>
  </section>
</template>
