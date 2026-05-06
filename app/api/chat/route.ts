import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  role: string;
  content: string;
};

type ChatApiRequest = {
  message?: string;
  messages?: ChatMessage[];
  model?: string;
};

type ErrorCode =
  | 'MISSING_MESSAGE'
  | 'MISSING_API_KEY'
  | 'AUTH_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'STREAM_ERROR'
  | 'SERVER_ERROR';

function errorResponse(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
    delta?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ChatApiRequest;
    const requestModel = typeof body.model === 'string' ? body.model.trim() : '';

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return errorResponse('MISSING_API_KEY', 'Missing AI_API_KEY', 500);
    }

    const baseUrl = (process.env.AI_BASE_URL || 'https://api.gemai.cc').replace(/\/+$/, '');
    const model = requestModel || process.env.AI_MODEL || 'gpt-4o-mini';
    const systemPrompt = process.env.AI_SYSTEM_PROMPT || 'You are a helpful assistant.';

    // Build conversation messages – support both new (messages[]) and legacy (single message) formats
    let conversationMessages: { role: string; content: string }[];

    if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
      conversationMessages = [
        { role: 'system', content: systemPrompt },
        ...body.messages,
      ];
    } else {
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) {
        return errorResponse('MISSING_MESSAGE', '`message` is required', 400);
      }
      conversationMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
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
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const data = (await response.json().catch((): ChatCompletionResponse => ({}))) as ChatCompletionResponse;
      if (response.status === 401 || response.status === 403) {
        return errorResponse('AUTH_ERROR', data?.error?.message || 'Authentication failed', 502);
      }
      if (response.status === 404) {
        return errorResponse('MODEL_UNAVAILABLE', data?.error?.message || 'Model not found', 502);
      }
      return errorResponse(
        'UPSTREAM_ERROR',
        data?.error?.message || `AI provider request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    if (!response.body) {
      return errorResponse('STREAM_ERROR', 'AI provider returned no stream body.', 502);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullReply = '';

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = '';
        let hasError = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) {
                continue;
              }

              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') {
                continue;
              }

              let chunkData: ChatCompletionResponse;
              try {
                chunkData = JSON.parse(payload) as ChatCompletionResponse;
              } catch {
                continue;
              }
              const chunk = chunkData?.choices?.[0]?.delta?.content ?? chunkData?.choices?.[0]?.message?.content ?? '';

              if (chunk) {
                fullReply += chunk;
                controller.enqueue(encoder.encode(chunk));
              }
            }
          }

          if (!fullReply.trim()) {
            controller.enqueue(
              encoder.encode(`Model "${model}" returned an empty response or does not support chat output.`),
            );
          }
        } catch (error) {
          hasError = true;
          controller.error(error);
        } finally {
          reader.releaseLock();
          if (!hasError) {
            controller.close();
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return errorResponse('TIMEOUT', 'Request timed out', 504);
    }
    return errorResponse(
      'SERVER_ERROR',
      e instanceof Error ? e.message : 'Server error',
      500,
    );
  }
}

