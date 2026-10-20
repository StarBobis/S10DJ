<script setup lang="ts">
import { computed } from 'vue';
import { useI18n, type MessageKey } from '../i18n';
import { LAYERS, type Layer } from '../core/types';
import { styleColor } from '../core/rules';
import { comboIdStyles, comboStyles } from '../core/combos';
import {
  artCount,
  comboById,
  missingStems,
  runStemTest,
  setEra,
  setLanguage,
  setLockLoop,
  setMaster,
  stemsAvailable,
  useDesk,
} from '../stores/desk';
import { dislikedCombos, restoreAllCombos, restoreCombo } from '../stores/likes';
import BrokenHeart from './BrokenHeart.vue';

const state = useDesk();
const { t, styleName } = useI18n();

const LAYER_LABEL: Record<Layer, MessageKey> = {
  drums: 'layer.drums',
  chords: 'layer.chords',
  top: 'layer.top',
};

const missing = computed(() => missingStems());
const stemCount = computed(() => stemsAvailable());
const switchCount = computed(() =>
  Object.values(state.rules?.styles ?? {}).reduce((sum, info) => sum + info.layers.length, 0),
);
const soloNames = computed(() =>
  ['classical', 'dj', 'illbeats'].map((style) => styleName(style)).join(' / '),
);

/** Banned combos in the order they were banned, with their live layer plan. */
const dislikedItems = computed(() =>
  dislikedCombos().map((id) => {
    const combo = comboById(id);
    const styles = combo ? comboStyles(combo) : comboIdStyles(id);
    return {
      id,
      label: styles.map((style) => styleName(style)).join(' + '),
      layers: combo
        ? LAYERS.map((layer) => ({ layer, style: combo.layers[layer] }))
        : [],
    };
  }),
);

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
  <section class="panel settings-panel">
    <header class="panel-head">
      <div>
        <h2>{{ t('settings.title') }}</h2>
        <p class="panel-sub">{{ t('app.subtitle') }}</p>
      </div>
    </header>

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

    <section class="dislikes">
      <div class="dislikes-head">
        <div>
          <h3>
            {{ t('settings.dislikes') }}
            <span class="dislike-count">{{ dislikedItems.length }}</span>
          </h3>
          <p class="panel-sub">{{ t('settings.dislikesHint') }}</p>
        </div>
        <button
          class="ghost small"
          :disabled="!dislikedItems.length"
          @click="restoreAllCombos()"
        >
          {{ t('settings.restoreAll') }}
        </button>
      </div>

      <ul v-if="dislikedItems.length" class="dislike-list">
        <li v-for="item in dislikedItems" :key="item.id" class="dislike-row">
          <span class="dislike-glyph"><BrokenHeart /></span>
          <span class="dislike-label" :title="item.id">{{ item.label }}</span>
          <span class="dislike-layers">
            <i
              v-for="entry in item.layers"
              :key="entry.layer"
              :style="{ '--style': styleColor(entry.style) }"
              :title="styleName(entry.style)"
            >
              {{ t(LAYER_LABEL[entry.layer]) }}
            </i>
          </span>
          <button class="ghost small" @click="restoreCombo(item.id)">
            {{ t('settings.restore') }}
          </button>
        </li>
      </ul>
      <p v-else class="hint">{{ t('settings.noDislikes') }}</p>
    </section>

    <section class="diagnostics">
      <div class="diagnostics-head">
        <h3>{{ t('settings.diagnostics') }}</h3>
        <button class="ghost small" :disabled="state.testing?.running" @click="runStemTest()">
          {{ state.testing?.running ? t('settings.testing') : t('settings.runTest') }}
        </button>
      </div>

      <dl class="facts">
        <dt>{{ t('settings.audioRoot') }}</dt>
        <dd>{{ state.scan?.root ?? '-' }}</dd>
        <dt>{{ t('settings.stems') }}</dt>
        <dd>{{ stemCount }}</dd>
        <dt>{{ t('settings.missing') }}</dt>
        <dd>{{ missing.length ? missing.join(', ') : t('settings.none') }}</dd>
        <dt>{{ t('settings.art') }}</dt>
        <dd>{{ artCount }}</dd>
        <dt>{{ t('settings.patch') }}</dt>
        <dd>{{ state.rules?.patch ?? '-' }}</dd>
        <dt>{{ t('settings.unitCount') }}</dt>
        <dd>{{ state.units.length }}</dd>
      </dl>

      <p v-if="state.testing && !state.testing.running" class="diagnostics-result">
        <span v-if="state.testing.ok.length" class="ok">
          {{ t('settings.testOk', { count: state.testing.ok.length }) }}
        </span>
        <span v-if="state.testing.failed.length" class="bad">
          {{ t('settings.testFailed', { list: state.testing.failed.join(', ') }) }}
        </span>
      </p>
    </section>

    <section class="rules-audit">
      <h3>{{ t('settings.rulesAudit') }}</h3>
      <dl class="facts">
        <dt>{{ t('settings.rulesSwitches') }}</dt>
        <dd>{{ switchCount }}</dd>
        <dt>{{ t('settings.rulesModel') }}</dt>
        <dd>{{ t('settings.rulesModelValue') }}</dd>
        <dt>{{ t('settings.rulesSolo') }}</dt>
        <dd>{{ soloNames }}</dd>
        <dt>{{ t('settings.rulesHeadliner') }}</dt>
        <dd>{{ t('settings.rulesHeadlinerValue') }}</dd>
        <dt>{{ t('settings.rulesLimits') }}</dt>
        <dd>{{ t('settings.rulesLimitsValue') }}</dd>
        <dt>{{ t('settings.rulesSources') }}</dt>
        <dd>{{ t('settings.rulesSourcesValue') }}</dd>
      </dl>
    </section>

    <p class="hint">{{ t('settings.about') }}</p>
  </section>
</template>
