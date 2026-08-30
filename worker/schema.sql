-- ============================================================
-- House Rent Bill — โครงสร้างฐานข้อมูล Cloudflare D1
-- ย้ายมาจากสเปรดชีต "Rent Invoice" (Google Sheets)
--
--   ชีต House Rental Details -> ตาราง locations
--   ชีต Rental History       -> ตาราง tenants
--   ชีต Data                 -> ตาราง bills
--
-- รัน:  npx wrangler d1 execute house-rent-bill --remote --file=schema.sql
-- ============================================================

DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS tenants;
DROP TABLE IF EXISTS locations;

-- ── สถานที่ปล่อยเช่า ────────────────────────────────────────
CREATE TABLE locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  location   TEXT NOT NULL UNIQUE,          -- ชื่อสถานที่ (ใช้เป็นคีย์อ้างอิงเหมือนในชีตเดิม)
  details    TEXT NOT NULL DEFAULT '',      -- ที่อยู่
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── ประวัติผู้เช่า ──────────────────────────────────────────
CREATE TABLE tenants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  location   TEXT NOT NULL,                 -- ชีตเดิมพิมพ์ชื่อไม่ตรงกับ Data บ้าง จึงไม่ผูก FK
  name       TEXT NOT NULL,
  date_in    TEXT NOT NULL DEFAULT '',      -- yyyy-mm-dd
  date_out   TEXT NOT NULL DEFAULT '',      -- ว่าง = ยังเช่าอยู่
  deposit    REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tenants_location ON tenants(location);

-- ── บิลค่าเช่าย้อนหลัง ──────────────────────────────────────
CREATE TABLE bills (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_key   TEXT NOT NULL UNIQUE,          -- serial วันที่แบบ Google Sheets + ชื่อสถานที่ (คีย์เดิมกันข้อมูลซ้ำ)
  date       TEXT NOT NULL,                 -- yyyy-mm-dd
  location   TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  rent       REAL NOT NULL DEFAULT 0,
  water      REAL NOT NULL DEFAULT 0,
  elec       REAL NOT NULL DEFAULT 0,
  other      REAL NOT NULL DEFAULT 0,       -- ค่าใช้จ่ายอื่นๆ (ชีตเดิมไม่ได้เก็บ)
  discount   REAL NOT NULL DEFAULT 0,       -- ส่วนลด (ชีตเดิมไม่ได้เก็บ)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bills_date     ON bills(date);
CREATE INDEX idx_bills_location ON bills(location);
