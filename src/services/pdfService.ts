import * as pdfjsLib from 'pdfjs-dist';
import type {
  AiExtractedStudyBlock,
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
 * Comprehensive patterns typical of headers, footers, watermarks, TOC dots, logos, and editorial noise
 */
const HEADER_FOOTER_NOISE_REGEX =
  /^(página\s+\d+\s*(de|\/)?\s*\d*|pág\.?\s*\d+\s*(de|\/)?\s*\d*|\d+\s*(de|\/)\s*\d+|estratégia\s+concursos.*|gran\s+cursos\s+online.*|direção\s+concursos.*|alfacon\s+concursos.*|todos\s+os\s+direitos\s+reservados.*|proibida\s+a\s+reprodução.*|documento\s+exclusivo\s+para\s+uso\s+pessoal.*|licenciado\s+para\s+.*|impresso\s+por\s+.*|material\s+de\s+uso\s+exclusivo.*|cpf[:\s-]*\d{3}\.?\d{3}\.?\d{3}-?\d{2}.*|cnpj[:\s-]*\d{2}\..*|isbn[:\s-]*[\d-]+|issn[:\s-]*[\d-]+|https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+|\d{1,4})$/i;

const INLINE_WATERMARK_NOISE_REGEX =
  /(cpf[:\s]*\d{3}\.?\d{3}\.?\d{3}-?\d{2}|todos os direitos reservados|proibida a reprodução total ou parcial|licenciado para [^-|•\n]+|impresso por [^-|•\n]+|www\.estrategiaconcursos\.com\.br|www\.grancursosonline\.com\.br)/gi;

const TOC_DOT_LEADER_REGEX = /([.…\s]{5,}|\s+[-_]{4,}\s+)\d{1,4}\s*$/;

const HEADING_TOPIC_REGEX =
  /^((capítulo|seção|tópico|título|tema|ponto)\s+[0-9ivxlcdm]+|\d+(\.\d+)*\s*[-–.)]?\s+[A-ZÀ-Ú])/i;

const ALERT_BOX_REGEX =
  /^(atenção|cuidado|pegadinha(\s+de\s+prova|\s+da\s+banca)?|importante|jurisprudência|súmula|dica\s+de\s+prova|fique\s+atento|destaque|memorize)[:!\s-]/i;

const QUESTION_LIST_REGEX =
  /^(questão\s+\d+|\d+\s*[.)]\s*\((cebraspe|cespe|fgv|fcc|vunesp|cesgranrio|ibfc|idecan|aocp))/i;

export interface ReconstructedPdfLine {
  text: string;
  pdfY: number;
  normY: number;
  lineHeight: number;
  boxes: NormalizedBBox[];
}

export interface ExtractedRawPage {
  pageNumber: number;
  lines: ReconstructedPdfLine[];
}

/**
 * Normalizes user page range input (e.g. `0 a 22` -> `1 a 22`, `50 a 71` -> `50 a 71`)
 */
export function normalizePageRange(
  startInput: number,
  endInput: number,
  totalPages: number
): { startPage: number; endPage: number } {
  const safeTotal = Math.max(1, Math.floor(totalPages || 1));
  const rawStart = Number.isFinite(startInput) ? Math.floor(startInput) : 1;
  const rawEnd = Number.isFinite(endInput) ? Math.floor(endInput) : safeTotal;

  // Treat 0 (or negative) as page 1 so "0 a 22" works intuitively as "1 a 22"
  const clampedStart = Math.max(1, Math.min(safeTotal, rawStart <= 0 ? 1 : rawStart));
  const clampedEnd = Math.max(1, Math.min(safeTotal, rawEnd <= 0 ? safeTotal : rawEnd));

  return {
    startPage: Math.min(clampedStart, clampedEnd),
    endPage: Math.max(clampedStart, clampedEnd),
  };
}

/**
 * Quickly inspects the total number of pages in a PDF ArrayBuffer
 */
export async function inspectPdfTotalPages(
  fileBuffer: ArrayBuffer
): Promise<number> {
  const bufferCopy = fileBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;
  return pdfDoc.numPages || 1;
}

export function normalizeLineFingerprint(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ');
}

