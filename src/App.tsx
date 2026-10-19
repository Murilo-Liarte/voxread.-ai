import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { NeuroscienceModal } from './components/NeuroscienceModal';
import { PdfOriginalViewer } from './components/PdfOriginalViewer';
import { FocusedReaderView } from './components/FocusedReaderView';
import { VoiceControlBar } from './components/VoiceControlBar';
import { AssistantSidebar } from './components/AssistantSidebar';
import { createDemoDocument, parsePdfArrayBuffer } from './services/pdfService';
import { speechService } from './services/speechService';
import {
  buildReadingSystemPrompt,
  callLlmAssistant,
  generateSchematicSummary,
  generateTopicFlashcards,
  PROVIDERS_CATALOG,
} from './services/llmService';
import {
  loadActiveDocument,
  loadConversationHistory,
  loadFlashcards,
  loadProviderConfig,
  loadSchematicSummary,
  loadStudyStats,
  loadVoiceSettings,
  saveActiveDocument,
  saveConversationHistory,
  saveFlashcards,
  saveProviderConfig,
  saveSchematicSummary,
  saveStudyStats,
  saveVoiceSettings,
} from './services/storageService';
import type {
  ConversationMessage,
  FlashcardItem,
  PDFDocumentData,
  PDFSentence,
  ProviderConfig,
  ReaderState,
  SchematicSummary,
  SidebarTab,
  StudyStats,
  ViewMode,
  VoiceSettings,
} from './types';

const SPEED_STEPS = [0.85, 1.0, 1.15, 1.3, 1.5, 1.75];

