import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentData, PDFPageContent, PDFSentence } from '../types';

// Configure worker for Vite bundler
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Fallback CDN worker if bundler URL resolution is unavailable
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

const ABBREVIATION_REGEX = /\b(Sr|Sra|Dr|Dra|Prof|Profa|Cap|Art|Inc|Ltd|etc|ex|fig|pág|págs|vol|nº|no|vs|pe)\.\s*$/i;

/**
 * Splits paragraph text into natural sentences suitable for voice synthesis (TTS).
 */
export function splitParagraphIntoSentences(paragraph: string): string[] {
  const cleaned = paragraph.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  let rawSegments: string[] = [];

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' });
    rawSegments = Array.from(segmenter.segment(cleaned), (s) => s.segment.trim()).filter(Boolean);
  } else {
    rawSegments = cleaned
      .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ú0-9"“«(])/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Merge very short fragments or abbreviations with the following sentence
  const merged: string[] = [];
  let buffer = '';

  for (const seg of rawSegments) {
    if (buffer) {
      buffer = `${buffer} ${seg}`;
    } else {
      buffer = seg;
    }

    const isAbbreviation = ABBREVIATION_REGEX.test(buffer);
    const isTooShortNumbering = /^(\d+|[a-zA-Z])[.)]$/.test(buffer);

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
 * Segments raw page text into paragraphs and indexed sentences.
 */
export function segmentPageText(
  rawPageText: string,
  pageNumber: number,
  startingGlobalIndex: number
): { pageContent: PDFPageContent; sentences: PDFSentence[] } {
  const normalized = rawPageText
    .replace(/\r\n/g, '\n')
    // Join hyphenated words broken across lines
    .replace(/([a-záéíóúâêôãõç])-\n([a-záéíóúâêôãõç])/gi, '$1$2');

  const rawParagraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : [normalized.replace(/\s+/g, ' ').trim()].filter(Boolean);

  const sentences: PDFSentence[] = [];
  const sentenceIds: string[] = [];
  let currentGlobal = startingGlobalIndex;

  paragraphs.forEach((paraText, pIdx) => {
    const paraSentences = splitParagraphIntoSentences(paraText);
    paraSentences.forEach((sentText, sIdx) => {
      const id = `p${pageNumber}-par${pIdx}-s${sIdx}`;
      sentences.push({
        id,
        globalIndex: currentGlobal++,
        pageNumber,
        paragraphIndex: pIdx,
        sentenceInParagraph: sIdx,
        text: sentText,
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
    },
    sentences,
  };
}

/**
 * Extracts structured text and sentences from a PDF ArrayBuffer using pdfjs-dist.
 */
export async function parsePdfArrayBuffer(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): Promise<PDFDocumentData> {
  // Always clone buffer because pdf.js worker transfers/detaches the buffer passed to it
  const bufferCopy = fileBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let lastHeight = 12;
    let pageTextBuilder = '';

    for (const item of textContent.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const text = item.str;
      const transform = item.transform;
      const currentY = Array.isArray(transform) ? transform[5] : null;
      const currentHeight = item.height || lastHeight || 12;

      if (lastY !== null && currentY !== null) {
        const dy = Math.abs(lastY - currentY);
        if (dy > currentHeight * 1.8) {
          pageTextBuilder += '\n\n';
        } else if (dy > currentHeight * 0.4) {
          pageTextBuilder += '\n';
        } else if (!pageTextBuilder.endsWith(' ') && !text.startsWith(' ')) {
          pageTextBuilder += ' ';
        }
      }

      pageTextBuilder += text;
      if (item.hasEOL) {
        pageTextBuilder += '\n';
      }

      if (currentY !== null) lastY = currentY;
      if (item.height) lastHeight = item.height;
    }

    const { pageContent, sentences } = segmentPageText(
      pageTextBuilder.trim(),
      pageNum,
      allSentences.length
    );

    pages.push(pageContent);
    allSentences.push(...sentences);
  }

  // If a scanned PDF or empty text was uploaded, add an informative placeholder sentence
  if (allSentences.length === 0) {
    const fallbackSentence: PDFSentence = {
      id: 'p1-par0-s0',
      globalIndex: 0,
      pageNumber: 1,
      paragraphIndex: 0,
      sentenceInParagraph: 0,
      text: 'Não foi possível extrair texto selecionável deste PDF. Verifique se o documento possui camada de texto digital.',
    };
    allSentences.push(fallbackSentence);
    pages.push({
      pageNumber: 1,
      rawText: fallbackSentence.text,
      paragraphs: [fallbackSentence.text],
      sentenceIds: [fallbackSentence.id],
    });
  }

  return {
    id: `doc-${Date.now()}`,
    fileName,
    fileSize,
    totalPages,
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
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
 * Creates a built-in interactive demo document so the user can test voice reading & AI immediately.
 */
export function createDemoDocument(): PDFDocumentData {
  const demoPagesRaw = [
    `A Revolução da Leitura Assistida por Inteligência Artificial\n\nA leitura sempre foi uma das ferramentas mais poderosas para expandir o conhecimento humano. No entanto, por séculos, o ato de ler um livro ou artigo científico foi uma experiência solitária e unidirecional, onde o leitor apenas absorve o que está impresso na página.\n\nCom o avanço dos Grandes Modelos de Linguagem, surge um novo paradigma: a leitura dialógica e interativa. Agora, enquanto você ouve um documento complexo em voz alta, uma inteligência artificial acompanha cada parágrafo ao seu lado, pronta para responder dúvidas, explicar termos técnicos ou debater ideias no exato momento em que surgem.`,
    `Como Interagir por Voz ou Texto Durante a Leitura\n\nNeste aplicativo, cada frase do seu PDF é indexada e sincronizada com o sintetizador de voz. Você pode clicar em qualquer frase na tela para pular diretamente para aquele ponto ou usar os controles inferiores de reprodução.\n\nSempre que desejar fazer um comentário ou pergunta, basta clicar no botão "Interromper e Falar" ou pressionar a tecla de atalho no painel lateral. A leitura em voz alta pausa instantaneamente, a inteligência artificial analisa o contexto da página atual e responde em voz alta antes de retomar a leitura exatamente de onde parou.`,
    `Conectividade Multi-Provedor e Liberdade de Escolha\n\nCada modelo de inteligência artificial possui pontos fortes únicos de raciocínio, velocidade e síntese. Por isso, o VoxRead AI permite conectar facilmente chaves de API do Google Gemini, OpenAI ChatGPT, Anthropic Claude, DeepSeek, Kimi e GLM.\n\nSuas chaves ficam salvas exclusivamente no seu navegador local, garantindo total privacidade enquanto você estuda contratos, artigos acadêmicos, livros técnicos ou relatórios extensos com seu tutor particular de voz.`,
  ];

  const pages: PDFPageContent[] = [];
  const allSentences: PDFSentence[] = [];

  demoPagesRaw.forEach((rawText, idx) => {
    const pageNum = idx + 1;
    const { pageContent, sentences } = segmentPageText(rawText, pageNum, allSentences.length);
    pages.push(pageContent);
    allSentences.push(...sentences);
  });

  return {
    id: 'demo-voxread-guide',
    fileName: 'Guia_Interativo_Leitura_Assistida_IA.pdf',
    fileSize: 148200,
    totalPages: demoPagesRaw.length,
    uploadedAt: Date.now(),
    pages,
    sentences: allSentences,
    currentSentenceIndex: 0,
  };
}
