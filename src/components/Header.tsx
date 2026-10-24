import React, { useRef } from 'react';
import {
  BookOpen,
  Upload,
  KeyRound,
  Columns,
  FileText,
  AlignLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
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
  onUploadPdf: (file: File) => void;
  onLoadDemo: () => void;
  isLoadingPdf: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  totalPages,
  currentPage,
  viewMode,
  onViewModeChange,
  providerConfig,
  onOpenSettings,
  onUploadPdf,
  onLoadDemo,
  isLoadingPdf,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProvider = PROVIDERS_CATALOG[providerConfig.providerId];
  const hasApiKey = Boolean(providerConfig.apiKeys[providerConfig.providerId]?.trim());
  const activeModel =
    providerConfig.selectedModels[providerConfig.providerId] || activeProvider.defaultModel;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadPdf(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-3 shrink-0 z-20">
      {/* Brand & Active PDF Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-slate-100 tracking-tight text-base hidden sm:block">
              VoxRead AI
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
              Leitura Assistida
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-[320px] md:max-w-[420px]" title={fileName}>
            {fileName ? `${fileName} • Pág. ${currentPage}/${totalPages}` : 'Nenhum PDF carregado'}
          </p>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="hidden md:flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => onViewModeChange('split')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'split'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Visualizar PDF original e Modo Leitor lado a lado"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Dividido</span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('reader')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'reader'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Modo Leitor Focado com destaque frase a frase"
        >
          <AlignLeft className="w-3.5 h-3.5" />
          <span>Modo Leitor</span>
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('pdf')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'pdf'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Apenas visualização da página original do PDF"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>PDF Original</span>
        </button>
      </div>

      {/* Actions: Upload PDF & Configure AI API Key */}
      <div className="flex items-center gap-2.5">
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
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span>{isLoadingPdf ? 'Processando...' : 'Enviar PDF'}</span>
        </button>

        <button
          type="button"
          onClick={onLoadDemo}
          className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors"
          title="Recarregar documento interativo de exemplo"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>PDF Exemplo</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all ${
            hasApiKey
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-500/40 animate-pulse'
          }`}
          title="Configurar Chave de API (Gemini, ChatGPT, Claude, DeepSeek, Kimi, GLM) e Voz"
        >
          {hasApiKey ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <div className="text-left">
            <span className="block leading-none font-semibold">
              {hasApiKey ? activeProvider.shortName : 'Conectar IA'}
            </span>
            <span className="hidden sm:block text-[10px] opacity-75 truncate max-w-[110px]">
              {hasApiKey ? activeModel : 'Inserir API Key'}
            </span>
          </div>
          <KeyRound className="w-3.5 h-3.5 opacity-70 ml-0.5" />
        </button>
      </div>
    </header>
  );
};
