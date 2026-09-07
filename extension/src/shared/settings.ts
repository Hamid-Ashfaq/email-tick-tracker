import {
  DEFAULT_SETTINGS,
  ExtensionSettings,
  SETTINGS_KEY,
} from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const value = (stored[SETTINGS_KEY] ?? {}) as Partial<ExtensionSettings>;
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function saveSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export function normalizeBackendUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
