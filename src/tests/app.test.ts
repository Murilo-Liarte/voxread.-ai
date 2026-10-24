import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitParagraphIntoSentences,
  segmentPageText,
  createDemoDocument,
  isHeaderOrFooterArtifact,
  classifySentenceBlockType,
  detectRepetitiveHeaderFooterFingerprints,
  stripInlineWatermarks,
} from '../services/pdfService';
import {
  buildProviderRequest,
  extractProviderText,
} from '../server/llmProxy';
import {
  buildReadingSystemPrompt,
  createDefaultProviderConfig,
  GEMINI_FREE_TIER_FALLBACK_CHAIN,
  PROVIDERS_CATALOG,
} from '../services/llmService';
import {
  pcmBase64ToWavBlob,
  formatExpressiveTextForNeuralTts,
  PIPER_WASM_PATHS,
  speechService,
} from '../services/speechService';
import { portugueseToKokoroIpa } from '../services/ptBrPhonemizer';
import {
  loadVoiceSettings,
  createDefaultVoiceSettings,
  saveDocumentToUserLibrary,
  loadUserPdfLibrary,
  updateDocumentReadingProgress,
  deleteDocumentFromLibrary,
} from '../services/storageService';
import {
  registerAccount,
  loginAccount,
  restoreActiveSession,
  syncSettingsToActiveAccount,
  logoutActiveAccount,
} from '../services/authService';
import ortPkg from '../../node_modules/onnxruntime-web/package.json';

