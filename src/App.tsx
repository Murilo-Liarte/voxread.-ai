import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AccountModal } from './components/AccountModal';
import { PdfLibraryModal } from './components/PdfLibraryModal';
import { PdfPageRangeModal } from './components/PdfPageRangeModal';
import { NeuroscienceModal } from './components/NeuroscienceModal';
import { PdfOriginalViewer } from './components/PdfOriginalViewer';
import { FocusedReaderView } from './components/FocusedReaderView';
import { VoiceControlBar } from './components/VoiceControlBar';
import { AssistantSidebar } from './components/AssistantSidebar';
import {
  buildCleanStudyDocumentFromAiBlocks,
  createDemoDocument,
  extractRawPagesForRange,
  inspectPdfTotalPages,
  parsePdfArrayBuffer,
} from './services/pdfService';
import { speechService } from './services/speechService';
import {
  buildReadingSystemPrompt,
  callLlmAssistant,
  extractCleanStudyBlocksWithGemini,
  generateSchematicSummary,
  generateTopicFlashcards,
  PROVIDERS_CATALOG,
  sanitizeDocumentWithGemini,
} from './services/llmService';
import {
  applyAccountToLocalSettings,
  restoreActiveSession,
  syncSettingsToActiveAccount,
} from './services/authService';
import {
  deleteDocumentFromLibrary,
  loadActiveDocument,
  loadConversationHistory,
  loadFlashcards,
  loadLibraryDocumentById,
  loadProviderConfig,
  loadSchematicSummary,
  loadStudyStats,
  loadUserPdfLibrary,
  loadVoiceSettings,
  saveConversationHistory,
  saveDocumentToUserLibrary,
  saveFlashcards,
  saveProviderConfig,
  saveSchematicSummary,
  saveStudyStats,
  saveVoiceSettings,
  updateDocumentReadingProgress,
} from './services/storageService';
import type {
  ConversationMessage,
  EngineStatus,
  FlashcardItem,
  PDFDocumentData,
  PDFSentence,
  PdfLibraryItemSummary,
  ProviderConfig,
  ReaderState,
  SchematicSummary,
  SidebarTab,
  StudyStats,
  UserAccount,
  ViewMode,
  VoiceModelDownloadProgress,
  VoiceSettings,
} from './types';

const SPEED_STEPS = [0.85, 1.0, 1.15, 1.3, 1.5, 1.75];

interface PendingPdfUploadState {
  file: File;
  buffer: ArrayBuffer;
  totalPages: number;
}

