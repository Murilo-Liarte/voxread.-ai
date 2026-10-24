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
} from 'lucide-react';
import { PROVIDERS_CATALOG } from '../services/llmService';
import type {
  ConversationMessage,
  PDFSentence,
  ProviderConfig,
  ReaderState,
} from '../types';

interface AssistantSidebarProps {
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
  messages,
  currentSentence,
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, readerState]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || readerState === 'thinking_ai') return;
    onSendTextQuestion(inputText.trim());
    setInputText('');
  };

  const quickPrompts = [
    {
      label: 'Explicar este trecho',
      icon: HelpCircle,
      prompt: 'Explique de forma simples e didática o que este trecho quer dizer.',
    },
    {
      label: 'Resumir página atual',
      icon: BookOpenCheck,
      prompt: 'Faça um resumo comentado dos principais pontos desta página.',
    },
    {
      label: 'Comentário crítico',
      icon: Lightbulb,
      prompt: 'Faça um comentário analítico destacando as implicações ou ideias principais deste ponto.',
    },
  ];

  return (
    <aside className="w-full lg:w-[390px] xl:w-[420px] border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-900/75 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Sidebar Header */}
      <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">
            Diálogo & Comentários da IA
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${activeProvider.badgeColor}`}
          >
            {activeProvider.shortName}
          </span>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Limpar histórico de conversa deste documento"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Active Context Card */}
      {currentSentence && (
        <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="font-semibold text-indigo-400">
              Trecho em foco (Pág. {currentSentence.pageNumber})
            </span>
            <span>Frase #{currentSentence.globalIndex + 1}</span>
          </div>
          <p className="text-xs text-slate-300 italic line-clamp-2">
            "{currentSentence.text}"
          </p>
        </div>
      )}

      {/* Quick Prompt Chips */}
      <div className="px-4 py-2.5 border-b border-slate-800/70 bg-slate-900/40 flex flex-wrap gap-1.5">
        {quickPrompts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              disabled={readerState === 'thinking_ai'}
              onClick={() => onSendTextQuestion(item.prompt)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-indigo-600/25 text-slate-300 hover:text-indigo-200 border border-slate-700/80 hover:border-indigo-500/40 text-[11px] font-medium transition-all disabled:opacity-40"
            >
              <Icon className="w-3 h-3 text-indigo-400" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error or Missing Key Notice */}
      {!hasApiKey && (
        <div className="m-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>
            Conecte sua API Key ({activeProvider.shortName}, ChatGPT, Claude, DeepSeek, Kimi ou GLM) para a IA comentar e responder suas perguntas.
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
        <div className="m-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-start justify-between gap-2">
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

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              Interrompa ou comente a qualquer momento
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Enquanto a IA lê o PDF em voz alta, clique em{' '}
              <strong className="text-rose-300">"Interromper / Falar com IA"</strong> ou digite abaixo. A leitura pausa na hora, a IA responde em voz alta e depois retoma de onde parou!
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
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {msg.role === 'user'
                    ? msg.inputSource === 'voice'
                      ? '🎙️ Você (por voz)'
                      : '💬 Você'
                    : `🤖 ${msg.providerLabel || activeProvider.shortName}`}
                </span>
                <button
                  type="button"
                  onClick={() => onJumpToSentence(msg.sentenceIndex)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono transition-colors"
                  title={`Voltar para a frase "${msg.sentenceExcerpt}"`}
                >
                  Pág. {msg.pageNumber} • #{msg.sentenceIndex + 1}
                </button>
              </div>

              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-800/90 border border-slate-700/80 text-slate-100 rounded-bl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {msg.role === 'assistant' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSpeakMessageAgain(msg.content)}
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Ouvir resposta novamente</span>
                    </button>

                    <button
                      type="button"
                      onClick={onResumePdfReading}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 font-medium"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Retomar PDF</span>
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
            <span>{activeProvider.shortName} está formulando a explicação falada...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box (Text + Voice Barge-in Trigger) */}
      <form
        onSubmit={handleFormSubmit}
        className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={onStartVoiceQuestion}
          className={`p-2.5 rounded-xl border transition-all shrink-0 ${
            readerState === 'listening_user'
              ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-rose-400'
          }`}
          title="Falar pergunta ou comentário por voz (pausa a leitura imediatamente)"
        >
          <Mic className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Comente ou pergunte sobre este trecho..."
          className="flex-1 bg-slate-900 border border-slate-700/90 focus:border-indigo-500 focus:outline-none rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500"
        />

        <button
          type="submit"
          disabled={!inputText.trim() || readerState === 'thinking_ai'}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors shrink-0"
          title="Enviar pergunta ou comentário (a IA responderá em voz alta)"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
};
