import React, { useRef } from 'react';
import {
  BookOpen,
  Upload,
  PlayCircle,
  Trash2,
  Sparkles,
  X,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { PdfLibraryItemSummary, UserAccount } from '../types';

interface PdfLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: UserAccount | null;
  activeDocumentId: string;
  libraryItems: PdfLibraryItemSummary[];
  isLoadingPdf: boolean;
  isAiCleaning: boolean;
  hasGeminiKey: boolean;
  onSelectLibraryDocument: (docId: string) => void;
  onDeleteLibraryDocument: (docId: string) => void;
  onUploadNewPdf: (file: File) => void;
  onRunGeminiCleanOnCurrentDoc: () => void;
  onOpenAccountModal: () => void;
}

export const PdfLibraryModal: React.FC<PdfLibraryModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  activeDocumentId,
  libraryItems,
  isLoadingPdf,
  isAiCleaning,
  hasGeminiKey,
  onSelectLibraryDocument,
  onDeleteLibraryDocument,
  onUploadNewPdf,
  onRunGeminiCleanOnCurrentDoc,
  onOpenAccountModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Meus PDFs em Leitura
                {activeAccount ? ` (@${activeAccount.username})` : ''}
              </h2>
              <p className="text-xs text-slate-400">
                Progresso salvo automaticamente e limpeza de cabeçalhos, rodapés e ruídos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Action Bar */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUploadNewPdf(file);
                  e.target.value = '';
                  onClose();
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingPdf}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Adicionar Novo PDF à Lista</span>
            </button>

            <button
              type="button"
              onClick={onRunGeminiCleanOnCurrentDoc}
              disabled={isAiCleaning || !hasGeminiKey}
              className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40"
              title="Usar o Gemini (gemini-3.5-flash-lite) para filtrar informações irrelevantes restantes do PDF atual"
            >
              {isAiCleaning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Limpar PDF Atual com Gemini IA</span>
            </button>
          </div>

          {!activeAccount && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAccountModal();
              }}
              className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 underline"
            >
              Criar conta para vincular lista permanentemente
            </button>
          )}
        </div>

        {/* Reading List Body */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {libraryItems.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                Sua lista de leitura ainda está vazia
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Envie qualquer apostila ou livro em PDF. O sistema removerá automaticamente cabeçalhos, rodapés e marcas d'água repetidas e salvará seu progresso na sua conta!
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Upload className="w-4 h-4" />
                <span>Enviar Meu Primeiro PDF</span>
              </button>
            </div>
          ) : (
            libraryItems.map((item) => {
              const isCurrent = item.id === activeDocumentId;
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-indigo-950/35 border-indigo-500/50 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-slate-100 truncate max-w-[260px] sm:max-w-[360px]">
                        {item.fileName}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          Aberto Agora
                        </span>
                      )}
                      {item.removedNoiseCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.removedNoiseCount} ruídos/cabeçalhos removidos
                        </span>
                      )}
                      {item.aiCleaned && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                          ✨ Limpo por Gemini IA
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Página {item.currentPage} de {item.totalPages} • Frase{' '}
                          {item.currentSentenceIndex + 1} de {item.totalSentences}
                        </span>
                        <span className="font-bold text-indigo-300">
                          {item.progressPercent}% lido
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all"
                          style={{ width: `${item.progressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 flex items-center gap-3">
                      {item.fileSize > 0 && <span>{formatFileSize(item.fileSize)}</span>}
                      <span>
                        Última leitura:{' '}
                        {new Date(item.lastReadAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectLibraryDocument(item.id);
                        onClose();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>{isCurrent ? 'Continuar' : 'Abrir de Onde Parei'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLibraryDocument(item.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition-colors"
                      title="Remover PDF da lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
