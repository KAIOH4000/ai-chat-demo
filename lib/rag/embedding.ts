/**
 * Embedding 服务 — 使用 OpenAI Compatible API 生成文本向量
 *
 * 设计思路：
 * - 直接用 fetch 调用 /v1/embeddings，与现有 chat route 保持一致
 * - 不依赖 @langchain/openai，避免 OpenAI SDK 版本兼容问题
 * - 适配 MemoryVectorStore：实现 embedQuery / embedDocuments 接口
 */

import { env } from '@/lib/env';

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

async function callEmbeddingAPI(input: string | string[]): Promise<number[][]> {
  const res = await fetch(`${env.AI_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_EMBEDDING_MODEL,
      input,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(`Embedding API error (${res.status}): ${JSON.stringify(errBody)}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.data.map((item) => item.embedding);
}

/**
 * LangChain-compatible embeddings interface
 * MemoryVectorStore 需要 embedQuery / embedDocuments 两个方法
 */
class CustomEmbeddings {
  async embedQuery(text: string): Promise<number[]> {
    const results = await callEmbeddingAPI(text);
    return results[0];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return callEmbeddingAPI(texts);
  }
}

let instance: CustomEmbeddings | null = null;

export function getEmbeddings(): CustomEmbeddings {
  if (!instance) {
    console.log(`[Embedding] Initialized with model: ${env.AI_EMBEDDING_MODEL}, baseURL: ${env.AI_BASE_URL}`);
    instance = new CustomEmbeddings();
  }
  return instance;
}

export async function embedQuery(text: string): Promise<number[]> {
  return getEmbeddings().embedQuery(text);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return getEmbeddings().embedDocuments(texts);
}
