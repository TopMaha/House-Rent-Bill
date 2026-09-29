/* ===========================================================
   pwa.js — ทำให้เว็บติดตั้งเป็นแอปบนมือถือได้
   - ลงทะเบียน Service Worker (sw.js) ให้เปิดแบบออฟไลน์ได้
   - Android / Chrome / Edge: เก็บ event "beforeinstallprompt" ไว้ แล้วโชว์ปุ่ม "ติดตั้ง"
   - iPhone / iPad: Safari ไม่มีปุ่มติดตั้งให้เรียก จึงเปิดแผ่นวิธีทำ (แชร์ > เพิ่มไปยังหน้าจอโฮม)
   =========================================================== */

const APP_URL = 'https://topmaha.github.io/House-Rent-Bill/';
const INSTALL_DISMISS_KEY = 'hrb.installDismissed.v1';

const PWA = {
  deferred: null,

  get standalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },
  get isIOS(){
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },
  get isMobile(){
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '') || this.isIOS;
  },
  get dismissed(){
    try{ return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'; }catch(e){ return false; }
  },

  /** ลิงก์ของแอป — ตอนเปิดจากเว็บจริงใช้ URL ปัจจุบัน ตอนเปิดไฟล์จากเครื่องใช้ลิงก์ GitHub Pages */
  url(){
    return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : APP_URL;
  },

  init(){
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed', err));
      });
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e;
      this.refresh();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.refresh();
      if (typeof toast === 'function') toast('ติดตั้งแอปแล้ว — เปิดได้จากไอคอน “ค่าเช่าบ้าน” บนหน้าโฮม', 'ok');
    });

    document.addEventListener('DOMContentLoaded', () => {
      const link = document.getElementById('appLink');
      if (link) link.value = this.url();

      document.getElementById('btn-install').addEventListener('click', () => this.install());
      document.getElementById('btn-install-banner').addEventListener('click', () => this.install());
      document.getElementById('btn-install-dismiss').addEventListener('click', () => {
        try{ localStorage.setItem(INSTALL_DISMISS_KEY, '1'); }catch(e){}
        this.refresh();
      });
      document.getElementById('btn-copy-link').addEventListener('click', () => this.copyLink());

      const shareBtn = document.getElementById('btn-share-link');
      if (navigator.share){
        shareBtn.hidden = false;
        shareBtn.addEventListener('click', () => {
          navigator.share({title: 'House Rent Bill', text: 'ระบบออกใบแจ้งหนี้ค่าเช่า', url: this.url()}).catch(() => {});
        });
      }
      this.refresh();
    });
  },

  async install(){
    if (this.deferred){
      this.deferred.prompt();
      const choice = await this.deferred.userChoice.catch(() => null);
      this.deferred = null;
      if (choice && choice.outcome === 'accepted'){
        try{ localStorage.setItem(INSTALL_DISMISS_KEY, '1'); }catch(e){}
      }
      this.refresh();
      return;
    }
    if (this.isIOS){
      const sheet = document.getElementById('iosSheet');
      if (sheet && typeof sheet.showModal === 'function') sheet.showModal();
      else if (typeof showPage === 'function') showPage('settings');
      return;
    }
    if (typeof showPage === 'function'){
      showPage('settings');
      document.getElementById('installCard').scrollIntoView({block: 'start'});
    }
  },

  async copyLink(){
    const url = this.url();
    try{
      await navigator.clipboard.writeText(url);
      toast('คัดลอกลิงก์แล้ว', 'ok');
    }catch(e){
      const input = document.getElementById('appLink');
      input.focus(); input.select();
      toast('กดค้างที่ช่องลิงก์แล้วเลือก “คัดลอก”');
    }
  },

  refresh(){
    const standalone = this.standalone;
    const banner = document.getElementById('installBanner');
    if (!banner) return;

    banner.hidden = standalone || this.dismissed || !(this.deferred || this.isMobile);
    document.getElementById('btn-install').hidden = standalone || !(this.deferred || this.isIOS);
    document.getElementById('installedNote').hidden = !standalone;
    document.documentElement.classList.toggle('is-standalone', standalone);
  }
};

PWA.init();
