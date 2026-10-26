import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Mic,
  Sparkles,
  Volume2,
  PlayCircle,
  Trash2,
  BookOpenCheck,
  HelpCircle,
  Lightbulb,
  X,
  GraduationCap,
} from 'lucide-react';
import { PROVIDERS_CATALOG } from '../services/llmService';
import type {
  ConversationMessage,
  FlashcardItem,
  PDFSentence,
  PDFTopic,
  ProviderConfig,
  ReaderState,
  SchematicSummary,
  SidebarTab,
} from '../types';

interface AssistantSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  messages: ConversationMessage[];
  flashcards?: FlashcardItem[];
  schematicSummary?: SchematicSummary | null;
  isGeneratingFlashcards?: boolean;
  isGeneratingSummary?: boolean;
  currentSentence: PDFSentence | undefined;
  currentTopic: PDFTopic | undefined;
  readerState: ReaderState;
  providerConfig: ProviderConfig;
  errorBanner: string | null;
  onDismissError: () => void;
  onSendTextQuestion: (question: string) => void;
  onStartVoiceQuestion: () => void;
  onJumpToSentence: (sentenceIndex: number) => void;
  onSpeakText: (text: string) => void;
  onResumePdfReading: () => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
  onGenerateTopicFlashcards?: () => void;
  onRevealFlashcard?: (cardId: string) => void;
  onRateFlashcard?: (cardId: string, difficulty: 'easy' | 'medium' | 'hard') => void;
  onGenerateSummary?: () => void;
}

export const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
  isOpen,
  onClose,
  messages,
  currentSentence,
  currentTopic,
  readerState,
  providerConfig,
  errorBanner,
  onDismissError,
  onSendTextQuestion,
  onStartVoiceQuestion,
  onJumpToSentence,
  onSpeakText,
  onResumePdfReading,
  onClearHistory,
  onOpenSettings,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProvider = PROVIDERS_CATALOG[providerConfig.providerId];
  const hasApiKey = Boolean(
    providerConfig.apiKeys[providerConfig.providerId]?.trim()
  );

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, readerState, isOpen]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || readerState === 'thinking_ai') return;
    onSendTextQuestion(inputText.trim());
    setInputText('');
  };

  const quickPrompts = [
    {
      label: 'Explicar de forma simples',
      icon: HelpCircle,
      prompt:
        'Explique este trecho de forma bem clara, simples e passo a passo para facilitar meu entendimento.',
    },
    {
      label: 'Dar exemplo prático',
      icon: Lightbulb,
      prompt:
        'Dê um exemplo prático ou analogia do dia a dia para ilustrar este trecho.',
    },
    {
      label: 'Detalhar mais a fundo',
      icon: BookOpenCheck,
      prompt:
        'Detalhe melhor os conceitos presentes neste trecho e explique por que isso é importante.',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden"
      />

      <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col lg:static lg:z-auto lg:w-[390px] xl:w-[420px] lg:shadow-none shrink-0 overflow-hidden">
        {/* Clean Header: Explicar & Tirar Dúvidas com a IA */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                Professor IA • Explicar Trecho
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {currentTopic?.title || 'Tire dúvidas sobre o trecho em leitura'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fechar painel lateral"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Sentence Context Card + 1-Click Explanation Buttons */}
        {currentSentence && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-bold uppercase tracking-wider text-indigo-400">
                Trecho Selecionado (Pág. {currentSentence.pageNumber})
              </span>
              <button
                type="button"
                onClick={onResumePdfReading}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                <PlayCircle className="w-3 h-3" />
                <span>Ler Trecho</span>
              </button>
            </div>

            <p className="text-xs text-slate-200 line-clamp-3 leading-relaxed italic border-l-2 border-indigo-500 pl-2.5">
              "{currentSentence.text}"
            </p>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {quickPrompts.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={readerState === 'thinking_ai'}
                    onClick={() => onSendTextQuestion(item.prompt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/35 text-[11px] font-semibold transition-colors disabled:opacity-40"
                  >
                    <Icon className="w-3 h-3 text-violet-400" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorBanner && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-start justify-between gap-2">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="text-rose-300 hover:text-white font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* API Key Prompt if missing */}
        {!hasApiKey && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              Conecte sua API Key gratuita do Google AI Studio (Gemini) para pedir explicações detalhadas.
            </span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold shrink-0 hover:bg-amber-400 transition-colors"
            >
              Conectar
            </button>
          </div>
        )}

        {/* Conversation Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 text-slate-400">
              <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-2.5">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-bold text-slate-200 mb-1">
                Explicação Sob o Seu Comando
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Ficou com dúvida em algum trecho complexo? Clique em{' '}
                <strong className="text-violet-300">Explicar de forma simples</strong>{' '}
                acima, digite sua pergunta abaixo ou pressione{' '}
                <strong className="text-slate-200">Espaço</strong> para perguntar por voz!
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-semibold text-slate-400">
                    {msg.role === 'user'
                      ? msg.inputSource === 'voice'
                        ? '🎙️ Leitor (Voz)'
                        : '💬 Leitor'
                      : `👨‍🏫 Prof. ${msg.providerLabel || activeProvider.shortName}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToSentence(msg.sentenceIndex)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono transition-colors"
                  >
                    Pág. {msg.pageNumber} • #{msg.sentenceIndex + 1}
                  </button>
                </div>

                <div
                  className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-800/95 border border-slate-700/80 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.role === 'assistant' && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSpeakText(msg.content)}
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Ouvir Explicação</span>
                      </button>

                      <button
                        type="button"
                        onClick={onResumePdfReading}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 font-medium"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Continuar Leitura</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {readerState === 'thinking_ai' && (
            <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Elaborando explicação clara sobre o trecho...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Voice/Text Input */}
        <div className="border-t border-slate-800 bg-slate-950/90 p-3 space-y-2">
          {messages.length > 0 && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                title="Limpar histórico de explicações"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpar conversas</span>
              </button>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStartVoiceQuestion}
              className={`p-2 rounded-xl border transition-all shrink-0 ${
                readerState === 'listening_user'
                  ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-rose-400'
              }`}
              title="Perguntar por voz"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Peça para explicar ou detalhar qualquer trecho..."
              className="flex-1 bg-slate-900 border border-slate-700/90 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || readerState === 'thinking_ai'}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors shrink-0"
              title="Enviar pergunta"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
