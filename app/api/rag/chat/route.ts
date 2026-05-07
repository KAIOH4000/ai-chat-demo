/**
 * POST /api/rag/chat — RAG 增强问答（流式 SSE + 引用来源）
 *
 * 核心流程：
 *   用户消息 → retrieveContext() → 构建增强 Prompt → LLM 流式生成
 *   返回 SSE named events: content / sources / error / done
 *
 * 与 /api/chat 的关系：
 *   /api/chat  = 普通对话（不做检索）
 *   /api/rag/chat = RAG 问答（先检索再生成）
 *   两个端点职责分明，互不干扰
 *
 * SSE 事件格式：
 *   event: content
 *   data: <text chunk>
 *
 *   event: sources
 *   data: <JSON array of SourceCitation>
 *
 *   event: error
 *   data: <error message>
 *
 *   event: done
 *   data:
 */

import { retrieveContext, buildRAGSystemPrompt, extractQuery } from '@/lib/rag/pipeline';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type ChatMessage = { role: string; content: string };
type RAGChatRequest = { message?: string; messages?: ChatMessage[]; model?: string };

function errorSSE(message: string): Response {
  const encoder = new TextEncoder();
  const body = encoder.encode(`event: error\ndata: ${message}\n\n`);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RAGChatRequest;
    const requestModel = typeof body.model === 'string' ? body.model.trim() : '';

    const apiKey = env.AI_API_KEY;
    const baseUrl = env.AI_BASE_URL;
    const model = requestModel || env.AI_MODEL;
    const baseSystemPrompt = env.AI_SYSTEM_PROMPT;
    const ragSystemPrompt = env.RAG_SYSTEM_PROMPT;

    // 构建消息列表
    let messages: ChatMessage[];
    if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
    } else if (typeof body.message === 'string' && body.message.trim()) {
      messages = [{ role: 'user', content: body.message.trim() }];
    } else {
      return new Response('event: error\ndata: 请输入问题\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // ─── RAG 检索 ──────────────────────────────────────────

    const query = extractQuery(messages);
    let context = '';
    let sourcesJson = '[]';

    if (query) {
      try {
        const result = await retrieveContext(query);
        context = result.context;
        sourcesJson = JSON.stringify(result.sources);
        console.log(`[RAG] Retrieved ${result.sources.length} source(s) for: "${query.slice(0, 50)}..."`);
      } catch (err) {
        console.warn('[RAG] Retrieval failed, falling back to normal chat:', err);
        // 检索失败时降级为普通对话，不阻断用户
      }
    }

    // ─── 构建增强 Prompt ───────────────────────────────────

    const effectiveSystemPrompt = context
      ? buildRAGSystemPrompt(ragSystemPrompt, context)
      : baseSystemPrompt;

    const conversationMessages = [
      { role: 'system', content: effectiveSystemPrompt },
      ...messages,
    ];

    // ─── 调用 LLM 流式生成 ─────────────────────────────────

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 60000);

        try {
          const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: conversationMessages,
              temperature: 0.7,
              stream: true,
            }),
            signal: abortController.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData?.error?.message || `AI provider error: HTTP ${response.status}`;
            controller.enqueue(encoder.encode(`event: error\ndata: ${errMsg}\n\n`));
            controller.close();
            return;
          }

          if (!response.body) {
            controller.enqueue(encoder.encode('event: error\ndata: AI provider returned empty response\n\n'));
            controller.close();
            return;
          }

          const reader = response.body.getReader();
          let buffer = '';
          let fullReply = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) continue;

              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;

              let chunkData: { choices?: Array<{ delta?: { content?: string } }> };
              try {
                chunkData = JSON.parse(payload);
              } catch {
                continue;
              }

              const chunk = chunkData?.choices?.[0]?.delta?.content ?? '';
              if (chunk) {
                fullReply += chunk;
                // SSE named event: content
                controller.enqueue(encoder.encode(`event: content\ndata: ${JSON.stringify(chunk)}\n\n`));
              }
            }
          }

          reader.releaseLock();

          if (!fullReply.trim()) {
            controller.enqueue(
              encoder.encode(`event: error\ndata: Model "${model}" returned an empty response\n\n`),
            );
          }

          // 发送引用来源（在所有 content 之后）
          controller.enqueue(encoder.encode(`event: sources\ndata: ${sourcesJson}\n\n`));
          controller.enqueue(encoder.encode('event: done\ndata:\n\n'));
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof DOMException && err.name === 'AbortError') {
            controller.enqueue(encoder.encode('event: error\ndata: 请求超时\n\n'));
          } else {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${err instanceof Error ? err.message : 'Stream error'}\n\n`),
            );
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    console.error('[RAG Chat] Error:', err);
    return errorSSE(err instanceof Error ? err.message : '服务器内部错误');
  }
}
