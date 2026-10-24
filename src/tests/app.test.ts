import { describe, it, expect } from 'vitest';
import {
  splitParagraphIntoSentences,
  segmentPageText,
  createDemoDocument,
} from '../services/pdfService';
import {
  buildProviderRequest,
  extractProviderText,
} from '../server/llmProxy';
import { buildReadingSystemPrompt } from '../services/llmService';

describe('PDF Sentence & Paragraph Segmentation', () => {
  it('splits paragraphs into natural sentences without breaking on common abbreviations', () => {
    const paragraph =
      'O Dr. Carlos analisou o Art. 5 da constituição com atenção. Em seguida, ele apresentou um resumo claro para toda a equipe.';
    const sentences = splitParagraphIntoSentences(paragraph);
    expect(sentences.length).toBe(2);
    expect(sentences[0]).toContain('Dr. Carlos');
    expect(sentences[1]).toContain('apresentou um resumo');
  });

  it('indexes page paragraphs and sentences with accurate global and page indices', () => {
    const rawText =
      'Primeiro parágrafo de introdução ao tema científico.\n\nSegundo parágrafo com duas frases distintas. Aqui está a segunda frase do parágrafo.';
    const { pageContent, sentences } = segmentPageText(rawText, 2, 10);

    expect(pageContent.pageNumber).toBe(2);
    expect(pageContent.paragraphs.length).toBe(2);
    expect(sentences.length).toBe(3);
    expect(sentences[0].globalIndex).toBe(10);
    expect(sentences[1].globalIndex).toBe(11);
    expect(sentences[2].globalIndex).toBe(12);
    expect(sentences[2].pageNumber).toBe(2);
  });

  it('creates a valid multi-page interactive demo document', () => {
    const demo = createDemoDocument();
    expect(demo.totalPages).toBe(3);
    expect(demo.sentences.length).toBeGreaterThan(6);
    expect(demo.pages[0].pageNumber).toBe(1);
  });
});

describe('Multi-LLM Adapter & Anti-CORS Proxy Formatter', () => {
  it('formats Google Gemini requests and extracts responses properly', () => {
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: 'AIzaTestKey123',
      model: 'gemini-2.5-flash',
      systemPrompt: 'Você é um assistente de leitura.',
      messages: [{ role: 'user', content: 'O que significa este parágrafo?' }],
    });

    expect(req.url).toContain('gemini-2.5-flash:generateContent?key=AIzaTestKey123');
    const parsedBody = JSON.parse(req.body);
    expect(parsedBody.systemInstruction.parts[0].text).toBe('Você é um assistente de leitura.');
    expect(parsedBody.contents[0].parts[0].text).toBe('O que significa este parágrafo?');

    const extracted = extractProviderText('gemini', {
      candidates: [
        {
          content: {
            parts: [{ text: 'Este parágrafo explica a leitura assistida.' }],
          },
        },
      ],
    });
    expect(extracted).toBe('Este parágrafo explica a leitura assistida.');
  });

  it('formats Anthropic Claude requests with x-api-key and anthropic-version headers', () => {
    const req = buildProviderRequest({
      provider: 'claude',
      apiKey: 'sk-ant-test',
      model: 'claude-3-7-sonnet-latest',
      systemPrompt: 'Sistema Claude',
      messages: [{ role: 'user', content: 'Explique o texto.' }],
    });

    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['x-api-key']).toBe('sk-ant-test');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');

    const extracted = extractProviderText('claude', {
      content: [{ type: 'text', text: 'Explicação detalhada do Claude.' }],
    });
    expect(extracted).toBe('Explicação detalhada do Claude.');
  });

  it('formats OpenAI, DeepSeek, Kimi, and GLM requests using Bearer token and chat/completions', () => {
    const providers = ['openai', 'deepseek', 'kimi', 'glm'] as const;
    for (const provider of providers) {
      const req = buildProviderRequest({
        provider,
        apiKey: `key-${provider}`,
        model: `model-${provider}`,
        systemPrompt: 'Prompt do sistema',
        messages: [{ role: 'user', content: 'Pergunta do leitor' }],
      });

      expect(req.url.endsWith('/chat/completions')).toBe(true);
      expect(req.headers.Authorization).toBe(`Bearer key-${provider}`);

      const text = extractProviderText(provider, {
        choices: [{ message: { content: `Resposta de ${provider}` } }],
      });
      expect(text).toBe(`Resposta de ${provider}`);
    }
  });

  it('builds a contextual reading system prompt anchored to the active sentence', () => {
    const demo = createDemoDocument();
    const prompt = buildReadingSystemPrompt(demo, 1);
    expect(prompt).toContain(demo.fileName);
    expect(prompt).toContain(demo.sentences[1].text);
    expect(prompt).toContain('LIDA EM VOZ ALTA');
  });
});
