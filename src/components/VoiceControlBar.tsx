import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic,
  MicOff,
  Loader2,
  Volume2,
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
  currentPage,
  totalPages,
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

  const progressPercent =
    totalSentences > 0
      ? Math.round(((currentSentenceIndex + 1) / totalSentences) * 100)
      : 0;

  return (
    <div className="border-t border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 lg:px-6 py-3 shrink-0 z-20">
      {/* Live Voice Transcript Banner when user is speaking */}
      {isListeningUser && (
        <div className="mb-2.5 px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <span className="text-xs font-semibold text-rose-200 truncate">
              {interimTranscript
                ? `Ouvindo: "${interimTranscript}"`
                : 'Ouvindo você... Pode falar sua dúvida ou comentário sobre o texto!'}
            </span>
          </div>
          <button
            type="button"
            onClick={onStopVoiceListening}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shrink-0"
          >
            Enviar Fala
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Status Badge & Progress */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              isReading
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : isListeningUser
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : isThinkingAi
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : isSpeakingAi
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {isReading && <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
            {isListeningUser && <Mic className="w-3.5 h-3.5 animate-bounce" />}
            {isThinkingAi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSpeakingAi && <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />}
            {readerState === 'idle' || readerState === 'paused' ? (
              <Pause className="w-3.5 h-3.5" />
            ) : null}

            <span>
              {isReading && 'Lendo PDF em voz alta'}
              {isListeningUser && 'Leitura pausada • Ouvindo você'}
              {isThinkingAi && 'IA analisando o trecho...'}
              {isSpeakingAi && 'IA comentando em voz alta'}
              {(readerState === 'idle' || readerState === 'paused') && 'Leitura pausada'}
            </span>
          </div>

          <div className="hidden sm:block text-xs text-slate-400">
            <span>
              Frase <strong className="text-slate-200">{currentSentenceIndex + 1}</strong> de{' '}
              {totalSentences}
            </span>
            <span className="mx-1.5">•</span>
            <span>
              Pág. {currentPage}/{totalPages} ({progressPercent}%)
            </span>
          </div>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevSentence}
            disabled={currentSentenceIndex <= 0}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition-colors"
            title="Frase anterior"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlayPause}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg transition-all ${
              isReading
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
            }`}
          >
            {isReading ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pausar Leitura</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>{currentSentenceIndex > 0 ? 'Continuar Leitura' : 'Iniciar Leitura'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onNextSentence}
            disabled={currentSentenceIndex >= totalSentences - 1}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition-colors"
            title="Próxima frase"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold border border-slate-700/80 transition-colors"
            title="Alterar velocidade de leitura"
          >
            {speechRate.toFixed(2)}x
          </button>
        </div>

        {/* Right: Barge-in / Voice Interruption Button */}
        <div className="flex items-center gap-2">
          {isSpeakingAi && (
            <button
              type="button"
              onClick={onResumeReadingNow}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-all"
              title="Encerrar comentário da IA e voltar imediatamente para a leitura do PDF"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>Voltar ao PDF</span>
            </button>
          )}

          {isListeningUser ? (
            <button
              type="button"
              onClick={onStopVoiceListening}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all"
            >
              <MicOff className="w-4 h-4" />
              <span>Parar e Enviar Pergunta</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onInterruptWithVoice}
              disabled={isThinkingAi}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-rose-600/25 transition-all disabled:opacity-40"
              title="Pausa a leitura do PDF imediatamente e ativa seu microfone para perguntar ou comentar com a IA"
            >
              <Mic className="w-4 h-4" />
              <span>Interromper / Falar com IA</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
