/**
 * Cloudflare Worker Proxy for Microsoft Edge Read-Aloud Neural TTS
 * Voices: pt-BR-FranciscaNeural, pt-BR-ThalitaMultilingualNeural, pt-BR-AntonioNeural
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '130.0.2849.68';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WINDOWS_EPOCH_OFFSET = 11644473600n;

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function generateSecMsGec(): Promise<string> {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  let ticks = nowSec + WINDOWS_EPOCH_OFFSET;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const strToHash = `${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`;
  const data = new TextEncoder().encode(strToHash);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'VoxRead Edge Neural TTS Worker',
          usage: 'POST { text, voice, rate, pitch }',
        }),
        {
          status: 200,
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const body = (await request.json()) as {
        text?: string;
        voice?: string;
        rate?: number;
        pitch?: string;
      };

      const text = (body.text || '').trim();
      if (!text) {
        return new Response(JSON.stringify({ error: 'Texto vazio.' }), {
          status: 400,
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      const voice = body.voice || 'pt-BR-FranciscaNeural';
      const rateNum = typeof body.rate === 'number' ? body.rate : 1.05;
      const ratePct = Math.round((rateNum - 1) * 100);
      const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
      const pitchStr = body.pitch || '+0Hz';

      const secMsGec = await generateSecMsGec();
      const connectionId = crypto.randomUUID().replace(/-/g, '');
      const wsUrl = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

      const upgradeRes = await fetch(wsUrl, {
        headers: {
          Upgrade: 'websocket',
          Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        },
      });

      const ws = (upgradeRes as any).webSocket as WebSocket | undefined;
      if (!ws) {
        return new Response(
          JSON.stringify({
            error: `Falha ao abrir WebSocket com Edge TTS (HTTP ${upgradeRes.status}).`,
          }),
          {
            status: 502,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
          }
        );
      }

      ws.accept();

      const audioChunks: Uint8Array[] = [];
      const requestId = crypto.randomUUID().replace(/-/g, '');

      const audioBuffer = await new Promise<Uint8Array>((resolve, reject) => {
        const timeout = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          reject(new Error('Timeout aguardando stream do Edge Neural TTS.'));
        }, 12000);

        ws.addEventListener('message', (event: MessageEvent) => {
          if (typeof event.data === 'string') {
            if (event.data.includes('Path:turn.end')) {
              clearTimeout(timeout);
              try {
                ws.close();
              } catch {}
              const totalLen = audioChunks.reduce((acc, c) => acc + c.byteLength, 0);
              const merged = new Uint8Array(totalLen);
              let offset = 0;
              for (const chunk of audioChunks) {
                merged.set(chunk, offset);
                offset += chunk.byteLength;
              }
              resolve(merged);
            }
          } else if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            const headerLen = view.getUint16(0, false);
            if (event.data.byteLength > headerLen + 2) {
              const mp3Slice = new Uint8Array(event.data, headerLen + 2);
              audioChunks.push(mp3Slice);
            }
          }
        });

        ws.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('Erro no WebSocket do Edge Neural TTS.'));
        });

        // 1. Send speech.config
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
                    wordBoundaryEnabled: 'false',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        ws.send(configMsg);

        // 2. Send SSML
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>` +
          `<voice name='${voice}'>` +
          `<prosody pitch='${pitchStr}' rate='${rateStr}' volume='+0%'>` +
          `${escapeXml(text)}` +
          `</prosody></voice></speak>`;

        const ssmlMsg =
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${new Date().toISOString()}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml;
        ws.send(ssmlMsg);
      });

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Erro interno no Worker Edge TTS.' }),
        {
          status: 500,
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
