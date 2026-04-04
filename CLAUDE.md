# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with HMR
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check + TypeScript
npm run check:watch  # Continuous type checking
```

No test runner is configured — this is a hackathon prototype.

## Architecture

**PantherHacks2026** is a SvelteKit video auto-cutting app that uses AI to transcribe, analyze, and cut video content intelligently.

### Stack
- **SvelteKit v2** with **Svelte 5 runes** (use `$state`, `$derived`, `$effect` — not legacy stores where possible)
- **TailwindCSS v4** with the Vite plugin (no PostCSS config needed)
- **shadcn-svelte** + **bits-ui** for UI components
- **Vercel AI SDK** (`generateText`) with **@ai-sdk/anthropic** for LLM calls
- **AssemblyAI** for video transcription

### Request Flow

```
Upload → /api/video/transcribe           → AssemblyAI (returns transcript_id)
       → /api/video/transcribe/[id]      → Poll transcription status
       → /api/video/analyze              → OpenRouter/Claude (word-by-word label tool call)
       → /api/video/autocut              → Creates in-memory job (demo, not persisted)
       → /api/video/autocut/[jobId]      → Poll job status
```

### Key Files
- [src/routes/videoeditor/+page.svelte](src/routes/videoeditor/+page.svelte) — Main editing UI at `/videoeditor`; drives the `isProcessing` / `isProcessed` state machine with timed transitions
- [src/routes/videoeditor/+layout.svelte](src/routes/videoeditor/+layout.svelte) — Editor layout: navbar tabs + bottom clip strip; reads `isProcessed` store to toggle strip state
- [src/routes/api/video/analyze/+server.ts](src/routes/api/video/analyze/+server.ts) — LLM word classification via tool use; validates that every word in transcript is labeled exactly once
- [src/lib/server/autocut-jobs.ts](src/lib/server/autocut-jobs.ts) — In-memory job store (demo data only, resets on restart)
- [src/lib/types/autocut.ts](src/lib/types/autocut.ts) — Canonical type definitions for `AutocutJob` and related types
- [src/lib/video/analysis-segments.ts](src/lib/video/analysis-segments.ts) — Builds contiguous segment arrays from LLM-labeled word data
- [src/lib/stores/snip.ts](src/lib/stores/snip.ts) — `isProcessed` writable store shared between layout and page (intentionally a legacy store for cross-component sharing)

### UI Layout
- App served at `/videoeditor`
- Fixed 368px sidebar with 4 panels: `FilesPanel`, `SnipAIPanel`, `AnalysisPanel`, `CutSettingsPanel` (all in `src/lib/components/sidebar/`)
- Main area: `src/lib/components/main/VideoPreview.svelte`
- Sidebar panels conditionally render based on `isProcessed` state

### LLM Integration Pattern
The `/api/video/analyze` route uses `generateText` with a required tool (`label_words`) to force structured output. Always validate that the returned labels cover all words before building segments — the route already does this but it's load-bearing logic.

### Environment Variables
- `ASSEMBLYAI_API_KEY` — required for transcription
- `OPENROUTER_API_KEY` (or equivalent) — required for LLM analysis
