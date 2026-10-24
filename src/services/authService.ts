import { get, set } from 'idb-keyval';
import { createDefaultProviderConfig } from './llmService';
import {
  createDefaultVoiceSettings,
  loadProviderConfig,
  loadStudyStats,
  loadVoiceSettings,
  saveProviderConfig,
  saveStudyStats,
  saveVoiceSettings,
} from './storageService';
import type {
  ProviderConfig,
  StudyStats,
  UserAccount,
  VoiceSettings,
} from '../types';

const ACCOUNTS_STORAGE_KEY = 'voxread_accounts_registry_v1';
const ACTIVE_SESSION_KEY = 'voxread_active_session_v1';

interface ActiveSessionPayload {
  username: string;
  sessionToken: string;
  rememberMe: boolean;
  loggedInAt: number;
}

/**
 * Computes a deterministic salted hash for password verification (works in browser & Node/Vitest).
 */
export async function hashPassword(
  username: string,
  password: string
): Promise<string> {
  const normalizedUser = username.trim().toLowerCase();
  const payload = `voxread_salt_v1:${normalizedUser}:${password}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback simple hash if crypto.subtle is unavailable
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}

function loadAccountsMapSync(): Record<string, UserAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, UserAccount>;
  } catch {
    return {};
  }
}

async function saveAccountsMap(map: Record<string, UserAccount>): Promise<void> {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
  try {
    await set(ACCOUNTS_STORAGE_KEY, map);
  } catch {
    // Ignore
  }
}

export async function loadAllAccounts(): Promise<Record<string, UserAccount>> {
  const localMap = loadAccountsMapSync();
  if (Object.keys(localMap).length > 0) return localMap;

  try {
    const idbMap = await get<Record<string, UserAccount>>(ACCOUNTS_STORAGE_KEY);
    if (idbMap && typeof idbMap === 'object') {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(idbMap));
      return idbMap;
    }
  } catch {
    // Ignore
  }
  return {};
}

function persistActiveSession(username: string, rememberMe = true): void {
  const session: ActiveSessionPayload = {
    username: username.trim().toLowerCase(),
    sessionToken: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    rememberMe,
    loggedInAt: Date.now(),
  };

  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore
  }
  try {
    if (typeof indexedDB !== 'undefined') {
      set(ACTIVE_SESSION_KEY, session).catch(() => {});
    }
  } catch {
    // Ignore
  }
}

/**
 * Registers a new user account (or logs in if username + password already match)
 * and immediately saves initial Gemini API key / model / voice settings.
 */
export async function registerAccount(params: {
  username: string;
  password: string;
  geminiApiKey?: string;
  geminiModel?: string;
  voiceSettings?: VoiceSettings;
  rememberMe?: boolean;
}): Promise<UserAccount> {
  const cleanUsername = params.username.trim().toLowerCase();
  if (cleanUsername.length < 2) {
    throw new Error('O nome de usuário deve ter pelo menos 2 caracteres.');
  }
  if (!params.password || params.password.length < 3) {
    throw new Error('A senha deve ter pelo menos 3 caracteres.');
  }

  const accounts = await loadAllAccounts();
  const pwdHash = await hashPassword(cleanUsername, params.password);

  if (accounts[cleanUsername]) {
    // If same password, treat as login + update settings
    if (accounts[cleanUsername].passwordHash === pwdHash) {
      const existing = accounts[cleanUsername];
      const updated: UserAccount = {
        ...existing,
        lastLoginAt: Date.now(),
        geminiApiKey:
          params.geminiApiKey?.trim() || existing.geminiApiKey || '',
        geminiModel:
          params.geminiModel?.trim() ||
          existing.geminiModel ||
          'gemini-3.5-flash-lite',
        voiceSettings: params.voiceSettings || existing.voiceSettings,
      };
      accounts[cleanUsername] = updated;
      await saveAccountsMap(accounts);
      persistActiveSession(cleanUsername, params.rememberMe ?? true);
      applyAccountToLocalSettings(updated);
      return updated;
    }
    throw new Error(
      `O usuário "${cleanUsername}" já existe neste dispositivo. Digite a senha correta para entrar.`
    );
  }

  const currentProviderCfg = loadProviderConfig();
  const currentVoice = params.voiceSettings || loadVoiceSettings();
  const currentStats = loadStudyStats();

  const newAccount: UserAccount = {
    username: cleanUsername,
    passwordHash: pwdHash,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    geminiApiKey:
      params.geminiApiKey?.trim() || currentProviderCfg.apiKeys.gemini || '',
    geminiModel:
      params.geminiModel?.trim() ||
      currentProviderCfg.selectedModels.gemini ||
      'gemini-3.5-flash-lite',
    aiSanitizePdf: currentProviderCfg.aiSanitizePdf ?? true,
    voiceSettings: currentVoice,
    studyStats: currentStats,
  };

  accounts[cleanUsername] = newAccount;
  await saveAccountsMap(accounts);
  persistActiveSession(cleanUsername, params.rememberMe ?? true);
  applyAccountToLocalSettings(newAccount);

  return newAccount;
}

/**
 * Authenticates an existing user account and restores all saved settings.
 */
export async function loginAccount(params: {
  username: string;
  password: string;
  rememberMe?: boolean;
}): Promise<UserAccount> {
  const cleanUsername = params.username.trim().toLowerCase();
  const accounts = await loadAllAccounts();
  const existing = accounts[cleanUsername];

  if (!existing) {
    throw new Error(
      `Conta "${cleanUsername}" não encontrada. Use a aba "Criar Conta Rápida" para cadastrar de primeira.`
    );
  }

  const pwdHash = await hashPassword(cleanUsername, params.password);
  if (existing.passwordHash !== pwdHash) {
    throw new Error('Senha incorreta para este usuário.');
  }

  const updated: UserAccount = {
    ...existing,
    lastLoginAt: Date.now(),
  };

  accounts[cleanUsername] = updated;
  await saveAccountsMap(accounts);
  persistActiveSession(cleanUsername, params.rememberMe ?? true);
  applyAccountToLocalSettings(updated);

  return updated;
}

/**
 * Automatically restores the active logged-in user on site startup so the user NEVER
 * has to log in repeatedly every time they open the app.
 */
export async function restoreActiveSession(): Promise<UserAccount | null> {
  const accounts = await loadAllAccounts();

  let sessionRaw: ActiveSessionPayload | null = null;
  try {
    const localStr =
      localStorage.getItem(ACTIVE_SESSION_KEY) ||
      sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (localStr) {
      sessionRaw = JSON.parse(localStr) as ActiveSessionPayload;
    }
  } catch {
    // Ignore
  }

  if (!sessionRaw) {
    try {
      sessionRaw = (await get<ActiveSessionPayload>(ACTIVE_SESSION_KEY)) || null;
    } catch {
      // Ignore
    }
  }

  if (sessionRaw?.username && accounts[sessionRaw.username]) {
    const account = accounts[sessionRaw.username];
    applyAccountToLocalSettings(account);
    return account;
  }

  // Convenience: if there is exactly 1 saved account on this browser and no explicit logout flag, auto-restore it!
  const explicitLogout = localStorage.getItem('voxread_explicit_logout') === '1';
  const allUsers = Object.values(accounts);
  if (!explicitLogout && allUsers.length === 1) {
    const singleUser = allUsers[0];
    persistActiveSession(singleUser.username, true);
    applyAccountToLocalSettings(singleUser);
    return singleUser;
  }

  return null;
}

/**
 * Immediately saves any change to Gemini API key, model, voice settings, or study stats
 * into the active user's account ("salvar as configurações de primeira").
 */
export async function syncSettingsToActiveAccount(params: {
  username?: string | null;
  providerConfig?: ProviderConfig;
  voiceSettings?: VoiceSettings;
  studyStats?: StudyStats;
  activeDocumentId?: string;
}): Promise<UserAccount | null> {
  const cleanUser = params.username?.trim().toLowerCase();
  if (!cleanUser) return null;

  const accounts = await loadAllAccounts();
  const existing = accounts[cleanUser];
  if (!existing) return null;

  const updated: UserAccount = {
    ...existing,
    geminiApiKey:
      params.providerConfig !== undefined
        ? params.providerConfig.apiKeys.gemini || ''
        : existing.geminiApiKey,
    geminiModel:
      params.providerConfig !== undefined
        ? params.providerConfig.selectedModels.gemini || 'gemini-3.5-flash-lite'
        : existing.geminiModel,
    aiSanitizePdf:
      params.providerConfig?.aiSanitizePdf !== undefined
        ? params.providerConfig.aiSanitizePdf
        : existing.aiSanitizePdf,
    voiceSettings: params.voiceSettings || existing.voiceSettings,
    studyStats: params.studyStats || existing.studyStats,
    activeDocumentId: params.activeDocumentId || existing.activeDocumentId,
  };

  accounts[cleanUser] = updated;
  await saveAccountsMap(accounts);
  return updated;
}

export async function logoutActiveAccount(): Promise<void> {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    localStorage.setItem('voxread_explicit_logout', '1');
  } catch {
    // Ignore
  }
  try {
    await set(ACTIVE_SESSION_KEY, null);
  } catch {
    // Ignore
  }
}

export function applyAccountToLocalSettings(account: UserAccount): {
  providerConfig: ProviderConfig;
  voiceSettings: VoiceSettings;
  studyStats: StudyStats;
} {
  try {
    localStorage.removeItem('voxread_explicit_logout');
  } catch {
    // Ignore
  }

  const defaultProvider = createDefaultProviderConfig();
  const providerConfig: ProviderConfig = {
    ...defaultProvider,
    providerId: 'gemini',
    apiKeys: {
      gemini: account.geminiApiKey || '',
    },
    selectedModels: {
      gemini: account.geminiModel || 'gemini-3.5-flash-lite',
    },
    aiSanitizePdf:
      account.aiSanitizePdf !== undefined ? account.aiSanitizePdf : true,
  };

  const voiceSettings: VoiceSettings = {
    ...createDefaultVoiceSettings(),
    ...(account.voiceSettings || {}),
  };

  const studyStats: StudyStats = account.studyStats || {
    activeReadingSeconds: 0,
    sentencesReadCount: 0,
    flashcardsReviewedCount: 0,
    topicsCompletedCount: 0,
  };

  saveProviderConfig(providerConfig);
  saveVoiceSettings(voiceSettings);
  saveStudyStats(studyStats);

  return { providerConfig, voiceSettings, studyStats };
}
