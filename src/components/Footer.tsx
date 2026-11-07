import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/Brand';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container-luxe">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="luxe-subtitle" style={{ marginTop: 22, maxWidth: 420, fontSize: '1.35rem' }}>
              A cinematic fashion house for those who prefer presence over noise.
            </p>
            <div className="promo-points" style={{ justifyContent: 'flex-start', marginTop: 24 }}>
              <span>Cash on Delivery</span><span>₹0 Delivery</span><span>No Cart</span>
            </div>
          </div>
          <div>
            <h4>Collections</h4>
            <div className="footer-links">
              <Link to="/shop">All Pieces</Link>
              <Link to="/shop?category=men">Men</Link>
              <Link to="/shop?category=women">Women</Link>
              <Link to="/shop?category=accessories">Accessories</Link>
              <Link to="/shop?collection=new">New Arrivals</Link>
              <Link to="/shop?collection=best">Best Sellers</Link>
            </div>
          </div>
          <div>
            <h4>Client Services</h4>
            <div className="footer-links">
              <Link to="/account">My Profile</Link>
              <Link to="/orders">Order History & Tracking</Link>
              <Link to="/policies/delivery">Delivery & COD</Link>
              <Link to="/policies/returns">Returns & Exchanges</Link>
              <Link to="/policies/privacy">Privacy</Link>
              <Link to="/policies/terms">Terms</Link>
            </div>
          </div>
          <div>
            <h4>The Maison</h4>
            <div className="footer-links">
              <Link to="/#house">Our Story</Link>
              <Link to="/#collections">Special Collections</Link>
              <Link to="/#promise">The Promise</Link>
              <Link to="/#newsletter">Private List</Link>
              <Link to="/admin" className="inline-flex items-center gap-1">Admin Console <ArrowUpRight size={13} /></Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ZEN Z KA DUKAN. All rights reserved.</span>
          <span>Designed as a complete luxury commerce experience · Chennai, India</span>
        </div>
      </div>
    </footer>
  );
}
