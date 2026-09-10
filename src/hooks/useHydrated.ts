import { useEffect, useState } from 'react';
import { useTodoStore } from '../store/todoStore';

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useTodoStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useTodoStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useTodoStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
