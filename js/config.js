/* ===========================================================
   config.js — ค่าตั้งต้นของระบบ
   แก้ apiUrl ที่นี่ได้เลย (หรือกรอกในหน้า "ตั้งค่า" ก็ได้ ระบบจะจำไว้ในเครื่อง)
   =========================================================== */

const DEFAULTS = {
  /* Cloudflare Worker ที่ต่อกับฐานข้อมูล D1 "house-rent-bill" (โค้ดอยู่ในโฟลเดอร์ worker/) */
  apiUrl: 'https://house-rent-bill-api.wiphawas-sketchup.workers.dev',
  token: '',

  /* ข้อมูลท้ายใบแจ้งหนี้ (ตามรูปตัวอย่าง) */
  payHead: 'กรุณาชำระเงิน โอนเข้าบัญชี',
  account: '562-265131-8',
  bank: 'ธนาคารไทยพาณิชย์',
  payee: 'นายวิภาวัส จันทะคาม',
  /* คำนำหน้าไฮไลต์เหลือง — ต่อท้ายด้วยรายการที่ยังไม่รวม เช่น "ยังไม่รวมค่าน้ำ-ค่าไฟฟ้า" */
  highlightPrefix: 'ยังไม่รวม',

  /* ขนาดตัวอักษรบนใบแจ้งหนี้ (px) */
  invFont: 24,

  /* 'ce' = ค.ศ. (ตามรูป) , 'be' = พ.ศ. */
  era: 'ce',

  /* วันครบกำหนดชำระ = วันที่เท่าไรของเดือนถัดไป */
  dueDay: 5
};

const STORAGE_KEY = 'hrb.settings.v1';
const CACHE_KEY   = 'hrb.cache.v1';

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

/* ---------- settings ---------- */
const Settings = {
  data: Object.assign({}, DEFAULTS),
  load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    }catch(e){ /* ignore */ }
    return this.data;
  },
  save(patch){
    Object.assign(this.data, patch || {});
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }catch(e){}
    return this.data;
  }
};
Settings.load();

/* ---------- helpers ---------- */

/** 1234.5 -> "1,234.50" ; ค่าว่าง/0 ให้คืน '' ถ้า blankIfZero */
function money(n, blankIfZero){
  const v = Number(n);
  if (!isFinite(v)) return '';
  if (blankIfZero && v === 0) return '';
  return v.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function num(v){
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g,''));
  return isFinite(n) ? n : 0;
}

/** 'YYYY-MM-DD' -> Date (เที่ยงวัน เลี่ยงปัญหา timezone) */
function parseISO(s){
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2]-1, +m[3], 12, 0, 0);
}

function toISO(d){
  if (!d) return '';
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

function yearOf(d){
  return Settings.data.era === 'be' ? d.getFullYear() + 543 : d.getFullYear();
}

/** 29 สิงหาคม 2026 */
function thaiDate(d, pad){
  if (!d) return '';
  const day = pad ? String(d.getDate()).padStart(2,'0') : String(d.getDate());
  return day + ' ' + TH_MONTHS[d.getMonth()] + ' ' + yearOf(d);
}

/** 29/8/2026 (แบบที่ใช้ในชีต) */
function sheetDate(d){
  return d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : '';
}

/** กำหนดชำระ = วันที่ 5 ของเดือนถัดไป */
function dueDateOf(billDate){
  if (!billDate) return null;
  return new Date(billDate.getFullYear(), billDate.getMonth()+1, Settings.data.dueDay, 12, 0, 0);
}

function lastDayOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
}

/** serial แบบ Google Sheets (ฐาน 30/12/1899) — ใช้ทำคีย์ "คอลัมน์ 1" */
function sheetSerial(d){
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899,11,30)) / 86400000);
}

/** ดึงรหัสบ้าน/ห้อง เช่น "995/158" ใช้จับคู่ชื่อสถานที่ที่พิมพ์ไม่ตรงกัน */
function locCode(s){
  const m = String(s || '').match(/(\d+\s*\/\s*\d+)/);
  return m ? m[1].replace(/\s/g,'') : '';
}

/** เทียบชื่อสถานที่แบบยืดหยุ่น (ชีต Rental History เขียนไม่ตรงกับ Data) */
function sameLocation(a, b){
  if (!a || !b) return false;
  const norm = s => String(s).replace(/\s+/g,'').replace(/ห้องที่|บ้านเลขที่/g,'');
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  const ca = locCode(a), cb = locCode(b);
  if (ca && cb && ca === cb) return true;
  return na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0;
}

function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
