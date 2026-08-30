/* ===========================================================
   app.js — ตัวควบคุมหน้าจอทั้งหมด
   =========================================================== */

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const state = { locations: [], tenants: [], data: [], loaded:false };

/* ---------------- utils ---------------- */
function toast(msg, kind){
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show no-print' + (kind ? ' ' + kind : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast no-print'; }, kind === 'err' ? 6000 : 3200);
}

function setConn(kind, text){
  const el = $('#conn');
  el.className = 'conn ' + (kind ? 'is-' + kind : '');
  el.querySelector('.conn-text').textContent = text;
}

/* ---------------- tabs ---------------- */
function showPage(name){
  $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.page === name));
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === 'page-' + name));
}

/* ---------------- data loading ---------------- */
async function loadAll(silent){
  if (!state.loaded){
    const cached = Cache.read();
    if (cached){
      Object.assign(state, cached);
      renderAll();
      setConn('', 'ข้อมูลสำเนาในเครื่อง (' + state.data.length + ' แถว)');
    }else if (typeof seedState === 'function'){
      Object.assign(state, seedState());          // สำเนาข้อมูลชุดที่ย้ายเข้า D1 (ไว้ดูตอนออฟไลน์)
      renderAll();
      setConn('', 'ข้อมูลตั้งต้นในไฟล์ (' + state.data.length + ' แถว)');
    }
  }
  if (!API.configured()){
    setConn('err', 'ยังไม่ตั้งค่า URL');
    if (!silent) toast('ยังไม่ได้ตั้งค่า Worker API URL — ไปที่แท็บ “ตั้งค่า”', 'err');
    return;
  }
  setConn('busy', 'กำลังโหลด...');
  try{
    const res = await API.bootstrap();
    state.locations = res.locations || [];
    state.tenants   = res.tenants   || [];
    state.data      = res.data      || [];
    state.loaded    = true;
    Cache.write({locations:state.locations, tenants:state.tenants, data:state.data, loaded:true});
    renderAll();
    setConn('ok', 'เชื่อมต่อ D1 แล้ว (' + state.data.length + ' แถว)');
  }catch(err){
    setConn('err', 'เชื่อมต่อไม่ได้');
    if (!silent) toast(err.message, 'err');
  }
}

function renderAll(){
  fillLocationSelects();
  renderDataPage();
  renderPlaces();
  renderTenants();
}

/* ---------------- report page ---------------- */
function fillLocationSelects(){
  const opts = state.locations.map(l => `<option value="${escapeHtml(l.location)}">${escapeHtml(l.location)}</option>`).join('');
  const keep = $('#f-location').value;
  $('#f-location').innerHTML = opts;
  $('#t-location').innerHTML = opts;
  $('#d-location').innerHTML = '<option value="">ทั้งหมด</option>' + opts;
  if (keep) $('#f-location').value = keep;

  const years = Array.from(new Set(state.data.map(r => (r.date || '').slice(0,4)).filter(Boolean))).sort().reverse();
  $('#d-year').innerHTML = '<option value="">ทั้งหมด</option>' + years.map(y => `<option>${y}</option>`).join('');

  $('#tenant-list').innerHTML = Array.from(new Set(state.tenants.map(t => t.name).filter(Boolean)))
    .map(n => `<option value="${escapeHtml(n)}">`).join('');

  onLocationChange();
}

function addressOf(loc){
  const found = state.locations.find(l => sameLocation(l.location, loc));
  return found ? (found.details || '') : '';
}

/** ผู้เช่าที่อยู่ในช่วงวันที่ของบิล (ถ้าไม่เจอ ใช้คนล่าสุด) */
function tenantFor(loc, billDate){
  const list = state.tenants.filter(t => sameLocation(t.location, loc));
  if (!list.length) return null;
  const active = list.filter(t => {
    const din  = parseISO(t.dateIn);
    const dout = parseISO(t.dateOut);
    if (din && billDate < din) return false;
    if (dout && billDate > dout) return false;
    return true;
  });
  const pick = (active.length ? active : list).slice().sort((a,b) => {
    const da = parseISO(a.dateIn), db = parseISO(b.dateIn);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  })[0];
  return pick || null;
}

