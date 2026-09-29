# House Rent Bill — ระบบออกใบแจ้งหนี้ค่าเช่า (GitHub Pages + Cloudflare D1)

เว็บแอปสำหรับออก **ใบแจ้งหนี้ (Invoice)** ค่าเช่าบ้าน/คอนโด หน้าตาเหมือนหน้า `House Rent Bill`
ในสเปรดชีตเดิม พร้อมเก็บข้อมูลย้อนหลังทั้งหมดไว้บน **Cloudflare D1**

> เดิมระบบเก็บข้อมูลใน Google Sheet ผ่าน Apps Script — ตอนนี้ **ย้ายมาอยู่บน D1 แล้วทั้งหมด**
> (ข้อมูลเก่าถูกคัดลอกมาครบ: 2 สถานที่ / 4 ผู้เช่า / 46 บิล ตั้งแต่ 30/4/2023 ถึง 29/8/2026)

```
[ เว็บ (GitHub Pages) ]  --POST-->  [ Cloudflare Worker ]  <-->  [ D1: house-rent-bill ]
   กรอกค่าน้ำ/ค่าไฟ                  house-rent-bill-api            locations
   กด Report -> ใบแจ้งหนี้           action-based JSON API          tenants
   กดบันทึก -> เขียนลง D1                                           bills
```

| ส่วน | ที่อยู่ |
|---|---|
| เว็บ | https://topmaha.github.io/House-Rent-Bill/ |
| API | https://house-rent-bill-api.wiphawas-sketchup.workers.dev |
| ฐานข้อมูล | Cloudflare D1 ชื่อ `house-rent-bill` (region APAC) |
| โค้ด | https://github.com/TopMaha/House-Rent-Bill |

---

## 1. โครงสร้างไฟล์

```
index.html                    หน้าเว็บทั้งหมด (5 แท็บ — มือถือเป็นแถบเมนูด้านล่างแบบแอป)
manifest.webmanifest          ข้อมูลแอปสำหรับติดตั้งบนมือถือ (ชื่อ ไอคอน สีธีม)
sw.js                         Service Worker — ทำให้ติดตั้งได้ + เปิดตอนออฟไลน์ได้
icons/                        ไอคอนแอป (svg + png ทุกขนาด) และ QR code ลิงก์ของแอป
css/styles.css                สไตล์ UI (รองรับโหมดมืด) + ใบแจ้งหนี้ (ส่วน INVOICE คุมหน้าตาให้ตรงรูปตัวอย่าง)
js/config.js                  ค่าตั้งต้น (รวม URL ของ Worker) + ฟังก์ชันวันที่/ตัวเลข
js/bahttext.js                แปลงตัวเลขเป็นตัวหนังสือไทย
js/seed-data.js               สำเนาข้อมูลไว้ดูตอนออฟไลน์ (ชุดเดียวกับที่ย้ายเข้า D1)
js/api.js                     เรียก Worker API + แคชข้อมูลล่าสุดในเครื่อง
js/invoice.js                 ประกอบ HTML ใบแจ้งหนี้
js/pwa.js                     ปุ่มติดตั้งแอป / วิธีติดตั้งบน iPhone / คัดลอก-แชร์ลิงก์
js/app.js                     ตัวควบคุมหน้าจอ

worker/wrangler.toml          ตั้งค่า Worker + binding ของ D1
worker/src/index.js           API ทั้งหมด (ping / bootstrap / saveBill / deleteBill / addLocation / addTenant)
worker/schema.sql             โครงสร้างตาราง 3 ตาราง
worker/seed.sql               ข้อมูลที่คัดลอกมาจากสเปรดชีตเดิม
worker/tools/pull-from-sheet.mjs   สคริปต์ดึงข้อมูลจากชีตมาสร้าง seed.sql ใหม่

legacy/apps-script/           โค้ด Google Apps Script ชุดเดิม (เลิกใช้แล้ว เก็บไว้อ้างอิง)
```

---

