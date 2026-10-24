import { buildProviderRequest, extractProviderText } from '../server/llmProxy';
import type {
  ConversationMessage,
  FlashcardItem,
  LLMProviderId,
  PDFDocumentData,
  PDFTopic,
  ProviderConfig,
  ProviderMetadata,
  SchematicSummary,
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
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recomendado - Rápido)', description: 'Ideal para Modo Professor e Voz Neural Gemini' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Raciocínio profundo para textos jurídicos e bancas' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Baixa latência e alta fluidez' },
    ],
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    supportsCloudTts: true,
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
      { id: 'o3-mini', label: 'o3-mini', description: 'Focado em lógica, exatas e direito' },
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
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', description: 'Didática excepcional e resumos esquemáticos' },
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
      { id: 'moonshot-v1-32k', label: 'Moonshot v1 32K', description: 'Ótimo para apostilas longas do Estratégia/Gran' },
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

  return `Você é um Professor de Elite especialista em Concursos Públicos (estilo Estratégia / Gran Cursos) e Leitura Assistida por Voz.
Você está lendo a apostila/PDF "${doc.fileName}" junto com o aluno.
O aluno interrompeu a leitura na Página ${currentPageNum} de ${doc.totalPages} (Tópico: "${currentSentence?.topicTitle || 'Geral'}").

TRECHO EXATO EM QUE O ALUNO PAUSOU:
"${currentSentence?.text || ''}"

CONTEXTO IMEDIATO ANTERIOR:
"${prevSentences || '(Início do documento)'}"

CONTEXTO IMEDIATO POSTERIOR:
"${nextSentences || '(Fim do trecho)'}"

CONTEÚDO COMPLETO DA PÁGINA ATUAL:
"""
${pageExcerpt}
"""

DIRETRIZES DO MODO PROFESSOR (MUITO IMPORTANTE):
1. Sua resposta será LIDA EM VOZ ALTA para o aluno com entonação de professor carismático.
2. Explique de forma extremamente didática, usando analogias práticas e apontando como as bancas (Cebraspe, FGV, FCC, Vunesp) costumam cobrar esse ponto ou criar pegadinhas.
3. Escreva em texto corrido fluido, sem tabelas ou símbolos Markdown pesados que atrapalhem a voz.
4. Seja direto (cerca de 3 a 5 frases) e SEMPRE finalize perguntando de forma acolhedora: "Ficou claro? Podemos continuar a leitura?"`;
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
      `Nenhuma chave de API configurada para ${PROVIDERS_CATALOG[provider].name}. Clique em "API Key" no topo para conectar.`
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

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errJson = await res.json();
      throw new Error(
        errJson.error || `Erro (${res.status}) ao consultar ${PROVIDERS_CATALOG[provider].name}`
      );
    }
  } catch (proxyErr: any) {
    if (
      proxyErr?.message &&
      !proxyErr.message.includes('fetch') &&
      !proxyErr.message.includes('Failed')
    ) {
      throw proxyErr;
    }
  }

  // Fallback direct browser call (e.g. on GitHub Pages)
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

/**
 * Generates Active Recall Flashcards at the end of a topic (via LLM or intelligent local fallback)
 */
export async function generateTopicFlashcards(params: {
  doc: PDFDocumentData;
  topic: PDFTopic;
  config: ProviderConfig;
}): Promise<FlashcardItem[]> {
  const { doc, topic, config } = params;
  const topicSentences = doc.sentences.slice(
    topic.startSentenceIndex,
    topic.endSentenceIndex + 1
  );
  const topicText = topicSentences.map((s) => s.text).join(' ');
  const hasApiKey = Boolean(config.apiKeys[config.providerId]?.trim());

  if (hasApiKey) {
    try {
      const rawJson = await callLlmAssistant({
        config,
        systemPrompt:
          'Você é um elaborador de Flashcards de Active Recall para concursos públicos. Retorne APENAS um array JSON válido contendo 2 ou 3 objetos com as chaves: "question", "answer", "bancaTip". Não use blocos de código markdown.',
        history: [],
        userQuestion: `Gere 3 flashcards estratégicos de prova sobre o tópico "${topic.title}" com base neste conteúdo:\n\n${topicText.slice(0, 3500)}`,
      });

      const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          question: string;
          answer: string;
          bancaTip?: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3).map((item, idx) => ({
            id: `fc-${topic.id}-${Date.now()}-${idx}`,
            topicId: topic.id,
            topicTitle: topic.title,
            pageNumber: topic.pageNumber,
            question: item.question,
            answer: item.answer,
            bancaTip: item.bancaTip || 'Foco recorrente em provas de concursos.',
            revealed: false,
          }));
        }
      }
    } catch (err) {
      console.warn('Usando geração local de flashcards como fallback:', err);
    }
  }

  // Smart fallback flashcards extracted directly from topic sentences & alerts
  const alertSentence = topicSentences.find((s) => s.blockType === 'alert');
  const coreSentence =
    topicSentences.find((s) => s.blockType === 'normal' && s.text.length > 45) ||
    topicSentences[0];

  const cards: FlashcardItem[] = [
    {
      id: `fc-${topic.id}-1`,
      topicId: topic.id,
      topicTitle: topic.title,
      pageNumber: topic.pageNumber,
      question: `Qual é o conceito central e a regra geral trabalhada no tópico "${topic.title}"?`,
      answer: coreSentence?.text || topicText.slice(0, 220),
      bancaTip: 'As bancas costumam inverter o conceito geral com a exceção.',
      revealed: false,
    },
  ];

  if (alertSentence) {
    cards.push({
      id: `fc-${topic.id}-2`,
      topicId: topic.id,
      topicTitle: topic.title,
      pageNumber: topic.pageNumber,
      question: `Qual é a principal pegadinha ou ponto de atenção destacado em "${topic.title}"?`,
      answer: alertSentence.text,
      bancaTip: 'Atenção redobrada às ressalvas e jurisprudências do STF/STJ neste ponto!',
      revealed: false,
    });
  } else if (topicSentences.length > 2) {
    const lastSent = topicSentences[topicSentences.length - 1];
    cards.push({
      id: `fc-${topic.id}-2`,
      topicId: topic.id,
      topicTitle: topic.title,
      pageNumber: topic.pageNumber,
      question: `Como se aplica na prática de prova o desfecho do tópico "${topic.title}"?`,
      answer: lastSent.text,
      bancaTip: 'Questões de múltipla escolha exigem a distinção literal deste requisito.',
      revealed: false,
    });
  }

  return cards;
}