/** ค่าเช่าล่าสุดของสถานที่นั้น */
function lastRentOf(loc){
  const rows = state.data
    .filter(r => sameLocation(r.location, loc) && num(r.rent) > 0)
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  return rows.length ? num(rows[rows.length-1].rent) : 0;
}

function onLocationChange(){
  const loc = $('#f-location').value;
  const bd  = parseISO($('#f-billdate').value) || new Date();
  const t   = tenantFor(loc, bd);
  if (t){
    $('#f-customer').value = t.name || '';
    $('#hint-customer').textContent = 'จาก Rental History: เข้าอยู่ ' + (t.dateIn ? sheetDate(parseISO(t.dateIn)) : '-')
      + (t.dateOut ? ' ถึง ' + sheetDate(parseISO(t.dateOut)) : ' (ยังอยู่)');
  }else{
    $('#hint-customer').textContent = state.tenants.length ? 'ไม่พบผู้เช่าของสถานที่นี้ใน Rental History' : '';
  }
  if (!num($('#f-rent').value)){
    const r = lastRentOf(loc);
    if (r) $('#f-rent').value = r.toFixed(2);
  }
  updateDue();
}

function updateDue(){
  const bd = parseISO($('#f-billdate').value);
  $('#f-duedate').value = bd ? thaiDate(dueDateOf(bd), true) : '';
}

function currentModel(){
  const bd = parseISO($('#f-billdate').value);
  if (!bd) { toast('กรุณาเลือกวันที่ออกบิล', 'err'); return null; }
  const loc = $('#f-location').value;
  if (!loc) { toast('กรุณาเลือกสถานที่', 'err'); return null; }
  return {
    location: loc,
    address: addressOf(loc),
    customer: $('#f-customer').value.trim(),
    billDate: bd,
    rent: num($('#f-rent').value),
    water: num($('#f-water').value),
    elec: num($('#f-elec').value),
    waterExcluded: $('#f-nowater').checked,
    disWater: num($('#f-dis-water').value),
    disElec: num($('#f-dis-elec').value),
    other: num($('#f-other').value),
    note: $('#f-note').value.trim()
  };
}

function doReport(){
  const m = currentModel();
  if (!m) return;
  $('#invoiceHost').innerHTML = buildInvoice(m);
  return m;
}

async function doSave(){
  const m = currentModel();
  if (!m) return;
  if (!API.configured()){ toast('ยังไม่ได้ตั้งค่า Worker API URL', 'err'); showPage('settings'); return; }

  const btn = $('#btn-save');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try{
    const res = await API.saveBill({
      date: toISO(m.billDate),
      location: m.location,
      name: m.customer,
      rent: m.rent,
      water: m.waterExcluded ? '' : m.water,
      elec: m.elec,
      other: m.other,
      discount: m.disWater + m.disElec
    });
    toast(res.updated ? 'อัปเดตข้อมูลในฐานข้อมูลแล้ว (แถว ' + res.row + ')' : 'บันทึกลงฐานข้อมูลแล้ว (แถว ' + res.row + ')', 'ok');
    await loadAll(true);
  }catch(err){
    toast(err.message, 'err');
  }finally{
    btn.disabled = false; btn.textContent = 'บันทึกลงฐานข้อมูล';
  }
}

