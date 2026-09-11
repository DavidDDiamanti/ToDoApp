import { describe, expect, it } from 'vitest';
import { createDragStore } from './dragStore';

describe('dragStore', () => {
  it('does not notify subscribers when setIndicator receives an equal value', () => {
    const store = createDragStore();
    store.getState().setIndicator({ targetId: 'a', zone: 'before' });
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.getState().setIndicator({ targetId: 'a', zone: 'before' });
    expect(calls).toBe(0);
    unsubscribe();
  });

  it('notifies subscribers when setIndicator receives a different value', () => {
    const store = createDragStore();
    store.getState().setIndicator({ targetId: 'a', zone: 'before' });
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.getState().setIndicator({ targetId: 'a', zone: 'after' });
    expect(calls).toBe(1);
    unsubscribe();
  });

  it('end clears both draggingId and indicator', () => {
    const store = createDragStore();
    store.getState().start('a');
    store.getState().setIndicator({ targetId: 'b', zone: 'inside' });
    store.getState().end();
    expect(store.getState().draggingId).toBeNull();
    expect(store.getState().indicator).toBeNull();
  });

  it('announce bumps seq even for the same text', () => {
    const store = createDragStore();
    store.getState().announce('Moved a');
    const first = store.getState().announcement;
    store.getState().announce('Moved a');
    const second = store.getState().announcement;
    expect(second.seq).toBe(first.seq + 1);
    expect(second.text).toBe('Moved a');
  });

  it('requestFocus sets focusId', () => {
    const store = createDragStore();
    store.getState().requestFocus('a');
    expect(store.getState().focusId).toBe('a');
    store.getState().requestFocus(null);
    expect(store.getState().focusId).toBeNull();
  });
});
