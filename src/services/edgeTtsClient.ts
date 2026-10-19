import type {
  EdgeNeuralVoiceId,
  EdgeVoiceMetadata,
  SentenceBlockType,
} from '../types';

export interface EdgeWordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
  charIndex: number;
}

export interface EdgeSynthesisResult {
  audioBlob: Blob;
  wordBoundaries: EdgeWordBoundary[];
  engineUsed: 'msedge-tts-node' | 'edge-tts-ws';
}

export const EDGE_NEURAL_VOICES: EdgeVoiceMetadata[] = [
  {
    id: 'pt-BR-FranciscaNeural',
    shortName: 'Francisca Neural',
    label: 'Francisca Neural (Feminina • Calorosa e Expressiva)',
    gender: 'Feminina',
    styleTag: 'Acolhedora & Natural',
    description:
      'Voz neural mais famosa do Microsoft Edge. Entonação humana, acolhedora e fluida para longas horas de estudo.',
    recommended: true,
  },
  {
    id: 'pt-BR-AntonioNeural',
    shortName: 'Antonio Neural',
    label: 'Antonio Neural (Masculina • Professor Firme e Claro)',
    gender: 'Masculina',
    styleTag: 'Didática & Firme',
    description:
      'Voz clássica de professor de cursinho: dicção extremamente nítida, cadência firme e autoridade em textos jurídicos.',
    recommended: true,
  },
  {
    id: 'pt-BR-ThalitaMultilingualNeural',
    shortName: 'Thalita HD Multilingual',
    label: 'Thalita Multilingual Neural (Feminina • Ultra Realista HD)',
    gender: 'Feminina',
    styleTag: 'Neural HD 2.0',
    description:
      'Geração mais recente da Microsoft com transições de fôlego naturais e pronúncia impecável de termos estrangeiros.',
    recommended: true,
  },
  {
    id: 'pt-BR-ValerioNeural',
    shortName: 'Valério Neural',
    label: 'Valério Neural (Masculina • Mentor Carismático)',
    gender: 'Masculina',
    styleTag: 'Expressiva & Dinâmica',
    description:
      'Tom expressivo, engajador e com ótima modulação em perguntas e alertas de prova.',
  },
  {
    id: 'pt-BR-BrendaNeural',
    shortName: 'Brenda Neural',
    label: 'Brenda Neural (Feminina • Dinâmica e Ágil)',
    gender: 'Feminina',
    styleTag: 'Jovem & Dinâmica',
    description:
      'Excelente para leitura dinâmica em velocidades 1.15x a 1.5x sem perder a clareza das sílabas.',
  },
  {
    id: 'pt-BR-DonatoNeural',
    shortName: 'Donato Neural',
    label: 'Donato Neural (Masculina • Serena e Pausada)',
    gender: 'Masculina',
    styleTag: 'Serena & Jurídica',
    description:
      'Timbre calmo e articulado, ideal para leitura de legislação seca, súmulas e jurisprudência.',
  },
  {
    id: 'pt-BR-GiovannaNeural',
    shortName: 'Giovanna Neural',
    label: 'Giovanna Neural (Feminina • Vibrante e Enfática)',
    gender: 'Feminina',
    styleTag: 'Enfática & Viva',
    description:
      'Voz vibrante que destaca muito bem pegadinhas de banca, exceções e prazos.',
  },
  {
    id: 'pt-BR-HumbertoNeural',
    shortName: 'Humberto Neural',
    label: 'Humberto Neural (Masculina • Grave de Sala de Aula)',
    gender: 'Masculina',
    styleTag: 'Grave & Madura',
    description:
      'Timbre grave e encorpado que reduz a fadiga auditiva em sessões noturnas de estudo.',
  },
  {
    id: 'pt-BR-JulioNeural',
    shortName: 'Julio Neural',
    label: 'Julio Neural (Masculina • Objetiva e Direta)',
    gender: 'Masculina',
    styleTag: 'Ágil & Direta',
    description:
      'Cadência rápida e objetiva para revisão acelerada de PDFs extensos.',
  },
  {
    id: 'pt-BR-LeilaNeural',
    shortName: 'Leila Neural',
    label: 'Leila Neural (Feminina • Suave e Focada)',
    gender: 'Feminina',
    styleTag: 'Calma & Suave',
    description:
      'Entonação serena que favorece o estado de fluxo (Flow State) e concentração profunda.',
  },
  {
    id: 'pt-BR-LeticiaNeural',
    shortName: 'Letícia Neural',
    label: 'Letícia Neural (Feminina • Didática e Articulada)',
    gender: 'Feminina',
    styleTag: 'Didática & Clara',
    description:
      'Ótima separação silábica e entonação de explicação passo a passo.',
  },
  {
    id: 'pt-BR-ManuelaNeural',
    shortName: 'Manuela Neural',
    label: 'Manuela Neural (Feminina • Equilibrada e Natural)',
    gender: 'Feminina',
    styleTag: 'Natural & Fluida',
    description:
      'Voz neutra-expressiva com ritmo constante para leitura de doutrina.',
  },
  {
    id: 'pt-BR-NicolauNeural',
    shortName: 'Nicolau Neural',
    label: 'Nicolau Neural (Masculina • Formal e Precisa)',
    gender: 'Masculina',
    styleTag: 'Formal & Técnica',
    description:
      'Ideal para matérias técnicas como Contabilidade, TI, Economia e Direito Tributário.',
  },
  {
    id: 'pt-BR-YaraNeural',
    shortName: 'Yara Neural',
    label: 'Yara Neural (Feminina • Moderna e Cristalina)',
    gender: 'Feminina',
    styleTag: 'Moderna & Limpa',
    description:
      'Timbre limpo e contemporâneo, excelente para leitura de flashcards e resumos esquemáticos.',
  },
];

