/**
 * pull-from-sheet.mjs — ดึงข้อมูลจากสเปรดชีตเดิมมาสร้างไฟล์ seed.sql ใหม่
 *
 * ใช้ตอนที่อยากคัดลอกข้อมูลจาก Google Sheet มาลง D1 อีกรอบ
 * (ครั้งแรกใช้สคริปต์นี้ดึงมาแล้ว — ไฟล์ worker/seed.sql คือผลลัพธ์ของมัน)
 *
 *   node tools/pull-from-sheet.mjs [Apps Script Web App URL]
 *   npx wrangler d1 execute house-rent-bill --remote --file=seed.sql
 *
 * หมายเหตุ: seed.sql เริ่มด้วย DELETE ทั้ง 3 ตาราง = เขียนทับข้อมูลใน D1 ทั้งหมด
 *          ถ้าออกบิลใหม่บนเว็บไปแล้ว ข้อมูลส่วนนั้นจะหายไปด้วย
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET_API =
  process.argv[2] ||
  'https://script.google.com/macros/s/AKfycbxS6DAMVp7VqUnfkd3ahNN2cLq6r4Wg6nj7s3SWM9vn2LaKDVhRWjQyL8jKwCFxXLA/exec';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql');

const q = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
const n = (v) => (isFinite(Number(v)) ? Number(v) : 0);

/** serial แบบ Google Sheets (ฐาน 30/12/1899) — ใช้ทำคีย์กันข้อมูลซ้ำเหมือนชีตเดิม */
function serial(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

const res = await fetch(SHEET_API + '?action=bootstrap', { redirect: 'follow' });
const json = await res.json();
if (!json.ok) throw new Error('ดึงข้อมูลจากชีตไม่สำเร็จ: ' + json.error);
const r = json.result;

const out = [];
out.push('-- ============================================================');
out.push('-- House Rent Bill — ข้อมูลที่คัดลอกมาจากสเปรดชีต "Rent Invoice"');
out.push('-- ดึงสดจาก Apps Script Web App เมื่อ ' + r.updatedAt);
out.push(`-- ${r.locations.length} สถานที่ / ${r.tenants.length} ผู้เช่า / ${r.data.length} บิล`);
out.push('--');
out.push('-- รัน:  npx wrangler d1 execute house-rent-bill --remote --file=seed.sql');
out.push('-- ============================================================');
out.push('');
out.push('DELETE FROM bills;');
out.push('DELETE FROM tenants;');
out.push('DELETE FROM locations;');
out.push('');
out.push('-- ── สถานที่ (จากชีต House Rental Details) ──');
out.push('INSERT INTO locations (location, details) VALUES');
out.push(r.locations.map((l) => `  (${q(l.location)}, ${q(l.details)})`).join(',\n') + ';');
out.push('');
out.push('-- ── ผู้เช่า (จากชีต Rental History) ──');
out.push('INSERT INTO tenants (location, name, date_in, date_out, deposit) VALUES');
out.push(
  r.tenants
    .map((t) => `  (${q(t.location)}, ${q(t.name)}, ${q(t.dateIn)}, ${q(t.dateOut)}, ${n(t.deposit)})`)
    .join(',\n') + ';',
);
out.push('');
out.push('-- ── บิลย้อนหลัง (จากชีต Data) ──');
out.push('INSERT INTO bills (bill_key, date, location, name, rent, water, elec) VALUES');

const seen = new Set();
const rows = [];
for (const b of r.data) {
  const key = String(b.key || '').trim() || serial(b.date) + b.location;
  if (seen.has(key)) {
    console.warn('ข้าม key ซ้ำ: ' + key);
    continue;
  }
  seen.add(key);
  rows.push(
    `  (${q(key)}, ${q(b.date)}, ${q(b.location)}, ${q(b.name)}, ${n(b.rent)}, ${n(b.water)}, ${n(b.elec)})`,
  );
}
out.push(rows.join(',\n') + ';');
out.push('');

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`เขียน ${OUT} แล้ว — ${r.locations.length} สถานที่ / ${r.tenants.length} ผู้เช่า / ${rows.length} บิล`);
