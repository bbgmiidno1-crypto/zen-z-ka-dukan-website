import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, Heart, PackageCheck, RotateCw, ShieldCheck, Truck } from 'lucide-react';
import type { PaginatedProducts, ProductDetail, ProductSummary } from '@shared/types';
import { ProductCard } from '@/components/ProductCard';
import { Product360Viewer } from '@/components/Product360Viewer';
import { useWishlist } from '@/context/WishlistContext';
import { useToast } from '@/context/ToastContext';
import { TiltCard } from '@/components/TiltCard';
import { Breadcrumb, EmptyState, LoadingBlock, Price } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { checkoutPath, clamp, formatINR } from '@/lib/format';

const FALLBACK_IMAGE = '/media/seed/editorial/campaign.webp';

export default function ProductPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [related, setRelated] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variantId, setVariantId] = useState<number | null>(null);
  const [sizeId, setSizeId] = useState<number | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [viewerOpen, setViewerOpen] = useState(false);
  const wishlist = useWishlist();
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setProduct(null);
    api.get<ProductDetail>(`/api/products/${slug}`)
      .then((detail) => {
        if (!active) return;
        setProduct(detail);
        const requestedVariant = Number(searchParams.get('variant'));
        const requestedSize = Number(searchParams.get('size'));
        const variant = detail.variants.find((item) => item.id === requestedVariant) || detail.variants[0] || null;
        const chosenVariantId = variant?.id ?? null;
        const stockFor = (id: number) => chosenVariantId ? detail.inventory[`${chosenVariantId}:${id}`] || 0 : 0;
        const size = detail.sizes.find((item) => item.id === requestedSize && stockFor(item.id) > 0)
          || detail.sizes.find((item) => stockFor(item.id) > 0)
          || detail.sizes[0]
          || null;
        setVariantId(chosenVariantId);
        setSizeId(size?.id ?? null);
        setQuantity(clamp(Number(searchParams.get('qty')) || 1, 1, 5));
        setGalleryIndex(0);
      })
      .catch((err) => { if (active) setError(errorMessage(err, 'This piece could not be found.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, searchParams]);

  useEffect(() => {
    if (!product?.categorySlug) return;
    let active = true;
    api.get<PaginatedProducts>('/api/products', { category: product.categorySlug, limit: 5, sort: 'editorial' })
      .then((data) => {
        if (active) setRelated(data.products.filter((item) => item.id !== product.id).slice(0, 4));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [product]);

  const variant = product?.variants.find((item) => item.id === variantId) || null;
  const size = product?.sizes.find((item) => item.id === sizeId) || null;
  const stock = product && variantId && sizeId ? product.inventory[`${variantId}:${sizeId}`] || 0 : 0;
  const maxQuantity = Math.min(5, stock);
  const galleryImages = useMemo(() => (variant?.images.length ? variant.images : product?.images || []), [variant, product]);
  const activeImage = galleryImages[galleryIndex % Math.max(1, galleryImages.length)];

  useEffect(() => {
    if (maxQuantity > 0) setQuantity((current) => clamp(current || 1, 1, maxQuantity));
  }, [maxQuantity]);

  function chooseVariant(id: number) {
    if (!product) return;
    setVariantId(id);
    const availableSize = product.sizes.find((item) => (product.inventory[`${id}:${item.id}`] || 0) > 0) || product.sizes[0] || null;
    setSizeId(availableSize?.id ?? null);
    setGalleryIndex(0);
  }

  if (error) {
    return (
      <div className="container-luxe" style={{ paddingTop: 150, paddingBottom: 100 }}>
        <EmptyState title="Piece not found" description={error} action={<Link className="btn btn-gold" to="/shop">Return to the edit</Link>} />
      </div>
    );
  }
  if (loading || !product) return <LoadingBlock label="Presenting the piece…" />;

  const canBuy = product.available && variant && size && stock >= quantity;
  const buyPath = canBuy ? checkoutPath(product.slug, variant.id, size.id, quantity) : '#';

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 36 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: product.categoryName, to: product.categorySlug ? `/shop?category=${product.categorySlug}` : '/shop' }, { label: product.name }]} />
        </div>
      </section>

      <section className="section-tight" style={{ paddingTop: 42 }}>
        <div className="container-luxe">
          <div className="product-detail-grid">
            <div>
              <TiltCard>
                <div className="gallery-main">
                  {activeImage ? (
                    <img
                      key={activeImage.path}
                      src={activeImage.thumbPath}
                      srcSet={`${activeImage.thumbPath} 560w, ${activeImage.path} 1000w`}
                      sizes="(max-width: 900px) 92vw, 52vw"
                      alt={`${product.name} — ${variant?.name || 'gallery view'}`}
                      width="1000"
                      height="1250"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : (
                    <img src={FALLBACK_IMAGE} alt={product.name} width="1000" height="1250" />
                  )}
                </div>
              </TiltCard>
              <button
                className="btn btn-outline btn-full product-360-cta"
                type="button"
                onClick={() => setViewerOpen(true)}
                aria-haspopup="dialog"
              >
                <RotateCw size={16} /> 360° VIEW
                {variant?.spin?.images.length ? <span className="gold-text" style={{ marginLeft: 8, fontSize: '.62rem', letterSpacing: '.1em' }}>{variant.spin.images.length} ANGLES</span> : null}
              </button>
              {galleryImages.length > 1 && (
                <div className="gallery-thumbs">
                  {galleryImages.map((image, index) => (
                    <button
                      type="button"
                      className={`gallery-thumb ${index === galleryIndex ? 'active' : ''}`}
                      key={image.id}
                      onClick={() => setGalleryIndex(index)}
                      aria-label={`View image ${index + 1}`}
                    >
                      <img src={image.thumbPath} alt="" loading="lazy" decoding="async" width="560" height="700" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="eyebrow eyebrow-line">{product.categoryName} · ZEN Z KA DUKAN</div>
              <div className="detail-title-row">
                <h1 className="detail-title">{product.name}</h1>
                <button
                  type="button"
                  className="product-wish detail-wish"
                  aria-pressed={wishlist.has(product.id)}
                  aria-label={wishlist.has(product.id) ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                  onClick={async () => {
                    try {
                      const saved = await wishlist.toggle(product.id);
                      showToast(saved ? `${product.name} saved to your wishlist.` : `${product.name} removed from your wishlist.`, 'success');
                    } catch (error) {
                      showToast(errorMessage(error), 'error');
                    }
                  }}
                >
                  <Heart size={18} strokeWidth={1.6} />
                </button>
              </div>
              <div className="detail-price"><Price pricePaise={product.pricePaise} originalPricePaise={product.originalPricePaise} discountPercent={product.discountPercent} /></div>
              <p className="luxe-subtitle" style={{ marginTop: 22, fontSize: '1.3rem' }}>{product.description}</p>

              <div className="option-group">
                <div className="option-label"><span>Colour</span><span>{variant?.name || 'Select a colour'}</span></div>
                <div className="color-list">
                  {product.variants.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`color-swatch ${item.id === variantId ? 'active' : ''}`}
                      onClick={() => chooseVariant(item.id)}
                      title={item.name}
                      aria-label={`Select ${item.name}`}
                      aria-pressed={item.id === variantId}
                    >
                      <span style={{ background: item.colorHex }} />
                    </button>
                  ))}
                </div>
                {variant?.images.length ? <p className="stock-note">Showing {variant.name} imagery · {variant.images.length} views</p> : null}
              </div>

              <div className="option-group">
                <div className="option-label"><span>Size</span><span>{size?.label || 'Select a size'}</span></div>
                <div className="size-list">
                  {product.sizes.map((item) => {
                    const itemStock = variantId ? product.inventory[`${variantId}:${item.id}`] || 0 : 0;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`size-button ${item.id === sizeId ? 'active' : ''}`}
                        disabled={itemStock === 0}
                        onClick={() => setSizeId(item.id)}
                        aria-pressed={item.id === sizeId}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                {size && <p className="stock-note">{stock > 0 ? `${stock} available in ${variant?.name} / ${size.label}` : 'This colour and size is currently unavailable.'}</p>}
              </div>

              <div className="option-group">
                <div className="option-label"><span>Quantity</span><span>Maximum 5 per order</span></div>
                <div className="quantity-stepper" style={{ marginTop: 14 }}>
                  <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">−</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => setQuantity((value) => Math.min(Math.max(1, maxQuantity), value + 1))} disabled={quantity >= Math.max(1, maxQuantity)} aria-label="Increase quantity">+</button>
                </div>
              </div>

              <div className="buy-now-panel">
                {canBuy ? (
                  <Link className="btn btn-gold btn-full" to={buyPath}>Buy Now · {formatINR(product.pricePaise * quantity)} <ArrowUpRight size={16} /></Link>
                ) : (
                  <button className="btn btn-outline btn-full" type="button" disabled>Currently unavailable</button>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-2" style={{ marginTop: 16, color: 'var(--muted)', fontSize: '.7rem' }}>
                  <span className="inline-flex items-center gap-1"><ShieldCheck size={14} /> COD only</span>
                  <span className="inline-flex items-center gap-1"><Truck size={14} /> ₹0 delivery</span>
                  <span className="inline-flex items-center gap-1"><PackageCheck size={14} /> Order tracking</span>
                </div>
              </div>

              <div style={{ marginTop: 28 }}>
                <details className="accordion-item" open>
                  <summary>Piece details</summary>
                  <p>{product.description} Colour views and availability are managed by the atelier in real time.</p>
                </details>
                <details className="accordion-item">
                  <summary>Delivery & Cash on Delivery</summary>
                  <p>Delivery is complimentary across India. Pay by Cash on Delivery when your order arrives. No online payment, OTP or SMS is required.</p>
                </details>
                <details className="accordion-item">
                  <summary>Order assurance</summary>
                  <p>Every order receives a unique ZEN Z KA DUKAN order ID and a visual progress timeline from Order Placed through Delivered.</p>
                </details>
              </div>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="section-tight" style={{ paddingTop: 0 }}>
          <div className="container-luxe">
            <div className="section-head">
              <div>
                <div className="eyebrow eyebrow-line">Continue the edit</div>
                <h2 className="luxe-title" style={{ marginTop: 12 }}>You may also <span className="gold-text">consider</span></h2>
              </div>
              <Link className="text-link" to={product.categorySlug ? `/shop?category=${product.categorySlug}` : '/shop'}>View collection <ArrowUpRight size={13} className="inline" /></Link>
            </div>
            <div className="product-grid">
              {related.map((item) => <ProductCard product={item} key={item.id} />)}
            </div>
          </div>
        </section>
      )}

      {viewerOpen && (
        <Product360Viewer
          productName={product.name}
          variantName={variant?.name || 'Selected colour'}
          sequence={variant?.spin ?? null}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
