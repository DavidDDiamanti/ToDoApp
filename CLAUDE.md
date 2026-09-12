# Todo app

Nested, colour-coded todo PWA. Vite + React 19 + TypeScript, Zustand persisted to IndexedDB, Supabase for auth/sync, Vercel hosting.

## Commands
- `npm run dev` (port 5173), `npm run build`, `npm run preview` (port 4173)
- `npm test` runs Vitest once; `npm run test:watch` watches; `npm run typecheck` runs `tsc -b`

## Conventions
- TDD: write the failing test first; tests live next to the code as `*.test.ts(x)`.
- Pure domain logic in `src/domain/`, returns `Patch[]`; the store applies patches and marks ids dirty.
- No barrel files. No `any`. Ternaries for conditional JSX. Hooks never compute derived state in effects.
- Timestamps are ISO strings; compare with `Date.parse`.
- UI copy in sentence case. Touch targets 44px. SVG icons with labels. Respect reduced motion.
- Design tokens in `src/design/tokens.css`; item colours (`--todo-*`) are separate from chrome colours.
- Global listeners live in four hooks plus one scoped site: useSync (online/visibilitychange/interval), useDragReorder (window, during a drag), useOutsidePress (document pointerdown, mounted in Shell), useEnterToCreate (document keydown, mounted in Shell), and ConfirmDialog (document keydown while a dialog is open).
- UI-only state (active item, open editor, discard prompt) lives in src/store/uiStore.ts and is never persisted.

## Docs
- Spec: `docs/superpowers/specs/2026-09-10-todo-app-design.md`
- Plan: `docs/superpowers/plans/2026-09-10-todo-app.md`