export const App: React.FC = () => {
  const [documentData, setDocumentData] = useState<PDFDocumentData>(() =>
    createDemoDocument()
  );
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [wordProgressRatio, setWordProgressRatio] = useState<number>(0);
  const [readerState, setReaderState] = useState<ReaderState>('idle');
  // Central Area defaults to PDF Viewer with BBox Highlighter Overlay
  const [viewMode, setViewMode] = useState<ViewMode>('pdf');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('flashcards');
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [isNeuroModalOpen, setIsNeuroModalOpen] = useState<boolean>(false);
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
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Refs to avoid stale closures inside async TTS/STT callbacks
  const docRef = useRef<PDFDocumentData>(documentData);
  const sentenceIdxRef = useRef<number>(currentSentenceIndex);
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  const providerConfigRef = useRef<ProviderConfig>(providerConfig);
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
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    flashcardsRef.current = flashcards;
  }, [flashcards]);

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

  // Restore saved PDF, flashcards, summary and conversation from IndexedDB
  useEffect(() => {
    let mounted = true;
    loadActiveDocument().then(async (savedDoc) => {
      if (!mounted || !savedDoc || !savedDoc.topics) return;
      setDocumentData(savedDoc);
      const savedIdx = Math.min(
        savedDoc.currentSentenceIndex || 0,
        Math.max(0, savedDoc.sentences.length - 1)
      );
      setCurrentSentenceIndex(savedIdx);
      const [hist, savedCards, savedSum] = await Promise.all([
        loadConversationHistory(savedDoc.id),
        loadFlashcards(savedDoc.id),
        loadSchematicSummary(savedDoc.id),
      ]);
      if (mounted) {
        setMessages(hist);
        setFlashcards(savedCards);
        setSchematicSummary(savedSum);
      }
    });

    return () => {
      mounted = false;
      speechService.stopSpeaking();
      speechService.stopListening();
    };
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
          return updated;
        });

        // Read the first Flashcard question aloud!
        if (generated[0]) {
          speechService.speak({
            text: `Fim do tópico ${topic.title}. Hora do Active Recall! Primeira pergunta: ${generated[0].question}`,
            blockType: 'heading',
            settings: voiceSettingsRef.current,
            geminiKeyFallback: providerConfigRef.current.apiKeys.gemini,
            openAiKeyFallback: providerConfigRef.current.apiKeys.openai,
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

      saveActiveDocument({ ...doc, currentSentenceIndex: boundedIndex });

      speechService.speak({
        text: sentence.text,
        blockType: sentence.blockType,
        settings: voiceSettingsRef.current,
        geminiKeyFallback: providerConfigRef.current.apiKeys.gemini,
        openAiKeyFallback: providerConfigRef.current.apiKeys.openai,
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

          // If we reached the end of the document, generate the Schematic Summary!
          if (nextIdx >= currentDoc.sentences.length) {
            setReaderState('idle');
            handleGenerateSummary();
            return;
          }

          // If we reached the end of a strategic topic, pause and launch Active Recall Flashcards!
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

      // Check voice commands for Flashcard reveal or resume
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
            geminiKeyFallback: providerConfigRef.current.apiKeys.gemini,
            openAiKeyFallback: providerConfigRef.current.apiKeys.openai,
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
      const providerMeta = PROVIDERS_CATALOG[config.providerId];

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

      if (!config.apiKeys[config.providerId]?.trim()) {
        setReaderState('paused');
        setErrorBanner(
          `Conecte sua API Key do ${providerMeta.name} para o Professor IA explicar com analogias e dicas de banca.`
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
          geminiKeyFallback: config.apiKeys.gemini,
          openAiKeyFallback: config.apiKeys.openai,
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
        setErrorBanner(err?.message || 'Erro ao obter explicação do Professor.');
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
        setReaderState((prev) => (prev === 'listening_user' ? 'paused' : prev));
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

  // Upload a new PDF file
  const handleUploadPdf = async (file: File) => {
    try {
      speechService.stopSpeaking();
      speechService.stopListening();
      setReaderState('idle');
      setIsLoadingPdf(true);
      setErrorBanner(null);

      const buffer = await file.arrayBuffer();
      const parsedDoc = await parsePdfArrayBuffer(
        buffer,
        file.name,
        file.size,
        voiceSettings.sanitizeHeadersFooters
      );

      setDocumentData(parsedDoc);
      setCurrentSentenceIndex(0);
      setWordProgressRatio(0);
      setMessages([]);
      setFlashcards([]);
      setSchematicSummary(null);
      await saveActiveDocument(parsedDoc);
      await saveConversationHistory(parsedDoc.id, []);
      await saveFlashcards(parsedDoc.id, []);
      await saveSchematicSummary(parsedDoc.id, null);
    } catch (err: any) {
      setErrorBanner(
        `Erro ao processar o arquivo PDF "${file.name}": ${
          err?.message || 'Arquivo inválido.'
        }`
      );
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleSelectSentence = (globalIndex: number, autoPlay = true) => {
    setCurrentSentenceIndex(globalIndex);
    setWordProgressRatio(0);
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

    if (readerState === 'reading') {
      speakSentenceAtIndex(currentSentenceIndex);
    }
  };

  const currentSentence =
    documentData.sentences[currentSentenceIndex] || documentData.sentences[0];
  const currentPage = currentSentence?.pageNumber || 1;
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
              Extração automática de coordenadas BBox, filtro Estratégia/Gran e divisão de tópicos
            </p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        fileName={documentData.fileName}
        totalPages={documentData.totalPages}
        currentPage={currentPage}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        providerConfig={providerConfig}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNeuroscience={() => setIsNeuroModalOpen(true)}
        onUploadPdf={handleUploadPdf}
        isLoadingPdf={isLoadingPdf}
        isAiPanelOpen={isAiPanelOpen}
        onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
        badgeCount={flashcards.filter((f) => !f.difficulty).length || messages.length}
      />

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
                ? '👨‍🏫 Professor analisando sua dúvida...'
                : `👨‍🏫 Professor: "${latestAiMessage?.content || 'Explicando em voz alta...'}"`}
            </p>
            <span className="text-[11px] font-semibold text-indigo-300 shrink-0 underline">
              Abrir
            </span>
          </div>
        )}

      {/* Main 3-Area Study Dashboard: Central PDF/Reader + Right Panel (Flashcards/Summary/Professor) */}
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
                onTriggerTopicFlashcards={(tId) => handleTriggerTopicFlashcards(tId)}
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
              geminiKeyFallback: providerConfig.apiKeys.gemini,
              openAiKeyFallback: providerConfig.apiKeys.openai,
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
        totalPages={documentData.totalPages}
        speechRate={voiceSettings.rate}
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
        onInterruptWithVoice={handleInterruptWithVoice}
        onStopVoiceListening={handleStopVoiceListening}
        onResumeReadingNow={() => speakSentenceAtIndex(currentSentenceIndex)}
      />

      {/* Expressive Voice & Multi-LLM Settings Modal */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        providerConfig={providerConfig}
        onSaveProviderConfig={(newCfg) => {
          setProviderConfig(newCfg);
          saveProviderConfig(newCfg);
        }}
        voiceSettings={voiceSettings}
        onSaveVoiceSettings={(newVoice) => {
          setVoiceSettings(newVoice);
          saveVoiceSettings(newVoice);
        }}
      />

      {/* Neuroscience of the Method Modal (Endomarketing & Live Study Telemetry) */}
      <NeuroscienceModal
        isOpen={isNeuroModalOpen}
        onClose={() => setIsNeuroModalOpen(false)}
        stats={studyStats}
      />
    </div>
  );
};

export default App;
