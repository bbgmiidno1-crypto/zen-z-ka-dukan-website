import { Link } from 'react-router-dom';

export function Brand({ compact = false, to = '/' }: { compact?: boolean; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="ZEN Z KA DUKAN home">
      <span className="brand-symbol" aria-hidden="true"><span>Z</span></span>
      <span>
        <span className="brand-name">ZEN Z KA DUKAN</span>
        {!compact && <span className="brand-sub">Maison · Atelier · Objects</span>}
      </span>
    </Link>
  );
}
