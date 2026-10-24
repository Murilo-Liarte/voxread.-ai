import { buildProviderRequest, extractProviderText } from '../server/llmProxy';
import type {
  ConversationMessage,
  LLMProviderId,
  PDFDocumentData,
  ProviderConfig,
  ProviderMetadata,
} from '../types';

export const PROVIDERS_CATALOG: Record<LLMProviderId, ProviderMetadata> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recomendado - Rápido)', description: 'Ideal para respostas de voz instantâneas' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Raciocínio profundo para PDFs complexos' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Baixa latência e alta fluidez' },
    ],
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    shortName: 'ChatGPT',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Rápido)', description: 'Respostas ágeis para leitura assistida' },
      { id: 'gpt-4o', label: 'GPT-4o', description: 'Modelo multimodal de alta precisão' },
      { id: 'o3-mini', label: 'o3-mini', description: 'Focado em lógica, ciência e código' },
    ],
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    supportsCloudTts: true,
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-latest',
    models: [
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', description: 'Excelente didática e análise textual' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', description: 'Equilíbrio entre inteligência e velocidade' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Rápido)', description: 'Respostas ultra-rápidas' },
    ],
    keyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    badgeColor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 (deepseek-chat)', description: 'Rápido, preciso e excelente custo-benefício' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (deepseek-reasoner)', description: 'Raciocínio avançado passo a passo' },
    ],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    shortName: 'Kimi',
    badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    models: [
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32K', description: 'Ótimo para janelas longas de documentos' },
      { id: 'moonshot-v1-8k', label: 'Moonshot v1 8K (Rápido)', description: 'Baixa latência para conversação' },
      { id: 'kimi-latest', label: 'Kimi Latest', description: 'Versão mais recente do Kimi' },
    ],
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  glm: {
    id: 'glm',
    name: 'GLM (Zhipu AI)',
    shortName: 'GLM',
    badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4 Flash (Ultra Rápido)', description: 'Alta velocidade para leitura interativa' },
      { id: 'glm-4-plus', label: 'GLM-4 Plus', description: 'Modelo avançado de alta capacidade' },
      { id: 'glm-4-air', label: 'GLM-4 Air', description: 'Leve e responsivo' },
    ],
    keyPlaceholder: 'id.secret...',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  custom: {
    id: 'custom',
    name: 'OpenRouter / Custom API',
    shortName: 'OpenRouter',
    badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    models: [
      { id: 'google/gemini-2.5-flash', label: 'Google: Gemini 2.5 Flash (via OpenRouter)' },
      { id: 'anthropic/claude-3.7-sonnet', label: 'Anthropic: Claude 3.7 Sonnet (via OpenRouter)' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (via OpenRouter)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta: Llama 3.3 70B Instruct' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
};

export function createDefaultProviderConfig(): ProviderConfig {
  return {
    providerId: 'gemini',
    apiKeys: {
      gemini: '',
      openai: '',
      claude: '',
      deepseek: '',
      kimi: '',
      glm: '',
      custom: '',
    },
    selectedModels: {
      gemini: PROVIDERS_CATALOG.gemini.defaultModel,
      openai: PROVIDERS_CATALOG.openai.defaultModel,
      claude: PROVIDERS_CATALOG.claude.defaultModel,
      deepseek: PROVIDERS_CATALOG.deepseek.defaultModel,
      kimi: PROVIDERS_CATALOG.kimi.defaultModel,
      glm: PROVIDERS_CATALOG.glm.defaultModel,
      custom: PROVIDERS_CATALOG.custom.defaultModel,
    },
    customBaseUrls: {},
  };
}

export function buildReadingSystemPrompt(
  doc: PDFDocumentData,
  currentSentenceIndex: number
): string {
  const currentSentence = doc.sentences[currentSentenceIndex] || doc.sentences[0];
  const currentPageNum = currentSentence?.pageNumber || 1;
  const pageObj = doc.pages.find((p) => p.pageNumber === currentPageNum);

  const prevSentences = doc.sentences
    .slice(Math.max(0, currentSentenceIndex - 3), currentSentenceIndex)
    .map((s) => s.text)
    .join(' ');

  const nextSentences = doc.sentences
    .slice(currentSentenceIndex + 1, currentSentenceIndex + 4)
    .map((s) => s.text)
    .join(' ');

  const pageExcerpt = (pageObj?.rawText || '').slice(0, 3500);

  return `Você é um assistente e tutor especialista em Leitura Assistida por Voz.
Você está lendo o documento PDF "${doc.fileName}" em voz alta junto com o usuário.
No momento, o usuário pausou/interrompeu a leitura na Página ${currentPageNum} de ${doc.totalPages}.

TRECHO EXATO EM QUE O USUÁRIO INTERROMPEU A LEITURA:
"${currentSentence?.text || ''}"

FRASES IMEDIATAMENTE ANTERIORES:
"${prevSentences || '(Início do documento)'}"

FRASES IMEDIATAMENTE POSTERIORES:
"${nextSentences || '(Fim do trecho)'}"

TEXTO COMPLETO DA PÁGINA ATUAL (Página ${currentPageNum}):
"""
${pageExcerpt}
"""

DIRETRIZES DE RESPOSTA (MUITO IMPORTANTE):
1. Sua resposta será LIDA EM VOZ ALTA para o usuário por um sintetizador de voz.
2. Portanto, escreva de maneira fluida, natural, conversacional e clara em Português.
3. Evite tabelas Markdown, blocos de código longos ou símbolos especiais (como asteriscos excessivos ou hashtags) que soam artificiais na leitura em voz alta.
4. Seja objetivo e didático (geralmente entre 2 e 5 frases, a menos que o usuário peça uma explicação detalhada).
5. Sempre relacione sua explicação ou comentário ao trecho que acabou de ser lido no PDF.`;
}

export async function callLlmAssistant(params: {
  config: ProviderConfig;
  systemPrompt: string;
  history: ConversationMessage[];
  userQuestion: string;
}): Promise<string> {
  const { config, systemPrompt, history, userQuestion } = params;
  const provider = config.providerId;
  const apiKey = config.apiKeys[provider]?.trim();
  const model =
    config.selectedModels[provider]?.trim() ||
    PROVIDERS_CATALOG[provider].defaultModel;
  const baseUrl =
    config.customBaseUrls[provider]?.trim() ||
    PROVIDERS_CATALOG[provider].defaultBaseUrl;

  if (!apiKey) {
    throw new Error(
      `Nenhuma chave de API configurada para ${PROVIDERS_CATALOG[provider].name}. Clique em "Configurar IA" no topo para inserir sua chave.`
    );
  }

  const recentMessages = history.slice(-6).map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const payload = {
    provider,
    apiKey,
    model,
    baseUrl,
    systemPrompt,
    messages: [...recentMessages, { role: 'user' as const, content: userQuestion }],
    temperature: 0.4,
  };

  // Primary route: Local Vite server proxy (avoids CORS on Anthropic, Kimi, GLM, etc.)
  try {
    const res = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return data.reply;
    }

    // If proxy returned a structured JSON error from upstream, throw it clearly
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errJson = await res.json();
      throw new Error(errJson.error || `Erro (${res.status}) ao consultar ${PROVIDERS_CATALOG[provider].name}`);
    }
  } catch (proxyErr: any) {
    // If it's a known API error thrown above, rethrow it
    if (proxyErr?.message && !proxyErr.message.includes('fetch') && !proxyErr.message.includes('Failed')) {
      throw proxyErr;
    }
    // Otherwise fallback to direct browser call (e.g., on GitHub Pages or static host)
  }

  // Fallback direct browser call if running without proxy middleware (e.g., GitHub Pages)
  const directReq = buildProviderRequest(payload);
  const directRes = await fetch(directReq.url, {
    method: 'POST',
    headers: directReq.headers,
    body: directReq.body,
  });

  if (!directRes.ok) {
    const text = await directRes.text();
    throw new Error(`Falha na chamada à API (${directRes.status}): ${text}`);
  }

  const directData = await directRes.json();
  return extractProviderText(provider, directData);
}

export async function testProviderConnection(
  config: ProviderConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await callLlmAssistant({
      config,
      systemPrompt: 'Responda em português com apenas uma frase curta confirmando que está online.',
      history: [],
      userQuestion: 'Teste de conexão rápido: você está me ouvindo?',
    });
    return {
      ok: true,
      message: reply || 'Conexão estabelecida com sucesso!',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Falha ao conectar com o provedor.',
    };
  }
}
