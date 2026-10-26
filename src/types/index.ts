export type LLMProviderId = 'gemini';

export interface GeminiModelOption {
  id: string;
  label: string;
  description?: string;
  freeTierBadge?: string;
}

export interface ProviderMetadata {
  id: LLMProviderId;
  name: string;
  shortName: string;
  badgeColor: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: GeminiModelOption[];
  keyPlaceholder: string;
  docsUrl: string;
  supportsCloudTts?: boolean;
}

export interface ProviderConfig {
  providerId: LLMProviderId;
  apiKeys: Record<LLMProviderId, string>;
  selectedModels: Record<LLMProviderId, string>;
  customBaseUrls: Partial<Record<LLMProviderId, string>>;
  aiSanitizePdf?: boolean;
}

export type TtsEngineMode = 'piper_wasm';

export type PiperVoiceId =
  | 'pt_BR-faber-medium'
  | 'pt_BR-edresson-low'
  | 'pt_PT-tugão-medium';

export interface VoiceModelDownloadProgress {
  engine: TtsEngineMode;
  voiceId: string;
  percent: number;
  statusText: string;
  isDownloading: boolean;
  isReady: boolean;
}

export interface EngineStatus {
  requested: TtsEngineMode;
  active: TtsEngineMode | null;
  voiceLabel: string;
  state: 'idle' | 'loading' | 'playing' | 'failed' | 'fallback';
  error?: string;
  latencyMs?: number;
}

export interface VoiceDiagnosticResult {
  engine: TtsEngineMode;
  voiceLabel: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  audioBlob?: Blob;
}

export interface VoiceSettings {
  settingsVersion?: number;
  ttsEngine: TtsEngineMode;
  piperVoiceId: PiperVoiceId;
  allowSystemVoiceFallback: boolean;
  rate: number; // 0.75 to 2.0
  pitch: number; // 0.8 to 1.2
  expressiveProsody: boolean;
  prefetchNextSentence: boolean;
  autoResumeAfterAnswer: boolean;
  autoFlashcardsOnTopicEnd: boolean;
  sanitizeHeadersFooters: boolean;
}

/**
 * Normalized bounding box ratios (0..1 relative to page width & height)
 * so the highlighter overlay scales accurately at any zoom level.
 */
export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SentenceBlockType = 'heading' | 'normal' | 'alert' | 'question_item';

export interface AiExtractedStudyBlock {
  pageNumber: number;
  blockType: SentenceBlockType;
  topicTitle?: string;
  text: string;
  bboxes?: NormalizedBBox[];
}

export interface PDFSentence {
  id: string;
  globalIndex: number;
  pageNumber: number;
  paragraphIndex: number;
  sentenceInParagraph: number;
  text: string;
  blockType: SentenceBlockType;
  topicId: string;
  topicTitle: string;
  isTopicEnd?: boolean;
  bboxes: NormalizedBBox[];
}

export interface PDFTopic {
  id: string;
  title: string;
  pageNumber: number;
  startSentenceIndex: number;
  endSentenceIndex: number;
}

export interface PDFPageContent {
  pageNumber: number;
  rawText: string;
  paragraphs: string[];
  sentenceIds: string[];
  ignoredHeaderFooterCount: number;
}

export interface PDFDocumentData {
  id: string;
  fileName: string;
  fileSize: number;
  totalPages: number;
  originalTotalPages?: number;
  selectedStartPage?: number;
  selectedEndPage?: number;
  cleaningMode?: 'ai' | 'basic';
  pdfFingerprint?: string;
  pendingPages?: number[];
  uploadedAt: number;
  pages: PDFPageContent[];
  sentences: PDFSentence[];
  topics: PDFTopic[];
  currentSentenceIndex: number;
  removedNoiseCount?: number;
  aiCleaned?: boolean;
  pdfBytes?: ArrayBuffer;
}

export type ReaderState =
  | 'idle'
  | 'reading'
  | 'paused'
  | 'listening_user'
  | 'thinking_ai'
  | 'speaking_ai'
  | 'flashcard_pause';

export type ViewMode = 'pdf' | 'split' | 'reader';

export type SidebarTab = 'flashcards' | 'summary' | 'professor';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  pageNumber: number;
  sentenceIndex: number;
  sentenceExcerpt: string;
  inputSource?: 'voice' | 'text' | 'proactive';
  providerLabel?: string;
}

export interface FlashcardItem {
  id: string;
  topicId: string;
  topicTitle: string;
  pageNumber: number;
  question: string;
  answer: string;
  bancaTip?: string;
  revealed: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface SchematicSummary {
  id: string;
  generatedAt: number;
  scopeTitle: string;
  markdownContent: string;
  definitions: string[];
  exceptionsAndDeadlines: string[];
  bancaTraps: string[];
}

export interface StudyStats {
  activeReadingSeconds: number;
  sentencesReadCount: number;
  flashcardsReviewedCount: number;
  topicsCompletedCount: number;
}

export interface UserAccount {
  username: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt: number;
  geminiApiKey: string;
  geminiModel: string;
  aiSanitizePdf: boolean;
  voiceSettings: VoiceSettings;
  studyStats: StudyStats;
  activeDocumentId?: string;
}

export interface PdfLibraryItemSummary {
  id: string;
  ownerUsername: string;
  fileName: string;
  fileSize: number;
  totalPages: number;
  originalTotalPages?: number;
  selectedStartPage?: number;
  selectedEndPage?: number;
  cleaningMode?: 'ai' | 'basic';
  uploadedAt: number;
  lastReadAt: number;
  currentSentenceIndex: number;
  totalSentences: number;
  currentPage: number;
  progressPercent: number;
  removedNoiseCount: number;
  aiCleaned: boolean;
}
