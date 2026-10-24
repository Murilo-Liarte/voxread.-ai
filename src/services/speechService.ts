import type { VoiceSettings } from '../types';

export interface SpeakOptions {
  text: string;
  settings: VoiceSettings;
  openAiKeyFallback?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

class SpeechService {
  private playbackToken = 0;
  private activeAudio: HTMLAudioElement | null = null;
  private recognition: any = null;
  private isListening = false;

  public isTtsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isSttSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isTtsSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    return [...voices].sort((a, b) => {
      const aPt = a.lang.toLowerCase().startsWith('pt');
      const bPt = b.lang.toLowerCase().startsWith('pt');
      if (aPt && !bPt) return -1;
      if (!aPt && bPt) return 1;

      const aNatural = /natural|online|google/i.test(a.name);
      const bNatural = /natural|online|google/i.test(b.name);
      if (aNatural && !bNatural) return -1;
      if (!aNatural && bNatural) return 1;

      return a.name.localeCompare(b.name);
    });
  }

  public getBestDefaultVoiceURI(): string {
    const voices = this.getVoices();
    const ptBrNatural = voices.find(
      (v) =>
        v.lang.toLowerCase().includes('pt-br') &&
        /francisca|antonio|natural|google/i.test(v.name)
    );
    if (ptBrNatural) return ptBrNatural.voiceURI;

    const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (anyPt) return anyPt.voiceURI;

    return voices[0]?.voiceURI || '';
  }

  public stopSpeaking(): void {
    this.playbackToken++;
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

    // Check if Cloud TTS (OpenAI) is selected and has an API key
    const openAiKey = options.settings.openAiTtsApiKey?.trim() || options.openAiKeyFallback?.trim();
    if (options.settings.ttsEngine === 'openai_cloud' && openAiKey) {
      try {
        await this.speakWithOpenAiCloud(cleanText, options.settings, openAiKey, currentToken, options);
        return;
      } catch (err: any) {
        console.warn('Fallback para Web Speech API após falha no Cloud TTS:', err);
        // Fall through to browser Web Speech API automatically
      }
    }

    this.speakWithBrowser(cleanText, options.settings, currentToken, options);
  }

  private async speakWithOpenAiCloud(
    text: string,
    settings: VoiceSettings,
    apiKey: string,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    const res = await fetch('/api/llm/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        text,
        voice: settings.cloudVoiceId || 'nova',
        speed: settings.rate || 1.0,
      }),
    });

    if (token !== this.playbackToken) return;

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Erro TTS HTTP ${res.status}`);
    }

    const blob = await res.blob();
    if (token !== this.playbackToken) return;

    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    this.activeAudio = audio;

    audio.onplay = () => {
      if (token === this.playbackToken) {
        options.onStart?.();
      }
    };

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (token === this.playbackToken) {
        this.activeAudio = null;
        options.onEnd?.();
      }
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      if (token === this.playbackToken) {
        this.activeAudio = null;
        options.onError?.('Erro ao reproduzir áudio TTS.');
      }
    };

    await audio.play();
  }

  private speakWithBrowser(
    text: string,
    settings: VoiceSettings,
    token: number,
    options: SpeakOptions
  ): void {
    if (!this.isTtsSupported()) {
      options.onError?.('Seu navegador não suporta síntese de voz (Web Speech API).');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.getVoices();

    const chosenVoice =
      voices.find((v) => v.voiceURI === settings.browserVoiceURI) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('pt'));

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }

    utterance.rate = Math.min(2.0, Math.max(0.5, settings.rate || 1.0));
    utterance.pitch = Math.min(1.5, Math.max(0.5, settings.pitch || 1.0));

    utterance.onstart = () => {
      if (token === this.playbackToken) {
        options.onStart?.();
      }
    };

    utterance.onend = () => {
      if (token === this.playbackToken) {
        options.onEnd?.();
      }
    };

    utterance.onerror = (event) => {
      if (token !== this.playbackToken) return;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        return;
      }
      options.onError?.(`Erro na síntese de voz: ${event.error}`);
    };

    window.speechSynthesis.speak(utterance);
  }

  public startListening(callbacks: {
    onInterimResult: (transcript: string) => void;
    onFinalResult: (transcript: string) => void;
    onError: (errorMsg: string) => void;
    onEnd: () => void;
  }): void {
    // Always stop speaking immediately when user starts speaking ("barge-in")
    this.stopSpeaking();
    this.stopListening();

    if (!this.isSttSupported()) {
      callbacks.onError(
        'Reconhecimento de voz não suportado neste navegador. Use Chrome ou Edge, ou digite sua pergunta.'
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
        callbacks.onError('Permissão de microfone negada. Habilite o acesso ao microfone no navegador.');
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
