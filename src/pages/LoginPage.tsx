import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { nextParam, safeNext } from '@/lib/format';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { customer, loading: authLoading, refresh } = useAuth();
  const { showToast } = useToast();
  const next = safeNext(searchParams.get('next'), '/account');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && customer) navigate(next, { replace: true });
  }, [authLoading, customer, navigate, next]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/login', { mobile, password });
      await refresh();
      showToast('Welcome back to ZEN Z KA DUKAN.', 'success');
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="Client access" title="Enter the private salon.">
      <div className="eyebrow eyebrow-line">Sign in</div>
      <h1 style={{ marginTop: 14 }}>Welcome back.</h1>
      <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>Use your registered mobile number and password. No OTP, no SMS verification.</p>
      <form className="auth-stack" style={{ marginTop: 30 }} onSubmit={submit}>
        <label>
          <span className="field-label">Mobile number</span>
          <input className="input" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} required inputMode="numeric" pattern="[6-9][0-9]{9}" autoComplete="tel" placeholder="10-digit mobile number" />
        </label>
        <label>
          <span className="field-label">Password</span>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" placeholder="Your password" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-gold btn-full" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'} <ArrowRight size={15} />
        </button>
      </form>
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginTop: 22 }}>
        <Link className="text-link" to="/forgot-password">Forgot password?</Link>
        <Link className="text-link" to={`/register?next=${nextParam(next)}`}>Create an account</Link>
      </div>
      <div className="notice" style={{ marginTop: 30, display: 'flex', gap: 10 }}>
        <ShieldCheck size={16} style={{ flex: 'none', marginTop: 2 }} />
        <span><LockKeyhole size={13} className="inline" /> Passwords are securely hashed. Sessions use HTTP-only cookies and server-side authorization.</span>
      </div>
    </AuthShell>
  );
}
