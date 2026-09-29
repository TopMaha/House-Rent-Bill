/* ===========================================================
   invoice.js — สร้าง HTML ใบแจ้งหนี้ให้เหมือนหน้า "House Rent Bill" ในชีต
   =========================================================== */

/**
 * ใบแจ้งหนี้ออกแบบมากับฟอนต์ Angsana New (มีใน Windows) — มือถือไม่มีฟอนต์นี้
 * ถ้าหาไม่เจอ ให้ใช้ Sarabun แทนแต่ย่อลง (Sarabun ของ Google ตัวใหญ่กว่าราว 1.4 เท่า) ไม่งั้นข้อความจะล้นช่อง
 */
(function detectInvoiceFont(){
  function hasLocalFont(name){
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return true;
    const sample = 'ใบแจ้งหนี้ Invoice 0123456789';
    return ['monospace', 'serif', 'sans-serif'].some(base => {
      ctx.font = '40px ' + base;
      const w0 = ctx.measureText(sample).width;
      ctx.font = '40px "' + name + '", ' + base;
      return ctx.measureText(sample).width !== w0;
    });
  }
  const ok = ['Angsana New', 'AngsanaUPC', 'TH Sarabun New'].some(hasLocalFont);
  document.documentElement.classList.toggle('inv-no-angsana', !ok);
})();

/**
 * @param {object} m
 *  location, address, customer, billDate:Date,
 *  rent, water, elec, waterExcluded, disWater, disElec, other, note
 */
function buildInvoice(m){
  const s        = Settings.data;
  const billDate = m.billDate;
  const due      = dueDateOf(billDate);
  const monthTxt = TH_MONTHS[billDate.getMonth()] + ' ' + yearOf(billDate);
  const lastDay  = lastDayOfMonth(billDate);

  const rent      = num(m.rent);
  const elec      = num(m.elec);
  const water     = m.waterExcluded ? 0 : num(m.water);
  const disWater  = num(m.disWater);
  const disElec   = num(m.disElec);
  const other     = num(m.other);

  const row1Total = rent + water + elec;
  const row2Total = -(disWater + disElec);
  const row3Total = other;

  const qtyTotal   = rent + other;
  const waterTotal = water - disWater;
  const elecTotal  = elec  - disElec;
  const grand      = qtyTotal + waterTotal + elecTotal;

  const neg = v => v ? '-' + money(v) : '';

  const rows = [
    {
      no: 1,
      item: `ค่าเช่าวันที่ 1 ${monthTxt} ถึง ${lastDay} ${monthTxt}`,
      qty: money(rent, true),
      water: m.waterExcluded ? '' : money(water, true),
      elec: money(elec, true),
      total: money(row1Total, true)
    },
    {
      no: 2,
      item: `ส่วนลดค่าน้ำ-ค่าไฟฟ้า ผู้เช่าจ่ายประจำเดือน ${monthTxt}`,
      qty: '',
      water: neg(disWater),
      elec: neg(disElec),
      total: row2Total ? money(row2Total) : ''
    },
    {
      no: 3,
      item: 'ค่าใช้จ่ายอื่นๆ',
      qty: money(other, true),
      water: '',
      elec: '',
      total: money(row3Total, true)
    }
  ];

  const rowsHtml = rows.map(r => `
        <tr>
          <td class="c-no">${r.no}</td>
          <td class="c-item">${escapeHtml(r.item)}</td>
          <td class="c-qty">${r.qty}</td>
          <td class="c-water">${r.water}</td>
          <td class="c-elec">${r.elec}</td>
          <td class="c-total">${r.total}</td>
        </tr>`).join('');

  const extraNote = m.note
    ? `<div class="foot-line">${escapeHtml(m.note)}</div>` : '';

  const highlight = (m.waterExcluded && s.highlight)
    ? `<span class="foot-highlight">${escapeHtml(s.highlight)}</span>` : '';

  return `
<div class="invoice" id="invoice" style="--inv-font:${s.invFont || 24}px">

  <div class="inv-head">
    <div class="inv-head-left">
      <div class="loc-box"><span>${escapeHtml(m.location)}</span><span class="caret">&#9660;</span></div>
      <div class="inv-addr">${escapeHtml(m.address || '')}</div>
      <div class="inv-cust"><span class="cust-label">ผู้เช่า (Customer) :</span><span class="cust-name">${escapeHtml(m.customer || '')}</span></div>
    </div>
    <div class="inv-head-right">
      <div class="inv-title">ใบแจ้งหนี้ (Invoice)</div>
      <div class="inv-meta"><span class="lbl">ออกเมื่อวันที่</span><span class="val">${thaiDate(billDate)}</span></div>
      <div class="inv-meta"><span class="lbl">กำหนดชำระเงิน</span><span class="val">${thaiDate(due, true)}</span></div>
    </div>
  </div>

  <table class="inv-table">
    <thead>
      <tr>
        <th style="width:13.3%">ลำดับที่</th>
        <th style="width:43.4%">รายการ / Fee Item</th>
        <th style="width:10.2%">จำนวน</th>
        <th style="width:13.4%">ค่าน้ำ</th>
        <th style="width:10.4%">ค่าไฟฟ้า</th>
        <th style="width:9.3%">รวม</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}
    </tbody>
  </table>

  <table class="inv-sum">
    <tr>
      <td class="s-no"></td>
      <td class="s-item"></td>
      <td class="s-qty">${money(qtyTotal)}</td>
      <td class="s-water">${money(waterTotal)}</td>
      <td class="s-elec">${money(elecTotal)}</td>
      <td class="s-total"></td>
    </tr>
  </table>

  <div class="inv-grand">
    <div class="g-label">รวมทั้งสิ้น</div>
    <div class="g-text">${escapeHtml(bahtText(grand))}</div>
    <div class="g-amount">${money(grand)}</div>
  </div>

  <div class="inv-foot">
    <div class="inv-foot-left">
      <div class="foot-title">หมายเหตุ</div>
      <div class="foot-line">ชำระภายในวันที่ ${thaiDate(due, true)}</div>
      ${extraNote}
      ${highlight}
    </div>
    <div class="inv-foot-right">
      <div class="bank-head">${escapeHtml(s.payHead)}</div>
      <div class="bank-line">${escapeHtml(s.account)}</div>
      <div class="bank-line">${escapeHtml(s.bank)}</div>
      <div class="bank-line">${escapeHtml(s.payee)}</div>
    </div>
  </div>

</div>`;
}
