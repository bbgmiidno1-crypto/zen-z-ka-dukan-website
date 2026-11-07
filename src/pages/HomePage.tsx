import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Check, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import type { HomeData } from '@shared/types';
import { ProductRail } from '@/components/ProductRail';
import { EmptyState, LoadingBlock, SectionHeading } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { useHomeAnimations } from '@/lib/motion';

const FALLBACK_IMAGE = '/media/seed/editorial/campaign.webp';

const testimonials = [
  { quote: 'The coat arrives like a piece of architecture. Structured, quiet, and unmistakably considered.', name: 'Patron note · Chennai' },
  { quote: 'Buying one piece at a time feels intentional. The black-and-gold presentation is genuinely cinematic.', name: 'Patron note · Mumbai' },
  { quote: 'The colour views, the COD simplicity and the tracking timeline made the whole experience effortless.', name: 'Patron note · Bengaluru' },
];

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [email, setEmail] = useState('');
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  useHomeAnimations(rootRef, Boolean(data));

  useEffect(() => {
    let active = true;
    setError('');
    api.get<HomeData>('/api/home')
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(errorMessage(err, 'Unable to load the collection.')); });
    return () => { active = false; };
  }, [retry]);

  async function submitNewsletter(event: FormEvent) {
    event.preventDefault();
    setNewsletterBusy(true);
    setNewsletterMessage('');
    try {
      await api.post<{ ok: boolean; message: string }>('/api/newsletter', { email });
      setNewsletterMessage('You are on the private list.');
      setEmail('');
      showToast('Welcome to the private list.', 'success');
    } catch (err) {
      const message = errorMessage(err);
      setNewsletterMessage(message);
      showToast(message, 'error');
    } finally {
      setNewsletterBusy(false);
    }
  }

  if (error) {
    return (
      <div className="container-luxe" style={{ paddingTop: 150, paddingBottom: 100 }}>
        <EmptyState title="The atelier is unreachable" description={error} action={<button className="btn btn-gold" onClick={() => setRetry((value) => value + 1)}>Try again</button>} />
      </div>
    );
  }
  if (!data) return <LoadingBlock label="Opening the collection…" />;

  const editorial = data.editorial;
  const brandLetters = [...'ZEN Z KA DUKAN'];

  return (
    <div ref={rootRef}>
      <section className="hero" id="house">
        <div className="hero-media">
          <picture>
            <source media="(max-width: 768px)" srcSet={editorial.heroPoster || editorial.hero} />
            <img src={editorial.hero || FALLBACK_IMAGE} alt="ZEN Z KA DUKAN black and gold couture campaign" fetchPriority="high" width="1800" height="1000" />
          </picture>
        </div>
        <div className="hero-overlay" />
        <div className="hero-noise" />
        <div className="hero-content">
          <div className="eyebrow eyebrow-line reveal">Edition 01 · The Gilded Edit</div>
          <h1 className="hero-title reveal" style={{ marginTop: 22 }}>
            <span className="line">THE ART OF</span>
            <span className="line indent gold-shimmer">DRESSING</span>
            <span className="line">IN GOLD</span>
          </h1>
          <div className="hero-meta reveal">
            <p className="hero-copy">
              ZEN Z KA DUKAN is a study in shadow, light and restraint. Discover sculptural tailoring,
              considered objects and a buying ritual built around one perfect piece.
            </p>
            <div className="hero-actions">
              <Link to="/shop" className="btn btn-gold">Explore Collection <ArrowUpRight size={15} /></Link>
              <Link to="/shop?collection=new" className="btn btn-outline">New Arrivals <ArrowDownRight size={15} /></Link>
            </div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true">Scroll to enter</div>
      </section>

      <section className="brand-typography">
        <div className="container-luxe">
          <div className="eyebrow" style={{ textAlign: 'center' }}>The house signature</div>
          <div className="brand-word" aria-label="ZEN Z KA DUKAN" style={{ marginTop: 22 }}>
            {brandLetters.map((letter, index) => (
              <span className="brand-letter gold-shimmer" key={`${letter}-${index}`} aria-hidden="true">
                {letter === ' ' ? '\u00A0' : letter}
              </span>
            ))}
          </div>
          <div className="brand-typography-caption">A study in shadow and light · ZEN Z KA DUKAN</div>
          <div className="gold-rule" style={{ marginTop: 42 }} />
        </div>
      </section>

      <section id="categories" className="section">
        <div className="container-luxe">
          <SectionHeading
            eyebrow="Shop by category"
            title={<>Curated <span className="gold-text">Worlds</span></>}
            description="Nine edits, one point of view. Choose a world and discover the pieces within it."
          />
          <div className="category-grid">
            {data.categories.map((category) => {
              const to = category.specialFilter === 'new_arrival'
                ? '/shop?collection=new'
                : category.specialFilter === 'best_seller'
                  ? '/shop?collection=best'
                  : `/shop?category=${category.slug}`;
              return (
                <Link className="category-card reveal" to={to} key={category.id}>
                  <img src={category.imagePath || FALLBACK_IMAGE} alt={category.name} loading="lazy" decoding="async" width="800" height="1000" />
                  <div className="category-card-content">
                    <h3>{category.name}</h3>
                    <p>{category.productCount ?? 0} pieces · Explore</p>
                    <ArrowUpRight className="arrow" size={20} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <div className="container-luxe"><div className="gold-rule" /></div>

      <ProductRail
        id="featured"
        eyebrow="The featured edit"
        title="Signature Pieces"
        description="Selected by the atelier for silhouette, material and presence."
        products={data.featured}
        direction="left"
        viewAllTo="/shop?collection=featured"
        liquid
      />

      <div className="container-luxe"><div className="gold-rule" /></div>

      <ProductRail
        id="new-arrivals"
        eyebrow="Just arrived"
        title="New Arrivals"
        description="The newest chapter in black, charcoal and burnished gold."
        products={data.newArrivals}
        direction="right"
        viewAllTo="/shop?collection=new"
        liquid
      />

      <div className="container-luxe"><div className="gold-rule" /></div>

      <ProductRail
        id="best-sellers"
        eyebrow="Most desired"
        title="Best Sellers"
        description="The pieces our patrons return for, season after season."
        products={data.bestSellers}
        direction="left"
        viewAllTo="/shop?collection=best"
        liquid
      />

      <section id="collections" className="section">
        <div className="container-luxe">
          <SectionHeading eyebrow="Special collections" title={<>The <span className="gold-text">Atelier</span> Stories</>} />
          <div className="editorial-split">
            <div className="editorial-image-wrap reveal">
              <img className="editorial-image" src={editorial.campaign || FALLBACK_IMAGE} alt="Noir Atelier editorial campaign" loading="lazy" decoding="async" />
            </div>
            <div className="editorial-copy reveal">
              <div className="eyebrow">Collection 01 · Noir Atelier</div>
              <h2 className="luxe-title">Tailoring that speaks in a whisper.</h2>
              <p>
                Precision cuts, deep black cloth and hand-finished metallic detail. Each piece is designed
                to reveal itself slowly — in motion, under light, and over time.
              </p>
              <div className="editorial-stats">
                <div className="editorial-stat"><strong>24</strong><span>Considered pieces</span></div>
                <div className="editorial-stat"><strong>03</strong><span>Colour stories</span></div>
                <div className="editorial-stat"><strong>₹0</strong><span>Delivery</span></div>
              </div>
              <Link to="/shop?category=women" className="btn btn-gold" style={{ marginTop: 34 }}>Enter Noir Atelier <ArrowUpRight size={15} /></Link>
            </div>
          </div>
          <div className="collection-grid" style={{ marginTop: 20 }}>
            <Link to="/shop?category=men" className="collection-card reveal">
              <img src={editorial.collectionOne || FALLBACK_IMAGE} alt="Aurum essentials collection" loading="lazy" decoding="async" />
              <div className="collection-content">
                <div className="eyebrow">Collection 02</div>
                <h3 className="gold-shimmer">Aurum Essentials</h3>
                <p>Menswear with a precise line and a discreet gilded edge.</p>
                <span className="text-link">Discover <ArrowUpRight size={13} className="inline" /></span>
              </div>
            </Link>
            <Link to="/shop?category=accessories" className="collection-card reveal">
              <img src={editorial.collectionTwo || FALLBACK_IMAGE} alt="Objects in gold collection" loading="lazy" decoding="async" />
              <div className="collection-content">
                <div className="eyebrow">Collection 03</div>
                <h3 className="gold-shimmer">Objects in Gold</h3>
                <p>The final punctuation: watches, eyewear and enduring objects.</p>
                <span className="text-link">Discover <ArrowUpRight size={13} className="inline" /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section id="promise" className="promo-banner">
        <img src={editorial.promotion || FALLBACK_IMAGE} alt="ZEN Z KA DUKAN luxury fragrance still life" loading="lazy" decoding="async" />
        <div className="promo-content reveal">
          <div className="eyebrow">The ZEN Z KA DUKAN promise</div>
          <h2 className="gold-shimmer" style={{ marginTop: 16 }}>No cart. No friction.<br />Only the piece.</h2>
          <p className="luxe-subtitle" style={{ margin: '22px auto 0', maxWidth: 620 }}>
            Choose a colour, choose a size, and buy the piece you love. Cash on Delivery only, with complimentary delivery.
          </p>
          <div className="promo-points">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Secure account</span>
            <span className="inline-flex items-center gap-2"><PackageCheck size={15} /> Visual order tracking</span>
            <span className="inline-flex items-center gap-2"><Truck size={15} /> ₹0 delivery</span>
          </div>
          <Link to="/shop" className="btn btn-gold" style={{ marginTop: 32 }}>Shop the edit <ArrowUpRight size={15} /></Link>
        </div>
      </section>

      <section id="testimonials" className="section-tight">
        <div className="container-luxe">
          <SectionHeading eyebrow="Patron notes" title={<>Quiet <span className="gold-text">Acclaim</span></>} description="Words from clients who prefer considered luxury." />
          <div className="testimonial-scroller">
            {testimonials.map((item) => (
              <article className="testimonial-card reveal" key={item.quote}>
                <div className="quote-mark">“</div>
                <blockquote>{item.quote}</blockquote>
                <footer>{item.name}</footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="newsletter" className="section-tight" style={{ paddingTop: 0 }}>
        <div className="container-luxe">
          <div className="newsletter-shell reveal">
            <div>
              <div className="eyebrow eyebrow-line">Private list</div>
              <h2 className="luxe-title" style={{ marginTop: 14 }}>Enter the <span className="gold-text">inner circle.</span></h2>
              <p className="luxe-subtitle" style={{ marginTop: 14, maxWidth: 500 }}>
                Occasional notes on new collections and private previews. No noise, no clutter.
              </p>
            </div>
            <div>
              <form className="newsletter-form" onSubmit={submitNewsletter}>
                <input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email address" aria-label="Email address" />
                <button className="btn btn-gold" type="submit" disabled={newsletterBusy}>
                  {newsletterBusy ? 'Joining…' : 'Join'} <Check size={15} />
                </button>
              </form>
              {newsletterMessage && <p className="muted" style={{ marginTop: 14, fontSize: '.78rem' }}>{newsletterMessage}</p>}
              <p className="muted" style={{ marginTop: 14, fontSize: '.7rem' }}>No SMS, no OTP, no paid services. Your address stays in this application.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
