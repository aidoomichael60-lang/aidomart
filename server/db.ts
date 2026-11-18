import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './security.ts';

export const IS_SERVERLESS = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
);

export const DB_PATH = IS_SERVERLESS
  ? path.join('/tmp', 'aidomart.db')
  : path.join(process.cwd(), 'aidomart.db');

export const SINGLE_ADMIN_EMAIL = 'aidoomichael60@gmail.com';

function createDbInstance(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma(IS_SERVERLESS ? 'journal_mode = DELETE' : 'journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}

export let db = createDbInstance();

export function closeDatabase() {
  try {
    db.close();
  } catch {
    // ignore close error
  }
}

export function reopenDatabase() {
  closeDatabase();
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    } catch {
      // ignore missing sidecar files
    }
  }
  db = createDbInstance();
  initDatabase();
  return db;
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      login_2fa_enabled INTEGER NOT NULL DEFAULT 1,
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      account_status TEXT NOT NULL DEFAULT 'Active' CHECK (account_status IN ('Active', 'Restricted', 'Suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS known_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_hash TEXT NOT NULL,
      device_label TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, device_hash)
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
      provider_user_id TEXT NOT NULL,
      provider_email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, provider_user_id)
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('email_verify', 'login_otp', 'password_reset')),
      token_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      legal_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      categories_json TEXT NOT NULL DEFAULT '[]',
      physical_address TEXT NOT NULL DEFAULT '',
      location_city TEXT NOT NULL DEFAULT '',
      delivery_pickup_notes TEXT NOT NULL DEFAULT '',
      storefront_image TEXT,
      business_photos_json TEXT NOT NULL DEFAULT '[]',
      application_status TEXT NOT NULL DEFAULT 'Pending Review'
        CHECK (application_status IN ('Draft', 'Pending Review', 'Additional Information Required', 'Approved', 'Rejected', 'Suspended')),
      verified_badge INTEGER NOT NULL DEFAULT 0,
      admin_feedback TEXT,
      physical_inspection_conducted INTEGER NOT NULL DEFAULT 0,
      physical_inspection_date TEXT,
      physical_inspection_notes TEXT,
      reviewed_by_id INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      momo_enabled INTEGER NOT NULL DEFAULT 0,
      momo_provider TEXT NOT NULL DEFAULT '',
      momo_account_name TEXT NOT NULL DEFAULT '',
      momo_number TEXT NOT NULL DEFAULT '',
      momo_instructions TEXT NOT NULL DEFAULT '',
      bank_enabled INTEGER NOT NULL DEFAULT 0,
      bank_name TEXT NOT NULL DEFAULT '',
      bank_account_name TEXT NOT NULL DEFAULT '',
      bank_account_number TEXT NOT NULL DEFAULT '',
      bank_branch TEXT NOT NULL DEFAULT '',
      bank_instructions TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_profile_id INTEGER NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'supporting_document',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_profile_id INTEGER NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      verified_badge_state INTEGER,
      physical_inspection_conducted INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      variations_json TEXT NOT NULL DEFAULT '[]',
      images_json TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 1,
      moderated_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_reference TEXT NOT NULL UNIQUE,
      checkout_batch_ref TEXT NOT NULL,
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      buyer_phone TEXT NOT NULL,
      seller_id INTEGER NOT NULL REFERENCES users(id),
      fulfillment_method TEXT NOT NULL CHECK (fulfillment_method IN ('Delivery', 'Pickup')),
      delivery_address TEXT NOT NULL DEFAULT '',
      delivery_notes TEXT NOT NULL DEFAULT '',
      promo_code_used TEXT,
      discount_percent REAL NOT NULL DEFAULT 0,
      subtotal_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      order_status TEXT NOT NULL DEFAULT 'Pending Seller Confirmation'
        CHECK (order_status IN ('Pending Seller Confirmation', 'Confirmed', 'Processing', 'Ready for Pickup / Dispatch', 'Completed', 'Cancelled')),
      tracking_stage TEXT NOT NULL DEFAULT 'Order Placed',
      tracking_location TEXT NOT NULL DEFAULT '',
      tracking_note TEXT NOT NULL DEFAULT '',
      estimated_delivery TEXT NOT NULL DEFAULT '',
      courier_contact TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_title TEXT NOT NULL,
      product_image TEXT,
      selected_variation TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      order_reference TEXT NOT NULL,
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      seller_id INTEGER NOT NULL REFERENCES users(id),
      amount_due REAL NOT NULL,
      amount_reported REAL,
      amount_confirmed REAL,
      payment_method TEXT,
      transaction_reference TEXT,
      reported_paid_at TEXT,
      buyer_notes TEXT,
      status TEXT NOT NULL DEFAULT 'Not Reported'
        CHECK (status IN (
          'Not Reported',
          'Payment Reported — Awaiting Seller Verification',
          'Payment Confirmed',
          'Payment Not Received',
          'Payment Amount Mismatch',
          'Payment Under Review',
          'Payment Cancelled',
          'Refund Pending',
          'Refunded'
        )),
      verified_by_id INTEGER REFERENCES users(id),
      verified_at TEXT,
      seller_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      seller_response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(order_id, product_id, buyer_id)
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      discount_percent REAL NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 90),
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      manually_ended INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER NOT NULL REFERENCES users(id),
      extension_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS promo_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
      actor_user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      old_expires_at TEXT,
      new_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seller_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      banner_image TEXT,
      status TEXT NOT NULL DEFAULT 'Draft'
        CHECK (status IN ('Draft', 'Pending Review', 'Published', 'Rejected', 'Expired', 'Unpublished')),
      starts_at TEXT,
      expires_at TEXT,
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      reporter_id INTEGER NOT NULL REFERENCES users(id),
      target_seller_id INTEGER REFERENCES users(id),
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Under Review', 'Resolved', 'Closed')),
      seller_response TEXT,
      admin_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      event_type TEXT NOT NULL,
      dedup_key TEXT,
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped_unconfigured')),
      brevo_message_id TEXT,
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe schema migrations for existing SQLite databases
  const orderCols = (db.prepare(`PRAGMA table_info(orders)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  const missingOrderCols: Array<{ col: string; def: string }> = [
    { col: 'tracking_stage', def: `TEXT NOT NULL DEFAULT 'Order Placed'` },
    { col: 'tracking_location', def: `TEXT NOT NULL DEFAULT ''` },
    { col: 'tracking_note', def: `TEXT NOT NULL DEFAULT ''` },
    { col: 'estimated_delivery', def: `TEXT NOT NULL DEFAULT ''` },
    { col: 'courier_contact', def: `TEXT NOT NULL DEFAULT ''` },
  ];
  for (const { col, def } of missingOrderCols) {
    if (!orderCols.includes(col)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${def};`);
    }
  }

  // Seed official marketplace categories idempotently (no fake products!)
  const defaultCategories = [
    { name: 'Accessories', slug: 'accessories', description: 'Everyday carry, bags, belts, eyewear, and lifestyle accessories.' },
    { name: 'Clothing', slug: 'clothing', description: 'Apparel, tailored wear, casual essentials, and seasonal outfits.' },
    { name: 'Electronics', slug: 'electronics', description: 'Consumer electronics, audio gear, and mobile accessories.' },
    { name: 'Shoes', slug: 'shoes', description: 'Formal footwear, loafers, sandals, and classic everyday pairs.' },
    { name: 'Sneakers', slug: 'sneakers', description: 'Streetwear trainers, athletic runners, and lifestyle kicks.' },
    { name: 'Watches', slug: 'watches', description: 'Analog timepieces, chronographs, smartwatches, and wristwear.' },
    { name: 'Jewelry & Fine Jewellery', slug: 'jewelry', description: 'Rings, necklaces, bracelets, earrings, chains, and fine jewelry.' },
    { name: 'Bags & Luggage', slug: 'bags-luggage', description: 'Handbags, backpacks, travel suitcases, totes, and wallets.' },
    { name: 'Beauty & Cosmetics', slug: 'beauty-cosmetics', description: 'Skincare, makeup, fragrances, hair care, and grooming essentials.' },
    { name: 'Phones & Tablets', slug: 'phones-tablets', description: 'Smartphones, tablets, chargers, cases, and mobile gadgets.' },
    { name: 'Computers & Laptops', slug: 'computers-laptops', description: 'Laptops, desktops, monitors, keyboards, and computer accessories.' },
    { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Kitchen appliances, cookware, bedding, lighting, and home decor.' },
    { name: 'Furniture', slug: 'furniture', description: 'Living room, bedroom, dining, and office furniture.' },
    { name: 'Health & Wellness', slug: 'health-wellness', description: 'Personal care, fitness accessories, and wellness essentials.' },
    { name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Sports apparel, gym gear, bicycles, and outdoor equipment.' },
    { name: 'Books & Stationery', slug: 'books-stationery', description: 'Textbooks, novels, office stationery, and art supplies.' },
    { name: 'Food & Beverages', slug: 'food-beverages', description: 'Packaged foods, snacks, spices, drinks, and pantry essentials.' },
    { name: 'Auto & Motorcycle Parts', slug: 'auto-parts', description: 'Vehicle accessories, spare parts, oils, and maintenance gear.' },
    { name: 'Baby & Kids', slug: 'baby-kids', description: 'Baby apparel, toys, strollers, school bags, and kids essentials.' },
    { name: 'Arts, Crafts & Handmade', slug: 'arts-crafts', description: 'Paintings, beadwork, custom crafts, and traditional artifacts.' },
    { name: 'Musical Instruments', slug: 'musical-instruments', description: 'Guitars, keyboards, microphones, studio and DJ equipment.' },
    { name: 'Tools & Hardware', slug: 'tools-hardware', description: 'Power tools, electrical supplies, plumbing, and DIY gear.' },
    { name: 'Pet Supplies', slug: 'pet-supplies', description: 'Pet food, collars, grooming supplies, and pet accessories.' },
    { name: 'Other / General Merchandise', slug: 'other-merchandise', description: 'Specialty items and unique goods from verified sellers.' },
  ];

  const insertCat = db.prepare(
    `INSERT OR IGNORE INTO categories (name, slug, description, active) VALUES (?, ?, ?, 1)`
  );
  for (const cat of defaultCategories) {
    insertCat.run(cat.name, cat.slug, cat.description);
  }

  // Seed platform settings idempotently
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)`
  );
  insertSetting.run('promo_creator_policy', 'buyer');
  insertSetting.run('require_login_email_otp', 'true');

  // Enforce strict single-Administrator invariant (aidoomichael60@gmail.com only)
  db.prepare(`UPDATE users SET role = 'buyer' WHERE role = 'admin' AND LOWER(email) != ?`).run(
    SINGLE_ADMIN_EMAIL
  );

  // Seed official Administrator account idempotently
  const existingAdmin = db
    .prepare(`SELECT id, role FROM users WHERE LOWER(email) = ?`)
    .get(SINGLE_ADMIN_EMAIL) as { id: number; role: string } | undefined;
  if (!existingAdmin) {
    const adminPasswordHash = hashPassword('MichaelAID60@');
    db.prepare(`
      INSERT INTO users (email, password_hash, full_name, phone, role, email_verified, login_2fa_enabled, sound_enabled, account_status)
      VALUES (?, ?, ?, ?, 'admin', 1, 0, 1, 'Active')
    `).run(SINGLE_ADMIN_EMAIL, adminPasswordHash, 'Michael Aidoo', '0205283752');
  } else if (existingAdmin.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin', email_verified = 1, login_2fa_enabled = 0, account_status = 'Active' WHERE id = ?`).run(
      existingAdmin.id
    );
  }
}

export function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  link?: string | null;
  type?: string;
}) {
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, link, type)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.title,
    params.message,
    params.link ?? null,
    params.type ?? 'info'
  );
}
