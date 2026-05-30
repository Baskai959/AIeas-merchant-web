import defaultSettings from '@/settings.json';

export type UserRole = 'merchant' | 'admin' | 'buyer';

export interface SessionUser {
  id: string;
  nickname: string;
  role: UserRole;
  status?: string;
  avatar?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface SessionSnapshot {
  user?: SessionUser;
  tokens?: SessionTokens;
}

export type AppSettings = typeof defaultSettings;

const SESSION_STORAGE_KEY = 'merchant-web/session';
const SETTINGS_STORAGE_KEY = 'merchant-web/settings';

function parseStorageValue<T>(key: string): T | null {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    localStorage.removeItem(key);
    return null;
  }
}

export function readSessionSnapshot(): SessionSnapshot {
  if (typeof window === 'undefined') {
    return {};
  }

  return parseStorageValue<SessionSnapshot>(SESSION_STORAGE_KEY) || {};
}

export function writeSessionSnapshot(snapshot: SessionSnapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearSessionSnapshot() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function readSettingsSnapshot(): AppSettings {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  return parseStorageValue<AppSettings>(SETTINGS_STORAGE_KEY) || defaultSettings;
}

export function writeSettingsSnapshot(settings: AppSettings) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}
