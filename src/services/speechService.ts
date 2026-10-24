import { portugueseToKokoroIpa } from './ptBrPhonemizer';
import type {
  EngineStatus,
  KokoroPtVoiceId,
  PiperVoiceId,
  SentenceBlockType,
  TtsEngineMode,
  VoiceDiagnosticResult,
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
 * Matches the exact installed version of `onnxruntime-web` (1.30.0) in node_modules
 * so `ort-wasm-simd-threaded.mjs` and `.wasm` never 404 against the legacy 1.18.0 CDN.
 */
export const PIPER_WASM_PATHS = {
  onnxWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
  piperData:
    'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  piperWasm:
    'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
};

export function getEngineVoiceLabel(settings: VoiceSettings): string {
  switch (settings.ttsEngine) {
    case 'piper_wasm':
      return `Piper Neural · ${settings.piperVoiceId || 'pt_BR-faber-medium'}`;
    case 'kokoro_webgpu':
      return `Kokoro-82M · ${settings.kokoroVoiceId || 'pf_dora'}`;
    case 'edge_neural':
      return `Edge Neural · ${(settings.edgeVoiceId || 'pt-BR-FranciscaNeural').replace('pt-BR-', '')}`;
    case 'gemini_tts':
      return `Gemini Audio · ${settings.geminiVoiceName || 'Kore'}`;
    case 'openai_cloud':
      return `OpenAI TTS · ${settings.cloudVoiceId || 'nova'}`;
    case 'elevenlabs':
      return 'ElevenLabs Multilingual v2';
    case 'browser':
    default:
      return 'Voz do Sistema (Navegador)';
  }
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
type EngineStatusListener = (status: EngineStatus) => void;

class SpeechService {
  private playbackToken = 0;
  private activeAudio: HTMLAudioElement | null = null;
  private progressTimer: any = null;
  private recognition: any = null;
  private isListening = false;

  // Lookahead LRU Audio Cache (maps "engine:voice:text" -> Promise<Blob>)
  private audioBlobCache = new Map<string, Promise<Blob>>();
  private activePiperVoiceId: PiperVoiceId | null = null;
  private activePiperSessionPromise: Promise<any> | null = null;
  private kokoroInstancePromise: Promise<any> | null = null;
  private kokoroVoiceDataCache = new Map<string, Float32Array>();
  private progressListeners = new Set<DownloadProgressListener>();
  private engineStatusListeners = new Set<EngineStatusListener>();

  public subscribeDownloadProgress(listener: DownloadProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  public subscribeEngineStatus(listener: EngineStatusListener): () => void {
    this.engineStatusListeners.add(listener);
    return () => {
      this.engineStatusListeners.delete(listener);
    };
  }

  private emitProgress(progress: VoiceModelDownloadProgress): void {
    this.progressListeners.forEach((fn) => fn(progress));
  }

  private emitEngineStatus(status: EngineStatus): void {
    this.engineStatusListeners.forEach((fn) => fn(status));
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

  private getCacheKey(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): string {
    const voiceId =
      settings.ttsEngine === 'piper_wasm'
        ? settings.piperVoiceId
        : settings.ttsEngine === 'kokoro_webgpu'
        ? `${settings.kokoroVoiceId}:${settings.rate}`
        : settings.ttsEngine === 'edge_neural'
        ? `${settings.edgeVoiceId}:${settings.rate}`
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

  public async synthesizeNeuralBlob(
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
        settings.kokoroVoiceId || 'pf_dora',
        settings.rate || 1.05
      );
    }
    if (settings.ttsEngine === 'edge_neural') {
      return this.generateEdgeNeuralBlob(formattedText, blockType, settings);
    }
    throw new Error(`Motor ${settings.ttsEngine} não suportado no pipeline neural.`);
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
   * Explicitly configures `wasmPaths` to match `onnxruntime-web@1.30.0` so `ort-wasm-simd-threaded.mjs` never 404s.
   */
  private async getPiperSession(voiceId: PiperVoiceId): Promise<any> {
    if (this.activePiperSessionPromise && this.activePiperVoiceId === voiceId) {
      return this.activePiperSessionPromise;
    }

    this.activePiperVoiceId = voiceId;
    this.activePiperSessionPromise = (async () => {
      const piper = await import('@mintplex-labs/piper-tts-web');
      // Reset Piper's internal singleton when creating/switching voice sessions
      (piper.TtsSession as any)._instance = null;

      const session = await piper.TtsSession.create({
        voiceId: voiceId as any,
        wasmPaths: PIPER_WASM_PATHS,
        progress: (prog: any) => {
          const pct = prog?.total
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
        },
      });

      this.emitProgress({
        engine: 'piper_wasm',
        voiceId,
        percent: 100,
        statusText: `Voz neural ${voiceId} ativa`,
        isDownloading: false,
        isReady: true,
      });

      return session;
    })().catch((err) => {
      this.activePiperSessionPromise = null;
      this.activePiperVoiceId = null;
      throw err;
    });

    return this.activePiperSessionPromise;
  }

  private async generatePiperWasmBlob(
    text: string,
    voiceId: PiperVoiceId
  ): Promise<Blob> {
    const session = await this.getPiperSession(voiceId);
    const wavBlob = await session.predict(text);
    if (!wavBlob || wavBlob.size < 100) {
      throw new Error('Piper WASM retornou áudio vazio.');
    }
    return wavBlob;
  }

  /**
   * 2. Kokoro-82M v1.0 Neural with Native Brazilian Portuguese IPA Phonemizer (`ptBrPhonemizer.ts`)
   * Fixes `Invalid language identifier: "pt-br"` from `npm:phonemizer`!
   */
  private async generateKokoroPortugueseBlob(
    text: string,
    voiceId: KokoroPtVoiceId,
    speedRate = 1.05
  ): Promise<Blob> {
    if (!this.kokoroInstancePromise) {
      this.emitProgress({
        engine: 'kokoro_webgpu',
        voiceId,
        percent: 5,
        statusText: 'Inicializando motor neural Kokoro-82M v1.0 (86MB q8)...',
        isDownloading: true,
        isReady: false,
      });

      this.kokoroInstancePromise = (async () => {
        const { KokoroTTS } = await import('kokoro-js');

        // Use q8 + wasm in browser for compact 86MB download and 100% compatibility
        const instance = await KokoroTTS.from_pretrained(
          'onnx-community/Kokoro-82M-v1.0-ONNX',
          {
            dtype: 'q8',
            device: 'wasm',
            progress_callback: (info: any) => {
              if (typeof info?.progress === 'number') {
                const pct = Math.min(99, Math.round(info.progress));
                this.emitProgress({
                  engine: 'kokoro_webgpu',
                  voiceId,
                  percent: pct,
                  statusText: `Baixando Kokoro-82M Neural (${pct}%)...`,
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
        this.emitProgress({
          engine: 'kokoro_webgpu',
          voiceId,
          percent: 0,
          statusText: 'Falha ao carregar modelo Kokoro-82M',
          isDownloading: false,
          isReady: false,
        });
        throw err;
      });
    }

    const tts = await this.kokoroInstancePromise;
    const { Tensor, RawAudio } = await import('@huggingface/transformers');

    // Convert Brazilian Portuguese text into Kokoro-82M IPA phonemes
    const phonemes = portugueseToKokoroIpa(text);
    const { input_ids } = tts.tokenizer(phonemes || text, {
      truncation: true,
    });

    // Load and validate the Portuguese voice embedding vector (pf_dora, pm_alex, pm_santa)
    let voiceFloat32 = this.kokoroVoiceDataCache.get(voiceId);
    if (!voiceFloat32) {
      const voiceUrl = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voiceId}.bin`;
      let buffer: ArrayBuffer | null = null;

      try {
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('kokoro-voices-v2');
          const matched = await cache.match(voiceUrl);
          if (matched && matched.ok) {
            buffer = await matched.arrayBuffer();
          }
        }
      } catch {
        // Ignore CacheStorage errors
      }

      if (!buffer || buffer.byteLength < 1024) {
        const res = await fetch(voiceUrl);
        if (!res.ok) {
          throw new Error(`Não foi possível baixar o timbre ${voiceId} (${res.status}).`);
        }
        buffer = await res.arrayBuffer();
        try {
          if (typeof caches !== 'undefined' && buffer.byteLength >= 1024) {
            const cache = await caches.open('kokoro-voices-v2');
            await cache.put(voiceUrl, new Response(buffer.slice(0)));
          }
        } catch {
          // Ignore CacheStorage write errors
        }
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
    const boundedSpeed = Math.min(1.8, Math.max(0.75, speedRate || 1.0));

    const { waveform } = await tts.model({
      input_ids,
      style: new Tensor('float32', styleSlice, [1, 256]),
      speed: new Tensor('float32', [boundedSpeed], [1]),
    });

    const rawAudio = new RawAudio(waveform.data, 24000);
    return rawAudio.toBlob();
  }

  /**
   * 3. Microsoft Edge Neural TTS (FranciscaNeural, AntonioNeural, ThalitaMultilingualNeural)
   * Supports Cloudflare Worker Proxy URL (`settings.edgeProxyUrl`) or local `/api/llm/edge-tts`.
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

    const endpoint = settings.edgeProxyUrl?.trim() || '/api/llm/edge-tts';

    const res = await fetch(endpoint, {
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
      if (res.status === 404 || res.status === 405) {
        throw new Error(
          'No GitHub Pages estático, o Edge Neural requer a URL do Cloudflare Worker (ou use o Piper Neural / Kokoro-82M que rodam 100% no navegador).'
        );
      }
      throw new Error(`Edge Neural Proxy HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio')) {
      throw new Error(
        'O endpoint Edge Neural não retornou áudio (configure a URL do Cloudflare Worker ou use Piper / Kokoro-82M).'
      );
    }

    return await res.blob();
  }

  /**
   * Runs a real-time diagnostic test across the neural TTS engines so the user can see
   * synthesis latency, verify status, and compare audio side by side.
   */
  public async runVoiceDiagnostics(
    settings: VoiceSettings,
    geminiKeyFallback?: string
  ): Promise<VoiceDiagnosticResult[]> {
    const sample =
      'Atenção para esta dica de prova! Na Administração Pública, o gestor só age quando a lei autoriza.';
    const results: VoiceDiagnosticResult[] = [];

    // 1. Test Piper WASM
    const t0Piper = performance.now();
    try {
      const voiceId = settings.piperVoiceId || 'pt_BR-faber-medium';
      const blob = await this.generatePiperWasmBlob(sample, voiceId);
      results.push({
        engine: 'piper_wasm',
        voiceLabel: `Piper Neural (${voiceId})`,
        ok: true,
        latencyMs: Math.round(performance.now() - t0Piper),
        audioBlob: blob,
      });
    } catch (err: any) {
      results.push({
        engine: 'piper_wasm',
        voiceLabel: `Piper Neural (${settings.piperVoiceId || 'pt_BR-faber-medium'})`,
        ok: false,
        latencyMs: Math.round(performance.now() - t0Piper),
        error: err?.message || String(err),
      });
    }

    // 2. Test Kokoro-82M PT-BR
    const t0Kokoro = performance.now();
    try {
      const voiceId = settings.kokoroVoiceId || 'pf_dora';
      const blob = await this.generateKokoroPortugueseBlob(
        sample,
        voiceId,
        settings.rate || 1.05
      );
      results.push({
        engine: 'kokoro_webgpu',
        voiceLabel: `Kokoro-82M Neural (${voiceId})`,
        ok: true,
        latencyMs: Math.round(performance.now() - t0Kokoro),
        audioBlob: blob,
      });
    } catch (err: any) {
      results.push({
        engine: 'kokoro_webgpu',
        voiceLabel: `Kokoro-82M Neural (${settings.kokoroVoiceId || 'pf_dora'})`,
        ok: false,
        latencyMs: Math.round(performance.now() - t0Kokoro),
        error: err?.message || String(err),
      });
    }

    // 3. Test Edge Neural
    const t0Edge = performance.now();
    try {
      const voiceId = settings.edgeVoiceId || 'pt-BR-FranciscaNeural';
      const blob = await this.generateEdgeNeuralBlob(sample, 'alert', settings);
      results.push({
        engine: 'edge_neural',
        voiceLabel: `Edge Neural (${voiceId})`,
        ok: true,
        latencyMs: Math.round(performance.now() - t0Edge),
        audioBlob: blob,
      });
    } catch (err: any) {
      results.push({
        engine: 'edge_neural',
        voiceLabel: `Edge Neural (${settings.edgeVoiceId || 'pt-BR-FranciscaNeural'})`,
        ok: false,
        latencyMs: Math.round(performance.now() - t0Edge),
        error: err?.message || String(err),
      });
    }

    // 4. Optional: Test Gemini Audio if key is configured
    if (geminiKeyFallback?.trim()) {
      const t0Gem = performance.now();
      try {
        const blob = await this.generateGeminiAudioBlob(
          sample,
          'alert',
          settings,
          geminiKeyFallback.trim()
        );
        results.push({
          engine: 'gemini_tts',
          voiceLabel: `Gemini Audio (${settings.geminiVoiceName || 'Kore'})`,
          ok: true,
          latencyMs: Math.round(performance.now() - t0Gem),
          audioBlob: blob,
        });
      } catch (err: any) {
        results.push({
          engine: 'gemini_tts',
          voiceLabel: `Gemini Audio (${settings.geminiVoiceName || 'Kore'})`,
          ok: false,
          latencyMs: Math.round(performance.now() - t0Gem),
          error: err?.message || String(err),
        });
      }
    }

    return results;
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
    const requestedEngine: TtsEngineMode = settings.ttsEngine;
    const voiceLabel = getEngineVoiceLabel(settings);
    const geminiKey = options.geminiKeyFallback?.trim();
    const openAiKey =
      settings.openAiTtsApiKey?.trim() || options.openAiKeyFallback?.trim();
    const elevenKey = settings.elevenLabsApiKey?.trim();

    // Direct Browser Speech Synthesis when explicitly selected by the user
    if (requestedEngine === 'browser') {
      this.emitEngineStatus({
        requested: 'browser',
        active: 'browser',
        voiceLabel,
        state: 'playing',
      });
      this.speakWithBrowser(
        formattedText,
        options.blockType,
        settings,
        currentToken,
        options
      );
      return;
    }

    this.emitEngineStatus({
      requested: requestedEngine,
      active: null,
      voiceLabel,
      state: 'loading',
    });

    const t0 = performance.now();

    try {
      let blob: Blob;
      let playbackSpeed = 1.0;

      if (
        requestedEngine === 'piper_wasm' ||
        requestedEngine === 'kokoro_webgpu' ||
        requestedEngine === 'edge_neural'
      ) {
        blob = await this.getOrSynthesizeBlob(
          formattedText,
          options.blockType,
          settings
        );
        playbackSpeed =
          requestedEngine === 'piper_wasm' ? settings.rate || 1.05 : 1.0;
      } else if (requestedEngine === 'gemini_tts') {
        if (!geminiKey) {
          throw new Error(
            'Chave de API do Google Gemini não configurada. Insira sua chave na aba 2 ou selecione Piper / Kokoro-82M (Zero-API).'
          );
        }
        blob = await this.generateGeminiAudioBlob(
          formattedText,
          options.blockType,
          settings,
          geminiKey
        );
        playbackSpeed = settings.rate || 1.05;
      } else if (requestedEngine === 'openai_cloud') {
        if (!openAiKey) {
          throw new Error(
            'Chave de API da OpenAI não configurada. Insira sua chave ou selecione Piper / Kokoro-82M (Zero-API).'
          );
        }
        blob = await this.generateOpenAiAudioBlob(
          formattedText,
          options.blockType,
          settings,
          openAiKey
        );
        playbackSpeed = 1.0;
      } else if (requestedEngine === 'elevenlabs') {
        if (!elevenKey) {
          throw new Error(
            'Chave de API da ElevenLabs não configurada. Insira sua chave ou selecione Piper / Kokoro-82M (Zero-API).'
          );
        }
        blob = await this.generateElevenLabsAudioBlob(
          formattedText,
          settings,
          elevenKey
        );
        playbackSpeed = settings.rate || 1.05;
      } else {
        throw new Error(`Motor desconhecido: ${requestedEngine}`);
      }

      if (currentToken !== this.playbackToken) return;

      const latencyMs = Math.round(performance.now() - t0);
      this.emitEngineStatus({
        requested: requestedEngine,
        active: requestedEngine,
        voiceLabel,
        state: 'playing',
        latencyMs,
      });

      await this.playAudioBlobWithWordSync(
        blob,
        options.text,
        playbackSpeed,
        currentToken,
        options
      );
    } catch (err: any) {
      if (currentToken !== this.playbackToken) return;
      const reason = err?.message || String(err);

      // Decision 2 (Option A): Never silently fall back to the robotic browser voice unless explicitly authorized
      if (settings.allowSystemVoiceFallback) {
        this.emitEngineStatus({
          requested: requestedEngine,
          active: 'browser',
          voiceLabel: 'Voz do Sistema (Fallback Autorizado)',
          state: 'fallback',
          error: reason,
        });
        this.speakWithBrowser(
          formattedText,
          options.blockType,
          settings,
          currentToken,
          options
        );
        return;
      }

      this.emitEngineStatus({
        requested: requestedEngine,
        active: null,
        voiceLabel,
        state: 'failed',
        error: reason,
      });

      options.onError?.(`Falha no motor ${voiceLabel}: ${reason}`);
    }
  }

  private async generateGeminiAudioBlob(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings,
    apiKey: string
  ): Promise<Blob> {
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

    if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);

    const data = await res.json();
    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
      throw new Error('Gemini TTS não retornou dados de áudio.');
    }

    return pcmBase64ToWavBlob(inlineData.data, 24000);
  }

  private async generateElevenLabsAudioBlob(
    text: string,
    settings: VoiceSettings,
    apiKey: string
  ): Promise<Blob> {
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

    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    return await res.blob();
  }

  private async generateOpenAiAudioBlob(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings,
    apiKey: string
  ): Promise<Blob> {
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

    if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
    return await res.blob();
  }

  public async playAudioBlobDirect(blob: Blob, playbackRate = 1.0): Promise<void> {
    this.stopSpeaking();
    const token = ++this.playbackToken;
    await this.playAudioBlobWithWordSync(blob, '', playbackRate, token, {
      text: '',
      settings: {} as any,
    });
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
        options.onError?.('Erro ao reproduzir stream de áudio neural.');
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
