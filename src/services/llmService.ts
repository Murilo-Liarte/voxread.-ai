import { buildProviderRequest, extractProviderText } from '../server/llmProxy';
import { finalizeTopicsAndSentences } from './pdfService';
import type {
  ConversationMessage,
  FlashcardItem,
  GeminiModelOption,
  LLMProviderId,
  PDFDocumentData,
  PDFSentence,
  PDFTopic,
  ProviderConfig,
  ProviderMetadata,
  SchematicSummary,
} from '../types';

export const GEMINI_FREE_TIER_FALLBACK_CHAIN: string[] = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

export const PROVIDERS_CATALOG: Record<LLMProviderId, ProviderMetadata> = {
  gemini: {
    id: 'gemini',
    name: 'Google AI Studio (Gemini)',
    shortName: 'Gemini',
    badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.5-flash-lite',
    models: [
      {
        id: 'gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash-Lite (Recomendado — API Grátis)',
        description:
          'Maior cota diária gratuita no Google AI Studio. Ultrarrápido para limpeza de PDFs, Flashcards e Modo Professor.',
        freeTierBadge: 'Grátis • Maior Cota',
      },
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash-Lite (API Grátis — Ultra Leve)',
        description:
          'Baixíssima latência para processamento de apostilas longas e leitura assistida.',
        freeTierBadge: 'Grátis • Ultra Rápido',
      },
      {
        id: 'gemini-2.5-flash-lite',
        label: 'Gemini 2.5 Flash-Lite (API Grátis — Alta Estabilidade)',
        description:
          'Modelo leve de alta cota por minuto (RPM/RPD) no nível gratuito do AI Studio.',
        freeTierBadge: 'Grátis • Estável',
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (API Grátis — Equilibrado)',
        description:
          'Excelente didática para analogias de prova, Modo Professor e resumos esquemáticos.',
        freeTierBadge: 'Grátis • Didático',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro (Raciocínio Profundo)',
        description:
          'Raciocínio avançado para textos jurídicos densos e jurisprudência (cota gratuita mais restrita).',
        freeTierBadge: 'Avançado',
      },
      {
        id: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash (Clássico Rápido)',
        description:
          'Alta compatibilidade e velocidade constante na API v1beta.',
        freeTierBadge: 'Grátis • Legado',
      },
    ],
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    supportsCloudTts: true,
  },
};

export function createDefaultProviderConfig(): ProviderConfig {
  return {
    providerId: 'gemini',
    apiKeys: {
      gemini: '',
    },
    selectedModels: {
      gemini: PROVIDERS_CATALOG.gemini.defaultModel,
    },
    customBaseUrls: {},
    aiSanitizePdf: true,
  };
}

/**
 * Queries Google AI Studio (`GET /v1beta/models`) to list all Gemini models enabled for the user's API key.
 */