## 2. ฐานข้อมูล D1

| ตาราง | มาจากชีต | คอลัมน์ |
|---|---|---|
| `locations` | House Rental Details | `id, location, details, created_at` |
| `tenants` | Rental History | `id, location, name, date_in, date_out, deposit, created_at` |
| `bills` | Data | `id, bill_key, date, location, name, rent, water, elec, other, discount, updated_at` |

`bill_key` คือคีย์กันข้อมูลซ้ำแบบเดียวกับที่ชีตเดิมใช้ = *serial ของวันที่ (ฐาน 30/12/1899)* + *ชื่อสถานที่*
เช่น `46263หมู่บ้านร่มเย็น 3 บ้านเลขที่ 995/158` — บันทึกบิลของสถานที่เดิมในวันเดิมซ้ำ จะ **อัปเดตทับแถวเดิม** ไม่สร้างแถวใหม่

คอลัมน์ `other` (ค่าใช้จ่ายอื่นๆ) และ `discount` (ส่วนลด) เก็บได้แล้วบน D1 — ชีตเดิมไม่ได้เก็บไว้

### คำสั่งที่ใช้บ่อย

สร้างตารางใหม่ทั้งหมด (ล้างข้อมูลเดิมทิ้ง):

```bash
cd worker && npx wrangler d1 execute house-rent-bill --remote --file=schema.sql
```

โหลดข้อมูลจากไฟล์ seed:

```bash
cd worker && npx wrangler d1 execute house-rent-bill --remote --file=seed.sql
```

ดูข้อมูลเร็วๆ:

```bash
cd worker && npx wrangler d1 execute house-rent-bill --remote --command "SELECT COUNT(*) FROM bills"
```

### คัดลอกข้อมูลจากชีตเดิมอีกรอบ

```bash
cd worker && node tools/pull-from-sheet.mjs
```

สคริปต์จะยิง `action=bootstrap` ไปที่ Apps Script Web App เดิม แล้วเขียน `seed.sql` ใหม่ให้
จากนั้นค่อยสั่ง `wrangler d1 execute ... --file=seed.sql`
⚠️ `seed.sql` ขึ้นต้นด้วย `DELETE` ทั้ง 3 ตาราง = เขียนทับข้อมูลใน D1 ทั้งหมด บิลที่ออกใหม่บนเว็บจะหายไปด้วย

---

## 3. API (Cloudflare Worker)

ยิงได้ทั้ง `POST /` (body เป็น JSON) และ `GET /?action=...`
ตอบกลับรูปแบบเดียวเสมอ: `{ok:true, action, result}` หรือ `{ok:false, action, error}`

| action | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `ping` | — | เช็คว่าต่อ D1 ได้ + นับจำนวนแถวแต่ละตาราง |
| `bootstrap` | — | ดึง `locations`, `tenants`, `data` ทั้งหมด |
| `saveBill` | `date, location, name, rent, water, elec, other, discount` | เพิ่ม/อัปเดตบิล (ชนคีย์ = อัปเดต) |
| `deleteBill` | `key` | ลบบิลตาม `bill_key` |
| `addLocation` | `location, details` | เพิ่มสถานที่ |
| `addTenant` | `location, name, dateIn, dateOut, deposit` | เพิ่มผู้เช่า |

ทดสอบ:

```bash
curl "https://house-rent-bill-api.wiphawas-sketchup.workers.dev/?action=ping"
```

### แก้โค้ด API แล้ว deploy

```bash
cd worker && npx wrangler deploy
```

### ล็อกไม่ให้คนอื่นยิง API (ไม่บังคับ)

```bash
cd worker && npx wrangler secret put AUTH_TOKEN
```

แล้วนำรหัสเดียวกันไปกรอกช่อง **Token** ในแท็บ "ตั้งค่า" ของเว็บ
ส่วน `ALLOWED_ORIGIN` ใน `wrangler.toml` จำกัด origin ที่เรียกได้ (`*` = ทุกที่ ใส่หลายค่าคั่นด้วยจุลภาคได้)

