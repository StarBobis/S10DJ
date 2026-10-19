import { computed } from 'vue';
import { useDesk } from '../stores/desk';
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

  const language = computed(() => state.settings.language);
  return { t, language };
}

export type { MessageKey };
