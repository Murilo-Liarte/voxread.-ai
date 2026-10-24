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
  Layers,
  FileSpreadsheet,
  Eye,
  Download,
  Check,
  Loader2,
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
  flashcards: FlashcardItem[];
  schematicSummary: SchematicSummary | null;
  isGeneratingFlashcards: boolean;
  isGeneratingSummary: boolean;
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
  onGenerateTopicFlashcards: () => void;
  onRevealFlashcard: (cardId: string) => void;
  onRateFlashcard: (cardId: string, difficulty: 'easy' | 'medium' | 'hard') => void;
  onGenerateSummary: () => void;
}

export const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  messages,
  flashcards,
  schematicSummary,
  isGeneratingFlashcards,
  isGeneratingSummary,
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
  onGenerateTopicFlashcards,
  onRevealFlashcard,
  onRateFlashcard,
  onGenerateSummary,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeProvider = PROVIDERS_CATALOG[providerConfig.providerId];
  const hasApiKey = Boolean(providerConfig.apiKeys[providerConfig.providerId]?.trim());

  useEffect(() => {
    if (isOpen && activeTab === 'professor') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, readerState, isOpen, activeTab]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || readerState === 'thinking_ai') return;
    onSendTextQuestion(inputText.trim());
    setInputText('');
  };

  // Export Flashcards to Anki TSV format
  const handleExportAnki = () => {
    if (flashcards.length === 0) return;
    const rows = flashcards.map(
      (fc) =>
        `${fc.question.replace(/\t|\n/g, ' ')}\t${fc.answer.replace(
          /\t|\n/g,
          ' '
        )} (${fc.bancaTip || ''})\t${fc.topicTitle.replace(/\s+/g, '_')}`
    );
    const blob = new Blob([rows.join('\n')], {
      type: 'text/tab-separated-values;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards_anki_${Date.now()}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Schematic Summary as Markdown
  const handleDownloadSummary = () => {
    if (!schematicSummary) return;
    const blob = new Blob([schematicSummary.markdownContent], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resumo_esquematico_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickPrompts = [
    {
      label: 'Explicar com analogia',
      icon: HelpCircle,
      prompt:
        'Professor, explique este trecho usando uma analogia simples e diga como cai em prova.',
    },
    {
      label: 'Qual a pegadinha?',
      icon: Lightbulb,
      prompt:
        'Professor, qual é a principal pegadinha que Cebraspe e FGV fazem sobre este parágrafo?',
    },
    {
      label: 'Resumir página',
      icon: BookOpenCheck,
      prompt: 'Faça um resumo direto dos pontos-chave desta página.',
    },
  ];

  const unreviewedFlashcards = flashcards.filter((f) => !f.difficulty).length;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden"
      />

      <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col lg:static lg:z-auto lg:w-[390px] xl:w-[420px] lg:shadow-none shrink-0 overflow-hidden">
        {/* Top Navigation Tabs: Flashcards | Resumo | Professor */}
        <div className="px-3 pt-2.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTabChange('flashcards')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'flashcards'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flashcards</span>
              {unreviewedFlashcards > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {unreviewedFlashcards}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange('summary')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'summary'
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Resumo</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('professor')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'professor'
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Professor</span>
              {messages.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-violet-500/20 text-violet-300">
                  {messages.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 mb-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fechar painel lateral"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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

        {/* TAB 1: FLASHCARDS (ACTIVE RECALL) */}
        {activeTab === 'flashcards' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Active Recall • Fim de Tópico
                </span>
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {currentTopic?.title || 'Tópico Atual'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {flashcards.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportAnki}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center gap-1"
                    title="Exportar cartões para o Anki (.tsv)"
                  >
                    <Download className="w-3 h-3 text-emerald-400" />
                    <span>Anki</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isGeneratingFlashcards}
                  onClick={onGenerateTopicFlashcards}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  {isGeneratingFlashcards ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Gerar Cartões</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {flashcards.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-200 mb-1">
                    Flashcards de Fixação Ativa
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                    Ao final de cada tópico da apostila, a leitura pausa automaticamente e lança perguntas de revisão para consolidar sua memória de longo prazo.
                  </p>
                  <button
                    type="button"
                    onClick={onGenerateTopicFlashcards}
                    disabled={isGeneratingFlashcards}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Gerar Flashcards deste Tópico Agora
                  </button>
                </div>
              ) : (
                flashcards.map((card, idx) => (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3 shadow-md"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-indigo-400">
                        Cartão #{idx + 1} • Pág. {card.pageNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSpeakText(card.question)}
                        className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 font-medium"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Ouvir Pergunta</span>
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                      {card.question}
                    </p>

                    {!card.revealed ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            onRevealFlashcard(card.id);
                            onSpeakText(card.answer);
                          }}
                          className="w-full py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                        >
                          <Eye className="w-4 h-4 text-indigo-400" />
                          <span>Formule mentalmente • Revelar e Ouvir Resposta</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2 border-t border-slate-800/90 animate-fadeIn">
                        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-100 leading-relaxed">
                          <strong className="text-emerald-400 block mb-1">
                            Resposta Oficial:
                          </strong>
                          {card.answer}
                        </div>

                        {card.bancaTip && (
                          <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-[11px] text-amber-200">
                            <strong>🎯 Dica de Prova:</strong> {card.bancaTip}
                          </div>
                        )}

                        {/* Difficulty Classification (SRS) */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Classifique seu domínio deste ponto:
                          </span>
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                { id: 'hard', label: 'Difícil', cls: 'border-rose-500/40 text-rose-300 hover:bg-rose-500/20' },
                                { id: 'medium', label: 'Bom', cls: 'border-amber-500/40 text-amber-300 hover:bg-amber-500/20' },
                                { id: 'easy', label: 'Fácil', cls: 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20' },
                              ] as const
                            ).map((btn) => (
                              <button
                                key={btn.id}
                                type="button"
                                onClick={() => onRateFlashcard(card.id, btn.id)}
                                className={`py-1.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                                  card.difficulty === btn.id
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : btn.cls
                                }`}
                              >
                                {card.difficulty === btn.id && (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>{btn.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer: Resume Reading Button */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onResumePdfReading}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Concluir Revisão e Continuar Leitura do PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: RESUMO ESQUEMÁTICO FINAL */}
        {activeTab === 'summary' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                  Síntese para Bancas Examinadoras
                </span>
                <p className="text-xs font-semibold text-slate-200">
                  Definições, Exceções e Esquemas
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {schematicSummary && (
                  <button
                    type="button"
                    onClick={handleDownloadSummary}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center gap-1"
                    title="Baixar Resumo Esquemático (.md)"
                  >
                    <Download className="w-3 h-3 text-indigo-400" />
                    <span>Baixar</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isGeneratingSummary}
                  onClick={onGenerateSummary}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-40"
                >
                  {isGeneratingSummary ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>Gerar Resumo</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!schematicSummary ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-200 mb-1">
                    Resumo Esquemático de Concursos
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mb-4">
                    Consolide toda a apostila em um mapa esquemático com foco nas definições, prazos, exceções e pegadinhas recorrentes de prova.
                  </p>
                  <button
                    type="button"
                    onClick={onGenerateSummary}
                    disabled={isGeneratingSummary}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    Gerar Resumo Esquemático Agora
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Traps & Exceptions Callout */}
                  {schematicSummary.bancaTraps.length > 0 && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                        ⚠️ Radares de Pegadinhas da Banca
                      </span>
                      <ul className="space-y-1.5 text-xs text-amber-100 list-disc pl-4">
                        {schematicSummary.bancaTraps.map((trap, i) => (
                          <li key={i}>{trap}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Full Schematic Markdown Render */}
                  <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-4 text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                    {schematicSummary.markdownContent}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MODO PROFESSOR (INTERAÇÃO POR VOZ OU TEXTO) */}
        {activeTab === 'professor' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {!hasApiKey && (
              <div className="mx-3 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
                <span>
                  Conecte sua API Key gratuita do Google AI Studio (Gemini) para o Modo Professor.
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

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 text-slate-400">
                  <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-2.5">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-200 mb-1">
                    Modo Professor de Concursos Ativo
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                    Pressione <strong className="text-slate-200">Espaço</strong> ou clique no microfone para interromper a leitura e pedir exemplos, analogias ou como o tema cai na prova!
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
                            ? '🎙️ Aluno (Voz)'
                            : '💬 Aluno'
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
                            onClick={() => onSpeakText(msg.content)}
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-medium"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Ouvir Professor</span>
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
                  <span>Professor elaborando explicação didática...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Quick Prompts & Voice/Text Input */}
            <div className="border-t border-slate-800 bg-slate-950/90 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                <div className="flex items-center gap-1.5">
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

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="p-1 text-slate-500 hover:text-slate-300 shrink-0"
                    title="Limpar dúvidas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
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
                  title="Perguntar ao Professor por voz"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Pergunte ao Professor sobre este trecho..."
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
          </div>
        )}
      </aside>
    </>
  );
};