export function detectRepetitiveHeaderFooterFingerprints(
  pagesLines: { text: string; normY: number }[][],
  sanitizeEnabled = true
): Set<string> {
  const repeatedFingerprints = new Set<string>();
  if (!sanitizeEnabled || pagesLines.length < 2) {
    return repeatedFingerprints;
  }

  const totalPages = pagesLines.length;
  const pageFrequency = new Map<string, { count: number; marginHits: number }>();

  for (const lines of pagesLines) {
    const seenOnThisPage = new Set<string>();
    for (const lineObj of lines) {
      const trimmed = lineObj.text.trim();
      if (!trimmed || trimmed.length > 140) continue;

      const fp = normalizeLineFingerprint(trimmed);
      if (fp.length < 3 || seenOnThisPage.has(fp)) continue;
      seenOnThisPage.add(fp);

      const isMarginZone = lineObj.normY < 0.12 || lineObj.normY > 0.88;
      const prev = pageFrequency.get(fp) || { count: 0, marginHits: 0 };
      pageFrequency.set(fp, {
        count: prev.count + 1,
        marginHits: prev.marginHits + (isMarginZone ? 1 : 0),
      });
    }
  }

  const minPagesForGlobalRepeat = totalPages >= 4 ? 3 : 2;
  for (const [fp, stats] of pageFrequency.entries()) {
    if (
      stats.count >= minPagesForGlobalRepeat ||
      (stats.marginHits >= 2 && stats.count / totalPages >= 0.4)
    ) {
      repeatedFingerprints.add(fp);
    }
  }

  return repeatedFingerprints;
}

export function isHeaderOrFooterArtifact(
  text: string,
  normalizedY: number | null,
  sanitizeEnabled = true,
  repetitiveFingerprints?: Set<string>
): boolean {
  if (!sanitizeEnabled) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (HEADER_FOOTER_NOISE_REGEX.test(trimmed)) {
    return true;
  }

  if (TOC_DOT_LEADER_REGEX.test(trimmed)) {
    return true;
  }

  if (repetitiveFingerprints && repetitiveFingerprints.size > 0) {
    const fp = normalizeLineFingerprint(trimmed);
    if (repetitiveFingerprints.has(fp)) {
      return true;
    }
  }

  if (normalizedY !== null && (normalizedY < 0.085 || normalizedY > 0.915)) {
    if (
      trimmed.length < 110 &&
      /(cpf|cnpj|direitos reservados|reprodução|estratégia|gran cursos|direção concursos|alfacon|aula\s*\d+|prof\.|professor|curso\s+de|pág|página|\b\d+\s*\/\s*\d+\b|www\.|http|@|licenciado|impresso por|documento exclusivo|material de uso)/i.test(
        trimmed
      )
    ) {
      return true;
    }
  }

  return false;
}

