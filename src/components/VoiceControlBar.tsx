import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic,
  MicOff,
  Loader2,
  CornerDownRight,
} from 'lucide-react';
import type { ReaderState } from '../types';

interface VoiceControlBarProps {
  readerState: ReaderState;
  currentSentenceIndex: number;
  totalSentences: number;
  currentPage: number;
  totalPages: number;
  speechRate: number;
  interimTranscript: string;
  onTogglePlayPause: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onCycleSpeed: () => void;
  onInterruptWithVoice: () => void;
  onStopVoiceListening: () => void;
  onResumeReadingNow: () => void;
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  readerState,
  currentSentenceIndex,
  totalSentences,
  speechRate,
  interimTranscript,
  onTogglePlayPause,
  onPrevSentence,
  onNextSentence,
  onCycleSpeed,
  onInterruptWithVoice,
  onStopVoiceListening,
  onResumeReadingNow,
}) => {
  const isReading = readerState === 'reading';
  const isListeningUser = readerState === 'listening_user';
  const isThinkingAi = readerState === 'thinking_ai';
  const isSpeakingAi = readerState === 'speaking_ai';
  const isFlashcardPause = readerState === 'flashcard_pause';

  const isWaveActive = isReading || isListeningUser || isSpeakingAi;

  const progressPercent =
    totalSentences > 0
      ? Math.min(
          100,
          Math.round(((currentSentenceIndex + 1) / totalSentences) * 100)
        )
      : 0;

  return (
    <footer className="border-t border-slate-800/90 bg-slate-900/95 backdrop-blur-md shrink-0 z-20 relative">
      {/* Thin Top Progress Bar */}
      <div className="w-full h-1 bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Live Voice Transcript Banner when Listening */}
      {isListeningUser && (
        <div className="px-3 py-1.5 bg-rose-600/20 border-b border-rose-500/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span className="text-xs font-medium text-rose-200 truncate">
              {interimTranscript
                ? `"${interimTranscript}"`
                : 'Professor ouvindo... Pergunte ou diga "Mostrar resposta"!'}
            </span>
          </div>
          <button
            type="button"
            onClick={onStopVoiceListening}
            className="px-2.5 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold shrink-0"
          >
            Enviar
          </button>
        </div>
      )}

      {/* Single-Row Floating Assistant & Player Bar */}
      <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-2 max-w-6xl mx-auto">
        {/* Left: Animated Soundwave Indicator + Speed */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold border border-slate-700 transition-colors"
            title="Alterar velocidade de leitura (1.0x, 1.15x, 1.3x, 1.5x)"
          >
            {speechRate.toFixed(2)}x
          </button>

          {/* Animated Audio Waveform Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-end gap-0.5 h-4 px-1">
              {[0.5, 1.0, 0.7, 0.9, 0.6].map((h, idx) => (
                <span
                  key={idx}
                  style={{
                    height: isWaveActive ? `${Math.round(h * 16)}px` : '4px',
                    animationDelay: `${idx * 120}ms`,
                  }}
                  className={`w-0.5 rounded-full transition-all duration-200 ${
                    isListeningUser
                      ? 'bg-rose-400 animate-pulse'
                      : isSpeakingAi
                      ? 'bg-emerald-400 animate-pulse'
                      : isReading
                      ? 'bg-indigo-400 animate-pulse'
                      : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>

            <div className="hidden sm:flex flex-col text-[11px] leading-tight text-slate-400">
              <span className="font-semibold text-slate-200">
                {isReading && 'Lendo c/ Cursor Sincronizado'}
                {isListeningUser && 'Ouvindo Comando de Voz...'}
                {isThinkingAi && 'Professor analisando...'}
                {isSpeakingAi && 'Professor explicando...'}
                {isFlashcardPause && 'Pausa: Active Recall (Flashcards)'}
                {(readerState === 'idle' || readerState === 'paused') &&
                  'Pausado (Espaço p/ falar)'}
              </span>
              <span>
                Frase {currentSentenceIndex + 1}/{totalSentences} ({progressPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Center: Prev / Play-Pause / Next */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onPrevSentence}
            disabled={currentSentenceIndex <= 0}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 disabled:opacity-35 transition-colors"
            title="Frase anterior"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlayPause}
            className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl font-semibold text-xs sm:text-sm shadow-md transition-all ${
              isReading
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isReading ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>{currentSentenceIndex > 0 ? 'Continuar' : 'Ler PDF'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onNextSentence}
            disabled={currentSentenceIndex >= totalSentences - 1}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 disabled:opacity-35 transition-colors"
            title="Próxima frase"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Active Voice Professor Trigger */}
        <div className="flex items-center gap-1.5">
          {isSpeakingAi && (
            <button
              type="button"
              onClick={onResumeReadingNow}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all"
              title="Retomar leitura do PDF"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Voltar ao PDF</span>
            </button>
          )}

          {isListeningUser ? (
            <button
              type="button"
              onClick={onStopVoiceListening}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all"
            >
              <MicOff className="w-4 h-4" />
              <span>Enviar Voz</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onInterruptWithVoice}
              disabled={isThinkingAi}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all disabled:opacity-40"
              title="Atalho: Barra de Espaço • Pausa a leitura e aciona o Modo Professor por voz"
            >
              {isThinkingAi ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              <span>Professor (Voz)</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
