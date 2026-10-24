import type {
  EdgeNeuralVoiceId,
  SentenceBlockType,
  VoiceSettings,
} from '../types';
import {
  computeEdgeProsody,
  EDGE_NEURAL_VOICES,
  synthesizeEdgeTts,
  type EdgeWordBoundary,
} from './edgeTtsClient';

export interface SpeakOptions {
  text: string;
  blockType?: SentenceBlockType;
  settings: VoiceSettings;
  geminiKeyFallback?: string;
  openAiKeyFallback?: string;
  onStart?: () => void;
  onWordProgress?: (charIndex: number, progressRatio: number) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

/**
 * Helper utility to convert base64 16-bit mono PCM into a playable WAV Blob.
 */
export function pcmBase64ToWavBlob(base64Pcm: string, sampleRate = 24000): Blob {
  const binaryStr = atob(base64Pcm);
  const pcmLen = binaryStr.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLen, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmLen, true);

  const uint8 = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLen; i++) {
    uint8[i] = binaryStr.charCodeAt(i);
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

class SpeechService {
  private playbackToken = 0;
  private activeAudio: HTMLAudioElement | null = null;
  private progressTimer: any = null;
  private recognition: any = null;
  private isListening = false;

  public isTtsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isSttSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  public getEdgeVoicesCatalog() {
    return EDGE_NEURAL_VOICES;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isTtsSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    return [...voices].sort((a, b) => {
      const aPt = a.lang.toLowerCase().startsWith('pt');
      const bPt = b.lang.toLowerCase().startsWith('pt');
      if (aPt && !bPt) return -1;
      if (!aPt && bPt) return 1;

      const aScore = this.scoreVoiceQuality(a);
      const bScore = this.scoreVoiceQuality(b);
      if (aScore !== bScore) return bScore - aScore;

      return a.name.localeCompare(b.name);
    });
  }

  private scoreVoiceQuality(v: SpeechSynthesisVoice): number {
    let score = 0;
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    if (lang.includes('pt-br')) score += 20;
    else if (lang.startsWith('pt')) score += 10;

    if (name.includes('microsoft')) score += 45;
    if (name.includes('natural') || name.includes('neural')) score += 50;
    if (name.includes('francisca') || name.includes('thalita') || name.includes('antonio')) score += 40;
    if (name.includes('online')) score += 20;
    return score;
  }

  public getBestDefaultVoiceURI(): string {
    const voices = this.getVoices();
    return voices[0]?.voiceURI || '';
  }

  private clearProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  public stopSpeaking(): void {
    this.playbackToken++;
    this.clearProgressTimer();
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.src = '';
      } catch {
        // Ignore cleanup errors
      }
      this.activeAudio = null;
    }
    if (this.isTtsSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
    }
  }

  /**
   * Speaks text using Microsoft Edge Neural TTS (`msedge-tts` / `edge-tts`) across all voices,
   * with real-time word-boundary synchronization for the PDF BBox highlighter.
   */
  public async speak(options: SpeakOptions): Promise<void> {
    this.stopSpeaking();
    const currentToken = ++this.playbackToken;

    const cleanText = options.text
      .replace(/[*_#`~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      options.onEnd?.();
      return;
    }

    const { settings } = options;
    const edgeVoiceId: EdgeNeuralVoiceId =
      settings.edgeVoiceId || 'pt-BR-FranciscaNeural';

    const prosody = computeEdgeProsody(
      settings.rate,
      settings.pitch,
      options.blockType,
      cleanText,
      settings.expressiveProsody !== false
    );

    // Primary Engine: Microsoft Edge Neural TTS (`msedge-tts` / `edge-tts`)
    try {
      const result = await synthesizeEdgeTts(cleanText, edgeVoiceId, prosody);
      if (currentToken !== this.playbackToken) return;

      await this.playEdgeAudioWithWordBoundaries(
        result.audioBlob,
        cleanText,
        result.wordBoundaries,
        currentToken,
        options
      );
      return;
    } catch {
      if (currentToken !== this.playbackToken) return;
      // Seamless fallback to matching native Edge Neural voice if offline or rate-limited
      this.speakWithMatchingEdgeBrowserVoice(
        cleanText,
        edgeVoiceId,
        prosody.numericRate,
        prosody.numericPitch,
        currentToken,
        options
      );
    }
  }

  private async playEdgeAudioWithWordBoundaries(
    blob: Blob,
    text: string,
    wordBoundaries: EdgeWordBoundary[],
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    if (token !== this.playbackToken) return;

    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    this.activeAudio = audio;

    audio.onplay = () => {
      if (token === this.playbackToken) {
        options.onStart?.();
        options.onWordProgress?.(0, 0);
      }
    };

    audio.ontimeupdate = () => {
      if (token !== this.playbackToken || !audio.duration) return;

      const currentMs = audio.currentTime * 1000;

      // If `msedge-tts` / `edge-tts` returned exact WordBoundary timestamps, use them!
      if (wordBoundaries.length > 0) {
        let activeWord = wordBoundaries[0];
        for (const wb of wordBoundaries) {
          if (currentMs >= wb.offsetMs) {
            activeWord = wb;
          } else {
            break;
          }
        }
        const ratio = Math.min(
          1,
          Math.max(
            audio.currentTime / audio.duration,
            (activeWord.charIndex + activeWord.text.length) / Math.max(1, text.length)
          )
        );
        options.onWordProgress?.(activeWord.charIndex, ratio);
      } else {
        const ratio = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
        const approxCharIndex = Math.floor(ratio * text.length);
        options.onWordProgress?.(approxCharIndex, ratio);
      }
    };

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (token === this.playbackToken) {
        this.activeAudio = null;
        options.onWordProgress?.(text.length, 1);
        options.onEnd?.();
      }
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      if (token === this.playbackToken) {
        this.activeAudio = null;
        options.onError?.('Erro ao reproduzir stream de áudio do Edge TTS.');
      }
    };

    await audio.play();
  }

  /**
   * Matches the selected `pt-BR-<Name>Neural` Edge voice to the browser's
   * Microsoft Edge Natural / Neural synthesis engine when offline or rate-limited.
   */
  private speakWithMatchingEdgeBrowserVoice(
    text: string,
    edgeVoiceId: EdgeNeuralVoiceId,
    numericRate: number,
    numericPitch: number,
    token: number,
    options: SpeakOptions
  ): void {
    if (!this.isTtsSupported()) {
      options.onError?.('Síntese de voz não suportada neste navegador.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.getVoices();

    // Extract voice persona name (e.g. "Francisca", "Antonio", "Thalita")
    const personaKey = edgeVoiceId
      .replace('pt-BR-', '')
      .replace('MultilingualNeural', '')
      .replace('Neural', '')
      .toLowerCase();

    const matchedEdgeVoice =
      voices.find((v) => v.name.toLowerCase().includes(personaKey)) ||
      voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('pt') &&
          (v.name.toLowerCase().includes('natural') ||
            v.name.toLowerCase().includes('microsoft'))
      ) ||
      voices[0];

    if (matchedEdgeVoice) {
      utterance.voice = matchedEdgeVoice;
      utterance.lang = matchedEdgeVoice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }

    utterance.rate = numericRate;
    utterance.pitch = numericPitch;

    let boundaryFired = false;

    utterance.onstart = () => {
      if (token !== this.playbackToken) return;
      options.onStart?.();
      options.onWordProgress?.(0, 0);

      const estimatedDurationMs = Math.max(
        1100,
        (text.length / (14.5 * utterance.rate)) * 1000
      );
      const startedAt = Date.now();
      this.clearProgressTimer();
      this.progressTimer = setInterval(() => {
        if (token !== this.playbackToken) {
          this.clearProgressTimer();
          return;
        }
        if (!boundaryFired) {
          const elapsed = Date.now() - startedAt;
          const ratio = Math.min(0.96, elapsed / estimatedDurationMs);
          options.onWordProgress?.(Math.floor(ratio * text.length), ratio);
        }
      }, 85);
    };

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (token !== this.playbackToken) return;
      if (typeof event.charIndex === 'number') {
        boundaryFired = true;
        const ratio = Math.min(
          1,
          Math.max(0, event.charIndex / Math.max(1, text.length))
        );
        options.onWordProgress?.(event.charIndex, ratio);
      }
    };

    utterance.onend = () => {
      this.clearProgressTimer();
      if (token === this.playbackToken) {
        options.onWordProgress?.(text.length, 1);
        options.onEnd?.();
      }
    };

    utterance.onerror = (event) => {
      this.clearProgressTimer();
      if (token !== this.playbackToken) return;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        return;
      }
      options.onError?.(`Erro na síntese de voz Edge: ${event.error}`);
    };

    window.speechSynthesis.speak(utterance);
  }

  public startListening(callbacks: {
    onInterimResult: (transcript: string) => void;
    onFinalResult: (transcript: string) => void;
    onError: (errorMsg: string) => void;
    onEnd: () => void;
  }): void {
    this.stopSpeaking();
    this.stopListening();

    if (!this.isSttSupported()) {
      callbacks.onError(
        'Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge, ou digite sua dúvida.'
      );
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionCtor();
    this.recognition = recognition;
    this.isListening = true;

    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let latestInterim = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      latestInterim = (finalTranscript + interim).trim();
      callbacks.onInterimResult(latestInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        return;
      }
      if (event.error === 'not-allowed') {
        callbacks.onError(
          'Permissão de microfone negada. Habilite o acesso ao microfone no navegador.'
        );
      } else {
        callbacks.onError(`Erro no microfone: ${event.error}`);
      }
    };

    recognition.onend = () => {
      const wasListening = this.isListening;
      this.isListening = false;
      this.recognition = null;

      const textToCommit = finalTranscript.trim() || latestInterim.trim();
      if (wasListening && textToCommit) {
        callbacks.onFinalResult(textToCommit);
      }
      callbacks.onEnd();
    };

    try {
      recognition.start();
    } catch (err: any) {
      this.isListening = false;
      callbacks.onError(err?.message || 'Não foi possível iniciar o microfone.');
    }
  }

  public stopListening(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }
}

export const speechService = new SpeechService();
