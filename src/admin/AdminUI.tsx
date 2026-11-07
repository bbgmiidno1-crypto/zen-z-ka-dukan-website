import type { ReactNode } from 'react';
import { EmptyState, LoadingBlock } from '@/components/ui';

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-title flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow eyebrow-line">{eyebrow}</div>
        <h1 style={{ marginTop: 12 }}>{title}</h1>
        {description && <p className="muted" style={{ marginTop: 10, maxWidth: 700, fontSize: '.84rem', lineHeight: 1.6 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AdminAsyncState({
  loading,
  error,
  children,
  empty,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Records will appear here as soon as they are created.',
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (loading) return <LoadingBlock label="Loading secure records…" />;
  if (error) return <EmptyState title="Unable to load records" description={error} />;
  if (empty) return <div className="admin-empty">{emptyTitle}<p style={{ marginTop: 8 }}>{emptyDescription}</p></div>;
  return <>{children}</>;
}
