# โค้ดชุดเดิม (เลิกใช้แล้ว)

`Code.gs` คือ Google Apps Script ที่ระบบเคยใช้อ่าน/เขียนสเปรดชีต **Rent Invoice**
ตอนนี้ข้อมูลย้ายมาอยู่บน Cloudflare D1 (`house-rent-bill`) แล้ว เว็บไม่เรียกไฟล์นี้อีกต่อไป

เก็บไว้เพราะ

- เป็นที่มาของข้อมูลชุดแรกที่คัดลอกเข้า D1 (ดู `worker/seed.sql`)
- สคริปต์ [`worker/tools/pull-from-sheet.mjs`](../../worker/tools/pull-from-sheet.mjs) ยังยิง `action=bootstrap`
  ไปที่ Web App ตัวนี้ เผื่อต้องดึงข้อมูลจากชีตมาอีกรอบ

ถ้าเลิกใช้สเปรดชีตถาวรแล้ว ลบโฟลเดอร์นี้ทิ้งได้เลย
