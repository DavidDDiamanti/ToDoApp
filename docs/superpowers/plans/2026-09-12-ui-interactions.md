# Todo App v4 Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Item buttons appear on hover; Enter opens the New item editor, or Add item under the selected item; pressing off an item deselects it; pressing another item while an editor is open acts normally and never asks; the unsaved-changes prompt also offers Save; the gap between items grows by half.

**Architecture:** No new state beyond a per-item `hovered` flag. The existing UI store gains one action (`resolvePending`). The document `pointerdown` hook is renamed `useOutsidePress` and handles deselection plus the relaxed editor rule. A new document `keydown` hook `useEnterToCreate` routes Enter. A shared `openAddUnder` action replaces the inline logic in the Add button.

**Tech Stack:** unchanged (React 19, TypeScript strict, Zustand 5, Vitest 5, jsdom 30, RTL 16). No new dependencies.

Spec: `docs/superpowers/specs/2026-09-10-todo-app-design.md` section 14 (written in Task 6).

## Decisions (2026-09-12)

- The three-way prompt (submit label, Discard, Keep editing) replaces "Discard changes?" on every close route.
- Hover reveals the buttons and does not select the item. Selection comes from pressing the title. Touch never hovers.
- "Off an item" = outside every item body (`[data-item-body]`): toolbar, New item button, root editor, empty list space, page.
- Enter with focus on a title button opens the child editor of that item and makes it active; Space still toggles details. Enter on any other control keeps its native action. Enter is ignored while an editor, a prompt or a dialog is open, and during a drag.
- Save from the prompt with an empty title keeps the editor open with the "Title is required" error and focus on the title.
- The 1.5x gap applies between siblings and between a parent body and its first child (4 px to 6 px).

## Global Constraints

All constraints from the v1, v2 and v3 plans still apply. Additions and changes:

- Global listeners: `useSync`, `useDragReorder` (window, during a drag), `useOutsidePress` (document `pointerdown`, mounted once in `Shell`), `useEnterToCreate` (document `keydown`, mounted once in `Shell`), `ConfirmDialog` (document `keydown` while a dialog is open).
- Hidden buttons stay out of the DOM (conditional rendering), never hidden by CSS alone.
- Components subscribe to the UI store with primitive selectors only.
- Every new button keeps a non-empty `title`; aria-labels do not change.
- `npm test` and `npm run typecheck` green before each commit.

Task order: 1 → 2 → 3 → 4 → 5 → 6.

---

### Task 1: hover reveals the actions

**Files:** `src/components/TodoItem.tsx`, `src/components/TodoItem.module.css`, `src/components/TodoTree.test.tsx`.

- [ ] Tests first (TodoTree.test, new `describe('hover')`). Body of an item: `screen.getByRole('treeitem', { name: 'Alpha' }).querySelector('[data-item-body]')` (Task 1 adds `data-item-body` to the `.body` div; Task 2 reuses it).
  1. `fireEvent.pointerEnter(body, { pointerType: 'mouse' })` reveals `Edit Alpha`, `Add item under Alpha`, `Delete Alpha`; `useUiStore.getState().activeItemId` stays `null`; the `li` has `data-hovered="true"`.
  2. `fireEvent.pointerLeave(body)` removes the three buttons and the attribute.
  3. `pointerType: 'touch'` reveals nothing.
  4. With `useDragStore.getState().begin('other')` in effect (see `src/dnd/dragStore.ts` for the exact action name), a mouse pointerEnter reveals nothing; call `end()` in cleanup.
  5. Hovering the child body (Beta under Alpha) reveals Beta's buttons and not Alpha's.
  6. A selected item (via `pressTitle`) keeps its buttons after `pointerLeave`.
- [ ] Implement in TodoItem:
  ```tsx
  const [hovered, setHovered] = useState(false);
  // on the .body div
  data-item-body
  onPointerEnter={(e) => {
    // Touch has no hover; a drag in progress must not flash buttons on rows it crosses.
    if (e.pointerType === 'touch' || useDragStore.getState().draggingId !== null) return;
    setHovered(true);
  }}
  onPointerLeave={() => setHovered(false)}
  ```
  `li` gets `data-hovered={hovered ? 'true' : undefined}`; actions render when `isActive || hovered`.
- [ ] CSS: the ≤480 px rule becomes `.item[data-active='true'] > .body > .row, .item[data-hovered='true'] > .body > .row { flex-wrap: wrap; }`.
- [ ] `npm test && npm run typecheck`; commit `feat: reveal item actions on hover`.

