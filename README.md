# ToDoApp

I built this to keep one todo list in sync between a Windows desktop and an Android phone, with items nested arbitrarily deep. Solo project by David Diamanti, built September 2026.

[screenshot placeholder: replace with screenshot.png]

Each item has a title, description, one of eight colours, and an optional due date and time. A time entered without a date resolves to its next occurrence, today or tomorrow depending on whether it has already passed. Completing a parent completes every descendant; reopening a child reopens its ancestors. Deleting a parent offers deleting or promoting its children; items hide once completed and flag when overdue. Drag an item by its grip handle to drop it above, below or onto another row, or use Alt with the arrow keys from the keyboard. It works offline, syncs once online, installs as a PWA, and signs in by magic link email with a six digit fallback code.

## How to run it

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from a Supabase project.
3. In the SQL editor, run `supabase/migrations/0001_todos.sql`, then `supabase/migrations/0002_due_time.sql`. Run 0002 before starting this version, since the client writes every column and saves fail without it.
4. Enable the Email auth provider, add `http://localhost:5173/**` as the redirect URL and Site URL, and add `{{ .Token }}` to the Magic Link template for the six digit sign-in code.
5. Run `npm run dev` and open `http://localhost:5173`.

Stack: Vite 8, React 19, TypeScript, Zustand 5, idb-keyval, Supabase JS 2, vite-plugin-pwa 1, Node 24. Test with `npm test`, build with `npm run build`. Deploy via Vercel with the same two variables.

## How it works

- `src/domain/tree.ts` and `src/domain/ops.ts` hold pure domain logic: a children map from the flat list, and every operation as patches, including the completion cascade and delete with promotion.
- `src/domain/place.ts` turns a drop or a keyboard move into a patch, using a midpoint `sort_order` between the new neighbours, renumbering the sibling bucket once that gap closes.
- `src/dnd/` reads Pointer Events on the grip handle. Row rectangles are cached once at pointer down, the drop target is a single indicator attribute, and window listeners attach only during a drag.
- `src/store/todoStore.ts` holds state in Zustand, persisted to IndexedDB, namespaced per user. Deletes are tombstones; changed ids sit in a `dirty` list as an outbox.
- `src/sync/syncEngine.ts` and `src/sync/supabaseRemote.ts` push dirty rows in chunks, pull with a 60 second overlap, and take Realtime updates; conflicts resolve by newest `updated_at`.

## Known issues and what I would do differently

Two offline devices editing the same item resolve by wall clock time; a completed parent whose child reopens offline can sit mixed until the next click. A deploy reloads the page via the service worker, losing unsaved editor text, and a hung sync request blocks the cycle since calls have no timeout. Dragging near the edge of the screen does not scroll the page yet.

## Credits

- The five icons in `src/components/icons.tsx` (chevron, plus, pencil, grip, trash) were drawn for this project.
- No third party assets or fonts are included.