export function stripInlineWatermarks(
  text: string,
  sanitizeEnabled = true
): string {
  if (!sanitizeEnabled) return text;
  return text
    .replace(INLINE_WATERMARK_NOISE_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
 * Matches a clean sentence back to the original PDF lines on that page by token overlap
 * so BBox highlighting on the PDF tab still works accurately.
 */
export function matchSentenceToLineBoxes(
  sentenceText: string,
  pageLines: ReconstructedPdfLine[],
  fallbackRatio = 0.5
): NormalizedBBox[] {
  if (!pageLines || pageLines.length === 0) {
    return [
      {
        x: 0.08,
        y: Math.min(0.88, Math.max(0.1, fallbackRatio)),
        width: 0.84,
        height: 0.04,
      },
    ];
  }

  const tokenize = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);

  const sentTokens = new Set(tokenize(sentenceText));
  if (sentTokens.size === 0) {
    return pageLines[0].boxes;
  }

  const matchedBoxes: NormalizedBBox[] = [];
  for (const line of pageLines) {
    const lineTokens = tokenize(line.text);
    if (lineTokens.length === 0) continue;
    let hits = 0;
    for (const tok of lineTokens) {
      if (sentTokens.has(tok)) hits++;
    }
    if (hits >= 2 || hits / lineTokens.length >= 0.5) {
      matchedBoxes.push(...line.boxes);
    }
  }

  if (matchedBoxes.length > 0) {
    return matchedBoxes.slice(0, 24);
  }

  return [
    {
      x: 0.08,
      y: Math.min(0.88, Math.max(0.1, fallbackRatio)),
      width: 0.84,
      height: 0.04,
    },
  ];
}

export type ClassifiedLineRangeTuple = [number, number, string];

function mapShortBlockCode(code: string): SentenceBlockType {
  const c = (code || '').trim().toLowerCase();
  if (c === 'h' || c === 'heading') return 'heading';
  if (c === 'a' || c === 'alert') return 'alert';
  if (c === 'q' || c === 'question_item' || c === 'question') return 'question_item';
  return 'normal';
}

/**
 * Converts compact Gemini line-range classifications (`[[startIdx, endIdx, "h|n|a|q"], ...]`)
 * into clean `AiExtractedStudyBlock[]` using the original PDF lines and their exact BBoxes!
 * Also splits multi-paragraph ranges using vertical PDF line spacing (`pdfY`) and joins hyphenated words.
 */
export function buildBlocksFromLineRanges(
  batchPages: ExtractedRawPage[],
  ranges: ClassifiedLineRangeTuple[]
): AiExtractedStudyBlock[] {
  const flatLines: { pageNumber: number; line: ReconstructedPdfLine }[] = [];
  for (const page of batchPages) {
    for (const line of page.lines) {
      flatLines.push({ pageNumber: page.pageNumber, line });
    }
  }

  if (flatLines.length === 0 || !Array.isArray(ranges) || ranges.length === 0) {
    return [];
  }

  const blocks: AiExtractedStudyBlock[] = [];

  const flushParagraph = (
    pageNum: number,
    blockType: SentenceBlockType,
    textAcc: string,
    boxesAcc: NormalizedBBox[]
  ) => {
    const cleaned = stripInlineWatermarks(textAcc, true)
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 3) return;
    const effectiveType =
      blockType !== 'normal' ? blockType : classifySentenceBlockType(cleaned);
    blocks.push({
      pageNumber: pageNum,
      blockType: effectiveType,
      text: cleaned,
      bboxes: boxesAcc.length > 0 ? boxesAcc.slice(0, 32) : undefined,
    });
  };

  for (const tuple of ranges) {
    if (!Array.isArray(tuple) || tuple.length < 2) continue;
    const rawStart = Number(tuple[0]);
    const rawEnd = Number(tuple[1]);
    if (Number.isNaN(rawStart) || Number.isNaN(rawEnd)) continue;

    const startIdx = Math.max(
      0,
      Math.min(flatLines.length - 1, Math.min(rawStart, rawEnd))
    );
    const endIdx = Math.max(
      0,
      Math.min(flatLines.length - 1, Math.max(rawStart, rawEnd))
    );
    const rangeType = mapShortBlockCode(String(tuple[2] || 'n'));

    let curPage = flatLines[startIdx].pageNumber;
    let curType: SentenceBlockType = rangeType;
    let curText = '';
    let curBoxes: NormalizedBBox[] = [];
    let lastY: number | null = null;
    let lastH = 12;

    for (let idx = startIdx; idx <= endIdx; idx++) {
      const entry = flatLines[idx];
      const lineText = entry.line.text.trim();
      if (!lineText) continue;

      const pageChanged = entry.pageNumber !== curPage;
      const verticalGap =
        lastY !== null &&
        Math.abs(lastY - entry.line.pdfY) > Math.max(lastH, entry.line.lineHeight) * 1.85;
      const startsNewSpecialBlock =
        curText.length > 0 &&
        (HEADING_TOPIC_REGEX.test(lineText) ||
          ALERT_BOX_REGEX.test(lineText) ||
          QUESTION_LIST_REGEX.test(lineText));

      if (pageChanged || verticalGap || startsNewSpecialBlock) {
        flushParagraph(curPage, curType, curText, curBoxes);
        curPage = entry.pageNumber;
        curType = rangeType;
        curText = '';
        curBoxes = [];
      }

      if (curText.length > 0) {
        if (/([a-záéíóúâêôãõç])-\s*$/i.test(curText)) {
          curText = curText.replace(/-\s*$/, '') + lineText;
        } else {
          curText += ' ' + lineText;
        }
      } else {
        curText = lineText;
      }

      curBoxes.push(...entry.line.boxes);
      lastY = entry.line.pdfY;
      lastH = entry.line.lineHeight || 12;
    }

    if (curText.trim()) {
      flushParagraph(curPage, curType, curText, curBoxes);
    }
  }

  return blocks;
}

/**
 * Instant local heuristic fallback that produces `AiExtractedStudyBlock[]` for a batch of pages
 * if Gemini is rate-limited (429) or offline, so PDF loading NEVER hangs or fails.
 */