### Task 2: outside presses deselect; presses on items leave the editor alone

**Files:** `git mv src/hooks/useClickOutsideEditor.ts src/hooks/useOutsidePress.ts` (and the test file), `src/components/Shell.tsx`, `src/components/EditorFlow.test.tsx`.

- [ ] Tests first. Hook test (`useOutsidePress.test.tsx`): one `pointerdown` listener on document, removed on unmount (keep); with no editor open, a press on `document.body` clears `activeItemId`. EditorFlow (`renderApp` mounts the renamed hook): the two existing outside-press tests use `screen.getByRole('heading', { name: 'Todo' })` as the outside target. New:
  1. Alpha's Edit open (clean): pointerdown + click on Beta's checkbox toggles Beta; the form stays; `openEditor` unchanged.
  2. Alpha's Edit open and dirty: `pressTitle('Beta')` shows Beta's details, `activeItemId === 'b'`, no dialog, form and typed draft intact.
  3. Alpha selected: pointerdown on the heading clears `activeItemId`.
  4. Alpha selected with its own editor open: pointerdown inside the form (Title input) keeps `activeItemId === 'a'`.
  5. Alpha selected, root editor open: pointerdown in the root editor's Title clears `activeItemId`.
  6. With a delete dialog open, a pointerdown on the heading changes neither `activeItemId` nor `openEditor`.
- [ ] Implement:
  ```ts
  export function useOutsidePress(): void {
    useEffect(() => {
      const onDown = (e: PointerEvent) => {
        if (document.querySelector('[role="dialog"]') !== null) return;
        const s = useUiStore.getState();
        const t = e.target;
        const el = t instanceof Element ? t : null;
        const insideItem = el !== null && el.closest('[data-item-body]') !== null;
        if (!insideItem && s.activeItemId !== null) s.setActive(null);
        if (s.openEditor === null) return;
        if (el !== null && el.closest('[data-editor-root], [data-editor-toggle], [data-drag-handle], [data-item-body]') !== null) return;
        s.requestClose();
      };
      document.addEventListener('pointerdown', onDown);
      return () => document.removeEventListener('pointerdown', onDown);
    }, []);
  }
  ```
  Comment in the hook: presses on any item body are ordinary interactions (expand, tick, move), not dismissals; only chrome and empty space ask.
- [ ] Shell imports the renamed hook. `npm test && npm run typecheck`; commit `feat: presses off an item deselect it; presses on items never close the editor`.

### Task 3: Enter opens an editor

**Files:** `src/store/actions.ts`, `src/hooks/useEnterToCreate.ts` (+ `useEnterToCreate.test.tsx`), `src/components/Shell.tsx`, `src/components/TodoItem.tsx`, `src/components/EditorFlow.test.tsx`.

- [ ] Tests first. Hook test: exactly one `keydown` listener on document, same handler removed. EditorFlow (`renderApp` also mounts `useEnterToCreate`; use `fireEvent.keyDown(document.body, { key: 'Enter' })` or `userEvent.keyboard('{Enter}')` after focusing the target):
  1. Nothing selected: Enter opens the "New item" form and the Title input has focus.
  2. Alpha selected: Enter opens "New item under Alpha".
  3. Alpha selected and collapsed (has a child): Enter expands it and opens the child editor.
  4. Root editor open, focus on body: Enter changes nothing (`openEditor` still root, no prompt).
  5. Focus on Beta's checkbox: Enter opens nothing. Focus on the New item button: `keyDown` alone opens nothing (its click still works, covered by Toolbar tests).
  6. Alpha selected, focus on Alpha's title button: Enter opens "New item under Alpha" and Alpha's details do not toggle (`aria-expanded` unchanged on the title button).
  7. Shift+Enter, Ctrl+Enter: nothing. Delete dialog open: Enter opens nothing.
- [ ] `openAddUnder(id)` in actions.ts (import `useUiStore` and `editorKindFor` from `./uiStore`):
  ```ts
  /** Requests the child editor and, only if it really opened, reveals it under a collapsed parent. */
  export function openAddUnder(id: string): void {
    const ui = useUiStore.getState();
    ui.requestOpen({ kind: 'add', id });
    if (editorKindFor(useUiStore.getState().openEditor, id) !== 'add') return;
    const { collapsed, toggleCollapsed } = useTodoStore.getState();
    if (collapsed[id] === true) toggleCollapsed(id);
  }
  ```
  The Add button in TodoItem calls it (drop the inline version).
