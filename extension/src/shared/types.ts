export type TickState = 'sent' | 'read';

export interface EmailStatus {
  email_id: number;
  token: string;
  recipient: string;
  subject: string;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  state: TickState;
}

export interface ExtensionSettings {
  enabled: boolean;
  backendUrl: string;
  apiKey: string;
  notifyOnRead: boolean;
  badgeOnRead: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  backendUrl: 'http://localhost:8000',
  apiKey: '',
  notifyOnRead: true,
  badgeOnRead: true,
};

export const SETTINGS_KEY = 'email_tick_settings';

// Message protocol between content script, service worker, and popup.
export type Message =
  | { type: 'GET_SETTINGS' }
  | { type: 'PING' }
  | { type: 'STATUS_BATCH'; tokens: string[] }
  | { type: 'OPEN_COUNT' }
  | { type: 'REGISTER_EMAIL'; payload: RegisteredEmail }
  | { type: 'SEND_EMAIL'; payload: SendEmailPayload };

export interface RegisteredEmail {
  userEmail: string;
  recipient: string;
  subject: string;
  threadId?: string;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  trackingHtml?: string;
}

export interface StatusBatchResult {
  emails: EmailStatus[];
}
