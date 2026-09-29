/* ===========================================================
   snapshot.js — วาดใบแจ้งหนี้เป็นรูป PNG ขนาดจริง (กว้าง 1045px เท่าบนจอ)
   ไว้คัดลอกไปวางส่งให้ผู้เช่าในแชท

   วาดเองด้วย Canvas จากตำแหน่งจริงของแต่ละช่องบนหน้าเว็บ ไม่พึ่งไลบรารีภายนอก ใช้ตอนออฟไลน์ได้
   รองรับเฉพาะที่ใบแจ้งหนี้ใช้: สีพื้น, เส้นขอบ, ข้อความ
   =========================================================== */

const SNAPSHOT_SCALE = 1;   // 1 = ขนาดเท่ารูปตัวอย่าง (1045px) ; 2 = ใหญ่และคมขึ้นเท่าตัว

/** @returns {Promise<Blob>} รูป PNG ของใบแจ้งหนี้ */
async function invoicePng(invoiceEl, scale){
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const canvas = drawInvoice(invoiceEl, scale || SNAPSHOT_SCALE);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('สร้างรูปไม่สำเร็จ')), 'image/png'));
}

function drawInvoice(src, scale){
  // วาดจากสำเนาที่ไม่ได้ย่อ (ตัวบนจอถูก scale ให้พอดีจอ)
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed; left:-20000px; top:0; pointer-events:none';
  const inv = src.cloneNode(true);
  inv.removeAttribute('id');
  inv.style.transform = '';
  host.appendChild(inv);
  document.body.appendChild(host);
  try{
    return paint(inv, scale);
  }finally{
    host.remove();
  }
}

function paint(inv, scale){
  const box = inv.getBoundingClientRect();
  const X = v => Math.round((v - box.left) * scale);
  const Y = v => Math.round((v - box.top) * scale);
  const lineW = w => Math.max(1, Math.round(w * scale));
  const visible = c => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);

  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const els = [inv].concat(Array.from(inv.querySelectorAll('*')));
  const styles = new Map(els.map(el => [el, getComputedStyle(el)]));

  // 1) สีพื้น
  els.forEach(el => {
    const cs = styles.get(el);
    if (!visible(cs.backgroundColor)) return;
    const r = el.getBoundingClientRect();
    ctx.fillStyle = cs.backgroundColor;
    ctx.fillRect(X(r.left), Y(r.top), X(r.right) - X(r.left), Y(r.bottom) - Y(r.top));
  });

  // 2) เส้นขอบ — ช่องตารางแบบ border-collapse เส้นอยู่กึ่งกลางขอบช่อง, อย่างอื่นอยู่ด้านในกรอบ
  els.forEach(el => {
    const cs = styles.get(el);
    const r = el.getBoundingClientRect();
    const x0 = X(r.left), x1 = X(r.right), y0 = Y(r.top), y1 = Y(r.bottom);
    const table = cs.display === 'table-cell' && el.closest('table');
    const collapsed = table && getComputedStyle(table).borderCollapse === 'collapse';
    ['Top', 'Right', 'Bottom', 'Left'].forEach(side => {
      const w = parseFloat(cs['border' + side + 'Width']);
      const st = cs['border' + side + 'Style'];
      if (!w || st === 'none' || st === 'hidden') return;
      const lw = lineW(w);
      ctx.fillStyle = cs['border' + side + 'Color'];
      if (collapsed){
        const h = Math.round(lw / 2);
        if (side === 'Top')    ctx.fillRect(x0 - h, y0 - h, x1 - x0 + lw, lw);
        if (side === 'Bottom') ctx.fillRect(x0 - h, y1 - h, x1 - x0 + lw, lw);
        if (side === 'Left')   ctx.fillRect(x0 - h, y0 - h, lw, y1 - y0 + lw);
        if (side === 'Right')  ctx.fillRect(x1 - h, y0 - h, lw, y1 - y0 + lw);
      }else{
        if (side === 'Top')    ctx.fillRect(x0, y0, x1 - x0, lw);
        if (side === 'Bottom') ctx.fillRect(x0, y1 - lw, x1 - x0, lw);
        if (side === 'Left')   ctx.fillRect(x0, y0, lw, y1 - y0);
        if (side === 'Right')  ctx.fillRect(x1 - lw, y0, lw, y1 - y0);
      }
    });
  });

  // 3) ข้อความ — วัดตำแหน่งทุกบรรทัดก่อน แล้วค่อยหาเส้นฐาน (baseline) ทีละก้อน
  const walker = document.createTreeWalker(inv, NodeFilter.SHOW_TEXT);
  const runs = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()){
    const start = node.data.search(/\S/);
    if (start < 0) continue;
    const end = node.data.replace(/\s+$/, '').length;
    const cs = styles.get(node.parentElement);
    if (!cs || cs.visibility === 'hidden' || cs.display === 'none') continue;
    runs.push({node, cs, lines: textLines(node, start, end)});
  }
  runs.forEach(run => { run.baseline = baselineOf(run.node); });

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  runs.forEach(({node, cs, lines, baseline}) => {
    if (!lines.length) return;
    ctx.font = [cs.fontStyle, cs.fontWeight, (parseFloat(cs.fontSize) * scale) + 'px', cs.fontFamily].join(' ');
    ctx.fillStyle = cs.color;
    const clip = clipRectOf(node.parentElement, inv, styles);
    ctx.save();
    if (clip){
      ctx.beginPath();
      ctx.rect(X(clip.left), Y(clip.top), X(clip.right) - X(clip.left), Y(clip.bottom) - Y(clip.top));
      ctx.clip();
    }
    const ascent = baseline - lines[0].top;
    lines.forEach(l => ctx.fillText(l.text, (l.left - box.left) * scale, Y(l.top + ascent)));
    ctx.restore();
  });

  return canvas;
}

