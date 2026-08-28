# FarmWeather

NestJS backend สำหรับบัญชีเกษตรกรและแปลงเพาะปลูก ดึงค่าตรวจวัดจริงจากสถานี TMD ที่ใกล้ที่สุดและพยากรณ์รายชั่วโมงตามพิกัด ประเมินความเสี่ยงตามชนิดพืชและระยะการเจริญเติบโต และสร้าง notification inbox

## Quick start

```bash
cp .env.example .env
npm run db:up
npm install
npm run start:dev
```

ล้างฐานข้อมูลและสร้างบัญชีตัวอย่างใหม่ทั้งหมด (ข้อมูลเดิมจะถูกลบ):

```bash
npm run db:fresh
```

Seeder สร้าง `admin` และ `farmer` โดยอ่าน username/password จากตัวแปร `SEED_*` ใน `.env` ค่า development เริ่มต้นดูได้จาก `.env.example` และควรเปลี่ยนก่อนใช้งานนอกเครื่องพัฒนา

ระบบใช้ PostgreSQL เมื่อกำหนด `DATABASE_URL` และสร้างตารางผู้ใช้ แปลง session ประวัติอากาศ ผลวิเคราะห์ และ notification ให้อัตโนมัติ หากไม่กำหนดจะ fallback เป็น in-memory สำหรับการพัฒนา

Production ต้องกำหนด `DATABASE_URL`; ระบบจะหยุดทำงานตั้งแต่เริ่มต้นหากไม่มีฐานข้อมูล เพื่อป้องกันบัญชี session และข้อมูลแปลงสูญหายระหว่าง serverless instances. ใช้ `ALLOW_IN_MEMORY_STORAGE=true` ได้เฉพาะ preview ที่ยอมให้ข้อมูลสูญหายเท่านั้น

เปิดหน้าเว็บที่ `http://localhost:3000`, Swagger ที่ `http://localhost:3000/docs` และ health check ที่ `GET /api/health`

## วิเคราะห์คุณภาพโค้ดด้วย SonarQube

เปิด SonarQube แยกจากบริการหลักด้วย Docker profile:

```bash
npm run sonar:up
```

รอจน `http://localhost:9000` พร้อมใช้งาน จากนั้นสร้าง project ชื่อ `farmweather`
และ token จากหน้า SonarQube แล้วสร้าง coverage และสแกนด้วย SonarScanner container:

```bash
npm run test:coverage
SONAR_TOKEN=<token> npm run sonar:scan
```

ไฟล์ `sonar-project.properties` กำหนดให้วิเคราะห์ TypeScript ใน `src`, อ่าน tests จาก
`test` และนำเข้า coverage จาก `coverage/lcov.info` โดยไม่เก็บ token ลง repository
หยุด SonarQube ได้ด้วย `npm run sonar:down`

## โครงสร้าง source แบบ MVC

```text
src/
├── app/
│   ├── controllers/   # รับ HTTP request และส่ง response (Controller)
│   ├── models/        # domain model, type และ crop catalogue (Model)
│   ├── services/      # business logic
│   ├── dtos/          # request validation คล้าย Laravel Form Request
│   ├── http/          # guard และ decorator/middleware ฝั่ง HTTP
│   └── modules/       # NestJS dependency wiring
├── infrastructure/
│   ├── database/      # PostgreSQL adapter
│   └── tmd/           # external TMD API adapters
├── app.module.ts
└── main.ts
public/                # View: HTML, CSS และ browser JavaScript
test/                  # unit tests แยกออกจาก production source
```

Controller จะไม่เก็บ business rule; งานหลักอยู่ใน `services` ส่วนรายละเอียด PostgreSQL/TMD ถูกแยกไว้ใน `infrastructure` เพื่อให้เปลี่ยน adapter ได้โดยไม่ต้องไล่แก้ Controller

## OpenAPI contract และ Mock API

ไฟล์ [`openapi.json`](./openapi.json) ระบุ contract ครบทุก endpoint ของระบบ ทั้ง request, response, data type, validation constraint, error response และข้อมูลตัวอย่าง โดยทดสอบ API จาก contract ได้โดยไม่ต้องเปิด NestJS หรือเชื่อมต่อฐานข้อมูล/TMD:

```bash
npm run mock
```

Prism mock server จะเปิดที่ `http://127.0.0.1:4010` ตัวอย่างเช่น:

```bash
curl http://127.0.0.1:4010/api/plots
curl -X POST http://127.0.0.1:4010/api/plots \
  -H 'Content-Type: application/json' \
  -d '{"name":"แปลงข้าวเหนือคลอง","latitude":14.0208,"longitude":100.525,"province":"ปทุมธานี","cropType":"ข้าว","plantedAt":"2026-07-01"}'
```