export function heuristicBlocksForPages(
  rawPages: ExtractedRawPage[],
  repetitiveFingerprints?: Set<string>
): AiExtractedStudyBlock[] {
  const fingerprints =
    repetitiveFingerprints ||
    detectRepetitiveHeaderFooterFingerprints(
      rawPages.map((p) => p.lines),
      true
    );

  const blocks: AiExtractedStudyBlock[] = [];

  for (const rawPage of rawPages) {
    let lastY: number | null = null;
    let lastHeight = 12;
    let currentParaText = '';
    let currentParaBoxes: NormalizedBBox[] = [];

    const flush = () => {
      const cleaned = currentParaText.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 3) {
        blocks.push({
          pageNumber: rawPage.pageNumber,
          blockType: classifySentenceBlockType(cleaned),
          text: cleaned,
          bboxes: currentParaBoxes.slice(0, 32),
        });
      }
      currentParaText = '';
      currentParaBoxes = [];
    };

    for (const line of rawPage.lines) {
      const cleanedLineText = stripInlineWatermarks(line.text, true);
      if (
        isHeaderOrFooterArtifact(
          cleanedLineText,
          line.normY,
          true,
          fingerprints
        )
      ) {
        continue;
      }

      if (lastY !== null) {
        const dy = Math.abs(lastY - line.pdfY);
        const isNewSpecial =
          HEADING_TOPIC_REGEX.test(cleanedLineText) ||
          ALERT_BOX_REGEX.test(cleanedLineText) ||
          QUESTION_LIST_REGEX.test(cleanedLineText);
        if (dy > lastHeight * 1.85 || isNewSpecial) {
          flush();
        } else if (/([a-záéíóúâêôãõç])-\s*$/i.test(currentParaText)) {
          currentParaText = currentParaText.replace(/-\s*$/, '');
        } else if (currentParaText && !currentParaText.endsWith(' ')) {
          currentParaText += ' ';
        }
      }

      currentParaText += cleanedLineText;
      currentParaBoxes.push(...line.boxes);
      lastY = line.pdfY;
      lastHeight = line.lineHeight || 12;
    }

    flush();
  }

  return blocks;
}

function convertPageBlocksToSentences(params: {
  pageNum: number;
  pageBlocks: AiExtractedStudyBlock[];
  pageLines: ReconstructedPdfLine[];
  startingGlobalIndex: number;
}): {
  pageContent: PDFPageContent;
  sentences: PDFSentence[];
} {
  const { pageNum, pageBlocks, pageLines, startingGlobalIndex } = params;
  const paragraphs: string[] = [];
  const sentenceIds: string[] = [];
  const sentences: PDFSentence[] = [];
  let currentGlobal = startingGlobalIndex;

  pageBlocks.forEach((block, pIdx) => {
    paragraphs.push(block.text);
    const paraSentences =
      block.blockType === 'heading'
        ? [block.text]
        : splitParagraphIntoSentences(block.text);

    const totalCharsInPara = Math.max(
      1,
      paraSentences.reduce((acc, s) => acc + s.length, 0)
    );
    let charCursor = 0;

    paraSentences.forEach((sentText, sIdx) => {
      const id = `p${pageNum}-par${pIdx}-s${sIdx}`;
      const effectiveType =
        block.blockType !== 'normal'
          ? block.blockType
          : classifySentenceBlockType(sentText);

      const startRatio = charCursor / totalCharsInPara;
      const endRatio = (charCursor + sentText.length) / totalCharsInPara;
      charCursor += sentText.length;

      let bboxes: NormalizedBBox[];
      if (block.bboxes && block.bboxes.length > 0) {
        const startBoxIdx = Math.floor(startRatio * block.bboxes.length);
        const endBoxIdx = Math.max(
          startBoxIdx + 1,
          Math.ceil(endRatio * block.bboxes.length)
        );
        bboxes = block.bboxes.slice(startBoxIdx, endBoxIdx);
      } else {
        const approxY = 0.12 + (pIdx / Math.max(1, pageBlocks.length)) * 0.75;
        bboxes = matchSentenceToLineBoxes(sentText, pageLines, approxY);
      }

      sentences.push({
        id,
        globalIndex: currentGlobal++,
        pageNumber: pageNum,
        paragraphIndex: pIdx,
        sentenceInParagraph: sIdx,
        text: sentText,
        blockType: effectiveType,
        topicId: 'topic-1',
        topicTitle: block.topicTitle || 'Tópico de Estudo',
        bboxes,
      });
      sentenceIds.push(id);
    });
  });

  return {
    pageContent: {
      pageNumber: pageNum,
      rawText: paragraphs.join('\n\n'),
      paragraphs,
      sentenceIds,
      ignoredHeaderFooterCount: 0,
    },
    sentences,
  };
}

