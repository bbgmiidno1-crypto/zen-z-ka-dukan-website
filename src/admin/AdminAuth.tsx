import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import type { AdminUser, SessionResponse } from '@shared/types';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage, setPreviewAdminSession } from '@/lib/api';

interface AdminAuthResponse {
  admin: AdminUser;
  previewHeaderAvailable?: boolean;
  previewSessionToken?: string;
}

async function establishAdminSession(
  result: AdminAuthResponse,
  username: string,
  password: string,
  refresh: () => Promise<SessionResponse>,
): Promise<SessionResponse> {
  const first = await refresh();
  if (first.admin || !result.previewHeaderAvailable || !window.isSecureContext) return first;

  // Some embedded preview proxies strip every cookie. Only after a successful
  // normal sign-in fails to establish a cookie, request a short-lived session
  // that lives in this page's memory. The server must explicitly opt in.
  const fallback = await api.post<AdminAuthResponse>(
    '/api/admin/login',
    { username, password },
    { 'X-ZZKD-Admin-Session-Mode': 'memory' },
  );
  if (!fallback.previewSessionToken) return first;
  setPreviewAdminSession(fallback.previewSessionToken);
  return refresh();
}

export function AdminLogin() {
  const navigate = useNavigate();
  const { adminConfigured, refresh } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionBlocked, setSessionBlocked] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSessionBlocked(false);
    setPreviewAdminSession(null);
    try {
      const result = await api.post<AdminAuthResponse>('/api/admin/login', { username, password });
      const session = await establishAdminSession(result, username, password, refresh);
      if (!session.admin) {
        setPreviewAdminSession(null);
        setSessionBlocked(true);
        setError('Your credentials were accepted, but the secure session could not be kept. Open the site in a new tab and try again.');
        return;
      }
      showToast('Administrator session verified.', 'success');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Administrator sign-in failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-app admin-login-shell">
      <div className="admin-login-card">
        <div className="flex items-center justify-between gap-4">
          <Brand compact to="/" />
          <span className="admin-badge">Restricted</span>
        </div>
        <div style={{ marginTop: 36 }}>
          <ShieldCheck size={32} className="gold-text" />
          <div className="eyebrow" style={{ marginTop: 18 }}>Secure administrator access</div>
          <h1 style={{ marginTop: 12 }}>Admin Console</h1>
          <p className="muted" style={{ marginTop: 12, lineHeight: 1.7, fontSize: '.82rem' }}>
            This interface is protected by server-side sessions. Dashboard data is never served without administrator authentication.
          </p>
        </div>
        <form className="auth-stack" style={{ marginTop: 28 }} onSubmit={submit}>
          <label>
            <span className="field-label">Administrator username</span>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" />
          </label>
          <label>
            <span className="field-label">Password</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-gold btn-full" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Enter console'} <ArrowRight size={15} /></button>
        </form>
        {sessionBlocked && (
          <p style={{ marginTop: 16 }}><a className="text-link" href="/admin/login" target="_blank" rel="noopener noreferrer">Open administrator sign-in in a new tab ↗</a></p>
        )}
        {!adminConfigured && (
          <p className="muted" style={{ marginTop: 20, fontSize: '.75rem' }}>
            First time here? <Link className="text-link" to="/admin/setup">Initialize administrator access</Link>
          </p>
        )}
        <Link className="btn btn-ghost btn-small" to="/" style={{ marginTop: 18 }}>Return to storefront</Link>
      </div>
    </div>
  );
}

export function AdminSetup() {
  const navigate = useNavigate();
  const { refresh, setAdminConfigured } = useAuth();
  const { showToast } = useToast();
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createdWithoutSession, setCreatedWithoutSession] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPreviewAdminSession(null);
    let accountCreated = false;
    try {
      const result = await api.post<AdminAuthResponse>('/api/admin/setup', { bootstrapToken, username, password, confirmPassword });
      accountCreated = true;
      setAdminConfigured(true);
      const session = await establishAdminSession(result, username, password, refresh);
      if (!session.admin) {
        setPreviewAdminSession(null);
        setCreatedWithoutSession(true);
        setError('Your administrator account was created, but the secure session could not be kept. Open sign-in in a new tab and use the username and password you just chose.');
        return;
      }
      showToast('Administrator access configured securely.', 'success');
      navigate('/admin', { replace: true });
    } catch (err) {
      setPreviewAdminSession(null);
      if (accountCreated) {
        setCreatedWithoutSession(true);
        setError('Your administrator account was created, but sign-in could not be completed. Open sign-in in a new tab and use the credentials you just chose.');
      } else {
        setError(errorMessage(err, 'Administrator setup failed.'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-app admin-login-shell">
      <div className="admin-login-card">
        <div className="flex items-center justify-between gap-4">
          <Brand compact to="/" />
          <span className="admin-badge">First run</span>
        </div>
        <div style={{ marginTop: 30 }}>
          <KeyRound size={32} className="gold-text" />
          <div className="eyebrow" style={{ marginTop: 18 }}>One-time initialization</div>
          <h1 style={{ marginTop: 12 }}>Create Admin</h1>
          <p className="muted" style={{ marginTop: 12, lineHeight: 1.7, fontSize: '.82rem' }}>
            No public administrator password is hardcoded. Enter the private bootstrap token stored at <strong style={{ color: 'var(--gold)' }}>data/admin-setup.txt</strong> in your workspace, then choose your own credentials.
          </p>
        </div>
        <form className="auth-stack" style={{ marginTop: 24 }} onSubmit={submit}>
          <label>
            <span className="field-label">Private bootstrap token</span>
            <input className="input" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value.trim())} required autoComplete="off" spellCheck={false} />
          </label>
          <label>
            <span className="field-label">Administrator username</span>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={50} pattern={'[A-Za-z0-9_.\\-]+'} autoComplete="username" />
          </label>
          <label>
            <span className="field-label">Password</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" placeholder="At least 8 characters, with a letter and number" />
          </label>
          <label>
            <span className="field-label">Confirm password</span>
            <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-gold btn-full" type="submit" disabled={busy || createdWithoutSession}>{busy ? 'Securing…' : 'Create administrator'} <ArrowRight size={15} /></button>
        </form>
        {createdWithoutSession && (
          <p style={{ marginTop: 16 }}><a className="text-link" href="/admin/login" target="_blank" rel="noopener noreferrer">Open administrator sign-in in a new tab ↗</a></p>
        )}
        <div className="notice" style={{ marginTop: 20, fontSize: '.72rem' }}>
          The token file is server-side workspace storage and is not served under /media or exposed by the API.
        </div>
      </div>
    </div>
  );
}