---

## 4. เปิดใช้เว็บ (GitHub Pages)

```bash
git push -u origin main
```

ที่ GitHub → **Settings › Pages** → *Source:* `Deploy from a branch` → *Branch:* `main` / `/ (root)` → **Save**
จะได้ลิงก์ `https://topmaha.github.io/House-Rent-Bill/`

URL ของ Worker ฝังไว้ใน [`js/config.js`](js/config.js) แล้ว เปิดเว็บมาก็ใช้ได้เลยทุกเครื่อง
(ถ้าอยากชี้ไป Worker ตัวอื่น แก้ในแท็บ **ตั้งค่า** ได้ ระบบจำไว้ในเบราว์เซอร์เครื่องนั้น)

เปิดไฟล์ `index.html` จากเครื่องตรงๆ ก็ใช้ได้ เพราะ Worker เปิด CORS ไว้

### ติดตั้งเป็นแอปบนมือถือ

เปิดลิงก์ https://topmaha.github.io/House-Rent-Bill/ บนมือถือ (หรือสแกน QR ในแท็บ **ตั้งค่า** จากคอม) แล้ว

| มือถือ | วิธีติดตั้ง |
|---|---|
| **iPhone / iPad** | เปิดด้วย **Safari** → แตะปุ่มแชร์ → **เพิ่มไปยังหน้าจอโฮม** → **เพิ่ม** |
| **Android** | เปิดด้วย **Chrome** → กดปุ่ม **ติดตั้ง** ที่แถบบนหน้าออกบิล หรือเมนู ⋮ → **ติดตั้งแอป** |

จะได้ไอคอน **“ค่าเช่าบ้าน”** บนหน้าโฮม เปิดแล้วเต็มจอเหมือนแอป (ไม่มีแถบที่อยู่เว็บ)
ลิงก์ตรงเข้าแต่ละหน้าได้ เช่น `…/House-Rent-Bill/#data` (ข้อมูลย้อนหลัง) — กดไอคอนค้างไว้บน Android จะมีทางลัด “ออกบิล / ย้อนหลัง”

- แก้โค้ดแล้ว push ขึ้น GitHub เครื่องที่ติดตั้งไว้จะได้เวอร์ชันใหม่ตอนเปิดแอปครั้งถัดไปเอง (Service Worker ถามเซิร์ฟเวอร์ก่อนทุกครั้ง)
- ถ้าเพิ่มไฟล์ใหม่ที่อยากให้เปิดออฟไลน์ได้ ให้ใส่ชื่อไฟล์ใน `ASSETS` ของ [`sw.js`](sw.js) แล้วเลื่อน `VERSION` ขึ้น
- ไอคอนต้นฉบับคือ `icons/icon.svg` และ `icons/icon-maskable.svg` (ไฟล์ png แปลงมาจาก 2 ไฟล์นี้)
- มือถือไม่มีฟอนต์ Angsana New ใบแจ้งหนี้จะใช้ Sarabun ที่ย่อขนาดให้เท่ากันแทนอัตโนมัติ

---

## 5. วิธีใช้งาน

| แท็บ | หน้าที่ | ตารางที่เกี่ยวข้อง |
|---|---|---|
| **ออกบิล (Report)** | เลือกสถานที่ → กรอกค่าน้ำ/ค่าไฟฟ้า → กด **ออกรายงาน** ได้ใบแจ้งหนี้ | `bills` |
| **ข้อมูลย้อนหลัง (Data)** | ดู/กรอง/ค้นหาบิลเก่าทั้งหมด, ออกบิลซ้ำ, ลบ | `bills` |
| **สถานที่เช่า** | ดู/เพิ่มบ้าน–คอนโดที่ปล่อยเช่า | `locations` |
| **ผู้เช่า** | ดู/เพิ่มประวัติผู้เช่า พร้อมสถานะกำลังเช่า | `tenants` |
| **ตั้งค่า** | URL ของ API, เลขบัญชีธนาคาร, ขนาดตัวอักษร, ปี ค.ศ./พ.ศ. | — |

