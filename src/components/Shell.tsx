import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { useEnterToCreate } from '../hooks/useEnterToCreate';
import { useOutsidePress } from '../hooks/useOutsidePress';
import { useHydrated } from '../hooks/useHydrated';
import { useSync } from '../hooks/useSync';
import styles from '../App.module.css';

export function Shell() {
  useSync();
  useOutsidePress();
  useEnterToCreate();
  const hydrated = useHydrated();
  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>{hydrated ? <TodoTree /> : <p className={styles.loading}>Loading your list…</p>}</main>
    </div>
  );
}
