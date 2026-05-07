/**
 * RAG 模块核心类型定义
 */

/** 文档解析结果 */
export interface ParsedDocument {
  /** 原始文件名 */
  fileName: string;
  /** 文件类型 */
  fileType: 'pdf' | 'markdown' | 'txt';
  /** 提取的完整文本内容 */
  content: string;
  /** 总页数（PDF 有值，其他为 1） */
  pageCount: number;
}

/** 文本切分后的一个 Chunk */
export interface TextChunk {
  /** Chunk 唯一标识 */
  id: string;
  /** Chunk 文本内容 */
  content: string;
  /** Chunk 在文档中的序号（从 0 开始） */
  chunkIndex: number;
  /** 来源元数据 */
  metadata: {
    fileName: string;
    fileType: string;
    /** 所在页码（PDF 场景，从 1 开始） */
    pageNumber?: number;
    /** 文档总 chunk 数 */
    totalChunks: number;
  };
}

/** 向量检索返回的 Chunk（含相似度） */
export interface RetrievedChunk extends TextChunk {
  /** 相似度得分（0-1，越高越相似） */
  score: number;
}

/** 上传 API 响应 */
export interface UploadResponse {
  success: boolean;
  fileName: string;
  chunkCount: number;
  error?: string;
}

/** RAG Chat 请求体 */
export interface RAGChatRequest {
  message: string;
  messages?: { role: string; content: string }[];
  model?: string;
}

/** 引用来源 */
export interface SourceCitation {
  fileName: string;
  chunkContent: string;
  pageNumber?: number;
  score: number;
}

/** RAG Chat SSE 事件类型 */
export type SSEEvent =
  | { type: 'content'; data: string }
  | { type: 'sources'; data: SourceCitation[] }
  | { type: 'error'; data: string }
  | { type: 'done'; data: '' };
