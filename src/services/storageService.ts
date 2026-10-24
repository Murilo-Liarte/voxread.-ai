import { get, set } from 'idb-keyval';
import { createDefaultProviderConfig } from './llmService';
import type {
  ConversationMessage,
  PDFDocumentData,
  ProviderConfig,
  VoiceSettings,
} from '../types';

const PROVIDER_CONFIG_KEY = 'voxread_provider_config_v1';
const VOICE_SETTINGS_KEY = 'voxread_voice_settings_v1';
const ACTIVE_DOC_IDB_KEY = 'voxread_active_pdf_doc_v1';
const CONVERSATION_IDB_KEY = 'voxread_conversation_history_v1';

export function loadProviderConfig(): ProviderConfig {
  try {
    const raw = localStorage.getItem(PROVIDER_CONFIG_KEY);
    if (!raw) return createDefaultProviderConfig();
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    const defaults = createDefaultProviderConfig();
    return {
      providerId: parsed.providerId || defaults.providerId,
      apiKeys: { ...defaults.apiKeys, ...(parsed.apiKeys || {}) },
      selectedModels: { ...defaults.selectedModels, ...(parsed.selectedModels || {}) },
      customBaseUrls: { ...defaults.customBaseUrls, ...(parsed.customBaseUrls || {}) },
    };
  } catch {
    return createDefaultProviderConfig();
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  try {
    localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Não foi possível salvar configuração de API no localStorage:', err);
  }
}

export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    ttsEngine: 'browser',
    browserVoiceURI: '',
    cloudVoiceId: 'nova',
    rate: 1.05,
    pitch: 1.0,
    autoResumeAfterAnswer: true,
    proactivePageSummary: false,
    openAiTtsApiKey: '',
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return createDefaultVoiceSettings();
    return { ...createDefaultVoiceSettings(), ...JSON.parse(raw) };
  } catch {
    return createDefaultVoiceSettings();
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Não foi possível salvar configurações de voz:', err);
  }
}

export async function saveActiveDocument(doc: PDFDocumentData): Promise<void> {
  try {
    await set(ACTIVE_DOC_IDB_KEY, doc);
  } catch (err) {
    console.warn('Falha ao persistir PDF no IndexedDB:', err);
  }
}

export async function loadActiveDocument(): Promise<PDFDocumentData | null> {
  try {
    const doc = await get<PDFDocumentData>(ACTIVE_DOC_IDB_KEY);
    return doc || null;
  } catch {
    return null;
  }
}

export async function saveConversationHistory(
  docId: string,
  messages: ConversationMessage[]
): Promise<void> {
  try {
    await set(`${CONVERSATION_IDB_KEY}_${docId}`, messages);
  } catch (err) {
    console.warn('Falha ao salvar histórico de conversa:', err);
  }
}

export async function loadConversationHistory(
  docId: string
): Promise<ConversationMessage[]> {
  try {
    const list = await get<ConversationMessage[]>(`${CONVERSATION_IDB_KEY}_${docId}`);
    return list || [];
  } catch {
    return [];
  }
}
