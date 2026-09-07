# Email Tick Tracker

A Gmail browser extension that adds **WhatsApp-style read ticks** to your sent
emails. It shows:

- **Gray ✓** — sent, not yet opened
- **Blue ✓✓** — opened/read (via a tracking pixel)

It uses a tracking pixel embedded in outgoing HTML email to detect when the
recipient's mail client loads the message (i.e. an "open"). A small Python
backend records these opens; the extension polls it and renders the ticks on
your Sent list.

> **Honest limitations**
> - Opens are detected via a 1×1 pixel. Gmail routes images through its proxy
>   and Apple Mail Privacy Protection pre-loads remote images, so *any* image
>   load (even one the person never actually read) reports as "read". This is
>   the classic trade-off of all email trackers.
> - Plain-text-only recipients won't trigger an open (the pixel is HTML-only).

## Architecture

```
Chrome Extension (MV3, TS + React + CRXJS/Vite)
   ├─ content.ts       Gmail DOM: compose detection + pixel injection + tick overlay
   ├─ service_worker   OAuth (chrome.identity) + Gmail API send + status polling
   └─ popup            Settings (enabled, backend URL, API key, notifications)
           │  HTTPS
           ▼
Python Backend (FastAPI + SQLAlchemy)
   ├─ POST /events              register an outgoing email -> tracking token
   ├─ GET  /track/{token}.gif   1x1 pixel; records an open (deduped)
   ├─ GET  /status              single email state
   └─ GET  /status/batch        bulk state lookup for the Sent list
```

## Prerequisites

- Python 3.11+ (tested on 3.14)
- Node.js 18+ (tested on 24)
- Chrome (for loading the unpacked extension)

## 1. Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create your config:

```bash
cp .env.example .env
# then edit .env:
#   SECRET_KEY      -> a long random string
#   API_KEY         -> a random shared key (must match the extension's API key)
#   BASE_URL        -> http://localhost:8000 for local dev
```

Run it:

```bash
python run.py
# or: uvicorn app.main:app --reload
```

Smoke test:

```bash
curl http://localhost:8000/health                 # {"status":"ok"}
```

### Deploying (optional, for real recipients)

The tracking pixel lives in your email HTML and must be reachable by your
recipients, so for anything beyond local testing, deploy to a public HTTPS
host. Any of Render / Railway / Fly.io work well. The `BASE_URL` env var
should be set to your deployed URL. Ensure your HTTPS origin is also added to
the extension's `host_permissions`.

## 2. Google OAuth setup

Because the extension sends email *through the Gmail API* (which preserves the
tracking pixel), you need a Google Cloud project:

1. Go to https://console.cloud.google.com and create a project (or reuse one).
2. Enable the **Gmail API**.
3. Create an **OAuth 2.0 Client ID** of type **Chrome Extension**.
4. In **Audience → Client ID**, add your extension's ID
   (`chrome://extensions` → "Load unpacked" → copy the generated ID).
5. Put your client ID into `extension/src/manifest.ts`:

   ```ts
   oauth2: {
     client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
     scopes: ['https://www.googleapis.com/auth/gmail.send'],
   },
   ```

   > Only `gmail.send` is used (send-only, sensitive tier). No restricted
   > scopes, so no CASA security assessment is required.

   For a personal / self-loaded extension you can finish in **Test mode**,
   which lets your own account authorize without a full verification.

## 3. Extension

```bash
cd extension
npm install
npm run build
```

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked** and select the `extension/dist` directory
- Open the extension popup and set:
  - **Backend URL** — your backend (e.g. `http://localhost:8000`)
  - **API key** — must match `API_KEY` in your backend `.env`
- On your first tracked send, Chrome will prompt you to sign in to your Google
  account (this authorizes Gmail access).

> Tip: to develop with hot-reload, run `npm run dev` and load
> `extension/dist`. CRXJS will rebuild it automatically.

## How it works (sending)

1. You compose an email in Gmail and click **Send**.
2. The content script intercepts the send, reads the To/Subject/Body fields
   and POSTs them to the backend to get a tracking token.
3. It asks the service worker to send the email through the **Gmail API** with
   the 1×1 tracking pixel (`<img src="https://backend/track/{token}.gif">`)
   appended to the HTML body, and suppresses Gmail's native send.
4. The extension stores the token keyed by recipient.
5. When Gmail shows the message in your Sent list, the content script adds a
   gray ✓ beside the recipient.
6. The service worker polls `/status/batch` every minute; when the pixel is
   requested by the recipient, the tick flips to blue ✓✓.

## Tick states

| State | Icon | Meaning                 |
|-------|------|-------------------------|
| sent  | ✓ (gray) | Sent, not opened yet  |
| read  | ✓✓ (blue) | Opened via tracking pixel |

## Troubleshooting

- **Ticks don't appear** — confirm the backend is running, the popup URL/API
  key are correct, and the email was actually sent through the extension (you
  should see a `Send failed` banner if the Gmail API call errored).
- **"Google hasn't verified this app"** — expected in test mode; click
  "Advanced → Go to app (unsafe)" for your own account.
- **Build errors after editing manifest** — re-run `npm run build`; the
  unpacked ID only changes if the extension is reloaded.

## Project layout

```
backend/
  app/
    main.py        FastAPI app + endpoints
    models.py      SQLAlchemy models (Email, OpenEvent, ClickEvent)
    config.py      Environment settings
    tokens.py      Signed tracking tokens (HMAC)
  run.py           Local dev launcher
  requirements.txt
  .env.example
extension/
  src/
    manifest.ts        MV3 manifest (CRXJS)
    shared/
      types.ts         Shared message/type protocol
      settings.ts      Settings load/save helpers
    background/
      service_worker.ts  OAuth, Gmail send, status polling, notifications
    content/
      content.ts         Boots the tracker on Gmail
      compose.ts         Compose detection + pixel injection + tracked send
      tick_overlay.ts    Sent-list tick icons
      content.css
    popup/
      popup.tsx / App.tsx / popup.html / popup.css
  make_icons.py     Generates the extension icons
```

## Privacy / legal

- Inform recipients that you use tracking pixels where required by law
  (e.g. GDPR).
- Only the recipient address and subject are stored alongside the open
  timestamp; no email body is stored.
- Respect recipients' privacy — MPP and image-blocking reduce accuracy by
  design.
