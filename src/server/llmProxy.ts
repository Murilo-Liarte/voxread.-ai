export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmChatRequestBody {
  provider: 'gemini';
  apiKey: string;
  model: string;
  baseUrl?: string;
  systemPrompt: string;
  messages: ChatMessagePayload[];
  temperature?: number;
}

export interface PreparedProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export const GEMINI_DEFAULT_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta';

export function buildProviderRequest(
  req: LlmChatRequestBody
): PreparedProviderRequest {
  const { apiKey, model, systemPrompt, messages, temperature = 0.4 } = req;
  const trimmedKey = apiKey.trim();
  const baseUrl = (req.baseUrl?.trim() || GEMINI_DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  );
  const cleanModel = model.replace(/^models\//, '').trim() || 'gemini-3.5-flash-lite';

  const url = `${baseUrl}/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(trimmedKey)}`;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  return {
    url,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(systemPrompt
        ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
        : {}),
      contents:
        contents.length > 0
          ? contents
          : [{ role: 'user', parts: [{ text: 'Olá' }] }],
      generationConfig: {
        temperature,
      },
    }),
  };
}

export function extractProviderText(
  _provider: LlmChatRequestBody['provider'],
  data: any
): string {
  if (!data) return '';
  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p: any) => p.text || '').join('').trim();
  }
  return '';
}
