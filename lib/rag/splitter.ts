/**
 * 文本切分器 — 使用 RecursiveCharacterTextSplitter
 *
 * 设计思路：
 * - RecursiveCharacterTextSplitter 按优先级依次尝试分隔符：
 *   段落(\\n\\n) → 换行(\\n) → 句号(。) → 空格 → 字符
 *   这样能尽量在语义边界处切分，而非生硬截断
 * - Chunk size: 1000 字符 — 兼顾上下文完整性与检索精度
 * - Overlap: 200 字符 — 20% 重叠，避免关键信息在边界处断裂
 * - 每个 Chunk 带元数据（来源文件、页码、序号），用于后续引用
 */

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import type { ParsedDocument, TextChunk } from './types';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ['\n\n', '\n', '。', '.', '？', '?', '！', '!', '；', ';', ' ', ''],
});

/**
 * 从完整文本中解析每页的起始位置
 * 依赖 loader 在 PDF 文本前插入的 [Page N] 标记
 */
function parsePageRanges(content: string): { page: number; start: number; end: number }[] {
  const pagePattern = /\[Page (\d+)\]/g;
  const pages: { page: number; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = pagePattern.exec(content)) !== null) {
    if (pages.length > 0) {
      pages[pages.length - 1].end = match.index;
    }
    pages.push({ page: parseInt(match[1], 10), start: match.index, end: content.length });
  }

  // 如果没有 Page 标记（非 PDF），整篇视为 page 1
  if (pages.length === 0) {
    pages.push({ page: 1, start: 0, end: content.length });
  }

  return pages;
}

/** 根据字符位置判断所属页码 */
function findPageNumber(position: number, pageRanges: { page: number; start: number; end: number }[]): number {
  for (const range of pageRanges) {
    if (position >= range.start && position < range.end) {
      return range.page;
    }
  }
  return pageRanges[pageRanges.length - 1]?.page ?? 1;
}

/**
 * 将文档切割为 Chunk 数组
 * @param doc 已解析的文档
 * @returns 带元数据的 TextChunk 数组
 */
export async function splitDocument(doc: ParsedDocument): Promise<TextChunk[]> {
  const pageRanges = parsePageRanges(doc.content);
  const langChainDocs = await splitter.createDocuments([doc.content]);

  const chunks: TextChunk[] = langChainDocs.map((d, i) => {
    // 找到 chunk 内容在原文档中的位置，推断所属页码
    const position = doc.content.indexOf(d.pageContent);
    const pageNumber = findPageNumber(position >= 0 ? position : 0, pageRanges);

    return {
      id: `${doc.fileName}-chunk-${i}`,
      content: d.pageContent.trim(),
      chunkIndex: i,
      metadata: {
        fileName: doc.fileName,
        fileType: doc.fileType,
        pageNumber,
        totalChunks: langChainDocs.length,
      },
    };
  });

  // 过滤空 chunk
  return chunks.filter((c) => c.content.length > 0);
}
