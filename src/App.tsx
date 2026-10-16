import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { PdfOriginalViewer } from './components/PdfOriginalViewer';
import { FocusedReaderView } from './components/FocusedReaderView';
import { VoiceControlBar } from './components/VoiceControlBar';
import { AssistantSidebar } from './components/AssistantSidebar';
import { createDemoDocument, parsePdfArrayBuffer } from './services/pdfService';
import { speechService } from './services/speechService';
import {
  buildReadingSystemPrompt,
  callLlmAssistant,
  PROVIDERS_CATALOG,
} from './services/llmService';
import {
  loadActiveDocument,
  loadConversationHistory,
  loadProviderConfig,
  loadVoiceSettings,
  saveActiveDocument,
  saveConversationHistory,
  saveProviderConfig,
  saveVoiceSettings,
} from './services/storageService';
import type {
  ConversationMessage,
  PDFDocumentData,
  PDFSentence,
  ProviderConfig,
  ReaderState,
  ViewMode,
  VoiceSettings,
} from './types';

const SPEED_STEPS = [0.85, 1.0, 1.15, 1.3, 1.5, 1.75];

export const App: React.FC = () => {
  const [documentData, setDocumentData] = useState<PDFDocumentData>(() =>
    createDemoDocument()
  );
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [readerState, setReaderState] = useState<ReaderState>('idle');
  // Default to clean 'reader' mode so both Mobile and PC start focused and uncluttered
  const [viewMode, setViewMode] = useState<ViewMode>('reader');
  // On mobile (< 1024px), keep the AI drawer closed by default so the text is 100% readable
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() =>
    loadProviderConfig()
  );
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings()
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
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

  // Restore saved PDF and conversation from IndexedDB on initial mount
  useEffect(() => {
    let mounted = true;
    loadActiveDocument().then(async (savedDoc) => {
      if (!mounted || !savedDoc) return;
      setDocumentData(savedDoc);
      const savedIdx = Math.min(
        savedDoc.currentSentenceIndex || 0,
        Math.max(0, savedDoc.sentences.length - 1)
      );
      setCurrentSentenceIndex(savedIdx);
      const hist = await loadConversationHistory(savedDoc.id);
      if (mounted) setMessages(hist);
    });

    return () => {
      mounted = false;
      speechService.stopSpeaking();
      speechService.stopListening();
    };
  }, []);

  // Core recursive function that reads a sentence and advances to the next
  const speakSentenceAtIndex = useCallback((indexToRead: number) => {
    const doc = docRef.current;
    if (!doc || doc.sentences.length === 0) return;

    const boundedIndex = Math.max(0, Math.min(indexToRead, doc.sentences.length - 1));
    const sentence = doc.sentences[boundedIndex];
    if (!sentence) return;

    setCurrentSentenceIndex(boundedIndex);
    sentenceIdxRef.current = boundedIndex;
    setReaderState('reading');

    // Persist reading position in IndexedDB
    saveActiveDocument({ ...doc, currentSentenceIndex: boundedIndex });

    speechService.speak({
      text: sentence.text,
      settings: voiceSettingsRef.current,
      openAiKeyFallback: providerConfigRef.current.apiKeys.openai,
      onEnd: () => {
        const nextIdx = boundedIndex + 1;
        const currentDoc = docRef.current;

        if (nextIdx >= currentDoc.sentences.length) {
          setReaderState('idle');
          return;
        }

        const nextSentence = currentDoc.sentences[nextIdx];
        const finishedPage = sentence.pageNumber !== nextSentence.pageNumber;
        const activeProviderId = providerConfigRef.current.providerId;
        const hasKey = Boolean(
          providerConfigRef.current.apiKeys[activeProviderId]?.trim()
        );

        // Optional Proactive Tutor comment at the end of a page
        if (
          finishedPage &&
          voiceSettingsRef.current.proactivePageSummary &&
          hasKey
        ) {
          setCurrentSentenceIndex(nextIdx);
          sentenceIdxRef.current = nextIdx;
          triggerAiInteraction(
            `Concluímos a leitura da página ${sentence.pageNumber}. Faça um breve comentário de 2 frases destacando o ponto mais importante antes de continuarmos para a página ${nextSentence.pageNumber}.`,
            'proactive',
            boundedIndex,
            nextIdx
          );
          return;
        }

        speakSentenceAtIndex(nextIdx);
      },
      onError: (errMsg) => {
        setErrorBanner(errMsg);
        setReaderState('paused');
      },
    });
  }, []);

  // Handles asking the AI (via voice barge-in, text input, or proactive page summary)
  const triggerAiInteraction = useCallback(
    async (
      questionText: string,
      source: 'voice' | 'text' | 'proactive',
      contextSentenceIdx?: number,
      resumeSentenceIdxAfter?: number
    ) => {
      const cleanQuestion = questionText.trim();
      if (!cleanQuestion) return;

      // Immediately pause any ongoing TTS reading
      speechService.stopSpeaking();
      speechService.stopListening();
      setInterimTranscript('');
      setErrorBanner(null);

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

      // Check API key before calling LLM
      if (!config.apiKeys[config.providerId]?.trim()) {
        setReaderState('paused');
        setErrorBanner(
          `Conecte sua API Key do ${providerMeta.name} para receber respostas comentadas por voz.`
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

        // Speak the AI's answer out loud!
        setReaderState('speaking_ai');
        speechService.speak({
          text: aiReply,
          settings: voiceSettingsRef.current,
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
        setErrorBanner(err?.message || 'Erro ao obter resposta da IA.');
        setReaderState('paused');
      }
    },
    [speakSentenceAtIndex]
  );

  // Toggle Play/Pause for PDF reading
  const handleTogglePlayPause = () => {
    if (readerState === 'reading' || readerState === 'speaking_ai') {
      speechService.stopSpeaking();
      setReaderState('paused');
    } else {
      speechService.stopListening();
      speakSentenceAtIndex(currentSentenceIndex);
    }
  };

  // Start Voice Interruption ("Barge-in")
  const handleInterruptWithVoice = () => {
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
      const parsedDoc = await parsePdfArrayBuffer(buffer, file.name, file.size);

      setDocumentData(parsedDoc);
      setCurrentSentenceIndex(0);
      setMessages([]);
      await saveActiveDocument(parsedDoc);
      await saveConversationHistory(parsedDoc.id, []);
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
      if (wasReading) {
        speakSentenceAtIndex(firstSentenceOnPage.globalIndex);
      }
    }
  };

  const handleAskAboutSentence = (sentence: PDFSentence) => {
    setCurrentSentenceIndex(sentence.globalIndex);
    setIsAiPanelOpen(true);
    triggerAiInteraction(
      `Comente e explique o significado deste trecho: "${sentence.text}"`,
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
  const latestAiMessage = [...messages].reverse().find((m) => m.role === 'assistant');

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
              Solte seu arquivo PDF aqui
            </p>
            <p className="text-sm text-indigo-200">
              O documento será indexado automaticamente para leitura assistida por voz com IA
            </p>
          </div>
        </div>
      )}

      {/* Compact Responsive Header */}
      <Header
        fileName={documentData.fileName}
        totalPages={documentData.totalPages}
        currentPage={currentPage}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        providerConfig={providerConfig}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onUploadPdf={handleUploadPdf}
        isLoadingPdf={isLoadingPdf}
        isAiPanelOpen={isAiPanelOpen}
        onToggleAiPanel={() => setIsAiPanelOpen((prev) => !prev)}
        messageCount={messages.length}
      />

      {/* Floating AI Speaking Banner when AI drawer is closed (great on Mobile!) */}
      {!isAiPanelOpen &&
        (readerState === 'thinking_ai' || readerState === 'speaking_ai') && (
          <div
            onClick={() => setIsAiPanelOpen(true)}
            className="mx-3 mt-2 px-4 py-2.5 rounded-xl bg-indigo-950/90 border border-indigo-500/40 shadow-lg flex items-center justify-between gap-3 cursor-pointer z-10"
          >
            <p className="text-xs text-indigo-100 line-clamp-2">
              {readerState === 'thinking_ai'
                ? '🧠 IA analisando sua pergunta sobre o trecho...'
                : `💬 IA: "${latestAiMessage?.content || 'Respondendo em voz alta...'}"`}
            </p>
            <span className="text-[11px] font-semibold text-indigo-300 shrink-0 underline">
              Ver chat
            </span>
          </div>
        )}

      {/* Main Reading Workspace — Always takes 100% available height on Mobile & Desktop */}
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
                onSelectPage={handleSelectPage}
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
                readerState={readerState}
                onSelectSentence={handleSelectSentence}
                onAskAboutSentence={handleAskAboutSentence}
              />
            </div>
          )}
        </div>

        {/* AI Assistant Drawer (Overlay on Mobile, Collapsible Right Column on Desktop) */}
        <AssistantSidebar
          isOpen={isAiPanelOpen}
          onClose={() => setIsAiPanelOpen(false)}
          messages={messages}
          currentSentence={currentSentence}
          readerState={readerState}
          providerConfig={providerConfig}
          errorBanner={errorBanner}
          onDismissError={() => setErrorBanner(null)}
          onSendTextQuestion={(q) => triggerAiInteraction(q, 'text')}
          onStartVoiceQuestion={handleInterruptWithVoice}
          onJumpToSentence={(idx) => handleSelectSentence(idx, true)}
          onSpeakMessageAgain={(text) => {
            setReaderState('speaking_ai');
            speechService.speak({
              text,
              settings: voiceSettings,
              openAiKeyFallback: providerConfig.apiKeys.openai,
              onEnd: () => setReaderState('paused'),
            });
          }}
          onResumePdfReading={() => speakSentenceAtIndex(currentSentenceIndex)}
          onClearHistory={() => {
            setMessages([]);
            saveConversationHistory(documentData.id, []);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </main>

      {/* Compact Single-Row Audio & Voice Barge-in Control Bar */}
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
            Math.min(documentData.sentences.length - 1, currentSentenceIndex + 1),
            readerState === 'reading'
          )
        }
        onCycleSpeed={handleCycleSpeed}
        onInterruptWithVoice={handleInterruptWithVoice}
        onStopVoiceListening={handleStopVoiceListening}
        onResumeReadingNow={() => speakSentenceAtIndex(currentSentenceIndex)}
      />

      {/* API Key & Voice Settings Modal */}
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
    </div>
  );
};

export default App;
