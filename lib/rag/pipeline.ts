/**
 * RAG Pipeline — 检索增强生成核心管线
 *
 * 职责：
 * 1. 将用户问题向量化 → 在向量库中检索相似 Chunk
 * 2. 将检索结果拼接为结构化上下文 Prompt
 * 3. 返回 Context（注入 LLM）+ Sources（返回前端展示）
 *
 * 企业项目价值：
 * - 检索与生成解耦，方便独立优化召回策略
 * - 上下文格式化集中管理，prompt engineering 只改这一处
 * - 来源与上下文分开，前端可独立渲染引用卡片
 */

import { searchSimilar, toSourceCitations } from './vectorstore';
import { env } from '@/lib/env';
import type { SourceCitation } from './types';

interface RAGContext {
  /** 注入 LLM 的上下文字符串 */
  context: string;
  /** 返回前端的引用来源列表 */
  sources: SourceCitation[];
}

/**
 * 构建注入 LLM 的 system prompt 中的上下文部分
 * 格式设计原则：
 * - 用 [来源 N: 文件名 (页码)] 标记，便于 LLM 引用
 * - Chunk 之间用分隔线区分，避免 LLM 混淆不同来源
 * - Chunk 内容截断到 800 字符，避免单个 chunk 过长撑爆上下文窗口
 */
function buildContextText(sources: SourceCitation[]): string {
  if (sources.length === 0) return '';

  const chunks = sources.map((s, i) => {
    const pageInfo = s.pageNumber ? `第${s.pageNumber}页` : '';
    const header = `[来源 ${i + 1}: ${s.fileName} ${pageInfo}]`.trim();
    const body = s.chunkContent.length > 800 ? s.chunkContent.slice(0, 800) + '...' : s.chunkContent;
    return `${header}\n${body}`;
  });

  return `\n\n--- 以下是与问题相关的知识库文档 ---\n\n${chunks.join('\n\n---\n\n')}\n\n--- 文档内容结束 ---`;
}

/**
 * 执行 RAG 检索：用户问题 → 向量检索 → 构建上下文
 */
export async function retrieveContext(question: string): Promise<RAGContext> {
  const results = await searchSimilar(question);
  const sources = toSourceCitations(results);
  const context = buildContextText(sources);

  console.log(`[Pipeline] Retrieved ${results.length} chunk(s) for query`);

  return { context, sources };
}

/**
 * 构建完整的 RAG 增强 system prompt
 * 在现有多轮对话的基础上，注入检索到的知识库内容
 */
export function buildRAGSystemPrompt(baseSystemPrompt: string, context: string): string {
  if (!context) {
    return baseSystemPrompt;
  }

  return `${baseSystemPrompt}\n${context}\n\n请基于以上文档内容回答用户的问题。引用文档内容时请注明 [来源 N] 编号。如果文档中没有相关信息，请如实告知用户，不要编造答案。`;
}

/**
 * 判断用户消息是否触发了 RAG 检索
 * 返回最后一条用户消息的内容作为检索查询
 */
export function extractQuery(messages: { role: string; content: string }[]): string | null {
  // 取最后一条用户消息作为检索查询
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) return null;
  return userMessages[userMessages.length - 1].content;
}
