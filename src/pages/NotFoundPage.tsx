import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="container-luxe" style={{ paddingTop: 160, paddingBottom: 120 }}>
      <EmptyState
        title="This edit does not exist"
        description="The page you requested has left the atelier. Return to the collection and discover something considered."
        action={<div className="flex justify-center gap-3 flex-wrap"><Link className="btn btn-gold" to="/">Return home</Link><Link className="btn btn-outline" to="/shop">Explore pieces <ArrowUpRight size={14} /></Link></div>}
      />
      <div className="brand-word" style={{ marginTop: 70, fontSize: 'clamp(2rem,9vw,9rem)', opacity: 0.12 }} aria-hidden="true">404</div>
    </div>
  );
}
