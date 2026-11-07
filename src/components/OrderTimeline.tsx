import type { CSSProperties } from 'react';
import { ORDER_STATUSES, type OrderStatus, type OrderStatusEvent } from '@shared/types';
import { formatDateTime, statusIndex } from '@/lib/format';

export function OrderTimeline({ status, history }: { status: OrderStatus; history: OrderStatusEvent[] }) {
  const cancelled = status === 'Cancelled';
  const activeIndex = cancelled ? ORDER_STATUSES.length - 1 : Math.max(0, statusIndex(status));
  const lastRegularIndex = cancelled
    ? Math.max(0, ...history.filter((event) => event.status !== 'Cancelled').map((event) => statusIndex(event.status)))
    : activeIndex;
  const fraction = activeIndex / (ORDER_STATUSES.length - 1);
  const style = {
    width: `${fraction * 88}%`,
    '--timeline-height': `${fraction * 100}%`,
  } as CSSProperties;

  return (
    <div>
      <div className={`timeline ${cancelled ? 'cancelled' : ''}`}>
        <div className="timeline-progress" style={style} />
        {ORDER_STATUSES.map((step, index) => {
          const isCurrent = cancelled ? index === ORDER_STATUSES.length - 1 : index === activeIndex;
          const isDone = cancelled ? index <= lastRegularIndex && index < ORDER_STATUSES.length - 1 : index < activeIndex;
          return (
            <div className={`timeline-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`} key={step}>
              <div className="timeline-dot">{isDone ? '✓' : index + 1}</div>
              <span>{step}</span>
            </div>
          );
        })}
      </div>
      {history.length > 0 && (
        <div className="panel panel-pad" style={{ marginTop: 24 }}>
          <div className="eyebrow">Status history</div>
          <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
            {[...history].reverse().map((event) => (
              <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid rgba(212,175,55,.1)', paddingBottom: 10 }}>
                <div>
                  <div style={{ color: event.status === 'Cancelled' ? '#e5a0a0' : 'var(--gold-soft)', fontSize: '.84rem' }}>{event.status}</div>
                  {event.note && <div className="muted" style={{ fontSize: '.72rem', marginTop: 3 }}>{event.note}</div>}
                </div>
                <div className="muted" style={{ fontSize: '.72rem', whiteSpace: 'nowrap' }}>{formatDateTime(event.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
