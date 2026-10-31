import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage({ initialError, onSignedIn }: { initialError?: string; onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (signInError) {
      setError('Credenciales incorrectas o cuenta no confirmada.');
      setBusy(false);
      return;
    }

    await onSignedIn();
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="login__panel">
        <div className="brand brand--light">
          <span className="brand__mark" aria-hidden>
            L
          </span>
          <div>
            <strong>LynkDrive</strong>
            <span>Backoffice</span>
          </div>
        </div>
        <h1>Acceso de administración</h1>
        <p className="muted">Inicia sesión con tu cuenta de LynkDrive. Solo las cuentas con rol admin pueden entrar.</p>
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
