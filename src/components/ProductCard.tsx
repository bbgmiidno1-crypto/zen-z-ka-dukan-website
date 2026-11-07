import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart } from 'lucide-react';
import type { ProductSummary } from '@shared/types';
import { TiltCard } from '@/components/TiltCard';
import { Price } from '@/components/ui';
import { useWishlist } from '@/context/WishlistContext';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/lib/api';
import { checkoutPath } from '@/lib/format';

const FALLBACK_IMAGE = '/media/seed/editorial/campaign.webp';

export function ProductCard({ product }: { product: ProductSummary }) {
  const wishlist = useWishlist();
  const { showToast } = useToast();
  const wished = wishlist.has(product.id);
  const thumb = product.primaryThumb || product.primaryImage || FALLBACK_IMAGE;
  const full = product.primaryImage || thumb;
  const canBuy = product.available && product.totalStock > 0 && product.defaultVariantId && product.defaultSizeId;
  const badge = product.newArrival ? 'New Arrival' : product.bestSeller ? 'Best Seller' : product.featured ? 'Featured' : null;

  return (
    <TiltCard className="h-full">
      <article className={`product-card ${product.available ? '' : 'unavailable'}`} data-water-drop>
        <Link to={`/product/${product.slug}`} className="product-media" aria-label={`View ${product.name}`}>
          <img
            src={thumb}
            srcSet={`${thumb} 560w, ${full} 1000w`}
            sizes="(max-width: 640px) 46vw, (max-width: 1180px) 30vw, 286px"
            width="800"
            height="1000"
            loading="lazy"
            decoding="async"
            alt={product.name}
          />
          <div className="product-badges">
            {badge && <span className="badge badge-dark">{badge}</span>}
            {!product.available || product.totalStock === 0 ? <span className="badge badge-danger">Unavailable</span> : null}
            {product.discountPercent > 0 && <span className="badge badge-dark">−{product.discountPercent}%</span>}
          </div>
        </Link>
        <button
          type="button"
          className="product-wish"
          data-no-water-drop
          aria-pressed={wished}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          onClick={async (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
              const nowSaved = await wishlist.toggle(product.id);
              showToast(nowSaved ? `${product.name} saved to your wishlist.` : `${product.name} removed from your wishlist.`, 'success');
            } catch (error) {
              showToast(errorMessage(error), 'error');
            }
          }}
        >
          <Heart size={17} strokeWidth={1.6} />
        </button>
        <div className="product-info">
          <span className="product-category">{product.categoryName}</span>
          <Link to={`/product/${product.slug}`} className="product-name">{product.name}</Link>
          <Price pricePaise={product.pricePaise} originalPricePaise={product.originalPricePaise} discountPercent={product.discountPercent} />
          {product.totalStock > 0 && product.totalStock <= 3 && <div className="stock-note">Only {product.totalStock} left in the atelier</div>}
          <div className="product-actions">
            <Link to={`/product/${product.slug}`} className="btn btn-outline">View Piece</Link>
            {canBuy ? (
              <Link
                to={checkoutPath(product.slug, product.defaultVariantId!, product.defaultSizeId!, 1)}
                className="btn btn-gold"
                aria-label={`Buy ${product.name} now`}
              >
                Buy Now <ArrowUpRight size={14} />
              </Link>
            ) : (
              <button className="btn btn-outline" type="button" disabled>Unavailable</button>
            )}
          </div>
        </div>
      </article>
    </TiltCard>
  );
}
