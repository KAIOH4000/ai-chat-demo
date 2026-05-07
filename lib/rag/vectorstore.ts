/**
 * 向量存储服务 — 支持双模式：Memory（开发） / Chroma（生产）
 *
 * 设计思路：
 * - 抽象为统一接口，通过 VECTOR_STORE 环境变量切换实现
 * - Memory: 基于 LangChain MemoryVectorStore，零外部依赖，适合本地开发
 * - Chroma: 连接 ChromaDB 服务器，适合生产
 * - 检索流程：先 Embedding 查询文本 → 再调用 similaritySearchVectorWithScore
 *   这样可以得到相似度分数，用于排序和引用展示
 */

import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import type { Document } from 'langchain/document';
import { getEmbeddings, embedQuery } from './embedding';
import { env } from '@/lib/env';
import type { TextChunk, RetrievedChunk, SourceCitation } from './types';

// ─── 接口定义 ────────────────────────────────────────────────

interface VectorStoreAPI {
  addDocuments(chunks: TextChunk[]): Promise<void>;
  similaritySearch(query: string, k?: number): Promise<RetrievedChunk[]>;
  deleteByFileName(fileName: string): Promise<void>;
  count(): Promise<number>;
}

// ─── 工具函数：将 Document[] 转为 RetrievedChunk[] ───────────────

function docsToRetrievedChunks(results: [Document, number][]): RetrievedChunk[] {
  return results.map(([doc, score]) => ({
    id: (doc.metadata.chunkId as string) ?? '',
    content: doc.pageContent,
    chunkIndex: (doc.metadata.chunkIndex as number) ?? 0,
    metadata: {
      fileName: (doc.metadata.fileName as string) ?? 'unknown',
      fileType: (doc.metadata.fileType as string) ?? 'unknown',
      pageNumber: (doc.metadata.pageNumber as number) ?? undefined,
      totalChunks: (doc.metadata.totalChunks as number) ?? 0,
    },
    score,
  }));
}

function chunksToDocuments(chunks: TextChunk[]): Document[] {
  return chunks.map((c) => ({
    pageContent: c.content,
    metadata: {
      chunkId: c.id,
      chunkIndex: c.chunkIndex,
      fileName: c.metadata.fileName,
      fileType: c.metadata.fileType,
      pageNumber: c.metadata.pageNumber ?? null,
      totalChunks: c.metadata.totalChunks,
    },
  }));
}

// ─── MemoryVectorStore 实现 ────────────────────────────────────

class MemoryVectorStoreImpl implements VectorStoreAPI {
  private store: MemoryVectorStore | null = null;

  private async getStore(): Promise<MemoryVectorStore> {
    if (!this.store) {
      this.store = new MemoryVectorStore(getEmbeddings());
      console.log('[VectorStore] Memory mode activated');
    }
    return this.store;
  }

  async addDocuments(chunks: TextChunk[]): Promise<void> {
    const store = await this.getStore();
    await store.addDocuments(chunksToDocuments(chunks));
    console.log(`[VectorStore:Memory] Added ${chunks.length} document(s)`);
  }

  async similaritySearch(query: string, k = env.RAG_TOP_K): Promise<RetrievedChunk[]> {
    const store = await this.getStore();
    // 先 Embedding 查询文本，再向量检索（这样能拿到分数）
    const queryVector = await embedQuery(query);
    const results = await store.similaritySearchVectorWithScore(queryVector, k);
    return docsToRetrievedChunks(results);
  }

  async deleteByFileName(fileName: string): Promise<void> {
    this.store = null;
    console.log(`[VectorStore:Memory] Reset store (requested delete: ${fileName})`);
  }

  async count(): Promise<number> {
    try {
      const store = await this.getStore();
      const mem = (store as unknown as { memoryVectors?: Array<unknown> }).memoryVectors;
      return mem?.length ?? 0;
    } catch {
      return 0;
    }
  }
}

// ─── Chroma 实现 ──────────────────────────────────────────────

class ChromaVectorStoreImpl implements VectorStoreAPI {
  private store: Chroma | null = null;
  private client: ChromaClient | null = null;

  private async getStore(): Promise<Chroma> {
    if (!this.store) {
      this.client = new ChromaClient({ path: env.CHROMA_URL });
      const embeddings = getEmbeddings();

      this.store = await Chroma.fromExistingCollection(embeddings, {
        collectionName: env.CHROMA_COLLECTION,
        url: env.CHROMA_URL,
      }).catch(async () => {
        console.log(`[VectorStore:Chroma] Creating collection: ${env.CHROMA_COLLECTION}`);
        return Chroma.fromDocuments([], embeddings, {
          collectionName: env.CHROMA_COLLECTION,
          url: env.CHROMA_URL,
        });
      });

      console.log('[VectorStore] Chroma mode activated');
    }
    return this.store;
  }

  async addDocuments(chunks: TextChunk[]): Promise<void> {
    const store = await this.getStore();
    const ids = chunks.map((c) => c.id);
    await store.addDocuments(chunksToDocuments(chunks), { ids });
    console.log(`[VectorStore:Chroma] Added ${chunks.length} document(s)`);
  }

  async similaritySearch(query: string, k = env.RAG_TOP_K): Promise<RetrievedChunk[]> {
    const store = await this.getStore();
    const queryVector = await embedQuery(query);
    const results = await store.similaritySearchVectorWithScore(queryVector, k);
    return docsToRetrievedChunks(results);
  }

  async deleteByFileName(fileName: string): Promise<void> {
    const store = await this.getStore();
    await store.delete({ filter: { fileName } });
    console.log(`[VectorStore:Chroma] Deleted documents for: ${fileName}`);
  }

  async count(): Promise<number> {
    if (!this.client) {
      await this.getStore();
    }
    try {
      const collection = await this.client!.getCollection({ name: env.CHROMA_COLLECTION });
      return (await collection.count()) ?? 0;
    } catch {
      return 0;
    }
  }
}

// ─── 工厂 ──────────────────────────────────────────────────────

let vectorStore: VectorStoreAPI | null = null;

function createVectorStore(): VectorStoreAPI {
  const mode = process.env.VECTOR_STORE?.toLowerCase();
  if (mode === 'chroma') {
    return new ChromaVectorStoreImpl();
  }
  return new MemoryVectorStoreImpl();
}

export function getVectorStore(): VectorStoreAPI {
  if (!vectorStore) {
    vectorStore = createVectorStore();
  }
  return vectorStore;
}

// ─── 便捷导出（上层调用无需关心实现）────────────────────────────

export async function addChunksToStore(chunks: TextChunk[]): Promise<void> {
  await getVectorStore().addDocuments(chunks);
}

export async function searchSimilar(query: string, k?: number): Promise<RetrievedChunk[]> {
  return getVectorStore().similaritySearch(query, k);
}

export async function deleteDocument(fileName: string): Promise<void> {
  await getVectorStore().deleteByFileName(fileName);
}

export async function getDocumentCount(): Promise<number> {
  return getVectorStore().count();
}

export function toSourceCitations(results: RetrievedChunk[]): SourceCitation[] {
  return results.map((r) => ({
    fileName: r.metadata.fileName,
    chunkContent: r.content.slice(0, 300),
    pageNumber: r.metadata.pageNumber,
    score: r.score,
  }));
}
