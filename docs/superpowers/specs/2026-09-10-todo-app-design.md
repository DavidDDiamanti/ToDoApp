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
- **TodoEditor.** Inline editor for title, description, due date and colour. Enter in the title field or the Save button saves; Escape or the Cancel button cancels. Fields have visible labels. (Blur-to-save was dropped: it fires when the user clicks Cancel and is unreliable on Android keyboards.)
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

## 12. v2 changes (2026-09-11)

Requested after the first local run, before merging PR #1. Decisions were taken with the user in a plan-mode conversation.

### 12.1 Due time

- `Todo` gains `due_time: string | null` (`HH:MM`, 24-hour, local time). Stored in Postgres as `text` with a format check so the `<input type="time">` value round-trips unchanged. Migration `supabase/migrations/0002_due_time.sql`; a time is never stored without a date.
- The editor shows "Due date" and "Due time" side by side. Either may be empty.
- Resolution rule at save: if a time is set and the date is empty, the date becomes the next occurrence of that time. At 16:00 entering 15:37 gives tomorrow; entering 16:30 gives today; the same minute counts as passed. Month and year rollover follow the calendar. Pure function `resolveDueDate(date, time, now)` in `src/lib/dates.ts`.
- Overdue: without a time, unchanged (overdue once the day has ended). With a time, overdue once the local instant `date + time` is earlier than now.
- Overdue re-evaluates each minute. `useNow()` in `src/hooks/useNow.ts` returns a `Date` that advances on the next minute boundary and every 60 seconds after it; `TodoTree` reads it once and passes it through the tree context, so a row flips from due to overdue on its own with no interaction and no per-row timer. It is the only interval used for display; `useSync` stays the only sync interval.
- Display: date only as before (`dateStyle: medium`); with time, `dateStyle: medium` plus `timeStyle: short` in the browser locale. `<time dateTime>` carries `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`.
- Persisted store version becomes 2; migration fills `due_time: null` on older rows. Rows pulled from a project that has not run migration 0002 are normalised to `due_time: null`.

### 12.2 Drag and drop

- Every row has an always-visible 44 px grip handle at its left edge on all screen sizes. Dragging starts on the handle only (Pointer Events, no library); `touch-action: none` on the handle so a finger drag does not scroll, while the rest of the row scrolls as usual.
- Drop zones on a target row: top quarter inserts before it, bottom quarter inserts after it (both as a sibling of the target), the middle half drops **onto** it and makes the dragged item the target's last child. The dragged item and its descendants are never valid targets.
- Ordering uses a midpoint `sort_order` between the new neighbours; when the gap falls under `1e-6` the whole sibling bucket is renumbered 0..n. Moves produce patches through the existing store so they sync like any edit.
- Keyboard parity on the handle: Alt+Up and Alt+Down swap with the previous or next sibling, Alt+Right nests under the previous sibling as its last child, Alt+Left moves the item out to sit right after its current parent. A polite live region announces "Moved {title} under {parent}, position i of n" (or "to the top level") and "Cannot move {title} {direction}" at boundaries. Focus returns to the handle after the row remounts.
- Visuals: the dragged row fades to 45 % opacity; before and after show a 3 px accent line at the top or bottom edge of the target row; onto shows an accent tint with a 2 px inset ring. Transitions use `--motion`, so reduced motion disables them. Text selection is suppressed while dragging.
- The Move button, `MoveMenu` and the `'move'` editor mode are removed.
- Not included: auto-scroll when dragging near the viewport edge (documented as a known issue).

**Shipped additions.** Built on top of the list above while the feature was in review: the drop indicator stays visible in forced colors mode, where the accent tint and ring are dropped by the OS palette; a refused drop announces "Cannot move {title} here" instead of failing silently; a release over the dragged row's own row counts as a plain click on the grip and announces nothing; a drag ends when the window loses focus or when a mouse move reports no button held, so a release outside the window cannot leave the session stuck; the grabbing cursor applies tree wide for the duration of a drag, not just on the handle; a collapsed destination expands before the move lands, for keyboard moves and pointer drops alike, so the row is never swallowed; and keyboard moves skip siblings hidden by "hide completed", refusing the move when every neighbour in that direction is hidden.

### 12.3 Expired sign-in link

- Bug: supabase-js swallows the redirect error from an expired or reused magic link and leaves `#error=access_denied&error_code=otp_expired&error_description=…` in the URL; the app never read it, so the sign-in page showed nothing.
- Fix: on auth init, parse `error`, `error_code` and `error_description` from the hash (or search) once, clear the fragment with `history.replaceState`, and show "That sign-in link has expired or was already used. Enter your email to get a new one." for `otp_expired`, otherwise the description. The message survives the initial signed-out event, disappears on sign-in, on "Use a different email", and when a new link is sent. The URL source is injectable for tests.

