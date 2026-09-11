import { AuthGate } from './components/AuthGate';
import { Shell } from './components/Shell';

export default function App() {
  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}
