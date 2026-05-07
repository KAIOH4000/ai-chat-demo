'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import SourceCitation from '@/components/chat/SourceCitation';
import type { SourceCitation as SourceCitationType } from '@/lib/rag/types';

// ── localStorage keys ──
const CONVERSATIONS_KEY = 'ai-chat-demo-conversations';
const ACTIVE_ID_KEY = 'ai-chat-demo-active-id';

// ── Model config ──
const MODEL_GROUPS = {
  chat: [
    'minimax-m2.1',
    'gemini-3.1-pro-preview',
    'gpt-5.2-codex',
    'deepseek-reasoner',
    'gpt-5.3-codex',
  ],
  other: [
    'grok-4', 'grok-4-deepsearch', 'deepseek-ocr',
    'qwen3-embedding-8b', 'qwen3-reranker-8b',
  ],
} as const;

const CHAT_MODELS = new Set<string>(MODEL_GROUPS.chat);

// ── Types ──
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitationType[];
};

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
};

// ── Storage helpers ──
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as T;
  } catch { /* ignore */ }
  return fallback;
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

// ── Time formatting ──
function formatTime(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isToday) return `今天 ${time}`;
  if (isYesterday) return `昨天 ${time}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function formatDateGroup(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return '今天';
  if (date.toDateString() === yesterday.toDateString()) return '昨天';

  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff < 7) return `${diff}天前`;

  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

// ── Derive conversation title from messages ──
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '新对话';
  const text = firstUser.content.trim();
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '...';
}

// ── Create a fresh conversation ──
function createConversation(model: string): Conversation {
  return {
    id: `conv-${Date.now()}`,
    title: '新对话',
    messages: [],
    model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Error banner component ──
const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  TIMEOUT:           { title: '请求超时',       description: '服务器响应超时，请检查网络连接或稍后重试。' },
  AUTH_ERROR:        { title: 'API Key 错误',    description: 'API 认证失败，请联系管理员检查配置。' },
  MISSING_API_KEY:   { title: '服务配置错误',    description: '服务端 API Key 未配置，请联系管理员。' },
  MODEL_UNAVAILABLE: { title: '模型不可用',      description: '当前模型暂不可用，请切换其他模型后重试。' },
  UPSTREAM_ERROR:    { title: '上游服务异常',    description: 'AI 服务暂不可用，请稍后重试。' },
};

const DEFAULT_ERROR = { title: '请求失败', description: '发生未知错误，请稍后重试。' };

function ErrorBanner({ code, message, onDismiss }: { code: string; message: string; onDismiss: () => void }) {
  const info = ERROR_MESSAGES[code] ?? DEFAULT_ERROR;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm animate-fade-in">
      <span className="mt-0.5 shrink-0 text-red-500">&#9888;</span>
      <div className="flex-1">
        <p className="font-medium text-red-800">{info.title}</p>
        <p className="mt-1 text-red-600">{info.description}</p>
        {message ? <p className="mt-2 text-xs text-red-400">&gt; {message}</p> : null}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-red-400 hover:text-red-600" aria-label="关闭">&#10005;</button>
    </div>
  );
}

// ── Markdown renderer ──
function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          if (!match) {
            return <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>;
          }
          return <code className={className} {...props}>{children}</code>;
        },
        pre({ children }) {
          return <pre className="overflow-x-auto rounded-lg bg-zinc-900 text-zinc-100 text-sm leading-relaxed p-4 my-2">{children}</pre>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{children}</a>;
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-zinc-300 text-sm">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return <th className="border border-zinc-300 px-3 py-1.5 bg-zinc-50 text-left font-medium">{children}</th>;
        },
        td({ children }) {
          return <td className="border border-zinc-300 px-3 py-1.5">{children}</td>;
        },
        blockquote({ children }) {
          return <blockquote className="border-l-4 border-zinc-300 pl-4 my-2 text-zinc-600 italic">{children}</blockquote>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 my-1 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 my-1 space-y-1">{children}</ol>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Confirm dialog (simple modal overlay) ──
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-lg p-5 max-w-sm mx-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-zinc-700">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="h-8 px-4 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50" onClick={onCancel}>取消</button>
          <button className="h-8 px-4 rounded-lg bg-red-600 text-sm text-white hover:bg-red-700" onClick={onConfirm}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

// ── Rename input inline ──
function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="flex-1 min-w-0 h-7 px-2 rounded border border-zinc-300 text-xs outline-none focus:ring-2 focus:ring-zinc-400"
      defaultValue={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSave((e.target as HTMLInputElement).value.trim() || value);
        }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={(e) => onSave(e.target.value.trim() || value)}
    />
  );
}

// ── SSE parsing helpers ──
function extractSSEField(raw: string, field: string): string {
  const regex = new RegExp(`^${field}:\\s*(.*)$`, 'm');
  const match = raw.match(regex);
  return match ? match[1] : '';
}

function safeParseSSEData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

// ══════════════════════════════════════════════
//  MAIN PAGE COMPONENT
// ══════════════════════════════════════════════

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);

  // ── Multi-conversation state ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // ── Active conversation derived state ──
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState('minimax-m2.1');
  const [message, setMessage] = useState('');

  // ── UI state ──
  const [loading, setLoading] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Hydration: load persisted data ──
  useEffect(() => {
    const saved = loadFromStorage<Conversation[]>(CONVERSATIONS_KEY, []);
    const lastId = loadFromStorage<string>(ACTIVE_ID_KEY, '');

    let target: Conversation | undefined;
    if (lastId) target = saved.find((c) => c.id === lastId);
    if (!target && saved.length > 0) target = saved[0];
    if (!target) {
      const fresh = createConversation('minimax-m2.1');
      saved.push(fresh);
      saveToStorage(CONVERSATIONS_KEY, saved);
      target = fresh;
    }

    setConversations(saved);
    setActiveId(target.id);
    setMessages(target.messages);
    setModel(target.model);
    setHydrated(true);
  }, []);

  // ── Persist conversations list ──
  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(CONVERSATIONS_KEY, conversations);
  }, [conversations, hydrated]);

  // ── Persist active ID ──
  useEffect(() => {
    if (!hydrated || !activeId) return;
    saveToStorage(ACTIVE_ID_KEY, activeId);
  }, [activeId, hydrated]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auto-dismiss error ──
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  // ── Helper: sync active conversation state to conversations list ──
  const syncActiveConv = useCallback(
    (newMessages: ChatMessage[], newModel: string) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === activeId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          messages: newMessages,
          model: newModel,
          title: deriveTitle(newMessages),
          updatedAt: Date.now(),
        };
        return updated;
      });
    },
    [activeId],
  );

  // ── Switch to a different conversation ──
  function switchConversation(id: string) {
    if (id === activeId) return;
    // Cancel in-flight request
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);

    const target = conversations.find((c) => c.id === id);
    if (!target) return;

    setActiveId(id);
    setMessages(target.messages);
    setModel(target.model);
    setMessage('');
    setError(null);
    setSidebarOpen(false);
  }

  // ── New conversation ──
  function handleNewChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);

    const fresh = createConversation(model);
    setConversations((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setMessages([]);
    setMessage('');
    setError(null);
    setSidebarOpen(false);
  }

  // ── Delete conversation ──
  function handleDeleteConfirm(id: string) {
    setConfirmDeleteId(id);
  }

  function handleDeleteExec() {
    if (!confirmDeleteId) return;
    const isActive = confirmDeleteId === activeId;
    const filtered = conversations.filter((c) => c.id !== confirmDeleteId);
    setConversations(filtered);
    setConfirmDeleteId(null);

    if (filtered.length === 0) {
      // All deleted — create a fresh one
      const fresh = createConversation(model);
      setConversations([fresh]);
      setActiveId(fresh.id);
      setMessages([]);
      setModel(model);
    } else if (isActive) {
      // Switch to the most recent other conversation
      const next = filtered[0];
      setActiveId(next.id);
      setMessages(next.messages);
      setModel(next.model);
    }
    setMessage('');
    setError(null);
  }

  // ── Rename conversation ──
  function handleRenameStart(id: string) {
    setRenamingId(id);
  }

  function handleRenameSave(id: string, title: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    setRenamingId(null);
  }

  // ── Stop streaming ──
  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  // ── Clear active conversation ──
  function handleClear() {
    if (loading) return;
    const cleared: ChatMessage[] = [];
    setMessages(cleared);
    setMessage('');
    setError(null);
    syncActiveConv(cleared, model);
  }

  // ── Send message ──
  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) {
      setError({ code: 'MISSING_MESSAGE', message: '请输入内容' });
      return;
    }
    if (!CHAT_MODELS.has(model)) {
      setError({ code: 'MODEL_UNAVAILABLE', message: `当前模型 "${model}" 不可用于聊天，请选择 Chat Models 分组中的模型。` });
      return;
    }

    abortRef.current?.abort();

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setLoading(true);
    setError(null);
    setMessage('');

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '' };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);

    const controller = new AbortController();
    abortRef.current = controller;

    const endpoint = ragMode ? '/api/rag/chat' : '/api/chat';
    const body = JSON.stringify({
      messages: [...history, { role: 'user', content: trimmed }],
      model: model.trim() || undefined,
    });

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        // RAG 端点错误时返回 SSE，需要特殊处理
        if (ct.includes('text/event-stream') && res.body) {
          await parseSSEForError(res.body, assistantId);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new Error(JSON.stringify({ code: data.code ?? 'UPSTREAM_ERROR', message: data.error ?? `请求失败：HTTP ${res.status}` }));
      }
      if (!res.body) throw new Error('流式响应不可用');

      if (ragMode) {
        await readSSEStream(res.body, assistantId);
      } else {
        await readPlainStream(res.body, assistantId);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      let code = 'SERVER_ERROR';
      let msg = '未知错误';
      if (e instanceof Error) {
        try {
          const parsed = JSON.parse(e.message) as { code: string; message: string };
          code = parsed.code;
          msg = parsed.message;
        } catch { msg = e.message; }
      }
      setError({ code, message: msg });
      setMessages((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: item.content || `请求失败：${msg}` } : item)));
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  // ── SSE 解析：RAG 流式响应 ──
  async function readSSEStream(body: ReadableStream<Uint8Array>, assistantId: string) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 消息以 \n\n 分隔
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n');
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const eventType = extractSSEField(raw, 'event');
          const data = extractSSEField(raw, 'data');

          if (eventType === 'content' && data) {
            const text = safeParseSSEData(data);
            if (text) {
              setMessages((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: item.content + text } : item)));
            }
          } else if (eventType === 'sources') {
            const sources = safeParseSSEData(data) as SourceCitationType[];
            setMessages((prev) => prev.map((item) => (item.id === assistantId ? { ...item, sources } : item)));
          } else if (eventType === 'error') {
            setError({ code: 'UPSTREAM_ERROR', message: data || 'RAG 检索失败' });
          }
          // 'done' event — just ignore, stream will end naturally
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── 普通流式读取（保持原有行为） ──
  async function readPlainStream(body: ReadableStream<Uint8Array>, assistantId: string) {
    const reader = body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setMessages((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: item.content + chunk } : item)));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── 从 SSE 错误流中提取错误信息 ──
  async function parseSSEForError(body: ReadableStream<Uint8Array>, assistantId: string) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      const lineMatch = buffer.match(/^data:\s*(.+)$/m);
      const msg = lineMatch ? lineMatch[1] : 'RAG 服务错误';
      setError({ code: 'UPSTREAM_ERROR', message: msg });
      setMessages((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: `请求失败：${msg}` } : item)));
    } finally {
      reader.releaseLock();
    }
  }

  // Keep conversations list in sync when messages/model change
  useEffect(() => {
    if (!hydrated) return;
    syncActiveConv(messages, model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, model]);

  // ── Group conversations by date ──
  function groupedConversations() {
    const groups: { label: string; conversations: Conversation[] }[] = [];
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const todayList: Conversation[] = [];
    const yesterdayList: Conversation[] = [];
    const earlierList: Conversation[] = [];

    for (const c of conversations) {
      const d = new Date(c.updatedAt).toDateString();
      if (d === today) todayList.push(c);
      else if (d === yesterdayStr) yesterdayList.push(c);
      else earlierList.push(c);
    }

    if (todayList.length > 0) groups.push({ label: '今天', conversations: todayList });
    if (yesterdayList.length > 0) groups.push({ label: '昨天', conversations: yesterdayList });
    if (earlierList.length > 0) groups.push({ label: '更早', conversations: earlierList });

    return groups;
  }

  // ── Render ──
  return (
    <div className="h-dvh flex bg-zinc-50">
      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40 w-60 flex flex-col bg-white border-r border-zinc-200
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Sidebar header */}
        <div className="shrink-0 p-3 border-b border-zinc-100">
          <button
            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 active:scale-[0.97] transition-all"
            onClick={handleNewChat}
            type="button"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新对话
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scroll-smooth">
          {conversations.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center pt-8">暂无对话</p>
          ) : (
            groupedConversations().map((group) => (
              <div key={group.label}>
                <p className="px-2 py-1.5 text-[11px] font-medium text-zinc-400">{group.label}</p>
                {group.conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative flex items-center gap-1 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${
                      conv.id === activeId
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                    onClick={() => switchConversation(conv.id)}
                  >
                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      {renamingId === conv.id ? (
                        <RenameInput
                          value={conv.title}
                          onSave={(v) => handleRenameSave(conv.id, v)}
                          onCancel={() => setRenamingId(null)}
                        />
                      ) : (
                        <p className="truncate text-xs font-medium">{conv.title}</p>
                      )}
                      <p className="text-[10px] text-zinc-400 mt-0.5">{formatTime(conv.updatedAt)}</p>
                    </div>

                    {/* Action buttons — visible on hover */}
                    <div className={`shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${conv.id === activeId ? 'opacity-100' : ''}`}>
                      <button
                        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200"
                        onClick={(e) => { e.stopPropagation(); handleRenameStart(conv.id); }}
                        title="重命名"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-red-500 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(conv.id); }}
                        title="删除"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Bottom branding */}
        <div className="shrink-0 p-3 border-t border-zinc-100">
          <p className="text-[10px] text-zinc-400 text-center">AI Chat Demo</p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top bar ── */}
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-zinc-50/80 backdrop-blur-sm">
          {/* Hamburger (mobile) */}
          <button
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
            onClick={() => setSidebarOpen(true)}
            type="button"
            aria-label="打开侧边栏"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-base font-semibold tracking-tight flex-1">AI Chat Demo</h1>

          {/* RAG toggle */}
          <button
            onClick={() => setRagMode((v) => !v)}
            title={ragMode ? 'RAG 模式：基于知识库回答' : '普通模式：直接对话'}
            className={`hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
              ragMode
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            RAG
          </button>

          {/* Knowledge base link */}
          <a
            href="/knowledge"
            className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v4m3-4v4m3-4v4" />
            </svg>
            知识库
          </a>

          <button
            className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 active:scale-[0.97] transition-all"
            onClick={handleNewChat}
            type="button"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新对话
          </button>
        </header>

        {/* ── Messages area ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6">
          <div className="max-w-4xl mx-auto space-y-5 scroll-smooth">
            {messages.length > 0 ? (
              <>
                {messages.map((item, idx) => {
                  const isAssistant = item.role === 'assistant';
                  const isStreaming = loading && isAssistant && idx === messages.length - 1;
                  return (
                    <div key={item.id} className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} animate-message-in`}>
                      <span className="text-[11px] font-medium text-zinc-400 mb-1 px-1 select-none">
                        {isAssistant ? 'AI' : 'You'}
                      </span>
                      <div className={`max-w-[95%] overflow-hidden ${isAssistant ? 'rounded-2xl rounded-bl-md border border-zinc-200 bg-white text-zinc-900 shadow-sm' : 'rounded-2xl rounded-br-md bg-zinc-900 text-white'}`}>
                        <div className="px-4 py-3">
                          {isStreaming && !item.content ? <span className="text-zinc-500">AI思考中...</span> : null}
                          {isAssistant ? (
                            <div className="prose-custom"><MarkdownContent content={item.content} /></div>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.content}</p>
                          )}
                          {isStreaming ? <span className="stream-cursor" aria-hidden="true">|</span> : null}
                        </div>
                        {!isStreaming && isAssistant && item.sources && item.sources.length > 0 && (
                          <div className="mt-2 max-w-[95%] w-full">
                            <SourceCitation sources={item.sources} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-300 animate-fade-in">
                <svg className="w-14 h-14 mb-4 text-zinc-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm font-medium text-zinc-400">开始一段新的对话</p>
                <p className="text-xs text-zinc-300 mt-1">选择一个模型，输入你的问题</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="shrink-0 px-4 pb-2 max-w-4xl mx-auto w-full">
            <ErrorBanner code={error.code} message={error.message} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* ── Input area ── */}
        <div className="shrink-0 px-4 pb-4">
          <div className="max-w-4xl mx-auto bg-white rounded-xl border border-zinc-200 shadow-sm px-4 py-3 space-y-3">
            {/* Model selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium shrink-0">Model</span>
              <select
                className="flex-1 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs outline-none focus:ring-2 focus:ring-zinc-300 cursor-pointer"
                value={model}
                onChange={(e) => { setModel(e.target.value); setError(null); }}
              >
                <optgroup label="Chat Models">
                  {MODEL_GROUPS.chat.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </optgroup>
                <optgroup label="Other Models">
                  {MODEL_GROUPS.other.map((opt) => (<option key={opt} value={opt} disabled>{opt}（不可用于聊天）</option>))}
                </optgroup>
              </select>
            </div>

            {/* Textarea + buttons */}
            <div className="flex gap-3">
              <textarea
                className="flex-1 min-h-[120px] max-h-[400px] p-3 rounded-lg border border-zinc-200 bg-white outline-none focus:ring-2 focus:ring-zinc-300 resize-none text-sm placeholder:text-zinc-300"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="输入你的问题..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <div className="flex flex-col gap-2">
                {loading ? (
                  <button className="h-9 px-5 rounded-lg border border-red-200 bg-white text-red-500 text-sm hover:bg-red-50 whitespace-nowrap animate-pulse-soft" onClick={handleStop} type="button">停止</button>
                ) : (
                  <button className="h-9 px-5 rounded-lg bg-zinc-900 text-white text-sm hover:bg-zinc-800 active:scale-[0.97] transition-all disabled:opacity-60 whitespace-nowrap" onClick={handleSend} disabled={loading}>发送</button>
                )}
                <button className="h-9 px-5 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500 hover:bg-zinc-50 active:scale-[0.97] transition-all disabled:opacity-60 whitespace-nowrap" onClick={handleClear} type="button" disabled={loading}>清空</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {confirmDeleteId && (
        <ConfirmDialog
          message="确定要删除这个对话吗？此操作不可恢复。"
          onConfirm={handleDeleteExec}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
