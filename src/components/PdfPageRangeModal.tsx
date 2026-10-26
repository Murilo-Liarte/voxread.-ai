import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FileText,
  KeyRound,
  Layers,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { normalizePageRange } from '../services/pdfService';

interface PdfPageRangeModalProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  totalPages: number;
  hasGeminiApiKey: boolean;
  isProcessing: boolean;
  progressText: string;
  processedPages: number;
  totalRangePages: number;
  onConfirmRange: (startPage: number, endPage: number, useDeepAi: boolean) => void;
  onCancel: () => void;
  onOpenApiModal: () => void;
}

export const PdfPageRangeModal: React.FC<PdfPageRangeModalProps> = ({
  isOpen,
  fileName,
  fileSize,
  totalPages,
  hasGeminiApiKey,
  isProcessing,
  progressText,
  processedPages,
  totalRangePages,
  onConfirmRange,
  onCancel,
  onOpenApiModal,
}) => {
  const [startInput, setStartInput] = useState<string>('1');
  const [endInput, setEndInput] = useState<string>(
    String(Math.min(totalPages || 1, 22))
  );
  const [useDeepAi, setUseDeepAi] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && totalPages > 0) {
      setStartInput('1');
      setEndInput(String(Math.min(totalPages, 25)));
      setUseDeepAi(true);
    }
  }, [isOpen, totalPages]);

  if (!isOpen) return null;

  const rawStart = Number.parseInt(startInput, 10);
  const rawEnd = Number.parseInt(endInput, 10);
  const normalized = normalizePageRange(
    Number.isNaN(rawStart) ? 1 : rawStart,
    Number.isNaN(rawEnd) ? totalPages : rawEnd,
    totalPages
  );
  const selectedPageCount =
    normalized.endPage - normalized.startPage + 1;

  const applyPreset = (start: number, end: number) => {
    const norm = normalizePageRange(start, end, totalPages);
    setStartInput(String(norm.startPage));
    setEndInput(String(norm.endPage));
  };

  const progressPercent =
    totalRangePages > 0
      ? Math.min(100, Math.round((processedPages / totalRangePages) * 100))
      : 15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Selecionar Intervalo de Páginas
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {totalPages} págs. no PDF
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Escolha quais páginas deseja extrair e limpar para leitura focada
              </p>
            </div>
          </div>

          {!isProcessing && (
            <button
              onClick={onCancel}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              title="Cancelar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* File Info */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">
                {fileName}
              </p>
              <p className="text-[11px] text-slate-400">
                {(fileSize / 1024 / 1024).toFixed(2)} MB • Total de {totalPages}{' '}
                {totalPages === 1 ? 'página' : 'páginas'}
              </p>
            </div>
          </div>

          {/* Page Range Inputs */}
          <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/15 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-indigo-200">
                Intervalo de Páginas para Estudo (ex: 50 a 71 ou 0 a 22)
              </label>
              <span className="text-[11px] font-bold text-emerald-400">
                {selectedPageCount}{' '}
                {selectedPageCount === 1 ? 'página selecionada' : 'páginas selecionadas'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] text-slate-400 mb-1">
                  Da Página (0 ou 1 = Início)
                </span>
                <input
                  type="number"
                  min={0}
                  max={totalPages}
                  disabled={isProcessing}
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  placeholder="Ex: 50"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <span className="block text-[11px] text-slate-400 mb-1">
                  Até a Página (máx. {totalPages})
                </span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  disabled={isProcessing}
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  placeholder={`Ex: ${Math.min(totalPages, 71)}`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="pt-1">
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">
                Atalhos Rápidos:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => applyPreset(0, Math.min(22, totalPages))}
                  className="rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition disabled:opacity-50"
                >
                  0 a {Math.min(22, totalPages)}
                </button>
                {totalPages >= 20 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => applyPreset(1, 20)}
                    className="rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition disabled:opacity-50"
                  >
                    1 a 20
                  </button>
                )}
                {totalPages >= 40 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => applyPreset(21, 40)}
                    className="rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition disabled:opacity-50"
                  >
                    21 a 40
                  </button>
                )}
                {totalPages >= 71 && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => applyPreset(50, 71)}
                    className="rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition disabled:opacity-50"
                  >
                    50 a 71
                  </button>
                )}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => applyPreset(1, totalPages)}
                  className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 text-[11px] font-medium text-indigo-300 transition disabled:opacity-50"
                >
                  PDF Completo (1 a {totalPages})
                </button>
              </div>
            </div>
          </div>

          {/* Deep AI Study Content Extraction Mode */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Wand2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-200 flex items-center gap-1.5">
                    Extração Cirúrgica de Conteúdo (Estilo Demo)
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                      Gemini IA
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    A IA lê as páginas{' '}
                    <strong className="text-white">
                      {normalized.startPage} a {normalized.endPage}
                    </strong>{' '}
                    e extrai <strong>literalmente apenas o texto de estudo</strong>{' '}
                    (títulos, teoria, jurisprudência e questões), descartando 100% de
                    logos, capas, sumários, cabeçalhos, rodapés e CPF.
                  </p>
                </div>
              </div>

              <input
                type="checkbox"
                disabled={isProcessing}
                checked={useDeepAi}
                onChange={(e) => setUseDeepAi(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
            </div>

            {!hasGeminiApiKey && useDeepAi && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <span>
                  Configure sua chave gratuita do Google AI Studio para usar a limpeza
                  profunda com Gemini.
                </span>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onOpenApiModal}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition"
                >
                  <KeyRound className="w-3 h-3" />
                  Configurar IA
                </button>
              </div>
            )}
          </div>

          {/* Progress Bar while Gemini extracts clean blocks */}
          {isProcessing && (
            <div className="rounded-xl border border-indigo-500/30 bg-slate-950/90 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-semibold text-indigo-300">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  {progressText || 'Extraindo apenas o conteúdo de estudo...'}
                </span>
                {totalRangePages > 0 && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {processedPages}/{totalRangePages} págs. ({progressPercent}%)
                  </span>
                )}
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.max(10, progressPercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onCancel}
              className="rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 transition disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() =>
                onConfirmRange(
                  normalized.startPage,
                  normalized.endPage,
                  useDeepAi
                )
              }
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition disabled:opacity-60"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando Páginas {normalized.startPage} a {normalized.endPage}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Extrair e Ler Págs. {normalized.startPage} a {normalized.endPage}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
