import React, { useEffect, useRef } from 'react';
import { Volume2, MessageSquarePlus, Sparkles } from 'lucide-react';
import type { PDFDocumentData, PDFSentence, ReaderState } from '../types';

interface FocusedReaderViewProps {
  documentData: PDFDocumentData;
  currentSentenceIndex: number;
  readerState: ReaderState;
  onSelectSentence: (globalIndex: number, autoPlay?: boolean) => void;
  onAskAboutSentence: (sentence: PDFSentence) => void;
}

export const FocusedReaderView: React.FC<FocusedReaderViewProps> = ({
  documentData,
  currentSentenceIndex,
  readerState,
  onSelectSentence,
  onAskAboutSentence,
}) => {
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);

  // Smoothly scroll the currently active sentence into view as the AI reads
  useEffect(() => {
    if (activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentenceIndex]);

  const isReading = readerState === 'reading';

  // Group sentences by page and paragraph for clean typographic rendering
  const pagesWithParagraphs = documentData.pages.map((page) => {
    const pageSentences = documentData.sentences.filter(
      (s) => s.pageNumber === page.pageNumber
    );
    const maxParagraph = pageSentences.reduce(
      (max, s) => Math.max(max, s.paragraphIndex),
      0
    );

    const groupedParagraphs: PDFSentence[][] = [];
    for (let pIdx = 0; pIdx <= maxParagraph; pIdx++) {
      const sents = pageSentences.filter((s) => s.paragraphIndex === pIdx);
      if (sents.length > 0) {
        groupedParagraphs.push(sents);
      }
    }

    return {
      pageNumber: page.pageNumber,
      groupedParagraphs,
    };
  });

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Reader Sub-Header */}
      <div className="h-11 px-5 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-300">
            Modo Leitor Sincronizado
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          Clique em qualquer frase para ler a partir dela
        </span>
      </div>

      {/* Scrollable Sentences Container */}
      <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-12 py-8 pb-32 space-y-10">
        {pagesWithParagraphs.map((page) => (
          <section
            key={page.pageNumber}
            className="max-w-3xl mx-auto bg-slate-900/40 border border-slate-800/70 rounded-2xl p-6 sm:p-8 shadow-inner space-y-5"
          >
            {/* Page Marker */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Página {page.pageNumber} de {documentData.totalPages}
              </span>
              <span className="text-[11px] text-slate-500">
                {page.groupedParagraphs.reduce((acc, p) => acc + p.length, 0)} frases
              </span>
            </div>

            {/* Paragraphs */}
            <div className="space-y-4 font-serif text-base sm:text-[17px] leading-relaxed text-slate-300">
              {page.groupedParagraphs.map((paragraphSentences, pIdx) => (
                <p key={pIdx} className="leading-8">
                  {paragraphSentences.map((sentence) => {
                    const isActive = sentence.globalIndex === currentSentenceIndex;
                    return (
                      <span
                        key={sentence.id}
                        ref={isActive ? activeSentenceRef : null}
                        onClick={() => onSelectSentence(sentence.globalIndex, true)}
                        className={`group relative inline rounded-lg px-1.5 py-0.5 mr-1 cursor-pointer transition-all duration-200 ${
                          isActive
                            ? isReading
                              ? 'bg-indigo-500/30 text-white font-medium ring-1 ring-indigo-400/60 shadow-sm'
                              : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/50'
                            : 'hover:bg-slate-800/80 hover:text-slate-100'
                        }`}
                      >
                        {isActive && (
                          <Volume2
                            className={`inline-block w-4 h-4 mr-1.5 -mt-0.5 ${
                              isReading
                                ? 'text-indigo-400 animate-pulse'
                                : 'text-amber-400'
                            }`}
                          />
                        )}
                        <span>{sentence.text}</span>

                        {/* Quick "Ask AI about this sentence" floating action */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAskAboutSentence(sentence);
                          }}
                          title="Explicar ou comentar esta frase com a IA"
                          className={`inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold align-middle transition-opacity ${
                            isActive
                              ? 'opacity-100 bg-indigo-600 text-white hover:bg-indigo-500'
                              : 'opacity-0 group-hover:opacity-100 bg-slate-800 text-indigo-300 hover:bg-slate-700'
                          }`}
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          <span>Perguntar IA</span>
                        </button>
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