/**
 * Consolidates the document into a high-yield Schematic Summary for Concursos
 */
export async function generateSchematicSummary(params: {
  doc: PDFDocumentData;
  config: ProviderConfig;
}): Promise<SchematicSummary> {
  const { doc, config } = params;
  const fullTextExcerpt = doc.sentences
    .map((s) => s.text)
    .join(' ')
    .slice(0, 6000);
  const hasApiKey = Boolean(config.apiKeys[config.providerId]?.trim());

  const alertsInDoc = doc.sentences
    .filter((s) => s.blockType === 'alert')
    .map((s) => s.text);
  const firstSentencesPerTopic = doc.topics.map((t) => {
    const firstNormal = doc.sentences
      .slice(t.startSentenceIndex, t.endSentenceIndex + 1)
      .find((s) => s.blockType === 'normal');
    return `${t.title}: ${firstNormal?.text || ''}`;
  });

  if (hasApiKey) {
    try {
      const reply = await callLlmAssistant({
        config,
        systemPrompt: `Você é um especialista em síntese esquemática para concursos públicos.
Elabore um RESUMO ESQUEMÁTICO COMPLETO focado em bancas examinadoras (Cebraspe, FGV, FCC), organizado em tópicos diretos:
1. Visão Geral & Definições-Chave
2. Exceções, Prazos e Requisitos
3. Pegadinhas Clássicas de Banca
4. Quadro Comparativo / Esquema Mental`,
        history: [],
        userQuestion: `Gere o resumo esquemático definitivo da aula "${doc.fileName}":\n\n${fullTextExcerpt}`,
      });

      return {
        id: `sum-${Date.now()}`,
        generatedAt: Date.now(),
        scopeTitle: doc.fileName,
        markdownContent: reply,
        definitions: firstSentencesPerTopic.slice(0, 5),
        exceptionsAndDeadlines: alertsInDoc.slice(0, 5),
        bancaTraps:
          alertsInDoc.length > 0
            ? alertsInDoc
            : ['Atenção à literalidade da lei vs. entendimento jurisprudencial.'],
      };
    } catch (err) {
      console.warn('Usando gerador esquemático local como fallback:', err);
    }
  }

  const fallbackMarkdown = `# Resumo Esquemático — ${doc.fileName}

## 1. Estrutura de Tópicos Estudados
${doc.topics.map((t, i) => `- **Tópico ${i + 1} (Pág. ${t.pageNumber})**: ${t.title}`).join('\n')}

## 2. Conceitos e Definições Fundamentais
${firstSentencesPerTopic.map((d) => `- ${d}`).join('\n')}

## 3. Exceções e Pegadinhas de Prova Destacadas
${
  alertsInDoc.length > 0
    ? alertsInDoc.map((a) => `- ⚠️ ${a}`).join('\n')
    : '- Verifique sempre se a regra comporta exceções constitucionais ou sumulares.'
}`;

  return {
    id: `sum-${Date.now()}`,
    generatedAt: Date.now(),
    scopeTitle: doc.fileName,
    markdownContent: fallbackMarkdown,
    definitions: firstSentencesPerTopic,
    exceptionsAndDeadlines: alertsInDoc,
    bancaTraps:
      alertsInDoc.length > 0
        ? alertsInDoc
        : ['Cuidado com termos restritivos como "sempre", "jamais" e "exclusivamente".'],
  };
}

export async function testProviderConnection(
  config: ProviderConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await callLlmAssistant({
      config,
      systemPrompt:
        'Responda em português com apenas uma frase curta confirmando que o Modo Professor está online.',
      history: [],
      userQuestion: 'Professor, você está conectado?',
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
