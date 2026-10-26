import { del, get, set } from 'idb-keyval';
import { createDefaultProviderConfig } from './llmService';
import type {
  ConversationMessage,
  FlashcardItem,
  PDFDocumentData,
  PdfLibraryItemSummary,
  ProviderConfig,
  SchematicSummary,
  StudyStats,
  VoiceSettings,
} from '../types';

const PROVIDER_CONFIG_KEY = 'voxread_provider_config_v3';
const VOICE_SETTINGS_KEY = 'voxread_voice_settings_v3';
const STUDY_STATS_KEY = 'voxread_study_stats_v1';
const ACTIVE_DOC_IDB_KEY = 'voxread_active_pdf_doc_v2';
const CONVERSATION_IDB_KEY = 'voxread_conversation_history_v2';
const FLASHCARDS_IDB_KEY = 'voxread_flashcards_v1';
const SUMMARY_IDB_KEY = 'voxread_summary_v1';
const LIBRARY_INDEX_PREFIX = 'voxread_pdf_library_index_';
const LIBRARY_DOC_PREFIX = 'voxread_pdf_library_doc_';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = createMemoryStorage();
  }
  if (typeof globalThis.sessionStorage === 'undefined') {
    (globalThis as any).sessionStorage = createMemoryStorage();
  }
}

export function loadProviderConfig(): ProviderConfig {
  try {
    const raw =
      localStorage.getItem(PROVIDER_CONFIG_KEY) ||
      localStorage.getItem('voxread_provider_config_v2');
    if (!raw) return createDefaultProviderConfig();
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    const defaults = createDefaultProviderConfig();
    const savedGeminiModel = parsed.selectedModels?.gemini;
    return {
      providerId: 'gemini',
      apiKeys: {
        gemini: parsed.apiKeys?.gemini || '',
      },
      selectedModels: {
        gemini: savedGeminiModel || defaults.selectedModels.gemini,
      },
      customBaseUrls: {
        gemini: parsed.customBaseUrls?.gemini,
      },
      aiSanitizePdf:
        parsed.aiSanitizePdf !== undefined ? parsed.aiSanitizePdf : true,
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

const CURRENT_VOICE_SETTINGS_VERSION = 4;

export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    settingsVersion: CURRENT_VOICE_SETTINGS_VERSION,
    ttsEngine: 'piper_wasm',
    piperVoiceId: 'pt_BR-faber-medium',
    allowSystemVoiceFallback: false,
    rate: 1.05,
    pitch: 1.02,
    expressiveProsody: true,
    prefetchNextSentence: true,
    autoResumeAfterAnswer: true,
    autoFlashcardsOnTopicEnd: true,
    sanitizeHeadersFooters: true,
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw =
      localStorage.getItem(VOICE_SETTINGS_KEY) ||
      localStorage.getItem('voxread_voice_settings_v2');
    if (!raw) return createDefaultVoiceSettings();
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const defaults = createDefaultVoiceSettings();
    const merged: VoiceSettings = {
      ...defaults,
      ...parsed,
      ttsEngine: 'piper_wasm',
      piperVoiceId: parsed.piperVoiceId || defaults.piperVoiceId,
    };

    if (
      !parsed.settingsVersion ||
      parsed.settingsVersion < CURRENT_VOICE_SETTINGS_VERSION
    ) {
      merged.settingsVersion = CURRENT_VOICE_SETTINGS_VERSION;
      saveVoiceSettings(merged);
    }

    return merged;
  } catch {
    return createDefaultVoiceSettings();
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    localStorage.setItem(
      VOICE_SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        settingsVersion: CURRENT_VOICE_SETTINGS_VERSION,
      })
    );
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
  if (typeof indexedDB === 'undefined') return;
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

function getLibraryScopeKey(username?: string | null): string {
  const clean = (username || 'default_guest').trim().toLowerCase();
  return `${LIBRARY_INDEX_PREFIX}${clean}`;
}

function getLibraryDocKey(username: string | null | undefined, docId: string): string {
  const clean = (username || 'default_guest').trim().toLowerCase();
  return `${LIBRARY_DOC_PREFIX}${clean}_${docId}`;
}

export function buildLibrarySummaryFromDoc(
  doc: PDFDocumentData,
  username?: string | null
): PdfLibraryItemSummary {
  const totalSentences = Math.max(1, doc.sentences.length);
  const currentIdx = Math.max(
    0,
    Math.min(doc.currentSentenceIndex || 0, totalSentences - 1)
  );
  const currentSent = doc.sentences[currentIdx] || doc.sentences[0];
  const progressPercent =
    totalSentences <= 1
      ? 100
      : Math.min(100, Math.round(((currentIdx + 1) / totalSentences) * 100));

  return {
    id: doc.id,
    ownerUsername: (username || 'default_guest').trim().toLowerCase(),
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    totalPages: doc.totalPages,
    originalTotalPages: doc.originalTotalPages || doc.totalPages,
    selectedStartPage: doc.selectedStartPage || 1,
    selectedEndPage: doc.selectedEndPage || doc.totalPages,
    uploadedAt: doc.uploadedAt || Date.now(),
    lastReadAt: Date.now(),
    currentSentenceIndex: currentIdx,
    totalSentences: doc.sentences.length,
    currentPage: currentSent?.pageNumber || doc.selectedStartPage || 1,
    progressPercent,
    removedNoiseCount: doc.removedNoiseCount || 0,
    aiCleaned: Boolean(doc.aiCleaned),
    cleaningMode: doc.cleaningMode || (doc.aiCleaned ? 'ai' : 'basic'),
  };
}

/**
 * Loads the user's personal PDF reading list sorted by most recently read.
 */
export async function loadUserPdfLibrary(
  username?: string | null
): Promise<PdfLibraryItemSummary[]> {
  const key = getLibraryScopeKey(username);
  try {
    const idbList = await get<PdfLibraryItemSummary[]>(key);
    if (Array.isArray(idbList)) {
      return idbList.sort((a, b) => b.lastReadAt - a.lastReadAt);
    }
  } catch {
    // Fallback to localStorage for environments without IndexedDB
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as PdfLibraryItemSummary[];
      return parsed.sort((a, b) => b.lastReadAt - a.lastReadAt);
    }
  } catch {
    // Ignore
  }

  return [];
}

