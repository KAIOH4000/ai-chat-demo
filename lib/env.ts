/**
 * 环境变量统一管理
 * 集中校验 + 类型导出，避免 process.env 散落各处
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  // AI Provider
  AI_BASE_URL: optional('AI_BASE_URL', 'https://api.gemai.cc').replace(/\/+$/, ''),
  AI_API_KEY: required('AI_API_KEY'),
  AI_MODEL: optional('AI_MODEL', 'gpt-4o-mini'),
  AI_SYSTEM_PROMPT: optional('AI_SYSTEM_PROMPT', 'You are a helpful assistant.'),

  // Embedding
  AI_EMBEDDING_MODEL: optional('AI_EMBEDDING_MODEL', 'qwen3-embedding-8b'),

  // Chroma
  CHROMA_URL: optional('CHROMA_URL', 'http://localhost:8000'),
  CHROMA_COLLECTION: optional('CHROMA_COLLECTION', 'knowledge-base'),

  // RAG
  RAG_TOP_K: parseInt(optional('RAG_TOP_K', '5'), 10),
  RAG_SYSTEM_PROMPT: optional(
    'RAG_SYSTEM_PROMPT',
    '你是一个基于知识库的问答助手。请根据提供的文档内容回答问题。如果文档中没有相关信息，请如实告知用户，不要编造答案。',
  ),
} as const;
