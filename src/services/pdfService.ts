import * as pdfjsLib from 'pdfjs-dist';
import type {
  NormalizedBBox,
  PDFDocumentData,
  PDFPageContent,
  PDFSentence,
  PDFTopic,
  SentenceBlockType,
} from '../types';

// Configure worker for Vite bundler
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

const ABBREVIATION_REGEX =
  /\b(Sr|Sra|Dr|Dra|Prof|Profa|Cap|Art|Arts|Inc|Ltd|etc|ex|fig|pág|págs|vol|nº|no|vs|pe|Min|Rel|CF|CC|CP|CPC|CPP|CLT)\.\s*$/i;

/**
 * Patterns typical of repetitive headers/footers/watermarks in Estratégia & Gran Cursos PDFs
 */
const HEADER_FOOTER_NOISE_REGEX =
  /^(página\s+\d+\s*(de|\/)\s*\d+|pág\.\s*\d+|\d+\s+de\s+\d+|estratégia\s+concursos|gran\s+cursos\s+online|todos\s+os\s+direitos\s+reservados|proibida\s+a\s+reprodução|documento\s+exclusivo\s+para\s+uso\s+pessoal|cpf[:\s]*\d{3}\.?\d{3}\.?\d{3}-?\d{2}|www\.estrategiaconcursos\.com\.br|www\.grancursosonline\.com\.br|\d{1,4})$/i;

const HEADING_TOPIC_REGEX =
  /^((capítulo|seção|tópico|título|tema|ponto)\s+[0-9ivxlcdm]+|\d+(\.\d+)*\s*[-–.)]?\s+[A-ZÀ-Ú])/i;

const ALERT_BOX_REGEX =
  /^(atenção|cuidado|pegadinha(\s+de\s+prova|\s+da\s+banca)?|importante|jurisprudência|súmula|dica\s+de\s+prova|fique\s+atento|destaque|memorize)[:!\s-]/i;

const QUESTION_LIST_REGEX =
  /^(questão\s+\d+|\d+\s*[.)]\s*\((cebraspe|cespe|fgv|fcc|vunesp|cesgranrio|ibfc|idecan|aocp))/i;

/**
 * Checks if a line of text in a PDF is a repetitive header/footer artifact
 */