/**
 * Builds a clean, Demo-style PDFDocumentData directly from the study blocks extracted by Gemini IA!
 * Logos, headers, footers, cover pages, TOCs, ads, and non-study noise are 100% absent.
 */
export function buildCleanStudyDocumentFromAiBlocks(params: {
  blocks: AiExtractedStudyBlock[];
  rawPages: ExtractedRawPage[];
  fileName: string;
  fileSize: number;
  originalTotalPages: number;
  startPage: number;
  endPage: number;
  pdfBytes?: ArrayBuffer;
  pdfFingerprint?: string;
  pendingPages?: number[];
}): PDFDocumentData {
  const {
    blocks,
    rawPages,
    fileName,
    fileSize,
    originalTotalPages,
    startPage,
    endPage,
    pdfBytes,
    pdfFingerprint,
    pendingPages,
  } = params;

  const pagesMap = new Map<number, AiExtractedStudyBlock[]>();
  for (const b of blocks) {
    const text = b.text?.trim();
    if (!text) continue;
    const list = pagesMap.get(b.pageNumber) || [];
    list.push({ ...b, text });
    pagesMap.set(b.pageNumber, list);
  }

  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];

  const sortedPageNumbers = Array.from(pagesMap.keys()).sort((a, b) => a - b);

  for (const pageNum of sortedPageNumbers) {
    const pageBlocks = pagesMap.get(pageNum) || [];
    if (pageBlocks.length === 0) continue;

    const rawPageObj = rawPages.find((rp) => rp.pageNumber === pageNum);
    const pageLines = rawPageObj?.lines || [];

    const { pageContent, sentences } = convertPageBlocksToSentences({
      pageNum,
      pageBlocks,
      pageLines,
      startingGlobalIndex: allSentences.length,
    });

    if (sentences.length > 0) {
      pages.push(pageContent);
      allSentences.push(...sentences);
    }
  }

  const topics = finalizeTopicsAndSentences(allSentences);

  return {
    id: `doc-${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${fileSize}-p${startPage}-${endPage}`,
    fileName,
    fileSize,
    totalPages: originalTotalPages,
    originalTotalPages,
    selectedStartPage: startPage,
    selectedEndPage: endPage,
    cleaningMode: 'ai',
    pdfFingerprint,
    pendingPages: pendingPages && pendingPages.length > 0 ? pendingPages : undefined,
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    topics,
    currentSentenceIndex: 0,
    aiCleaned: true,
    pdfBytes,
  };
}

/**
 * Appends newly cleaned study pages to the end of an existing `PDFDocumentData` during progressive loading.
 * Preserves all existing `globalIndex` and `id` values so active voice playback never jumps or resets!
 */
export function appendCleanStudyBlocksToDocument(params: {
  doc: PDFDocumentData;
  newBlocks: AiExtractedStudyBlock[];
  rawPages: ExtractedRawPage[];
  completedPages: number[];
}): PDFDocumentData {
  const { doc, newBlocks, rawPages, completedPages } = params;

  const existingPageSet = new Set(doc.pages.map((p) => p.pageNumber));
  const pagesMap = new Map<number, AiExtractedStudyBlock[]>();

  for (const b of newBlocks) {
    if (existingPageSet.has(b.pageNumber)) continue;
    const text = b.text?.trim();
    if (!text) continue;
    const list = pagesMap.get(b.pageNumber) || [];
    list.push({ ...b, text });
    pagesMap.set(b.pageNumber, list);
  }

  const nextPages = [...doc.pages];
  const nextSentences = doc.sentences.map((s) => ({ ...s }));

  const sortedNewPageNumbers = Array.from(pagesMap.keys()).sort((a, b) => a - b);

  for (const pageNum of sortedNewPageNumbers) {
    const pageBlocks = pagesMap.get(pageNum) || [];
    if (pageBlocks.length === 0) continue;

    const rawPageObj = rawPages.find((rp) => rp.pageNumber === pageNum);
    const pageLines = rawPageObj?.lines || [];

    const { pageContent, sentences } = convertPageBlocksToSentences({
      pageNum,
      pageBlocks,
      pageLines,
      startingGlobalIndex: nextSentences.length,
    });

    if (sentences.length > 0) {
      nextPages.push(pageContent);
      nextSentences.push(...sentences);
    }
  }

  const completedSet = new Set(completedPages);
  const remainingPending = (doc.pendingPages || []).filter(
    (p) => !completedSet.has(p)
  );

  const topics = finalizeTopicsAndSentences(nextSentences);

  return {
    ...doc,
    pages: nextPages,
    sentences: nextSentences,
    topics,
    pendingPages: remainingPending.length > 0 ? remainingPending : undefined,
  };
}

