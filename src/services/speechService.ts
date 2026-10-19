import type { SentenceBlockType, VoiceSettings } from '../types';

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
 * Converts base64 16-bit mono PCM (24000 Hz from Gemini TTS) into a playable WAV Blob.
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
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
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

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isTtsSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    return [...voices].sort((a, b) => {
      const aPt = a.lang.toLowerCase().startsWith('pt');
      const bPt = b.lang.toLowerCase().startsWith('pt');
      if (aPt && !bPt) return -1;
      if (!aPt && bPt) return 1;

      // Rank Neural / Natural / Enhanced voices first
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

    if (name.includes('natural') || name.includes('neural')) score += 50;
    if (name.includes('francisca') || name.includes('thalita') || name.includes('antonio')) score += 40;
    if (name.includes('premium') || name.includes('enhanced') || name.includes('luciana')) score += 30;
    if (name.includes('online')) score += 15;
    if (name.includes('google')) score += 10;
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
    const geminiKey = options.geminiKeyFallback?.trim();
    const openAiKey = settings.openAiTtsApiKey?.trim() || options.openAiKeyFallback?.trim();
    const elevenKey = settings.elevenLabsApiKey?.trim();

    // 1. Gemini Expressive Neural TTS (Uses the user's Gemini API Key for ultra-natural human voice!)
    if (settings.ttsEngine === 'gemini_tts' && geminiKey) {
      try {
        await this.speakWithGeminiTts(cleanText, options.blockType, settings, geminiKey, currentToken, options);
        return;
      } catch (err) {
        console.warn('Fallback para voz neural do navegador após erro no Gemini TTS:', err);
      }
    }

    // 2. ElevenLabs Expressive TTS
    if (settings.ttsEngine === 'elevenlabs' && elevenKey) {
      try {
        await this.speakWithElevenLabs(cleanText, settings, elevenKey, currentToken, options);
        return;
      } catch (err) {
        console.warn('Fallback para voz do navegador após erro no ElevenLabs TTS:', err);
      }
    }

    // 3. OpenAI Cloud HD TTS
    if (settings.ttsEngine === 'openai_cloud' && openAiKey) {
      try {
        await this.speakWithOpenAiCloud(cleanText, options.blockType, settings, openAiKey, currentToken, options);
        return;
      } catch (err) {
        console.warn('Fallback para voz do navegador após erro no OpenAI TTS:', err);
      }
    }

    // 4. Browser Neural TTS with Expressive Prosody & Word Boundary Sync
    this.speakWithBrowser(cleanText, options.blockType, settings, currentToken, options);
  }

  private async speakWithGeminiTts(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings,
    apiKey: string,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    const styleDirective =
      blockType === 'alert'
        ? 'Leia em português do Brasil com entonação de professor de concursos dando um alerta importante de prova, com ênfase clara e expressiva:'
        : blockType === 'heading'
        ? 'Leia este título de tópico em português do Brasil com voz firme, pausada e engajadora de professor:'
        : 'Leia em português do Brasil com voz calorosa, natural, expressiva e didática de um excelente professor:';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${styleDirective} "${text}"` }],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: settings.geminiVoiceName || 'Kore',
              },
            },
          },
        },
      }),
    });

    if (token !== this.playbackToken) return;
    if (!res.ok) {
      throw new Error(`Gemini TTS HTTP ${res.status}`);
    }

    const data = await res.json();
    if (token !== this.playbackToken) return;

    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error('Gemini TTS não retornou dados de áudio.');
    }

    const wavBlob = pcmBase64ToWavBlob(inlineData.data, 24000);
    await this.playAudioBlobWithWordSync(wavBlob, text, settings.rate, token, options);
  }

  private async speakWithElevenLabs(
    text: string,
    settings: VoiceSettings,
    apiKey: string,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    const voiceId = settings.elevenLabsVoiceId?.trim() || 'EXAVITQu4vr4xnSDxMaL'; // Bella / Sarah expressive multilingual
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.8,
          style: 0.38,
          use_speaker_boost: true,
        },
      }),
    });

    if (token !== this.playbackToken) return;
    if (!res.ok) {
      throw new Error(`ElevenLabs HTTP ${res.status}`);
    }

    const blob = await res.blob();
    await this.playAudioBlobWithWordSync(blob, text, settings.rate, token, options);
  }

  private async speakWithOpenAiCloud(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings,
    apiKey: string,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice: settings.cloudVoiceId || 'nova',
        instructions:
          blockType === 'alert'
            ? 'Fale em português brasileiro com entonação enfática de alerta de prova de concurso, destacando os termos cruciais.'
            : 'Fale em português brasileiro como um professor de concursos carismático, expressivo, fluido e natural.',
        speed: Math.min(2.0, Math.max(0.7, settings.rate || 1.0)),
      }),
    });

    if (token !== this.playbackToken) return;
    if (!res.ok) {
      throw new Error(`OpenAI TTS HTTP ${res.status}`);
    }

    const blob = await res.blob();
    await this.playAudioBlobWithWordSync(blob, text, 1.0, token, options);
  }

  private async playAudioBlobWithWordSync(
    blob: Blob,
    text: string,
    playbackRate: number,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    if (token !== this.playbackToken) return;

    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.playbackRate = Math.min(2.0, Math.max(0.7, playbackRate || 1.0));
    this.activeAudio = audio;

    audio.onplay = () => {
      if (token === this.playbackToken) {
        options.onStart?.();
        options.onWordProgress?.(0, 0);
      }
    };

    audio.ontimeupdate = () => {
      if (token !== this.playbackToken || !audio.duration) return;
      const ratio = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
      const approxCharIndex = Math.floor(ratio * text.length);
      options.onWordProgress?.(approxCharIndex, ratio);
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
        options.onError?.('Erro ao reproduzir áudio neural.');
      }
    };

    await audio.play();
  }

  private speakWithBrowser(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings,
    token: number,
    options: SpeakOptions
  ): void {
    if (!this.isTtsSupported()) {
      options.onError?.('Seu navegador não suporta síntese de voz.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = this.getVoices();

    const chosenVoice =
      voices.find((v) => v.voiceURI === settings.browserVoiceURI) ||
      voices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }

    // Apply expressive prosody modulation based on block type so voice feels alive
    let rate = settings.rate || 1.05;
    let pitch = settings.pitch || 1.02;

    if (settings.expressiveProsody !== false) {
      if (blockType === 'alert') {
        rate = rate * 0.95;
        pitch = Math.min(1.3, pitch * 1.09);
      } else if (blockType === 'heading') {
        rate = rate * 0.92;
        pitch = Math.max(0.85, pitch * 0.97);
      } else if (text.includes('?')) {
        pitch = Math.min(1.25, pitch * 1.05);
      }
    }

    utterance.rate = Math.min(2.0, Math.max(0.65, rate));
    utterance.pitch = Math.min(1.4, Math.max(0.7, pitch));

    let boundaryFired = false;

    utterance.onstart = () => {
      if (token !== this.playbackToken) return;
      options.onStart?.();
      options.onWordProgress?.(0, 0);

      // Smooth fallback progress estimator for browsers that don't fire `onboundary`
      const estimatedDurationMs = Math.max(
        1200,
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
      }, 90);
    };

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (token !== this.playbackToken) return;
      if (typeof event.charIndex === 'number') {
        boundaryFired = true;
        const ratio = Math.min(1, Math.max(0, event.charIndex / Math.max(1, text.length)));
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
