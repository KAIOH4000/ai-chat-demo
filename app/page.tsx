'use client';

import { useState } from 'react';

const MODEL_GROUPS = {
  chat: [
    'gemini-3-pro-preview',
    'gemini-3-pro-preview-thinking-512',
    'minimax-m2.1',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro-search-maxthinking',
    'kimi-k2.5',
    'gemini-3.1-flash-lite-preview-search-maxthinking',
    'gpt-5.2-codex',
    'claude-sonnet-4-5-20250929-thinking',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.1-flash-preview',
    'grok-4',
    'gemini-3-flash-preview',
    'grok-4-deepsearch',
    'deepseek-reasoner',
    'gpt-5.3-codex',
  ],
  other: [
    'deepseek-ocr',
    'qwen3-embedding-8b',
    'qwen3-reranker-8b',
  ],
} as const;

const CHAT_MODELS = new Set<string>(MODEL_GROUPS.chat);

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function HomePage() {
  const [model, setModel] = useState('gemini-3-pro-preview');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('请输入内容');
      return;
    }

    if (!CHAT_MODELS.has(model)) {
      setError(`当前模型 "${model}" 不可用于聊天，请选择 Chat Models 分组中的模型。`);
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, model: model.trim() || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || `请求失败：HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error('流式响应不可用');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId
                ? { ...item, content: item.content + chunk }
                : item,
            ),
          );
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessageId
            ? { ...item, content: `请求失败：${message}` }
            : item,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start px-4 py-10 bg-zinc-50">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">AI Chat Demo</h1>

        <select
          className="w-full h-11 px-3 rounded-md border border-zinc-200 bg-white outline-none focus:ring-2 focus:ring-zinc-300"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setError('');
          }}
        >
          <optgroup label="Chat Models">
            {MODEL_GROUPS.chat.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </optgroup>
          <optgroup label="Other Models">
            {MODEL_GROUPS.other.map((option) => (
              <option key={option} value={option} disabled>
                {option}（不可用于聊天）
              </option>
            ))}
          </optgroup>
        </select>

        <textarea
          className="w-full min-h-[140px] p-3 rounded-md border border-zinc-200 bg-white outline-none focus:ring-2 focus:ring-zinc-300"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入你的问题，例如：解释一下 Next.js App Router 的基本概念。"
        />

        <div className="flex items-center gap-3">
          <button
            className="h-10 px-4 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-60"
            onClick={handleSend}
            disabled={loading}
          >
            {loading ? '发送中...' : '发送'}
          </button>
          <button
            className="h-10 px-3 text-sm rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"
            onClick={() => {
              setModel('gemini-3-pro-preview');
              setMessage('');
              setMessages([]);
              setError('');
            }}
            type="button"
            disabled={loading}
          >
            清空
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {messages.length > 0 ? (
          <section className="flex flex-col gap-3">
            {messages.map((item, index) => {
              const isAssistant = item.role === 'assistant';
              const isStreamingBubble = loading && isAssistant && index === messages.length - 1;

              return (
                <div key={item.id} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap px-4 py-3 ${
                      isAssistant
                        ? 'rounded-2xl rounded-bl-md border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                        : 'rounded-2xl rounded-br-md bg-zinc-900 text-white'
                    }`}
                  >
                    {isStreamingBubble && !item.content ? (
                      <span className="text-zinc-500">AI思考中...</span>
                    ) : null}
                    {item.content}
                    {isStreamingBubble ? <span className="stream-cursor" aria-hidden="true">|</span> : null}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        <p className="text-xs text-zinc-500">
          调用后端：`/api/chat`。可直接在页面里切换模型名进行测试。
        </p>
      </div>
    </main>
  );
}
