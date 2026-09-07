import { EmailStatus, TickState } from '../shared/types';

const TOKEN_ATTR = 'data-et-token';

/**
 * Renders a WhatsApp-style tick next to sent email rows.
 *
 * The approach:
 *  - We know which recipient emails we have tracked (token map keyed by the
 *    recipient address of our outgoing message).
 *  - We observe the DOM for sent-list rows, read the recipient, and
 *    inject/update a tick span based on the current status.
 */
export class TickOverlay {
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private mounted: boolean = false;

  constructor(private tokenMap: Record<string, string>) {}

  mount(root: HTMLElement = document.body): void {
    if (this.mounted) return;
    this.mounted = true;

    this.scan();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(root, { childList: true, subtree: true });

    window.addEventListener('hashchange', () => this.schedule());
  }

  updateTokenMap(map: Record<string, string>): void {
    this.tokenMap = map;
    this.scan();
  }

  updateStatuses(statuses: EmailStatus[]): void {
    const byToken = new Map(statuses.map((s) => [s.token, s.state]));
    document
      .querySelectorAll(`[${TOKEN_ATTR}]`)
      .forEach((el) => {
        const token = el.getAttribute(TOKEN_ATTR);
        if (!token) return;
        const state = byToken.get(token);
        if (state) this.setTickState(el as HTMLElement, state);
      });
  }

  destroy(): void {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.mounted = false;
  }

  private schedule(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => this.scan(), 80);
  }

  private scan(): void {
    const rows = this.sentRows();
    rows.forEach((row) => {
      const recipient = this.rowRecipient(row);
      if (!recipient) return;
      const token = this.tokenMap[recipient.toLowerCase()];
      if (!token) return;
      const anchor = this.findAnchor(row);
      if (!anchor) return;
      this.ensureTick(anchor, token);
    });
  }

  private sentRows(): HTMLElement[] {
    const result: HTMLElement[] = [];
    document
      .querySelectorAll<HTMLElement>('tr[data-thread-id], tr[data-legacy-thread-id]')
      .forEach((row) => {
        result.push(row);
      });
    return result;
  }

  private rowRecipient(row: HTMLElement): string | null {
    const sender = row.querySelector<HTMLElement>('td div.yW span[email]');
    const email = sender?.getAttribute('email');
    if (email) return email.trim();
    return null;
  }

  private findAnchor(row: HTMLElement): HTMLElement | null {
    const sender = row.querySelector<HTMLElement>('td div.yW span[email]');
    if (sender && sender.parentElement) return sender.parentElement;
    // Fallback: subject cell.
    const subj = row.querySelector<HTMLElement>('td.xY, td div.yW');
    if (subj) return subj;
    return null;
  }

  private ensureTick(anchor: HTMLElement, token: string): void {
    let el = anchor.querySelector<HTMLElement>(`.et-tick-container[${TOKEN_ATTR}="${token}"]`);
    if (el) return;

    if (anchor.querySelector(`.et-tick-container[${TOKEN_ATTR}]`)) {
      // Another token already present; skip to avoid clobbering.
      return;
    }

    el = document.createElement('span');
    el.className = 'et-tick-container';
    el.setAttribute(TOKEN_ATTR, token);
    el.dataset.state = 'sent';
    el.title = 'Sent - waiting for open';
    el.innerHTML = `<span class="et-tick sent"><span class="et-tick-glyph">&#10003;</span></span>`;

    anchor.appendChild(el);
  }

  private setTickState(el: HTMLElement, state: TickState): void {
    const current = el.dataset.state;
    if (current === state) return;
    el.dataset.state = state;
    if (state === 'read') {
      el.title = 'Read';
      el.innerHTML = `<span class="et-tick read"><span class="et-tick-glyph">&#10003;&#10003;</span></span>`;
    } else {
      el.title = 'Sent - waiting for open';
      el.innerHTML = `<span class="et-tick sent"><span class="et-tick-glyph">&#10003;</span></span>`;
    }
  }
}

export function makePixelHtml(backendUrl: string, token: string): string {
  const url = `${backendUrl}/track/${encodeURIComponent(token)}.gif`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;opacity:0;border:0;" />`;
}
