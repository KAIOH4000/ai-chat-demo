import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ChatApiRequest = {
  message?: string;
  model?: string;
};

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
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const requestModel = typeof body.model === 'string' ? body.model.trim() : '';

    if (!message) {
      return NextResponse.json({ error: '`message` is required' }, { status: 400 });
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing AI_API_KEY' }, { status: 500 });
    }

    const baseUrl = (process.env.AI_BASE_URL || 'https://api.gemai.cc').replace(/\/+$/, '');
    const model = requestModel || process.env.AI_MODEL || 'gpt-4o-mini';
    const systemPrompt = process.env.AI_SYSTEM_PROMPT || 'You are a helpful assistant.';

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch((): ChatCompletionResponse => ({}))) as ChatCompletionResponse;
      return NextResponse.json(
        { error: data?.error?.message || `AI provider request failed: HTTP ${response.status}` },
        { status: response.status },
      );
    }

    if (!response.body) {
      return NextResponse.json({ error: 'AI provider returned no stream body.' }, { status: 502 });
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

              const data = JSON.parse(payload) as ChatCompletionResponse;
              const chunk = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content ?? '';

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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 },
    );
  }
}

