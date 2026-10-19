import { describe, it, expect } from 'vitest';
import {
  splitParagraphIntoSentences,
  segmentPageText,
  createDemoDocument,
  isHeaderOrFooterArtifact,
  classifySentenceBlockType,
} from '../services/pdfService';
import {
  buildProviderRequest,
  extractProviderText,
} from '../server/llmProxy';
import { buildReadingSystemPrompt } from '../services/llmService';
import {
  pcmBase64ToWavBlob,
  formatExpressiveTextForNeuralTts,
} from '../services/speechService';
import { loadVoiceSettings } from '../services/storageService';

describe('PDF Sentence, BBox & Estratégia/Gran Sanitizer', () => {
  it('splits paragraphs into natural sentences without breaking on common abbreviations', () => {
    const paragraph =
      'O Dr. Carlos analisou o Art. 5 da constituição com atenção. Em seguida, ele apresentou um resumo claro para toda a equipe.';
    const sentences = splitParagraphIntoSentences(paragraph);
    expect(sentences.length).toBe(2);
    expect(sentences[0]).toContain('Dr. Carlos');
    expect(sentences[1]).toContain('apresentou um resumo');
  });

  it('filters out Estratégia and Gran Cursos repetitive headers, footers, and CPF watermarks', () => {
    expect(isHeaderOrFooterArtifact('Estratégia Concursos', 0.02, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('Gran Cursos Online', 0.98, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('Página 14 de 98', 0.96, true)).toBe(true);
    expect(
      isHeaderOrFooterArtifact(
        'O princípio da impessoalidade veda a promoção pessoal de autoridades.',
        0.5,
        true
      )
    ).toBe(false);
  });

  it('classifies headings and exam alert boxes (Atenção / Pegadinha de Prova)', () => {
    expect(
      classifySentenceBlockType('1.1 Princípios da Administração Pública')
    ).toBe('heading');
    expect(
      classifySentenceBlockType(
        'Atenção! Pegadinha de Prova: O princípio da legalidade comporta exceções.'
      )
    ).toBe('alert');
    expect(
      classifySentenceBlockType(
        'No exercício do poder vinculado, a lei estabelece todos os requisitos.'
      )
    ).toBe('normal');
  });

  it('indexes page paragraphs, BBox coordinates, and topics with isTopicEnd markers', () => {
    const rawText =
      '1.1 Primeiro Tópico de Estudo\n\nTexto explicativo do primeiro tópico com detalhes importantes. Segunda frase conclusiva do tópico.';
    const { pageContent, sentences } = segmentPageText(rawText, 2, 10);

    expect(pageContent.pageNumber).toBe(2);
    expect(sentences.length).toBe(3);
    expect(sentences[0].bboxes.length).toBeGreaterThan(0);
    expect(sentences[0].blockType).toBe('heading');
  });

  it('creates a valid multi-topic Concursos demo document with topics and BBoxes', () => {
    const demo = createDemoDocument();
    expect(demo.totalPages).toBe(3);
    expect(demo.topics.length).toBeGreaterThanOrEqual(3);
    expect(demo.sentences.some((s) => s.isTopicEnd)).toBe(true);
    expect(demo.sentences.some((s) => s.blockType === 'alert')).toBe(true);
  });
});

describe('Zero-API Expressive Neural TTS & Multi-LLM Adapter', () => {
  it('defaults to Zero-API Piper Neural WASM engine with lookahead prefetch enabled', () => {
    const settings = loadVoiceSettings();
    expect(settings.ttsEngine).toBe('piper_wasm');
    expect(settings.piperVoiceId).toBe('pt_BR-faber-medium');
    expect(settings.kokoroVoiceId).toBe('pf_dora');
    expect(settings.prefetchNextSentence).toBe(true);
  });

  it('shapes Portuguese text with expressive prosody pauses for neural TTS models', () => {
    const alertText = formatExpressiveTextForNeuralTts(
      'O princípio da legalidade exige lei formal.',
      'alert'
    );
    expect(alertText).toContain('Atenção!');
    expect(alertText).toContain('... ');
  });

  it('converts Gemini 24kHz PCM base64 audio into a valid WAV Blob', () => {
    const dummyPcm = btoa('\x00\x00\x01\x00\x02\x00\x03\x00');
    const blob = pcmBase64ToWavBlob(dummyPcm, 24000);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 8);
  });

  it('formats Google Gemini requests and extracts responses properly', () => {
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: 'AIzaTestKey123',
      model: 'gemini-2.5-flash',
      systemPrompt: 'Você é um professor de concursos.',
      messages: [{ role: 'user', content: 'Explique com analogia.' }],
    });

    expect(req.url).toContain('gemini-2.5-flash:generateContent?key=AIzaTestKey123');
    const extracted = extractProviderText('gemini', {
      candidates: [
        {
          content: {
            parts: [{ text: 'Explicação didática do professor.' }],
          },
        },
      ],
    });
    expect(extracted).toBe('Explicação didática do professor.');
  });

  it('builds a Professor system prompt anchored to the active sentence and exam boards', () => {
    const demo = createDemoDocument();
    const prompt = buildReadingSystemPrompt(demo, 1);
    expect(prompt).toContain(demo.fileName);
    expect(prompt).toContain('Cebraspe');
    expect(prompt).toContain('Podemos continuar a leitura?');
  });
});

