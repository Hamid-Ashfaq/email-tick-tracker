import { getSettings } from '../shared/settings';
import { EmailStatus } from '../shared/types';
import { GmailCompose } from './compose';
import { TickOverlay } from './tick_overlay';

function boot(): void {
  const compose = new GmailCompose();
  compose.mount();

  const overlay = new TickOverlay({});
  overlay.mount();

  // Periodically reconcile tokens -> ticks and refresh statuses.
  const interval = window.setInterval(async () => {
    const settings = await getSettings();
    if (!settings.enabled) return;

    const map = await buildTokenMap();
    overlay.updateTokenMap(map);

    const tokens = Object.values(map);
    if (tokens.length) {
      const res = await chrome.runtime.sendMessage({
        type: 'STATUS_BATCH',
        tokens,
      });
      if (res?.ok && Array.isArray(res.emails)) {
        overlay.updateStatuses(res.emails as EmailStatus[]);
      }
    }
  }, 10000);

  window.addEventListener('beforeunload', () => {
    window.clearInterval(interval);
    compose.destroy();
    overlay.destroy();
  });
}

async function buildTokenMap(): Promise<Record<string, string>> {
  const store =
    ((await chrome.storage.local.get('pendingTokens'))['pendingTokens'] as any[]) ?? [];
  const map: Record<string, string> = {};
  // Key by lowercase recipient address; matches the sent-row sender email.
  for (let i = store.length - 1; i >= 0; i--) {
    const entry = store[i];
    if (!entry?.recipient) continue;
    const key = String(entry.recipient).toLowerCase();
    if (!map[key]) map[key] = entry.token;
  }
  return map;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
