import { Toolbar } from './Toolbar';
import { TodoTree } from './TodoTree';
import { useOutsidePress } from '../hooks/useOutsidePress';
import { useHydrated } from '../hooks/useHydrated';
import { useSync } from '../hooks/useSync';
import styles from '../App.module.css';

export function Shell() {
  useSync();
  useOutsidePress();
  const hydrated = useHydrated();
  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>{hydrated ? <TodoTree /> : <p className={styles.loading}>Loading your list…</p>}</main>
    </div>
  );
}
