<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';
import { LAYERS, type Layer } from '../core/types';
import { STYLE_LABEL, styleColor } from '../core/rules';
import { play, realign, setEra, setLockLoop, stop, useDesk } from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

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
      label: STYLE_LABEL[style] ?? style,
      color: styleColor(style),
    };
  }),
);

function layerColor(layer: Layer): string {
  return styleColor(state.plan[layer]?.style ?? 'none');
}
</script>

<template>
  <section class="transport-bar">
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
