CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_type TEXT NOT NULL CHECK (user_type IN ('customer','admin')),
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON sessions(token_hash, user_type, revoked_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_type, user_id);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_path TEXT,
  special_filter TEXT CHECK (special_filter IS NULL OR special_filter IN ('new_arrival','best_seller')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id),
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  original_price_paise INTEGER NOT NULL CHECK (original_price_paise >= price_paise),
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 90),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  new_arrival INTEGER NOT NULL DEFAULT 0 CHECK (new_arrival IN (0,1)),
  best_seller INTEGER NOT NULL DEFAULT 0 CHECK (best_seller IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(deleted_at, available, category_id);
CREATE INDEX IF NOT EXISTS idx_products_flags ON products(deleted_at, featured, new_arrival, best_seller);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS product_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sizes_product ON product_sizes(product_id, deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, deleted_at, sort_order);
CREATE INDEX IF NOT EXISTS idx_images_variant ON product_images(variant_id, deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS variant_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  size_id INTEGER NOT NULL REFERENCES product_sizes(id),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE(variant_id, size_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON variant_inventory(stock);

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL DEFAULT 'Home',
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id, deleted_at);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('Order Placed','Order Confirmed','Packed','Shipped','Out for Delivery','Delivered','Cancelled')),
  customer_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise > 0),
  delivery_paise INTEGER NOT NULL DEFAULT 0 CHECK (delivery_paise = 0),
  total_paise INTEGER NOT NULL CHECK (total_paise > 0),
  payment_method TEXT NOT NULL DEFAULT 'COD' CHECK (payment_method = 'COD'),
  stock_restored INTEGER NOT NULL DEFAULT 0 CHECK (stock_restored IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),
  size_id INTEGER REFERENCES product_sizes(id),
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  size_label TEXT NOT NULL,
  image_path TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise > 0),
  discount_percent INTEGER NOT NULL DEFAULT 0,
  line_total_paise INTEGER NOT NULL CHECK (line_total_paise > 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL CHECK (status IN ('Order Placed','Order Confirmed','Packed','Shipped','Out for Delivery','Delivered','Cancelled')),
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id, created_at);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

-- Persistent multi-angle 360° image sequences, one per product colour variant.
CREATE TABLE IF NOT EXISTS product_360_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  frame_count INTEGER NOT NULL CHECK (frame_count IN (8,12,16,24,36)),
  source TEXT NOT NULL DEFAULT 'admin_upload' CHECK (source IN ('seed_derived','admin_upload')),
  model_path TEXT,
  model_mime TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(product_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_spin_sequences_product ON product_360_sequences(product_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_spin_sequences_variant ON product_360_sequences(variant_id, deleted_at);

CREATE TABLE IF NOT EXISTS product_360_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sequence_id INTEGER NOT NULL REFERENCES product_360_sequences(id),
  path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_spin_images_sequence ON product_360_images(sequence_id, deleted_at, position);

-- Customer wishlist. One active row per customer/product; soft-deleted so history is auditable.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_customer_product ON wishlist_items(customer_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_customer_active ON wishlist_items(customer_id, deleted_at, created_at);
