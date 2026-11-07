import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Breadcrumb, EmptyState } from '@/components/ui';

interface PolicySection {
  heading: string;
  paragraphs: string[];
}

interface Policy {
  title: string;
  kicker: string;
  intro: string;
  sections: PolicySection[];
}

const POLICIES: Record<string, Policy> = {
  delivery: {
    title: 'Delivery & Cash on Delivery',
    kicker: 'Client services',
    intro: 'A deliberately simple fulfilment ritual: one selected piece, one confirmed address, Cash on Delivery only.',
    sections: [
      {
        heading: 'Payment method',
        paragraphs: [
          'ZEN Z KA DUKAN accepts Cash on Delivery (COD) only. There is no online payment gateway, card checkout, wallet, UPI checkout, paid subscription or premium payment service.',
          'No mobile OTP, SMS verification or SMS notification is used anywhere in the purchase flow.',
        ],
      },
      {
        heading: 'Delivery charge',
        paragraphs: ['Delivery is always ₹0. The final amount is calculated on the server from current product pricing and quantity; the browser never supplies the payable price.'],
      },
      {
        heading: 'Order confirmation and tracking',
        paragraphs: [
          'Every accepted order receives a unique ZEN Z KA DUKAN order ID. Customers can follow Order Placed, Order Confirmed, Packed, Shipped, Out for Delivery, Delivered and Cancelled through a visual timeline in their account.',
          'Orders and status history are stored in the persistent database and are not automatically deleted.',
        ],
      },
      {
        heading: 'Availability',
        paragraphs: ['Orders for unavailable products, or for colour and size combinations with insufficient stock, are rejected before an order is created.'],
      },
    ],
  },
  returns: {
    title: 'Returns & Exchanges',
    kicker: 'Client services',
    intro: 'The current application focuses on transparent fulfilment, cancellation before dispatch and complete order visibility.',
    sections: [
      {
        heading: 'Cancellation before dispatch',
        paragraphs: [
          'A customer may cancel an eligible order from the order tracking page before it reaches Shipped or Out for Delivery. Reserved stock is restored through a database transaction.',
        ],
      },
      {
        heading: 'After delivery',
        paragraphs: [
          'Because all orders are Cash on Delivery, no online refund is processed by this application. A live commercial deployment should connect post-delivery returns and exchanges to its official support workflow before launch.',
        ],
      },
      {
        heading: 'Order records',
        paragraphs: ['Cancelled and completed orders remain visible in customer order history and the protected admin console so the record is never ambiguous.'],
      },
    ],
  },
  privacy: {
    title: 'Privacy & Data Protection',
    kicker: 'The house',
    intro: 'ZEN Z KA DUKAN collects only the information needed to create an account, deliver an order and administer the store.',
    sections: [
      {
        heading: 'Information collected',
        paragraphs: [
          'Customer accounts store a mobile number, optional profile name, securely hashed password, securely hashed recovery code, saved delivery addresses and order history. Newsletter subscribers optionally store an email address.',
          'Administrators have separate server-side sessions. Product photos are stored as validated, optimized files in the persistent workspace upload volume.',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'Passwords and recovery codes are never stored in plain text. Session tokens are random and stored only as hashes. Admin and customer roles are separated, and admin routes require server-side authorization.',
          'The API validates inputs, uploaded files and all prices. Database transactions protect order creation, stock changes, cancellation and product management.',
        ],
      },
      {
        heading: 'No OTP or SMS',
        paragraphs: ['No SMS provider, OTP service or external notification service is used. Recovery relies on the unique secret code shown once at registration.'],
      },
      {
        heading: 'Persistence',
        paragraphs: ['Products, orders, customers, addresses and sessions are stored in persistent SQLite. Uploaded images remain in the durable workspace file volume across application restarts in this environment.'],
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    kicker: 'The house',
    intro: 'These terms describe the working rules of the ZEN Z KA DUKAN storefront and its separate admin console.',
    sections: [
      {
        heading: 'Buying ritual',
        paragraphs: [
          'The store offers BUY NOW only. There is no shopping cart or Add to Bag function. Customers choose a colour, size and quantity, then complete a Cash on Delivery checkout.',
        ],
      },
      {
        heading: 'Pricing and stock',
        paragraphs: ['Product prices, discounts, availability and stock are authoritative on the server. The final order amount is recalculated securely when the order is created.'],
      },
      {
        heading: 'Accounts',
        paragraphs: ['One mobile number identifies one customer account. Customers are responsible for keeping their password and private recovery code confidential.'],
      },
      {
        heading: 'Administration',
        paragraphs: ['The /admin console is a separate protected interface. The first administrator is created with a private one-time bootstrap token; no public admin password is hardcoded.'],
      },
      {
        heading: 'Commercial deployment',
        paragraphs: ['Before a public commercial launch, replace the sample product photography and policy wording with your licensed assets and legally reviewed terms.'],
      },
    ],
  },
};

export default function PolicyPage() {
  const { slug = '' } = useParams();
  const policy = POLICIES[slug];
  if (!policy) {
    return (
      <div className="container-luxe" style={{ paddingTop: 150, paddingBottom: 100 }}>
        <EmptyState title="Policy not found" description="This client-services page does not exist." action={<Link className="btn btn-gold" to="/">Return home</Link>} />
      </div>
    );
  }

  return (
    <div>
      <section className="page-top" style={{ paddingBottom: 40 }}>
        <div className="container-luxe">
          <Breadcrumb items={[{ label: 'Home', to: '/' }, { label: 'Client Services' }, { label: policy.title }]} />
          <div className="eyebrow eyebrow-line" style={{ marginTop: 18 }}>{policy.kicker}</div>
          <h1 style={{ marginTop: 14, maxWidth: 1000 }}>{policy.title}</h1>
          <p className="luxe-subtitle" style={{ marginTop: 18, maxWidth: 720 }}>{policy.intro}</p>
        </div>
      </section>
      <section className="section-tight">
        <div className="container-luxe" style={{ maxWidth: 900 }}>
          {policy.sections.map((section, index) => (
            <article className="panel panel-pad" style={{ marginBottom: 16 }} key={section.heading}>
              <div className="flex items-center gap-3">
                <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
                <FileText size={16} className="gold-text" />
                <h2 className="luxe-title" style={{ fontSize: '1.8rem' }}>{section.heading}</h2>
              </div>
              <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
                {section.paragraphs.map((paragraph) => <p className="muted" style={{ lineHeight: 1.8, fontSize: '.88rem' }} key={paragraph}>{paragraph}</p>)}
              </div>
            </article>
          ))}
          <div className="notice" style={{ marginTop: 24 }}>
            This policy describes the implemented application behaviour. For a live commercial launch, have the final wording reviewed for your jurisdiction.
          </div>
          <Link className="btn btn-outline" style={{ marginTop: 24 }} to="/"><ArrowLeft size={15} /> Return home</Link>
        </div>
      </section>
    </div>
  );
}
