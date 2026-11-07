import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ProductSummary } from '@shared/types';
import { LiquidRail } from '@/components/LiquidRail';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, SectionHeading } from '@/components/ui';

export function ProductRail({
  id,
  eyebrow,
  title,
  description,
  products,
  direction = 'left',
  viewAllTo = '/shop',
  liquid = false,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  products: ProductSummary[];
  direction?: 'left' | 'right';
  viewAllTo?: string;
  /** Continuous right-to-left floating gallery (home page rails). */
  liquid?: boolean;
}) {
  return (
    <section id={id} className="scroll-rail section-tight" data-direction={direction}>
      <div className="container-luxe">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          action={<Link to={viewAllTo} className="text-link">View all <ArrowUpRight size={13} className="inline" /></Link>}
        />
      </div>
      {liquid ? (
        <div className="container-luxe liquid-bleed-wrap">
          <LiquidRail className="liquid-bleed" speed={direction === 'right' ? 30 : 36} label={title}>
            {products.map((product) => (
              <div className="liquid-card" key={product.id}>
                <ProductCard product={product} />
              </div>
            ))}
          </LiquidRail>
        </div>
      ) : (
      <div className="container-luxe">
        <div className="rail-viewport">
          {products.length ? (
            <div className="rail-track">
              {products.map((product) => (
                <div className="rail-card reveal" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="The edit is being prepared" description="New pieces will appear here as soon as the atelier publishes them." action={<Link className="btn btn-outline" to="/shop">Explore all pieces</Link>} />
          )}
        </div>
      </div>
      )}
    </section>
  );
}
