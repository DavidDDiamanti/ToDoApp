import { Toolbar } from './components/Toolbar';
import { TodoTree } from './components/TodoTree';
import { useHydrated } from './hooks/useHydrated';
import styles from './App.module.css';

export default function App() {
  const hydrated = useHydrated();
  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>{hydrated ? <TodoTree /> : <p className={styles.loading}>Loading your list…</p>}</main>
    </div>
  );
}
