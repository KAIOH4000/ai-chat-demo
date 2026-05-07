'use client';

/**
 * 知识库管理页面
 *
 * 提供文件上传 + 知识库状态查看
 * 上传流程：选择文件 → POST /api/upload → 自动解析/Embedding/入库
 */

import { useState, useEffect, useCallback } from 'react';
import FileUpload from '@/components/knowledge/FileUpload';

export default function KnowledgePage() {
  const [docCount, setDocCount] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/upload');
      const data = await res.json();
      setDocCount(data.count ?? 0);
    } catch {
      setDocCount(null);
    }
  }, []);

  useEffect(() => {
    fetchCount();
  }, [fetchCount, refreshKey]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          知识库管理
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          上传 PDF、Markdown 或 TXT 文档，系统将自动解析并建立索引
        </p>
      </div>

      {/* 状态卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">已入库 Chunk</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {docCount === null ? '...' : docCount}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">存储模式</p>
          <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {process.env.NODE_ENV === 'development' ? 'Memory（开发）' : 'Chroma'}
          </p>
        </div>
      </div>

      {/* 上传组件 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          上传文档
        </h2>
        <FileUpload
          onUploadComplete={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>

      {/* 返回聊天 */}
      <div className="mt-6">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回对话
        </a>
      </div>
    </div>
  );
}