export function segmentPageText(
  rawPageText: string,
  pageNumber: number,
  startingGlobalIndex: number,
  paragraphBBoxes?: NormalizedBBox[][],
  sanitizeEnabled = true,
  repetitiveFingerprints?: Set<string>
): {
  pageContent: PDFPageContent;
  sentences: PDFSentence[];
} {
  const normalized = rawPageText
    .replace(/\r\n/g, '\n')
    .replace(/([a-záéíóúâêôãõç])-\n([a-záéíóúâêôãõç])/gi, '$1$2');

  const rawLines = normalized.split('\n');
  let ignoredHeaderFooterCount = 0;
  const cleanedLines: string[] = [];

  rawLines.forEach((line, idx) => {
    const approxY = rawLines.length > 1 ? idx / (rawLines.length - 1) : 0.5;
    const strippedLine = stripInlineWatermarks(line, sanitizeEnabled);
    if (
      isHeaderOrFooterArtifact(
        strippedLine,
        approxY,
        sanitizeEnabled,
        repetitiveFingerprints
      )
    ) {
      if (line.trim()) ignoredHeaderFooterCount++;
      return;
    }
    cleanedLines.push(strippedLine);
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
 * Extracts reconstructed horizontal lines + coordinates ONLY for the selected page range `[startPage, endPage]`.
 */
export async function extractRawPagesForRange(
  fileBuffer: ArrayBuffer,
  startPageInput?: number,
  endPageInput?: number
): Promise<{
  rawPages: ExtractedRawPage[];
  originalTotalPages: number;
  startPage: number;
  endPage: number;
}> {
  const bufferCopy = fileBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;

  const originalTotalPages = pdfDoc.numPages || 1;
  const { startPage, endPage } = normalizePageRange(
    startPageInput ?? 1,
    endPageInput ?? originalTotalPages,
    originalTotalPages
  );

  const rawPages: ExtractedRawPage[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width || 600;
    const pageHeight = viewport.height || 840;

    const textContent = await page.getTextContent();
    const pageLines: ReconstructedPdfLine[] = [];

    for (const item of textContent.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const text = item.str;
      if (!text.trim()) continue;

      const transform = item.transform;
      const pdfX = Array.isArray(transform) ? transform[4] : 50;
      const pdfY = Array.isArray(transform) ? transform[5] : 400;
      const itemH = item.height || Math.abs(transform?.[3] || 12) || 12;
      const itemW = item.width || text.length * (itemH * 0.5);

      const normX = Math.max(0, Math.min(0.95, pdfX / pageWidth));
      const normY = Math.max(
        0,
        Math.min(0.98, (pageHeight - pdfY - itemH) / pageHeight)
      );
      const normW = Math.max(0.02, Math.min(1 - normX, itemW / pageWidth));
      const normH = Math.max(0.014, Math.min(0.1, (itemH * 1.35) / pageHeight));
      const box: NormalizedBBox = {
        x: normX,
        y: normY,
        width: normW,
        height: normH,
      };

      const lastLine = pageLines[pageLines.length - 1];
      if (
        lastLine &&
        Math.abs(lastLine.pdfY - pdfY) <=
          Math.max(lastLine.lineHeight, itemH) * 0.45
      ) {
        const needsSpace =
          !lastLine.text.endsWith(' ') && !text.startsWith(' ');
        lastLine.text += `${needsSpace ? ' ' : ''}${text}`;
        lastLine.boxes.push(box);
      } else {
        pageLines.push({
          text: text.trim(),
          pdfY,
          normY,
          lineHeight: itemH,
          boxes: [box],
        });
      }
    }

    rawPages.push({
      pageNumber: pageNum,
      lines: pageLines,
    });

    // Yield to browser event loop every 4 pages to keep UI 100% responsive
    if ((pageNum - startPage + 1) % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return {
    rawPages,
    originalTotalPages,
    startPage,
    endPage,
  };
}

/**
 * Extracts structured text, sentences, topics, and exact normalized bounding boxes from a PDF ArrayBuffer
 * for a given page range `[startPage, endPage]`.
 */
export async function parsePdfArrayBuffer(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number,
  sanitizeHeadersFooters = true,
  startPageInput?: number,
  endPageInput?: number
): Promise<PDFDocumentData> {
  const { rawPages, originalTotalPages, startPage, endPage } =
    await extractRawPagesForRange(fileBuffer, startPageInput, endPageInput);

  const repetitiveFingerprints = detectRepetitiveHeaderFooterFingerprints(
    rawPages.map((p) => p.lines),
    sanitizeHeadersFooters
  );

  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];
  let totalRemovedNoiseCount = 0;

  for (const rawPage of rawPages) {
    const pageNum = rawPage.pageNumber;
    const pageLines = rawPage.lines;

    let lastY: number | null = null;
    let lastHeight = 12;
    let currentParaText = '';
    let currentParaBoxes: NormalizedBBox[] = [];
    const paragraphsText: string[] = [];
    const paragraphsBoxes: NormalizedBBox[][] = [];
    let ignoredCount = 0;

    for (const line of pageLines) {
      const cleanedLineText = stripInlineWatermarks(
        line.text,
        sanitizeHeadersFooters
      );

      if (
        isHeaderOrFooterArtifact(
          cleanedLineText,
          line.normY,
          sanitizeHeadersFooters,
          repetitiveFingerprints
        )
      ) {
        ignoredCount++;
        totalRemovedNoiseCount++;
        continue;
      }

      if (lastY !== null) {
        const dy = Math.abs(lastY - line.pdfY);
        if (dy > lastHeight * 1.85) {
          if (currentParaText.trim()) {
            paragraphsText.push(currentParaText.trim());
            paragraphsBoxes.push(currentParaBoxes);
          }
          currentParaText = '';
          currentParaBoxes = [];
        } else {
          if (currentParaText.endsWith('-')) {
            currentParaText = currentParaText.slice(0, -1);
          } else if (!currentParaText.endsWith(' ')) {
            currentParaText += ' ';
          }
        }
      }

      currentParaText += cleanedLineText;
      currentParaBoxes.push(...line.boxes);

      lastY = line.pdfY;
      lastHeight = line.lineHeight;
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
      paragraphsBoxes,
      sanitizeHeadersFooters,
      repetitiveFingerprints
    );
    pageContent.ignoredHeaderFooterCount += ignoredCount;

    if (sentences.length > 0) {
      pages.push(pageContent);
      allSentences.push(...sentences);
    }
  }

  if (allSentences.length === 0) {
    const fallbackSentence: PDFSentence = {
      id: `p${startPage}-par0-s0`,
      globalIndex: 0,
      pageNumber: startPage,
      paragraphIndex: 0,
      sentenceInParagraph: 0,
      text: 'Não foi possível extrair texto selecionável deste intervalo de páginas. Verifique se o PDF possui camada de texto digital.',
      blockType: 'normal',
      topicId: 'topic-1',
      topicTitle: 'Aviso de Leitura',
      isTopicEnd: true,
      bboxes: [{ x: 0.08, y: 0.2, width: 0.84, height: 0.08 }],
    };
    allSentences.push(fallbackSentence);
    pages.push({
      pageNumber: startPage,
      rawText: fallbackSentence.text,
      paragraphs: [fallbackSentence.text],
      sentenceIds: [fallbackSentence.id],
      ignoredHeaderFooterCount: 0,
    });
  }

  const topics = finalizeTopicsAndSentences(allSentences);

  return {
    id: `doc-${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${fileSize}-p${startPage}-${endPage}`,
    fileName,
    fileSize,
    totalPages: originalTotalPages,
    originalTotalPages,
    selectedStartPage: startPage,
    selectedEndPage: endPage,
    cleaningMode: 'basic',
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    topics,
    currentSentenceIndex: 0,
    removedNoiseCount: totalRemovedNoiseCount,
    aiCleaned: false,
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
    originalTotalPages: demoPagesRaw.length,
    selectedStartPage: 1,
    selectedEndPage: demoPagesRaw.length,
    cleaningMode: 'ai',
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    topics,
    currentSentenceIndex: 0,
    removedNoiseCount: 0,
    aiCleaned: true,
  };
}
