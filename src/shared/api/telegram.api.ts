import api from '../lib/api';

export type TelegramStatus = {
  /** false — the bot is not configured on the server */
  enabled: boolean;
  linked: boolean;
  bot_username?: string | null;
  username?: string | null;
  display_name?: string | null;
  linked_at?: string | null;
};

export type TelegramLink = {
  /** t.me deep link with a one-time token */
  url: string;
  expires_at: string;
};

export type TelegramTranscriptMessage = {
  from_name?: string | null;
  text: string;
  sent_at?: string | null;
};

/** Where a request created by the Telegram bot came from */
export type TelegramRequestSource = {
  source_kind: 'private' | 'group' | string;
  chat_title?: string | null;
  source_text: string;
  summary?: string | null;
  transcript: TelegramTranscriptMessage[];
  message_url?: string | null;
  confirmed_by?: string | null;
  created_at: string;
};

export async function getRequestTelegramSource(requestId: string): Promise<TelegramRequestSource> {
  const { data } = await api.get<TelegramRequestSource>(`/telegram/requests/${requestId}/source`);
  return data;
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const { data } = await api.get<TelegramStatus>('/telegram/status');
  return data;
}

export async function createTelegramLink(): Promise<TelegramLink> {
  const { data } = await api.post<TelegramLink>('/telegram/link');
  return data;
}

export async function unlinkTelegram(): Promise<void> {
  await api.delete('/telegram/link');
}