### 12.4 Manual step added

Run `supabase/migrations/0002_due_time.sql` in the SQL editor before starting the v2 client; the client writes every column of the row, so saves fail until the column exists.

## 13. v3 UI polish (2026-09-11)

Requested after the first merge, before deployment. Decisions were taken with the user in a plan-mode conversation.

### 13.1 Editors

- Only one editor is open at a time anywhere in the app: the toolbar's "New item", an item's "Edit" or an item's "Add item under". The open editor and the pending discard prompt live in a small non-persisted UI store (`src/store/uiStore.ts`); components subscribe to primitive selectors only.
- Pressing the button that opened an editor again closes it. Pressing a different editor button while one is open is a close request for the first; if the close proceeds, the requested editor opens.
- A close request (toggle button, Cancel, Escape, a pointer press outside the editor, or displacement by another editor) closes directly when nothing changed. When the title, description, due date, due time or colour differ from the initial values (title and description compared trimmed), a "Discard changes?" dialog offers Discard and Keep editing. Saving never asks.
- State machine (O open editor, D dirty, P prompt): requestOpen(k) with O empty opens k; same key and clean closes; same key and dirty prompts with no next; other key and clean displaces; other key and dirty prompts with next = k; requestClose closes when clean, prompts when dirty; confirmDiscard opens the remembered next (or none) and clears dirtiness; keepEditing clears the prompt; requests while a prompt is up are ignored.
- The outside-press listener is one `document` `pointerdown` listener in `src/hooks/useClickOutsideEditor.ts`, mounted once in `Shell` (not `TodoTree`) so it is live before the store finishes hydrating; it ignores targets inside the editor form, its own toggle button and any open dialog.
- Presses on a grip handle do not count as outside, and an item whose editor is open cannot be moved by drag or keyboard until the editor closes.
- While any dialog is open the press is ignored outright, whatever the target: the dialog backdrop sits outside the editor, so without that guard pressing it would close the editor behind the dialog or stack a second prompt.
- Known limitation: on touch screens the outside press fires at touch start, so beginning a scroll outside an open editor closes it (or asks, if changed).

### 13.2 Active item and actions

- Pressing an item's title toggles its details and makes it the active item. Exactly one item is active app-wide; only the active item renders its Edit, Add item under and Delete buttons (they are not in the DOM otherwise, so they are never in the tab order when hidden). Other items keep their details open but lose their buttons. Pressing the active item's title again hides its details; it stays active.
- Applies on all screen sizes; the narrow-screen wrap layout keys on the active state.

### 13.3 Dialogs

- `ConfirmDialog` (heading, body, primary with danger or primary tone, optional extra, secondary) replaces the internals of `DeleteDialog`: backdrop, `role="dialog"`, Tab trap, Escape → secondary. Escape and Tab stop propagating; backdrop dismissal requires the pointer press to have started on the backdrop.
- Deleting any item asks first. Leaves: "Delete '{title}'?", "It will be removed from your list.", Delete / Cancel. Parents keep the three-way dialog (delete children too, keep children and move them up, cancel). Section 6's statements about immediate leaf deletion and a native `<dialog>` are superseded.

### 13.4 Row layout, depth shading, outline

- Row order: grip handle, checkbox (adjacent, no gap), title with due time, chevron (only for items with children), actions.
- The whole item is a drag surface: the row, including the title, and the details block. With a mouse a drag begins after 6 px of movement, on touch after a 350 ms hold; the grip starts immediately on both, and the controls inside the row (checkbox, chevron, action buttons, editor fields) keep their own gestures.
- Each item has a `.body` wrapper (row, editor, dialog, details) with a background mixed from the surface towards the ink colour by 2 % per nesting level, capped at level 6, and a 1 px border 16 % further towards ink. The details block is 2 % darker again with a top border. Children sit outside the body in their own outlined items. In dark mode the same mixing lightens deeper levels. Contrast of `--ink-muted` on the deepest details block: 4.55:1 light, 4.62:1 dark (a 3 % step would fail).

### 13.5 Hover text

Every button, checkbox and colour swatch carries a native `title`: Move item, Expand children / Collapse children, Mark complete / Mark incomplete, Show details / Hide details, Edit item, Add item under, Delete item, New item, Sign out, Hide completed items, the editor's submit label and Cancel, the colour name, and each dialog button's label. Accessible names are unchanged.

## 14. v4 interactions (2026-09-12)