/* ---------------- data page ---------------- */
function renderDataPage(){
  const loc  = $('#d-location').value;
  const year = $('#d-year').value;
  const q    = ($('#d-search').value || '').trim();

  const rows = state.data
    .filter(r => !loc  || sameLocation(r.location, loc))
    .filter(r => !year || String(r.date || '').slice(0,4) === year)
    .filter(r => !q    || String(r.name || '').indexOf(q) >= 0)
    .slice()
    .sort((a,b) => String(b.date).localeCompare(String(a.date)));

  let sRent = 0, sWater = 0, sElec = 0;
  const body = rows.map(r => {
    const rent = num(r.rent), water = num(r.water), elec = num(r.elec);
    sRent += rent; sWater += water; sElec += elec;
    const d = parseISO(r.date);
    return `<tr>
      <td>${d ? sheetDate(d) : escapeHtml(r.date || '')}</td>
      <td>${escapeHtml(r.location)}</td>
      <td>${escapeHtml(r.name || '')}</td>
      <td class="num">${money(rent)}</td>
      <td class="num">${water ? money(water) : ''}</td>
      <td class="num">${elec ? money(elec) : ''}</td>
      <td class="num">${money(rent + water + elec)}</td>
      <td>
        <button class="btn-link" data-act="bill" data-key="${escapeHtml(r.key)}" style="color:var(--accent)">ออกบิลซ้ำ</button>
        <button class="btn-link" data-act="del" data-key="${escapeHtml(r.key)}">ลบ</button>
      </td>
    </tr>`;
  }).join('');

  $('#d-table tbody').innerHTML = body || '<tr><td colspan="8" style="color:var(--muted)">ไม่มีข้อมูล</td></tr>';
  $('#d-stats').innerHTML = `
    <div class="stat"><b>${rows.length}</b><span>จำนวนบิล</span></div>
    <div class="stat"><b>${money(sRent)}</b><span>รวมค่าเช่า</span></div>
    <div class="stat"><b>${money(sWater)}</b><span>รวมค่าน้ำ</span></div>
    <div class="stat"><b>${money(sElec)}</b><span>รวมค่าไฟฟ้า</span></div>
    <div class="stat"><b>${money(sRent + sWater + sElec)}</b><span>รวมทั้งหมด</span></div>`;
}

function rowByKey(key){ return state.data.find(r => r.key === key); }

async function onDataTableClick(e){
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const r = rowByKey(btn.dataset.key);
  if (!r) return;

  if (btn.dataset.act === 'bill'){
    $('#f-location').value = state.locations.some(l => l.location === r.location)
      ? r.location
      : (state.locations.find(l => sameLocation(l.location, r.location)) || {}).location || r.location;
    $('#f-billdate').value = r.date;
    $('#f-customer').value = r.name || '';
    $('#f-rent').value  = num(r.rent)  || '';
    $('#f-water').value = num(r.water) || '';
    $('#f-elec').value  = num(r.elec)  || '';
    $('#f-nowater').checked = !num(r.water);
    updateDue();
    showPage('report');
    doReport();
    return;
  }

  if (btn.dataset.act === 'del'){
    if (!confirm('ลบข้อมูลวันที่ ' + sheetDate(parseISO(r.date)) + ' ของ ' + r.location + ' ออกจากฐานข้อมูล?')) return;
    try{
      await API.deleteBill(r.key);
      toast('ลบออกจากฐานข้อมูลแล้ว', 'ok');
      await loadAll(true);
    }catch(err){ toast(err.message, 'err'); }
  }
}

/* ---------------- places / tenants ---------------- */
function renderPlaces(){
  $('#p-table tbody').innerHTML = state.locations.map(l =>
    `<tr><td>${escapeHtml(l.location)}</td><td style="white-space:normal">${escapeHtml(l.details || '')}</td></tr>`
  ).join('') || '<tr><td colspan="2" style="color:var(--muted)">ไม่มีข้อมูล</td></tr>';
}

