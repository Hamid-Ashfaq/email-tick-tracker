import { getSettings, normalizeBackendUrl } from '../shared/settings';
import { makePixelHtml } from './tick_overlay';

/**
 * Compose handling: injects a tracking pixel into outgoing HTML and routes
 * the send through the Gmail API (via the service worker) so the pixel is
 * preserved.
 *
 * To avoid fighting Gmail's native send (which strips remote content), we
 * intercept the "Send" click. On click we:
 *   1. Read the compose fields (to, subject, body).
 *   2. Register the email with the backend -> get a tracking token.
 *   3. Ask the service worker to send the email via the Gmail API with the
 *      pixel appended.
 *   4. Suppress the native send.
 */

export class GmailCompose {
  private sendClicks: Set<HTMLElement> = new Set();
  private observer: MutationObserver;
  private target: HTMLElement;

  constructor(target: HTMLElement = document.body) {
    this.target = target;
    this.observer = new MutationObserver(() => this.scan());
  }

  mount(): void {
    this.observer.observe(this.target, { childList: true, subtree: true });
    this.scan();
    this.scanPeriodically();
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private scanPeriodically(): void {
    window.setInterval(() => this.scan(), 2000);
  }

  private scan(): void {
    document
      .querySelectorAll(
        'div[role="dialog"] div[role="button"][data-tooltip="Send"], div[aria-label*="Send"][role="button"]'
      )
      .forEach((btn) => {
        const el = btn as HTMLElement;
        if (this.sendClicks.has(el)) return;
        this.sendClicks.add(el);
        el.addEventListener('click', (e) => this.onSendClick(e, el));
      });
  }

  private findCompose(button: HTMLElement): HTMLElement | null {
    // Walk up to the dialog, then find the editable area.
    let node: HTMLElement | null = button;
    while (node && !node.getAttribute?.('role')?.includes('dialog')) {
      node = node.parentElement;
    }
    if (!node) return null;
    return node;
  }

  private readCompose(compose: HTMLElement) {
    const toField =
      compose.querySelector<HTMLElement>('input[type="text"][name="to"], input[name="to"]') ??
      compose.querySelector<HTMLElement>(
        'div[aria-label*="To"][contenteditable], textarea[name="to"]'
      );
    const subjectField = compose.querySelector<HTMLInputElement>(
      'input[name="subjectbox"], input[aria-label*="Subject"], input[placeholder*="Subject"]'
    );
    const bodyField = compose.querySelector<HTMLElement>(
      'div[role="textbox"][aria-label*="Body"], div[contenteditable="true"][aria-label*="body"], div[g_editable="true"][aria-label*="Body"]'
    );

    const to = extractEmails(toField?.textContent ?? toField?.getAttribute?.('value') ?? '');
    const subject = subjectField?.value ?? '';
    const bodyHtml = bodyField?.innerHTML ?? '';

    return { to, subject, bodyHtml, compose };
  }

  private async onSendClick(e: Event, button: HTMLElement): Promise<void> {
    const settings = await getSettings();
    if (!settings.enabled) return;

    const compose = this.findCompose(button);
    if (!compose) return;

    const { to, subject, bodyHtml } = this.readCompose(compose);
    if (!to || !bodyHtml) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    try {
      const token = await this.sendTracked(to, subject, bodyHtml);
      this.showSentFeedback(compose, token);
    } catch (err) {
      console.error('[ET] send failed', err);
      this.showError(String(err));
    }
  }

  private async sendTracked(
    to: string,
    subject: string,
    bodyHtml: string
  ): Promise<string> {
    const settings = await getSettings();
    const userEmail = await this.currentUser();

    // 1. Register with backend to get token.
    const registered = await new Promise<{ ok: boolean; token?: string; error?: string }>(
      (resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'REGISTER_EMAIL',
            payload: {
              userEmail,
              recipient: to,
              subject,
            },
          },
          resolve
        );
      }
    );

    if (!registered.ok || !registered.token) {
      throw new Error(registered.error ?? 'Register failed');
    }
    const token = registered.token;

    // 2. Build tracked HTML and send via service worker.
    const trackingHtml = makePixelHtml(
      normalizeBackendUrl(settings.backendUrl),
      token
    );
    const res = await chrome.runtime.sendMessage({
      type: 'SEND_EMAIL',
      payload: {
        to,
        subject,
        htmlBody: bodyHtml,
        trackingHtml,
      },
    });

    if (!res?.ok) throw new Error(res?.error ?? 'Send failed');

    // 3. Remember the token keyed by thread id for the sent-list ticks is
    //    available after the message is actually sent; store under a pending
    //    map keyed by recipient+subject. The sent-row scan uses thread ids
    //    we can't know here, so we store by recipient as a fallback.
    await this.rememberToken(token, to, subject);

    return token;
  }

  private async rememberToken(
    token: string,
    to: string,
    subject: string
  ): Promise<void> {
    const store =
      ((await chrome.storage.local.get('pendingTokens'))['pendingTokens'] as any[]) ??
      [];
    store.push({ token, to, subject, at: Date.now() });
    if (store.length > 200) store.shift();
    await chrome.storage.local.set({ pendingTokens: store });
  }

  private async currentUser(): Promise<string> {
    const stored = await chrome.storage.local.get('userEmail');
    return (stored.userEmail as string) ?? '';
  }

  private showSentFeedback(_compose: HTMLElement, _token: string): void {
    // The email is sent via the API; Gmail's own composer state remains, so
    // we blank it to reflect that the message was sent. For reliability, just
    // log — blanking the compose silently is fragile across Gmail versions.
    console.log('[ET] Email sent with tracking token', _token);
  }

  private showError(message: string): void {
    // Surface a small error banner.
    const banner = document.createElement('div');
    banner.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#d93025;color:#fff;padding:8px 16px;border-radius:6px;z-index:10000;font:14px Arial;';
    banner.textContent = `Email Tick Tracker: send failed \u2014 ${message}`;
    document.body.appendChild(banner);
    window.setTimeout(() => banner.remove(), 6000);
  }
}

function extractEmails(value: string): string {
  const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return matches ? matches.join(',') : value.trim();
}