/** แบ่งข้อความเป็นบรรทัดตามที่เบราว์เซอร์ตัดจริง: [{text, left, top}] */
function textLines(node, start, end){
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const lines = [];
  Array.from(range.getClientRects()).forEach(r => {
    if (!r.width) return;
    const same = lines.find(l => Math.abs(l.top - r.top) < 2);
    if (same) same.left = Math.min(same.left, r.left);
    else lines.push({top: r.top, left: r.left, text: ''});
  });
  const squash = s => s.replace(/\s+/g, ' ');
  if (lines.length <= 1){
    if (lines[0]) lines[0].text = squash(node.data.slice(start, end));
    return lines;
  }
  // หลายบรรทัด: ไล่ทีละตัวอักษรว่าอยู่บรรทัดไหน
  lines.sort((a, b) => a.top - b.top);
  let li = 0;
  for (let i = start; i < end; i++){
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getClientRects()[0];
    if (r && r.width){
      let best = li;
      lines.forEach((l, k) => { if (Math.abs(l.top - r.top) < Math.abs(lines[best].top - r.top)) best = k; });
      li = best;
    }
    lines[li].text += node.data[i];
  }
  lines.forEach(l => { l.text = squash(l.text).trim(); });
  return lines.filter(l => l.text);
}

/** เส้นฐานของข้อความ = ตำแหน่งกล่องสูง 0px ที่วางชิด baseline ไว้ข้างหน้าข้อความ */
function baselineOf(node){
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block; width:0; height:0; vertical-align:baseline';
  node.parentNode.insertBefore(marker, node);
  const y = marker.getBoundingClientRect().top;
  marker.remove();
  return y;
}

/** กรอบที่ตัดข้อความทิ้ง (บรรพบุรุษที่ overflow ไม่ใช่ visible) */
function clipRectOf(el, root, styles){
  let clip = null;
  for (let e = el; e && e !== root; e = e.parentElement){
    const cs = styles.get(e);
    if (!cs || (cs.overflowX === 'visible' && cs.overflowY === 'visible')) continue;
    const r = e.getBoundingClientRect();
    clip = clip
      ? {left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top),
         right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom)}
      : {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
  }
  return clip;
}
