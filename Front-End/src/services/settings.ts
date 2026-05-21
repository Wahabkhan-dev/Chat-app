/**
 * Settings Service
 * Manages all user preferences and settings with persistent storage
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type NotificationSound = 'default' | 'gentle' | 'none';
export type MessageDensity = 'compact' | 'comfortable' | 'spacious';

export interface UserSettings {
  // Theme & Appearance
  theme: ThemePreference;
  compactMode: boolean;
  messageDensity: MessageDensity;
  sidebarCollapsed: boolean;

  // Notifications
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notificationSound: NotificationSound;
  desktopNotifications: boolean;
  muteAllNotifications: boolean;

  // Privacy & Security
  onlineStatusVisible: boolean;
  typingIndicator: boolean;
  readReceipts: boolean;
  lastSeenVisible: boolean;

  // Chat Preferences
  autoPlayVideos: boolean;
  autoPlayGifs: boolean;
  previewLinks: boolean;
  searchInSharedFiles: boolean;
  dateFormat: '12h' | '24h';

  // Advanced
  language: string;
  timezone: string;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  // Theme & Appearance
  theme: 'system',
  compactMode: false,
  messageDensity: 'comfortable',
  sidebarCollapsed: false,

  // Notifications
  notificationsEnabled: true,
  soundEnabled: true,
  notificationSound: 'default',
  desktopNotifications: true,
  muteAllNotifications: false,

  // Privacy & Security
  onlineStatusVisible: true,
  typingIndicator: true,
  readReceipts: true,
  lastSeenVisible: true,

  // Chat Preferences
  autoPlayVideos: false,
  autoPlayGifs: true,
  previewLinks: true,
  searchInSharedFiles: true,
  dateFormat: '12h',

  // Advanced
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  debugMode: false,
};

const SETTINGS_STORAGE_KEY = 'mawby_user_settings';
const SETTINGS_VERSION_KEY = 'mawby_settings_version';
const SETTINGS_VERSION = 1;

/**
 * Get all settings for current user
 */
export function loadSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const version = localStorage.getItem(SETTINGS_VERSION_KEY);

    // Validate version and migrate if needed
    if (version !== SETTINGS_VERSION.toString()) {
      console.log('Settings version mismatch, using defaults');
      return { ...DEFAULT_SETTINGS };
    }

    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  return { ...DEFAULT_SETTINGS };
}

/**
 * Save all settings
 */
import { api, getToken } from '@/lib/api';

export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    localStorage.setItem(SETTINGS_VERSION_KEY, SETTINGS_VERSION.toString());
    // Dispatch custom event so other tabs/windows can listen
    window.dispatchEvent(
      new CustomEvent('settingsChanged', { detail: settings })
    );
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Update a single setting
 */
export function updateSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): UserSettings {
  const current = loadSettings();
  current[key] = value;
  saveSettings(current);
  // Try to persist to server in background if authenticated
  try {
    const token = getToken();
    if (token) {
      api.patch(`/settings/${String(key)}`, { value }).catch(() => {});
    }
  } catch {}
  return current;
}

/**
 * Update multiple settings
 */
export function updateSettings(
  updates: Partial<UserSettings>
): UserSettings {
  const current = loadSettings();
  const updated = { ...current, ...updates };
  saveSettings(updated);
  // Try to persist to server in background if authenticated
  try {
    const token = getToken();
    if (token) {
      api.patch('/settings', updates).catch(() => {});
    }
  } catch {}
  return updated;
}

/**
 * Reset all settings to defaults
 */
export function resetSettings(): UserSettings {
  const defaults = { ...DEFAULT_SETTINGS };
  saveSettings(defaults);
  return defaults;
}

/**
 * Clear all settings (used on logout)
 */
export function clearSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(SETTINGS_VERSION_KEY);
    window.dispatchEvent(new CustomEvent('settingsCleared'));
  } catch (error) {
    console.error('Error clearing settings:', error);
  }
}

/**
 * Export settings as JSON file
 */
export function exportSettings(): string {
  const settings = loadSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON
 */
export function importSettings(jsonString: string): UserSettings {
  try {
    const imported = JSON.parse(jsonString);
    const settings = { ...DEFAULT_SETTINGS, ...imported };
    saveSettings(settings);
    return settings;
  } catch (error) {
    console.error('Error importing settings:', error);
    throw new Error('Invalid settings file');
  }
}

/**
 * Get a specific setting
 */
export function getSetting<K extends keyof UserSettings>(
  key: K
): UserSettings[K] {
  const settings = loadSettings();
  return settings[key];
}

/**
 * Listen for settings changes from other sources
 */
export function onSettingsChanged(
  callback: (settings: UserSettings) => void
): () => void {
  const handler = (event: Event) => {
    if (event instanceof CustomEvent) {
      callback(event.detail);
    }
  };

  window.addEventListener('settingsChanged', handler);

  return () => {
    window.removeEventListener('settingsChanged', handler);
  };
}

/**
 * Listen for settings clear event
 */
export function onSettingsCleared(callback: () => void): () => void {
  const handler = () => {
    callback();
  };

  window.addEventListener('settingsCleared', handler);

  return () => {
    window.removeEventListener('settingsCleared', handler);
  };
}
