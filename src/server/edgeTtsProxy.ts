import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { EdgeTTS } from 'edge-tts-universal';

export interface EdgeWordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
  charIndex: number;
}

export interface EdgeTtsRequestBody {
  text: string;
  voice: string;
  rate?: string; // e.g. "+10%" or "-5%"
  pitch?: string; // e.g. "+2Hz" or "-2Hz"
  volume?: string; // e.g. "+0%"
}

export interface EdgeTtsResponsePayload {
  audioBase64: string;
  mimeType: string;
  voice: string;
  engine: 'msedge-tts' | 'edge-tts-universal';
  wordBoundaries: EdgeWordBoundary[];
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
 * Synthesizes speech using `edge-tts-universal` (Bing ReadAloud neural WebSocket)
 * and falls back to `msedge-tts` (Azure Edge Cognitive Services neural WebSocket).
 */
export async function synthesizeWithEdgeTtsNode(
  body: EdgeTtsRequestBody
): Promise<EdgeTtsResponsePayload> {
  const text = (body.text || '').trim();
  const voice = (body.voice || 'pt-BR-FranciscaNeural').trim();
  const rate = body.rate || '+0%';
  const pitch = body.pitch || '+0Hz';
  const volume = body.volume || '+0%';

  if (!text) {
    throw new Error('Texto vazio para síntese no msedge-tts.');
  }

  // Attempt 1: edge-tts-universal (supports WordBoundary subtitles + MP3 buffer)
  try {
    const tts = new EdgeTTS(text, voice, {
      rate,
      pitch,
      volume,
    });
    const result = await tts.synthesize();
    const arrayBuffer = await result.audio.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (audioBuffer.length > 0) {
      const rawBoundaries = (result.subtitle || []).map((s: any) => ({
        text: String(s.part || s.text || ''),
        offsetMs: Math.round(Number(s.start || 0)),
        durationMs: Math.round(Math.max(50, Number(s.end || 0) - Number(s.start || 0))),
      }));

      return {
        audioBase64: audioBuffer.toString('base64'),
        mimeType: 'audio/mpeg',
        voice,
        engine: 'edge-tts-universal',
        wordBoundaries: mapWordBoundariesToCharIndices(text, rawBoundaries),
      };
    }
  } catch {
    // Proceed to Attempt 2 (msedge-tts)
  }

  // Attempt 2: msedge-tts package (with WordBoundary metadata enabled)
  const msTts = new MsEdgeTTS();
  await msTts.setMetadata(
    voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    {
      wordBoundaryEnabled: true,
      sentenceBoundaryEnabled: false,
    }
  );

  const { audioStream, metadataStream } = msTts.toStream(text, {
    rate,
    pitch,
  });

  const audioChunks: Buffer[] = [];
  const rawWords: Array<{ text: string; offsetMs: number; durationMs: number }> = [];

  if (metadataStream) {
    metadataStream.on('data', (chunk: Buffer) => {
      try {
        const parsed = JSON.parse(chunk.toString('utf-8'));
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
        // Ignore malformed metadata packet
      }
    });
  }

  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (chunk: Buffer) => {
      audioChunks.push(Buffer.from(chunk));
    });
    audioStream.on('end', () => resolve());
    audioStream.on('close', () => resolve());
    audioStream.on('error', (err: Error) => reject(err));
  });

  msTts.close();

  const fullBuffer = Buffer.concat(audioChunks);
  if (fullBuffer.length === 0) {
    throw new Error('msedge-tts retornou stream de áudio vazio.');
  }

  return {
    audioBase64: fullBuffer.toString('base64'),
    mimeType: 'audio/mpeg',
    voice,
    engine: 'msedge-tts',
    wordBoundaries: mapWordBoundariesToCharIndices(text, rawWords),
  };
}
