# Docker สำหรับทดสอบงานกลุ่ม

ชุดนี้ใช้โค้ด FarmWeather ปัจจุบัน แต่เปิด `CLASSROOM_MODE=true` สำหรับทดสอบในวิชาเรียนโดยเฉพาะ ไม่ต้องมี `.env`, TMD API key หรือ bearer token ของเจ้าของโปรเจกต์

## เปิด API

```bash
docker compose --env-file /dev/null -f compose.classroom.yml up -d --build app
```

เปิด http://localhost:3001 และ Swagger http://localhost:3001/docs เรียก API ที่ `/api` ได้ทันทีโดยไม่ส่ง Authorization ทุก request ใช้บัญชี ADMIN จำลองร่วมกัน มีแปลงข้าวตัวอย่าง อากาศจำลอง และปิด rate limit เพื่อให้ทดสอบ load ได้ ข้อมูลอยู่ใน memory และรีเซ็ตเมื่อ restart container โหมดนี้ปฏิเสธการเชื่อมต่อฐานข้อมูลถาวร

ตัวอย่าง:

```bash
curl http://localhost:3001/api/plots
```

Docker image `farmweather:classroom` มีค่า demo ติดมาแล้ว รันเดี่ยวได้:

```bash
docker run --rm -p 127.0.0.1:3001:3000 farmweather:classroom
```

## k6 โดยไม่ใช้ token

```bash
docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6
PROFILE=load docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6
PROFILE=stress docker compose --env-file /dev/null -f compose.classroom.yml --profile load run --rm k6
```

ค่าเริ่มต้นคือ smoke 5 users / 20 วินาที ทดสอบ health, plots, hourly weather และ current weather สามารถนำ URL เดียวกันไปใช้กับสคริปต์ k6 ของกลุ่มได้โดยไม่ต้องมี token ผู้ใช้ทดสอบทุกคนเห็นแปลงของบัญชีร่วมกัน

## SonarQube โดยไม่สร้าง token เอง

```bash
bash scripts/run-classroom-sonar.sh
```

ต้องมี Docker Compose และ Bash คำสั่งจะเปิด SonarQube สร้าง token ของ SonarQube ในเครื่องนั้นอัตโนมัติ รัน Jest coverage ใน Docker แล้ว scan source code โดยไม่ใช้ API key หรือ token ส่วนตัวของใคร token อยู่ใน Docker volume ไม่แสดงใน terminal และไม่เก็บใน repository

เมื่อบริการพร้อม terminal จะแสดง URL เข้าใช้งาน และหลัง scan จะแสดง URL dashboard ให้คลิกได้โดยตรง ค่าเริ่มต้นคือ http://localhost:9001/dashboard?id=farmweather (บัญชี local demo: `admin` / `ClassroomSonarDemo123!`) ครั้งแรกอาจใช้เวลาหลายนาทีในการเริ่ม SonarQube และดาวน์โหลดเครื่องมือ ถ้าเครื่อง RAM น้อยควรหยุด k6 ก่อนรัน SonarQube

ให้เปิด URL บนเครื่องที่รัน Docker `localhost` ของเพื่อนแต่ละคนหมายถึงเครื่องของคนนั้น ต้องรันสคริปต์บนเครื่องตัวเองก่อน เปิด Docker Desktop / Docker Engine ให้ทำงานด้วย หากพอร์ต 9001 ถูกใช้อยู่:

```bash
CLASSROOM_SONAR_PORT=9010 bash scripts/run-classroom-sonar.sh
```

สคริปต์จะอ่านพอร์ตจริงจาก Docker แล้วแสดง URL ตามพอร์ตนั้น หากเปิดไม่ได้ ให้ตรวจสถานะและ log:

```bash
docker compose --env-file /dev/null -f compose.classroom.yml ps -a sonarqube
docker compose --env-file /dev/null -f compose.classroom.yml logs --tail=100 sonarqube
```

SonarQube จะเริ่มใหม่เมื่อ Docker เปิดขึ้นอีกครั้ง แต่หลังใช้คำสั่ง `down` ต้องรันสคริปต์ใหม่ก่อนเปิด URL

SonarQube วิเคราะห์ source code จึงต้องใช้ repository เต็ม รวม `src`, `test`, `package-lock.json` และ `sonar-project.properties` ไม่สามารถ scan ด้วย image API อย่างเดียว

## หยุดชุดทดสอบ

```bash
docker compose --env-file /dev/null -f compose.classroom.yml --profile load --profile sonar down
```

ชุดปกติ `docker-compose.yml` ยังใช้ target `production` และตรวจ token ตามปกติ ชุด classroom เปิดพอร์ตเฉพาะ localhost และใช้ข้อมูลจำลองสำหรับงานวิชาเรียน การทดสอบ authorization หรือ rate limit ให้ใช้ชุดปกติ เพราะ classroom bypass การตรวจสองส่วนนี้

## ส่ง Docker image ให้เพื่อน

ไฟล์ export ที่สร้างในเครื่องนี้อยู่ที่ `classroom-artifacts/farmweather-classroom.tar.gz` สำหรับ Linux amd64 เพื่อนโหลดแล้วเปิด API ได้โดยไม่ต้อง build:

```bash
docker load -i farmweather-classroom.tar.gz
docker run --rm -p 127.0.0.1:3001:3000 farmweather:classroom
```

ส่ง `farmweather-classroom-source.zip` ไปด้วยหากต้องทดสอบ k6 หรือ SonarQube แตก zip แล้วใช้คำสั่งข้างต้นสำหรับเครื่องมือทดสอบ ไม่ต้องส่ง `.env` ไฟล์ zip ไม่มีข้อมูลลับของเครื่องเจ้าของโปรเจกต์ การติดตั้ง k6 และ SonarQube ครั้งแรกยังต้องมีอินเทอร์เน็ตเพื่อดาวน์โหลด Docker images และ dependencies
