/*************************************************************
 * House Rent Bill — Backend (Google Apps Script Web App)
 *
 * ติดตั้ง: เปิดสเปรดชีต > Extensions > Apps Script > วางไฟล์นี้ >
 *          Deploy > New deployment > Web app
 *          Execute as: Me   |   Who has access: Anyone
 *          คัดลอก URL (.../exec) ไปใส่ในหน้า "ตั้งค่า" ของเว็บแอป
 *************************************************************/

const SPREADSHEET_ID = '1sAfLzYL9sJYxW1ZfrSfsPqTY5_iNBICL8B7jrZOJQuk';

const SHEET_DETAILS = 'House Rental Details';
const SHEET_HISTORY = 'Rental History';
const SHEET_BILL    = 'House Rent Bill';
const SHEET_DATA    = 'Data';

/** ถ้าอยากล็อกไม่ให้คนอื่นยิง API ให้ตั้งรหัสตรงนี้ แล้วใส่รหัสเดียวกันในหน้า "ตั้งค่า" */
const API_TOKEN = '';

/** true = เขียนคอลัมน์เสริม (ค่าใช้จ่ายอื่นๆ / ส่วนลด) ต่อท้ายชีต Data */
const WRITE_EXTRA_COLUMNS = false;

/*************************************************************
 * Router
 *************************************************************/
function doGet(e){ return handle_(e); }
function doPost(e){ return handle_(e); }

function handle_(e){
  var params = {};
  try{
    if (e && e.postData && e.postData.contents) params = JSON.parse(e.postData.contents);
  }catch(err){ /* ไม่ใช่ JSON ก็ไม่เป็นไร */ }
  if (e && e.parameter){
    for (var k in e.parameter) if (!(k in params)) params[k] = e.parameter[k];
  }

  var action = params.action || 'ping';
  try{
    if (API_TOKEN && String(params.token || '') !== API_TOKEN) throw new Error('token ไม่ถูกต้อง');

    var result;
    switch (action){
      case 'ping':         result = {ok:true, time:new Date().toISOString(), sheet:ss_().getName()}; break;
      case 'bootstrap':    result = bootstrap_(); break;
      case 'saveBill':     result = saveBill_(params); break;
      case 'deleteBill':   result = deleteBill_(params); break;
      case 'addLocation':  result = addLocation_(params); break;
      case 'addTenant':    result = addTenant_(params); break;
      default: throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    }
    return json_({ok:true, action:action, result:result});
  }catch(err){
    return json_({ok:false, action:action, error:String((err && err.message) || err)});
  }
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*************************************************************
 * อ่านข้อมูลทั้งหมด
 *************************************************************/
function bootstrap_(){
  return {
    locations: readLocations_(),
    tenants:   readTenants_(),
    data:      readData_(),
    updatedAt: new Date().toISOString()
  };
}

function readLocations_(){
  var sh = sheet_(SHEET_DETAILS);
  var h  = findHeader_(sh, 'Location');
  var rows = readBlock_(sh, h, 2);
  return rows.map(function(r){
    return {row:r.row, location:String(r.v[0]).trim(), details:String(r.v[1]).trim()};
  });
}

function readTenants_(){
  var sh = sheet_(SHEET_HISTORY);
  var h  = findHeader_(sh, 'Location');
  var rows = readBlock_(sh, h, 5);
  return rows.map(function(r){
    return {
      row: r.row,
      location: String(r.v[0]).trim(),
      name:     String(r.v[1]).trim(),
      dateIn:   isoOf_(r.v[2]),
      dateOut:  isoOf_(r.v[3]),
      deposit:  numOf_(r.v[4])
    };
  });
}

function readData_(){
  var sh = sheet_(SHEET_DATA);
  var h  = findHeader_(sh, 'Date');
  var rows = readBlock_(sh, h, 7);
  return rows.map(function(r){
    var loc = String(r.v[1]).trim();
    var iso = isoOf_(r.v[0]);
    return {
      row: r.row,
      date: iso,
      location: loc,
      name: String(r.v[2]).trim(),
      rent: numOf_(r.v[3]),
      water: numOf_(r.v[4]),
      elec: numOf_(r.v[5]),
      key: String(r.v[6]).trim() || (serialOfIso_(iso) + loc)
    };
  });
}

/*************************************************************
 * บันทึกบิล -> ชีต Data + อัปเดตหน้า House Rent Bill
 *************************************************************/
function saveBill_(p){
  if (!p.date)     throw new Error('ไม่ได้ระบุวันที่');
  if (!p.location) throw new Error('ไม่ได้ระบุสถานที่');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    var sh = sheet_(SHEET_DATA);
    var h  = findHeader_(sh, 'Date');
    var d  = dateFromIso_(p.date);
    var key = serialOfDate_(d) + String(p.location);

    var end = nextRow_(sh, h);                   // แถวว่างแถวแรกใต้ตาราง
    var target = 0, updated = false;
    if (end > h.row + 1){
      var keys = sh.getRange(h.row+1, h.col+6, end-h.row-1, 1).getDisplayValues();
      for (var i = 0; i < keys.length; i++){
        if (String(keys[i][0]).trim() === key){ target = h.row+1+i; updated = true; break; }
      }
    }
    if (!target) target = end;
    if (target > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);

    sh.getRange(target, h.col, 1, 7).setValues([[
      d,
      String(p.location),
      String(p.name || ''),
      blankOrNum_(p.rent),
      blankOrNum_(p.water),
      blankOrNum_(p.elec),
      key
    ]]);
    sh.getRange(target, h.col, 1, 1).setNumberFormat('d/m/yyyy');
    sh.getRange(target, h.col+3, 1, 3).setNumberFormat('#,##0.00');

    if (WRITE_EXTRA_COLUMNS){
      sh.getRange(h.row, h.col+7, 1, 2).setValues([['Other Expense','Discount']]);
      sh.getRange(target, h.col+7, 1, 2).setValues([[blankOrNum_(p.other), blankOrNum_(p.discount)]]);
    }

    updateBillSheet_(d, String(p.location));

    return {row:target, key:key, updated:updated};
  } finally {
    lock.releaseLock();
  }
}

