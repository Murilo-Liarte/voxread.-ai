import React, { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
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
} from 'lucide-react';
import { PROVIDERS_CATALOG } from '../services/llmService';
import type {
  ConversationMessage,
  PDFSentence,
  ProviderConfig,
  ReaderState,
} from '../types';

interface AssistantSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ConversationMessage[];
  currentSentence: PDFSentence | undefined;
  readerState: ReaderState;
  providerConfig: ProviderConfig;
  errorBanner: string | null;
  onDismissError: () => void;
  onSendTextQuestion: (question: string) => void;
  onStartVoiceQuestion: () => void;
  onJumpToSentence: (sentenceIndex: number) => void;
  onSpeakMessageAgain: (text: string) => void;
  onResumePdfReading: () => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
}

export const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
  isOpen,
  onClose,
  messages,
  readerState,
  providerConfig,
  errorBanner,
  onDismissError,
  onSendTextQuestion,
  onStartVoiceQuestion,
  onJumpToSentence,
  onSpeakMessageAgain,
  onResumePdfReading,
  onClearHistory,
  onOpenSettings,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProvider = PROVIDERS_CATALOG[providerConfig.providerId];
  const hasApiKey = Boolean(providerConfig.apiKeys[providerConfig.providerId]?.trim());

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
      label: 'Explicar trecho',
      icon: HelpCircle,
      prompt: 'Explique de forma simples e didática o que este trecho quer dizer.',
    },
    {
      label: 'Resumir página',
      icon: BookOpenCheck,
      prompt: 'Faça um resumo comentado dos principais pontos desta página.',
    },
    {
      label: 'Análise crítica',
      icon: Lightbulb,
      prompt: 'Faça um comentário analítico destacando as ideias principais deste ponto.',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden"
      />

      {/* Slide-over Drawer on Mobile / Collapsible Right Panel on Desktop */}
      <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col lg:static lg:z-auto lg:w-[360px] xl:w-[390px] lg:shadow-none shrink-0 overflow-hidden">
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-slate-100">
              Assistente de Leitura
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${activeProvider.badgeColor}`}
            >
              {activeProvider.shortName}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Limpar conversa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Fechar painel e focar no texto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Missing Key Notice */}
        {!hasApiKey && (
          <div className="mx-3 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              Conecte sua API Key ({activeProvider.shortName}, ChatGPT, Claude, DeepSeek, Kimi ou GLM) para respostas comentadas.
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

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 text-slate-400">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2.5">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-semibold text-slate-200 mb-1">
                Tire dúvidas por voz ou texto
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Use os botões rápidos abaixo ou fale ao microfone para a IA explicar qualquer ponto da página atual.
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
                        ? '🎙️ Você'
                        : '💬 Você'
                      : `🤖 ${msg.providerLabel || activeProvider.shortName}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToSentence(msg.sentenceIndex);
                      if (window.innerWidth < 1024) onClose();
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono transition-colors"
                  >
                    Pág. {msg.pageNumber} • #{msg.sentenceIndex + 1}
                  </button>
                </div>

                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
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
                        onClick={() => onSpeakMessageAgain(msg.content)}
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Ouvir</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onResumePdfReading();
                          if (window.innerWidth < 1024) onClose();
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 font-medium"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Continuar PDF</span>
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
              <span>{activeProvider.shortName} analisando o trecho...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Quick Chips + Input Bar */}
        <div className="border-t border-slate-800 bg-slate-950/90 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {quickPrompts.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={readerState === 'thinking_ai'}
                  onClick={() => onSendTextQuestion(item.prompt)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-200 border border-slate-800 text-[11px] font-medium whitespace-nowrap transition-colors disabled:opacity-40"
                >
                  <Icon className="w-3 h-3 text-indigo-400" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

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
              placeholder="Pergunte sobre este trecho..."
              className="flex-1 bg-slate-900 border border-slate-700/90 focus:border-indigo-500 focus:outline-none rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || readerState === 'thinking_ai'}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors shrink-0"
              title="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
