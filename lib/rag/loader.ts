/**
 * 文档加载器 — 统一入口，根据文件类型选择解析策略
 *
 * 设计思路：
 * - PDF: 使用 LangChain PDFLoader（底层 pdf-parse），支持按页提取
 * - Markdown / TXT: 使用 TextLoader，源码即文本，无需额外解析
 * - 统一返回 ParsedDocument，上层调用方无需关心文件类型差异
 */

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import type { ParsedDocument } from './types';

/** 从文件名推断文件类型 */
function detectFileType(fileName: string): ParsedDocument['fileType'] {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'txt';
}

/**
 * 从 Buffer 加载 PDF 文档
 * PDFLoader 支持传入 Blob/Buffer，按页返回 Document[]
 */
async function loadPDF(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
  const loader = new PDFLoader(blob, { splitPages: true });
  const docs = await loader.load();

  // 按页编号，拼接完整内容
  const pages = docs.map((doc, index) => {
    const pageNum = (doc.metadata?.pageNumber as number) ?? (doc.metadata?.loc as number) ?? index + 1;
    return { page: pageNum, content: doc.pageContent };
  });

  // 每页用换行分隔，保留页码信息
  const content = pages.map((p) => `[Page ${p.page}]\n${p.content}`).join('\n\n');

  return {
    fileName,
    fileType: 'pdf',
    content,
    pageCount: pages.length,
  };
}

/**
 * 从文本加载 MD/TXT 文档
 * 纯文本无需 LangChain TextLoader，直接用 TextDecoder 解码
 * 避免 TextLoader 对 Blob 参数的兼容性问题
 */
async function loadText(buffer: Buffer, fileName: string, fileType: 'markdown' | 'txt'): Promise<ParsedDocument> {
  const content = new TextDecoder('utf-8').decode(buffer);

  return {
    fileName,
    fileType,
    content,
    pageCount: 1,
  };
}

/**
 * 统一文档加载入口
 * @param buffer 文件二进制内容
 * @param fileName 原始文件名（用于判断类型）
 */
export async function loadDocument(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const fileType = detectFileType(fileName);

  switch (fileType) {
    case 'pdf':
      return loadPDF(buffer, fileName);
    case 'markdown':
    case 'txt':
      return loadText(buffer, fileName, fileType);
    default:
      throw new Error(`Unsupported file type: ${fileName}`);
  }
}
