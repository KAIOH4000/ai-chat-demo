'use client';

/**
 * SourceCitation — 引用来源展示组件
 *
 * 在 AI 回答下方渲染检索到的知识库来源
 * 样式参考：类似 Perplexity / New Bing 的来源卡片
 */

import type { SourceCitation as SourceCitationType } from '@/lib/rag/types';

interface Props {
  sources: SourceCitationType[];
}

export default function SourceCitation({ sources }: Props) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {sources.length} 个引用来源
        </span>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
        {sources.map((source, index) => (
          <details key={index} className="group px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                {index + 1}
              </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {source.fileName}
              </span>
              {source.pageNumber && (
                <span className="text-xs text-zinc-400">
                  第 {source.pageNumber} 页
                </span>
              )}
              <span className="ml-auto text-xs text-zinc-400">
                相关度: {(source.score * 100).toFixed(0)}%
              </span>
            </summary>
            <p className="mt-2 pl-7 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {source.chunkContent.length > 400
                ? source.chunkContent.slice(0, 400) + '...'
                : source.chunkContent}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
