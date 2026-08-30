/**
 * House Rent Bill — Cloudflare Worker API (ฐานข้อมูล D1)
 *
 * มาแทน Google Apps Script เดิม โดยคงรูปแบบการคุยไว้เหมือนเดิมทุกอย่าง
 * เว็บจึงย้ายมาต่อ D1 ได้โดยไม่ต้องรื้อ js/app.js
 *
 *   ส่ง  POST /  body = {"action":"...", "token":"...", ...}
 *   หรือ GET  /?action=...
 *   ตอบ  {ok:true, action, result} | {ok:false, action, error}
 *
 * กติกาที่ยึดทั้งไฟล์
 *   - ใช้ prepared statement + bind() ทุกที่ ห้ามต่อสตริงค่าลง SQL
 *   - คีย์กันข้อมูลซ้ำ (bill_key) คำนวณที่นี่เสมอ ไม่รับจาก client
 *   - ตรวจ input ให้ครบก่อนแตะฐานข้อมูล ผิดตรงไหนบอกชื่อฟิลด์นั้น
 */

/* ══════════════════════════════════════════════════════════════
   CORS — อ่าน origin ที่อนุญาตจาก env (คั่นด้วยจุลภาค)
   ใส่ * เพื่ออนุญาตทุก origin (เปิดไฟล์ index.html จากเครื่องตรงๆ ก็ยิงได้)
   ══════════════════════════════════════════════════════════════ */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const open = list.includes('*');
  const allow = open ? origin || '*' : list.includes(origin) ? origin : '';
  if (!allow) return null;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(obj, request, env, status) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
    corsHeaders(request, env) || {},
  );
  return new Response(JSON.stringify(obj), { status: status || 200, headers });
}

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */
class BadInput extends Error {}

function str(v) {
  return String(v == null ? '' : v).trim();
}

