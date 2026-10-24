import React, { useEffect, useRef } from 'react';
import { Sparkles, AlertTriangle, Layers } from 'lucide-react';
import type { PDFDocumentData, PDFSentence, ReaderState } from '../types';

interface FocusedReaderViewProps {
  documentData: PDFDocumentData;
  currentSentenceIndex: number;
  wordProgressRatio: number;
  readerState: ReaderState;
  onSelectSentence: (globalIndex: number, autoPlay?: boolean) => void;
  onAskAboutSentence: (sentence: PDFSentence) => void;
  onTriggerTopicFlashcards: (topicId: string) => void;
}

export const FocusedReaderView: React.FC<FocusedReaderViewProps> = ({
  documentData,
  currentSentenceIndex,
  wordProgressRatio,
  readerState,
  onSelectSentence,
  onAskAboutSentence,
  onTriggerTopicFlashcards,
}) => {
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);

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
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-5 sm:py-8 pb-28 space-y-6 sm:space-y-8">
        {pagesWithParagraphs.map((page) => (
          <article
            key={page.pageNumber}
            className="max-w-2xl mx-auto bg-slate-900/40 border border-slate-800/70 rounded-2xl px-5 py-6 sm:px-9 sm:py-8 shadow-sm space-y-4 sm:space-y-5"
          >
            {/* Page & Active Topic Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-3 text-[11px] text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-indigo-400">
                Página {page.pageNumber} de {documentData.totalPages}
              </span>

              <div className="flex items-center gap-2">
                {activeSentence && activeSentence.pageNumber === page.pageNumber && (
                  <>
                    <button
                      type="button"
                      onClick={() => onTriggerTopicFlashcards(activeSentence.topicId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 font-sans font-medium transition-colors"
                      title="Praticar Active Recall deste tópico agora"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Flashcards do Tópico</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onAskAboutSentence(activeSentence)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 font-sans font-medium transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Modo Professor</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Paragraphs with Exam Alert Boxes & Word-by-Word Progress Cursor */}
            <div className="space-y-4 font-serif text-[16px] sm:text-[18px] leading-[1.85] text-slate-300">
              {page.groupedParagraphs.map((paragraphSentences, pIdx) => {
                const firstSent = paragraphSentences[0];
                const isHeading = firstSent?.blockType === 'heading';
                const isAlert = paragraphSentences.some(
                  (s) => s.blockType === 'alert'
                );

                return (
                  <div
                    key={pIdx}
                    className={
                      isHeading
                        ? 'font-sans text-lg sm:text-xl font-bold text-white border-l-4 border-indigo-500 pl-3.5 py-0.5'
                        : isAlert
                        ? 'bg-amber-500/10 border-l-4 border-amber-400 p-4 rounded-r-xl text-amber-100'
                        : 'leading-[1.85] text-slate-300'
                    }
                  >
                    {isAlert && (
                      <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Alerta de Prova / Jurisprudência</span>
                      </div>
                    )}

                    <p>
                      {paragraphSentences.map((sentence) => {
                        const isActive =
                          sentence.globalIndex === currentSentenceIndex;
                        const activeCharPos = isActive
                          ? Math.floor(wordProgressRatio * sentence.text.length)
                          : -1;

                        return (
                          <span
                            key={sentence.id}
                            ref={isActive ? activeSentenceRef : null}
                            onClick={() =>
                              onSelectSentence(sentence.globalIndex, true)
                            }
                            className={`rounded-md px-1 py-0.5 mr-1 cursor-pointer transition-colors duration-150 ${
                              isActive
                                ? isAlert
                                  ? 'bg-amber-500/30 text-white ring-1 ring-amber-400/70'
                                  : isReading
                                  ? 'bg-indigo-500/30 text-white ring-1 ring-indigo-400/60'
                                  : 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/40'
                                : 'hover:bg-slate-800/70 hover:text-slate-100'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <span className="text-white underline decoration-indigo-400 decoration-2 underline-offset-4">
                                  {sentence.text.slice(0, activeCharPos)}
                                </span>
                                <span>{sentence.text.slice(activeCharPos)}</span>
                              </>
                            ) : (
                              sentence.text
                            )}{' '}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
