import { useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ShieldCheck } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export function RecoveryCodeOverlay({
  code,
  title,
  description,
  onContinue,
}: {
  code: string;
  title: string;
  description: string;
  onContinue: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { showToast } = useToast();

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Recovery code copied. Store it somewhere safe.', 'success');
    } catch {
      showToast('Select the code and copy it manually.', 'info');
    }
  }

  function downloadCode() {
    const blob = new Blob([
      'ZEN Z KA DUKAN — PRIVATE RECOVERY CODE\n\n',
      `${code}\n\n`,
      'This code is shown once and is stored only as a secure hash on the server.\n',
      'Keep it private. It is required with your registered mobile number to reset your password.\n',
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zen-z-ka-dukan-recovery-code.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Recovery code downloaded.', 'success');
  }

  return (
    <div className="recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <div className="recovery-card">
        <ShieldCheck size={36} className="gold-text" style={{ margin: '0 auto' }} />
        <div className="eyebrow" style={{ marginTop: 18 }}>Private recovery secret</div>
        <h2 id="recovery-title" className="luxe-title" style={{ fontSize: '2.25rem', marginTop: 12 }}>{title}</h2>
        <p className="muted" style={{ marginTop: 14, lineHeight: 1.7 }}>{description}</p>
        <div className="recovery-code">{code}</div>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn btn-outline btn-small" type="button" onClick={copyCode}><Copy size={14} /> Copy</button>
          <button className="btn btn-outline btn-small" type="button" onClick={downloadCode}><Download size={14} /> Download</button>
        </div>
        <div className="notice" style={{ marginTop: 24, textAlign: 'left', display: 'flex', gap: 10 }}>
          <AlertTriangle size={16} style={{ flex: 'none', marginTop: 2 }} />
          <span>This code is shown once. ZEN Z KA DUKAN stores only its secure hash and cannot reveal it later. No OTP or SMS will be sent.</span>
        </div>
        <label className="checkbox-row" style={{ justifyContent: 'center', marginTop: 22 }}>
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
          I have securely saved this recovery code
        </label>
        <button className="btn btn-gold btn-full" type="button" style={{ marginTop: 18 }} disabled={!acknowledged} onClick={onContinue}>
          <Check size={15} /> Continue
        </button>
      </div>
    </div>
  );
}