- [ ] Hook:
  ```ts
  const NATIVE = 'button, input, select, textarea, a, [contenteditable="true"]';
  export function useEnterToCreate(): void {
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (document.querySelector('[role="dialog"]') !== null) return;
        if (useDragStore.getState().draggingId !== null) return;
        const s = useUiStore.getState();
        if (s.openEditor !== null || s.pendingClose !== null) return;
        const t = e.target;
        if (t instanceof Element && t.closest(NATIVE) !== null) return;
        e.preventDefault();
        if (s.activeItemId !== null) openAddUnder(s.activeItemId);
        else s.requestOpen({ kind: 'root' });
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
  }
  ```
- [ ] Title button in TodoItem: `onKeyDown={(e) => { if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); useUiStore.getState().setActive(todo.id); openAddUnder(todo.id); }}` with a comment: preventing the keydown suppresses the synthesized click, so Enter does not also toggle details; Space still does.
- [ ] Shell mounts the hook next to `useOutsidePress`. `npm test && npm run typecheck`; commit `feat: Enter opens a new item, or a child of the selected item`.

### Task 4: the prompt offers Save

**Files:** `src/store/uiStore.ts`, `src/store/uiStore.test.ts`, `src/components/TodoEditor.tsx`, `src/components/TodoEditor.test.tsx`, `src/components/EditorFlow.test.tsx`, `src/components/ConfirmDialog.test.tsx` (dialog name string only, if it references "Discard changes?").

- [ ] Tests first. uiStore.test: `resolvePending` after `requestOpen(edit a)`, dirty, `requestOpen(root)` opens root and clears dirty and the prompt; `resolvePending` with no prompt is a no-op. TodoEditor.test (prompt now named "Unsaved changes"; the submit-labelled button is inside the dialog, so query `within(dialog)`):
  1. Type, Escape, press the dialog's submit-labelled button: `onSave` called with trimmed values; `openEditor` null; no dialog.
  2. Clear the title, Escape, press Save: `onSave` not called; dialog gone; form still there; alert "Title is required"; focus on the title.
  3. Discard and Keep editing still behave as before.
  EditorFlow: outside press (heading) on a dirty "New item" editor, then "Add item" in the dialog adds the todo and closes; Edit Alpha dirty, press Add item under Beta (after hovering or selecting Beta), then "Save changes" saves Alpha and opens "New item under Beta". Replace every `'Discard changes?'` with `'Unsaved changes'`.
- [ ] Store: `resolvePending: () => { const { pendingClose } = get(); if (pendingClose === null) return; set({ openEditor: pendingClose.next, editorDirty: false, pendingClose: null }); }` and `confirmDiscard: () => get().resolvePending()`.
- [ ] TodoEditor: `function trySave(): boolean` holds the current `submit` body minus `closeEditor()` and returns false on an empty title (error set, title focused); `submit` = `if (trySave()) closeEditor()`. Dialog:
  ```tsx
  <ConfirmDialog
    heading="Unsaved changes"
    body="Save them, or discard them?"
    primary={{ label: submitLabel, tone: 'primary', onClick: () => { const ui = useUiStore.getState(); if (trySave()) ui.resolvePending(); else ui.keepEditing(); } }}
    extra={{ label: 'Discard', onClick: () => useUiStore.getState().confirmDiscard() }}
    secondary={{ label: 'Keep editing', onClick: () => { useUiStore.getState().keepEditing(); titleRef.current?.focus(); } }}
  />
  ```
  Note: on the failed-save path `keepEditing` runs after `trySave` focused the title; the dialog's focus-restore cleanup leaves focus where `trySave` put it (the existing "someone moved focus on purpose" guard).
- [ ] `npm test && npm run typecheck`; commit `feat: the unsaved-changes prompt can save`.

### Task 5: gaps 1.5x

**File:** `src/components/TodoItem.module.css`. `.item + .item { margin-top: calc(var(--space-1) * 1.5); }` and `.children { padding: calc(var(--space-1) * 1.5) 0 0 var(--indent); }`. CSS only. Commit `style: widen the gap between items`.

### Task 6: docs and final verification

- [ ] Spec addendum `## 14. v4 interactions (2026-09-12)` with subsections: hover reveal; selection and Enter (routing table); outside presses (supersedes the outside-press bullets of 13.1); the prompt (supersedes "Discard changes?"); spacing.
- [ ] README usage paragraph updated (≤520 words, no dashes). CLAUDE.md listener line updated. This plan's boxes ticked.
- [ ] `npm test && npm run typecheck && npm run build`. Commit `docs: v4 interactions`.