Requested after v3, still before the first deployment. Decisions were taken with the user in a plan-mode conversation; the three-way prompt was chosen for every close route, not only outside presses.

### 14.1 Hover reveals the actions

- An item's Edit, Add item under and Delete buttons render while a mouse or pen pointer is over the item's body (the row, its editor and its details block, not its children) and, as before, while the item is selected. Touch pointers never hover, so on a phone the buttons still appear by pressing the title.
- Hovering does not select the item. Exactly one item is selected app-wide; hover is per item and purely visual.
- No buttons appear on rows a drag crosses, and the dragged row hides its own buttons for the length of the drag; they return on the drop, because the pointer is still over the row. A row that moves without a pointer event (a keyboard move) forgets its hover so buttons never stick to a row that is no longer under the pointer.
- The buttons stay out of the DOM when hidden, so they are never in the tab order. Keyboard users select the item (Space on the title) to reach them.
- An item's own dialogs (delete, unsaved changes) are DOM descendants of its body, so hover is not tracked while one is up and is forgotten when it closes; because no enter fires when the dialog unmounts, the body also sets hover on the next mouse move (same guards). State resets keyed on prop changes (position, dialog closing) happen during render, not in effects.

### 14.2 Selection and Enter

- Pressing an item's title selects it (and toggles its details, as before). A pointer press anywhere outside every item body clears the selection: the toolbar, the New item button, the root editor, empty list space and the page all count as "off an item". A press inside an item's own open editor keeps it selected.
- Enter, with nothing focused that has its own Enter behaviour, opens an editor: the New item editor when nothing is selected, otherwise Add item under the selected item (a collapsed parent is expanded first). The editor's title field takes focus.
- Enter on a focused title button opens the child editor of that item and selects it; the details do not toggle (Space still toggles them). Enter on any other control (checkbox, chevron, grip, toolbar buttons, form fields) keeps its native action and never also opens an editor.
- Enter is ignored while any editor, prompt or dialog is open, during a drag, with a modifier held, on key auto-repeat, or during IME composition. The same guards apply on the title button, where a blocked Enter falls through to the ordinary click. The editor swallows repeated Enter presses so a held key cannot submit the editor it just opened.
- The title button keeps its "Show details" / "Hide details" name and hover text: that is still what a click, a tap, a screen-reader activation and Space do; only a physical Enter is routed to the child editor.
- Both global listeners are single document listeners mounted once in `Shell`: `useOutsidePress` (`pointerdown`) and `useEnterToCreate` (`keydown`).

### 14.3 Outside presses (supersedes the outside-press bullets of 13.1)

- A press on any item body is an ordinary interaction (show details, tick, expand, move, select) and never asks to close an open editor, even a changed one. Only presses on chrome and empty space, outside every item body and not on the editor itself or its toggle, request a close.
- Pressing a different item's Edit or Add item under button still displaces the open editor through the store, with the prompt if it has changes.
- Consequences: starting a drag on an item while a clean root editor is open leaves that editor open; a delete dialog can open over an editor of another item.
- Any open dialog still blocks presses outright. Grip presses are still never a dismissal. A mouse or pen press outside that raises the prompt is cancelled (`preventDefault` on the pointerdown) so the following compat mouse events cannot move focus away from the prompt's Save button; touch presses are not cancelled, so scrolling still works.

### 14.4 The unsaved-changes prompt (supersedes "Discard changes?" in 13.1)

- Every close request on an editor with changes (toggle button, Cancel, Escape, outside press, displacement) opens the "Unsaved changes" dialog with three buttons, in order: the editor's submit label (Save changes or Add item, focused by default), Discard, Keep editing.
- Save validates like the form: with an empty title nothing is saved, the prompt closes, the editor stays open with "Title is required" and focus on the title. With a valid title the values are saved, then whatever the close request wanted happens (close, or open the requested editor).
- Discard and Keep editing behave as before. Escape in the prompt is Keep editing, and a held Enter's repeats never press the focused button. Store: `resolvePending` applies the remembered next editor and clears the prompt; `confirmDiscard` is now an alias of it. Save and Discard both go through `resolvePendingEditor` in actions.ts, which resolves the prompt and, when the remembered next editor is a child editor, expands its collapsed parent just as a direct Add would (`revealAdd`); `confirmDiscard` remains a store-level alias of `resolvePending`. An item that unmounts while it is the remembered next editor drops itself from the prompt (`dropNext`), so the prompt then simply closes the editor.

### 14.5 Spacing

The gap between sibling items and between a parent body and its first child is the new `--gap-item` token, 6 px (1.5 × `--space-1`), up from 4 px.
