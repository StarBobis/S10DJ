<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';
import { STYLE_LABEL } from '../core/rules';
import { LAYERS, type Layer } from '../core/types';
import {
  fileFor,
  layerSetting,
  play,
  realign,
  setEra,
  setLayerVolume,
  setLockLoop,
  setMaster,
  setOverride,
  stop,
  toggleLayer,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const stylesForLayer = computed(() => {
  const map: Record<string, string[]> = {};
  for (const layer of LAYERS) {
    map[layer] = Object.entries(state.rules?.styles ?? {})
      .filter(([, info]) => info.layers.includes(layer))
      .map(([style]) => style)
      .sort((a, b) => (STYLE_LABEL[a] ?? a).localeCompare(STYLE_LABEL[b] ?? b));
  }
  return map;
});

function stemName(layer: Layer, style: string): string | null {
  return fileFor(style, layer, state.settings.era);
}

function onVolume(layer: Layer, event: Event) {
  setLayerVolume(layer, Number((event.target as HTMLInputElement).value));
}

function onOverride(layer: Layer, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  setOverride(layer, value === 'auto' ? null : value);
}

function onMaster(event: Event) {
  setMaster(Number((event.target as HTMLInputElement).value));
}

function onEra(event: Event) {
  setEra((event.target as HTMLSelectElement).value as 'early' | 'late');
}
</script>

<template>
  <section class="panel">
    <h2>{{ t('mixer.title') }}</h2>

    <div class="transport">
      <button class="primary" :disabled="state.status === 'playing'" @click="play()">{{ t('transport.play') }}</button>
      <button class="ghost" :disabled="state.status !== 'playing'" @click="stop()">{{ t('transport.stop') }}</button>
      <button class="ghost" :disabled="state.status !== 'playing'" @click="realign()">{{ t('transport.realign') }}</button>
      <label class="field">
        <span>{{ t('transport.era') }}</span>
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
        <span>{{ t('transport.lockLoop') }}</span>
      </label>
      <label class="field grow">
        <span>{{ t('transport.master') }}</span>
        <input type="range" min="0" max="1" step="0.01" :value="state.settings.master" @input="onMaster" />
      </label>
      <span class="status" :class="state.status">
        {{ state.status === 'playing' ? t('transport.playing') : t('transport.stopped') }}
      </span>
    </div>

    <div class="layer-grid">
      <article v-for="layer in LAYERS" :key="layer" class="layer-card">
        <header class="layer-head">
          <span class="layer-name">{{ layer }}</span>
          <label class="switch" :title="t('mixer.enabled')">
            <input
              type="checkbox"
              :checked="layerSetting(layer).enabled"
              @change="toggleLayer(layer)"
            />
            <span class="track" />
          </label>
        </header>

        <div class="layer-style-row">
          <span class="layer-style">{{ STYLE_LABEL[state.plan[layer]?.style ?? 'none'] }}</span>
          <span class="weight">{{ t('mixer.weight') }} {{ state.plan[layer]?.weight ?? 0 }}</span>
        </div>
        <p class="layer-flags">
          <span v-if="state.plan[layer]?.spotlight">{{ t('mixer.spotlight') }}</span>
          <span v-if="state.plan[layer]?.manual">{{ t('mixer.manual') }}</span>
        </p>

        <label class="field">
          <span>{{ t('mixer.override') }}</span>
          <select :value="layerSetting(layer).override ?? 'auto'" @change="onOverride(layer, $event)">
            <option value="auto">{{ t('mixer.auto') }}</option>
            <option v-for="style in stylesForLayer[layer]" :key="style" :value="style">
              {{ STYLE_LABEL[style] ?? style }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>{{ t('mixer.volume') }}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="layerSetting(layer).volume"
            @input="onVolume(layer, $event)"
          />
        </label>

        <p class="stem">
          {{
            stemName(layer, state.plan[layer]?.style ?? 'none')
              ? `${stemName(layer, state.plan[layer]?.style ?? 'none')} (${state.settings.era})`
              : t('mixer.noStem')
          }}
        </p>
        <p class="switch-name">Set_Switch_set10_{{ state.plan[layer]?.style ?? 'none' }}_{{ layer }}</p>
      </article>
    </div>
  </section>
</template>
