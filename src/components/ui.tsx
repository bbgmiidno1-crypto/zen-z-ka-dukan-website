import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { OrderStatus } from '@shared/types';
import { formatINR } from '@/lib/format';

export function LoadingBlock({ label = 'Loading the atelier…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <div style={{ display: 'grid', placeItems: 'center', gap: 14 }}>
        <div className="spinner" />
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p style={{ margin: '10px 0 22px' }}>{description}</p>
      {action}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head reveal">
      <div>
        <div className="eyebrow eyebrow-line">{eyebrow}</div>
        <h2 className="luxe-title" style={{ marginTop: 12 }}>{title}</h2>
        {description && <p className="luxe-subtitle" style={{ marginTop: 10, maxWidth: 620 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const className = status === 'Cancelled' ? 'cancelled' : status === 'Delivered' ? 'delivered' : '';
  return <span className={`status-pill ${className}`}>{status}</span>;
}

export function Price({
  pricePaise,
  originalPricePaise,
  discountPercent,
}: {
  pricePaise: number;
  originalPricePaise: number;
  discountPercent: number;
}) {
  return (
    <div className="product-price-row">
      <span className="price">{formatINR(pricePaise)}</span>
      {originalPricePaise > pricePaise && <span className="price-old">{formatINR(originalPricePaise)}</span>}
      {discountPercent > 0 && <span className="price-off">{discountPercent}% off</span>}
    </div>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <div className="crumbs">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 && <span style={{ margin: '0 8px', color: '#5b5750' }}>/</span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
        </span>
      ))}
    </div>
  );
}
