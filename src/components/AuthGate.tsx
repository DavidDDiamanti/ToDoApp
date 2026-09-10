import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useAuthStore, type createAuthStore } from '../store/authStore';
import styles from './AuthGate.module.css';

interface Props {
  store?: ReturnType<typeof createAuthStore>;
  children: ReactNode;
}

export function AuthGate({ store = useAuthStore, children }: Props) {
  const status = store((s) => s.status);
  const pendingEmail = store((s) => s.pendingEmail);
  const error = store((s) => s.error);
  const init = store((s) => s.init);
  const sendMagicLink = store((s) => s.sendMagicLink);
  const verifyCode = store((s) => s.verifyCode);
  const id = useId();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    await sendMagicLink(email.trim());
    setSent(true);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    await verifyCode(code);
  }

  if (status === 'loading') return <p className={styles.center}>Checking your session…</p>;
  if (status === 'signed_in') return <>{children}</>;

  return (
    <div className={styles.center}>
      <div className={styles.card}>
        <h1 className={styles.brand}>Todo</h1>
        {!sent ? (
          <form onSubmit={onSend} className={styles.form}>
            <label htmlFor={`${id}-email`} className={styles.label}>Email</label>
            <input id={`${id}-email`} type="email" required autoComplete="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className={styles.primary}>Send sign-in link</button>
          </form>
        ) : (
          <form onSubmit={onVerify} className={styles.form}>
            <p className={styles.hint}>Check your email at {pendingEmail}. Open the link on this device, or enter the code from the message.</p>
            <label htmlFor={`${id}-code`} className={styles.label}>6-digit code</label>
            <input id={`${id}-code`} inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className={styles.primary}>Sign in with code</button>
            <button type="button" className={styles.link} onClick={() => setSent(false)}>Use a different email</button>
          </form>
        )}
        {error !== null ? <p role="alert" className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