export function getEdgeVoiceMeta(voiceId: EdgeNeuralVoiceId): EdgeVoiceMetadata {
  return (
    EDGE_NEURAL_VOICES.find((v) => v.id === voiceId) || EDGE_NEURAL_VOICES[0]
  );
}

export interface ComputedEdgeProsody {
  rateStr: string;
  pitchStr: string;
  numericRate: number;
  numericPitch: number;
}

/**
 * Computes expressive prosody parameters for `msedge-tts` / `edge-tts`
 * based on user speed/pitch settings and the semantic block type (alert, heading, question).
 */
export function computeEdgeProsody(
  baseRate: number,
  basePitch: number,
  blockType: SentenceBlockType | undefined,
  text: string,
  expressive = true
): ComputedEdgeProsody {
  let effectiveRate = baseRate || 1.05;
  let effectivePitch = basePitch || 1.0;

  if (expressive) {
    if (blockType === 'alert') {
      // Slightly more deliberate cadence + higher pitch emphasis for exam traps
      effectiveRate = effectiveRate * 0.96;
      effectivePitch = effectivePitch + 0.05;
    } else if (blockType === 'heading') {
      // Clear chapter/topic announcement cadence
      effectiveRate = effectiveRate * 0.93;
      effectivePitch = effectivePitch - 0.02;
    } else if (text.includes('?')) {
      effectivePitch = effectivePitch + 0.04;
    } else if (text.includes('!')) {
      effectivePitch = effectivePitch + 0.03;
    }
  }

  effectiveRate = Math.min(2.0, Math.max(0.65, effectiveRate));
  effectivePitch = Math.min(1.35, Math.max(0.75, effectivePitch));

  const ratePercent = Math.round((effectiveRate - 1.0) * 100);
  const pitchHz = Math.round((effectivePitch - 1.0) * 50);

  return {
    rateStr: `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`,
    pitchStr: `${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`,
    numericRate: effectiveRate,
    numericPitch: effectivePitch,
  };
}

const audioCache = new Map<string, EdgeSynthesisResult>();
const MAX_CACHE_ENTRIES = 45;

function setCacheEntry(key: string, val: EdgeSynthesisResult) {
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = audioCache.keys().next().value;
    if (firstKey) audioCache.delete(firstKey);
  }
  audioCache.set(key, val);
}