function deleteBill_(p){
  if (!p.key) throw new Error('ไม่ได้ระบุ key');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    var sh = sheet_(SHEET_DATA);
    var h  = findHeader_(sh, 'Date');
    var end = nextRow_(sh, h);
    if (end <= h.row + 1) throw new Error('ไม่พบข้อมูล');
    var keys = sh.getRange(h.row+1, h.col+6, end-h.row-1, 1).getDisplayValues();
    for (var i = 0; i < keys.length; i++){
      if (String(keys[i][0]).trim() === String(p.key)){
        sh.deleteRow(h.row+1+i);
        return {deleted:true, row:h.row+1+i};
      }
    }
    throw new Error('ไม่พบแถวที่ต้องการลบ');
  } finally {
    lock.releaseLock();
  }
}

/** เขียนวันที่ + สถานที่ ลงช่องควบคุมของหน้า House Rent Bill ในชีต */
function updateBillSheet_(dateObj, location){
  try{
    var sh = ss_().getSheetByName(SHEET_BILL);
    if (!sh) return;
    var dCell = findText_(sh, 'เลือกบิลวันที่');
    if (dCell) sh.getRange(dCell.row + 1, dCell.col).setValue(dateObj);
    var lCell = findText_(sh, 'เลือกสถานที่');
    if (lCell) sh.getRange(lCell.row + 1, lCell.col).setValue(location);
  }catch(err){ /* ถ้าเลย์เอาต์ชีตเปลี่ยน ก็ข้ามไป ไม่ให้การบันทึกล้มเหลว */ }
}

/*************************************************************
 * เพิ่มสถานที่ / ผู้เช่า
 *************************************************************/
function addLocation_(p){
  if (!p.location) throw new Error('ไม่ได้ระบุชื่อสถานที่');
  var sh = sheet_(SHEET_DETAILS);
  var h  = findHeader_(sh, 'Location');
  var row = nextRow_(sh, h);
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
  sh.getRange(row, h.col, 1, 2).setValues([[String(p.location), String(p.details || '')]]);
  return {row:row};
}

