import { describe, expect, it } from 'vitest';
import { createUiStore, editorKindFor, sameKey, type EditorKey } from './uiStore';

const root: EditorKey = { kind: 'root' };
const editAlpha: EditorKey = { kind: 'edit', id: 'alpha' };
const editBeta: EditorKey = { kind: 'edit', id: 'beta' };
const addAlpha: EditorKey = { kind: 'add', id: 'alpha' };

describe('uiStore', () => {
  it('requestOpen opens when no editor is open', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    expect(store.getState().openEditor).toEqual(editAlpha);
    expect(store.getState().editorDirty).toBe(false);
  });

  it('requestOpen on the same clean key closes the editor', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().requestOpen(editAlpha);
    expect(store.getState().openEditor).toBeNull();
  });

  it('requestOpen on the same dirty key prompts with no next', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editAlpha);
    expect(store.getState().pendingClose).toEqual({ next: null });
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('requestOpen on a different clean key displaces the current editor', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().requestOpen(editBeta);
    expect(store.getState().openEditor).toEqual(editBeta);
    expect(store.getState().editorDirty).toBe(false);
  });

  it('requestOpen on a different dirty key prompts with that key as next', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editBeta);
    expect(store.getState().pendingClose).toEqual({ next: editBeta });
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('requestOpen is ignored while a discard prompt is pending', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editBeta);
    store.getState().requestOpen(addAlpha);
    expect(store.getState().pendingClose).toEqual({ next: editBeta });
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('requestClose closes a clean editor', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().requestClose();
    expect(store.getState().openEditor).toBeNull();
  });

  it('requestClose on a dirty editor prompts with no next', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestClose();
    expect(store.getState().pendingClose).toEqual({ next: null });
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('requestClose is a no-op without an open editor', () => {
    const store = createUiStore();
    store.getState().requestClose();
    expect(store.getState().openEditor).toBeNull();
    expect(store.getState().pendingClose).toBeNull();
  });

  it('requestClose is a no-op while a discard prompt is pending', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestClose();
    store.getState().requestClose();
    expect(store.getState().pendingClose).toEqual({ next: null });
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('confirmDiscard is a no-op without a pending prompt', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().confirmDiscard();
    expect(store.getState().openEditor).toEqual(editAlpha);
  });

  it('confirmDiscard opens the pending next editor and clears dirtiness', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editBeta);
    store.getState().confirmDiscard();
    expect(store.getState().openEditor).toEqual(editBeta);
    expect(store.getState().editorDirty).toBe(false);
    expect(store.getState().pendingClose).toBeNull();
  });

  it('confirmDiscard with no pending next closes the editor', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestClose();
    store.getState().confirmDiscard();
    expect(store.getState().openEditor).toBeNull();
    expect(store.getState().editorDirty).toBe(false);
    expect(store.getState().pendingClose).toBeNull();
  });

  it('keepEditing clears the prompt but keeps the open editor and its dirtiness', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestClose();
    store.getState().keepEditing();
    expect(store.getState().pendingClose).toBeNull();
    expect(store.getState().openEditor).toEqual(editAlpha);
    expect(store.getState().editorDirty).toBe(true);
  });

  it('setDirty is ignored without an open editor and does not notify subscribers', () => {
    const store = createUiStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.getState().setDirty(true);
    unsubscribe();
    expect(store.getState().editorDirty).toBe(false);
    expect(notifications).toBe(0);
  });

  it('setDirty does not notify subscribers when the value is unchanged', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.getState().setDirty(false);
    unsubscribe();
    expect(store.getState().editorDirty).toBe(false);
    expect(notifications).toBe(0);
  });

  it('setDirty updates dirtiness when there is an open editor and the value changes', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    expect(store.getState().editorDirty).toBe(true);
  });

  it('closeEditor clears the editor, dirtiness and any pending prompt', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editBeta);
    store.getState().closeEditor();
    expect(store.getState().openEditor).toBeNull();
    expect(store.getState().editorDirty).toBe(false);
    expect(store.getState().pendingClose).toBeNull();
  });

  it('setActive sets the active item id', () => {
    const store = createUiStore();
    store.getState().setActive('alpha');
    expect(store.getState().activeItemId).toBe('alpha');
    store.getState().setActive(null);
    expect(store.getState().activeItemId).toBeNull();
  });

  it('reset restores default state', () => {
    const store = createUiStore();
    store.getState().setActive('alpha');
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(editBeta);
    store.getState().reset();
    expect(store.getState()).toMatchObject({
      activeItemId: null,
      openEditor: null,
      editorDirty: false,
      pendingClose: null,
    });
  });

  it('sameKey distinguishes root, edit and add keys', () => {
    expect(sameKey(root, root)).toBe(true);
    expect(sameKey(editAlpha, editAlpha)).toBe(true);
    expect(sameKey(editAlpha, { ...editAlpha })).toBe(true);
    expect(sameKey(editAlpha, editBeta)).toBe(false);
    expect(sameKey(editAlpha, addAlpha)).toBe(false);
    expect(sameKey(root, editAlpha)).toBe(false);
  });

  it('editorKindFor distinguishes root, edit and add for a given id', () => {
    expect(editorKindFor(null, 'alpha')).toBeNull();
    expect(editorKindFor(root, 'alpha')).toBeNull();
    expect(editorKindFor(editAlpha, 'alpha')).toBe('edit');
    expect(editorKindFor(editAlpha, 'beta')).toBeNull();
    expect(editorKindFor(addAlpha, 'alpha')).toBe('add');
  });
});

describe('resolvePending', () => {
  it('opens the pending next editor and clears dirtiness and the prompt', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestOpen(root);
    store.getState().resolvePending();
    expect(store.getState().openEditor).toEqual(root);
    expect(store.getState().editorDirty).toBe(false);
    expect(store.getState().pendingClose).toBeNull();
  });

  it('closes the editor when the prompt has no next', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().requestClose();
    store.getState().resolvePending();
    expect(store.getState().openEditor).toBeNull();
    expect(store.getState().editorDirty).toBe(false);
    expect(store.getState().pendingClose).toBeNull();
  });

  it('is a no-op without a pending prompt', () => {
    const store = createUiStore();
    store.getState().requestOpen(editAlpha);
    store.getState().setDirty(true);
    store.getState().resolvePending();
    expect(store.getState().openEditor).toEqual(editAlpha);
    expect(store.getState().editorDirty).toBe(true);
    expect(store.getState().pendingClose).toBeNull();
  });
});
