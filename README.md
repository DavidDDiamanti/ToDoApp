# ToDoApp

I built this to keep one todo list in sync between a Windows desktop and an Android phone, with items nested to any depth. Solo project by David Diamanti, built September 2026 for daily use.

[screenshot placeholder: replace with screenshot.png]

Each item has a title, description, due date and one of eight colours. Completing a parent completes every descendant; reopening a child reopens its ancestors. Deleting a parent offers deleting or promoting its children; items move between parents, hide once completed, and flag when overdue. It works offline, syncs once online, installs as a PWA, and signs in by magic link email with a six digit fallback code.

## How to run it

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from a Supabase project.
3. Run `supabase/migrations/0001_todos.sql` in its SQL editor.
4. Enable the Email auth provider and add `http://localhost:5173/**` to the redirect URLs.
5. Run `npm run dev` and open `http://localhost:5173`.

Stack: Vite 8, React 19, TypeScript, Zustand 5, idb-keyval, Supabase JS 2, vite-plugin-pwa 1, Node 24. Test with `npm test` (Vitest 5, Testing Library), build with `npm run build`, preview on port 4173. Deploy via Vercel with the same two variables and its domain in the redirect URLs; `vercel.json` rewrites paths to `index.html`.

## How it works

- `src/domain/tree.ts` and `src/domain/ops.ts` hold pure domain logic. The tree builds a children map from the flat list; an orphan renders at the top level. Ops returns every operation as patches: the completion cascade, and delete with promotion via fractional `sort_order`. Moves are guarded against cycles.
- `src/store/todoStore.ts` holds state in Zustand, persisted to IndexedDB through `idb-keyval`, namespaced per user. Deletes are tombstones (`deleted_at`); changed ids sit in a `dirty` list acting as an outbox.
- `src/sync/syncEngine.ts` and `src/sync/supabaseRemote.ts` push dirty rows in chunks of 200, pull changes with a 60 second overlap, and take live Realtime updates. Conflicts resolve by newest `updated_at`, guarding against overwriting a dirty local row. A trigger in `0001_todos.sql` rejects stale writes, RLS scopes rows to their owner, and a generation counter ignores syncs outliving sign out.
- `src/hooks/useSync.ts` is the only place reacting to the browser going online, the tab becoming visible, and a 60 second timer.
- `src/components/TodoItem.tsx` renders each item with a coloured left rail, using tokens from `src/design/tokens.css`. System fonts only, so it looks right offline on first load.

## Known issues and what I would do differently

Two offline devices editing the same item resolve by wall clock time; a parent completed while a child is reopened offline elsewhere can sit mixed until the next click. A deploy reloads the page via the service worker, losing unsaved editor text; dashboard deletes are ignored since it only soft deletes. Sync calls have no timeout, so a hung request blocks that cycle until it fails.

## Credits

- The five icons in `src/components/icons.tsx` (chevron, plus, pencil, move, trash) were drawn for this project.
- No third party assets, fonts or datasets are included.
