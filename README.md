# AI RAG Chat — 基于检索增强生成的智能知识库问答平台

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)](https://tailwindcss.com)
[![LangChain](https://img.shields.io/badge/LangChain-0.3-38bdf8)](https://js.langchain.com)

一个基于 Next.js 16 构建的企业级 AI 对话平台——从普通 Chat Demo 扩展为完整的 **RAG（Retrieval-Augmented Generation）知识库问答系统**。

> 上传你的 PDF/Markdown/TXT 文档，AI 基于你的知识库回答，支持流式输出、引用来源追溯。

<img width="1920" height="869" alt="RAG Chat Screenshot" src="https://github.com/user-attachments/assets/7e9caa46-153e-429a-98fb-134709a4ef86" />

---

## 核心能力

### 常规对话
- 多模型切换（DeepSeek / GPT / Gemini）
- 流式输出（SSE / ReadableStream）
- 多轮对话 + 对话历史管理（localStorage 持久化）
- 侧边栏对话列表（新建 / 重命名 / 删除）
- Markdown 渲染 + 代码高亮

### RAG 知识库问答
- 文件上传 + 自动解析（PDF / Markdown / TXT）
- 智能文本切分 + Embedding 向量化
- 向量检索 + 上下文增强 Prompt
- 流式 AI 回答 + 引用来源卡片
- 一键切换普通模式 / RAG 模式

---

## 技术架构

```
┌──────────────────────────────────────────────────────┐
│                    Browser (React 19)                 │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Chat UI   │  │ 知识库管理    │  │ SourceCitation│  │
│  │ (SSE 流式) │  │ (拖拽上传)    │  │ (引用卡片)    │  │
│  └─────┬─────┘  └──────┬───────┘  └──────────────┘  │
└────────┼────────────────┼────────────────────────────┘
         │                │
         ▼                ▼
┌──────────────────────────────────────────────────────┐
│              Next.js 16 App Router (Server)           │
│                                                       │
│  /api/chat         /api/rag/chat      /api/upload    │
│  (普通对话)         (RAG 问答)          (文件入库)     │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │             RAG Pipeline (lib/rag/)             │   │
│  │                                                 │   │
│  │  loader.ts → splitter.ts → embedding.ts        │   │
│  │    (解析)       (切分)         (向量化)          │   │
│  │                      ↓                          │   │
│  │  vectorstore.ts  →  pipeline.ts  →  LLM        │   │
│  │    (向量存储)        (检索+生成)    (流式回复)    │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│                    External Services                  │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ ChromaDB   │  │ OpenAI API   │  │ Embedding   │  │
│  │ (向量检索)  │  │ (Chat LLM)   │  │ (向量生成)   │  │
│  └────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────┘
```

### RAG 数据流

```
文档入库:  Upload → loadDocument() → splitDocument() → embedDocuments() → VectorStore
RAG 问答:  Question → embedQuery() → similaritySearch() → buildContext() → LLM Stream
```

---

## 项目结构

```
ai-chat-demo/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # 普通 Chat API（流式）
│   │   ├── rag/chat/route.ts       # RAG 问答 API（SSE + 来源）
│   │   └── upload/route.ts         # 文件上传 + 入库 API
│   ├── knowledge/page.tsx          # 知识库管理页面
│   ├── layout.tsx                  # 根布局
│   ├── page.tsx                    # 主聊天页面
│   └── globals.css                 # 全局样式
│
├── components/
│   ├── chat/
│   │   └── SourceCitation.tsx      # 引用来源卡片组件
│   └── knowledge/
│       └── FileUpload.tsx          # 拖拽上传组件
│
├── lib/
│   ├── env.ts                      # 环境变量统一管理 + 校验
│   └── rag/
│       ├── types.ts                # RAG 核心类型定义
│       ├── loader.ts               # 文档加载器（PDF/MD/TXT）
│       ├── splitter.ts             # 文本切分器（RecursiveCharacter）
│       ├── embedding.ts            # Embedding 服务（OpenAI Compatible）
│       ├── vectorstore.ts          # 向量存储（Memory / Chroma 双模式）
│       └── pipeline.ts             # RAG 管线编排（检索+Prompt构建）
│
├── docker-compose.yml              # ChromaDB 本地服务
├── .env.example                    # 环境变量模板
├── next.config.ts                  # Next.js 配置
└── package.json
```

---

## 快速开始

### 1. 安装依赖

```bash
npm install --legacy-peer-deps
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
# ── AI Provider ──
AI_BASE_URL=https://api.gemai.cc
AI_API_KEY=sk-your-api-key
AI_MODEL=deepseek-reasoner
AI_SYSTEM_PROMPT=You are a helpful assistant.

# ── Embedding ──
AI_EMBEDDING_MODEL=qwen3-embedding-8b

# ── RAG ──
RAG_TOP_K=5
RAG_SYSTEM_PROMPT=你是一个基于知识库的问答助手。请根据提供的文档内容回答问题。如果文档中没有相关信息，请如实告知用户，不要编造答案。

# ── Vector Store（可选，默认 Memory 模式）──
# VECTOR_STORE=chroma
# CHROMA_URL=http://localhost:8000
```

### 3. （可选）启动 ChromaDB

```bash
docker-compose up -d
```

不启动 ChromaDB 的情况下，系统默认使用内存向量存储（MemoryVectorStore），适合开发调试。服务重启后数据会丢失。

设置 `VECTOR_STORE=chroma` 可切换到 ChromaDB，数据持久化。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

---

## API 文档

### POST /api/chat — 普通对话

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-reasoner"}'
```

返回：`text/plain` 流式文本。

### POST /api/rag/chat — RAG 问答

```bash
curl -X POST http://localhost:3000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"PhotonFlow 是什么？"}],"model":"deepseek-reasoner"}'
```

返回：`text/event-stream` SSE 命名事件：

| 事件 | 说明 | 示例 |
|------|------|------|
| `content` | 流式文本片段 | `data: "你好"` |
| `sources` | 引用来源 JSON | `data: [{"fileName":"a.pdf","score":0.9}]` |
| `error` | 错误信息 | `data: 模型不可用` |
| `done` | 流结束 | `data:` |

### GET /api/upload — 查询知识库状态

```bash
curl http://localhost:3000/api/upload
# {"count": 4}
```

### POST /api/upload — 上传文档入库

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@document.pdf"
# {"success":true,"fileName":"document.pdf","chunkCount":12}
```

---

## RAG 核心模块详解

### 文档加载器（lib/rag/loader.ts）

- **PDF**：LangChain PDFLoader，按页解析，页码信息跟随 chunk
- **MD / TXT**：`TextDecoder` 直接解码，无额外依赖
- 统一返回 `ParsedDocument`，上层无需关心文件类型差异

### 文本切分器（lib/rag/splitter.ts）

- 使用 `RecursiveCharacterTextSplitter`
- `chunkSize: 1000`，`chunkOverlap: 200`
- 分隔符优先级：段落(`\n\n`) → 换行(`\n`) → 句号(`。`) → 空格 → 字符
- 每个 chunk 携带来源元数据（文件名、页码、序号）

### Embedding 服务（lib/rag/embedding.ts）

- 直接调用 OpenAI Compatible API (`/v1/embeddings`)
- 不依赖 `@langchain/openai`，避免 SDK 版本兼容问题
- 支持批量 embedding（`embedDocuments`）和单条（`embedQuery`）

### 向量存储（lib/rag/vectorstore.ts）

双模式设计，通过 `VECTOR_STORE` 环境变量切换：

| 模式 | 存储 | 持久化 | 适用场景 |
|------|------|--------|---------|
| Memory | LangChain MemoryVectorStore | 否（重启丢失） | 本地开发 |
| Chroma | ChromaDB | 是 | 生产环境 |

### RAG 管线（lib/rag/pipeline.ts）

```
用户提问 → embedQuery() → similaritySearch() → buildContextText() → LLM
```

- 检索结果格式化为带编号的上下文 Prompt
- 来源单独提取为 `SourceCitation[]`，通过 SSE `sources` 事件返回前端
- 检索失败时自动降级为普通对话，不阻断用户

---

## 引用来源（SourceCitation）

AI 回答下方自动展示检索到的知识库来源卡片：

- 来源文件名 + 页码
- 相关度百分比（向量相似度分数）
- 可展开查看 chunk 原文
- 文案示例：「来源：photonflow-guide.md 第1页」

前端通过 SSE `sources` 事件解析，与流式文本分离渲染，互不干扰。

---

## 已验证的测试结果

| 测试场景 | 结果 | 说明 |
|---------|------|------|
| PDF/MD/TXT 上传 | ✅ | 解析 + 切分 + Embedding + 入库全管线通过 |
| 向量检索 | ✅ | 语义匹配准确，返回 Top-K 结果 + 相似度分数 |
| RAG 流式回答 | ✅ | SSE named events 正常，content/sources/done 分离 |
| 引用来源展示 | ✅ | 文件名、页码、相关度百分比正确 |
| 检索失败降级 | ✅ | 自动切换为普通对话模式 |
| 普通 Chat 兼容 | ✅ | 原有功能不受影响 |

### RAG 检索命中率测试（原创文档 PhotonFlow）

上传自编的 PhotonFlow 技术白皮书后：

- Q1「PhotonFlow 是什么？由谁发布？」→ ✅ 命中（CloudNest Labs, 2024）
- Q2「PhotonFlow 安全模型有几层？」→ ✅ 完美命中（三层全对）
- Q3「部署需要哪些基础设施？」→ ⚠️ 部分未命中（Embedding 语义偏差）

> 可通过提升 `RAG_TOP_K`、加入 hybrid 搜索或 re-ranker 优化。

---

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建
npm run start    # 启动生产服务器
```

---

## 部署

### Vercel

本项目可直接部署到 Vercel。需在 Vercel 项目设置中配置以下环境变量：

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_SYSTEM_PROMPT`
- `AI_EMBEDDING_MODEL`
- `RAG_TOP_K`
- `RAG_SYSTEM_PROMPT`

注意事项：
- Vercel Serverless 运行时，MemoryVectorStore 每次请求间不共享内存，数据无法跨请求访问
- 推荐搭配 ChromaDB Cloud 或 Pinecone 使用

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16 |
| UI | React | 19 |
| 语言 | TypeScript | 5 |
| 样式 | Tailwind CSS | 4 |
| RAG/文档处理 | LangChain | 0.3 |
| 向量数据库 | ChromaDB | 3.x |
| LLM SDK | 原生 fetch (OpenAI Compatible) | — |
| Markdown 渲染 | react-markdown + remark-gfm | 10 |
| 代码高亮 | rehype-highlight + highlight.js | 7 |

---

## License

MIT
