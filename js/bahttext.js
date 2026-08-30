/* ===========================================================
   bahttext.js — แปลงตัวเลขเป็นตัวหนังสือภาษาไทย
   8148.71 -> "แปดพันหนึ่งร้อยสี่สิบแปดบาทเจ็ดสิบเอ็ดสตางค์"
   =========================================================== */

const BT_DIGITS = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const BT_UNITS  = ['','สิบ','ร้อย','พัน','หมื่น','แสน'];

/** อ่านเลขกลุ่มละไม่เกิน 6 หลัก */
function btReadGroup(s){
  s = String(s).replace(/^0+/, '');
  if (!s) return '';
  let out = '';
  const len = s.length;
  for (let i = 0; i < len; i++){
    const d = +s[i];
    const pos = len - i - 1;          // 0 = หลักหน่วย
    if (d === 0) continue;
    if (pos === 0){
      out += (d === 1 && len > 1) ? 'เอ็ด' : BT_DIGITS[d];
    } else if (pos === 1){
      out += (d === 1) ? 'สิบ' : (d === 2 ? 'ยี่สิบ' : BT_DIGITS[d] + 'สิบ');
    } else {
      out += BT_DIGITS[d] + BT_UNITS[pos];
    }
  }
  return out;
}

/** อ่านจำนวนเต็ม (รองรับหลักล้านขึ้นไป) */
function btReadInteger(n){
  let s = String(Math.floor(Math.abs(n))).replace(/^0+/, '');
  if (!s) return 'ศูนย์';
  let out = '';
  while (s.length > 6){
    out = btReadGroup(s.slice(-6)) + 'ล้าน' + out;
    s = s.slice(0, -6);
  }
  return btReadGroup(s) + out;
}

/** ตัวเลข -> ข้อความบาท/สตางค์ */
function bahtText(amount){
  let v = Math.round(Number(amount || 0) * 100) / 100;
  const neg = v < 0;
  v = Math.abs(v);

  const baht   = Math.floor(v);
  const satang = Math.round((v - baht) * 100);

  let out;
  if (baht === 0 && satang === 0){
    out = 'ศูนย์บาทถ้วน';
  } else if (satang === 0){
    out = btReadInteger(baht) + 'บาทถ้วน';
  } else if (baht === 0){
    out = btReadInteger(satang) + 'สตางค์';
  } else {
    out = btReadInteger(baht) + 'บาท' + btReadInteger(satang) + 'สตางค์';
  }
  return (neg ? 'ลบ' : '') + out;
}