function renderTenants(){
  const today = new Date();
  $('#t-table tbody').innerHTML = state.tenants.map(t => {
    const din = parseISO(t.dateIn), dout = parseISO(t.dateOut);
    const active = (!din || today >= din) && (!dout || today <= dout);
    return `<tr>
      <td>${escapeHtml(t.location)}</td>
      <td>${escapeHtml(t.name || '')}</td>
      <td>${din ? sheetDate(din) : ''}</td>
      <td>${dout ? sheetDate(dout) : ''}</td>
      <td class="num">${t.deposit ? money(t.deposit) : ''}</td>
      <td><span class="badge ${active ? 'badge-on' : 'badge-off'}">${active ? 'กำลังเช่า' : 'ย้ายออกแล้ว'}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">ไม่มีข้อมูล</td></tr>';
}

async function addPlace(){
  const location = $('#p-location').value.trim();
  const details  = $('#p-detail').value.trim();
  if (!location) return toast('กรุณากรอกชื่อสถานที่', 'err');
  try{
    await API.addLocation(location, details);
    $('#p-location').value = ''; $('#p-detail').value = '';
    toast('เพิ่มสถานที่ลงฐานข้อมูลแล้ว', 'ok');
    await loadAll(true);
  }catch(err){ toast(err.message, 'err'); }
}

async function addTenant(){
  const t = {
    location: $('#t-location').value,
    name:     $('#t-name').value.trim(),
    dateIn:   $('#t-in').value,
    dateOut:  $('#t-out').value,
    deposit:  num($('#t-deposit').value)
  };
  if (!t.location || !t.name) return toast('กรุณากรอกสถานที่และชื่อผู้เช่า', 'err');
  try{
    await API.addTenant(t);
    $('#t-name').value = ''; $('#t-in').value = ''; $('#t-out').value = ''; $('#t-deposit').value = '';
    toast('เพิ่มผู้เช่าลงฐานข้อมูลแล้ว', 'ok');
    await loadAll(true);
  }catch(err){ toast(err.message, 'err'); }
}

/* ---------------- settings ---------------- */
function fillSettings(){
  const s = Settings.data;
  $('#s-api').value = s.apiUrl;
  $('#s-token').value = s.token;
  $('#s-payhead').value = s.payHead;
  $('#s-account').value = s.account;
  $('#s-bank').value = s.bank;
  $('#s-payee').value = s.payee;
  $('#s-highlight').value = s.highlight;
  $('#s-era').value = s.era;
  $('#s-font').value = s.invFont;
}

function saveSettings(){
  Settings.save({
    apiUrl:   $('#s-api').value.trim(),
    token:    $('#s-token').value.trim(),
    payHead:  $('#s-payhead').value,
    account:  $('#s-account').value,
    bank:     $('#s-bank').value,
    payee:    $('#s-payee').value,
    highlight:$('#s-highlight').value,
    era:      $('#s-era').value,
    invFont:  Math.min(40, Math.max(14, num($('#s-font').value) || 24))
  });
  toast('บันทึกการตั้งค่าแล้ว', 'ok');
  updateDue();
  if ($('#invoice')) doReport();
}

async function testConn(){
  Settings.save({apiUrl: $('#s-api').value.trim(), token: $('#s-token').value.trim()});
  setConn('busy', 'กำลังทดสอบ...');
  try{
    await API.ping();
    setConn('ok', 'เชื่อมต่อสำเร็จ');
    toast('เชื่อมต่อฐานข้อมูล D1 สำเร็จ', 'ok');
    await loadAll(true);
  }catch(err){
    setConn('err', 'เชื่อมต่อไม่ได้');
    toast(err.message, 'err');
  }
}


/* ---------------- init ---------------- */
function init(){
  fillSettings();

  const today = new Date();
  $('#f-billdate').value = toISO(today);
  updateDue();

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) showPage(b.dataset.page);
  });

  $('#f-location').addEventListener('change', onLocationChange);
  $('#f-billdate').addEventListener('change', () => { updateDue(); onLocationChange(); });
  $('#f-water').addEventListener('input', () => {
    if (num($('#f-water').value) > 0) $('#f-nowater').checked = false;
  });

  $('#btn-report').addEventListener('click', doReport);
  $('#btn-save').addEventListener('click', doSave);
  $('#btn-print').addEventListener('click', () => {
    if (!$('#invoice')) doReport();
    if ($('#invoice')) window.print();
  });

  ['#d-location','#d-year','#d-search'].forEach(sel =>
    $(sel).addEventListener('input', renderDataPage));
  $('#d-table').addEventListener('click', onDataTableClick);
  $('#btn-refresh-data').addEventListener('click', () => loadAll());

  $('#btn-add-place').addEventListener('click', addPlace);
  $('#btn-add-tenant').addEventListener('click', addTenant);

  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-test').addEventListener('click', testConn);
  $('#btn-reload').addEventListener('click', () => loadAll());

  loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);
