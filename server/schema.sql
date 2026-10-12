-- Swavy Dispatch database (SQLite). Created automatically on first run.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('customer','rider')),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
  city TEXT, area TEXT,
  pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_admin INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
);
-- Motorcycle riders
CREATE TABLE IF NOT EXISTS riders (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plate TEXT NOT NULL DEFAULT '', bike TEXT NOT NULL DEFAULT '', photo TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0, online INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL DEFAULT 50, y REAL NOT NULL DEFAULT 50,   -- position on the simple city map (0-100)
  rating_sum INTEGER NOT NULL DEFAULT 0, rating_n INTEGER NOT NULL DEFAULT 0
);
-- Areas and their price zone + position on the stylised map. SAMPLE values, edit freely.
CREATE TABLE IF NOT EXISTS areas (
  name TEXT PRIMARY KEY, city TEXT NOT NULL, zone INTEGER NOT NULL, x REAL NOT NULL, y REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS zones (city TEXT NOT NULL, zone INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (city, zone));
-- Zone-to-zone base price for a SMALL package (naira). SAMPLE prices, editable on the admin page.
CREATE TABLE IF NOT EXISTS zone_prices (
  city TEXT NOT NULL, z1 INTEGER NOT NULL, z2 INTEGER NOT NULL, amount INTEGER NOT NULL,
  PRIMARY KEY (city, z1, z2)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- short code people can read out, e.g. SWD-48213
  token TEXT NOT NULL UNIQUE,           -- secret part of the tracking link
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'web',   -- web, telegram, bot-test
  tg_chat TEXT,                         -- chat to notify (Telegram or the test chat)
  sender_name TEXT NOT NULL, sender_phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  pickup_area TEXT NOT NULL, pickup_addr TEXT NOT NULL,
  drop_area TEXT NOT NULL, drop_addr TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('small','medium','large')),
  item TEXT NOT NULL DEFAULT '',
  receiver_name TEXT NOT NULL, receiver_phone TEXT NOT NULL,
  express INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  pay TEXT NOT NULL CHECK (pay IN ('cash_pickup','cash_delivery','transfer')),
  paid INTEGER NOT NULL DEFAULT 0,
  collect_amount INTEGER NOT NULL DEFAULT 0,
  collect_status TEXT NOT NULL DEFAULT 'none',   -- none, pending, collected, paid_out
  rider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending, assigned, to_pickup, picked, on_way, delivered, cancelled
  delivery_code TEXT NOT NULL,
  pickup_photo TEXT NOT NULL DEFAULT '',
  rating INTEGER, rating_note TEXT NOT NULL DEFAULT '',
  remitted INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_rider ON orders (rider_id, status);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS remittances (
  id INTEGER PRIMARY KEY, rider_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, orders INTEGER NOT NULL, at INTEGER NOT NULL
);
-- Telegram (and test chat) conversation state
CREATE TABLE IF NOT EXISTS bot_chats (chat TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
