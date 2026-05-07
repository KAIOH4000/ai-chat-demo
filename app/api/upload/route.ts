/**
 * POST /api/upload — 文件上传 + 文档解析 + 文本切分 + Embedding + 入库
 * GET  /api/upload — 查询已入库文档数量
 *
 * 完整 RAG 入库管线：
 *   文件 → loadDocument() → splitDocument() → embedDocuments() → addChunksToStore()
 *
 * 校验层：文件类型（MIME + 扩展名双重检查）、文件大小（10MB 上限）
 */

import { NextResponse } from 'next/server';
import { loadDocument } from '@/lib/rag/loader';
import { splitDocument } from '@/lib/rag/splitter';
import { addChunksToStore, getDocumentCount } from '@/lib/rag/vectorstore';

export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt'];
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isAllowedFile(fileName: string, mimeType: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_TYPES.includes(mimeType);
}

// ─── GET: 查询知识库状态 ──────────────────────────────────────

export async function GET() {
  try {
    const count = await getDocumentCount();
    return NextResponse.json({ count });
  } catch (error) {
    console.error('[Upload:GET] Error:', error);
    return NextResponse.json({ count: 0, error: '查询失败' }, { status: 500 });
  }
}

// ─── POST: 上传并入库 ─────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: '未找到上传文件' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ success: false, error: '文件为空' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    if (!isAllowedFile(file.name, file.type)) {
      return NextResponse.json(
        { success: false, error: `不支持的文件类型: ${file.name}，仅支持 PDF / Markdown / TXT` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Step 1: 解析文档
    console.log(`[Upload] Parsing: ${file.name}`);
    const doc = await loadDocument(buffer, file.name);

    // Step 2: 文本切分
    const chunks = await splitDocument(doc);
    console.log(`[Upload] Split: ${chunks.length} chunk(s)`);

    // Step 3: Embedding + 入库
    console.log(`[Upload] Indexing: generating embeddings for ${chunks.length} chunk(s)...`);
    await addChunksToStore(chunks);
    console.log(`[Upload] Done: ${file.name} fully indexed`);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      chunkCount: chunks.length,
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
