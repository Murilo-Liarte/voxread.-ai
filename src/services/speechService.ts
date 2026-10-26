import type {
  EngineStatus,
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
  onStart?: () => void;
  onWordProgress?: (charIndex: number, progressRatio: number) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

/**
 * Matches the exact installed version of `onnxruntime-web` (1.30.0) in node_modules
 * so `ort-wasm-simd-threaded.mjs` and `.wasm` never 404.
 */
export const PIPER_WASM_PATHS = {
  onnxWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
  piperData:
    'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  piperWasm:
    'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
};

const PIPER_CACHE_NAME = 'voxread-piper-permanent-v1';

/**
 * Calibrates Piper's naturally fast speaking cadence (~200 WPM at 1.0) down by 22%
 * so that `1.00x` and `0.85x` sound calm, clear, and unhurried for studying complex topics.
 */
export const BASE_CADENCE_FACTOR = 0.78;

export function computeCalibratedPlaybackRate(userRate = 0.85): number {
  const safeRate = Number.isFinite(userRate) && userRate > 0 ? userRate : 0.85;
  return Math.max(
    0.42,
    Math.min(1.65, +(safeRate * BASE_CADENCE_FACTOR).toFixed(3))
  );
}

export function getEngineVoiceLabel(settings: VoiceSettings): string {
  return `Piper Neural · ${settings.piperVoiceId || 'pt_BR-faber-medium'}`;
}

/**
 * Enhances Portuguese text punctuation so Piper Neural TTS produces natural breathing pauses
 * and emphasis on headings, clauses, and exam alerts.
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
    .replace(/;\s+/g, '; ... ')
    .replace(/:\s+/g, ': ... ')
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
 * Utility preserved for unit test compatibility
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
  private prefetchTimer: any = null;
  private recognition: any = null;
  private isListening = false;

  // Serializes WASM/ONNX session.predict() calls so speak() and prefetch() never collide or freeze the main thread
  private inferenceMutex: Promise<any> = Promise.resolve();

  // Lookahead LRU Audio Cache (maps "piper:voice:text" -> Promise<Blob>)
  private audioBlobCache = new Map<string, Promise<Blob>>();
  // Permanent in-memory Blob URLs for `piper_phonemize.data` and `piper_phonemize.wasm`
  private localAssetBlobUrls = new Map<string, string>();
  private activePiperVoiceId: PiperVoiceId | null = null;
  private activePiperSessionPromise: Promise<any> | null = null;
  private storagePersistedRequested = false;

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

  public isSttSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  private clearProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
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
  }

  /**
   * Requests browser persistent storage permission so OPFS & CacheStorage are never evicted.
   */
  private async ensurePersistentStorage(): Promise<void> {
    if (this.storagePersistedRequested) return;
    this.storagePersistedRequested = true;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.storage &&
        typeof navigator.storage.persist === 'function'
      ) {
        await navigator.storage.persist();
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Permanently caches Piper WASM/Data assets (`piper_phonemize.data` ~22MB and `piper_phonemize.wasm` ~1.5MB)
   * inside OPFS (`navigator.storage.getDirectory()`) and `CacheStorage` (`voxread-piper-permanent-v1`),
   * returning a local `blob:` URL so Emscripten NEVER re-downloads them on page reload or between sentences!
   */
  private async getOrCachePiperAssetBlobUrl(
    remoteUrl: string,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    const existingMemUrl = this.localAssetBlobUrls.get(fileName);
    if (existingMemUrl) return existingMemUrl;

    await this.ensurePersistentStorage();

    // 1. Try reading from OPFS (`piper` directory)
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('piper', { create: true });
        const fileHandle = await dir.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        if (file && file.size > 1000) {
          const blob = new Blob([await file.arrayBuffer()], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          this.localAssetBlobUrls.set(fileName, blobUrl);
          return blobUrl;
        }
      }
    } catch {
      // File not in OPFS yet, check CacheStorage next
    }

    // 2. Try reading from CacheStorage (`voxread-piper-permanent-v1`)
    try {
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(PIPER_CACHE_NAME);
        const matched = await cache.match(remoteUrl);
        if (matched && matched.ok) {
          const buf = await matched.arrayBuffer();
          if (buf.byteLength > 1000) {
            const blob = new Blob([buf], { type: mimeType });
            // Also save into OPFS for next time
            this.writeAssetToOpfs(fileName, blob).catch(() => {});
            const blobUrl = URL.createObjectURL(blob);
            this.localAssetBlobUrls.set(fileName, blobUrl);
            return blobUrl;
          }
        }
      }
    } catch {
      // Ignore CacheStorage error
    }

    // 3. First time ever: download once from CDN and save permanently to both OPFS and CacheStorage
    try {
      const res = await fetch(remoteUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: mimeType });

        await Promise.allSettled([
          this.writeAssetToOpfs(fileName, blob),
          (async () => {
            if (typeof caches !== 'undefined') {
              const cache = await caches.open(PIPER_CACHE_NAME);
              await cache.put(
                remoteUrl,
                new Response(blob, {
                  headers: { 'Content-Type': mimeType },
                })
              );
            }
          })(),
        ]);

        const blobUrl = URL.createObjectURL(blob);
        this.localAssetBlobUrls.set(fileName, blobUrl);
        return blobUrl;
      }
    } catch {
      // Fallback to remoteUrl if offline and not cached
    }

    return remoteUrl;
  }

  private async writeAssetToOpfs(fileName: string, blob: Blob): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      return;
    }
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('piper', { create: true });
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /**
   * Checks if the voice `.onnx` model + phonemizer assets are already stored in OPFS.
   */
  public async isPiperVoiceCachedLocally(voiceId: PiperVoiceId): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
        return false;
      }
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('piper', { create: true });
      const onnxFile = await dir.getFileHandle(`${voiceId}.onnx`);
      const file = await onnxFile.getFile();
      return file.size > 100000;
    } catch {
      return false;
    }
  }

  /**
   * Automatically warms up the Piper Neural session in the background ONLY if it is already cached locally,
   * scheduled after initial UI mount so it never blocks startup or competes with PDF uploads.
   */
  public async warmUpPiperOnStartup(
    voiceId: PiperVoiceId = 'pt_BR-faber-medium'
  ): Promise<void> {
    try {
      const cached = await this.isPiperVoiceCachedLocally(voiceId);
      if (!cached) return;
      setTimeout(() => {
        this.getPiperSession(voiceId, true).catch(() => {});
      }, 900);
    } catch {
      // Ignore background warm-up errors
    }
  }

  private getCacheKey(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): string {
    return `piper_wasm:${settings.piperVoiceId}:${blockType || 'normal'}:${text}`;
  }

  /**
   * Pre-generates the audio Blob for the upcoming sentence in the background after a 320ms delay
   * so smooth scrolling and UI animations complete at 60fps before WASM inference runs.
   */
  public prefetch(
    text: string,
    blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): void {
    if (settings.prefetchNextSentence === false) return;

    const formatted = formatExpressiveTextForNeuralTts(text, blockType);
    if (!formatted) return;

    const key = this.getCacheKey(formatted, blockType, settings);
    if (this.audioBlobCache.has(key)) return;

    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
    }

    const expectedToken = this.playbackToken;
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null;
      if (expectedToken !== this.playbackToken) return;
      if (this.audioBlobCache.has(key)) return;

      if (this.audioBlobCache.size >= 25) {
        const oldestKey = this.audioBlobCache.keys().next().value;
        if (oldestKey) this.audioBlobCache.delete(oldestKey);
      }

      const blobPromise = this.synthesizeNeuralBlob(formatted, blockType, settings);
      blobPromise.catch(() => {
        this.audioBlobCache.delete(key);
      });
      this.audioBlobCache.set(key, blobPromise);
    }, 320);
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
    _blockType: SentenceBlockType | undefined,
    settings: VoiceSettings
  ): Promise<Blob> {
    return this.generatePiperWasmBlob(
      formattedText,
      settings.piperVoiceId || 'pt_BR-faber-medium'
    );
  }

  /**
   * Pre-downloads the selected Piper WASM voice model + phonemizer assets into permanent OPFS storage
   */
  public async preloadPiperVoice(voiceId: PiperVoiceId): Promise<void> {
    await this.ensurePersistentStorage();
    const alreadyCached = await this.isPiperVoiceCachedLocally(voiceId);

    if (!alreadyCached) {
      this.emitProgress({
        engine: 'piper_wasm',
        voiceId,
        percent: 5,
        statusText: `Salvando voz neural ${voiceId} permanentemente no navegador...`,
        isDownloading: true,
        isReady: false,
      });
    }

    await this.getPiperSession(voiceId, false);

    this.emitProgress({
      engine: 'piper_wasm',
      voiceId,
      percent: 100,
      statusText: `Voz neural ${voiceId} salva permanentemente (Carregamento Instantâneo)!`,
      isDownloading: false,
      isReady: true,
    });
  }

  /**
   * Initializes Piper TTS WebAssembly using permanently cached OPFS/CacheStorage blobs
   * so opening the site never re-downloads `piper_phonemize.data` or the `.onnx` model.
   */
  private async getPiperSession(
    voiceId: PiperVoiceId,
    silentIfCached = false
  ): Promise<any> {
    if (this.activePiperSessionPromise && this.activePiperVoiceId === voiceId) {
      return this.activePiperSessionPromise;
    }

    this.activePiperVoiceId = voiceId;
    this.activePiperSessionPromise = (async () => {
      const isAlreadyCached = await this.isPiperVoiceCachedLocally(voiceId);

      // Load or cache `piper_phonemize.data` (~22MB) and `piper_phonemize.wasm` (~1.5MB) locally
      const [localDataUrl, localWasmUrl] = await Promise.all([
        this.getOrCachePiperAssetBlobUrl(
          PIPER_WASM_PATHS.piperData,
          'piper_phonemize.data',
          'application/octet-stream'
        ),
        this.getOrCachePiperAssetBlobUrl(
          PIPER_WASM_PATHS.piperWasm,
          'piper_phonemize.wasm',
          'application/wasm'
        ),
      ]);

      const customWasmPaths = {
        onnxWasm: PIPER_WASM_PATHS.onnxWasm,
        piperData: localDataUrl,
        piperWasm: localWasmUrl,
      };

      const piper = await import('@mintplex-labs/piper-tts-web');
      (piper.TtsSession as any)._instance = null;
      (piper.TtsSession as any).WASM_LOCATIONS = customWasmPaths;

      const session = await piper.TtsSession.create({
        voiceId: voiceId as any,
        wasmPaths: customWasmPaths,
        progress: (prog: any) => {
          // Ignore internal chunk inference progress events
          if (prog?.url && String(prog.url).startsWith('tts://')) return;
          if (isAlreadyCached && silentIfCached) return;

          const pct = prog?.total
            ? Math.min(99, Math.round((prog.loaded * 100) / prog.total))
            : 50;
          this.emitProgress({
            engine: 'piper_wasm',
            voiceId,
            percent: pct,
            statusText: `Salvando voz neural no cache permanente (${pct}%)...`,
            isDownloading: true,
            isReady: false,
          });
        },
      });

      this.emitProgress({
        engine: 'piper_wasm',
        voiceId,
        percent: 100,
        statusText: `Voz neural ${voiceId} pronta no cache local`,
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
    const runInference = async (): Promise<Blob> => {
      // Yield 1 frame to the browser before running Emscripten + ONNX WASM inference
      await new Promise((r) => setTimeout(r, 12));
      const session = await this.getPiperSession(voiceId);
      const wavBlob: Blob = await session.predict(text);
      return wavBlob;
    };

    const nextInQueue = this.inferenceMutex.then(runInference, runInference);
    this.inferenceMutex = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  /**
   * Plays a WAV/MP3 Blob through HTMLAudioElement while driving the smooth BBox word progress cursor
   */
  private playAudioBlobWithWordProgress(params: {
    audioBlob: Blob;
    text: string;
    playbackRate: number;
    token: number;
    engine: TtsEngineMode;
    voiceLabel: string;
    latencyMs: number;
    onStart?: () => void;
    onWordProgress?: (charIndex: number, progressRatio: number) => void;
    onEnd?: () => void;
  }): Promise<boolean> {
    const {
      audioBlob,
      text,
      playbackRate,
      token,
      engine,
      voiceLabel,
      latencyMs,
      onStart,
      onWordProgress,
      onEnd,
    } = params;

    return new Promise<boolean>((resolve) => {
      if (token !== this.playbackToken) {
        resolve(false);
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.preservesPitch = true;
      (audio as any).mozPreservesPitch = true;
      (audio as any).webkitPreservesPitch = true;
      audio.playbackRate = computeCalibratedPlaybackRate(playbackRate);
      this.activeAudio = audio;

      const cleanup = () => {
        this.clearProgressTimer();
        URL.revokeObjectURL(audioUrl);
        if (this.activeAudio === audio) {
          this.activeAudio = null;
        }
      };

      audio.onplay = () => {
        if (token !== this.playbackToken) {
          cleanup();
          resolve(false);
          return;
        }
        this.emitEngineStatus({
          requested: engine,
          active: engine,
          voiceLabel,
          state: 'playing',
          latencyMs,
        });
        onStart?.();
        onWordProgress?.(0, 0);

        let lastEmittedRatio = 0;
        if (this.progressTimer) {
          clearInterval(this.progressTimer);
        }
        this.progressTimer = setInterval(() => {
          if (token !== this.playbackToken || !this.activeAudio) {
            if (this.progressTimer) {
              clearInterval(this.progressTimer);
              this.progressTimer = null;
            }
            return;
          }
          const duration = audio.duration;
          if (duration && Number.isFinite(duration) && duration > 0) {
            const ratio = Math.min(1, Math.max(0, audio.currentTime / duration));
            if (Math.abs(ratio - lastEmittedRatio) >= 0.035 || ratio >= 0.98) {
              lastEmittedRatio = ratio;
              const approxChar = Math.floor(ratio * text.length);
              onWordProgress?.(approxChar, ratio);
            }
          }
        }, 120);
      };

      audio.onended = () => {
        cleanup();
        if (token === this.playbackToken) {
          onWordProgress?.(text.length, 1);
          onEnd?.();
        }
        resolve(true);
      };

      audio.onerror = () => {
        cleanup();
        resolve(false);
      };

      audio.play().catch(() => {
        cleanup();
        resolve(false);
      });
    });
  }

  public async playAudioBlobDirect(
    blob: Blob,
    playbackRate = 1.0
  ): Promise<boolean> {
    this.stopSpeaking();
    const currentToken = ++this.playbackToken;
    return this.playAudioBlobWithWordProgress({
      audioBlob: blob,
      text: 'Teste de voz neural.',
      playbackRate,
      token: currentToken,
      engine: 'piper_wasm',
      voiceLabel: 'Teste Direto de Áudio',
      latencyMs: 0,
    });
  }

  public async runVoiceDiagnostics(
    settings: VoiceSettings
  ): Promise<VoiceDiagnosticResult[]> {
    const sampleText =
      'Atenção! Na Administração Pública, o gestor só age quando a lei autoriza.';
    const formatted = formatExpressiveTextForNeuralTts(sampleText, 'alert');
    const t0 = performance.now();

    try {
      const blob = await this.generatePiperWasmBlob(
        formatted,
        settings.piperVoiceId || 'pt_BR-faber-medium'
      );
      return [
        {
          engine: 'piper_wasm',
          voiceLabel: `Piper Neural WASM (${
            settings.piperVoiceId || 'pt_BR-faber-medium'
          })`,
          ok: true,
          latencyMs: Math.round(performance.now() - t0),
          audioBlob: blob,
        },
      ];
    } catch (err: any) {
      return [
        {
          engine: 'piper_wasm',
          voiceLabel: `Piper Neural WASM (${
            settings.piperVoiceId || 'pt_BR-faber-medium'
          })`,
          ok: false,
          latencyMs: Math.round(performance.now() - t0),
          error: err?.message || String(err),
        },
      ];
    }
  }

  /**
   * Main entry point for speaking a sentence using Piper Neural WASM
   */
  public async speak(options: SpeakOptions): Promise<void> {
    const {
      text,
      blockType,
      settings,
      onStart,
      onWordProgress,
      onEnd,
      onError,
    } = options;

    this.stopSpeaking();
    const currentToken = ++this.playbackToken;

    const cleanText = text.trim();
    if (!cleanText) {
      onEnd?.();
      return;
    }

    const formattedText = settings.expressiveProsody
      ? formatExpressiveTextForNeuralTts(cleanText, blockType)
      : cleanText;

    const requestedLabel = getEngineVoiceLabel(settings);
    const t0 = performance.now();

    this.emitEngineStatus({
      requested: 'piper_wasm',
      active: null,
      voiceLabel: requestedLabel,
      state: 'loading',
    });

    try {
      const blob = await this.getOrSynthesizeBlob(
        formattedText,
        blockType,
        settings
      );
      if (currentToken !== this.playbackToken) return;

      const latencyMs = Math.round(performance.now() - t0);
      const ok = await this.playAudioBlobWithWordProgress({
        audioBlob: blob,
        text: cleanText,
        playbackRate: settings.rate || 0.85,
        token: currentToken,
        engine: 'piper_wasm',
        voiceLabel: requestedLabel,
        latencyMs,
        onStart,
        onWordProgress,
        onEnd,
      });
      if (ok) return;
      throw new Error('O navegador bloqueou a reprodução automática de áudio.');
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      this.emitEngineStatus({
        requested: 'piper_wasm',
        active: null,
        voiceLabel: requestedLabel,
        state: 'failed',
        error: errorMessage,
      });
      onError?.(`Falha no motor Piper Neural: ${errorMessage}`);
    }
  }

  public startListening(callbacks: {
    onInterimResult?: (transcript: string) => void;
    onFinalResult: (transcript: string) => void;
    onError?: (errorMsg: string) => void;
    onEnd?: () => void;
  }): void {
    this.stopSpeaking();
    this.stopListening();

    if (!this.isSttSupported()) {
      callbacks.onError?.(
        'Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge.'
      );
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionCtor();
    this.recognition = recognition;
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      this.isListening = true;
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }
      if (interim) {
        callbacks.onInterimResult?.(interim.trim());
      }
    };

    recognition.onerror = (event: any) => {
      this.isListening = false;
      if (event.error === 'no-speech') {
        callbacks.onError?.('Nenhuma fala detectada no microfone.');
      } else if (event.error === 'not-allowed') {
        callbacks.onError?.(
          'Permissão de microfone negada. Autorize o microfone no navegador.'
        );
      } else {
        callbacks.onError?.(`Erro no microfone: ${event.error}`);
      }
    };

    recognition.onend = () => {
      this.isListening = false;
      const cleaned = finalTranscript.trim();
      if (cleaned) {
        callbacks.onFinalResult(cleaned);
      } else {
        callbacks.onEnd?.();
      }
    };

    try {
      recognition.start();
    } catch {
      this.isListening = false;
      callbacks.onError?.('Não foi possível iniciar a captura de voz.');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop errors
      }
    }
    this.isListening = false;
  }
}

export const speechService = new SpeechService();
