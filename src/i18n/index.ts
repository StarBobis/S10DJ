import { computed } from 'vue';
import { useDesk } from '../stores/desk';
import { STYLE_LABEL } from '../core/rules';
import type { Unit } from '../core/types';
import { en, zhCN, type MessageKey } from './messages';

export type MessageParams = Record<string, string | number>;

export function useI18n() {
  const state = useDesk();
  const messages = computed(() => (state.settings.language === 'zh-CN' ? zhCN : en));

  const t = (key: MessageKey, params?: MessageParams): string => {
    let text: string = messages.value[key] ?? en[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };

  const championName = (unit: Pick<Unit, 'name' | 'nameZh'> | null | undefined): string => {
    if (!unit) return '';
    return state.settings.language === 'zh-CN' ? unit.nameZh || unit.name : unit.name;
  };

  const traitName = (trait: string): string => {
    if (state.settings.language !== 'zh-CN') return trait;
    return state.rules?.traitNamesZh?.[trait] ?? trait;
  };

  const styleName = (style: string): string => {
    if (state.settings.language === 'zh-CN') {
      return state.rules?.styleNamesZh?.[style] ?? STYLE_LABEL[style] ?? style;
    }
    return STYLE_LABEL[style] ?? style;
  };

  const language = computed(() => state.settings.language);
  return { t, language, championName, traitName, styleName };
}

export type { MessageKey };
