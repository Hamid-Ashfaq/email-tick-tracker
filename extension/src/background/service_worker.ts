import {
  EmailStatus,
  Message,
  StatusBatchResult,
} from '../shared/types';
import {
  getSettings,
  normalizeBackendUrl,
} from '../shared/settings';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pollStatus', { periodInMinutes: 1 });
  chrome.action.setBadgeBackgroundColor({ color: '#4f8ef7' });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollStatus') {
    void pollStatus();
  }
});

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true;
    case 'REGISTER_EMAIL':
      registerEmail(msg.payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    case 'SEND_EMAIL':
      sendEmail(msg.payload)
        .then((sent) => sendResponse({ ok: true, ...sent }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    case 'STATUS_BATCH':
      fetchStatuses(msg.tokens)
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    case 'OPEN_COUNT':
      getOpenCount().then(sendResponse);
      return true;
    case 'PING':
      sendResponse({ ok: true });
      return true;
    default:
      sendResponse({ ok: false, error: 'Unknown message' });
      return false;
  }
});

function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          new Error(chrome.runtime.lastError?.message ?? 'OAuth failed')
        );
        return;
      }
      resolve(token);
    });
  });
}

async function getProfileEmail(token: string): Promise<string> {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('gmail.profile failed');
  const data = await res.json();
  return data.emailAddress as string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
  trackingHtml?: string;
}): Promise<{ id: string; threadId: string }> {
  const token = await getAuthToken();
  const body = buildMime(params.to, params.subject, params.htmlBody, params.trackingHtml ?? '');
  const msg = { raw: base64UrlEncode(body) };
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(msg),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gmail.send failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return { id: data.id as string, threadId: data.threadId as string };
}

function buildMime(
  to: string,
  subject: string,
  htmlBody: string,
  trackingHtml: string
): string {
  const fullHtml = trackingHtml
    ? htmlBody.replace('</body>', trackingHtml + '</body>')
    : htmlBody;
  return [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="et_b"',
    '',
    '--et_b',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    'Your email client does not support HTML. Please enable HTML to read this message.',
    '',
    '--et_b',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    fullHtml,
    '',
    '--et_b--',
    '',
  ].join('\r\n');
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function registerEmail(payload: {
  userEmail: string;
  recipient: string;
  subject: string;
  threadId?: string;
}): Promise<{ ok: boolean; token?: string; emailId?: number; error?: string }> {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: 'Tracking disabled' };
  const url = `${normalizeBackendUrl(settings.backendUrl)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': settings.apiKey,
    },
    body: JSON.stringify({
      user_email: payload.userEmail,
      recipient: payload.recipient,
      subject: payload.subject,
      thread_id: payload.threadId,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Register failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return { ok: true, token: data.tracking_token, emailId: data.email_id };
}

async function fetchStatuses(
  tokens: string[]
): Promise<{ ok: boolean; emails?: EmailStatus[]; error?: string }> {
  if (!tokens.length) return { ok: true, emails: [] };
  const settings = await getSettings();
  const tokenSet = Array.from(new Set(tokens));
  const url = `${normalizeBackendUrl(
    settings.backendUrl
  )}/status/batch?tokens_str=${encodeURIComponent(
    tokenSet.join(',')
  )}&user_email=${encodeURIComponent(await getCurrentUserEmail())}`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': settings.apiKey },
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `${res.status} ${t}` };
  }
  const data = (await res.json()) as StatusBatchResult;
  await updateBadge(data.emails);
  return { ok: true, emails: data.emails };
}

async function getOpenCount(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get('openCount', (stored) => {
      resolve((stored.openCount as number) ?? 0);
    });
  });
}

async function updateBadge(emails: EmailStatus[]): Promise<void> {
  const settings = await getSettings();
  if (!settings.badgeOnRead) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const read = emails.filter((e) => e.state === 'read').length;
  chrome.action.setBadgeText({ text: read > 0 ? String(read) : '' });
}

async function pollStatus(): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled) return;
  const all: Record<string, string> =
    (await chrome.storage.local.get('emailTokens'))['emailTokens'] ?? {};
  const tokens = Object.values(all);
  if (!tokens.length) return;
  const result = await fetchStatuses(tokens);
  await chrome.storage.local.set({ statuses: result.emails ?? [] });
  if (settings.notifyOnRead) {
    const known = (await chrome.storage.local.get('notifiedIds'))[
      'notifiedIds'
    ] as number[] ?? [];
    const newlyRead = (result.emails ?? []).filter(
      (e) => e.state === 'read' && !known.includes(e.email_id)
    );
    if (newlyRead.length) {
      for (const email of newlyRead) {
        chrome.notifications.create(`read-${email.email_id}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Email read',
          message: `${email.recipient} read your email: ${email.subject}`,
        });
      }
      await chrome.storage.local.set({
        notifiedIds: [...known, ...newlyRead.map((e) => e.email_id)],
      });
    }
  }
}

async function getCurrentUserEmail(): Promise<string> {
  const stored = await chrome.storage.local.get('userEmail');
  if (stored.userEmail) return stored.userEmail as string;
  try {
    const token = await getAuthToken();
    const email = await getProfileEmail(token);
    await chrome.storage.local.set({ userEmail: email });
    return email;
  } catch {
    return '';
  }
}

export { getCurrentUserEmail };