ขั้นตอนปกติต่อเดือน

1. แท็บ **ออกบิล** → เลือกสถานที่ (ชื่อผู้เช่า + ค่าเช่ามาให้อัตโนมัติจากฐานข้อมูล)
2. กรอก **ค่าน้ำ** และ **ค่าไฟฟ้า** — ถ้าเดือนนี้ยังไม่รู้ค่าน้ำ/ค่าไฟ ให้เปิดสวิตช์ *"ยังไม่รวมค่าน้ำ"* และ/หรือ *"ยังไม่รวมค่าไฟฟ้า"* ช่องนั้นจะเว้นว่างและมีหมายเหตุไฮไลต์เหลือง (เช่น "ยังไม่รวมค่าน้ำ-ค่าไฟฟ้า")
3. กด **ออกรายงาน (Report)** → ตรวจใบแจ้งหนี้
4. กด **บันทึกลงฐานข้อมูล** → เขียนลง D1
5. กด **พิมพ์ / บันทึก PDF** → สั่งพิมพ์ A4 แนวนอน หรือเลือก *Save as PDF* แล้วส่งให้ผู้เช่า

**กำหนดชำระเงิน** ระบบคิดให้เป็น **วันที่ 5 ของเดือนถัดไป** เสมอ (เช่น บิลวันที่ 29 สิงหาคม 2026 → ครบกำหนด 05 กันยายน 2026)
เปลี่ยนวันได้ที่ `dueDay` ใน [`js/config.js`](js/config.js)

### ข้อมูลตอนออฟไลน์

ตัวแอป (หน้าเว็บ + สคริปต์) ถูกเก็บไว้ในเครื่องด้วย Service Worker จึงเปิดได้แม้ไม่มีเน็ต แต่บันทึก/ลบข้อมูลต้องออนไลน์
ลำดับความสำคัญของข้อมูลตอนเปิดแอป: **ข้อมูลสดจาก D1 › สำเนาที่แคชไว้ในเครื่อง › ข้อมูลตั้งต้นใน [`js/seed-data.js`](js/seed-data.js)**
เมื่อเชื่อมต่อ API สำเร็จเมื่อไร ข้อมูลสดจะเขียนทับทันที (มุมขวาบนบอกอยู่ว่ากำลังใช้ข้อมูลชุดไหน)

---

## 6. ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| กดทดสอบแล้วขึ้น "เชื่อมต่อไม่ได้" | เช็คว่า `npx wrangler deploy` สำเร็จ และ URL ในแท็บ **ตั้งค่า** ถูกต้อง |
| ขึ้น "origin ไม่ได้รับอนุญาต" | เพิ่ม origin ของเว็บลง `ALLOWED_ORIGIN` ใน `worker/wrangler.toml` แล้ว deploy ใหม่ |
| ขึ้น "token ไม่ถูกต้อง" | ตั้ง `AUTH_TOKEN` ไว้ที่ Worker แต่ยังไม่ได้กรอก Token ในแท็บ **ตั้งค่า** |
| แก้โค้ดใน `worker/` แล้วไม่มีผล | ต้อง `cd worker && npx wrangler deploy` ทุกครั้ง |
| ตัวอักษรบนใบแจ้งหนี้เล็ก/ใหญ่ไป | แท็บ **ตั้งค่า › ขนาดตัวอักษรใบแจ้งหนี้ (px)** ค่าเริ่มต้น 24 |
| พิมพ์แล้วตกหน้า | ในกล่องพิมพ์ให้เลือก **Landscape**, Margins = *Default*, Scale = 100% |

ฟอนต์ใบแจ้งหนี้ใช้ **Angsana New** (มีในทุกเครื่อง Windows) ถ้าไม่มีจะถอยไปใช้ TH Sarabun New / Sarabun อัตโนมัติ
