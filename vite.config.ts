import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildProviderRequest, extractProviderText, type LlmChatRequestBody } from './src/server/llmProxy';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { IncomingMessage, ServerResponse } from 'http';

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function llmProxyPlugin(): Plugin {
  const attachMiddleware = (middlewares: any) => {
    // 1. Multi-LLM Chat Proxy
    middlewares.use('/api/llm/chat', async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Método não permitido. Use POST.' });
      }

      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as LlmChatRequestBody;

        if (!body.apiKey || !body.apiKey.trim()) {
          return sendJson(res, 400, { error: 'Chave de API (apiKey) não fornecida.' });
        }
        if (!body.model || !body.model.trim()) {
          return sendJson(res, 400, { error: 'Modelo (model) não especificado.' });
        }

        const prepared = buildProviderRequest(body);
        const upstreamRes = await fetch(prepared.url, {
          method: 'POST',
          headers: prepared.headers,
          body: prepared.body,
        });

        const responseText = await upstreamRes.text();
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(responseText);
        } catch {
          parsedData = { raw: responseText };
        }

        if (!upstreamRes.ok) {
          const upstreamError =
            parsedData?.error?.message ||
            parsedData?.message ||
            parsedData?.detail ||
            `Erro HTTP ${upstreamRes.status} ao comunicar com ${body.provider.toUpperCase()}`;
          return sendJson(res, upstreamRes.status, {
            error: upstreamError,
            details: parsedData,
          });
        }

        const reply = extractProviderText(body.provider, parsedData);
        if (!reply) {
          return sendJson(res, 502, {
            error: 'O provedor respondeu, mas não retornou texto válido.',
            details: parsedData,
          });
        }

        return sendJson(res, 200, { reply, provider: body.provider, model: body.model });
      } catch (err: any) {
        return sendJson(res, 500, {
          error: err?.message || 'Erro interno no proxy de IA.',
        });
      }
    });

    // 2. Zero-API Microsoft Edge Neural TTS Proxy (pt-BR-FranciscaNeural, pt-BR-AntonioNeural, etc.)
    middlewares.use('/api/llm/edge-tts', async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Método não permitido. Use POST.' });
      }

      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as {
          text: string;
          voice?: string;
          rate?: number;
          pitch?: string;
        };

        if (!body.text?.trim()) {
          return sendJson(res, 400, { error: 'Texto vazio para Edge TTS.' });
        }

        const tts = new MsEdgeTTS();
        const voiceName = body.voice || 'pt-BR-FranciscaNeural';
        await tts.setMetadata(
          voiceName,
          OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
        );

        const ratePct = Math.round(((body.rate || 1.0) - 1.0) * 100);
        const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;

        const { audioStream } = tts.toStream(body.text, {
          rate: rateStr,
          pitch: body.pitch || '+0Hz',
        });

        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          audioStream.on('data', (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
          });
          audioStream.on('end', () => resolve());
          audioStream.on('error', (err: any) => reject(err));
        });

        const finalBuffer = Buffer.concat(chunks);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.end(finalBuffer);
      } catch (err: any) {
        return sendJson(res, 500, {
          error: err?.message || 'Erro ao sintetizar voz Edge Neural.',
        });
      }
    });

    // 3. Optional OpenAI Cloud TTS Proxy
    middlewares.use('/api/llm/tts', async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Método não permitido. Use POST.' });
      }

      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody) as {
          apiKey: string;
          text: string;
          voice?: string;
          speed?: number;
          baseUrl?: string;
        };

        if (!body.apiKey?.trim()) {
          return sendJson(res, 400, { error: 'API Key para OpenAI TTS não informada.' });
        }

        const baseUrl = (body.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const upstreamRes = await fetch(`${baseUrl}/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${body.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: body.text,
            voice: body.voice || 'nova',
            speed: body.speed || 1.0,
          }),
        });

        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          return sendJson(res, upstreamRes.status, {
            error: `Falha no TTS via API (${upstreamRes.status}): ${errText}`,
          });
        }

        const arrayBuffer = await upstreamRes.arrayBuffer();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.end(Buffer.from(arrayBuffer));
      } catch (err: any) {
        return sendJson(res, 500, { error: err?.message || 'Erro no proxy TTS.' });
      }
    });
  };

  return {
    name: 'vite-plugin-multi-llm-proxy',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), llmProxyPlugin()],
  optimizeDeps: {
    exclude: ['@mintplex-labs/piper-tts-web', 'onnxruntime-web'],
  },
});
