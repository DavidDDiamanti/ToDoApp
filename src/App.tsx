import { AuthGate } from './components/AuthGate';
import { Shell } from './components/Shell';
import { useApplySettings } from './hooks/useApplySettings';

export default function App() {
  // Above AuthGate so the theme and gap apply to the sign-in screen too.
  useApplySettings();

  return (
    <AuthGate>
      <Shell />
    </AuthGate>
  );
}
