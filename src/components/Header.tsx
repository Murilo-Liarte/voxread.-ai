import React, { useRef } from 'react';
import {
  BookOpen,
  Upload,
  KeyRound,
  Columns,
  FileText,
  AlignLeft,
  CheckCircle2,
  AlertCircle,
  Layers,
  Brain,
} from 'lucide-react';
import { PROVIDERS_CATALOG } from '../services/llmService';
import type { ProviderConfig, ViewMode } from '../types';

interface HeaderProps {
  fileName: string;
  totalPages: number;
  currentPage: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  providerConfig: ProviderConfig;
  onOpenSettings: () => void;
  onOpenNeuroscience: () => void;
  onUploadPdf: (file: File) => void;
  isLoadingPdf: boolean;
  isAiPanelOpen: boolean;
  onToggleAiPanel: () => void;
  badgeCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  totalPages,
  currentPage,
  viewMode,
  onViewModeChange,
  providerConfig,
  onOpenSettings,
  onOpenNeuroscience,
  onUploadPdf,
  isLoadingPdf,
  isAiPanelOpen,
  onToggleAiPanel,
  badgeCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProvider = PROVIDERS_CATALOG[providerConfig.providerId];
  const hasApiKey = Boolean(providerConfig.apiKeys[providerConfig.providerId]?.trim());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadPdf(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0 z-20">
      {/* Left: Brand & Active Document */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <h1
            className="font-bold text-slate-100 text-xs sm:text-sm truncate max-w-[110px] sm:max-w-[200px] md:max-w-[260px]"
            title={fileName}
          >
            {fileName || 'VoxRead AI'}
          </h1>
          <p className="text-[10px] text-slate-400">
            Pág. {currentPage} de {totalPages}
          </p>
        </div>
      </div>

      {/* Center: View Switcher (PDF Original | Leitor | Dividido) */}
      <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => onViewModeChange('pdf')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            viewMode === 'pdf'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Visualizador do PDF Original com Cursor Highlighter"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>PDF</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('reader')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            viewMode === 'reader'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Modo Leitor Focado"
        >
          <AlignLeft className="w-3.5 h-3.5" />
          <span>Leitor</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('split')}
          className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            viewMode === 'split'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Dividir tela: PDF + Modo Leitor"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Dividido</span>
        </button>
      </div>

      {/* Right: Neuroscience Method, Upload, API Key & Study Panel Toggle */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenNeuroscience}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 text-xs font-semibold transition-all"
          title="A Ciência por trás do Leitor (Dupla Codificação + Active Recall)"
        >
          <Brain className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="hidden xl:inline">Ciência do Método</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoadingPdf}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
          title="Enviar apostila ou livro em PDF"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">
            {isLoadingPdf ? 'Abrindo...' : 'Enviar PDF'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            hasApiKey
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/40'
          }`}
          title="Configurar Chave de API e Voz Expressiva"
        >
          {hasApiKey ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="hidden sm:inline font-semibold">
            {hasApiKey ? activeProvider.shortName : 'Voz & IA'}
          </span>
          <KeyRound className="w-3 h-3 opacity-75 sm:hidden" />
        </button>

        <button
          type="button"
          onClick={onToggleAiPanel}
          className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            isAiPanelOpen
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
          title="Abrir/Fechar Painel de Flashcards, Resumo e Professor"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Estudo & Flashcards</span>
          {badgeCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950">
              {badgeCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
