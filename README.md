# ai-chat-demo
<img width="1920" height="869" alt="image" src="https://github.com/user-attachments/assets/3177505c-97ec-4219-8edc-98a161a18f6f" />

A minimal AI chat demo built with Next.js App Router and TypeScript.
<img width="1920" height="869" alt="image" src="https://github.com/user-attachments/assets/ab41707e-769f-4a21-8de3-e7c221424608" />

## Features

- Next.js App Router + TypeScript
- `/api/chat` server route
- Streaming AI responses
- Model selector with chat/non-chat grouping
- Multi-turn chat bubble UI

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Native `fetch`

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```env
AI_BASE_URL=https://api.gemai.cc
AI_API_KEY=your_api_key_here
AI_MODEL=gemini-3-pro-preview
AI_SYSTEM_PROMPT=You are a helpful assistant.
```

3. Start the development server:

```bash
npm run dev
```

4. Open `http://localhost:3000` in your browser.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
```

## Deployment

This project can be deployed to Vercel.

Required environment variables:

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_SYSTEM_PROMPT`

## Notes

- `.env` and `.env.local` are ignored by Git and must not be committed.
- Some provider models do not support chat completion APIs. Those models are grouped under `Other Models` in the UI.
