<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';
import { LAYERS, type Layer } from '../core/types';
import { styleColor, styleFrequency } from '../core/rules';
import {
  nextStation,
  play,
  realign,
  setEra,
  setLockLoop,
  setMixMode,
  stop,
  toggleRadio,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t, styleName } = useI18n();

const statusLabel = computed(() => {
  if (state.status === 'playing') return t('transport.playing');
  if (state.status === 'loading') return t('transport.loading');
  return t('transport.stopped');
});

const planPills = computed(() =>
  LAYERS.map((layer) => {
    const style = state.plan[layer]?.style ?? 'none';
    return {
      layer,
      style,
      label: styleName(style),
      color: styleColor(style),
    };
  }),
);

const radioStation = computed(
  () => `${styleName(state.radio.station)} ${styleFrequency(state.radio.station)} FM`,
);

function layerColor(layer: Layer): string {
  return styleColor(state.plan[layer]?.style ?? 'none');
}
</script>

<template>
  <section class="transport-bar" :class="{ 'radio-live': state.radio.enabled }">
    <div class="transport-actions">
      <button class="primary play" :disabled="state.status !== 'stopped'" @click="play()">
        <span aria-hidden="true">&#9654;</span>
        {{ t('transport.play') }}
      </button>
      <button class="ghost icon" :disabled="state.status !== 'playing'" :title="t('transport.stop')" @click="stop()">
        <span aria-hidden="true">&#9632;</span>
      </button>
      <button
        class="ghost icon"
        :disabled="state.status !== 'playing'"
        :title="t('transport.realign')"
        @click="realign()"
      >
        <span aria-hidden="true">&#8635;</span>
      </button>
    </div>

    <div class="era-toggle">
      <span class="control-label">{{ t('transport.era') }}</span>
      <div class="segmented">
        <button :class="{ active: state.settings.era === 'early' }" @click="setEra('early')">
          {{ t('transport.era.early') }}
        </button>
        <button :class="{ active: state.settings.era === 'late' }" @click="setEra('late')">
          {{ t('transport.era.late') }}
        </button>
      </div>
    </div>

    <div class="mix-mode">
      <span class="control-label">{{ t('mode.label') }}</span>
      <div class="segmented">
        <button
          :class="{ active: state.settings.mixMode === 'board' }"
          @click="setMixMode('board')"
        >
          {{ t('mode.board') }}
        </button>
        <button
          :class="{ active: state.settings.mixMode === 'manual' }"
          @click="setMixMode('manual')"
        >
          {{ t('mode.manual') }}
        </button>
      </div>
    </div>

    <label class="toggle-field">
      <span class="switch">
        <input
          type="checkbox"
          :checked="state.settings.lockLoop"
          @change="setLockLoop(($event.target as HTMLInputElement).checked)"
        />
        <span class="track" />
      </span>
      <span>{{ t('transport.lockLoop') }}</span>
    </label>

    <div class="radio-control" :class="{ live: state.radio.enabled }">
      <button
        class="radio-button"
        :title="state.radio.enabled ? t('radio.stop') : t('radio.start')"
        @click="toggleRadio()"
      >
        <span class="radio-glyph" aria-hidden="true">&#9673;</span>
        <span class="radio-copy">
          <b>{{ state.radio.enabled ? t('radio.onAir') : t('radio.start') }}</b>
          <em>{{ state.radio.enabled ? radioStation : t('radio.auto') }}</em>
        </span>
        <span v-if="state.radio.enabled" class="radio-meter">
          <i :style="{ width: `${Math.round(state.radio.progress * 100)}%` }" />
        </span>
      </button>
      <button
        v-if="state.radio.enabled"
        class="ghost icon radio-skip"
        :title="t('radio.next')"
        @click="nextStation()"
      >
        <span aria-hidden="true">&#9197;</span>
      </button>
    </div>

    <div class="plan-pills" :aria-label="t('desk.plan')">
      <span
        v-for="pill in planPills"
        :key="pill.layer"
        class="plan-pill"
        :style="{ '--style': pill.color }"
        :title="`Set_Switch_set10_${pill.style}_${pill.layer}`"
      >
        <i :style="{ background: layerColor(pill.layer) }" />
        <em>{{ t(`layer.${pill.layer}` as const) }}</em>
        <b>{{ pill.label }}</b>
      </span>
    </div>

    <span class="transport-status" :class="state.status">
      <span class="pulse" />
      {{ statusLabel }}
    </span>
  </section>
</template>
