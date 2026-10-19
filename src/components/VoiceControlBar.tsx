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
  Cpu,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type {
  EngineStatus,
  ReaderState,
  TtsEngineMode,
  VoiceModelDownloadProgress,
} from '../types';

interface VoiceControlBarProps {
  readerState: ReaderState;
  currentSentenceIndex: number;
  totalSentences: number;
  currentPage: number;
  totalPages: number;
  speechRate: number;
  ttsEngine: TtsEngineMode;
  engineStatus?: EngineStatus | null;
  downloadProgress?: VoiceModelDownloadProgress | null;
  interimTranscript: string;
  onTogglePlayPause: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onCycleSpeed: () => void;
  onOpenVoiceSettings: () => void;
  onInterruptWithVoice: () => void;
  onStopVoiceListening: () => void;
  onResumeReadingNow: () => void;
}

const ENGINE_SHORT_LABELS: Record<TtsEngineMode, string> = {
  piper_wasm: 'Piper Neural',
  kokoro_webgpu: 'Kokoro-82M',
  edge_neural: 'Edge Neural',
  gemini_tts: 'Gemini Audio',
  openai_cloud: 'OpenAI Neural',
  elevenlabs: 'ElevenLabs',
  browser: 'Voz do Sistema',
};

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  readerState,
  currentSentenceIndex,
  totalSentences,
  speechRate,
  ttsEngine,
  engineStatus,
  downloadProgress,
  interimTranscript,
  onTogglePlayPause,
  onPrevSentence,
  onNextSentence,
  onCycleSpeed,
  onOpenVoiceSettings,
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

  // Determine badge appearance based on real live EngineStatus
  const activeState = engineStatus?.state || 'idle';
  const badgeStyle =
    activeState === 'failed'
      ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40'
      : activeState === 'fallback'
      ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
      : activeState === 'loading'
      ? 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border-indigo-500/40'
      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

  const badgeText =
    activeState === 'failed'
      ? `Erro: ${ENGINE_SHORT_LABELS[ttsEngine]}`
      : activeState === 'fallback'
      ? 'Fallback: Sistema'
      : activeState === 'loading'
      ? `Sintetizando (${ENGINE_SHORT_LABELS[ttsEngine]})...`
      : engineStatus?.voiceLabel || ENGINE_SHORT_LABELS[ttsEngine] || 'Voz Neural';

  return (
    <footer className="border-t border-slate-800/90 bg-slate-900/95 backdrop-blur-md shrink-0 z-20 relative">
      {/* Thin Top Progress Bar */}
      <div className="w-full h-1 bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Offline Neural Voice Model Download Progress Banner */}
      {downloadProgress?.isDownloading && (
        <div className="px-3 py-1.5 bg-indigo-950/90 border-b border-indigo-500/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
            <span className="text-xs font-medium text-indigo-100 truncate">
              {downloadProgress.statusText}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-24 sm:w-36 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-300">
              {downloadProgress.percent}%
            </span>
          </div>
        </div>
      )}

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
      <div className="h-14 px-2.5 sm:px-6 flex items-center justify-between gap-2 max-w-6xl mx-auto">
        {/* Left: Speed + Live Neural Engine Status Badge + Waveform */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold border border-slate-700 transition-colors shrink-0"
            title="Alterar velocidade de leitura (1.0x, 1.15x, 1.3x, 1.5x)"
          >
            {speechRate.toFixed(2)}x
          </button>

          <button
            type="button"
            onClick={onOpenVoiceSettings}
            className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors max-w-[140px] sm:max-w-[220px] truncate ${badgeStyle}`}
            title={
              engineStatus?.error
                ? `Motivo da falha: ${engineStatus.error} (Clique para abrir Diagnóstico de Voz)`
                : 'Clique para abrir o Diagnóstico de Voz e trocar entre Piper, Kokoro-82M e Edge Neural'
            }
          >
            {activeState === 'loading' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : activeState === 'failed' || activeState === 'fallback' ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ) : activeState === 'playing' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Cpu className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{badgeText}</span>
          </button>

          {/* Animated Audio Waveform Indicator */}
          <div className="hidden lg:flex items-center gap-2">
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

            <div className="flex flex-col text-[11px] leading-tight text-slate-400">
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
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
            className={`flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl font-semibold text-xs sm:text-sm shadow-md transition-all ${
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
        <div className="flex items-center gap-1.5 shrink-0">
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
              <span className="hidden xs:inline sm:inline">Professor (Voz)</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
