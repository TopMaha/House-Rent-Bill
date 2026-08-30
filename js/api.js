/* ===========================================================
   api.js — คุยกับ Cloudflare Worker (ฐานข้อมูล D1)
   ยังใช้ POST แบบ text/plain เหมือนเดิม เพื่อไม่ให้เบราว์เซอร์ต้องยิง preflight ก่อนทุกครั้ง
   =========================================================== */

const API = {
  get url(){ return (Settings.data.apiUrl || '').trim(); },
  get token(){ return (Settings.data.token || '').trim(); },

  configured(){ return /^https:\/\/[^\s]+$/.test(this.url); },

  async call(action, payload){
    if (!this.configured()){
      throw new Error('ยังไม่ได้ตั้งค่า Worker API URL (ไปที่แท็บ “ตั้งค่า”)');
    }
    const body = Object.assign({action, token: this.token}, payload || {});
    let res;
    try{
      res = await fetch(this.url, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(body),
        redirect: 'follow'
      });
    }catch(err){
      throw new Error('เชื่อมต่อไม่ได้ — ตรวจสอบว่า Worker ถูก deploy แล้ว และ URL ในหน้า “ตั้งค่า” ถูกต้อง');
    }
    const text = await res.text();
    let json;
    try{ json = JSON.parse(text); }
    catch(e){
      throw new Error('ผลลัพธ์ไม่ใช่ JSON — URL อาจผิด หรือ Worker ตอบกลับผิดพลาด');
    }
    if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาดจากสคริปต์');
    return json.result;
  },

  ping(){ return this.call('ping'); },
  bootstrap(){ return this.call('bootstrap'); },
  saveBill(bill){ return this.call('saveBill', bill); },
  deleteBill(key){ return this.call('deleteBill', {key}); },
  addLocation(location, details){ return this.call('addLocation', {location, details}); },
  addTenant(t){ return this.call('addTenant', t); }
};

/* ---------- แคชข้อมูลล่าสุดไว้ในเครื่อง เผื่อเปิดดูตอนออฟไลน์ ---------- */
const Cache = {
  read(){
    try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
    catch(e){ return null; }
  },
  write(state){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(state)); }catch(e){}
  }
};
