import { useEffect, useState } from 'react';
import {
  ExtensionSettings,
} from '../shared/types';
import { getSettings, saveSettings } from '../shared/settings';

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    getSettings().then((s) => setSettings(s));
    chrome.runtime.sendMessage({ type: 'OPEN_COUNT' }, (res) => {
      if (typeof res === 'number') setOpenCount(res);
    });
  }, []);

  if (!settings) return <div className="loading">Loading…</div>;

  const update = (patch: Partial<ExtensionSettings>) =>
    setSettings({ ...settings, ...patch });

  const onSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="popup">
      <header className="head">
        <h1>Email Tick Tracker</h1>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span className="slider"></span>
        </label>
      </header>

      <section className="field">
        <label htmlFor="backend">Backend URL</label>
        <input
          id="backend"
          value={settings.backendUrl}
          onChange={(e) => update({ backendUrl: e.target.value })}
          placeholder="http://localhost:8000"
        />
      </section>

      <section className="field">
        <label htmlFor="apikey">API key</label>
        <input
          id="apikey"
          type="password"
          value={settings.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          placeholder="X-Api-Key"
        />
      </section>

      <section className="checks">
        <label>
          <input
            type="checkbox"
            checked={settings.notifyOnRead}
            onChange={(e) => update({ notifyOnRead: e.target.checked })}
          />
          Notify when emails are read
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.badgeOnRead}
            onChange={(e) => update({ badgeOnRead: e.target.checked })}
          />
          Show read count in badge
        </label>
      </section>

      <section className="stats">
        <span>Emails read: {openCount}</span>
      </section>

      <button className="save" onClick={onSave}>
        {saved ? 'Saved ✓' : 'Save settings'}
      </button>

      <p className="hint">
        Make sure you’ve loaded this extension as unpacked and connected your
        Google account (click the icon to authorize Gmail access on first
        send).
      </p>
    </div>
  );
}