async function persistLibraryIndex(
  username: string | null | undefined,
  list: PdfLibraryItemSummary[]
): Promise<void> {
  const key = getLibraryScopeKey(username);
  const sorted = [...list].sort((a, b) => b.lastReadAt - a.lastReadAt);
  try {
    localStorage.setItem(key, JSON.stringify(sorted));
  } catch {
    // Ignore
  }
  try {
    await set(key, sorted);
  } catch {
    // Ignore
  }
}

/**
 * Saves or updates a PDF document in the user's reading library.
 */
export async function saveDocumentToUserLibrary(
  doc: PDFDocumentData,
  username?: string | null
): Promise<PdfLibraryItemSummary[]> {
  if (doc.id === 'demo-concursos-direito-adm') {
    return loadUserPdfLibrary(username);
  }

  const summary = buildLibrarySummaryFromDoc(doc, username);
  const existingList = await loadUserPdfLibrary(username);
  const filtered = existingList.filter((item) => item.id !== doc.id);
  const nextList = [summary, ...filtered];

  await persistLibraryIndex(username, nextList);

  try {
    await set(getLibraryDocKey(username, doc.id), doc);
  } catch {
    // Ignore in environments without IDB
  }

  await saveActiveDocument(doc);
  return nextList;
}

/**
 * Updates reading progress (sentence index, page, percentage) in the user's PDF list.
 */
export async function updateDocumentReadingProgress(
  doc: PDFDocumentData,
  sentenceIndex: number,
  username?: string | null
): Promise<PdfLibraryItemSummary[]> {
  const updatedDoc: PDFDocumentData = {
    ...doc,
    currentSentenceIndex: sentenceIndex,
  };
  await saveActiveDocument(updatedDoc);

  if (doc.id === 'demo-concursos-direito-adm') {
    return loadUserPdfLibrary(username);
  }

  const summary = buildLibrarySummaryFromDoc(updatedDoc, username);
  const existingList = await loadUserPdfLibrary(username);
  const filtered = existingList.filter((item) => item.id !== doc.id);
  const nextList = [summary, ...filtered];

  await persistLibraryIndex(username, nextList);
  try {
    await set(getLibraryDocKey(username, doc.id), updatedDoc);
  } catch {
    // Ignore
  }

  return nextList;
}

/**
 * Loads a specific PDF from the user's library by ID.
 */
export async function loadLibraryDocumentById(
  docId: string,
  username?: string | null
): Promise<PDFDocumentData | null> {
  try {
    const doc = await get<PDFDocumentData>(getLibraryDocKey(username, docId));
    if (doc) return doc;
  } catch {
    // Ignore
  }
  const active = await loadActiveDocument();
  if (active && active.id === docId) return active;
  return null;
}

/**
 * Removes a PDF from the user's reading list.
 */
export async function deleteDocumentFromLibrary(
  docId: string,
  username?: string | null
): Promise<PdfLibraryItemSummary[]> {
  const existing = await loadUserPdfLibrary(username);
  const nextList = existing.filter((item) => item.id !== docId);
  await persistLibraryIndex(username, nextList);
  try {
    await del(getLibraryDocKey(username, docId));
  } catch {
    // Ignore
  }
  return nextList;
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