API ส่วนใหญ่ต้องส่ง `Authorization: Bearer <token>` โดยรับ token จาก `POST /api/auth/register` หรือ `POST /api/auth/login` การ logout จะ revoke session ฝั่ง server และการ reset password จะ revoke ทุก session ของบัญชี ดู endpoint และ schema ทั้งหมดใน [`openapi.json`](./openapi.json)

ตั้ง `ADMIN_USERNAME` ก่อนสมัครบัญชีผู้ดูแล บัญชีชื่อดังกล่าวจะได้ role `ADMIN`; บัญชีอื่นเป็น `FARMER` ผู้ดูแลสามารถอ่านรายชื่อผู้ใช้และเปลี่ยน role ผ่าน `/api/admin/users`

ใช้ `npm run mock:dynamic` เมื่อต้องการให้ Prism สร้างค่าตัวอย่างตามชนิดข้อมูล หรือใช้ `npm run proxy:validate` พร้อมกับ NestJS ที่ port 3000 เพื่อตรวจว่า API จริงทำงานตรงตาม contract

ใน development หากยังไม่มี `TMD_ACCESS_TOKEN` ระบบจะใช้ demo weather อัตโนมัติเพื่อให้ flow สมัครบัญชี สร้างแปลง ดูอากาศ วิเคราะห์ความเสี่ยง และสร้าง notification ใช้งานได้ครบก่อน เมื่อต้องการใช้ข้อมูลจริง ให้[ลงทะเบียน TMD Weather Forecast API](https://data.tmd.go.th/nwpapi/register) แล้วใส่ OAuth access token ใน `TMD_ACCESS_TOKEN`

ตั้ง `WEATHER_DEMO_MODE=false` เพื่อบังคับให้เรียก TMD จริงและให้ระบบตอบ `503` เมื่อยังไม่ได้ตั้ง token หรือเปิด `WEATHER_DEMO_MODE=true` เพื่อใช้ข้อมูล demo แม้มี token อยู่

หน้า “สภาพอากาศปัจจุบัน” ใช้ข้อมูลตรวจวัด Weather3Hours จากสถานี TMD ที่มีอุณหภูมิล่าสุดและอยู่ใกล้พิกัดแปลงที่สุด พร้อมแสดงชื่อสถานี ระยะทาง และเวลาตรวจวัด ส่วน “พยากรณ์รายชั่วโมง” ใช้แบบจำลอง NWP จึงเป็นคนละชุดข้อมูลกัน

`resetToken` จะแสดงใน response เฉพาะ development ที่ `EXPOSE_RESET_TOKEN=true`; production จะไม่ส่ง token กลับทาง API และควรเชื่อม email/SMS provider ก่อนเปิด password recovery ให้ผู้ใช้จริง

## ทดลอง flow

1. `POST /api/auth/register` สมัครและรับ bearer token
2. `POST /api/plots` สร้างแปลง
3. `POST /api/plots/{plotId}/weather/refresh` ดึงพยากรณ์
4. `POST /api/plots/{plotId}/analysis/run` วิเคราะห์ตามชนิดพืชและระยะการเติบโต
5. `GET /api/plots/{plotId}/notifications` อ่านการแจ้งเตือน
6. `PATCH /api/notifications/{id}/read` ยืนยันว่าอ่านแล้ว

## ขอบเขต MVP

- ผู้ใช้ แปลง session ประวัติอากาศ ผลวิเคราะห์ และ notification เก็บใน PostgreSQL; cache ล่าสุดยังอยู่ใน memory เพื่อประสิทธิภาพ
- แยก role `FARMER`/`ADMIN` และตรวจ ownership ของข้อมูลระดับแปลง
- แก้ไข ลบ และเปิด/ปิดแปลงได้ผ่าน API
- มี profile เกษตรกร, password reset token อายุ 15 นาที, logout และ session revocation
- notification เป็น inbox ภายในระบบ ยังไม่ส่ง LINE/email/push
- threshold แยกตามชนิดพืชและปรับตาม 4 ระยะ: seedling, vegetative, reproductive และ maturity
- TMD adapter เรียก hourly endpoint ตาม latitude/longitude โดยขอ `tc,rh,rain,ws10m,wd10m,cond`

ขั้นถัดไปที่เหมาะสมคือเชื่อม email/SMS สำหรับส่ง password-reset link, notification provider ภายนอก และทบทวน threshold/ช่วงระยะพืชกับผู้เชี่ยวชาญเกษตร
