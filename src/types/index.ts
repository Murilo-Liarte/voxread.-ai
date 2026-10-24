export type LLMProviderId =
  | 'gemini'
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'kimi'
  | 'glm'
  | 'custom';

export interface ProviderMetadata {
  id: LLMProviderId;
  name: string;
  shortName: string;
  badgeColor: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: { id: string; label: string; description?: string }[];
  keyPlaceholder: string;
  docsUrl: string;
  supportsCloudTts?: boolean;
}

export interface ProviderConfig {
  providerId: LLMProviderId;
  apiKeys: Record<LLMProviderId, string>;
  selectedModels: Record<LLMProviderId, string>;
  customBaseUrls: Partial<Record<LLMProviderId, string>>;
}

export type TtsEngineMode = 'browser' | 'openai_cloud';

export interface VoiceSettings {
  ttsEngine: TtsEngineMode;
  browserVoiceURI: string;
  cloudVoiceId: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  rate: number; // 0.75 to 2.0
  pitch: number; // 0.8 to 1.2
  autoResumeAfterAnswer: boolean;
  proactivePageSummary: boolean;
  openAiTtsApiKey?: string;
}

export interface PDFSentence {
  id: string;
  globalIndex: number;
  pageNumber: number;
  paragraphIndex: number;
  sentenceInParagraph: number;
  text: string;
}

export interface PDFPageContent {
  pageNumber: number;
  rawText: string;
  paragraphs: string[];
  sentenceIds: string[];
}

export interface PDFDocumentData {
  id: string;
  fileName: string;
  fileSize: number;
  totalPages: number;
  uploadedAt: number;
  pages: PDFPageContent[];
  sentences: PDFSentence[];
  currentSentenceIndex: number;
  pdfBytes?: ArrayBuffer;
}

export type ReaderState =
  | 'idle'
  | 'reading'
  | 'paused'
  | 'listening_user'
  | 'thinking_ai'
  | 'speaking_ai';

export type ViewMode = 'split' | 'reader' | 'pdf';

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
