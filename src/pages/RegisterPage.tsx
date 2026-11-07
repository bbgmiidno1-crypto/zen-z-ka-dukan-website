import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { RecoveryCodeOverlay } from '@/components/RecoveryCodeOverlay';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { nextParam, safeNext } from '@/lib/format';

interface RegisterResponse {
  recoveryCode: string;
}

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { customer, loading: authLoading, refresh } = useAuth();
  const { showToast } = useToast();
  const next = safeNext(searchParams.get('next'), '/account');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  useEffect(() => {
    if (!authLoading && customer && !recoveryCode) navigate(next, { replace: true });
  }, [authLoading, customer, navigate, next, recoveryCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api.post<RegisterResponse>('/api/auth/register', { mobile, password, confirmPassword });
      await refresh();
      setRecoveryCode(response.recoveryCode);
      showToast('Account created. Save your recovery code now.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Unable to create your account.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthShell kicker="New client" title="A private account, made simple.">
        <div className="eyebrow eyebrow-line">Create account</div>
        <h1 style={{ marginTop: 14 }}>Join the house.</h1>
        <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
          One mobile number, one secure password, and a unique recovery code. No OTP, no SMS, no unnecessary steps.
        </p>
        <form className="auth-stack" style={{ marginTop: 28 }} onSubmit={submit}>
          <label>
            <span className="field-label">Mobile number</span>
            <input className="input" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} required inputMode="numeric" pattern="[6-9][0-9]{9}" autoComplete="tel" placeholder="10-digit mobile number" />
          </label>
          <label>
            <span className="field-label">Password</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters, with a letter and number" />
          </label>
          <label>
            <span className="field-label">Confirm password</span>
            <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="Repeat your password" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-gold btn-full" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create Account'} <ArrowRight size={15} />
          </button>
        </form>
        <div style={{ marginTop: 20 }}>
          <span className="muted" style={{ fontSize: '.78rem' }}>Already a client? </span>
          <Link className="text-link" to={`/login?next=${nextParam(next)}`}>Sign in</Link>
        </div>
        <div className="notice" style={{ marginTop: 26, display: 'flex', gap: 10 }}>
          <LockKeyhole size={16} style={{ flex: 'none', marginTop: 2 }} />
          <span>Your password and recovery code are never stored in plain text. The recovery code is shown once after registration.</span>
        </div>
      </AuthShell>
      {recoveryCode && (
        <RecoveryCodeOverlay
          code={recoveryCode}
          title="Save your recovery code"
          description="This unique secret belongs to your account. You will need it with your registered mobile number if you ever forget your password."
          onContinue={() => navigate(next, { replace: true })}
        />
      )}
    </>
  );
}
