'use client';

/**
 * FileUpload — 知识库文件上传组件
 *
 * 支持拖拽上传 + 点击选择，PDF / Markdown / TXT
 */

import { useState, useRef, useCallback } from 'react';

interface UploadResult {
  success: boolean;
  fileName: string;
  chunkCount: number;
  fileType: string;
}

interface Props {
  onUploadComplete?: (result: UploadResult) => void;
}

export default function FileUpload({ onUploadComplete }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setLastResult(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!data.success) {
          setError(data.error || '上传失败');
          return;
        }

        const result: UploadResult = {
          success: true,
          fileName: data.fileName,
          chunkCount: data.chunkCount,
          fileType: data.fileType,
        };

        setLastResult(result);
        onUploadComplete?.(result);
      } catch {
        setError('网络错误，请重试');
      } finally {
        setUploading(false);
      }
    },
    [onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset so the same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = '';
    },
    [uploadFile],
  );

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center
          transition-colors duration-200
          ${dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'}
          ${uploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          className="hidden"
          onChange={handleChange}
          disabled={uploading}
        />

        {uploading ? (
          <div className="space-y-2">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500" />
            <p className="text-sm text-zinc-500">正在解析文档...</p>
          </div>
        ) : (
          <div className="space-y-1">
            <svg className="mx-auto h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              拖拽文件到此处，或点击选择
            </p>
            <p className="text-xs text-zinc-400">支持 PDF / Markdown / TXT，最大 10MB</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Success result */}
      {lastResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          上传成功：「{lastResult.fileName}」已切分为 {lastResult.chunkCount} 个 Chunk
        </div>
      )}
    </div>
  );
}
