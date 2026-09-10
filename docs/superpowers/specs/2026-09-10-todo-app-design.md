# Todo App: Design Spec

Date: 2026-09-10
Status: draft for user review

## 1. Goal

A personal todo application that runs on a Windows desktop and an Android phone as an installable web app, with one shared, synchronised list. Items can nest to any depth, carry a colour and a due date, and have an expandable description. It must keep working offline and reconcile when the connection returns.

## 2. Requirements

### Items
- Fields: title (required, non-empty), description (optional, multi-line), due date (optional, calendar date), colour (one of 8 named colours, default `slate`), completed flag, parent item (optional).
- Create an item at the top level or as a child of any item.
- Expand an item to show and edit its description.
- Edit title, description, due date and colour inline.
- Move an item under a different parent or to the top level. An item cannot be moved under itself or one of its descendants.
- Delete an item. If it has children, the app asks: delete the children too, or promote them so they take the deleted item's parent.
- Mark complete. Completing an item completes all its descendants. Un-completing an item un-completes all its ancestors.
- Completed items are shown struck through. A toggle hides completed items and their subtrees.
- An item whose due date is before today and which is not completed is flagged as overdue.

### Tree
- Unlimited nesting depth, rendered as a collapsible tree. Collapse state is per device, not synced.
- Siblings keep a stable manual order (creation order by default).

### Sync and offline
- All reads and writes hit local storage first; the UI never waits for the network.
- Changes made offline are queued and sent when online. Changes made on another device arrive within about one second while online, and on the next reconnect otherwise.
- Conflicts on the same item resolve by latest edit time.

### Accounts and security
- One user. Sign-in by email magic link, with a 6-digit code fallback. The session persists per device.
- The database allows a user to read and write only their own rows.

### Platforms
- Windows: Chrome or Edge, installed as a PWA.
- Android: Chrome, installed to the home screen.
- Hosted on Vercel over HTTPS, deployed from a GitHub repository.

### Non-goals (for this version)
- Sharing lists with other people, reminders or push notifications, recurring items, attachments, drag-and-drop reordering, search, tags beyond the colour.

## 3. Architecture

Single-page React application built with Vite and TypeScript. State lives in a Zustand store persisted to IndexedDB. A small sync engine pushes local changes to Supabase and merges remote changes back. Supabase provides Postgres storage, row-level security, Realtime change events and email authentication. `vite-plugin-pwa` produces the manifest and service worker. Vercel serves the static build.

```
Browser (desktop or phone)
  React components  <->  Zustand store (persisted to IndexedDB)
                              |  dirty ids / merged rows
                         sync engine  <->  Supabase (Postgres + Realtime + Auth)
```