function base64ToBlob(base64: string, mimeType = 'audio/mpeg'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function randomHex(bytesLen: number): string {
  const arr = new Uint8Array(bytesLen);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytesLen; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateSecMsGecBrowser(trustedClientToken: string): Promise<string> {
  const WIN_EPOCH = 11644473600;
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 10000000;
  const strToHash = `${ticks.toFixed(0)}${trustedClientToken}`;
  const data = new TextEncoder().encode(strToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function mapWordBoundariesToCharIndices(
  fullText: string,
  rawWords: Array<{ text: string; offsetMs: number; durationMs: number }>
): EdgeWordBoundary[] {
  const result: EdgeWordBoundary[] = [];
  let searchFrom = 0;

  for (const w of rawWords) {
    const cleanWord = (w.text || '').trim();
    if (!cleanWord) continue;
    const foundIdx = fullText.indexOf(cleanWord, searchFrom);
    const charIndex = foundIdx !== -1 ? foundIdx : searchFrom;
    if (foundIdx !== -1) {
      searchFrom = foundIdx + cleanWord.length;
    }
    result.push({
      text: cleanWord,
      offsetMs: w.offsetMs,
      durationMs: w.durationMs,
      charIndex,
    });
  }

  return result;
}

/**
 * Direct Browser WebSocket client for `msedge-tts` / `edge-tts` protocol.
 */
async function synthesizeWithBrowserEdgeWebSocket(
  text: string,
  voice: EdgeNeuralVoiceId,
  prosody: ComputedEdgeProsody
): Promise<EdgeSynthesisResult> {
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const secMsGec = await generateSecMsGecBrowser(TRUSTED_CLIENT_TOKEN);
  const connId = randomHex(16);

  const endpoints = [
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connId}`,
    `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`,
  ];

  let lastError: Error | null = null;

  for (const wsUrl of endpoints) {
    try {
      const res = await new Promise<EdgeSynthesisResult>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        const audioParts: Uint8Array[] = [];
        const rawWords: Array<{ text: string; offsetMs: number; durationMs: number }> = [];
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              ws.close();
            } catch {
              // Ignore
            }
            reject(new Error('Timeout na conexão WebSocket Edge TTS.'));
          }
        }, 7000);

        ws.onopen = () => {
          const configMsg =
            `X-Timestamp:${new Date().toISOString()}\r\n` +
            `Content-Type:application/json; charset=utf-8\r\n` +
            `Path:speech.config\r\n\r\n` +
            JSON.stringify({
              context: {
                synthesis: {
                  audio: {
                    metadataoptions: {
                      sentenceBoundaryEnabled: 'false',
                      wordBoundaryEnabled: 'true',
                    },
                    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                  },
                },
              },
            });
          ws.send(configMsg);

          const requestId = randomHex(16);
          const ssml =
            `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>` +
            `<voice name='${voice}'>` +
            `<prosody pitch='${prosody.pitchStr}' rate='${prosody.rateStr}' volume='+0%'>` +
            `${escapeXml(text)}` +
            `</prosody></voice></speak>`;

          const ssmlMsg =
            `X-RequestId:${requestId}\r\n` +
            `Content-Type:application/ssml+xml\r\n` +
            `X-Timestamp:${new Date().toISOString()}Z\r\n` +
            `Path:ssml\r\n\r\n` +
            ssml;
          ws.send(ssmlMsg);
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            if (event.data.includes('Path:audio.metadata')) {
              const jsonStart = event.data.indexOf('{');
              if (jsonStart !== -1) {
                try {
                  const parsed = JSON.parse(event.data.slice(jsonStart));
                  if (Array.isArray(parsed?.Metadata)) {
                    for (const item of parsed.Metadata) {
                      if (item?.Type === 'WordBoundary' && item?.Data) {
                        rawWords.push({
                          text: String(item.Data?.text?.Text || ''),
                          offsetMs: Math.round(Number(item.Data?.Offset || 0) / 10000),
                          durationMs: Math.round(Number(item.Data?.Duration || 0) / 10000),
                        });
                      }
                    }
                  }
                } catch {
                  // Ignore metadata parse errors
                }
              }
            } else if (event.data.includes('Path:turn.end')) {
              clearTimeout(timeout);
              if (!settled) {
                settled = true;
                try {
                  ws.close();
                } catch {
                  // Ignore
                }
                if (audioParts.length === 0) {
                  reject(new Error('Stream Edge TTS encerrou sem bytes de áudio.'));
                  return;
                }
                const blob = new Blob(audioParts, { type: 'audio/mpeg' });
                resolve({
                  audioBlob: blob,
                  wordBoundaries: mapWordBoundariesToCharIndices(text, rawWords),
                  engineUsed: 'edge-tts-ws',
                });
              }
            }
          } else if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            if (event.data.byteLength > 2) {
              const headerLen = view.getUint16(0, false);
              if (event.data.byteLength > headerLen + 2) {
                const mp3Chunk = new Uint8Array(event.data, headerLen + 2);
                audioParts.push(mp3Chunk);
              }
            }
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            reject(new Error('Falha no WebSocket direto do Edge TTS.'));
          }
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          if (!settled) {
            settled = true;
            if (audioParts.length > 0) {
              resolve({
                audioBlob: new Blob(audioParts, { type: 'audio/mpeg' }),
                wordBoundaries: mapWordBoundariesToCharIndices(text, rawWords),
                engineUsed: 'edge-tts-ws',
              });
            } else {
              reject(new Error('Conexão WebSocket Edge TTS fechada prematuramente.'));
            }
          }
        };
      });

      return res;
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('Não foi possível conectar ao WebSocket do Edge TTS.');
}

/**
 * Synthesizes speech using `msedge-tts` / `edge-tts`:
 * 1. Checks in-memory LRU cache first.
 * 2. Calls `/api/llm/edge-tts` (Node `msedge-tts` + `edge-tts-universal` backend).
 * 3. Falls back to direct Browser WebSocket (`edge-tts` protocol).
 */
export async function synthesizeEdgeTts(
  text: string,
  voice: EdgeNeuralVoiceId,
  prosody: ComputedEdgeProsody
): Promise<EdgeSynthesisResult> {
  const cacheKey = `${voice}|${prosody.rateStr}|${prosody.pitchStr}|${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Layer 1: Node backend `/api/llm/edge-tts` (`msedge-tts` / `edge-tts-universal`)
  try {
    const response = await fetch('/api/llm/edge-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        rate: prosody.rateStr,
        pitch: prosody.pitchStr,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.audioBase64) {
        const result: EdgeSynthesisResult = {
          audioBlob: base64ToBlob(data.audioBase64, data.mimeType || 'audio/mpeg'),
          wordBoundaries: Array.isArray(data.wordBoundaries) ? data.wordBoundaries : [],
          engineUsed: 'msedge-tts-node',
        };
        setCacheEntry(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Proceed to Layer 2 (Direct Browser WebSocket)
  }

  // Layer 2: Direct Browser Edge TTS WebSocket
  const wsResult = await synthesizeWithBrowserEdgeWebSocket(text, voice, prosody);
  setCacheEntry(cacheKey, wsResult);
  return wsResult;
}
