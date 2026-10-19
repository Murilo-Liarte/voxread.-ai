import type {
  KokoroPtVoiceId,
  PiperVoiceId,
  SentenceBlockType,
  VoiceModelDownloadProgress,
  VoiceSettings,
} from '../types';

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
 * Enhances Portuguese text punctuation so neural TTS models (Piper / Kokoro / Edge)
 * produce natural breathing pauses and emphasis on headings and exam alerts.
 */
export function formatExpressiveTextForNeuralTts(
  text: string,
  blockType?: SentenceBlockType
): string {
  let cleaned = text
    .replace(/[*_#`~>]/g, '')
    .replace(/\bArt\.\s*(\d+)/gi, 'Artigo $1')
    .replace(/\bCF\/88\b/gi, 'Constituição Federal de 88')
    .replace(/\bSTF\b/g, 'S T F')
    .replace(/\bSTJ\b/g, 'S T J')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  if (blockType === 'alert') {
    if (/^(Atenção|Importante|Pegadinha)/i.test(cleaned)) {
      cleaned = cleaned.replace(
        /^(Atenção|Importante|Pegadinha(\s+de\s+Prova|\s+da\s+Banca)?)[!:\s-]*/i,
        '$1! ... '
      );
    } else {
      cleaned = `Atenção! ... ${cleaned}`;
    }
  } else if (blockType === 'heading') {
    if (!/[.!?]$/.test(cleaned)) {
      cleaned = `${cleaned}.`;
    }
  }

  return cleaned;
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

type DownloadProgressListener = (progress: VoiceModelDownloadProgress) => void;

class SpeechService {
  private playbackToken = 0;
  private activeAudio: HTMLAudioElement | null = null;
  private progressTimer: any = null;
  private recognition: any = null;
  private isListening = false;

  // Lookahead LRU Audio Cache (maps "engine:voice:text" -> Promise<Blob>)
  private audioBlobCache = new Map<string, Promise<Blob>>();
  private kokoroInstancePromise: Promise<any> | null = null;
  private kokoroVoiceDataCache = new Map<string, Float32Array>();
  private progressListeners = new Set<DownloadProgressListener>();

  public subscribeDownloadProgress(listener: DownloadProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  private emitProgress(progress: VoiceModelDownloadProgress): void {
    this.progressListeners.forEach((fn) => fn(progress));
  }

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
    if (
      name.includes('francisca') ||
      name.includes('thalita') ||
      name.includes('antonio')
    )
      score += 40;
    if (
      name.includes('premium') ||
      name.includes('enhanced') ||
      name.includes('luciana')
    )
      score += 30;
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

  /**
   * Builds a unique cache key for a synthesized sentence
   */
  private getCacheKey(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): string {
    const voiceId =
      settings.ttsEngine === 'piper_wasm'
        ? settings.piperVoiceId
        : settings.ttsEngine === 'kokoro_webgpu'
        ? settings.kokoroVoiceId
        : settings.ttsEngine === 'edge_neural'
        ? settings.edgeVoiceId
        : settings.ttsEngine;
    return `${settings.ttsEngine}:${voiceId}:${blockType || 'normal'}:${text}`;
  }

  /**
   * Pre-generates the audio Blob for the upcoming sentence in the background
   * so there is zero delay when transitioning from Sentence N to Sentence N+1!
   */
  public prefetch(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): void {
    if (!settings.prefetchNextSentence) return;
    if (
      settings.ttsEngine !== 'piper_wasm' &&
      settings.ttsEngine !== 'kokoro_webgpu' &&
      settings.ttsEngine !== 'edge_neural'
    ) {
      return;
    }

    const formatted = formatExpressiveTextForNeuralTts(text, blockType);
    if (!formatted) return;

    const key = this.getCacheKey(formatted, blockType, settings);
    if (this.audioBlobCache.has(key)) return;

    // Limit cache size to 20 sentences
    if (this.audioBlobCache.size >= 20) {
      const oldestKey = this.audioBlobCache.keys().next().value;
      if (oldestKey) this.audioBlobCache.delete(oldestKey);
    }

    const blobPromise = this.synthesizeNeuralBlob(formatted, blockType, settings);
    blobPromise.catch(() => {
      this.audioBlobCache.delete(key);
    });
    this.audioBlobCache.set(key, blobPromise);
  }

  private getOrSynthesizeBlob(
    formattedText: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): Promise<Blob> {
    const key = this.getCacheKey(formattedText, blockType, settings);
    const cached = this.audioBlobCache.get(key);
    if (cached) return cached;

    const promise = this.synthesizeNeuralBlob(formattedText, blockType, settings);
    promise.catch(() => {
      this.audioBlobCache.delete(key);
    });
    this.audioBlobCache.set(key, promise);
    return promise;
  }

  private async synthesizeNeuralBlob(
    formattedText: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): Promise<Blob> {
    if (settings.ttsEngine === 'piper_wasm') {
      return this.generatePiperWasmBlob(
        formattedText,
        settings.piperVoiceId || 'pt_BR-faber-medium'
      );
    }
    if (settings.ttsEngine === 'kokoro_webgpu') {
      return this.generateKokoroPortugueseBlob(
        formattedText,
        settings.kokoroVoiceId || 'pf_dora'
      );
    }
    if (settings.ttsEngine === 'edge_neural') {
      return this.generateEdgeNeuralBlob(formattedText, blockType, settings);
    }
    throw new Error('Motor não suportado no pipeline de Blob neural.');
  }

  /**
   * Pre-downloads the selected Piper WASM voice model into browser OPFS storage with progress bar
   */
  public async preloadPiperVoice(voiceId: PiperVoiceId): Promise<void> {
    const piper = await import('@mintplex-labs/piper-tts-web');
    const storedList = await piper.stored();
    if (storedList.includes(voiceId as any)) {
      this.emitProgress({
        engine: 'piper_wasm',
        voiceId,
        percent: 100,
        statusText: `Voz neural ${voiceId} pronta no cache offline!`,
        isDownloading: false,
        isReady: true,
      });
      return;
    }

    this.emitProgress({
      engine: 'piper_wasm',
      voiceId,
      percent: 1,
      statusText: `Baixando modelo neural ${voiceId} para o navegador...`,
      isDownloading: true,
      isReady: false,
    });

    await piper.download(voiceId as any, (prog) => {
      const pct = prog.total
        ? Math.min(99, Math.round((prog.loaded * 100) / prog.total))
        : 50;
      this.emitProgress({
        engine: 'piper_wasm',
        voiceId,
        percent: pct,
        statusText: `Baixando voz neural offline (${pct}%)...`,
        isDownloading: true,
        isReady: false,
      });
    });

    this.emitProgress({
      engine: 'piper_wasm',
      voiceId,
      percent: 100,
      statusText: `Voz neural ${voiceId} instalada no navegador!`,
      isDownloading: false,
      isReady: true,
    });
  }

  /**
   * 1. Piper TTS WebAssembly (100% in-browser ONNX Runtime Web, Zero API Key)
   */
  private async generatePiperWasmBlob(
    text: string,
    voiceId: PiperVoiceId
  ): Promise<Blob> {
    const piper = await import('@mintplex-labs/piper-tts-web');
    const wavBlob = await piper.predict(
      {
        text,
        voiceId: voiceId as any,
      },
      (prog) => {
        const pct = prog.total
          ? Math.min(99, Math.round((prog.loaded * 100) / prog.total))
          : 50;
        this.emitProgress({
          engine: 'piper_wasm',
          voiceId,
          percent: pct,
          statusText: `Baixando modelo neural ${voiceId}: ${pct}%`,
          isDownloading: true,
          isReady: false,
        });
      }
    );

    this.emitProgress({
      engine: 'piper_wasm',
      voiceId,
      percent: 100,
      statusText: `Voz neural ${voiceId} ativa`,
      isDownloading: false,
      isReady: true,
    });

    return wavBlob;
  }

  /**
   * 2. Kokoro-82M v1.0 WebGPU/WASM with Native Brazilian Portuguese Phonemization (pf_dora, pm_alex, pm_santa)
   */
  private async generateKokoroPortugueseBlob(
    text: string,
    voiceId: KokoroPtVoiceId
  ): Promise<Blob> {
    if (!this.kokoroInstancePromise) {
      this.emitProgress({
        engine: 'kokoro_webgpu',
        voiceId,
        percent: 10,
        statusText: 'Inicializando motor neural Kokoro-82M v1.0 no navegador...',
        isDownloading: true,
        isReady: false,
      });

      this.kokoroInstancePromise = (async () => {
        const { KokoroTTS } = await import('kokoro-js');
        const hasWebGpu =
          typeof navigator !== 'undefined' && 'gpu' in navigator;

        const instance = await KokoroTTS.from_pretrained(
          'onnx-community/Kokoro-82M-v1.0-ONNX',
          {
            dtype: hasWebGpu ? 'fp32' : 'q8',
            device: hasWebGpu ? 'webgpu' : 'wasm',
            progress_callback: (info: any) => {
              if (typeof info?.progress === 'number') {
                const pct = Math.min(99, Math.round(info.progress));
                this.emitProgress({
                  engine: 'kokoro_webgpu',
                  voiceId,
                  percent: pct,
                  statusText: `Carregando Kokoro-82M (${pct}%)...`,
                  isDownloading: true,
                  isReady: false,
                });
              }
            },
          }
        );

        this.emitProgress({
          engine: 'kokoro_webgpu',
          voiceId,
          percent: 100,
          statusText: `Kokoro-82M (${voiceId}) pronto!`,
          isDownloading: false,
          isReady: true,
        });

        return instance;
      })().catch((err) => {
        this.kokoroInstancePromise = null;
        throw err;
      });
    }

    const tts = await this.kokoroInstancePromise;
    const [{ phonemize }, { Tensor, RawAudio }] = await Promise.all([
      import('phonemizer'),
      import('@huggingface/transformers'),
    ]);

    // Convert Brazilian Portuguese text into IPA phonemes using eSpeak-NG WASM
    const phonemeLines = await phonemize(text, 'pt-br');
    const phonemes = Array.isArray(phonemeLines)
      ? phonemeLines.join(' ').trim()
      : String(phonemeLines).trim();

    const { input_ids } = tts.tokenizer(phonemes || text, {
      truncation: true,
    });

    // Load and cache the Portuguese voice embedding vector (pf_dora, pm_alex, pm_santa)
    let voiceFloat32 = this.kokoroVoiceDataCache.get(voiceId);
    if (!voiceFloat32) {
      const voiceUrl = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voiceId}.bin`;
      let buffer: ArrayBuffer | null = null;
      try {
        const cache = await caches.open('kokoro-voices');
        const matched = await cache.match(voiceUrl);
        if (matched) {
          buffer = await matched.arrayBuffer();
        } else {
          const res = await fetch(voiceUrl);
          buffer = await res.arrayBuffer();
          await cache.put(voiceUrl, new Response(buffer.slice(0)));
        }
      } catch {
        const res = await fetch(voiceUrl);
        buffer = await res.arrayBuffer();
      }
      voiceFloat32 = new Float32Array(buffer);
      this.kokoroVoiceDataCache.set(voiceId, voiceFloat32);
    }

    const numTokens = Math.min(
      Math.max((input_ids.dims.at(-1) || 2) - 2, 0),
      509
    );
    const offset = numTokens * 256;
    const styleSlice = voiceFloat32.slice(offset, offset + 256);

    const { waveform } = await tts.model({
      input_ids,
      style: new Tensor('float32', styleSlice, [1, 256]),
      speed: new Tensor('float32', [1.0], [1]),
    });

    const rawAudio = new RawAudio(waveform.data, 24000);
    return rawAudio.toBlob();
  }

  /**
   * 3. Microsoft Edge Neural TTS (FranciscaNeural, AntonioNeural, ThalitaMultilingualNeural)
   */
  private async generateEdgeNeuralBlob(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): Promise<Blob> {
    const pitch =
      blockType === 'alert'
        ? '+6Hz'
        : blockType === 'heading'
        ? '-2Hz'
        : '+0Hz';

    const res = await fetch('/api/llm/edge-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: settings.edgeVoiceId || 'pt-BR-FranciscaNeural',
        rate: settings.rate || 1.05,
        pitch,
      }),
    });

    if (!res.ok) {
      throw new Error(`Edge TTS proxy indisponível (${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      throw new Error('Resposta não contém stream de áudio.');
    }

    return await res.blob();
  }

  public async speak(options: SpeakOptions): Promise<void> {
    this.stopSpeaking();
    const currentToken = ++this.playbackToken;

    const formattedText = formatExpressiveTextForNeuralTts(
      options.text,
      options.blockType
    );

    if (!formattedText) {
      options.onEnd?.();
      return;
    }

    const { settings } = options;
    const geminiKey = options.geminiKeyFallback?.trim();
    const openAiKey =
      settings.openAiTtsApiKey?.trim() || options.openAiKeyFallback?.trim();
    const elevenKey = settings.elevenLabsApiKey?.trim();

    // 1. Zero-API In-Browser Neural Engines (Piper WASM, Kokoro-82M WebGPU, Edge Neural)
    if (
      settings.ttsEngine === 'piper_wasm' ||
      settings.ttsEngine === 'kokoro_webgpu' ||
      settings.ttsEngine === 'edge_neural'
    ) {
      try {
        const blob = await this.getOrSynthesizeBlob(
          formattedText,
          options.blockType,
          settings
        );
        if (currentToken !== this.playbackToken) return;
        const playbackSpeed =
          settings.ttsEngine === 'edge_neural' ? 1.0 : settings.rate || 1.05;
        await this.playAudioBlobWithWordSync(
          blob,
          options.text,
          playbackSpeed,
          currentToken,
          options
        );
        return;
      } catch (err) {
        console.warn(
          `Aviso no motor ${settings.ttsEngine}, tentando Piper WASM / fallback neural:`,
          err
        );
        // If Edge Neural was selected on static GitHub Pages, automatically use Piper WASM in-browser!
        if (settings.ttsEngine === 'edge_neural') {
          try {
            const piperBlob = await this.generatePiperWasmBlob(
              formattedText,
              settings.piperVoiceId || 'pt_BR-faber-medium'
            );
            if (currentToken !== this.playbackToken) return;
            await this.playAudioBlobWithWordSync(
              piperBlob,
              options.text,
              settings.rate || 1.05,
              currentToken,
              options
            );
            return;
          } catch {
            // Fall through to browser synthesis if offline and model not cached
          }
        }
      }
    }

    // 2. Optional Cloud API Engines (Gemini TTS, ElevenLabs, OpenAI Cloud)
    if (settings.ttsEngine === 'gemini_tts' && geminiKey) {
      try {
        await this.speakWithGeminiTts(
          formattedText,
          options.blockType,
          settings,
          geminiKey,
          currentToken,
          options
        );
        return;
      } catch (err) {
        console.warn('Fallback após erro no Gemini TTS:', err);
      }
    }

    if (settings.ttsEngine === 'elevenlabs' && elevenKey) {
      try {
        await this.speakWithElevenLabs(
          formattedText,
          settings,
          elevenKey,
          currentToken,
          options
        );
        return;
      } catch (err) {
        console.warn('Fallback após erro no ElevenLabs TTS:', err);
      }
    }

    if (settings.ttsEngine === 'openai_cloud' && openAiKey) {
      try {
        await this.speakWithOpenAiCloud(
          formattedText,
          options.blockType,
          settings,
          openAiKey,
          currentToken,
          options
        );
        return;
      } catch (err) {
        console.warn('Fallback após erro no OpenAI TTS:', err);
      }
    }

    // 3. Browser Neural TTS Fallback
    this.speakWithBrowser(
      formattedText,
      options.blockType,
      settings,
      currentToken,
      options
    );
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
        ? 'Leia em português do Brasil com entonação de professor de concursos dando um alerta importante de prova:'
        : 'Leia em português do Brasil com voz calorosa, natural, expressiva e didática de professor:';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${styleDirective} "${text}"` }] }],
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
    if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);

    const data = await res.json();
    if (token !== this.playbackToken) return;

    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error('Gemini TTS não retornou dados de áudio.');
    }

    const wavBlob = pcmBase64ToWavBlob(inlineData.data, 24000);
    await this.playAudioBlobWithWordSync(
      wavBlob,
      text,
      settings.rate,
      token,
      options
    );
  }

  private async speakWithElevenLabs(
    text: string,
    settings: VoiceSettings,
    apiKey: string,
    token: number,
    options: SpeakOptions
  ): Promise<void> {
    const voiceId =
      settings.elevenLabsVoiceId?.trim() || 'EXAVITQu4vr4xnSDxMaL';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      voiceId
    )}`;

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
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);

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
            ? 'Fale em português brasileiro com entonação enfática de alerta de prova de concurso.'
            : 'Fale em português brasileiro como um professor de concursos carismático, expressivo e fluido.',
        speed: Math.min(2.0, Math.max(0.7, settings.rate || 1.0)),
      }),
    });

    if (token !== this.playbackToken) return;
    if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);

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
      const ratio = Math.min(
        1,
        Math.max(0, audio.currentTime / audio.duration)
      );
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
      voices.find((v) => v.voiceURI === settings.browserVoiceURI) || voices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      utterance.lang = 'pt-BR';
    }

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
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

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