export async function fetchAvailableGeminiModels(
  apiKey: string
): Promise<GeminiModelOption[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Informe sua chave de API do Google AI Studio primeiro.');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
      cleanKey
    )}`
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao consultar modelos no AI Studio (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];

  const supported = rawModels
    .filter(
      (m) =>
        typeof m.name === 'string' &&
        m.name.includes('gemini') &&
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent')
    )
    .map((m) => {
      const id = String(m.name).replace(/^models\//, '');
      const isLite = id.includes('flash-lite');
      const isFlash = id.includes('flash');
      return {
        id,
        label: `${m.displayName || id} (${id})`,
        description:
          m.description ||
          (isLite
            ? 'Modelo Flash-Lite otimizado para alta cota gratuita'
            : 'Modelo disponível na sua chave do Google AI Studio'),
        freeTierBadge: isLite
          ? 'Grátis • Lite'
          : isFlash
            ? 'Grátis • Flash'
            : 'AI Studio',
      } as GeminiModelOption;
    });

  // Sort Flash-Lite and 3.x / 2.5 models first
  supported.sort((a, b) => {
    const score = (id: string) => {
      if (id === 'gemini-3.5-flash-lite') return 100;
      if (id.includes('3.5') && id.includes('flash-lite')) return 95;
      if (id.includes('3.1') && id.includes('flash-lite')) return 90;
      if (id.includes('2.5') && id.includes('flash-lite')) return 85;
      if (id.includes('flash-lite')) return 80;
      if (id.includes('2.5-flash')) return 75;
      if (id.includes('flash')) return 60;
      return 40;
    };
    return score(b.id) - score(a.id);
  });

  return supported.length > 0 ? supported : PROVIDERS_CATALOG.gemini.models;
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

async function executeGeminiRequestWithModel(params: {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature?: number;
}): Promise<string> {
  const payload = {
    provider: 'gemini' as const,
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    temperature: params.temperature ?? 0.35,
  };

  // Direct call to Google AI Studio API (works identically on GitHub Pages and localhost)
  const directReq = buildProviderRequest(payload);
  const directRes = await fetch(directReq.url, {
    method: 'POST',
    headers: directReq.headers,
    body: directReq.body,
  });

  if (!directRes.ok) {
    const text = await directRes.text();
    const err: any = new Error(
      `Erro Gemini (${directRes.status}) no modelo ${params.model}: ${text}`
    );
    err.status = directRes.status;
    throw err;
  }

  const directData = await directRes.json();
  return extractProviderText('gemini', directData);
}

export async function callLlmAssistant(params: {
  config: ProviderConfig;
  systemPrompt: string;
  history: ConversationMessage[];
  userQuestion: string;
}): Promise<string> {
  const { config, systemPrompt, history, userQuestion } = params;
  const apiKey = config.apiKeys.gemini?.trim();
  const preferredModel =
    config.selectedModels.gemini?.trim() || PROVIDERS_CATALOG.gemini.defaultModel;
  const baseUrl =
    config.customBaseUrls.gemini?.trim() || PROVIDERS_CATALOG.gemini.defaultBaseUrl;

  if (!apiKey) {
    throw new Error(
      'Nenhuma chave do Google AI Studio configurada. Clique em "Voz & IA" ou "Conta" no topo para salvar sua API Key gratuita do Gemini.'
    );
  }

  const recentMessages = history.slice(-6).map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  const messages = [
    ...recentMessages,
    { role: 'user' as const, content: userQuestion },
  ];

  // Try preferred model first; if 404 (model alias not enabled in region) or 429 (free tier rate limit on that model),
  // automatically fall back through GEMINI_FREE_TIER_FALLBACK_CHAIN!
  const candidateModels = [
    preferredModel,
    ...GEMINI_FREE_TIER_FALLBACK_CHAIN.filter((m) => m !== preferredModel),
  ];

  let lastError: any = null;
  for (const modelToTry of candidateModels) {
    try {
      return await executeGeminiRequestWithModel({
        apiKey,
        model: modelToTry,
        baseUrl,
        systemPrompt,
        messages,
      });
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      if (status === 404 || status === 429 || status === 503) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha ao comunicar com o Google AI Studio (Gemini).');
}

/**
 * Layer 3 AI PDF Sanitizer: Uses Gemini Flash-Lite to remove any remaining non-content noise
 * (headers, footers, watermarks, editorial credits, broken TOC lines, page numbers)
 * so the reader only speaks essential didactic text while preserving exact BBox coordinates.
 */
export async function sanitizeDocumentWithGemini(params: {
  doc: PDFDocumentData;
  config: ProviderConfig;
}): Promise<{ cleanedDoc: PDFDocumentData; removedByAiCount: number }> {
  const { doc, config } = params;
  const apiKey = config.apiKeys.gemini?.trim();
  if (!apiKey || doc.sentences.length === 0) {
    return { cleanedDoc: doc, removedByAiCount: 0 };
  }

  const BATCH_SIZE = 45;
  const sentencesToDrop = new Set<number>();
  const cleanedTextOverrides = new Map<number, string>();

  // Process up to the first 180 sentences synchronously during upload so it stays fast (< 2.5s)
  const maxSentencesToInspect = Math.min(doc.sentences.length, 180);

  for (let start = 0; start < maxSentencesToInspect; start += BATCH_SIZE) {
    const slice = doc.sentences.slice(start, start + BATCH_SIZE);
    const numberedPayload = slice.map((s) => ({
      i: s.globalIndex,
      p: s.pageNumber,
      t: s.text,
    }));

    try {
      const rawReply = await callLlmAssistant({
        config,
        systemPrompt: `Você é um filtro de limpeza de PDFs de estudo (Estratégia, Gran Cursos, livros e artigos).