export function isHeaderOrFooterArtifact(
  text: string,
  normalizedY: number | null,
  sanitizeEnabled = true
): boolean {
  if (!sanitizeEnabled) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (HEADER_FOOTER_NOISE_REGEX.test(trimmed)) {
    return true;
  }

  // Top 5% or Bottom 5% of page with explicit watermark/copyright/CPF metadata
  if (normalizedY !== null && (normalizedY < 0.05 || normalizedY > 0.95)) {
    if (
      trimmed.length < 90 &&
      /(cpf[:\s]*\d|todos os direitos reservados|proibida a reprodução|estratégia concursos|gran cursos)/i.test(
        trimmed
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Classifies sentence block type for expressive TTS intonation and topic splitting
 */
export function classifySentenceBlockType(text: string): SentenceBlockType {
  const clean = text.trim();
  if (ALERT_BOX_REGEX.test(clean)) return 'alert';
  if (QUESTION_LIST_REGEX.test(clean)) return 'question_item';
  if (
    HEADING_TOPIC_REGEX.test(clean) &&
    clean.length <= 120 &&
    !clean.endsWith(',')
  ) {
    return 'heading';
  }
  return 'normal';
}

/**
 * Splits paragraph text into natural sentences suitable for voice synthesis (TTS).
 */
export function splitParagraphIntoSentences(paragraph: string): string[] {
  const cleaned = paragraph.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  let rawSegments: string[] = [];

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' });
    rawSegments = Array.from(segmenter.segment(cleaned), (s) =>
      s.segment.trim()
    ).filter(Boolean);
  } else {
    rawSegments = cleaned
      .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ú0-9"“«(])/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const merged: string[] = [];
  let buffer = '';

  for (const seg of rawSegments) {
    if (buffer) {
      buffer = `${buffer} ${seg}`;
    } else {
      buffer = seg;
    }

    const isAbbreviation = ABBREVIATION_REGEX.test(buffer);
    const isTooShortNumbering = /^(\d+(\.\d+)*|[a-zA-Z])[.) -]*$/.test(buffer);

    if (!isAbbreviation && !isTooShortNumbering && buffer.length >= 12) {
      merged.push(buffer);
      buffer = '';
    }
  }

  if (buffer) {
    if (merged.length > 0 && buffer.length < 15) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${buffer}`;
    } else {
      merged.push(buffer);
    }
  }

  return merged;
}

/**
 * Builds topic boundaries and marks `isTopicEnd` on the final sentence of each topic
 */
export function finalizeTopicsAndSentences(
  sentences: PDFSentence[]
): PDFTopic[] {
  const topics: PDFTopic[] = [];
  if (sentences.length === 0) return topics;

  let currentTopicId = 'topic-1';
  let currentTopicTitle = '1. Introdução e Conceitos Fundamentais';
  let currentTopicStart = 0;
  let currentTopicPage = sentences[0].pageNumber;

  sentences.forEach((sent, idx) => {
    const isNewHeading =
      sent.blockType === 'heading' ||
      (sent.paragraphIndex === 0 &&
        sent.sentenceInParagraph === 0 &&
        sent.text.length < 95 &&
        !/[.!?]$/.test(sent.text));

    if (isNewHeading && idx > 0 && idx - currentTopicStart >= 2) {
      // Mark previous sentence as end of the previous topic
      sentences[idx - 1].isTopicEnd = true;
      topics.push({
        id: currentTopicId,
        title: currentTopicTitle,
        pageNumber: currentTopicPage,
        startSentenceIndex: currentTopicStart,
        endSentenceIndex: idx - 1,
      });

      currentTopicId = `topic-${topics.length + 1}`;
      currentTopicTitle = sent.text.replace(/[:.]+$/, '').trim();
      currentTopicStart = idx;
      currentTopicPage = sent.pageNumber;
    } else if (isNewHeading && idx === 0) {
      currentTopicTitle = sent.text.replace(/[:.]+$/, '').trim();
    }

    sent.topicId = currentTopicId;
    sent.topicTitle = currentTopicTitle;
  });

  // Close final topic
  const lastIdx = sentences.length - 1;
  sentences[lastIdx].isTopicEnd = true;
  topics.push({
    id: currentTopicId,
    title: currentTopicTitle,
    pageNumber: currentTopicPage,
    startSentenceIndex: currentTopicStart,
    endSentenceIndex: lastIdx,
  });

  return topics;
}

/**
 * Segments raw page text into paragraphs and indexed sentences with simulated vertical BBoxes
 */
export function segmentPageText(
  rawPageText: string,
  pageNumber: number,
  startingGlobalIndex: number,
  paragraphBBoxes?: NormalizedBBox[][]
): {
  pageContent: PDFPageContent;
  sentences: PDFSentence[];
} {
  const normalized = rawPageText
    .replace(/\r\n/g, '\n')
    .replace(/([a-záéíóúâêôãõç])-\n([a-záéíóúâêôãõç])/gi, '$1$2');

  const rawLines = normalized.split('\n');
  let ignoredHeaderFooterCount = 0;
  const cleanedLines = rawLines.filter((line, idx) => {
    const approxY = rawLines.length > 1 ? idx / (rawLines.length - 1) : 0.5;
    if (isHeaderOrFooterArtifact(line, approxY, true)) {
      ignoredHeaderFooterCount++;
      return false;
    }
    return true;
  });

  const rejoined = cleanedLines.join('\n');

  const rawParagraphs = rejoined
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const paragraphs =
    rawParagraphs.length > 0
      ? rawParagraphs
      : [rejoined.replace(/\s+/g, ' ').trim()].filter(Boolean);

  const sentences: PDFSentence[] = [];
  const sentenceIds: string[] = [];
  let currentGlobal = startingGlobalIndex;

  paragraphs.forEach((paraText, pIdx) => {
    const paraSentences = splitParagraphIntoSentences(paraText);
    const totalCharsInPara = Math.max(
      1,
      paraSentences.reduce((acc, s) => acc + s.length, 0)
    );
    let charCursor = 0;

    // Default vertical band for this paragraph if exact PDF item BBoxes aren't supplied
    const paraTopY = 0.12 + (pIdx / Math.max(1, paragraphs.length)) * 0.74;
    const paraBandHeight = Math.min(0.22, 0.72 / Math.max(1, paragraphs.length));

    paraSentences.forEach((sentText, sIdx) => {
      const id = `p${pageNumber}-par${pIdx}-s${sIdx}`;
      const blockType = classifySentenceBlockType(sentText);

      const startRatio = charCursor / totalCharsInPara;
      const endRatio = (charCursor + sentText.length) / totalCharsInPara;
      charCursor += sentText.length;

      let bboxes: NormalizedBBox[];
      const customParaBoxes = paragraphBBoxes?.[pIdx];
      if (customParaBoxes && customParaBoxes.length > 0) {
        const startBoxIdx = Math.floor(startRatio * customParaBoxes.length);
        const endBoxIdx = Math.max(
          startBoxIdx + 1,
          Math.ceil(endRatio * customParaBoxes.length)
        );
        bboxes = customParaBoxes.slice(startBoxIdx, endBoxIdx);
      } else {
        bboxes = [
          {
            x: 0.08,
            y: paraTopY + startRatio * paraBandHeight,
            width: 0.84,
            height: Math.max(0.032, (endRatio - startRatio) * paraBandHeight),
          },
        ];
      }

      sentences.push({
        id,
        globalIndex: currentGlobal++,
        pageNumber,
        paragraphIndex: pIdx,
        sentenceInParagraph: sIdx,
        text: sentText,
        blockType,
        topicId: 'topic-1',
        topicTitle: 'Tópico Principal',
        bboxes,
      });
      sentenceIds.push(id);
    });
  });

  return {
    pageContent: {
      pageNumber,
      rawText: rawPageText,
      paragraphs,
      sentenceIds,
      ignoredHeaderFooterCount,
    },
    sentences,
  };
}

/**
 * Extracts structured text, sentences, topics, and exact normalized bounding boxes from a PDF ArrayBuffer
 */
export async function parsePdfArrayBuffer(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number,
  sanitizeHeadersFooters = true
): Promise<PDFDocumentData> {
  const bufferCopy = fileBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width || 600;
    const pageHeight = viewport.height || 840;

    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let lastHeight = 12;
    let currentParaText = '';
    let currentParaBoxes: NormalizedBBox[] = [];
    const paragraphsText: string[] = [];
    const paragraphsBoxes: NormalizedBBox[][] = [];
    let ignoredCount = 0;

    for (const item of textContent.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const text = item.str;
      if (!text.trim()) continue;

      const transform = item.transform;
      const pdfX = Array.isArray(transform) ? transform[4] : 50;
      const pdfY = Array.isArray(transform) ? transform[5] : 400;
      const itemH = item.height || Math.abs(transform?.[3] || 12) || 12;
      const itemW = item.width || text.length * (itemH * 0.5);

      // Convert PDF bottom-left origin to top-left normalized (0..1) coordinates
      const normX = Math.max(0, Math.min(0.95, pdfX / pageWidth));
      const normY = Math.max(
        0,
        Math.min(0.98, (pageHeight - pdfY - itemH) / pageHeight)
      );
      const normW = Math.max(0.02, Math.min(1 - normX, itemW / pageWidth));
      const normH = Math.max(0.014, Math.min(0.1, (itemH * 1.35) / pageHeight));

      if (isHeaderOrFooterArtifact(text, normY, sanitizeHeadersFooters)) {
        ignoredCount++;
        continue;
      }

      if (lastY !== null) {
        const dy = Math.abs(lastY - pdfY);
        if (dy > lastHeight * 1.85) {
          // New paragraph break
          if (currentParaText.trim()) {
            paragraphsText.push(currentParaText.trim());
            paragraphsBoxes.push(currentParaBoxes);
          }
          currentParaText = '';
          currentParaBoxes = [];
        } else if (dy > lastHeight * 0.35) {
          // Line break within same paragraph
          if (currentParaText.endsWith('-')) {
            currentParaText = currentParaText.slice(0, -1);
          } else if (!currentParaText.endsWith(' ')) {
            currentParaText += ' ';
          }
        } else if (!currentParaText.endsWith(' ') && !text.startsWith(' ')) {
          currentParaText += ' ';
        }
      }

      currentParaText += text;
      currentParaBoxes.push({ x: normX, y: normY, width: normW, height: normH });

      lastY = pdfY;
      lastHeight = itemH;
    }

    if (currentParaText.trim()) {
      paragraphsText.push(currentParaText.trim());
      paragraphsBoxes.push(currentParaBoxes);
    }

    const joinedPageText = paragraphsText.join('\n\n');
    const { pageContent, sentences } = segmentPageText(
      joinedPageText,
      pageNum,
      allSentences.length,
      paragraphsBoxes
    );
    pageContent.ignoredHeaderFooterCount += ignoredCount;

    pages.push(pageContent);
    allSentences.push(...sentences);
  }

  if (allSentences.length === 0) {
    const fallbackSentence: PDFSentence = {
      id: 'p1-par0-s0',
      globalIndex: 0,
      pageNumber: 1,
      paragraphIndex: 0,
      sentenceInParagraph: 0,
      text: 'Não foi possível extrair texto selecionável deste PDF. Verifique se o documento possui camada de texto digital.',
      blockType: 'normal',
      topicId: 'topic-1',
      topicTitle: 'Aviso de Leitura',
      isTopicEnd: true,
      bboxes: [{ x: 0.08, y: 0.2, width: 0.84, height: 0.08 }],
    };
    allSentences.push(fallbackSentence);
    pages.push({
      pageNumber: 1,
      rawText: fallbackSentence.text,
      paragraphs: [fallbackSentence.text],
      sentenceIds: [fallbackSentence.id],
      ignoredHeaderFooterCount: 0,
    });
  }

  const topics = finalizeTopicsAndSentences(allSentences);

  return {
    id: `doc-${Date.now()}`,
    fileName,
    fileSize,
    totalPages,
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    topics,
    currentSentenceIndex: 0,
    pdfBytes: fileBuffer.slice(0),
  };
}

/**
 * Loads a pdfjs PDFDocumentProxy from an ArrayBuffer for canvas rendering.
 */
export async function loadPdfProxy(fileBuffer: ArrayBuffer) {
  const bufferCopy = fileBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  return await loadingTask.promise;
}

/**
 * Creates a realistic Concursos (Estratégia/Gran style) study document with topics and exam alerts.
 */
export function createDemoDocument(): PDFDocumentData {
  const demoPagesRaw = [
    `1.1 Princípios Fundamentais da Administração Pública (Art. 37 da CF/88)\n\nA Administração Pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência, conhecidos pelo acrônimo LIMPE.\n\nEnquanto na esfera privada o particular pode fazer tudo aquilo que a lei não proíbe, no Direito Administrativo o gestor público só pode agir quando houver autorização ou determinação legal expressa.\n\nAtenção! Pegadinha de Prova: O princípio da legalidade não é absoluto, pois a própria Constituição prevê restrições excepcionais como as Medidas Provisórias, o Estado de Defesa e o Estado de Sítio.`,
    `1.2 Princípio da Impessoalidade e Vedação ao Nepotismo\n\nO princípio da impessoalidade possui duplo sentido na doutrina moderna: a finalidade pública do ato e a isonomia perante os administrados. Além disso, o artigo 37, parágrafo primeiro, proíbe que a publicidade oficial contenha nomes, símbolos ou imagens que caracterizem promoção pessoal de autoridades.\n\nImportante: Segundo a Súmula Vinculante 13 do STF, a nomeação de cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, para cargo em comissão ou função de confiança viola a Constituição Federal.\n\nAtenção! As bancas examinadoras como Cebraspe e FGV adoram cobrar a exceção jurisprudencial: a Súmula Vinculante 13, em regra, não se aplica à nomeação para cargos políticos, como Ministros de Estado ou Secretários Estaduais, salvo se comprovada fraude ou ausência de qualificação técnica.`,
    `1.3 Poderes Administrativos: Poder Vinculado vs. Poder Discricionário\n\nNo exercício do Poder Vinculado, a lei estabelece todos os requisitos e elementos do ato administrativo, não deixando margem de liberdade para o agente público avaliar conveniência ou oportunidade.\n\nJá no Poder Discricionário, a lei confere ao administrador uma margem de liberdade para escolher, dentro dos limites legais, a solução mais adequada segundo critérios de conveniência e oportunidade, o chamado mérito administrativo.\n\nPegadinha da Banca: O Poder Judiciário pode controlar a legalidade, a razoabilidade e a proporcionalidade de um ato discricionário, mas jamais pode substituir o mérito administrativo legítimo do gestor público.`,
  ];

  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];

  demoPagesRaw.forEach((rawText, idx) => {
    const pageNum = idx + 1;
    const { pageContent, sentences } = segmentPageText(
      rawText,
      pageNum,
      allSentences.length
    );
    pages.push(pageContent);
    allSentences.push(...sentences);
  });

  const topics = finalizeTopicsAndSentences(allSentences);

  return {
    id: 'demo-concursos-direito-adm',
    fileName: 'Apostila_Direito_Administrativo_Concursos.pdf',
    fileSize: 215400,
    totalPages: demoPagesRaw.length,
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    topics,
    currentSentenceIndex: 0,
  };
}
