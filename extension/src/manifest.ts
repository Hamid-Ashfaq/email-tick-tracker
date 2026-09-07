import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Email Tick Tracker',
  version: '1.0.0',
  description:
    'WhatsApp-style read ticks for Gmail. Shows sent (✓ / ✓✓) and read (✓✓ blue) states.',
  permissions: ['storage', 'identity', 'alarms', 'notifications'],
  host_permissions: [
    'https://mail.google.com/*',
    'https://www.googleapis.com/*',
    'http://localhost:8000/*',
    'https://*.onrender.com/*',
    'https://*.fly.dev/*',
    'https://*.railway.app/*',
  ],
  oauth2: {
    client_id: 'REPLACE_WITH_YOUR_CLIENT_ID.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  },
  background: {
    service_worker: 'src/background/service_worker.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: 'Email Tick Tracker',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  content_scripts: [
    {
      matches: ['https://mail.google.com/*'],
      js: ['src/content/content.ts'],
      css: ['src/content/content.css'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['icons/*.png'],
      matches: ['https://mail.google.com/*'],
    },
  ],
});
