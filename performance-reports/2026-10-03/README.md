# Grafana k6: FarmWeather health endpoint

ทดสอบ `GET /api/health` กับ API ที่รันในเครื่องพอร์ต 3100 โดยไม่เชื่อมต่อ PostgreSQL (in-memory fallback) ผลนี้จึงเป็นการวัด health endpoint ในเครื่องพัฒนา ไม่ใช่สมรรถนะของระบบจริงทั้งชุด

| Profile | Load | Requests | Errors | p95 | Result |
| --- | --- | ---: | ---: | ---: | --- |
| smoke | 5 VUs, 20s | 100 | 0 | 7.18 ms | ผ่าน |
| load | ramp ถึง 20 VUs, คง 1 นาที, ramp ลง | 1,714 | 1,514 (88.33%) | 3.16 ms | ไม่ผ่าน |
| load ผ่าน Docker Compose | ramp ถึง 20 VUs, คง 1 นาที, ramp ลง | 1,700 | 1,515 (89.11%) | 4.31 ms | ไม่ผ่าน |

ชุด load ได้ HTTP 200 จำนวน 200 ครั้ง และตรวจซ้ำหลังทดสอบได้ HTTP 429 จากตัวจำกัดอัตรา 100 requests ต่อ 60 วินาทีต่อ IP ในแอป ค่า p95 ของชุด load รวม response ที่เป็น 429 จึงไม่ใช่ค่า latency ของ request ที่สำเร็จล้วน ๆ

แถว Docker Compose ทดสอบกับ app และ PostgreSQL containers ที่รันอยู่ ใช้ `npm run test:load` โดยแสดงสรุปใน Terminal ไม่มีไฟล์ HTML เพิ่ม ผลสำเร็จ 185 requests และล้มเหลว 1,515 requests เนื่องจากการจำกัดอัตราเดียวกัน

- [Smoke report](./k6-smoke.html)
- [Load report](./k6-load.html)