### Units and their responsibilities

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/types.ts` | `Todo` row type, `ColorName`, `Patch` | nothing |
| `src/lib/colors.ts` | The 8 palette names mapped to CSS values and labels | types |
| `src/lib/dates.ts` | `todayISO()`, `isOverdue(todo, today)` | types |
| `src/domain/tree.ts` | Pure tree queries: children map, descendants, ancestors, `isDescendant`, next sort order | types |
| `src/domain/ops.ts` | Pure mutations returning patches: create, complete/uncomplete cascade, delete subtree, delete and promote, move | tree |
| `src/store/storage.ts` | IndexedDB adapter for Zustand `persist` via `idb-keyval` | idb-keyval |
| `src/store/todoStore.ts` | Todos by id, dirty ids, `lastPulledAt`, collapsed ids, hide-completed flag; `applyPatches`; schema version and migration | ops, storage |
| `src/store/authStore.ts` | Session, `signInWithOtp`, `verifyOtp`, `signOut` | supabase client |
| `src/lib/supabase.ts` | Supabase client from env vars | @supabase/supabase-js |
| `src/sync/syncEngine.ts` | `flushDirty`, `pullSince`, `mergeRemote`, `sync`, Realtime subscription | todoStore, supabase |
| `src/hooks/useSync.ts` | The single place that wires `online`, `visibilitychange`, an interval and the Realtime channel to the engine | syncEngine |
| `src/components/*` | UI, described in section 6 | store, domain |
| `src/design/tokens.css` | Colour, type, spacing and motion tokens | nothing |

## 4. Data model

One table, `public.todos`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | Generated on the client with `crypto.randomUUID()` so offline creates work |
| `user_id` | uuid, not null | References `auth.users`, defaults to `auth.uid()` |
| `parent_id` | uuid, nullable | References `todos.id`, `ON DELETE SET NULL`; check `parent_id is distinct from id` |
| `title` | text, not null, default `''` | |
| `description` | text, not null, default `''` | |
| `due_date` | date, nullable | Handled on the client as a `YYYY-MM-DD` string |
| `color` | text, not null, default `'slate'` | Check constraint: `slate, red, orange, yellow, green, teal, blue, purple` |
| `completed` | boolean, not null, default false | |
| `sort_order` | double precision, not null, default 0 | Fractional values allow insertion between siblings |
| `deleted_at` | timestamptz, nullable | Tombstone; deleted rows are never removed by the client |
| `created_at` | timestamptz, not null | |
| `updated_at` | timestamptz, not null | Set by the client on every local edit; drives last-write-wins |

Indexes: `user_id`, `parent_id`, `(user_id, updated_at)`.

Trigger `todos_before_write` (before insert or update): on insert, default `updated_at` to `now()` when missing; on update, return `NULL` (drop the write) when the incoming `updated_at` is not newer than the stored one.

Row-level security: enabled, with select, insert, update and delete policies requiring `(select auth.uid()) = user_id`.

Realtime: `replica identity full`; table added to the `supabase_realtime` publication.

Why `ON DELETE SET NULL` rather than cascade: the client never hard-deletes, and both delete behaviours are implemented explicitly by writing the children's rows. The foreign key only matters if someone deletes from the Supabase dashboard; setting null then loses no data, and an orphan renders at the top level.

The same shape is the client's `Todo` type. Local-only state (collapsed ids, hide-completed) is stored beside it but never sent.

## 5. Domain rules

All rules are pure functions over the flat `Record<id, Todo>` and return `Patch[]`, where a patch is `{ id, ...changedFields, updated_at }`. The store applies patches and marks the ids dirty.

- **Children map.** One pass over non-deleted todos builds `Map<parentId | null, Todo[]>`. A todo whose parent is missing or tombstoned is bucketed under `null`. Each bucket is sorted by `(sort_order, created_at)`.
- **Create.** New todo gets `sort_order = max(siblings) + 1` (or 0), `created_at = updated_at = now`, `user_id` from the session.
- **Toggle complete.** If the item is incomplete: patch it and every descendant to `completed = true`. If it is complete: patch it and every ancestor to `completed = false`.
- **Delete subtree.** Patch the item and every descendant with `deleted_at = now`.
- **Delete and promote.** For each direct child, in order, set `parent_id` to the deleted item's `parent_id` and `sort_order` to `deleted.sort_order + (i + 1) / (n + 1)` so they occupy the slot where the parent sat; then tombstone the item.
- **Move.** Reject when the target is the item itself or one of its descendants. Otherwise set `parent_id` to the target (or null) and `sort_order` to the end of the new siblings.
- **Overdue.** `due_date !== null && due_date < todayISO() && !completed`. String comparison is correct for `YYYY-MM-DD`.
- **Hide completed.** Filtering happens at render time per bucket. Hiding a completed parent hides its subtree, which is consistent because the cascade rule guarantees all descendants are completed.

## 6. User interface

### Components
- **AuthGate.** Email form; after submit shows "Check your email" with a field for the 6-digit code. Renders the app once a session exists. Works offline when a cached session exists.
- **Toolbar.** New top-level item, hide-completed toggle, sync status indicator (synced / pending / offline), sign out.
- **TodoTree.** Derives the children map from the store with `useMemo` and renders the root bucket.
- **TodoItem.** One row: collapse chevron (only when it has children), checkbox, colour band, title, due-date badge (red when overdue), actions (edit, add child, move, delete). Renders its children recursively when expanded. Expanding shows the description.
- **TodoEditor.** Inline editor for title, description, due date and colour. Enter saves, Escape cancels, blur saves. Fields have visible labels.
- **ColorPicker.** Eight swatches with accessible names.
- **MoveMenu.** A select listing "Top level" and every non-descendant item, indented by depth.
- **DeleteDialog.** Native `<dialog>` with three actions: "Delete children too", "Keep children, move them up", "Cancel". Only shown when the item has children; otherwise delete is immediate.

### Design direction
Decided in a dedicated design task before the components are built, following the frontend-design skill and the ui-ux-pro-max checklist. Constraints fixed now:
- A token file with 4 to 6 named colours for the chrome, a display face and a body face, a spacing scale, a focus ring, and motion that respects `prefers-reduced-motion`.
- The 8 item colours are data and stay separate from the chrome palette.
- Controls are at least 44 by 44 pixels on touch; icons are SVG with accessible labels; contrast at least 4.5 to 1.
- Mobile-first layout; no horizontal scrolling; works down to 360 px wide.
- One signature element. Current candidate: the nesting guide line that doubles as each item's colour band.

## 7. Sync design

- **Local truth.** The store is the source of truth for the UI. It is persisted to IndexedDB under a key namespaced by user id, with a schema `version` and a migrate function.
- **Outbox.** Every local edit stamps `updated_at = now` on each changed row and adds its id to `dirty`. Repeated edits to one row coalesce.
- **Flush.** `flushDirty()` upserts dirty rows in chunks of 200 with `onConflict: 'id'`. An id leaves `dirty` only if its `updated_at` is unchanged since the flush started. Network errors leave it dirty for the next attempt.
- **Pull.** `pullSince(ts)` selects rows with `updated_at > ts` (tombstones included), ordered by `updated_at`, merges each, and records the newest `updated_at` as `lastPulledAt`. Reconnects overlap by 60 seconds to absorb clock skew; merging is idempotent.
- **Merge.** `mergeRemote(row)`: if the row is locally dirty and the local `updated_at` is newer, keep local; otherwise overwrite local with the remote row.
- **Realtime.** One channel subscribed to `postgres_changes` on `public.todos` filtered by `user_id`. Each event goes through `mergeRemote`.
- **Triggers.** `sync()` runs flush then pull. It runs on app start, on the `online` event, when the tab becomes visible, when the Realtime channel re-subscribes after a drop, and every 60 seconds while online.
- **First login on a device.** Pull from the epoch.
- **Sign out.** Stop the engine, clear the in-memory store; the IndexedDB namespace for that user is left in place.

Accepted limitation: two devices editing the same row while both offline resolve by wall clock. Cross-row invariants (a parent completed on one device while a child is un-completed on another) can merge into a mixed state; the next click restores consistency.

## 8. Error handling

- **Network errors during flush or pull.** Swallowed and surfaced only as the sync indicator's "pending" state; retried on the next trigger.
- **Rejected stale write.** The server trigger drops it silently; the next pull returns the winning row and the local copy is overwritten.
- **Auth expiry.** supabase-js refreshes the token; on failure the AuthGate shows the sign-in form and the local data stays readable.
- **Invalid move.** The move menu never offers invalid targets; `moveTodo` still rejects them as a second guard.
- **IndexedDB unavailable.** The persist middleware falls back to in-memory state; the app still runs, and the sync engine repopulates it from the server.
- **Empty title.** The editor refuses to save an empty title and keeps focus in the field.

## 9. PWA and deployment

- `vite-plugin-pwa` with `registerType: 'autoUpdate'`, a manifest (name, short name, standalone display, theme colour, 192, 512 and maskable icons) and Workbox precaching of the app shell with `navigateFallback` to `index.html`. No runtime caching of Supabase responses; the store owns offline data.
- Icons generated from `public/icon.svg` with `@vite-pwa/assets-generator`.
- `vercel.json` rewrites every path to `index.html`.
- Environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, set in Vercel and in a gitignored `.env.local`; `.env.example` committed.
- Supabase Auth redirect URLs: `http://localhost:5173/**`, `http://localhost:4173/**`, `https://<app>.vercel.app/**`. Magic links use `emailRedirectTo: window.location.origin`.

## 10. Testing strategy

- **Unit (Vitest).** Every domain rule in section 5, the date helpers, the store's patch application and migration, and the sync engine's pure parts (merge precedence, dirty-clearing rule, chunking, overlap window).
- **Component (Vitest + jsdom + React Testing Library).** Each component in section 6: rendering, keyboard behaviour, the delete dialog appearing only when children exist, cascade through the store on checkbox click, overdue class, hide-completed filtering, auth form states.
- **Sync engine I/O.** Tested against a small fake Supabase client that records upserts and serves canned rows.
- **Manual.** Dev server in the Browser pane for the visual checklist; two tabs signed in as the same user for the sync smoke test, using DevTools offline mode; `npm run build` and `npm run preview` for the install prompt and offline launch; install on both real devices at the end.
- **Process.** Tests are written before implementation for every task (test-driven-development skill). Every claim of success is backed by a freshly run command (verification-before-completion skill).

## 11. Manual steps that need the user's accounts

1. Create a Supabase project and copy the project URL and anon key.
2. Run `supabase/migrations/0001_todos.sql` in the SQL editor.
3. Confirm the Email provider is enabled; optionally add `{{ .Token }}` to the magic-link email template for the code fallback.
4. Set the Site URL and redirect URLs.
5. Create the GitHub repository and add it as the remote.
6. Import the repository into Vercel and set the two environment variables; add the Vercel domain to the redirect URLs.
7. Install the app on both devices and sign in on each.
