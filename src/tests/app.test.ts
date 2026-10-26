import { describe, it, expect, beforeEach } from 'vitest';
import {
  splitParagraphIntoSentences,
  segmentPageText,
  createDemoDocument,
  isHeaderOrFooterArtifact,
  classifySentenceBlockType,
  detectRepetitiveHeaderFooterFingerprints,
  stripInlineWatermarks,
  normalizePageRange,
  buildCleanStudyDocumentFromAiBlocks,
  buildBlocksFromLineRanges,
  appendCleanStudyBlocksToDocument,
  isChartOrTableArtifact,
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
  computeCalibratedPlaybackRate,
  BASE_CADENCE_FACTOR,
} from '../services/speechService';
import {
  loadVoiceSettings,
  saveDocumentToUserLibrary,
  loadUserPdfLibrary,
  updateDocumentReadingProgress,
  deleteDocumentFromLibrary,
  computePdfFingerprint,
  saveCachedCleanPages,
  loadCachedCleanPages,
} from '../services/storageService';
import {
  registerAccount,
  loginAccount,
  restoreActiveSession,
  syncSettingsToActiveAccount,
  logoutActiveAccount,
} from '../services/authService';
import ortPkg from '../../node_modules/onnxruntime-web/package.json';

describe('PDF Page Range Selector, Deep AI Study Extraction & Sanitizer', () => {
  it('normalizes page ranges including 0-to-22 and 50-to-71 accurately', () => {
    expect(normalizePageRange(0, 22, 100)).toEqual({
      startPage: 1,
      endPage: 22,
    });
    expect(normalizePageRange(50, 71, 100)).toEqual({
      startPage: 50,
      endPage: 71,
    });
    expect(normalizePageRange(71, 50, 100)).toEqual({
      startPage: 50,
      endPage: 71,
    });
    expect(normalizePageRange(-5, 999, 80)).toEqual({
      startPage: 1,
      endPage: 80,
    });
  });

  it('builds a clean Demo-style study document from Gemini AI extracted blocks', () => {
    const cleanDoc = buildCleanStudyDocumentFromAiBlocks({
      fileName: 'Apostila_Direito_Constitucional.pdf',
      fileSize: 2048000,
      originalTotalPages: 120,
      startPage: 50,
      endPage: 52,
      rawPages: [
        {
          pageNumber: 50,
          lines: [],
        },
        {
          pageNumber: 51,
          lines: [
            {
              text: '1. Direitos e Garantias Fundamentais',
              pdfY: 700,
              normY: 0.15,
              lineHeight: 14,
              boxes: [{ x: 0.08, y: 0.14, width: 0.7, height: 0.03 }],
            },
            {
              text: 'Os direitos fundamentais possuem aplicabilidade imediata.',
              pdfY: 650,
              normY: 0.25,
              lineHeight: 12,
              boxes: [{ x: 0.08, y: 0.24, width: 0.82, height: 0.03 }],
            },
          ],
        },
      ],
      blocks: [
        {
          pageNumber: 51,
          blockType: 'heading',
          topicTitle: '1. Direitos e Garantias Fundamentais',
          text: '1. Direitos e Garantias Fundamentais',
        },
        {
          pageNumber: 51,
          blockType: 'normal',
          topicTitle: '1. Direitos e Garantias Fundamentais',
          text: 'Os direitos fundamentais possuem aplicabilidade imediata conforme o artigo quinto, parágrafo primeiro.',
        },
        {
          pageNumber: 51,
          blockType: 'alert',
          topicTitle: '1. Direitos e Garantias Fundamentais',
          text: 'Atenção! Não existem direitos fundamentais absolutos no ordenamento brasileiro.',
        },
      ],
    });

    expect(cleanDoc.selectedStartPage).toBe(50);
    expect(cleanDoc.selectedEndPage).toBe(52);
    expect(cleanDoc.originalTotalPages).toBe(120);
    expect(cleanDoc.aiCleaned).toBe(true);
    expect(cleanDoc.cleaningMode).toBe('ai');
    expect(cleanDoc.sentences.length).toBe(3);
    expect(cleanDoc.sentences[0].blockType).toBe('heading');
    expect(cleanDoc.sentences[2].blockType).toBe('alert');
    expect(cleanDoc.topics.length).toBe(1);
    expect(cleanDoc.topics[0].title).toContain('Direitos e Garantias');
  });

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
    expect(
      isHeaderOrFooterArtifact(
        '1.2 Direitos Fundamentais ................... 18',
        0.4,
        true
      )
    ).toBe(true);
    expect(
      isHeaderOrFooterArtifact('Aula 03 - Prof. Herbert Almeida', 0.03, true)
    ).toBe(true);
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
        {
          text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 1 de 50',
          normY: 0.03,
        },
        {
          text: 'O poder constituinte originário é inicial, ilimitado e incondicionado.',
          normY: 0.4,
        },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
      [
        {
          text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 2 de 50',
          normY: 0.03,
        },
        {
          text: 'Já o poder constituinte derivado está sujeito a limites formais e materiais.',
          normY: 0.45,
        },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
      [
        {
          text: 'Curso Regular Direito Constitucional - Aula 01 - Pág. 3 de 50',
          normY: 0.03,
        },
        {
          text: 'As cláusulas pétreas estão previstas no artigo 60, parágrafo quarto.',
          normY: 0.5,
        },
        { text: 'Aluno: João da Silva - Documento exclusivo', normY: 0.95 },
      ],
    ];

    const repetitiveSet = detectRepetitiveHeaderFooterFingerprints(
      simulatedPages,
      true
    );
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

  it('formats Google Gemini requests (including responseMimeType JSON) and extracts responses properly', () => {
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: 'AIzaTestKey123',
      model: 'gemini-3.5-flash-lite',
      systemPrompt: 'Você é um professor de concursos.',
      messages: [{ role: 'user', content: 'Explique com analogia.' }],
      responseMimeType: 'application/json',
    });

    expect(req.url).toContain(
      'gemini-3.5-flash-lite:generateContent?key=AIzaTestKey123'
    );
    expect(req.body).toContain('"responseMimeType":"application/json"');

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

  it('maintains the user personal PDF reading list with page ranges and updates reading progress', async () => {
    const demo = createDemoDocument();
    const userDoc = {
      ...demo,
      id: 'doc-direito-constitucional-1',
      fileName: 'Aula_01_Direito_Constitucional.pdf',
      selectedStartPage: 50,
      selectedEndPage: 71,
      originalTotalPages: 120,
      removedNoiseCount: 24,
    };

    const listAfterSave = await saveDocumentToUserLibrary(userDoc, 'murilo');
    expect(listAfterSave.length).toBe(1);
    expect(listAfterSave[0].fileName).toBe('Aula_01_Direito_Constitucional.pdf');
    expect(listAfterSave[0].selectedStartPage).toBe(50);
    expect(listAfterSave[0].selectedEndPage).toBe(71);
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

describe('Exclusive Piper Neural WASM Voice Engine & Permanent Cache', () => {
  it('defaults exclusively to Piper Neural WASM (pt_BR-faber-medium) with lookahead prefetch', () => {
    const settings = loadVoiceSettings();
    expect(settings.ttsEngine).toBe('piper_wasm');
    expect(settings.piperVoiceId).toBe('pt_BR-faber-medium');
    expect(settings.prefetchNextSentence).toBe(true);
  });

  it('matches PIPER_WASM_PATHS.onnxWasm to the exact installed onnxruntime-web version', () => {
    expect(PIPER_WASM_PATHS.onnxWasm).toContain(
      `onnxruntime-web@${ortPkg.version}`
    );
  });

  it('shapes Portuguese text with expressive prosody pauses for Piper Neural TTS', () => {
    const alertText = formatExpressiveTextForNeuralTts(
      'O princípio da legalidade exige lei formal.',
      'alert'
    );
    expect(alertText).toContain('Atenção!');
    expect(alertText).toContain('... ');
  });

  it('converts 24kHz PCM base64 audio into a valid WAV Blob', () => {
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

describe('Fast Line-Range Gemini Classification, Progressive PDF Loading & Page Cache', () => {
  it('converts compact Gemini line-range tuples into clean study blocks with joined hyphens and exact BBoxes', () => {
    const lines = [
      {
        text: 'Curso Estratégia Concursos - Aula 01 - Pág. 10',
        pdfY: 790,
        normY: 0.03,
        lineHeight: 10,
        boxes: [{ x: 0.05, y: 0.02, width: 0.8, height: 0.02 }],
      },
      {
        text: '2.1 Poder Constituinte Originário',
        pdfY: 720,
        normY: 0.14,
        lineHeight: 14,
        boxes: [{ x: 0.08, y: 0.13, width: 0.65, height: 0.03 }],
      },
      {
        text: 'O poder constituinte originário instaura uma nova ordem consti-',
        pdfY: 680,
        normY: 0.2,
        lineHeight: 12,
        boxes: [{ x: 0.08, y: 0.19, width: 0.82, height: 0.025 }],
      },
      {
        text: 'tucional de forma autônoma e ilimitada juridicamente.',
        pdfY: 664,
        normY: 0.23,
        lineHeight: 12,
        boxes: [{ x: 0.08, y: 0.22, width: 0.78, height: 0.025 }],
      },
    ];

    const blocks = buildBlocksFromLineRanges(
      [{ pageNumber: 10, lines }],
      [
        [1, 1, 'h'],
        [2, 3, 'n'],
      ]
    );

    expect(blocks.length).toBe(2);
    expect(blocks[0].blockType).toBe('heading');
    expect(blocks[0].text).toBe('2.1 Poder Constituinte Originário');
    expect(blocks[1].blockType).toBe('normal');
    expect(blocks[1].text).toBe(
      'O poder constituinte originário instaura uma nova ordem constitucional de forma autônoma e ilimitada juridicamente.'
    );
    expect(blocks[1].bboxes?.length).toBe(2);
  });

  it('progressively appends new background pages to an active document without altering existing sentence indices', () => {
    const rawPages = [
      {
        pageNumber: 1,
        lines: [
          {
            text: '1. Introdução ao Direito Administrativo',
            pdfY: 700,
            normY: 0.15,
            lineHeight: 14,
            boxes: [{ x: 0.1, y: 0.14, width: 0.7, height: 0.03 }],
          },
          {
            text: 'O Direito Administrativo rege a função administrativa do Estado.',
            pdfY: 660,
            normY: 0.22,
            lineHeight: 12,
            boxes: [{ x: 0.1, y: 0.21, width: 0.8, height: 0.03 }],
          },
        ],
      },
      {
        pageNumber: 2,
        lines: [
          {
            text: '2. Regime Jurídico Administrativo',
            pdfY: 700,
            normY: 0.15,
            lineHeight: 14,
            boxes: [{ x: 0.1, y: 0.14, width: 0.7, height: 0.03 }],
          },
          {
            text: 'Baseia-se na supremacia e na indisponibilidade do interesse público.',
            pdfY: 660,
            normY: 0.22,
            lineHeight: 12,
            boxes: [{ x: 0.1, y: 0.21, width: 0.8, height: 0.03 }],
          },
        ],
      },
    ];

    const initialDoc = buildCleanStudyDocumentFromAiBlocks({
      fileName: 'Apostila_Progressiva.pdf',
      fileSize: 1024000,
      originalTotalPages: 10,
      startPage: 1,
      endPage: 2,
      rawPages,
      blocks: [
        {
          pageNumber: 1,
          blockType: 'heading',
          text: '1. Introdução ao Direito Administrativo',
        },
        {
          pageNumber: 1,
          blockType: 'normal',
          text: 'O Direito Administrativo rege a função administrativa do Estado.',
        },
      ],
      pendingPages: [2],
    });

    expect(initialDoc.sentences.length).toBe(2);
    expect(initialDoc.pendingPages).toEqual([2]);
    const firstSentenceId = initialDoc.sentences[0].id;
    const secondSentenceId = initialDoc.sentences[1].id;

    const updatedDoc = appendCleanStudyBlocksToDocument({
      doc: initialDoc,
      rawPages,
      newBlocks: [
        {
          pageNumber: 2,
          blockType: 'heading',
          text: '2. Regime Jurídico Administrativo',
        },
        {
          pageNumber: 2,
          blockType: 'normal',
          text: 'Baseia-se na supremacia e na indisponibilidade do interesse público.',
        },
      ],
      completedPages: [2],
    });

    expect(updatedDoc.sentences.length).toBe(4);
    expect(updatedDoc.pendingPages ?? []).toEqual([]);
    // Existing sentence IDs and globalIndex must remain untouched so active audio never skips
    expect(updatedDoc.sentences[0].id).toBe(firstSentenceId);
    expect(updatedDoc.sentences[0].globalIndex).toBe(0);
    expect(updatedDoc.sentences[1].id).toBe(secondSentenceId);
    expect(updatedDoc.sentences[1].globalIndex).toBe(1);
    expect(updatedDoc.sentences[2].globalIndex).toBe(2);
    expect(updatedDoc.sentences[3].globalIndex).toBe(3);
  });

  it('includes maxOutputTokens and thinkingBudget: 0 when disableThinking is enabled on Gemini 2.5 models', () => {
    const req = buildProviderRequest({
      provider: 'gemini',
      apiKey: 'AIzaTestKey123',
      model: 'gemini-2.5-flash-lite',
      systemPrompt: 'Classifique linhas.',
      messages: [{ role: 'user', content: '=== PAGINA 1 ===' }],
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
      disableThinking: true,
    });

    expect(req.body).toContain('"maxOutputTokens":1024');
    expect(req.body).toContain('"thinkingBudget":0');
  });

  it('caches and reloads cleaned study blocks per page using PDF fingerprint', async () => {
    const dummyBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    const fp = await computePdfFingerprint(dummyBuffer);
    expect(fp.length).toBeGreaterThan(4);

    const mapToSave = new Map([
      [
        5,
        [
          {
            pageNumber: 5,
            blockType: 'normal' as const,
            text: 'Conteúdo limpo em cache para abertura instantânea.',
          },
        ],
      ],
    ]);
    await saveCachedCleanPages(fp, mapToSave);

    const cachedMap = await loadCachedCleanPages(fp, [5, 6]);
    expect(cachedMap.has(5)).toBe(true);
    expect(cachedMap.has(6)).toBe(false);
    expect(cachedMap.get(5)?.[0].text).toBe(
      'Conteúdo limpo em cache para abertura instantânea.'
    );
  });

  it('skips reading inside charts, tables, figure captions, and axes while preserving didactic study text', () => {
    // 1. Multi-column table row with large horizontal X gaps
    expect(
      isChartOrTableArtifact({
        text: 'Cargo Efetivo   120 vagas   R$ 12.500,00',
        pdfY: 500,
        normY: 0.4,
        lineHeight: 11,
        boxes: [
          { x: 0.1, y: 0.4, width: 0.18, height: 0.02 },
          { x: 0.42, y: 0.4, width: 0.12, height: 0.02 },
          { x: 0.72, y: 0.4, width: 0.16, height: 0.02 },
        ],
      })
    ).toBe(true);

    // 2. Numeric chart axis / percentage scale
    expect(
      isChartOrTableArtifact({
        text: '0% 20% 40% 60% 80% 100%',
        pdfY: 420,
        normY: 0.5,
        lineHeight: 10,
        boxes: [{ x: 0.15, y: 0.5, width: 0.6, height: 0.02 }],
      })
    ).toBe(true);

    // 3. Figure / Table caption & source line
    expect(
      isChartOrTableArtifact({
        text: 'Fonte: IBGE / Elaboração própria (2025)',
        pdfY: 380,
        normY: 0.55,
        lineHeight: 10,
        boxes: [{ x: 0.1, y: 0.55, width: 0.5, height: 0.02 }],
      })
    ).toBe(true);

    // 4. Normal didactic paragraph & Law Article must NOT be skipped
    expect(
      isChartOrTableArtifact({
        text: 'Art. 37. A administração pública direta e indireta de qualquer dos Poderes obedecerá aos princípios de legalidade e eficiência.',
        pdfY: 600,
        normY: 0.3,
        lineHeight: 12,
        boxes: [{ x: 0.08, y: 0.3, width: 0.84, height: 0.025 }],
      })
    ).toBe(false);
  });

  it('recalibrates voice playback rate down for calm, unhurried study reading', () => {
    const settings = loadVoiceSettings();
    expect(settings.rate).toBe(0.85);
    expect(settings.autoFlashcardsOnTopicEnd).toBe(false);

    const calibrated085 = computeCalibratedPlaybackRate(0.85);
    expect(calibrated085).toBeCloseTo(0.85 * BASE_CADENCE_FACTOR, 2);
    expect(calibrated085).toBeLessThan(0.7);
  });
});
