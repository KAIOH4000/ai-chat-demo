# AI RAG Chat — 基于检索增强生成的智能知识库问答平台

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![LangChain](https://img.shields.io/badge/LangChain-0.3-38bdf8)](https://js.langchain.com)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black)](https://vercel.com)

一个基于 Next.js 16 构建的全栈 AI 知识库问答系统——支持多模型对话、文档上传、向量检索、流式生成与引用追溯。

> 上传你的 PDF/Markdown/TXT 文档，AI 基于你的知识库回答，支持流式输出、引用来源追溯。

---

## 一、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (React 19 + TypeScript)           │
│                                                              │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Chat UI          │  │  Knowledge    │  │  Citation     │  │
│  │  · SSE stream     │  │  Manager      │  │  Card         │  │
│  │  · Markdown       │  │  · Drag/Drop  │  │  · Source     │  │
│  │  · Code highlight │  │  · File list  │  │  · Score      │  │
│  └────────┬─────────┘  └──────┬───────┘  └──────────────┘  │
└───────────┼───────────────────┼─────────────────────────────┘
            │   HTTP/HTTPS      │
            ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                Next.js 16 App Router (Serverless)            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ /api/chat    │  │ /api/rag     │  │ /api/upload  │      │
│  │ plain stream │  │ SSE events   │  │ multipart    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                │
│         └─────────┬───────┘                 │                │
│                   │                         │                │
│                   ▼                         ▼                │
│  ┌──────────────────────────┐  ┌──────────────────────┐    │
│  │   lib/env.ts             │  │   RAG Pipeline        │    │
│  │   centralized config     │  │   loader → splitter   │    │
│  │   required() / optional()│  │   → embedding         │    │
│  └──────────────────────────┘  │   → vectorstore       │    │
│                                 │   → prompt builder    │    │
│                                 └──────────┬───────────┘    │
└────────────────────────────────────────────┼────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                         │
                    ▼                        ▼                         ▼
          ┌──────────────┐    ┌──────────────────────┐    ┌──────────────┐
          │ OpenAI API   │    │ Embedding Service    │    │ ChromaDB     │
          │ (Chat LLM)   │    │ (Vector Generation)  │    │ (Vector DB)  │
          │ /v1/chat/    │    │ /v1/embeddings       │    │ port 8000    │
          │ completions  │    │                      │    │              │
          └──────────────┘    └──────────────────────┘    └──────────────┘
```

### 分层设计

| 层 | 职责 | 关键技术 |
|----|------|----------|
| **表现层** (Client) | 对话交互、Markdown 渲染、来源卡片 | React 19, Tailwind CSS 4, react-markdown |
| **API 网关层** (Routes) | 请求路由、流式代理、SSE 事件封装 | Next.js App Router, ReadableStream, SSE |
| **业务逻辑层** (Lib) | 文档解析、文本切分、向量化、RAG 管线 | LangChain 0.3, 原生 fetch |
| **基础设施层** (Infra) | 向量存储、LLM 调用、Embedding 生成 | ChromaDB, OpenAI Compatible API |

---

## 二、Vibe Coding 方法论与关键 Prompt 设计

### 2.1 什么是 Vibe Coding

本项目采用 **Vibe Coding** 开发范式——以自然语言描述意图，由 AI 生成代码框架，人工聚焦架构决策与质量把关。整个过程不是"AI 替我写代码"，而是"我与 AI 协作构建软件"。

### 2.2 本项目 Vibe Coding 实践

| 阶段 | 方式 | 产出 |
|------|------|------|
| **架构设计** | 自然语言描述需求 → AI 生成架构草图 → 人工评审确定分层方案 | 三层架构、RAG 管线设计 |
| **核心功能** | 逐个模块描述行为 → AI 生成代码 → 人工 review 边界条件 | API 路由、RAG pipeline |
| **UI 实现** | 描述交互意图 → AI 生成组件 → 人工验证状态覆盖 | Chat UI、SourceCitation |
| **调试修复** | 描述现象 → AI 诊断 → 人工确认修复方案 | 流式解析 bug、peer dependency 冲突 |

### 2.3 关键 Prompt 设计

系统中有两层 Prompt 设计，这是 RAG 问答质量的核心：

**第一层：基础 System Prompt**（由环境变量 `AI_SYSTEM_PROMPT` 配置）

```
You are a helpful assistant.
```

这是对话的基调，可根据场景替换为角色扮演或领域约束。

**第二层：RAG 增强 Prompt**（由 `lib/rag/pipeline.ts` 动态构建）

检索到知识库内容后，在原 system prompt 基础上注入结构化上下文。关键设计原则：

1. **来源编号机制**：用 `[来源 N: 文件名 (页码)]` 标记每条检索结果，引导 LLM 引用时注明来源
2. **分隔线隔离**：Chunk 之间用 `---` 分隔，防止 LLM 混淆不同文档的上下文
3. **长度截断**：单条 Chunk 截断至 800 字符，防止撑爆上下文窗口
4. **诚实约束**：明确指令"如果文档中没有相关信息，请如实告知，不要编造答案"
5. **降级容错**：检索失败时自动回退为普通对话，不阻断用户

实际构建的完整 system prompt 示例：

```
你是一个基于知识库的问答助手。请根据提供的文档内容回答问题。
如果文档中没有相关信息，请如实告知用户，不要编造答案。

--- 以下是与问题相关的知识库文档 ---

[来源 1: photonflow-whitepaper.pdf 第3页]
PhotonFlow 是 CloudNest Labs 于 2024 年发布的新一代光子计算框架...

---

[来源 2: deployment-guide.md]
部署 PhotonFlow 需要以下基础设施：Kubernetes 1.29+、NVIDIA H100 GPU...

--- 文档内容结束 ---

请基于以上文档内容回答用户的问题。引用文档内容时请注明 [来源 N] 编号。
如果文档中没有相关信息，请如实告知用户，不要编造答案。
```

---

## 三、AI 调用逻辑

### 3.1 总体调用模型

本项目不依赖任何 LLM SDK（如 OpenAI SDK），而是**直接使用原生 `fetch` + OpenAI Compatible API 协议**。这样做的优势：

- 零 SDK 依赖，避免版本兼容问题
- 完全控制请求/响应链路（超时、重试、流解析）
- 可对接任何兼容 OpenAI 协议的 API 网关（目前使用 `api.gemai.cc`）

### 3.2 普通对话流（`/api/chat`）

```
Client                    /api/chat                  AI Provider
  │                           │                           │
  │  POST {messages, model}   │                           │
  │──────────────────────────►│                           │
  │                           │  POST /v1/chat/completions│
  │                           │  {stream: true}           │
  │                           │──────────────────────────►│
  │                           │                           │
  │                           │  SSE data: chunk1         │
  │                           │◄──────────────────────────│
  │  text/plain chunk: "你好" │                           │
  │◄──────────────────────────│  SSE data: chunk2         │
  │                           │◄──────────────────────────│
  │  text/plain chunk: "世界" │                           │
  │◄──────────────────────────│  SSE data: [DONE]         │
  │                           │◄──────────────────────────│
  │        stream end         │                           │
```

**实现要点**（`app/api/chat/route.ts`）：

- 使用 Web Streams API `ReadableStream` 逐 chunk 转发，不缓冲完整响应
- AbortController 实现 60 秒超时控制
- SSE 协议解析：按行分割 buffer → 过滤 `data:` 前缀 → 提取 `delta.content`
- 错误分类：`AUTH_ERROR`(401/403) / `MODEL_UNAVAILABLE`(404) / `TIMEOUT` / `UPSTREAM_ERROR`

### 3.3 RAG 问答流（`/api/rag/chat`）

```
Client              /api/rag/chat          VectorStore         AI Provider
  │                      │                      │                   │
  │  POST {messages}     │                      │                   │
  │─────────────────────►│                      │                   │
  │                      │  embedQuery()        │                   │
  │                      │─────────────────────►│                   │
  │                      │  top-K chunks        │                   │
  │                      │◄─────────────────────│                   │
  │                      │                      │                   │
  │                      │  buildRAGSystemPrompt(context)            │
  │                      │                      │                   │
  │                      │  POST /v1/chat/completions                │
  │                      │  {system: enhanced, stream: true}        │
  │                      │──────────────────────────────────────────►│
  │                      │                      │                   │
  │  SSE event: content  │  SSE data: chunk     │                   │
  │◄─────────────────────│◄─────────────────────────────────────────│
  │  ...more content...  │                      │                   │
  │  SSE event: sources  │                      │                   │
  │◄─────────────────────│                      │                   │
  │  SSE event: done     │                      │                   │
  │◄─────────────────────│                      │                   │
```

**SSE Named Events 协议**（`text/event-stream`）：

| Event | 含义 | Payload |
|-------|------|---------|
| `content` | 流式文本块 | `"你好，根据文档..."` |
| `sources` | 引用来源列表 | `[{fileName, chunkContent, pageNumber, score}]` |
| `error` | 错误信息 | `"请求超时"` |
| `done` | 流结束信号 | (空) |

设计考量：
- `sources` 事件在所有 `content` 之后发送，前端可独立渲染引用卡片
- 检索失败时自动降级为普通对话，`sources` 返回 `[]`
- `done` 事件作为客户端清理资源（AbortController）的信号

### 3.4 前端流式消费

前端通过 `fetch + ReadableStream reader` 消费流式响应，根据 `Content-Type` 区分处理：

```typescript
// text/plain → 直接追加到助手消息
// text/event-stream → EventSource 风格解析
const eventType = line.match(/^event: (\w+)/);
const data = line.match(/^data: (.*)/);
// → 分离 content/sources/error/done 事件处理
```

### 3.5 Function Calling

当前版本未实现 Function Calling。架构上已预留扩展点：若后续需要让 LLM 调用外部工具（如实时搜索、数据库查询），只需在 `/api/chat` 的请求体中增加 `tools` 参数，并在流解析循环中新增 `tool_calls` delta 处理分支即可。

---

## 四、部署指南

### 4.1 部署架构

```
User ──► DNS (CNAME) ──► Vercel Edge Network ──► Vercel Serverless Functions
                              │                          │
                              │ (HTTPS auto)             │ (Node.js Runtime)
                              │                          │
                              ▼                          ▼
                         Static Assets             AI API Backend
                         (/、/knowledge)           (api.gemai.cc)
                                                   ChromaDB (optional)
```

### 4.2 准备工作

**前置条件**：
- GitHub 仓库已关联（`KAIOH4000/ai-chat-demo`）
- Vercel 账号已关联 GitHub
- 域名（如 `ai-chat-demo.yourdomain.com`）——可选，Vercel 默认提供 `*.vercel.app` 域名

### 4.3 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/KAIOH4000/ai-chat-demo.git
cd ai-chat-demo

# 2. 安装依赖
npm install --legacy-peer-deps

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 AI_API_KEY
```

### 4.4 Vercel 部署步骤

**Step 1 — 在 Vercel Dashboard 配置环境变量**

进入项目 Settings → Environment Variables，添加：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `AI_API_KEY` | AI API 密钥（必填） | `sk-xxx` |
| `AI_BASE_URL` | AI API 地址 | `https://api.gemai.cc` |
| `AI_MODEL` | 默认对话模型 | `gemini-3-pro-preview` |
| `AI_SYSTEM_PROMPT` | 系统提示词 | `You are a helpful assistant.` |
| `AI_EMBEDDING_MODEL` | Embedding 模型 | `qwen3-embedding-8b` |
| `RAG_TOP_K` | RAG 检索数量 | `5` |
| `RAG_SYSTEM_PROMPT` | RAG 系统提示词 | `你是一个基于知识库的问答助手...` |

环境选择：**Production + Preview**。

**Step 2 — 触发部署**

Push 到 `main` 分支后 Vercel 会自动部署（GitHub Integration）。也可手动：

```bash
npx vercel --prod
```

**Step 3 — 验证部署**

```bash
curl -X POST https://<your-deploy-url>/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"gemini-3-pro-preview"}'
```

### 4.5 DNS 与 HTTPS 配置

**默认域名**：Vercel 自动为每次部署生成 `*.vercel.app` 域名，**HTTPS 自动启用**（Let's Encrypt 证书），无需任何配置。

**自定义域名**：

1. 在 Vercel 项目 Dashboard → Settings → Domains 中添加你的域名
2. 在 DNS 提供商处添加记录：

| 场景 | 记录类型 | 名称 | 值 |
|------|---------|------|------|
| 根域名 `example.com` | A | `@` | `76.76.21.21` |
| 子域名 `app.example.com` | CNAME | `app` | `cname.vercel-dns.com` |

3. Vercel 自动申请和续期 SSL 证书，全程 HTTPS 加密

**DNS 生效验证**：

```bash
# 检查 DNS 解析
nslookup ai-chat-demo.yourdomain.com

# 检查 SSL 证书
curl -vI https://ai-chat-demo.yourdomain.com
```

### 4.6 生产环境 RAG 持久化

Vercel Serverless 环境下，默认 Memory 模式的向量存储在函数冷启动后会丢失。生产环境推荐额外托管 ChromaDB：

```bash
# 在任何 VPS 上启动 ChromaDB
docker-compose up -d
```

然后在 Vercel 环境变量中追加：

| 变量 | 值 |
|------|-----|
| `VECTOR_STORE` | `chroma` |
| `CHROMA_URL` | `https://your-chroma-host:8000` |
| `CHROMA_COLLECTION` | `knowledge-base` |

### 4.7 CI/CD 流程

```
Git Push (main) → GitHub → Vercel Webhook → Build → Deploy
                                          │
                                          ├─ npm install
                                          ├─ next build
                                          ├─ TypeScript 检查
                                          └─ 部署到 Edge Network
```

每次 push 自动触发，构建通过后自动更新生产环境。Preview Deployment 也会在 PR 时自动创建独立预览环境。

---

## 五、项目结构

```
ai-chat-demo/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # 普通对话 API（text/plain 流式）
│   │   ├── rag/chat/route.ts       # RAG 问答 API（SSE named events）
│   │   └── upload/route.ts         # 文件上传 + 文档入库
│   ├── knowledge/page.tsx          # 知识库管理页面
│   ├── layout.tsx                  # 根布局（Geist 字体 + highlight.js）
│   ├── page.tsx                    # 主聊天页面（多对话管理 + SSE）
│   └── globals.css                 # Tailwind v4 + 自定义动画
│
├── components/
│   ├── chat/SourceCitation.tsx     # 引用来源卡片（文件名/页码/相关度）
│   └── knowledge/FileUpload.tsx    # 拖拽上传组件
│
├── lib/
│   ├── env.ts                      # 环境变量统一管理（required/optional）
│   └── rag/
│       ├── types.ts                # RAG 类型系统
│       ├── loader.ts               # 文档加载器（PDF/MD/TXT）
│       ├── splitter.ts             # 文本切分器（Chinese-aware）
│       ├── embedding.ts            # Embedding 服务（OpenAI Compatible）
│       ├── vectorstore.ts          # 向量存储（Memory/Chroma 双模式）
│       └── pipeline.ts             # RAG 管线（检索 + Prompt 构建）
│
├── docker-compose.yml              # ChromaDB 本地部署
├── .npmrc                          # npm peer dependency 策略
├── .env.example                    # 环境变量模板（已提交）
└── package.json
```

---

## 六、本地开发

```bash
npm install --legacy-peer-deps
cp .env.example .env.local    # 编辑 .env.local 填入 API Key
npm run dev                    # http://localhost:3000
```

可选：启动本地 ChromaDB

```bash
docker-compose up -d
# 在 .env.local 中设置 VECTOR_STORE=chroma
```

---

## 七、技术栈

| 类别 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 框架 | Next.js (App Router) | 16.2 | 全栈 React，API Routes 天然支持流式 |
| UI | React | 19.2 | 最新稳定版，支持 Server Components |
| 语言 | TypeScript | 5.x | 全量类型覆盖 |
| 样式 | Tailwind CSS | 4 | 原子化 CSS，零运行时开销 |
| RAG 管线 | LangChain | 0.3 | 文档加载/切分/向量存储抽象 |
| 向量数据库 | ChromaDB | 3.x | 开源，JS 原生客户端 |
| LLM 调用 | 原生 fetch | — | 零 SDK 依赖，兼容 OpenAI 协议 |
| Markdown | react-markdown + remark-gfm | 10 | GFM 表格 + 代码高亮 |
| 部署 | Vercel | — | 默认 HTTPS + 全球 CDN |