Sua tarefa é identificar frases que SÃO LIXO/RUÍDO DE LAYOUT e que NÃO devem ser lidas em voz alta, tais como:
- Cabeçalhos ou rodapés de página (nome do curso, nome do professor solto no topo, número de página, data, URL, e-mail)
- Marcas d'água de aluno (CPF, nome + e-mail, "Licenciado para", "Todos os direitos reservados", "Proibida a reprodução")
- Linhas de sumário com pontilhados ou números de página soltos
- Metadados editoriais, ISBN, expediente ou créditos de capa irrelevantes ao conteúdo didático.

IMPORTANTE: Mantenha 100% dos títulos de capítulos/tópicos reais, artigos de lei, explicações teóricas, alertas de prova e questões!
Retorne APENAS um JSON válido no formato:
{"dropIndices": [lista de números "i" que são ruído e devem ser removidos]}`,
        history: [],
        userQuestion: JSON.stringify(numberedPayload),
      });

      const match = rawReply.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          dropIndices?: number[];
          cleanedTexts?: Record<string, string>;
        };
        if (Array.isArray(parsed.dropIndices)) {
          for (const idx of parsed.dropIndices) {
            if (typeof idx === 'number') {
              sentencesToDrop.add(idx);
            }
          }
        }
        if (parsed.cleanedTexts && typeof parsed.cleanedTexts === 'object') {
          for (const [k, v] of Object.entries(parsed.cleanedTexts)) {
            const numIdx = Number(k);
            if (!Number.isNaN(numIdx) && typeof v === 'string' && v.trim().length > 5) {
              cleanedTextOverrides.set(numIdx, v.trim());
            }
          }
        }
      }
    } catch (err) {
      console.warn('Aviso na limpeza complementar Gemini IA:', err);
      break;
    }
  }

  // Never drop all sentences if the document is tiny
  if (
    sentencesToDrop.size === 0 &&
    cleanedTextOverrides.size === 0
  ) {
    return {
      cleanedDoc: { ...doc, aiCleaned: true },
      removedByAiCount: 0,
    };
  }

  const keptSentences: PDFSentence[] = [];
  for (const s of doc.sentences) {
    if (sentencesToDrop.has(s.globalIndex) && doc.sentences.length - sentencesToDrop.size >= 1) {
      continue;
    }
    const overrideText = cleanedTextOverrides.get(s.globalIndex);
    keptSentences.push({
      ...s,
      text: overrideText || s.text,
      globalIndex: keptSentences.length,
      isTopicEnd: false,
    });
  }

  const updatedTopics = finalizeTopicsAndSentences(keptSentences);
  const removedByAiCount = doc.sentences.length - keptSentences.length;

  return {
    cleanedDoc: {
      ...doc,
      sentences: keptSentences,
      topics: updatedTopics,
      removedNoiseCount: (doc.removedNoiseCount || 0) + removedByAiCount,
      aiCleaned: true,
    },
    removedByAiCount,
  };
}

/**
 * Generates Active Recall Flashcards at the end of a topic (via Gemini or intelligent local fallback)
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
  const hasApiKey = Boolean(config.apiKeys.gemini?.trim());

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
      bancaTip:
        'Atenção redobrada às ressalvas e jurisprudências do STF/STJ neste ponto!',
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
      bancaTip:
        'Questões de múltipla escolha exigem a distinção literal deste requisito.',
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
  const hasApiKey = Boolean(config.apiKeys.gemini?.trim());

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
        'Responda em português com apenas uma frase curta confirmando que o Modo Professor Gemini está online.',
      history: [],
      userQuestion: 'Professor Gemini, você está conectado?',
    });
    return {
      ok: true,
      message: reply || 'Conexão com Google AI Studio (Gemini) estabelecida com sucesso!',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Falha ao conectar com o Google AI Studio.',
    };
  }
}
