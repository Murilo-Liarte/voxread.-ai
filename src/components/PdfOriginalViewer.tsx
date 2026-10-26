import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Upload,
  ShieldCheck,
  ListTree,
  AlertTriangle,
  Sparkles,
  Eye,
  FileCheck2,
} from 'lucide-react';
import { loadPdfProxy } from '../services/pdfService';
import type { PDFDocumentData, PDFSentence, ReaderState } from '../types';

interface PdfOriginalViewerProps {
  documentData: PDFDocumentData;
  currentPage: number;
  currentSentence: PDFSentence | undefined;
  wordProgressRatio: number;
  readerState: ReaderState;
  onSelectPage: (pageNumber: number) => void;
  onSelectSentence: (globalIndex: number, autoPlay?: boolean) => void;
  onUploadPdf: (file: File) => void;
}

export const PdfOriginalViewer: React.FC<PdfOriginalViewerProps> = ({
  documentData,
  currentPage,
  currentSentence,
  wordProgressRatio,
  readerState,
  onSelectPage,
  onSelectSentence,
  onUploadPdf,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightAnchorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState<number>(1.2);
  const [pdfProxy, setPdfProxy] = useState<any>(null);
  const [rendering, setRendering] = useState<boolean>(false);
  // Default to the clean Demo-style study sheet so only pure study text is shown
  const [showRawCanvas, setShowRawCanvas] = useState<boolean>(false);

  // Reset to clean Demo-style study view whenever a new document is loaded
  useEffect(() => {
    setShowRawCanvas(false);
  }, [documentData.id]);

  // Load pdfjs document proxy only if the user toggles raw canvas view
  useEffect(() => {
    let active = true;
    if (!documentData.pdfBytes || !showRawCanvas) {
      setPdfProxy(null);
      return;
    }

    loadPdfProxy(documentData.pdfBytes)
      .then((proxy) => {
        if (active) setPdfProxy(proxy);
      })
      .catch((err) => {
        console.error('Erro ao carregar visualização do PDF:', err);
        if (active) setPdfProxy(null);
      });

    return () => {
      active = false;
    };
  }, [documentData.id, documentData.pdfBytes, showRawCanvas]);

  // Render active page on canvas when raw canvas mode is active
  useEffect(() => {
    let renderTask: any = null;
    let cancelled = false;

    const renderPage = async () => {
      if (!showRawCanvas || !pdfProxy || !canvasRef.current) return;
      try {
        setRendering(true);
        const maxPdfPage =
          documentData.originalTotalPages || documentData.totalPages;
        const pageNum = Math.min(Math.max(1, currentPage), maxPdfPage);
        const page = await pdfProxy.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Aviso ao renderizar página PDF:', err);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [
    showRawCanvas,
    pdfProxy,
    currentPage,
    scale,
    documentData.totalPages,
    documentData.originalTotalPages,
  ]);

  // Auto-scroll the active highlighter smoothly into the center of the screen
  useEffect(() => {
    if (highlightAnchorRef.current) {
      highlightAnchorRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentence?.id]);

  // Available pages that actually contain study sentences
  const availablePageNumbers = React.useMemo(() => {
    const nums = Array.from(
      new Set(documentData.sentences.map((s) => s.pageNumber))
    ).sort((a, b) => a - b);
    return nums.length > 0
      ? nums
      : documentData.pages.map((p) => p.pageNumber);
  }, [documentData.sentences, documentData.pages]);

  const currentPageIdx = availablePageNumbers.indexOf(currentPage);
  const prevPageNumber =
    currentPageIdx > 0 ? availablePageNumbers[currentPageIdx - 1] : null;
  const nextPageNumber =
    currentPageIdx >= 0 && currentPageIdx < availablePageNumbers.length - 1
      ? availablePageNumbers[currentPageIdx + 1]
      : null;

  const pageSentences = documentData.sentences.filter(
    (s) => s.pageNumber === currentPage
  );

  const activeBoxes =
    currentSentence && currentSentence.pageNumber === currentPage
      ? currentSentence.bboxes
      : [];

  // Merge bounding boxes on the same line into sleek highlighter bands
  const mergedHighlightBands = React.useMemo(() => {
    if (!activeBoxes || activeBoxes.length === 0) return [];
    const bands: { x: number; y: number; width: number; height: number }[] = [];
    for (const box of activeBoxes) {
      const last = bands[bands.length - 1];
      if (last && Math.abs(last.y - box.y) < 0.018) {
        const rightEdge = Math.max(last.x + last.width, box.x + box.width);
        last.x = Math.min(last.x, box.x);
        last.width = rightEdge - last.x;
        last.height = Math.max(last.height, box.height);
      } else {
        bands.push({ ...box });
      }
    }
    return bands;
  }, [activeBoxes]);

  const startRange = documentData.selectedStartPage || 1;
  const endRange = documentData.selectedEndPage || documentData.totalPages;
  const hasCustomRange =
    documentData.originalTotalPages &&
    (startRange > 1 || endRange < documentData.originalTotalPages);

  return (
    <div className="flex flex-col h-full bg-slate-950/80 border-r border-slate-800/80 overflow-hidden">
      {/* Top Toolbar: Topic Selector, Page Navigation, Clean Mode Toggle & Zoom */}
      <div className="h-11 px-3 sm:px-4 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between gap-2 shrink-0">
        {/* Topic Jump Selector */}
        <div className="flex items-center gap-1.5 min-w-0">
          <ListTree className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <select
            value={currentSentence?.topicId || ''}
            onChange={(e) => {
              const chosenTopic = documentData.topics.find(
                (t) => t.id === e.target.value
              );
              if (chosenTopic) {
                onSelectSentence(
                  chosenTopic.startSentenceIndex,
                  readerState === 'reading'
                );
              }
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-200 max-w-[130px] sm:max-w-[220px] truncate focus:outline-none focus:border-indigo-500"
            title="Navegar diretamente para um tópico da apostila"
          >
            {documentData.topics.map((topic, i) => (
              <option key={topic.id} value={topic.id}>
                Tópico {i + 1}: {topic.title} (Pág. {topic.pageNumber})
              </option>
            ))}
          </select>

          <span
            className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium"
            title="Exibindo apenas o conteúdo puro de estudo destacado para leitura"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>
              {documentData.aiCleaned
                ? 'Extração Cirúrgica Gemini IA'
                : 'Texto Limpo Destacado'}
            </span>
          </span>
        </div>

        {/* Page Navigation within Selected Range */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={prevPageNumber === null}
            onClick={() => prevPageNumber !== null && onSelectPage(prevPageNumber)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Página de estudo anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-300 font-medium px-1">
            Pág. {currentPage}
            {hasCustomRange
              ? ` (${startRange}–${endRange})`
              : `/${endRange}`}
          </span>
          <button
            type="button"
            disabled={nextPageNumber === null}
            onClick={() => nextPageNumber !== null && onSelectPage(nextPageNumber)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Próxima página de estudo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Controls: Toggle Raw PDF vs Clean Demo Sheet + Zoom */}
        <div className="flex items-center gap-1.5 shrink-0">
          {Boolean(documentData.pdfBytes) && (
            <button
              type="button"
              onClick={() => setShowRawCanvas((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                showRawCanvas
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25'
              }`}
              title={
                showRawCanvas
                  ? 'Voltar para a Folha de Estudo Limpa (Estilo Demo)'
                  : 'Espiar imagem bruta da página do PDF'
              }
            >
              {showRawCanvas ? (
                <>
                  <FileCheck2 className="w-3 h-3" />
                  <span className="hidden md:inline">Folha Limpa (Demo)</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  <span className="hidden md:inline">Ver PDF Bruto</span>
                </>
              )}
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.7, +(s - 0.15).toFixed(2)))}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Diminuir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-slate-400 w-10 text-center font-mono">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.2, +(s + 0.15).toFixed(2)))}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Clean Demo-Style Study Sheet (Default) OR Raw PDF Canvas */}
      <div className="flex-1 overflow-auto p-3 sm:p-6 flex justify-center items-start">
        {showRawCanvas && documentData.pdfBytes ? (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white inline-block">
            {rendering && (
              <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded bg-slate-900/80 text-[10px] text-slate-200">
                Renderizando...
              </div>
            )}
            <canvas ref={canvasRef} className="block max-w-full h-auto" />

            {/* Synchronized BBox Highlighter Overlay on top of Original PDF Canvas */}
            <div className="absolute inset-0 pointer-events-none">
              {mergedHighlightBands.map((band, idx) => {
                const isFirst = idx === 0;
                const isAlert = currentSentence?.blockType === 'alert';
                return (
                  <div
                    key={idx}
                    ref={isFirst ? highlightAnchorRef : null}
                    style={{
                      left: `${band.x * 100}%`,
                      top: `${band.y * 100}%`,
                      width: `${band.width * 100}%`,
                      height: `${band.height * 100}%`,
                    }}
                    className={`absolute rounded-xs transition-all duration-150 ${
                      isAlert
                        ? 'bg-amber-400/35 ring-1 ring-amber-500/80'
                        : 'bg-indigo-500/25 ring-1 ring-indigo-500/70'
                    }`}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(8, wordProgressRatio * 100))}%`,
                      }}
                      className={`h-full transition-all duration-75 ${
                        isAlert ? 'bg-amber-400/30' : 'bg-indigo-500/25'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* High-Precision Clean Study Sheet (Identical to Demo) with Synchronized Word-by-Word Highlighter */
          <div
            style={{
              transform: `scale(${scale / 1.2})`,
              transformOrigin: 'top center',
            }}
            className="w-full max-w-[680px] bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-300 p-6 sm:p-10 transition-transform"
          >
            {/* Clean Study Sheet Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 mb-6 text-[10px] text-slate-500">
              <span className="font-semibold uppercase tracking-widest text-indigo-600 truncate max-w-[360px]">
                {documentData.fileName} • Página {currentPage}
                {hasCustomRange ? ` (Intervalo ${startRange} a ${endRange})` : ''}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                {documentData.aiCleaned
                  ? 'Apenas Conteúdo de Estudo (Limpo por Gemini IA)'
                  : 'Logos, Cabeçalhos e Rodapés Removidos'}
              </span>
            </div>

            {/* Clean Study Sentences with Word-by-Word Highlight */}
            <div className="space-y-4 font-serif text-[15px] sm:text-[16.5px] leading-[1.85] text-slate-800">
              {Array.from(
                new Set(pageSentences.map((s) => s.paragraphIndex))
              ).map((pIdx) => {
                const sents = pageSentences.filter(
                  (s) => s.paragraphIndex === pIdx
                );
                const firstSent = sents[0];
                const isHeading = firstSent?.blockType === 'heading';
                const isAlert = sents.some((s) => s.blockType === 'alert');
                const isQuestion = sents.some(
                  (s) => s.blockType === 'question_item'
                );

                return (
                  <div
                    key={pIdx}
                    className={
                      isHeading
                        ? 'font-sans text-lg font-bold text-slate-950 border-l-4 border-indigo-600 pl-3 py-0.5 my-2'
                        : isAlert
                          ? 'bg-amber-50/90 border-l-4 border-amber-500 p-3.5 rounded-r-xl my-3 text-slate-900'
                          : isQuestion
                            ? 'bg-indigo-50/70 border-l-4 border-indigo-400 p-3.5 rounded-r-xl my-2.5 text-slate-900'
                            : 'text-justify'
                    }
                  >
                    {isAlert && (
                      <div className="flex items-center gap-1.5 text-xs font-sans font-bold text-amber-800 uppercase tracking-wide mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Destaque de Banca Examinadora / Jurisprudência</span>
                      </div>
                    )}
                    {sents.map((sent) => {
                      const isActive = sent.id === currentSentence?.id;
                      const activeCharPos = isActive
                        ? Math.floor(wordProgressRatio * sent.text.length)
                        : -1;

                      return (
                        <span
                          key={sent.id}
                          ref={isActive ? highlightAnchorRef : null}
                          onClick={() => onSelectSentence(sent.globalIndex, true)}
                          className={`rounded px-1 py-0.5 mr-1 cursor-pointer transition-all duration-150 ${
                            isActive
                              ? isAlert
                                ? 'bg-amber-300/75 text-slate-950 font-medium ring-2 ring-amber-500 shadow-xs'
                                : 'bg-indigo-200/85 text-slate-950 font-medium ring-2 ring-indigo-500 shadow-xs'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <span className="underline decoration-indigo-600 decoration-2 underline-offset-4">
                                {sent.text.slice(0, activeCharPos)}
                              </span>
                              <span>{sent.text.slice(activeCharPos)}</span>
                            </>
                          ) : (
                            sent.text
                          )}{' '}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer Upload Prompt */}
            <div className="mt-8 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Envie outro PDF ou selecione um novo intervalo de páginas (ex: 50 a 71):
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadPdf(file);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Enviar PDF (Escolher Páginas)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
