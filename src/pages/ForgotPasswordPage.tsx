import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, KeyRound } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { RecoveryCodeOverlay } from '@/components/RecoveryCodeOverlay';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { nextParam, safeNext } from '@/lib/format';

interface RecoveryResponse {
  ok: boolean;
  newRecoveryCode: string;
  message: string;
}

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { showToast } = useToast();
  const next = safeNext(searchParams.get('next'), '/account');
  const [mobile, setMobile] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rotatedCode, setRotatedCode] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api.post<RecoveryResponse>('/api/auth/forgot-password', {
        mobile,
        recoveryCode,
        newPassword,
        confirmPassword,
      });
      await refresh();
      setRotatedCode(response.newRecoveryCode);
      showToast('Password updated successfully.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Password recovery failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AuthShell kicker="Secure recovery" title="Your account, back in your hands.">
        <div className="eyebrow eyebrow-line">Forgot password</div>
        <h1 style={{ marginTop: 14 }}>Reset access.</h1>
        <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
          Enter your registered mobile number and the private recovery code shown when you created your account.
        </p>
        <form className="auth-stack" style={{ marginTop: 28 }} onSubmit={submit}>
          <label>
            <span className="field-label">Registered mobile number</span>
            <input className="input" value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))} required inputMode="numeric" pattern="[6-9][0-9]{9}" autoComplete="tel" placeholder="10-digit mobile number" />
          </label>
          <label>
            <span className="field-label">Recovery code</span>
            <input className="input" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} required autoCapitalize="characters" spellCheck={false} placeholder="ZZKD-XXXX-XXXX-XXXX" />
          </label>
          <label>
            <span className="field-label">New password</span>
            <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters, with a letter and number" />
          </label>
          <label>
            <span className="field-label">Confirm new password</span>
            <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="Repeat your new password" />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-gold btn-full" type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Reset Password'} <ArrowRight size={15} />
          </button>
        </form>
        <div style={{ marginTop: 20 }}>
          <Link className="text-link" to={`/login?next=${nextParam(next)}`}>Return to sign in</Link>
        </div>
        <div className="notice" style={{ marginTop: 26, display: 'flex', gap: 10 }}>
          <KeyRound size={16} style={{ flex: 'none', marginTop: 2 }} />
          <span>No OTP or SMS is used. A new recovery code is generated after a successful reset and shown once.</span>
        </div>
      </AuthShell>
      {rotatedCode && (
        <RecoveryCodeOverlay
          code={rotatedCode}
          title="Save your new recovery code"
          description="Your previous recovery code has been retired. Save this new code — it is shown once and stored only as a secure hash."
          onContinue={() => navigate(`/login?next=${nextParam(next)}`, { replace: true })}
        />
      )}
    </>
  );
}