function addTenant_(p){
  if (!p.location || !p.name) throw new Error('ต้องระบุสถานที่และชื่อผู้เช่า');
  var sh = sheet_(SHEET_HISTORY);
  var h  = findHeader_(sh, 'Location');
  var row = nextRow_(sh, h);
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
  sh.getRange(row, h.col, 1, 5).setValues([[
    String(p.location),
    String(p.name),
    p.dateIn  ? dateFromIso_(p.dateIn)  : '',
    p.dateOut ? dateFromIso_(p.dateOut) : '',
    blankOrNum_(p.deposit)
  ]]);
  sh.getRange(row, h.col+2, 1, 2).setNumberFormat('d/m/yyyy');
  return {row:row};
}

/*************************************************************
 * Helpers
 *************************************************************/
function ss_(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }

function sheet_(name){
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีตชื่อ "' + name + '"');
  return sh;
}

function tz_(){ return ss_().getSpreadsheetTimeZone() || 'Asia/Bangkok'; }

/** หาแถว/คอลัมน์ของหัวตาราง เช่น 'Location' หรือ 'Date' */
function findHeader_(sh, needle){
  var cell = findText_(sh, needle);
  if (!cell) throw new Error('ไม่พบหัวตาราง "' + needle + '" ในชีต ' + sh.getName());
  return cell;
}

/** ค้นหาข้อความในชีต (ตรงทั้งช่องก่อน ถ้าไม่เจอค่อยค้นแบบมีข้อความนั้นอยู่) */
function findText_(sh, needle){
  var f = sh.createTextFinder(needle).matchEntireCell(true).findNext();
  if (!f) f = sh.createTextFinder(needle).matchEntireCell(false).findNext();
  return f ? {row:f.getRow(), col:f.getColumn()} : null;
}

/** แถวว่างแถวแรกใต้หัวตาราง */
function nextRow_(sh, h){
  var maxRows = sh.getMaxRows();
  var n = Math.min(1000, maxRows - h.row);
  if (n <= 0) return h.row + 1;
  var vals = sh.getRange(h.row + 1, h.col, n, 1).getDisplayValues();
  for (var i = 0; i < n; i++){
    if (!String(vals[i][0]).trim()) return h.row + 1 + i;
  }
  return h.row + 1 + n;
}

/** อ่านข้อมูลใต้หัวตารางจนกว่าจะเจอแถวว่าง */
function readBlock_(sh, h, width){
  var end = nextRow_(sh, h);
  var count = end - h.row - 1;
  if (count <= 0) return [];
  var vals = sh.getRange(h.row + 1, h.col, count, width).getValues();
  return vals.map(function(v, i){ return {row: h.row + 1 + i, v: v}; });
}

function pad2_(n){ return ('0' + n).slice(-2); }

/** ค่าจากชีต -> 'yyyy-MM-dd' */
function isoOf_(v){
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);        // d/m/yyyy
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);               // yyyy-mm-dd
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  return '';
}

function dateFromIso_(iso){
  var m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) throw new Error('รูปแบบวันที่ไม่ถูกต้อง: ' + iso);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** serial แบบ Google Sheets (ฐาน 30/12/1899) */
function serialOfDate_(d){
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}
function serialOfIso_(iso){
  if (!iso) return '';
  return serialOfDate_(dateFromIso_(iso));
}

function numOf_(v){
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** ค่าว่าง/0 -> เว้นว่างในชีต (ให้เหมือนที่เจ้าของชีตกรอกไว้เดิม) */
function blankOrNum_(v){
  if (v === '' || v == null) return '';
  var n = numOf_(v);
  return n === 0 ? '' : n;
}

/*************************************************************
 * ฟังก์ชันช่วยตรวจสอบ — กด Run ในตัวแก้ไขสคริปต์เพื่อดู log
 *************************************************************/
function diagnose(){
  var out = {
    spreadsheet: ss_().getName(),
    timezone: tz_(),
    sheets: ss_().getSheets().map(function(s){ return s.getName(); }),
    locations: readLocations_().length,
    tenants: readTenants_().length,
    dataRows: readData_().length,
    billDateCell: findText_(sheet_(SHEET_BILL), 'เลือกบิลวันที่'),
    billLocCell: findText_(sheet_(SHEET_BILL), 'เลือกสถานที่')
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
