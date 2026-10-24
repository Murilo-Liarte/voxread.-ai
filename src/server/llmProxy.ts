export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmChatRequestBody {
  provider: 'gemini' | 'openai' | 'claude' | 'deepseek' | 'kimi' | 'glm' | 'custom';
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

const DEFAULT_BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  kimi: 'https://api.moonshot.cn/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  custom: 'https://openrouter.ai/api/v1',
};

export function buildProviderRequest(req: LlmChatRequestBody): PreparedProviderRequest {
  const { provider, apiKey, model, systemPrompt, messages, temperature = 0.4 } = req;
  const trimmedKey = apiKey.trim();
  const baseUrl = (req.baseUrl?.trim() || DEFAULT_BASE_URLS[provider] || DEFAULT_BASE_URLS.openai).replace(/\/+$/, '');

  if (provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(trimmedKey)}`;
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
        contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Olá' }] }],
        generationConfig: {
          temperature,
        },
      }),
    };
  }

  if (provider === 'claude') {
    const url = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
    const anthropicMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': trimmedKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: anthropicMessages.length > 0 ? anthropicMessages : [{ role: 'user', content: 'Olá' }],
        temperature,
      }),
    };
  }

  // OpenAI-compatible providers: openai, deepseek, kimi, glm, custom (OpenRouter, Groq, etc.)
  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const openAiMessages: ChatMessagePayload[] = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...messages.filter((m) => m.role !== 'system'),
  ];

  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${trimmedKey}`,
    },
    body: JSON.stringify({
      model,
      messages: openAiMessages,
      temperature,
    }),
  };
}

export function extractProviderText(provider: LlmChatRequestBody['provider'], data: any): string {
  if (!data) return '';

  if (provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: any) => p.text || '').join('').trim();
    }
    return '';
  }

  if (provider === 'claude') {
    const content = data?.content;
    if (Array.isArray(content)) {
      return content
        .filter((item: any) => item.type === 'text' || typeof item.text === 'string')
        .map((item: any) => item.text || '')
        .join('')
        .trim();
    }
    return '';
  }

  // OpenAI-compatible
  const choice = data?.choices?.[0];
  if (choice?.message?.content) {
    return String(choice.message.content).trim();
  }
  return '';
}