describe('PDF Sentence, BBox & 3-Layer Intelligent Sanitizer', () => {
  it('splits paragraphs into natural sentences without breaking on common abbreviations', () => {
    const paragraph =
      'O Dr. Carlos analisou o Art. 5 da constituição com atenção. Em seguida, ele apresentou um resumo claro para toda a equipe.';
    const sentences = splitParagraphIntoSentences(paragraph);
    expect(sentences.length).toBe(2);
    expect(sentences[0]).toContain('Dr. Carlos');
    expect(sentences[1]).toContain('apresentou um resumo');
  });

  it('filters out headers, footers, page numbers, TOC dot leaders, and CPF watermarks', () => {
    expect(isHeaderOrFooterArtifact('Estratégia Concursos', 0.02, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('Gran Cursos Online', 0.98, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('Página 14 de 98', 0.96, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('1.2 Direitos Fundamentais ................... 18', 0.4, true)).toBe(true);
    expect(isHeaderOrFooterArtifact('Aula 03 - Prof. Herbert Almeida', 0.03, true)).toBe(true);
    expect(
      isHeaderOrFooterArtifact(
        'O princípio da impessoalidade veda a promoção pessoal de autoridades.',
        0.5,
        true
      )
    ).toBe(false);
  });

  it('detects cross-page repetitive headers, footers, and watermarks across multiple pages', () => {
    const simulatedPages = [
      [
        { text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 1 de 50', normY: 0.03 },
        { text: 'O poder constituinte originário é inicial, ilimitado e incondicionado.', normY: 0.4 },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
      [
        { text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 2 de 50', normY: 0.03 },
        { text: 'Já o poder constituinte derivado está sujeito a limites formais e materiais.', normY: 0.45 },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
      [
        { text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 3 de 50', normY: 0.03 },
        { text: 'As cláusulas pétreas estão previstas no artigo 60, parágrafo quarto.', normY: 0.5 },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
    ];

    const repetitiveSet = detectRepetitiveHeaderFooterFingerprints(simulatedPages, true);
    expect(
      isHeaderOrFooterArtifact(
        'Curso Regular Direito Constitucional - Aula 01 - Pág. 4 de 50',
        0.03,
        true,
        repetitiveSet
      )
    ).toBe(true);
    expect(
      isHeaderOrFooterArtifact(
        'Aluno: João da Silva - Documento exclusivo',
        0.5,
        true,
        repetitiveSet
      )
    ).toBe(true);
    expect(
      isHeaderOrFooterArtifact(
        'O poder constituinte originário é inicial, ilimitado e incondicionado.',
        0.4,
        true,
        repetitiveSet
      )
    ).toBe(false);
  });

  it('strips inline CPF and copyright watermarks from sentences while keeping didactic text', () => {
    const dirty =
      'A competência privativa da União pode ser delegada por lei complementar. CPF: 123.456.789-00 Todos os direitos reservados.';
    const cleaned = stripInlineWatermarks(dirty, true);
    expect(cleaned).toBe(
      'A competência privativa da União pode ser delegada por lei complementar. .'
    );
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
});

describe('Exclusive Google AI Studio (Gemini Free Tier) & Account System', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defaults exclusively to Google Gemini with gemini-3.5-flash-lite as recommended free model', () => {
    const defaultCfg = createDefaultProviderConfig();
    expect(defaultCfg.providerId).toBe('gemini');
    expect(defaultCfg.selectedModels.gemini).toBe('gemini-3.5-flash-lite');
    expect(PROVIDERS_CATALOG.gemini.defaultModel).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_FREE_TIER_FALLBACK_CHAIN[0]).toBe('gemini-3.5-flash-lite');
  });

  it('formats Google Gemini requests and extracts responses properly', () => {
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: 'AIzaTestKey123',
      model: 'gemini-3.5-flash-lite',
      systemPrompt: 'Você é um professor de concursos.',
      messages: [{ role: 'user', content: 'Explique com analogia.' }],
    });

    expect(req.url).toContain(
      'gemini-3.5-flash-lite:generateContent?key=AIzaTestKey123'
    );
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

  it('registers a user account, saves initial settings immediately, and auto-restores session without re-login', async () => {
    const acc = await registerAccount({
      username: 'murilo',
      password: '123',
      geminiApiKey: 'AIzaSyTestFreeKey999',
      geminiModel: 'gemini-3.5-flash-lite',
      rememberMe: true,
    });

    expect(acc.username).toBe('murilo');
    expect(acc.geminiApiKey).toBe('AIzaSyTestFreeKey999');
    expect(acc.geminiModel).toBe('gemini-3.5-flash-lite');

    // Simulate reopening the site: restoreActiveSession must auto-login without asking password
    const restored = await restoreActiveSession();
    expect(restored).not.toBeNull();
    expect(restored?.username).toBe('murilo');
    expect(restored?.geminiApiKey).toBe('AIzaSyTestFreeKey999');

    // Sync updated settings immediately to account
    await syncSettingsToActiveAccount({
      username: 'murilo',
      providerConfig: {
        providerId: 'gemini',
        apiKeys: { gemini: 'AIzaSyUpdatedKey' },
        selectedModels: { gemini: 'gemini-2.5-flash-lite' },
        customBaseUrls: {},
        aiSanitizePdf: true,
      },
    });

    const relogged = await loginAccount({ username: 'murilo', password: '123' });
    expect(relogged.geminiApiKey).toBe('AIzaSyUpdatedKey');
    expect(relogged.geminiModel).toBe('gemini-2.5-flash-lite');

    await logoutActiveAccount();
    const afterLogout = await restoreActiveSession();
    expect(afterLogout).toBeNull();
  });

  it('maintains the user personal PDF reading list and updates reading progress', async () => {
    const demo = createDemoDocument();
    const userDoc = {
      ...demo,
      id: 'doc-direito-constitucional-1',
      fileName: 'Aula_01_Direito_Constitucional.pdf',
      removedNoiseCount: 24,
    };

    const listAfterSave = await saveDocumentToUserLibrary(userDoc, 'murilo');
    expect(listAfterSave.length).toBe(1);
    expect(listAfterSave[0].fileName).toBe('Aula_01_Direito_Constitucional.pdf');
    expect(listAfterSave[0].removedNoiseCount).toBe(24);

    const listAfterProgress = await updateDocumentReadingProgress(
      userDoc,
      4,
      'murilo'
    );
    expect(listAfterProgress[0].currentSentenceIndex).toBe(4);
    expect(listAfterProgress[0].progressPercent).toBeGreaterThan(0);

    const loadedList = await loadUserPdfLibrary('murilo');
    expect(loadedList.length).toBe(1);

    const listAfterDelete = await deleteDocumentFromLibrary(
      'doc-direito-constitucional-1',
      'murilo'
    );
    expect(listAfterDelete.length).toBe(0);
  });
});

describe('Zero-API Expressive Neural TTS & Anti-Robotic Fallback', () => {
  it('defaults to Zero-API Piper Neural WASM engine with silent browser fallback disabled', () => {
    const settings = loadVoiceSettings();
    expect(settings.ttsEngine).toBe('piper_wasm');
    expect(settings.piperVoiceId).toBe('pt_BR-faber-medium');
    expect(settings.kokoroVoiceId).toBe('pf_dora');
    expect(settings.allowSystemVoiceFallback).toBe(false);
    expect(settings.prefetchNextSentence).toBe(true);
  });

  it('matches PIPER_WASM_PATHS.onnxWasm to the exact installed onnxruntime-web version', () => {
    expect(PIPER_WASM_PATHS.onnxWasm).toContain(`onnxruntime-web@${ortPkg.version}`);
  });

  it('converts Brazilian Portuguese text into Kokoro-82M IPA phonemes without npm:phonemizer', () => {
    const ipa = portugueseToKokoroIpa(
      'Atenção! Na Administração Pública, o gestor só age quando a lei autoriza.'
    );
    expect(ipa).toContain('atẽsˈɐ̃w');
    expect(ipa).toContain('adiministɾasˈɐ̃w');
    expect(ipa).toContain('pˈublikɐ');
  });

  it('does NOT silently fall back to browser voice when allowSystemVoiceFallback is false', async () => {
    const statuses: string[] = [];
    const unsub = speechService.subscribeEngineStatus((st) => {
      statuses.push(st.state);
    });

    let reportedError = '';
    await speechService.speak({
      text: 'Teste sem chave de API.',
      settings: {
        ...createDefaultVoiceSettings(),
        ttsEngine: 'gemini_tts',
        allowSystemVoiceFallback: false,
      },
      geminiKeyFallback: '',
      onError: (err) => {
        reportedError = err;
      },
    });

    unsub();
    expect(statuses).toContain('failed');
    expect(statuses).not.toContain('fallback');
    expect(reportedError).toContain('Gemini');
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

  it('builds a Professor system prompt anchored to the active sentence and exam boards', () => {
    const demo = createDemoDocument();
    const prompt = buildReadingSystemPrompt(demo, 1);
    expect(prompt).toContain(demo.fileName);
    expect(prompt).toContain('Cebraspe');
    expect(prompt).toContain('Podemos continuar a leitura?');
  });
});
