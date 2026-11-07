import { FALLBACK_IMAGE } from '@/lib/urls';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/Brand';

export function AuthShell({ children, kicker, title }: { children: ReactNode; kicker: string; title: string }) {
  return (
    <div className="auth-shell">
      <aside className="auth-art">
        <img src={FALLBACK_IMAGE} alt="ZEN Z KA DUKAN black and gold editorial" width="1200" height="1500" />
        <div className="auth-art-copy">
          <div className="eyebrow eyebrow-line">{kicker}</div>
          <h2 className="luxe-title" style={{ marginTop: 16 }}>{title}</h2>
          <p className="luxe-subtitle" style={{ marginTop: 18, maxWidth: 460 }}>
            A private client space for considered purchases, saved addresses and complete order visibility.
          </p>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <div className="auth-card">
          <div className="flex items-center justify-between" style={{ marginBottom: 36 }}>
            <Brand compact />
            <Link to="/" className="btn btn-ghost btn-small"><ArrowLeft size={14} /> Home</Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
