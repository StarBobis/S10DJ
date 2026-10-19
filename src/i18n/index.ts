import { computed } from 'vue';
import { useDesk } from '../stores/desk';
import { en, zhCN, type MessageKey } from './messages';

export function useI18n() {
  const state = useDesk();
  const messages = computed(() => (state.settings.language === 'zh-CN' ? zhCN : en));
  const t = (key: MessageKey): string => messages.value[key] ?? en[key] ?? key;
  const language = computed(() => state.settings.language);
  return { t, language };
}

export type { MessageKey };
