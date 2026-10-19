import { get, set } from 'idb-keyval';
import { createDefaultProviderConfig } from './llmService';
import type {
  ConversationMessage,
  FlashcardItem,
  PDFDocumentData,
  ProviderConfig,
  SchematicSummary,
  StudyStats,
  VoiceSettings,
} from '../types';

const PROVIDER_CONFIG_KEY = 'voxread_provider_config_v2';
const VOICE_SETTINGS_KEY = 'voxread_voice_settings_v2';
const STUDY_STATS_KEY = 'voxread_study_stats_v1';
const ACTIVE_DOC_IDB_KEY = 'voxread_active_pdf_doc_v2';
const CONVERSATION_IDB_KEY = 'voxread_conversation_history_v2';
const FLASHCARDS_IDB_KEY = 'voxread_flashcards_v1';
const SUMMARY_IDB_KEY = 'voxread_summary_v1';

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
    console.warn('Não foi possível salvar configuração de API:', err);
  }
}

export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    ttsEngine: 'msedge_tts',
    edgeVoiceId: 'pt-BR-FranciscaNeural',
    browserVoiceURI: '',
    rate: 1.05,
    pitch: 1.0,
    expressiveProsody: true,
    autoResumeAfterAnswer: true,
    autoFlashcardsOnTopicEnd: true,
    sanitizeHeadersFooters: true,
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return createDefaultVoiceSettings();
    const parsed = JSON.parse(raw);
    const defaults = createDefaultVoiceSettings();
    const validEngine =
      parsed.ttsEngine === 'msedge_tts' || parsed.ttsEngine === 'edge_tts'
        ? parsed.ttsEngine
        : 'msedge_tts';
    return {
      ...defaults,
      ...parsed,
      ttsEngine: validEngine,
      edgeVoiceId: parsed.edgeVoiceId || defaults.edgeVoiceId,
    };
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

export function loadStudyStats(): StudyStats {
  try {
    const raw = localStorage.getItem(STUDY_STATS_KEY);
    if (!raw) {
      return {
        activeReadingSeconds: 0,
        sentencesReadCount: 0,
        flashcardsReviewedCount: 0,
        topicsCompletedCount: 0,
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      activeReadingSeconds: 0,
      sentencesReadCount: 0,
      flashcardsReviewedCount: 0,
      topicsCompletedCount: 0,
    };
  }
}

export function saveStudyStats(stats: StudyStats): void {
  try {
    localStorage.setItem(STUDY_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore
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
    console.warn('Falha ao salvar histórico:', err);
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

export async function saveFlashcards(
  docId: string,
  cards: FlashcardItem[]
): Promise<void> {
  try {
    await set(`${FLASHCARDS_IDB_KEY}_${docId}`, cards);
  } catch {
    // Ignore
  }
}

export async function loadFlashcards(docId: string): Promise<FlashcardItem[]> {
  try {
    return (await get<FlashcardItem[]>(`${FLASHCARDS_IDB_KEY}_${docId}`)) || [];
  } catch {
    return [];
  }
}

export async function saveSchematicSummary(
  docId: string,
  summary: SchematicSummary | null
): Promise<void> {
  try {
    await set(`${SUMMARY_IDB_KEY}_${docId}`, summary);
  } catch {
    // Ignore
  }
}

export async function loadSchematicSummary(
  docId: string
): Promise<SchematicSummary | null> {
  try {
    return (await get<SchematicSummary>(`${SUMMARY_IDB_KEY}_${docId}`)) || null;
  } catch {
    return null;
  }
}
