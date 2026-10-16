import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
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
  const activeSentence = documentData.sentences[currentSentenceIndex];

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
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden relative">
      {/* Main Scrollable Reading Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-14 py-5 sm:py-8 pb-28 space-y-6 sm:space-y-8">
        {pagesWithParagraphs.map((page) => (
          <article
            key={page.pageNumber}
            className="max-w-2xl mx-auto bg-slate-900/35 border border-slate-800/60 rounded-2xl px-5 py-6 sm:px-9 sm:py-8 shadow-sm space-y-4 sm:space-y-5"
          >
            {/* Subtle Page Header */}
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5 text-[11px] text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-indigo-400">
                Página {page.pageNumber} de {documentData.totalPages}
              </span>
              {activeSentence && activeSentence.pageNumber === page.pageNumber && (
                <button
                  type="button"
                  onClick={() => onAskAboutSentence(activeSentence)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 font-sans font-medium transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Explicar trecho atual</span>
                </button>
              )}
            </div>

            {/* Clean Book Typography Paragraphs */}
            <div className="space-y-4 font-serif text-[16px] sm:text-[18px] leading-[1.85] text-slate-300">
              {page.groupedParagraphs.map((paragraphSentences, pIdx) => {
                const isHeading =
                  pIdx === 0 &&
                  paragraphSentences.length === 1 &&
                  paragraphSentences[0].text.length < 95;

                return (
                  <p
                    key={pIdx}
                    className={
                      isHeading
                        ? 'font-sans text-lg sm:text-xl font-bold text-slate-100 leading-snug pb-1'
                        : 'leading-[1.85] text-slate-300'
                    }
                  >
                    {paragraphSentences.map((sentence) => {
                      const isActive = sentence.globalIndex === currentSentenceIndex;
                      return (
                        <span
                          key={sentence.id}
                          ref={isActive ? activeSentenceRef : null}
                          onClick={() => onSelectSentence(sentence.globalIndex, true)}
                          className={` rounded-md px-1 py-0.5 mr-1 cursor-pointer transition-colors duration-150 ${
                            isActive
                              ? isReading
                                ? 'bg-indigo-500/30 text-white ring-1 ring-indigo-400/50'
                                : 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/40'
                              : 'hover:bg-slate-800/70 hover:text-slate-100'
                          }`}
                        >
                          {sentence.text}{' '}
                        </span>
                      );
                    })}
                  </p>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
