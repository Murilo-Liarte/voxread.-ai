import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Upload,
} from 'lucide-react';
import { loadPdfProxy } from '../services/pdfService';
import type { PDFDocumentData } from '../types';

interface PdfOriginalViewerProps {
  documentData: PDFDocumentData;
  currentPage: number;
  onSelectPage: (pageNumber: number) => void;
  onUploadPdf: (file: File) => void;
}

export const PdfOriginalViewer: React.FC<PdfOriginalViewerProps> = ({
  documentData,
  currentPage,
  onSelectPage,
  onUploadPdf,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState<number>(1.2);
  const [pdfProxy, setPdfProxy] = useState<any>(null);
  const [rendering, setRendering] = useState<boolean>(false);

  // Load pdfjs document proxy whenever pdfBytes change
  useEffect(() => {
    let active = true;
    if (!documentData.pdfBytes) {
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
  }, [documentData.id, documentData.pdfBytes]);

  // Render active page on canvas
  useEffect(() => {
    let renderTask: any = null;
    let cancelled = false;

    const renderPage = async () => {
      if (!pdfProxy || !canvasRef.current) return;
      try {
        setRendering(true);
        const pageNum = Math.min(Math.max(1, currentPage), documentData.totalPages);
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
  }, [pdfProxy, currentPage, scale, documentData.totalPages]);

  const currentPageContent =
    documentData.pages.find((p) => p.pageNumber === currentPage) ||
    documentData.pages[0];

  return (
    <div className="flex flex-col h-full bg-slate-950/70 border-r border-slate-800/80 overflow-hidden">
      {/* Viewer Toolbar */}
      <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-300">
            Documento Original
          </span>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onSelectPage(currentPage - 1)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-300 font-medium px-1.5">
            Pág. {currentPage} de {documentData.totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= documentData.totalPages}
            onClick={() => onSelectPage(currentPage + 1)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] text-slate-400 w-11 text-center font-mono">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.4, +(s + 0.15).toFixed(2)))}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas or Styled Document Sheet */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 flex justify-center items-start">
        {documentData.pdfBytes ? (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white">
            {rendering && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-900/80 text-[10px] text-slate-200">
                Renderizando...
              </div>
            )}
            <canvas ref={canvasRef} className="block max-w-full h-auto" />
          </div>
        ) : (
          /* Clean Paper Preview when viewing the built-in interactive guide */
          <div
            style={{ transform: `scale(${scale / 1.2})`, transformOrigin: 'top center' }}
            className="w-full max-w-[560px] bg-white text-slate-900 rounded-lg shadow-2xl border border-slate-300 p-8 sm:p-10 transition-transform"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600">
                VoxRead AI • Guia Interativo
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Página {currentPage} / {documentData.totalPages}
              </span>
            </div>

            <div className="space-y-4 font-serif leading-relaxed text-sm text-slate-800">
              {currentPageContent?.paragraphs.map((p, idx) => (
                <p
                  key={idx}
                  className={
                    idx === 0
                      ? 'text-lg font-sans font-bold text-slate-900 mb-3'
                      : 'text-justify'
                  }
                >
                  {p}
                </p>
              ))}
            </div>

            <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Quer ler um livro, artigo ou contrato seu?
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadPdf(file);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Fazer Upload do Meu PDF</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
