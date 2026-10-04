# FarmWeather

NestJS backend สำหรับบัญชีเกษตรกรและแปลงเพาะปลูก ดึงค่าตรวจวัดจริงจากสถานี TMD ที่ใกล้ที่สุดและพยากรณ์รายชั่วโมงตามพิกัด ประเมินความเสี่ยงตามชนิดพืชและระยะการเจริญเติบโต และสร้าง notification inbox

สำหรับงานกลุ่มที่ต้องการทดสอบโดยไม่ขอ API key หรือ token ให้ใช้ [Docker classroom พร้อม k6 และ SonarQube](#classroom-docker) ด้านล่าง

## Quick start

รันทั้ง API และ PostgreSQL ด้วย Docker:

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Compose จะสร้าง image ชื่อ `farmweather:local` จาก source code ปัจจุบัน หากต้องการ
แยก image ตามเวอร์ชัน ให้กำหนด `FARMWEATHER_IMAGE_TAG` เป็นชื่อ tag ที่ต้องการ
ก่อนสั่ง build และเปลี่ยน `AUTH_SECRET` ใน `.env` เป็นค่าสุ่มของตัวเองก่อนใช้งาน

เปิดหน้าเว็บที่ `http://localhost:3000`, Swagger ที่ `http://localhost:3000/docs`
และ health check ที่ `http://localhost:3000/api/health` ดู log หรือหยุดระบบได้ด้วย:

```bash
docker compose logs -f app
docker compose down
```

Compose ใช้ demo weather เป็นค่าเริ่มต้น หากต้องการใช้ TMD จริงให้กำหนด
`TMD_ACCESS_TOKEN` และ `WEATHER_DEMO_MODE=false` ใน `.env` รวมถึงควรเปลี่ยน
`AUTH_SECRET` ก่อนนำไปรันบน server ค่า port ฝั่งเครื่องเปลี่ยนได้ด้วย `APP_PORT`

หากต้องการรันแบบ local development โดยใช้เฉพาะ PostgreSQL ใน Docker:

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

เปิดหน้าเว็บที่ `http://localhost:3000`, Swagger ที่ `http://localhost:3000/docs` และ health check ที่ `GET /api/health`

## ทดสอบโหลดด้วย Grafana k6

เปิด Terminal ใหม่ในโฟลเดอร์โปรเจกต์ แล้วรัน k6 พร้อม API ผ่าน Docker Compose:

```bash
npm run test:load
```

คำสั่งนี้เรียก `docker compose --profile load run --rm k6` ซึ่งเริ่ม API และ PostgreSQL หากยังไม่ได้รัน ผลสรุปแสดงใน Terminal ชุด load อ้างอิงจากไฟล์ตัวอย่าง `5_k6/k6_load_stress_test_script.js`: เพิ่มผู้ใช้เป็น 20 คนใน 30 วินาที คงไว้ 1 นาที แล้วลดลงใน 20 วินาที โดยยิง `GET /api/health` ของโปรเจกต์ ผ่านเกณฑ์เมื่อ request ล้มเหลวน้อยกว่า 1%, p95 ต่ำกว่า 500 ms และ checks ผ่านมากกว่า 99%

หากอยากลองชุดสั้น ให้กำหนดตัวแปรก่อนรัน เช่น:

```bash
PROFILE=smoke VUS=10 DURATION=30s npm run test:load
```

ใช้ `PROFILE=stress` เพื่อรันชุด stress ของไฟล์ตัวอย่าง (สูงสุด 200 users) แอปจำกัดอัตรา 100 requests ต่อ 60 วินาทีต่อ IP ดังนั้นการรัน load/stress จากเครื่องเดียวอาจได้ HTTP 429 และ threshold ล้มเหลว ดู[ผลทดสอบตัวอย่าง](./performance-reports/2026-10-03/README.md)

## วิเคราะห์คุณภาพโค้ดด้วย SonarQube

เปิด SonarQube แยกจากบริการหลักด้วย Docker profile:

```bash
npm run sonar:up
```

รอจน `http://localhost:9000` พร้อมใช้งาน จากนั้นสร้าง project ชื่อ `farmweather`
และ token จากหน้า SonarQube แล้วสร้าง coverage และสแกนด้วย SonarScanner container:

```bash
SONAR_TOKEN='your-token' npm run sonar:coverage
```

คำสั่งนี้รัน Jest เพื่อสร้าง `coverage/lcov.info` แล้วรัน SonarScanner เพื่อส่งผลเข้า SonarQube
การรัน `npm run test:coverage` เพียงอย่างเดียวจะไม่อัปเดตหน้า SonarQube
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

<a id="classroom-docker"></a>

## Docker สำหรับงานกลุ่ม ไม่ต้องขอ API key หรือ token

ใช้ชุด classroom สำหรับทดสอบในวิชาเรียน เพื่อนในกลุ่มไม่ต้องขอ `.env`, TMD API key หรือ bearer token จากเจ้าของโปรเจกต์ ระบบใช้ข้อมูลอากาศจำลองและบัญชี ADMIN ทดสอบร่วมกัน เปิด API โดยไม่ส่ง Authorization และปิด rate limit สำหรับ k6 ข้อมูลอยู่ใน memory และรีเซ็ตเมื่อ restart container

### สิ่งที่ต้องเตรียม

- Docker Engine หรือ Docker Desktop พร้อม Docker Compose v2 และเปิด Docker ไว้
- Git สำหรับดาวน์โหลด source code
- Bash สำหรับคำสั่งด้านล่าง เช่น Terminal บน Linux/macOS หรือ Git Bash/WSL บน Windows
- อินเทอร์เน็ตสำหรับดาวน์โหลด Docker images และ dependencies ครั้งแรก

ทุกคำสั่งให้รันจากโฟลเดอร์ repository:

```bash
git clone https://github.com/pollakritb/FARMWEATHER_.git
cd FARMWEATHER_
```

ถ้ามี repository อยู่แล้ว ให้ใช้ `git pull` เพื่อรับเวอร์ชันล่าสุดก่อนเริ่ม

### 1. Build และเปิด Docker API

```bash
docker compose --env-file /dev/null -f compose.classroom.yml up -d --build app
```

`--env-file /dev/null` ทำให้ชุดทดสอบไม่อ่านไฟล์ `.env` ส่วนตัวในเครื่อง ไม่ต้องสร้างหรือส่ง `.env` ให้เพื่อน

- หน้าเว็บ: http://localhost:3001
- Swagger: http://localhost:3001/docs
- API base URL สำหรับ k6/Postman: `http://localhost:3001/api`

เรียก API ได้ทันทีโดยไม่ต้อง login หรือส่ง token:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/plots
curl http://localhost:3001/api/auth/me
```

ระบบเตรียมแปลงข้าวตัวอย่างไว้แล้ว คัดลอก `id` จาก `/api/plots` แล้วใช้แทน `PLOT_ID` ในตัวอย่างนี้:

```bash
curl http://localhost:3001/api/plots/PLOT_ID/weather/hourly
curl http://localhost:3001/api/plots/PLOT_ID/weather/current
curl -X POST http://localhost:3001/api/plots/PLOT_ID/analysis/run
```

หากต้องการเข้าสู่หน้าเว็บด้วยบัญชีตัวอย่าง ใช้ `classroom` / `ClassroomDemo123!` ทุก request ของ API ในโหมดนี้ใช้บัญชี classroom ร่วมกัน จึงเห็นและแก้ไขข้อมูลชุดเดียวกัน

### 2. รัน k6 โดยไม่ใช้ token

เปิด Terminal อีกหน้าหนึ่งในโฟลเดอร์ repository แล้วรัน:

```bash
# Smoke: 5 users / 20 วินาที
docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6

# Load: เพิ่มถึง 20 users
PROFILE=load docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6

# Stress: เพิ่มถึง 200 users
PROFILE=stress docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6

# ปรับ smoke test เอง
PROFILE=smoke VUS=10 DURATION=30s docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6
```

สคริปต์ `scripts/k6-classroom.js` ทดสอบ health, plots, hourly weather และ current weather โดยไม่ส่ง token ผลสรุปแสดงใน Terminal เกณฑ์ผ่านคือ request ล้มเหลวน้อยกว่า 1%, p95 ต่ำกว่า 500 ms และ checks ผ่านมากกว่า 99% ผลจริงขึ้นกับทรัพยากรเครื่องที่ใช้ทดสอบ

หากเขียนสคริปต์ k6 เอง ใช้ `http://localhost:3001` เมื่อรัน k6 บนเครื่อง หรือ `http://app:3000` เมื่อรันใน Compose network ของชุด classroom ไม่ต้องใส่ Authorization header

### 3. รัน SonarQube โดยไม่สร้าง token เอง

```bash
bash scripts/run-classroom-sonar.sh
```

คำสั่งนี้เปิด SonarQube รอให้พร้อม ตั้งบัญชี demo สร้าง scanner token ในเครื่องนั้นอัตโนมัติ รัน Jest coverage ใน Docker และส่งผล scan ไปยัง SonarQube ไม่ต้องติดตั้ง Node.js บนเครื่องหรือขอ token จากเจ้าของโปรเจกต์ token เก็บใน Docker volume โดยไม่แสดงใน Terminal หรือเก็บใน repository

เปิดผลที่ http://localhost:9001/dashboard?id=farmweather

- Username: `admin`
- Password: `ClassroomSonarDemo123!`

ครั้งแรกอาจใช้เวลาหลายนาที หลัง scanner แสดง `EXECUTION SUCCESS` ให้รอ SonarQube ประมวลผลรายงานก่อน refresh หน้า dashboard การ scan สำเร็จไม่ได้หมายความว่า quality gate ผ่านทุกเกณฑ์ ให้ตรวจผลบน dashboard อีกครั้ง

SonarQube ต้องใช้ source code ใน repository รวม `src`, `test`, `package-lock.json` และ `sonar-project.properties` จึงต้อง clone repository หรือใช้ source zip ด้วย แม้จะได้รับ Docker image API มาแล้ว

### 4. ดู log และหยุด Docker

```bash
docker compose --env-file /dev/null -f compose.classroom.yml logs --tail=100 app
docker compose --env-file /dev/null -f compose.classroom.yml --profile load --profile sonar down
```

API classroom ใช้พอร์ต 3001 และ SonarQube ใช้พอร์ต 9001 เพื่อแยกจากชุดปกติ หากพอร์ตถูกใช้อยู่ให้หยุด container ที่ชนกันหรือแก้เลขพอร์ตฝั่งซ้ายใน `compose.classroom.yml`

### ใช้ Docker image ที่เพื่อนส่งให้ โดยไม่ต้อง build

ไฟล์ `farmweather-classroom.tar.gz` เป็น Docker image export ที่ส่งแยกจาก GitHub repository สำหรับ Linux amd64 ถ้ามีไฟล์นี้แล้ว:

```bash
docker load -i farmweather-classroom.tar.gz
docker run --rm -p 127.0.0.1:3001:3000 farmweather:classroom
```

จากนั้นเรียก API ได้ที่ URL เดิม หากจะใช้ Compose กับ image ที่โหลดไว้ ให้เปิดด้วยคำสั่งนี้แทนขั้นตอน build:

```bash
docker compose --env-file /dev/null -f compose.classroom.yml up -d --no-build app
```

เลือกเปิด API ด้วย `docker run` หรือ Compose อย่างใดอย่างหนึ่ง เพื่อไม่ให้พอร์ต 3001 ชนกัน การทดสอบ k6 ตามขั้นตอนด้านบนใช้ Compose

ชุด classroom ใช้ bypass สำหรับงานวิชาเรียนและเปิดพอร์ตเฉพาะ localhost ส่วน `docker-compose.yml` ปกติยังตรวจ token ตามเดิม หากทดสอบ authentication, authorization หรือ rate limit ให้ใช้ชุดปกติ ดูรายละเอียดเพิ่มเติมที่ [CLASSROOM.md](CLASSROOM.md)