export const App: React.FC = () => {
  const [documentData, setDocumentData] = useState<PDFDocumentData>(() =>
    createDemoDocument()
  );
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [wordProgressRatio, setWordProgressRatio] = useState<number>(0);
  const [readerState, setReaderState] = useState<ReaderState>('idle');
  const [viewMode, setViewMode] = useState<ViewMode>('pdf');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('flashcards');
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [isNeuroModalOpen, setIsNeuroModalOpen] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isPdfLibraryOpen, setIsPdfLibraryOpen] = useState<boolean>(false);
  const [activeAccount, setActiveAccount] = useState<UserAccount | null>(null);
  const [pdfLibrary, setPdfLibrary] = useState<PdfLibraryItemSummary[]>([]);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() =>
    loadProviderConfig()
  );
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings()
  );
  const [studyStats, setStudyStats] = useState<StudyStats>(() => loadStudyStats());
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [schematicSummary, setSchematicSummary] =
    useState<SchematicSummary | null>(null);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] =
    useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isAiCleaningPdf, setIsAiCleaningPdf] = useState<boolean>(false);
  const [pendingPdfUpload, setPendingPdfUpload] =
    useState<PendingPdfUploadState | null>(null);
  const [extractionProgressText, setExtractionProgressText] =
    useState<string>('');
  const [extractionProcessedPages, setExtractionProcessedPages] =
    useState<number>(0);
  const [extractionTotalPages, setExtractionTotalPages] = useState<number>(0);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [cleanNoticeBanner, setCleanNoticeBanner] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] =
    useState<VoiceModelDownloadProgress | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  // Refs to avoid stale closures inside async TTS/STT callbacks
  const docRef = useRef<PDFDocumentData>(documentData);
  const sentenceIdxRef = useRef<number>(currentSentenceIndex);
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  const providerConfigRef = useRef<ProviderConfig>(providerConfig);
  const activeAccountRef = useRef<UserAccount | null>(activeAccount);
  const messagesRef = useRef<ConversationMessage[]>(messages);
  const flashcardsRef = useRef<FlashcardItem[]>(flashcards);

  useEffect(() => {
    docRef.current = documentData;
  }, [documentData]);

  useEffect(() => {
    sentenceIdxRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    providerConfigRef.current = providerConfig;
  }, [providerConfig]);

  useEffect(() => {
    activeAccountRef.current = activeAccount;
  }, [activeAccount]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    flashcardsRef.current = flashcards;
  }, [flashcards]);

  // Subscribe to offline neural voice model download progress and live EngineStatus
  useEffect(() => {
    const unsubProgress = speechService.subscribeDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });
    const unsubEngine = speechService.subscribeEngineStatus((status) => {
      setEngineStatus(status);
    });
    return () => {
      unsubProgress();
      unsubEngine();
    };
  }, []);

  // Track active reading time for Neuroscience Dashboard
  useEffect(() => {
    if (readerState !== 'reading') return;
    const timer = setInterval(() => {
      setStudyStats((prev) => {
        const updated = {
          ...prev,
          activeReadingSeconds: prev.activeReadingSeconds + 1,
        };
        saveStudyStats(updated);
        return updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [readerState]);

  // Restore persistent user account session, warm up Piper Neural from permanent cache, and load PDF library
  useEffect(() => {
    let mounted = true;

    const initApp = async () => {
      const restoredAcc = await restoreActiveSession();
      if (!mounted) return;

      let activeUsername: string | null = null;
      let activeVoiceId = voiceSettingsRef.current.piperVoiceId || 'pt_BR-faber-medium';

      if (restoredAcc) {
        setActiveAccount(restoredAcc);
        activeAccountRef.current = restoredAcc;
        activeUsername = restoredAcc.username;
        const applied = applyAccountToLocalSettings(restoredAcc);
        setProviderConfig(applied.providerConfig);
        setVoiceSettings(applied.voiceSettings);
        setStudyStats(applied.studyStats);
        activeVoiceId = applied.voiceSettings.piperVoiceId || activeVoiceId;
      }

      // Warm up Piper Neural from permanent OPFS + CacheStorage on startup so it doesn't reload when clicking Play
      speechService.warmUpPiperOnStartup(activeVoiceId);

      const lib = await loadUserPdfLibrary(activeUsername);
      if (mounted) {
        setPdfLibrary(lib);
      }

      // Load most recently read document from user library or active document
      let targetDoc: PDFDocumentData | null = null;
      if (lib.length > 0) {
        targetDoc = await loadLibraryDocumentById(lib[0].id, activeUsername);
      }
      if (!targetDoc) {
        targetDoc = await loadActiveDocument();
      }

      if (!mounted || !targetDoc || !targetDoc.topics) return;

      setDocumentData(targetDoc);
      const savedIdx = Math.min(
        targetDoc.currentSentenceIndex || 0,
        Math.max(0, targetDoc.sentences.length - 1)
      );
      setCurrentSentenceIndex(savedIdx);

      const [hist, savedCards, savedSum] = await Promise.all([
        loadConversationHistory(targetDoc.id),
        loadFlashcards(targetDoc.id),
        loadSchematicSummary(targetDoc.id),
      ]);

      if (mounted) {
        setMessages(hist);
        setFlashcards(savedCards);
        setSchematicSummary(savedSum);
      }
    };

    initApp();

    return () => {
      mounted = false;
      speechService.stopSpeaking();
      speechService.stopListening();
    };
  }, []);

  const handleLoadDocumentIntoWorkspace = useCallback(
    async (doc: PDFDocumentData) => {
      speechService.stopSpeaking();
      speechService.stopListening();
      setReaderState('idle');
      setDocumentData(doc);
      docRef.current = doc;

      const savedIdx = Math.min(
        doc.currentSentenceIndex || 0,
        Math.max(0, doc.sentences.length - 1)
      );
      setCurrentSentenceIndex(savedIdx);
      sentenceIdxRef.current = savedIdx;
      setWordProgressRatio(0);

      const [hist, savedCards, savedSum] = await Promise.all([
        loadConversationHistory(doc.id),
        loadFlashcards(doc.id),
        loadSchematicSummary(doc.id),
      ]);
      setMessages(hist);
      setFlashcards(savedCards);
      setSchematicSummary(savedSum);
    },
    []
  );

  // Switch active account when user logs in or registers
  const handleAccountSuccess = useCallback(
    async (acc: UserAccount) => {
      setActiveAccount(acc);
      activeAccountRef.current = acc;
      const applied = applyAccountToLocalSettings(acc);
      setProviderConfig(applied.providerConfig);
      setVoiceSettings(applied.voiceSettings);
      setStudyStats(applied.studyStats);

      const lib = await loadUserPdfLibrary(acc.username);
      setPdfLibrary(lib);

      if (lib.length > 0) {
        const latestDoc = await loadLibraryDocumentById(lib[0].id, acc.username);
        if (latestDoc) {
          await handleLoadDocumentIntoWorkspace(latestDoc);
        }
      } else if (docRef.current.id !== 'demo-concursos-direito-adm') {
        const nextLib = await saveDocumentToUserLibrary(
          docRef.current,
          acc.username
        );
        setPdfLibrary(nextLib);
      }
    },
    [handleLoadDocumentIntoWorkspace]
  );

  const handleAccountLogout = useCallback(async () => {
    setActiveAccount(null);
    activeAccountRef.current = null;
    const guestLib = await loadUserPdfLibrary(null);
    setPdfLibrary(guestLib);
  }, []);

  // Generate Flashcards for a specific topic and read the first question aloud
  const handleTriggerTopicFlashcards = useCallback(
    async (topicId?: string, nextSentenceAfterPause?: number) => {
      speechService.stopSpeaking();
      const doc = docRef.current;
      const currentSent = doc.sentences[sentenceIdxRef.current];
      const targetTopicId = topicId || currentSent?.topicId || doc.topics[0]?.id;
      const topic =
        doc.topics.find((t) => t.id === targetTopicId) || doc.topics[0];
      if (!topic) return;

      setReaderState('flashcard_pause');
      setSidebarTab('flashcards');
      setIsAiPanelOpen(true);
      setIsGeneratingFlashcards(true);

      if (typeof nextSentenceAfterPause === 'number') {
        setCurrentSentenceIndex(nextSentenceAfterPause);
        sentenceIdxRef.current = nextSentenceAfterPause;
      }

      try {
        const generated = await generateTopicFlashcards({
          doc,
          topic,
          config: providerConfigRef.current,
        });
        const merged = [
          ...generated,
          ...flashcardsRef.current.filter((c) => c.topicId !== topic.id),
        ];
        setFlashcards(merged);
        flashcardsRef.current = merged;
        saveFlashcards(doc.id, merged);

        setStudyStats((prev) => {
          const updated = {
            ...prev,
            topicsCompletedCount: prev.topicsCompletedCount + 1,
          };
          saveStudyStats(updated);
          syncSettingsToActiveAccount({
            username: activeAccountRef.current?.username,
            studyStats: updated,
          });
          return updated;
        });

        if (generated[0]) {
          speechService.speak({
            text: `Fim do tópico ${topic.title}. Hora do Active Recall! Primeira pergunta: ${generated[0].question}`,
            blockType: 'heading',
            settings: voiceSettingsRef.current,
          });
        }
      } finally {
        setIsGeneratingFlashcards(false);
      }
    },
    []
  );

  // Generate Final Schematic Summary
  const handleGenerateSummary = useCallback(async () => {
    setIsGeneratingSummary(true);
    setSidebarTab('summary');
    setIsAiPanelOpen(true);
    try {
      const summary = await generateSchematicSummary({
        doc: docRef.current,
        config: providerConfigRef.current,
      });
      setSchematicSummary(summary);
      saveSchematicSummary(docRef.current.id, summary);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, []);

  // Core recursive function that reads a sentence and advances to the next
  const speakSentenceAtIndex = useCallback(
    (indexToRead: number) => {
      const doc = docRef.current;
      if (!doc || doc.sentences.length === 0) return;

      const boundedIndex = Math.max(
        0,
        Math.min(indexToRead, doc.sentences.length - 1)
      );
      const sentence = doc.sentences[boundedIndex];
      if (!sentence) return;

      setCurrentSentenceIndex(boundedIndex);
      sentenceIdxRef.current = boundedIndex;
      setWordProgressRatio(0);
      setReaderState('reading');

      updateDocumentReadingProgress(
        doc,
        boundedIndex,
        activeAccountRef.current?.username
      ).then((updatedLib) => {
        setPdfLibrary(updatedLib);
      });

      speechService.speak({
        text: sentence.text,
        blockType: sentence.blockType,
        settings: voiceSettingsRef.current,
        onStart: () => {
          const nextSentence = docRef.current.sentences[boundedIndex + 1];
          if (
            nextSentence &&
            voiceSettingsRef.current.prefetchNextSentence !== false
          ) {
            speechService.prefetch(
              nextSentence.text,
              nextSentence.blockType,
              voiceSettingsRef.current
            );
          }
        },
        onWordProgress: (_charIndex, ratio) => {
          setWordProgressRatio(ratio);
        },
        onEnd: () => {
          setWordProgressRatio(1);
          setStudyStats((prev) => {
            const updated = {
              ...prev,
              sentencesReadCount: prev.sentencesReadCount + 1,
            };
            saveStudyStats(updated);
            return updated;
          });

          const nextIdx = boundedIndex + 1;
          const currentDoc = docRef.current;

          if (nextIdx >= currentDoc.sentences.length) {
            setReaderState('idle');
            handleGenerateSummary();
            return;
          }

          if (
            sentence.isTopicEnd &&
            voiceSettingsRef.current.autoFlashcardsOnTopicEnd
          ) {
            handleTriggerTopicFlashcards(sentence.topicId, nextIdx);
            return;
          }

          speakSentenceAtIndex(nextIdx);
        },
        onError: (errMsg) => {
          setErrorBanner(errMsg);
          setReaderState('paused');
        },
      });
    },
    [handleGenerateSummary, handleTriggerTopicFlashcards]
  );

  // Handles asking the Professor AI (via voice barge-in or text input)
  const triggerAiInteraction = useCallback(
    async (
      questionText: string,
      source: 'voice' | 'text' | 'proactive',
      contextSentenceIdx?: number,
      resumeSentenceIdxAfter?: number
    ) => {
      const cleanQuestion = questionText.trim();
      if (!cleanQuestion) return;

      const lowerCmd = cleanQuestion.toLowerCase();
      if (
        lowerCmd.includes('mostrar resposta') ||
        lowerCmd.includes('revelar resposta')
      ) {
        const firstUnrevealed = flashcardsRef.current.find((c) => !c.revealed);
        if (firstUnrevealed) {
          setFlashcards((prev) =>
            prev.map((c) =>
              c.id === firstUnrevealed.id ? { ...c, revealed: true } : c
            )
          );
          speechService.speak({
            text: firstUnrevealed.answer,
            settings: voiceSettingsRef.current,
          });
          return;
        }
      }

      if (
        lowerCmd === 'continuar' ||
        lowerCmd === 'continuar leitura' ||
        lowerCmd === 'retomar leitura'
      ) {
        speakSentenceAtIndex(sentenceIdxRef.current);
        return;
      }

      speechService.stopSpeaking();
      speechService.stopListening();
      setInterimTranscript('');
      setErrorBanner(null);
      setSidebarTab('professor');

      const doc = docRef.current;
      const targetIdx =
        typeof contextSentenceIdx === 'number'
          ? contextSentenceIdx
          : sentenceIdxRef.current;
      const resumeIdx =
        typeof resumeSentenceIdxAfter === 'number'
          ? resumeSentenceIdxAfter
          : targetIdx;
      const currentSentence = doc.sentences[targetIdx] || doc.sentences[0];
      const config = providerConfigRef.current;
      const providerMeta = PROVIDERS_CATALOG.gemini;

      const userTurn: ConversationMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: cleanQuestion,
        timestamp: Date.now(),
        pageNumber: currentSentence?.pageNumber || 1,
        sentenceIndex: targetIdx,
        sentenceExcerpt: currentSentence?.text || '',
        inputSource: source,
      };

      const updatedWithUser = [...messagesRef.current, userTurn];
      setMessages(updatedWithUser);
      messagesRef.current = updatedWithUser;
      saveConversationHistory(doc.id, updatedWithUser);

      if (!config.apiKeys.gemini?.trim()) {
        setReaderState('paused');
        setErrorBanner(
          'Conecte sua API Key gratuita do Google AI Studio (Gemini) para o Professor explicar com analogias e dicas de banca.'
        );
        setIsSettingsOpen(true);
        return;
      }

      setReaderState('thinking_ai');

      try {
        const systemPrompt = buildReadingSystemPrompt(doc, targetIdx);
        const aiReply = await callLlmAssistant({
          config,
          systemPrompt,
          history: updatedWithUser.slice(0, -1),
          userQuestion: cleanQuestion,
        });

        const assistantTurn: ConversationMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: aiReply,
          timestamp: Date.now(),
          pageNumber: currentSentence?.pageNumber || 1,
          sentenceIndex: targetIdx,
          sentenceExcerpt: currentSentence?.text || '',
          providerLabel: providerMeta.shortName,
        };

        const finalMessages = [...messagesRef.current, assistantTurn];
        setMessages(finalMessages);
        messagesRef.current = finalMessages;
        saveConversationHistory(doc.id, finalMessages);

        setReaderState('speaking_ai');
        speechService.speak({
          text: aiReply,
          settings: voiceSettingsRef.current,
          onEnd: () => {
            if (voiceSettingsRef.current.autoResumeAfterAnswer) {
              speakSentenceAtIndex(resumeIdx);
            } else {
              setReaderState('paused');
            }
          },
          onError: (errMsg) => {
            setErrorBanner(errMsg);
            setReaderState('paused');
          },
        });
      } catch (err: any) {
        setErrorBanner(
          err?.message || 'Erro ao obter explicação do Professor Gemini.'
        );
        setReaderState('paused');
      }
    },
    [speakSentenceAtIndex]
  );

  // Start Voice Interruption ("Modo Professor")
  const handleInterruptWithVoice = useCallback(() => {
    speechService.stopSpeaking();
    setErrorBanner(null);
    setInterimTranscript('');
    setReaderState('listening_user');

    speechService.startListening({
      onInterimResult: (transcript) => {
        setInterimTranscript(transcript);
      },
      onFinalResult: (finalTranscript) => {
        setInterimTranscript('');
        triggerAiInteraction(finalTranscript, 'voice');
      },
      onError: (errMsg) => {
        setErrorBanner(errMsg);
        setReaderState('paused');
      },
      onEnd: () => {
        setReaderState((prev) =>
          prev === 'listening_user' ? 'paused' : prev
        );
      },
    });
  }, [triggerAiInteraction]);

  // Spacebar Shortcut to trigger Professor Voice / Pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (readerState === 'listening_user') {
          speechService.stopListening();
        } else {
          handleInterruptWithVoice();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readerState, handleInterruptWithVoice]);

  const handleTogglePlayPause = () => {
    if (readerState === 'reading' || readerState === 'speaking_ai') {
      speechService.stopSpeaking();
      setReaderState('paused');
    } else {
      speechService.stopListening();
      speakSentenceAtIndex(currentSentenceIndex);
    }
  };

  const handleStopVoiceListening = () => {
    speechService.stopListening();
  };

  // Run Deep Gemini AI Study Content Extraction on the currently open PDF
  const handleRunGeminiCleanOnCurrentDoc = useCallback(async () => {
    if (!providerConfigRef.current.apiKeys.gemini?.trim()) {
      setIsSettingsOpen(true);
      return;
    }
    setIsAiCleaningPdf(true);
    try {
      const currentDoc = docRef.current;
      let cleanedDoc: PDFDocumentData | null = null;

      if (currentDoc.pdfBytes) {
        const startPage = currentDoc.selectedStartPage || 1;
        const endPage = currentDoc.selectedEndPage || currentDoc.totalPages;
        const { rawPages, originalTotalPages } = await extractRawPagesForRange(
          currentDoc.pdfBytes,
          startPage,
          endPage
        );
        const { blocks } = await extractCleanStudyBlocksWithGemini({
          rawPages,
          config: providerConfigRef.current,
        });
        if (blocks.length > 0) {
          cleanedDoc = buildCleanStudyDocumentFromAiBlocks({
            fileName: currentDoc.fileName,
            fileSize: currentDoc.fileSize,
            pdfBytes: currentDoc.pdfBytes,
            originalTotalPages,
            startPage,
            endPage,
            rawPages,
            blocks,
          });
        }
      }

      if (!cleanedDoc) {
        const res = await sanitizeDocumentWithGemini({
          doc: currentDoc,
          config: providerConfigRef.current,
        });
        cleanedDoc = res.cleanedDoc;
      }

      setDocumentData(cleanedDoc);
      docRef.current = cleanedDoc;
      setCurrentSentenceIndex(0);
      const nextLib = await saveDocumentToUserLibrary(
        cleanedDoc,
        activeAccountRef.current?.username
      );
      setPdfLibrary(nextLib);
      setCleanNoticeBanner(
        `✨ Extração Cirúrgica Gemini concluída: apenas o conteúdo puro de estudo (${cleanedDoc.sentences.length} frases e ${cleanedDoc.topics.length} tópicos) foi mantido para leitura!`
      );
    } finally {
      setIsAiCleaningPdf(false);
    }
  }, []);

  // Step 1 of PDF Upload: Inspect total pages and open Page Range Selector Modal (`PdfPageRangeModal`)
  const handleUploadPdf = async (file: File) => {
    try {
      speechService.stopSpeaking();
      speechService.stopListening();
      setReaderState('idle');
      setErrorBanner(null);
      setCleanNoticeBanner(null);
      setIsLoadingPdf(true);

      const buffer = await file.arrayBuffer();
      const totalPages = await inspectPdfTotalPages(buffer);

      setPendingPdfUpload({
        file,
        buffer,
        totalPages,
      });
    } catch (err: any) {
      setErrorBanner(
        `Erro ao ler o arquivo PDF "${file.name}": ${
          err?.message || 'Arquivo inválido.'
        }`
      );
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // Step 2 of PDF Upload: Extract ONLY the selected page range and run Deep Gemini Study Content Extraction
  const handleConfirmPdfPageRange = async (
    startPage: number,
    endPage: number,
    useDeepAi: boolean
  ) => {
    if (!pendingPdfUpload) return;
    const { file, buffer, totalPages: originalTotalPages } = pendingPdfUpload;
    const rangeCount = Math.max(1, endPage - startPage + 1);

    try {
      setIsLoadingPdf(true);
      setIsAiCleaningPdf(true);
      setExtractionProcessedPages(0);
      setExtractionTotalPages(rangeCount);
      setExtractionProgressText(
        `Lendo páginas ${startPage} a ${endPage} do PDF...`
      );

      let finalDoc: PDFDocumentData | null = null;
      const hasGeminiKey = Boolean(
        providerConfigRef.current.apiKeys.gemini?.trim()
      );

      if (useDeepAi && hasGeminiKey) {
        const { rawPages } = await extractRawPagesForRange(
          buffer,
          startPage,
          endPage
        );

        setExtractionProgressText(
          `Gemini IA extraindo apenas o conteúdo de estudo (págs. ${startPage} a ${endPage})...`
        );

        const { blocks } = await extractCleanStudyBlocksWithGemini({
          rawPages,
          config: providerConfigRef.current,
          onProgress: (done, total) => {
            setExtractionProcessedPages(done);
            setExtractionTotalPages(total);
            setExtractionProgressText(
              `Gemini IA limpando logos, capas e rodapés (${done}/${total} págs.)...`
            );
          },
        });

        if (blocks.length > 0) {
          finalDoc = buildCleanStudyDocumentFromAiBlocks({
            fileName: file.name,
            fileSize: file.size,
            pdfBytes: buffer,
            originalTotalPages,
            startPage,
            endPage,
            rawPages,
            blocks,
          });
        }
      }

      // Fallback if no Gemini API key or if AI returned 0 blocks
      if (!finalDoc) {
        setExtractionProgressText(
          `Processando páginas ${startPage} a ${endPage} com filtro de cabeçalhos e rodapés...`
        );
        finalDoc = await parsePdfArrayBuffer(
          buffer,
          file.name,
          file.size,
          true,
          startPage,
          endPage
        );
      }

      setDocumentData(finalDoc);
      docRef.current = finalDoc;
      setCurrentSentenceIndex(0);
      sentenceIdxRef.current = 0;
      setWordProgressRatio(0);
      setMessages([]);
      setFlashcards([]);
      setSchematicSummary(null);
      setPendingPdfUpload(null);

      const nextLib = await saveDocumentToUserLibrary(
        finalDoc,
        activeAccountRef.current?.username
      );
      setPdfLibrary(nextLib);

      await saveConversationHistory(finalDoc.id, []);
      await saveFlashcards(finalDoc.id, []);
      await saveSchematicSummary(finalDoc.id, null);

      setCleanNoticeBanner(
        finalDoc.aiCleaned
          ? `✨ Páginas ${startPage} a ${endPage} extraídas com Gemini IA: apenas o texto puro de estudo (${finalDoc.sentences.length} frases em ${finalDoc.topics.length} tópicos) está destacado para leitura!`
          : `🧹 Páginas ${startPage} a ${endPage} carregadas (${finalDoc.removedNoiseCount || 0} cabeçalhos/rodapés removidos).`
      );
    } catch (err: any) {
      setErrorBanner(
        `Erro ao processar páginas ${startPage} a ${endPage} de "${file.name}": ${
          err?.message || 'Falha na extração.'
        }`
      );
    } finally {
      setIsLoadingPdf(false);
      setIsAiCleaningPdf(false);
      setExtractionProgressText('');
    }
  };

  const handleSelectLibraryDocument = async (docId: string) => {
    const doc = await loadLibraryDocumentById(
      docId,
      activeAccountRef.current?.username
    );
    if (doc) {
      await handleLoadDocumentIntoWorkspace(doc);
    }
  };

  const handleDeleteLibraryDocument = async (docId: string) => {
    const nextLib = await deleteDocumentFromLibrary(
      docId,
      activeAccountRef.current?.username
    );
    setPdfLibrary(nextLib);
  };

  const handleSelectSentence = (globalIndex: number, autoPlay = true) => {
    setCurrentSentenceIndex(globalIndex);
    setWordProgressRatio(0);
    updateDocumentReadingProgress(
      documentData,
      globalIndex,
      activeAccountRef.current?.username
    ).then((lib) => setPdfLibrary(lib));

    if (autoPlay) {
      speakSentenceAtIndex(globalIndex);
    } else {
      speechService.stopSpeaking();
      setReaderState('paused');
    }
  };

  const handleSelectPage = (pageNumber: number) => {
    const firstSentenceOnPage = documentData.sentences.find(
      (s) => s.pageNumber === pageNumber
    );
    if (firstSentenceOnPage) {
      const wasReading = readerState === 'reading';
      setCurrentSentenceIndex(firstSentenceOnPage.globalIndex);
      setWordProgressRatio(0);
      if (wasReading) {
        speakSentenceAtIndex(firstSentenceOnPage.globalIndex);
      }
    }
  };

  const handleAskAboutSentence = (sentence: PDFSentence) => {
    setCurrentSentenceIndex(sentence.globalIndex);
    setSidebarTab('professor');
    setIsAiPanelOpen(true);
    triggerAiInteraction(
      `Professor, explique este trecho com analogia e diga como as bancas cobram: "${sentence.text}"`,
      'text',
      sentence.globalIndex,
      sentence.globalIndex
    );
  };

  const handleCycleSpeed = () => {
    const currentIdx = SPEED_STEPS.findIndex(
      (s) => Math.abs(s - voiceSettings.rate) < 0.04
    );
    const nextRate = SPEED_STEPS[(currentIdx + 1) % SPEED_STEPS.length];
    const updated = { ...voiceSettings, rate: nextRate };
    setVoiceSettings(updated);
    saveVoiceSettings(updated);
    syncSettingsToActiveAccount({
      username: activeAccountRef.current?.username,
      voiceSettings: updated,
    });

    if (readerState === 'reading') {
      speakSentenceAtIndex(currentSentenceIndex);
    }
  };

  const currentSentence =
    documentData.sentences[currentSentenceIndex] || documentData.sentences[0];
  const currentPage =
    currentSentence?.pageNumber || documentData.selectedStartPage || 1;
  const currentTopic =
    documentData.topics.find((t) => t.id === currentSentence?.topicId) ||
    documentData.topics[0];
  const latestAiMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  return (
    <div
      className="h-[100dvh] w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.name.toLowerCase().endsWith('.pdf')) {
          handleUploadPdf(file);
        }
      }}
    >
      {/* Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-indigo-950/80 backdrop-blur-sm border-4 border-dashed border-indigo-400 flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-white mb-2">
              Solte sua apostila PDF aqui
            </p>
            <p className="text-sm text-indigo-200">
              Escolha o intervalo de páginas (ex: 50 a 71) e extraia apenas o conteúdo de estudo com Gemini IA
            </p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        fileName={documentData.fileName}
        totalPages={documentData.selectedEndPage || documentData.totalPages}
        currentPage={currentPage}
        removedNoiseCount={documentData.removedNoiseCount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        providerConfig={providerConfig}
        activeAccount={activeAccount}
        libraryCount={pdfLibrary.length}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onOpenPdfLibrary={() => setIsPdfLibraryOpen(true)}
        onOpenNeuroscience={() => setIsNeuroModalOpen(true)}
        onUploadPdf={handleUploadPdf}
        isLoadingPdf={isLoadingPdf || isAiCleaningPdf}
        isAiPanelOpen={isAiPanelOpen}
        onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
        badgeCount={
          flashcards.filter((f) => !f.difficulty).length || messages.length
        }
      />

      {/* Clean PDF Notification Banner */}
      {cleanNoticeBanner && (
        <div className="px-3 sm:px-6 py-1.5 bg-emerald-950/90 border-b border-emerald-500/30 flex items-center justify-between gap-2 z-20">
          <p className="text-xs text-emerald-200 font-medium">
            {cleanNoticeBanner}
          </p>
          <button
            type="button"
            onClick={() => setCleanNoticeBanner(null)}
            className="text-xs text-emerald-300 hover:text-white font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Explicit Voice Engine Error Banner */}
      {errorBanner && (
        <div className="px-3 sm:px-6 py-2 bg-rose-950/90 border-b border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 z-20">
          <p className="text-xs text-rose-200 font-medium">{errorBanner}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors"
            >
              Configurar Piper / IA
            </button>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="px-2 py-1 text-[11px] text-rose-300 hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Floating Professor Banner when Drawer is Closed on Mobile */}
      {!isAiPanelOpen &&
        (readerState === 'thinking_ai' || readerState === 'speaking_ai') && (
          <div
            onClick={() => {
              setSidebarTab('professor');
              setIsAiPanelOpen(true);
            }}
            className="mx-3 mt-2 px-4 py-2.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 shadow-lg flex items-center justify-between gap-3 cursor-pointer z-10"
          >
            <p className="text-xs text-indigo-100 line-clamp-2">
              {readerState === 'thinking_ai'
                ? '👨‍🏫 Professor Gemini analisando sua dúvida...'
                : `👨‍🏫 Professor: "${latestAiMessage?.content || 'Explicando em voz alta...'}"`}
            </p>
            <span className="text-[11px] font-semibold text-indigo-300 shrink-0 underline">
              Abrir
            </span>
          </div>
        )}

      {/* Main 3-Area Study Dashboard */}
      <main className="flex-1 flex flex-row overflow-hidden min-h-0 relative">
        <div className="flex-1 flex overflow-hidden min-h-0">
          {(viewMode === 'split' || viewMode === 'pdf') && (
            <div
              className={`${
                viewMode === 'split' ? 'hidden md:block md:w-1/2' : 'w-full'
              } h-full overflow-hidden`}
            >
              <PdfOriginalViewer
                documentData={documentData}
                currentPage={currentPage}
                currentSentence={currentSentence}
                wordProgressRatio={wordProgressRatio}
                readerState={readerState}
                onSelectPage={handleSelectPage}
                onSelectSentence={handleSelectSentence}
                onUploadPdf={handleUploadPdf}
              />
            </div>
          )}

          {(viewMode === 'split' || viewMode === 'reader') && (
            <div
              className={`${
                viewMode === 'split' ? 'w-full md:w-1/2' : 'w-full'
              } h-full overflow-hidden`}
            >
              <FocusedReaderView
                documentData={documentData}
                currentSentenceIndex={currentSentenceIndex}
                wordProgressRatio={wordProgressRatio}
                readerState={readerState}
                onSelectSentence={handleSelectSentence}
                onAskAboutSentence={handleAskAboutSentence}
                onTriggerTopicFlashcards={(tId) =>
                  handleTriggerTopicFlashcards(tId)
                }
              />
            </div>
          )}
        </div>

        {/* Right Panel: Flashcards (Active Recall), Schematic Summary & Professor Q&A */}
        <AssistantSidebar
          isOpen={isAiPanelOpen}
          onClose={() => setIsAiPanelOpen(false)}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          messages={messages}
          flashcards={flashcards}
          schematicSummary={schematicSummary}
          isGeneratingFlashcards={isGeneratingFlashcards}
          isGeneratingSummary={isGeneratingSummary}
          currentSentence={currentSentence}
          currentTopic={currentTopic}
          readerState={readerState}
          providerConfig={providerConfig}
          errorBanner={errorBanner}
          onDismissError={() => setErrorBanner(null)}
          onSendTextQuestion={(q) => triggerAiInteraction(q, 'text')}
          onStartVoiceQuestion={handleInterruptWithVoice}
          onJumpToSentence={(idx) => handleSelectSentence(idx, true)}
          onSpeakText={(text) => {
            speechService.speak({
              text,
              settings: voiceSettings,
            });
          }}
          onResumePdfReading={() => speakSentenceAtIndex(currentSentenceIndex)}
          onClearHistory={() => {
            setMessages([]);
            saveConversationHistory(documentData.id, []);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onGenerateTopicFlashcards={() =>
            handleTriggerTopicFlashcards(currentTopic?.id)
          }
          onRevealFlashcard={(cardId) => {
            const updated = flashcards.map((c) =>
              c.id === cardId ? { ...c, revealed: true } : c
            );
            setFlashcards(updated);
            saveFlashcards(documentData.id, updated);
          }}
          onRateFlashcard={(cardId, difficulty) => {
            const updated = flashcards.map((c) =>
              c.id === cardId ? { ...c, difficulty } : c
            );
            setFlashcards(updated);
            saveFlashcards(documentData.id, updated);
            setStudyStats((prev) => {
              const nextStats = {
                ...prev,
                flashcardsReviewedCount: prev.flashcardsReviewedCount + 1,
              };
              saveStudyStats(nextStats);
              syncSettingsToActiveAccount({
                username: activeAccountRef.current?.username,
                studyStats: nextStats,
              });
              return nextStats;
            });
          }}
          onGenerateSummary={handleGenerateSummary}
        />
      </main>

      {/* Bottom Floating Voice & Professor Control Bar */}
      <VoiceControlBar
        readerState={readerState}
        currentSentenceIndex={currentSentenceIndex}
        totalSentences={documentData.sentences.length}
        currentPage={currentPage}
        totalPages={documentData.selectedEndPage || documentData.totalPages}
        speechRate={voiceSettings.rate}
        ttsEngine={voiceSettings.ttsEngine}
        engineStatus={engineStatus}
        downloadProgress={downloadProgress}
        interimTranscript={interimTranscript}
        onTogglePlayPause={handleTogglePlayPause}
        onPrevSentence={() =>
          handleSelectSentence(
            Math.max(0, currentSentenceIndex - 1),
            readerState === 'reading'
          )
        }
        onNextSentence={() =>
          handleSelectSentence(
            Math.min(
              documentData.sentences.length - 1,
              currentSentenceIndex + 1
            ),
            readerState === 'reading'
          )
        }
        onCycleSpeed={handleCycleSpeed}
        onOpenVoiceSettings={() => setIsSettingsOpen(true)}
        onInterruptWithVoice={handleInterruptWithVoice}
        onStopVoiceListening={handleStopVoiceListening}
        onResumeReadingNow={() => speakSentenceAtIndex(currentSentenceIndex)}
      />

      {/* Page Range Selector & Deep Gemini Extraction Modal */}
      <PdfPageRangeModal
        isOpen={Boolean(pendingPdfUpload)}
        fileName={pendingPdfUpload?.file.name || ''}
        fileSize={pendingPdfUpload?.file.size || 0}
        totalPages={pendingPdfUpload?.totalPages || 1}
        hasGeminiApiKey={Boolean(providerConfig.apiKeys.gemini?.trim())}
        isProcessing={isLoadingPdf || isAiCleaningPdf}
        progressText={extractionProgressText}
        processedPages={extractionProcessedPages}
        totalRangePages={extractionTotalPages}
        onConfirmRange={handleConfirmPdfPageRange}
        onCancel={() => {
          if (!isLoadingPdf && !isAiCleaningPdf) {
            setPendingPdfUpload(null);
          }
        }}
        onOpenApiModal={() => setIsSettingsOpen(true)}
      />

      {/* Piper Neural Voice & Google AI Studio Settings Modal */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        providerConfig={providerConfig}
        onSaveProviderConfig={(newCfg) => {
          setProviderConfig(newCfg);
          saveProviderConfig(newCfg);
          syncSettingsToActiveAccount({
            username: activeAccount?.username,
            providerConfig: newCfg,
          }).then((updatedAcc) => {
            if (updatedAcc) setActiveAccount(updatedAcc);
          });
        }}
        voiceSettings={voiceSettings}
        onSaveVoiceSettings={(newVoice) => {
          setVoiceSettings(newVoice);
          saveVoiceSettings(newVoice);
          syncSettingsToActiveAccount({
            username: activeAccount?.username,
            voiceSettings: newVoice,
          }).then((updatedAcc) => {
            if (updatedAcc) setActiveAccount(updatedAcc);
          });
        }}
        downloadProgress={downloadProgress}
        engineStatus={engineStatus}
      />

      {/* User Account Modal (Persistent Login + Instant Settings Save) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        activeAccount={activeAccount}
        providerConfig={providerConfig}
        voiceSettings={voiceSettings}
        pdfLibrary={pdfLibrary}
        onAccountSuccess={handleAccountSuccess}
        onAccountLogout={handleAccountLogout}
        onOpenPdfLibrary={() => setIsPdfLibraryOpen(true)}
      />

      {/* User Personal PDF Reading Library Modal */}
      <PdfLibraryModal
        isOpen={isPdfLibraryOpen}
        onClose={() => setIsPdfLibraryOpen(false)}
        activeAccount={activeAccount}
        activeDocumentId={documentData.id}
        libraryItems={pdfLibrary}
        isLoadingPdf={isLoadingPdf}
        isAiCleaning={isAiCleaningPdf}
        hasGeminiKey={Boolean(providerConfig.apiKeys.gemini?.trim())}
        onSelectLibraryDocument={handleSelectLibraryDocument}
        onDeleteLibraryDocument={handleDeleteLibraryDocument}
        onUploadNewPdf={handleUploadPdf}
        onRunGeminiCleanOnCurrentDoc={handleRunGeminiCleanOnCurrentDoc}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
      />

      {/* Neuroscience of the Method Modal */}
      <NeuroscienceModal
        isOpen={isNeuroModalOpen}
        onClose={() => setIsNeuroModalOpen(false)}
        stats={studyStats}
      />
    </div>
  );
};

export default App;
