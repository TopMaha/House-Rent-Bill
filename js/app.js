/* ===========================================================
   app.js — ตัวควบคุมหน้าจอทั้งหมด
   =========================================================== */

const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const state = { locations: [], tenants: [], data: [], loaded:false };

const PAGES = ['report', 'data', 'places', 'tenants', 'settings'];
const TH_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

function icon(name, cls){
  return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** 29 ส.ค. 2026 */
function shortDate(d){
  return d ? d.getDate() + ' ' + TH_MONTHS_SHORT[d.getMonth()] + ' ' + yearOf(d) : '';
}

/** ยอดรวมของบิลหนึ่งแถว (ตรงกับ "รวมทั้งสิ้น" บนใบแจ้งหนี้) */
function billTotal(r){
  return num(r.rent) + num(r.water) + num(r.elec) + num(r.other) - num(r.discount);
}

function isActiveTenant(t, onDate){
  const din = parseISO(t.dateIn), dout = parseISO(t.dateOut);
  return (!din || onDate >= din) && (!dout || onDate <= dout);
}

function setBusy(btn, busy, label){
  const span = btn.querySelector('span');
  if (busy){
    btn._label = span.innerHTML;
    span.textContent = label;
  }else if (btn._label){
    span.innerHTML = btn._label;
  }
  btn.disabled = busy;
  btn.classList.toggle('is-loading', busy);
}

/* ---------------- pages (มีลิงก์ตรงเช่น #data) ---------------- */
function showPage(name, opts){
  opts = opts || {};
  if (PAGES.indexOf(name) < 0) name = 'report';
  $$('.tab').forEach(b => {
    const on = b.dataset.page === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('.page').forEach(p => p.classList.toggle('is-active', p.id === 'page-' + name));
  document.body.dataset.page = name;
  if (location.hash !== '#' + name){
    try{ history.replaceState(null, '', '#' + name); }catch(e){}
  }
  if (!opts.keepScroll) window.scrollTo(0, 0);
  if (opts.focus){
    const h = $('#page-' + name + ' h1');
    if (h) h.focus({preventScroll: true});
  }
  if (name === 'report') requestAnimationFrame(fitInvoice);
}

/* ---------------- data loading ---------------- */
async function loadAll(silent){
  if (!state.loaded){
    const cached = Cache.read();
    if (cached){
      Object.assign(state, cached);
      renderAll();
      setConn('', 'ข้อมูลในเครื่อง · ' + state.data.length + ' บิล');
    }else if (typeof seedState === 'function'){
      Object.assign(state, seedState());          // สำเนาข้อมูลชุดที่ย้ายเข้า D1 (ไว้ดูตอนออฟไลน์)
      renderAll();
      setConn('', 'ข้อมูลตั้งต้น · ' + state.data.length + ' บิล');
    }
  }
  if (!API.configured()){
    setConn('err', 'ยังไม่ตั้งค่า URL');
    if (!silent) toast('ยังไม่ได้ตั้งค่า Worker API URL — ไปที่แท็บ “ตั้งค่า”', 'err');
    return;
  }
  if (!navigator.onLine){
    setConn('err', 'ออฟไลน์ · ' + state.data.length + ' บิล');
    if (!silent) toast('ไม่มีอินเทอร์เน็ต — แสดงข้อมูลที่เก็บไว้ในเครื่อง', 'err');
    return;
  }
  setConn('busy', 'กำลังโหลด…');
  try{
    const res = await API.bootstrap();
    state.locations = res.locations || [];
    state.tenants   = res.tenants   || [];
    state.data      = res.data      || [];
    state.loaded    = true;
    Cache.write({locations:state.locations, tenants:state.tenants, data:state.data, loaded:true});
    renderAll();
    setConn('ok', 'เชื่อมต่อแล้ว · ' + state.data.length + ' บิล');
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
  const keepD = $('#d-location').value;
  const keepY = $('#d-year').value;
  $('#f-location').innerHTML = opts;
  $('#t-location').innerHTML = opts;
  $('#d-location').innerHTML = '<option value="">ทั้งหมด</option>' + opts;
  if (keep) $('#f-location').value = keep;
  if (keepD) $('#d-location').value = keepD;

  const years = Array.from(new Set(state.data.map(r => (r.date || '').slice(0,4)).filter(Boolean))).sort().reverse();
  $('#d-year').innerHTML = '<option value="">ทั้งหมด</option>' + years.map(y => `<option>${y}</option>`).join('');
  if (keepY) $('#d-year').value = keepY;

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
  const active = list.filter(t => isActiveTenant(t, billDate));
  const pick = (active.length ? active : list).slice().sort((a,b) => {
    const da = parseISO(a.dateIn), db = parseISO(b.dateIn);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  })[0];
  return pick || null;
}

/** บิลของสถานที่นั้น เรียงใหม่สุดก่อน */
function billsOf(loc){
  return state.data
    .filter(r => sameLocation(r.location, loc))
    .sort((a,b) => String(b.date).localeCompare(String(a.date)));
}

/** ค่าเช่าล่าสุดของสถานที่นั้น */
function lastRentOf(loc){
  const r = billsOf(loc).find(r => num(r.rent) > 0);
  return r ? num(r.rent) : 0;
}

function onLocationChange(){
  const loc = $('#f-location').value;
  const bd  = parseISO($('#f-billdate').value) || new Date();
  const t   = tenantFor(loc, bd);
  if (t){
    $('#f-customer').value = t.name || '';
    $('#hint-customer').textContent = 'จากประวัติผู้เช่า: เข้าอยู่ ' + (t.dateIn ? shortDate(parseISO(t.dateIn)) : '-')
      + (t.dateOut ? ' ถึง ' + shortDate(parseISO(t.dateOut)) : ' (ยังอยู่)');
  }else{
    $('#hint-customer').textContent = state.tenants.length ? 'ไม่พบผู้เช่าของสถานที่นี้ในประวัติผู้เช่า' : '';
  }
  if (!num($('#f-rent').value)){
    const r = lastRentOf(loc);
    if (r) $('#f-rent').value = r.toFixed(2);
  }
  renderLastBill();
  updateDue();
  updateTotal();
}

function renderLastBill(){
  const el = $('#lastBill');
  const last = billsOf($('#f-location').value)[0];
  if (!last){ el.hidden = true; return; }
  const parts = [];
  if (num(last.water)) parts.push('น้ำ ' + money(last.water));
  if (num(last.elec))  parts.push('ไฟ ' + money(last.elec));
  el.innerHTML = icon('history', 'ic-sm')
    + `<span class="lb-main"><span>บิลล่าสุด ${shortDate(parseISO(last.date))}</span>`
    + (parts.length ? `<span class="dim">${parts.join(' · ')}</span>` : '') + '</span>'
    + `<span class="lb-total"><span class="dim">รวม</span><b>${money(billTotal(last))}</b></span>`;
  el.hidden = false;
}

function updateDue(){
  const bd = parseISO($('#f-billdate').value);
  $('#f-duedate').value = bd ? thaiDate(dueDateOf(bd), true) : '';
}

/** อ่านค่าจากฟอร์ม (ยังไม่ตรวจความครบถ้วน) */
function readForm(){
  const loc = $('#f-location').value;
  return {
    location: loc,
    address: addressOf(loc),
    customer: $('#f-customer').value.trim(),
    billDate: parseISO($('#f-billdate').value),
    rent: num($('#f-rent').value),
    water: num($('#f-water').value),
    elec: num($('#f-elec').value),
    waterExcluded: $('#f-nowater').checked,
    elecExcluded: $('#f-noelec').checked,
    disWater: num($('#f-dis-water').value),
    disElec: num($('#f-dis-elec').value),
    other: num($('#f-other').value),
    note: $('#f-note').value.trim()
  };
}

/** สูตรเดียวกับ "รวมทั้งสิ้น" ใน invoice.js */
function grandOf(m){
  const water = m.waterExcluded ? 0 : m.water;
  const elec  = m.elecExcluded  ? 0 : m.elec;
  return (m.rent + m.other) + (water - m.disWater) + (elec - m.disElec);
}

function updateTotal(){
  const g = grandOf(readForm());
  $('#f-total').textContent = money(g);
  $('#f-total-words').textContent = g ? bahtText(g) : '';
}

function currentModel(){
  const m = readForm();
  if (!m.billDate) { toast('กรุณาเลือกวันที่ออกบิล', 'err'); $('#f-billdate').focus(); return null; }
  if (!m.location) { toast('กรุณาเลือกสถานที่', 'err'); $('#f-location').focus(); return null; }
  return m;
}

function doReport(opts){
  opts = opts || {};
  const m = currentModel();
  if (!m) return;
  const host = $('#invoiceHost');
  host.innerHTML = '<div class="invoice-stage">' + buildInvoice(m) + '</div>';
  fitInvoice();
  if (opts.scroll !== false && window.matchMedia('(max-width: 1100px)').matches){
    $('#previewCol').scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start'});
  }
  return m;
}

/** ย่อใบแจ้งหนี้ (กว้าง 1045px) ให้พอดีจอ — กด "ขนาดจริง" เพื่อดูเต็มและเลื่อนซ้ายขวาได้ */
function fitInvoice(){
  const host = $('#invoiceHost');
  const inv = $('#invoice');
  const zoomBtn = $('#btn-zoom');
  if (!inv){ zoomBtn.hidden = true; return; }
  const stage = inv.parentElement;
  const avail = host.clientWidth - parseFloat(getComputedStyle(host).paddingLeft) * 2;
  if (avail <= 0) return;                      // หน้านี้ยังซ่อนอยู่ ไว้ย่อตอนเปิดหน้า
  const natural = inv.offsetWidth;
  const zoomed = host.classList.contains('is-zoomed');
  const s = zoomed ? 1 : Math.min(1, avail / natural);
  inv.style.transform = s < 1 ? 'scale(' + s + ')' : '';
  stage.style.width  = s < 1 ? Math.floor(natural * s) + 'px' : '';
  stage.style.height = s < 1 ? Math.ceil(inv.offsetHeight * s) + 'px' : '';
  zoomBtn.hidden = natural <= avail + 1;
}

function toggleZoom(){
  const host = $('#invoiceHost');
  const on = host.classList.toggle('is-zoomed');
  const btn = $('#btn-zoom');
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('use').setAttribute('href', on ? '#i-minimize' : '#i-maximize');
  btn.querySelector('span').textContent = on ? 'ย่อให้พอดีจอ' : 'ขนาดจริง';
  fitInvoice();
}

async function doSave(){
  const m = currentModel();
  if (!m) return;
  if (!API.configured()){ toast('ยังไม่ได้ตั้งค่า Worker API URL', 'err'); showPage('settings'); return; }

  const btn = $('#btn-save');
  setBusy(btn, true, 'กำลังบันทึก…');
  try{
    const res = await API.saveBill({
      date: toISO(m.billDate),
      location: m.location,
      name: m.customer,
      rent: m.rent,
      water: m.waterExcluded ? '' : m.water,
      elec: m.elecExcluded ? '' : m.elec,
      other: m.other,
      discount: m.disWater + m.disElec
    });
    toast(res.updated ? 'อัปเดตข้อมูลในฐานข้อมูลแล้ว (แถว ' + res.row + ')' : 'บันทึกลงฐานข้อมูลแล้ว (แถว ' + res.row + ')', 'ok');
    await loadAll(true);
  }catch(err){
    toast(err.message, 'err');
  }finally{
    setBusy(btn, false);
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

  let sRent = 0, sWater = 0, sElec = 0, sAll = 0;
  const body = rows.map(r => {
    const rent = num(r.rent), water = num(r.water), elec = num(r.elec), total = billTotal(r);
    sRent += rent; sWater += water; sElec += elec; sAll += total;
    const d = parseISO(r.date);
    const when = d ? shortDate(d) : escapeHtml(r.date || '');
    const key = escapeHtml(r.key);
    return `<tr>
      <td class="c-date">${when}</td>
      <td class="c-loc">${escapeHtml(r.location)}</td>
      <td class="c-name">${escapeHtml(r.name || '')}</td>
      <td class="num c-rent" data-label="ค่าเช่า">${money(rent)}</td>
      <td class="num c-water" data-label="ค่าน้ำ">${water ? money(water) : '<span class="dim">–</span>'}</td>
      <td class="num c-elec" data-label="ค่าไฟฟ้า">${elec ? money(elec) : '<span class="dim">–</span>'}</td>
      <td class="num c-sum">${money(total)}</td>
      <td class="c-act">
        <button class="btn btn-ghost btn-sm" data-act="bill" data-key="${key}">${icon('receipt', 'ic-sm')}<span>ออกบิลซ้ำ</span></button>
        <button class="icon-btn danger" data-act="del" data-key="${key}" aria-label="ลบบิลวันที่ ${when}">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');

  $('#d-table tbody').innerHTML = body || `<tr class="empty-row"><td colspan="8">
      <div class="empty">${icon('inbox')}<b>ไม่พบบิล</b><span>ลองเปลี่ยนตัวกรองหรือคำค้นหา</span></div></td></tr>`;

  const filtered = !!(loc || year || q);
  const first = rows.length ? parseISO(rows[rows.length-1].date) : null;
  $('#d-sub').textContent = rows.length
    ? rows.length + ' บิล' + (first ? ' · ตั้งแต่ ' + shortDate(first) : '') + (filtered ? ' (กรองอยู่)' : '')
    : 'ไม่มีข้อมูลที่ตรงกับตัวกรอง';

  $('#d-stats').innerHTML = `
    <div class="summary-main">
      <span class="k">ยอดรวมทั้งหมด</span>
      <b class="v">${money(sAll)}</b>
      <span class="sub">${rows.length} บิล · ${loc ? escapeHtml(loc) : 'ทุกสถานที่'} · ${year || 'ทุกปี'}</span>
    </div>
    <div class="summary-split">
      <div><span class="k">${icon('house', 'ic-sm')}ค่าเช่า</span><b>${money(sRent)}</b></div>
      <div><span class="k">${icon('droplet', 'ic-sm')}ค่าน้ำ</span><b>${money(sWater)}</b></div>
      <div><span class="k">${icon('zap', 'ic-sm')}ค่าไฟฟ้า</span><b>${money(sElec)}</b></div>
    </div>`;
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
    $('#f-noelec').checked  = !num(r.elec);
    renderLastBill();
    updateDue();
    updateTotal();
    showPage('report');
    doReport();
    return;
  }

  if (btn.dataset.act === 'del'){
    if (!confirm('ลบบิลวันที่ ' + shortDate(parseISO(r.date)) + ' ของ ' + r.location + ' ออกจากฐานข้อมูล?\n(ย้อนกลับไม่ได้)')) return;
    btn.disabled = true;
    try{
      await API.deleteBill(r.key);
      toast('ลบออกจากฐานข้อมูลแล้ว', 'ok');
      await loadAll(true);
    }catch(err){
      btn.disabled = false;
      toast(err.message, 'err');
    }
  }
}

/* ---------------- places / tenants ---------------- */
function renderPlaces(){
  const today = new Date();
  $('#p-sub').textContent = state.locations.length + ' แห่ง (ตาราง locations)';
  $('#p-list').innerHTML = state.locations.map(l => {
    const current = state.tenants.find(t => sameLocation(t.location, l.location) && isActiveTenant(t, today));
    const bills = billsOf(l.location);
    const last = bills[0];
    return `<li class="list-item">
      <span class="li-icon${current ? '' : ' is-off'}">${icon('house')}</span>
      <div class="li-body">
        <span class="li-title">${escapeHtml(l.location)}</span>
        <span class="li-sub">${escapeHtml(l.details || '')}</span>
        <div class="li-meta">
          <span class="badge ${current ? 'badge-on' : 'badge-off'}">${current ? 'มีผู้เช่า' : 'ว่าง'}</span>
          ${current ? `<span>${icon('user', 'ic-sm')}${escapeHtml(current.name)}</span>` : ''}
          <span>${icon('receipt', 'ic-sm')}${bills.length} บิล</span>
          ${last ? `<span>${icon('calendar', 'ic-sm')}ล่าสุด ${shortDate(parseISO(last.date))}</span>` : ''}
        </div>
      </div>
    </li>`;
  }).join('') || `<li class="empty">${icon('house')}<b>ยังไม่มีสถานที่</b><span>เพิ่มได้จากฟอร์มด้านล่าง</span></li>`;
}

function renderTenants(){
  const today = new Date();
  const list = state.tenants.map(t => ({t, active: isActiveTenant(t, today)}))
    .sort((a,b) => (b.active - a.active) || String(b.t.dateIn || '').localeCompare(String(a.t.dateIn || '')));
  const nActive = list.filter(x => x.active).length;
  $('#t-sub').textContent = list.length + ' คน · กำลังเช่า ' + nActive + ' คน';

  $('#t-list').innerHTML = list.map(({t, active}) => {
    const din = parseISO(t.dateIn), dout = parseISO(t.dateOut);
    return `<li class="list-item">
      <span class="li-icon${active ? '' : ' is-off'}">${icon('user')}</span>
      <div class="li-body">
        <span class="li-title">${escapeHtml(t.name || '')}</span>
        <span class="li-sub">${escapeHtml(t.location)}</span>
        <div class="li-meta">
          <span class="badge ${active ? 'badge-on' : 'badge-off'}">${active ? 'กำลังเช่า' : 'ย้ายออกแล้ว'}</span>
          <span>${icon('calendar', 'ic-sm')}${din ? shortDate(din) : '-'} → ${dout ? shortDate(dout) : 'ปัจจุบัน'}</span>
          ${t.deposit ? `<span>${icon('bank', 'ic-sm')}มัดจำ ${money(t.deposit)}</span>` : ''}
        </div>
      </div>
    </li>`;
  }).join('') || `<li class="empty">${icon('users')}<b>ยังไม่มีผู้เช่า</b><span>เพิ่มได้จากฟอร์มด้านล่าง</span></li>`;
}

async function addPlace(){
  const location = $('#p-location').value.trim();
  const details  = $('#p-detail').value.trim();
  if (!location){ $('#p-location').focus(); return toast('กรุณากรอกชื่อสถานที่', 'err'); }
  const btn = $('#btn-add-place');
  setBusy(btn, true, 'กำลังเพิ่ม…');
  try{
    await API.addLocation(location, details);
    $('#p-location').value = ''; $('#p-detail').value = '';
    toast('เพิ่มสถานที่ลงฐานข้อมูลแล้ว', 'ok');
    await loadAll(true);
  }catch(err){ toast(err.message, 'err'); }
  finally{ setBusy(btn, false); }
}

async function addTenant(){
  const t = {
    location: $('#t-location').value,
    name:     $('#t-name').value.trim(),
    dateIn:   $('#t-in').value,
    dateOut:  $('#t-out').value,
    deposit:  num($('#t-deposit').value)
  };
  if (!t.location || !t.name){ $('#t-name').focus(); return toast('กรุณากรอกสถานที่และชื่อผู้เช่า', 'err'); }
  const btn = $('#btn-add-tenant');
  setBusy(btn, true, 'กำลังเพิ่ม…');
  try{
    await API.addTenant(t);
    $('#t-name').value = ''; $('#t-in').value = ''; $('#t-out').value = ''; $('#t-deposit').value = '';
    toast('เพิ่มผู้เช่าลงฐานข้อมูลแล้ว', 'ok');
    await loadAll(true);
  }catch(err){ toast(err.message, 'err'); }
  finally{ setBusy(btn, false); }
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
  $('#s-highlight').value = s.highlightPrefix;
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
    highlightPrefix: $('#s-highlight').value,
    era:      $('#s-era').value,
    invFont:  Math.min(40, Math.max(14, num($('#s-font').value) || 24))
  });
  toast('บันทึกการตั้งค่าแล้ว', 'ok');
  updateDue();
  renderAll();
  if ($('#invoice')) doReport({scroll:false});
}

async function testConn(){
  Settings.save({apiUrl: $('#s-api').value.trim(), token: $('#s-token').value.trim()});
  const btn = $('#btn-test');
  setBusy(btn, true, 'กำลังทดสอบ…');
  setConn('busy', 'กำลังทดสอบ…');
  try{
    await API.ping();
    setConn('ok', 'เชื่อมต่อสำเร็จ');
    toast('เชื่อมต่อฐานข้อมูล D1 สำเร็จ', 'ok');
    await loadAll(true);
  }catch(err){
    setConn('err', 'เชื่อมต่อไม่ได้');
    toast(err.message, 'err');
  }finally{
    setBusy(btn, false);
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
    if (b) showPage(b.dataset.page, {focus: e.detail === 0});   // detail 0 = กดด้วยคีย์บอร์ด
  });
  window.addEventListener('hashchange', () => showPage(location.hash.slice(1), {keepScroll: true}));

  $('#f-location').addEventListener('change', onLocationChange);
  $('#f-billdate').addEventListener('change', () => { updateDue(); onLocationChange(); });
  $('#f-water').addEventListener('input', () => {
    if (num($('#f-water').value) > 0) $('#f-nowater').checked = false;
  });
  $('#f-elec').addEventListener('input', () => {
    if (num($('#f-elec').value) > 0) $('#f-noelec').checked = false;
  });
  $('#billForm').addEventListener('input', updateTotal);
  $('#billForm').addEventListener('change', updateTotal);

  $('#btn-report').addEventListener('click', () => doReport());
  $('#btn-save').addEventListener('click', doSave);
  $('#btn-print').addEventListener('click', () => {
    if (!$('#invoice')) doReport({scroll:false});
    if ($('#invoice')) window.print();
  });
  $('#btn-zoom').addEventListener('click', toggleZoom);

  ['#d-location','#d-year','#d-search'].forEach(sel =>
    $(sel).addEventListener('input', renderDataPage));
  $('#d-table').addEventListener('click', onDataTableClick);
  $('#btn-refresh-data').addEventListener('click', () => loadAll());

  $('#btn-add-place').addEventListener('click', addPlace);
  $('#btn-add-tenant').addEventListener('click', addTenant);

  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-test').addEventListener('click', testConn);
  $('#btn-reload').addEventListener('click', () => loadAll());

  if ('ResizeObserver' in window) new ResizeObserver(() => fitInvoice()).observe($('#invoiceHost'));
  else window.addEventListener('resize', fitInvoice);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitInvoice);

  window.addEventListener('online', () => loadAll(true));
  window.addEventListener('offline', () => setConn('err', 'ออฟไลน์ · ' + state.data.length + ' บิล'));

  showPage(location.hash.slice(1) || 'report', {keepScroll: true});
  loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);