function numOf(v) {
  if (v === '' || v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

/** รับเฉพาะ yyyy-mm-dd */
function isoDate(v, field) {
  const s = str(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new BadInput('รูปแบบวันที่ไม่ถูกต้อง (' + field + '): ' + s);
  return s;
}

/** serial แบบ Google Sheets (ฐาน 30/12/1899) — ใช้ทำคีย์เหมือนที่ชีตเดิมใช้ */
function serialOfIso(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}

function billKey(iso, location) {
  return serialOfIso(iso) + String(location);
}

/* ══════════════════════════════════════════════════════════════
   Actions
   ══════════════════════════════════════════════════════════════ */

async function ping(env) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM locations) AS locations,
            (SELECT COUNT(*) FROM tenants)   AS tenants,
            (SELECT COUNT(*) FROM bills)     AS bills`,
  ).first();
  return { ok: true, time: new Date().toISOString(), db: 'Cloudflare D1', counts: row };
}

async function bootstrap(env) {
  const [locations, tenants, bills] = await env.DB.batch([
    env.DB.prepare('SELECT id, location, details FROM locations ORDER BY id'),
    env.DB.prepare('SELECT id, location, name, date_in, date_out, deposit FROM tenants ORDER BY id'),
    env.DB.prepare(
      `SELECT id, bill_key, date, location, name, rent, water, elec, other, discount
         FROM bills ORDER BY date, id`,
    ),
  ]);

  return {
    // ชื่อฟิลด์คงรูปแบบเดิมที่ฝั่งเว็บใช้อยู่ (row = id ของแถวในตาราง)
    locations: locations.results.map((r) => ({ row: r.id, location: r.location, details: r.details })),
    tenants: tenants.results.map((r) => ({
      row: r.id,
      location: r.location,
      name: r.name,
      dateIn: r.date_in,
      dateOut: r.date_out,
      deposit: r.deposit,
    })),
    data: bills.results.map((r) => ({
      row: r.id,
      date: r.date,
      location: r.location,
      name: r.name,
      rent: r.rent,
      water: r.water,
      elec: r.elec,
      other: r.other,
      discount: r.discount,
      key: r.bill_key,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/** บันทึกบิล — คีย์เดิมซ้ำ = อัปเดตทับแถวเดิม ไม่สร้างแถวใหม่ */
async function saveBill(env, p) {
  if (!str(p.date)) throw new BadInput('ไม่ได้ระบุวันที่');
  if (!str(p.location)) throw new BadInput('ไม่ได้ระบุสถานที่');

  const date = isoDate(p.date, 'date');
  const location = str(p.location);
  const key = billKey(date, location);

  const before = await env.DB.prepare('SELECT id FROM bills WHERE bill_key = ?').bind(key).first();

  await env.DB.prepare(
    `INSERT INTO bills (bill_key, date, location, name, rent, water, elec, other, discount, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(bill_key) DO UPDATE SET
          date = excluded.date, location = excluded.location, name = excluded.name,
          rent = excluded.rent, water = excluded.water, elec = excluded.elec,
          other = excluded.other, discount = excluded.discount,
          updated_at = datetime('now')`,
  )
    .bind(
      key,
      date,
      location,
      str(p.name),
      numOf(p.rent),
      numOf(p.water),
      numOf(p.elec),
      numOf(p.other),
      numOf(p.discount),
    )
    .run();

  const after = await env.DB.prepare('SELECT id FROM bills WHERE bill_key = ?').bind(key).first();
  return { row: after.id, key, updated: !!before };
}

async function deleteBill(env, p) {
  const key = str(p.key);
  if (!key) throw new BadInput('ไม่ได้ระบุ key');
  const res = await env.DB.prepare('DELETE FROM bills WHERE bill_key = ?').bind(key).run();
  const n = res.meta ? res.meta.changes : 0;
  if (!n) throw new BadInput('ไม่พบข้อมูลที่ต้องการลบ');
  return { deleted: true, key };
}

async function addLocation(env, p) {
  const location = str(p.location);
  if (!location) throw new BadInput('ไม่ได้ระบุชื่อสถานที่');
  const dup = await env.DB.prepare('SELECT id FROM locations WHERE location = ?').bind(location).first();
  if (dup) throw new BadInput('มีสถานที่ชื่อนี้อยู่แล้ว');
  const res = await env.DB.prepare('INSERT INTO locations (location, details) VALUES (?, ?)')
    .bind(location, str(p.details))
    .run();
  return { row: res.meta.last_row_id };
}

async function addTenant(env, p) {
  const location = str(p.location);
  const name = str(p.name);
  if (!location || !name) throw new BadInput('ต้องระบุสถานที่และชื่อผู้เช่า');
  const res = await env.DB.prepare(
    'INSERT INTO tenants (location, name, date_in, date_out, deposit) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(
      location,
      name,
      str(p.dateIn) ? isoDate(p.dateIn, 'dateIn') : '',
      str(p.dateOut) ? isoDate(p.dateOut, 'dateOut') : '',
      numOf(p.deposit),
    )
    .run();
  return { row: res.meta.last_row_id };
}

/* ══════════════════════════════════════════════════════════════
   Router
   ══════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    if (!cors) return new Response('origin ไม่ได้รับอนุญาต', { status: 403 });

    const url = new URL(request.url);
    let params = {};

    if (request.method === 'POST') {
      // ส่งมาแบบ text/plain ก็อ่านได้ (โค้ดเว็บชุดเดิมเลี่ยง preflight ด้วยวิธีนี้)
      try {
        params = JSON.parse(await request.text());
      } catch (e) {
        params = {};
      }
    }
    for (const [k, v] of url.searchParams) if (!(k in params)) params[k] = v;

    const action = str(params.action) || 'ping';

    try {
      if (env.AUTH_TOKEN && str(params.token) !== env.AUTH_TOKEN) throw new BadInput('token ไม่ถูกต้อง');

      let result;
      switch (action) {
        case 'ping':        result = await ping(env); break;
        case 'bootstrap':   result = await bootstrap(env); break;
        case 'saveBill':    result = await saveBill(env, params); break;
        case 'deleteBill':  result = await deleteBill(env, params); break;
        case 'addLocation': result = await addLocation(env, params); break;
        case 'addTenant':   result = await addTenant(env, params); break;
        default: throw new BadInput('ไม่รู้จักคำสั่ง: ' + action);
      }
      return json({ ok: true, action, result }, request, env);
    } catch (err) {
      const bad = err instanceof BadInput;
      return json(
        { ok: false, action, error: String((err && err.message) || err) },
        request,
        env,
        bad ? 400 : 500,
      );
    }
  },
};
