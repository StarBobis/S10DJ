<script setup lang="ts">
import { computed } from 'vue';
import StyleBadge from './StyleBadge.vue';
import { useI18n, type MessageKey } from '../i18n';
import { LAYERS, type Layer } from '../core/types';
import { STYLE_LABEL, styleColor } from '../core/rules';
import {
  fileFor,
  setLayerVolume,
  setMaster,
  setOverride,
  toggleLayer,
  useDesk,
} from '../stores/desk';

const state = useDesk();
const { t } = useI18n();

const LAYER_LABEL: Record<Layer, MessageKey> = {
  drums: 'layer.drums',
  chords: 'layer.chords',
  top: 'layer.top',
};

const stylesForLayer = computed(() => {
  const map = {} as Record<Layer, string[]>;
  for (const layer of LAYERS) {
    map[layer] = Object.entries(state.rules?.styles ?? {})
      .filter(([, info]) => info.layers.includes(layer))
      .map(([style]) => style)
      .sort((a, b) => (STYLE_LABEL[a] ?? a).localeCompare(STYLE_LABEL[b] ?? b));
  }
  return map;
});

const channels = computed(() =>
  LAYERS.map((layer) => {
    const style = state.plan[layer]?.style ?? 'none';
    return {
      layer,
      style,
      label: STYLE_LABEL[style] ?? style,
      color: styleColor(style),
      weight: state.plan[layer]?.weight ?? 0,
      spotlight: Boolean(state.plan[layer]?.spotlight),
      manual: Boolean(state.plan[layer]?.manual),
      stem: fileFor(style, layer, state.settings.era),
      setting: state.settings.layers[layer],
    };
  }),
);

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
</script>

<template>
  <section class="panel mixer-panel">
    <header class="mixer-head">
      <div class="mixer-title">
        <h2>{{ t('mixer.title') }}</h2>
        <p class="panel-sub">{{ t('mixer.subtitle') }} - {{ LAYERS.length }} {{ t('mixer.layers') }}</p>
      </div>

      <div class="eq" :class="state.status" aria-hidden="true">
        <span v-for="bar in 7" :key="bar" :style="{ animationDelay: `${bar * 0.09}s` }" />
      </div>

      <label class="master-field">
        <span>{{ t('mixer.master') }}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="state.settings.master"
          @input="onMaster"
        />
        <b>{{ Math.round(state.settings.master * 100) }}</b>
      </label>
    </header>

    <div class="channels">
      <article
        v-for="(channel, index) in channels"
        :key="channel.layer"
        class="channel"
        :class="{ disabled: !channel.setting.enabled }"
        :style="{ '--chan': channel.color }"
        :title="`Set_Switch_set10_${channel.style}_${channel.layer}`"
      >
        <header class="channel-head">
          <span class="channel-index">{{ index + 1 }}</span>
          <span class="channel-name">{{ t(LAYER_LABEL[channel.layer]) }}</span>
          <label class="switch" :title="t('mixer.enabled')">
            <input type="checkbox" :checked="channel.setting.enabled" @change="toggleLayer(channel.layer)" />
            <span class="track" />
          </label>
        </header>

        <div class="channel-style">
          <StyleBadge :style="channel.style" label />
          <span class="channel-weight">{{ t('desk.weight') }} {{ channel.weight }}</span>
        </div>

        <div class="channel-body">
          <input
            class="fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="channel.setting.volume"
            :aria-label="`${t(LAYER_LABEL[channel.layer])} ${t('mixer.volume')}`"
            @input="onVolume(channel.layer, $event)"
          />
          <div class="channel-fields">
            <span class="volume-read">{{ Math.round(channel.setting.volume * 100) }}</span>
            <span class="volume-label">{{ t('mixer.volume') }}</span>
            <label class="field stacked">
              <span>{{ t('mixer.override') }}</span>
              <select
                :value="channel.setting.override ?? 'auto'"
                :title="t('mixer.override')"
                @change="onOverride(channel.layer, $event)"
              >
                <option value="auto">{{ t('mixer.auto') }}</option>
                <option v-for="style in stylesForLayer[channel.layer]" :key="style" :value="style">
                  {{ STYLE_LABEL[style] ?? style }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <footer class="channel-footer">
          <span class="channel-stem" :title="channel.stem ?? t('mixer.noStem')">
            {{ channel.stem ? `${channel.stem} - ${state.settings.era}` : t('mixer.noStem') }}
          </span>
          <span class="channel-flags">
            <em v-if="channel.spotlight">{{ t('mixer.spotlight') }}</em>
            <em v-if="channel.manual">{{ t('mixer.manual') }}</em>
            <em v-if="!channel.setting.enabled">{{ t('mixer.muted') }}</em>
          </span>
          <span class="channel-switch">Set_Switch_set10_{{ channel.style }}_{{ channel.layer }}</span>
        </footer>
      </article>
    </div>
  </section>
</template>
