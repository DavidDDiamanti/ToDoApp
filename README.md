# ToDoApp

I built this to keep one todo list in sync between a Windows desktop and an Android phone, with items nested arbitrarily deep. Solo project, David Diamanti, September 2026.

[screenshot placeholder: replace with screenshot.png]

Each item has a title, description, one of eight colours, and an optional due date and time; a time without a date resolves to the next occurrence, today or tomorrow. Completing a parent completes every descendant, and reopening a child reopens its ancestors. Deleting a parent offers deleting or promoting its children; every delete asks first. Press an item to reveal its Edit, Add and Delete buttons, with one editor open at a time; closing a dirty editor asks first too. Nested items are shaded and outlined by depth, and every control has hover text. Drag an item by any part of its row (hold it first on a touch screen), or use Alt with the arrow keys. It works offline, syncs online, installs as a PWA, and signs in by magic link email with a six digit code.

## How to run it

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. In the SQL editor, run `supabase/migrations/0001_todos.sql` then `supabase/migrations/0002_due_time.sql` before starting the app, since the client writes every column.
4. Enable the Email auth provider, add `http://localhost:5173/**` as the redirect and Site URL, and add `{{ .Token }}` to the Magic Link template.
5. Run `npm run dev` and open `http://localhost:5173`.

Stack: Vite 8, React 19, TypeScript, Zustand 5, idb-keyval, Supabase JS 2, vite-plugin-pwa 1, Node 24. Test with `npm test`, build with `npm run build`; deploy to Vercel.

## How it works

- `src/domain/tree.ts` and `src/domain/ops.ts` hold domain logic: a children map from the flat list, and every operation as patches.
- `src/domain/place.ts` turns a drop or keyboard move into a patch, using a midpoint `sort_order` renumbered once the gap closes.
- `src/dnd/` reads Pointer Events across the item; the drop target is one indicator attribute, with window listeners only during a drag.
- `src/store/todoStore.ts` holds state in Zustand, persisted to IndexedDB per user; deletes are tombstones and changed ids sit in a `dirty` outbox list.
- `src/sync/syncEngine.ts` and `src/sync/supabaseRemote.ts` push dirty rows in chunks, pull with a 60 second overlap, and take Realtime updates; conflicts resolve by newest `updated_at`.
- `src/store/uiStore.ts` tracks the open editor, active item and discard prompt, never persisted; `src/hooks/useClickOutsideEditor.ts` closes the open editor on an outside pointerdown.

## Known issues and what I would do differently

Offline edit conflicts resolve by wall clock time; a completed parent can sit mixed until the next click if a child reopens offline. A deploy reloads the page via the service worker, losing unsaved editor text, and a hung request blocks sync. Dragging near the screen edge does not scroll the page, and a list that changes mid drag can drop on the wrong row. A touch scroll starting outside an open editor closes it, since both start as one press.

## Credits

- The five icons in `src/components/icons.tsx` (chevron, plus, pencil, grip, trash) were drawn for this project.
- No third party assets or fonts are included.
