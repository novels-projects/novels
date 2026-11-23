# 📚 Novel-DB (ระบบฐานข้อมูลนิยายและสื่อมัลติมีเดีย)

ระบบฐานข้อมูลส่วนกลางสำหรับแพลตฟอร์ม **Interactive Novel (นิยายที่มีทางเลือก)** พัฒนาโดยใช้ **PostgreSQL 17**, เสริมด้วย **MinIO (Object Storage)** สำหรับจัดเก็บรูปภาพ/ไฟล์สื่อ และ **pgAdmin 4** สำหรับจัดการฐานข้อมูลผ่าน Web Interface ได้อย่างสะดวก

---

## 📁 โครงสร้างโฟลเดอร์และไฟล์ (Directory Structure)

```text
novel-DB/
├── .env                                       # ไฟล์กำหนดค่า Environment Variables (รหัสผ่าน, พอร์ต)
├── docker-compose.yml                         # ไฟล์ Orchestration สำหรับสร้างและเชื่อมต่อ Services ทั้งหมด
├── insert.text                                # ไฟล์สำรอง SQL สำหรับ Mock Data / Seed Data เพิ่มเติม
├── README.md                                  # เอกสารคู่มือการใช้งานระบบ (ไฟล์นี้)
├── docker/                                    # โฟลเดอร์สำหรับ Database Setup & Migrations
│   ├── Dockerfile                             # สคริปต์ประกอบ Image PostgreSQL 17 Alpine + UTF-8 Locale
│   ├── init.sql                               # โครงสร้างตารางเริ่มต้น (DDL) พร้อมข้อมูล Mock Data เริ่มต้น
│   ├── migration_add_admin_dashboard_indexes.sql # เพิ่ม Indexes เพิ่มความเร็วให้หน้า Admin Dashboard
│   ├── migration_add_audit_logs.sql           # เพิ่มตาราง Audit Logs บันทึกการกระทำของผู้ดูแลระบบ
│   ├── migration_add_categories_name_unique.sql # ป้องกันชื่อหมวดหมู่ซ้ำ (Case-insensitive)
│   ├── migration_add_report_type.sql          # เพิ่มประเภทรายงาน (เช่น รายงานปัญหา / ยื่นอุทธรณ์ปลดแบน)
│   ├── migration_add_scene_node_position.sql  # เพิ่มพิกัด (node_x, node_y) สำหรับวาด Node Graph ในฉาก
│   ├── migration_add_user_notification_settings.sql # ตารางตั้งค่าเปิด/ปิดการแจ้งเตือนของผู้ใช้แต่ละคน
│   ├── migration_add_user_status.sql          # เพิ่มสถานะบัญชีผู้ใช้ (active / suspended) พร้อมบันทึกเหตุผล
│   ├── migration_add_writer_admin_action.sql  # เพิ่มฟิลด์ตรวจสอบและบันทึกผลการอนุมัติ/ปฏิเสธนักเขียน
│   └── migration_remove_writers_user_id_unique.sql # ปรับแต่งความสัมพันธ์นักเขียน และเพิ่ม visit_count ในฉาก
└── mcconfig/                                  # โฟลเดอร์ตั้งค่าของ MinIO Client (mc) สำหรับจัดการ Bucket
    ├── config.json                            # การตั้งค่า Alias และการเชื่อมต่อ MinIO
    └── certs/, share/                         # ข้อมูลและใบรับรองของ MinIO Client
```

---

## 📑 รายละเอียดไฟล์ในแต่ละส่วน

### 1. ไฟล์หลักในระดับ Root (`/`)
* **`docker-compose.yml`**: ไฟล์หัวใจหลักในการรันระบบ รวบรวม 4 services ได้แก่:
  1. `db` (`novels_postgres`): ฐานข้อมูล PostgreSQL
  2. `pgadmin` (`novels_pgadmin`): เครื่องมือ GUI จัดการฐานข้อมูลผ่านเว็บ
  3. `minio` (`minio`): Object Storage รองรับ S3 API สำหรับเก็บรูปหน้าปก, ภาพประกอบฉาก, โปรไฟล์
  4. `createbuckets`: ตัวช่วยรันอัตโนมัติสร้าง Bucket ชื่อ `novel-buckets` และเปิดสิทธิ์ Public ให้อัตโนมัติ
* **`.env`**: เก็บค่า Configuration ต่าง ๆ เช่น ชื่อฐานข้อมูล, Username, Password และหมายเลข Port
* **`insert.text`**: สคริปต์คำสั่ง SQL แบบ Raw Data สำหรับ Insert ข้อมูลทดสอบ (Mock Data) เสริม

---

### 2. โฟลเดอร์ `docker/`
* **`Dockerfile`**: ใช้ Base Image `postgres:17-alpine` มีการติดตั้ง Locales `en_US.UTF-8` เพื่อรองรับการค้นหาและจัดเรียงภาษา และคัดลอกไฟล์ `init.sql` เข้าสู่ `/docker-entrypoint-initdb.d/` เพื่อรันอัตโนมัติเมื่อสร้าง Database ครั้งแรก
* **`init.sql`**: สคริปต์สร้างตารางทั้งหมด (Schema) และใส่ข้อมูล Mock Data เริ่มต้น แบ่งออกเป็นกลุ่มตารางดังนี้:

| กลุ่มข้อมูล | ตารางที่เกี่ยวข้อง | รายละเอียดโดยย่อ |
| :--- | :--- | :--- |
| **หมวดหมู่ (Categories)** | `categories` | หมวดหมู่นิยาย (แฟนตาซี, สยองขวัญ ฯลฯ) พร้อม Index ป้องกันชื่อซ้ำ |
| **ผู้ใช้งาน & นักเขียน (Users & Writers)** | `users`, `user_notification_settings`, `writers`, `writer_categories` | บัญชีผู้ใช้ (รองรับ status แบน/ปลดแบน), การตั้งค่าแจ้งเตือน, ข้อมูลนักเขียน (รองรับบันทึกการอนุมัติ/ปฏิเสธ) |
| **แกนหลักนิยาย (Novel Core)** | `novels`, `novel_categories`, `chapters` | ข้อมูลนิยาย, หมวดหมู่ของเรื่อง, ตอนของนิยาย |
| **ระบบฉากและทางเลือก (Interactive Scenes)** | `scenes`, `choices` | ฉากเนื้อเรื่อง (รองรับพิกัด `node_x`, `node_y` สำหรับกราฟ), ตัวเลือกชอยส์เชื่อมระหว่างฉาก |
| **คอมมูนิตี้ (Engagement)** | `bookshelves`, `likes`, `comments`, `follows` | ชั้นหนังสือ, การกดไลก์, คอมเมนต์, การติดตามนักเขียน |
| **ประวัติและการอ่าน (Reading System)** | `reading_progress`, `user_choice_history`, `user_scene_history`, `user_endings` | จุดที่อ่านค้างไว้, บันทึกการเลือกชอยส์, ประวัติฉากที่เคยอ่านพร้อมจำนวนครั้ง (`visit_count`), ตอนจบที่ปลดล็อก |
| **ระบบดูแล & ตรวจสอบ (Admin & System)** | `reports`, `notifications`, `audit_logs` | รายงานความประพฤติ/ขอปลดแบน (`report_type`), แจ้งเตือนผู้ใช้, และบันทึกประวัติการกระทำของแอดมิน (`audit_logs`) |

> [!NOTE]
> โครงสร้างตารางและคอลัมน์ล่าสุดทั้งหมดจากไฟล์ Migration ได้ถูกรวบรวมเข้ามาไว้ใน `init.sql` เรียบร้อยแล้ว ทำให้เมื่อนำโปรเจกต์ไปเปิดบนเครื่องใหม่หรือรันฐานข้อมูลเป็นครั้งแรก ตัว Database จะพร้อมใช้งานสมบูรณ์แบบทันทีโดยไม่ต้องไล่รัน migration แยก

* **ไฟล์ Migrations (`migration_*.sql`)**:
  สคริปต์ประวัติการปรับปรุงโครงสร้างฐานข้อมูล เก็บไว้สำหรับอ้างอิง หรือใช้รันกรณีที่มีฐานข้อมูลเก่าอยู่แล้วโดยไม่ต้องลบข้อมูลเดิมทิ้ง

---

## 🚀 วิธีการรันระบบ (How to Run)

### ขั้นตอนที่ 1: ตรวจสอบและสร้าง Docker Network
ไฟล์ `docker-compose.yml` มีการตั้งค่า `novels_network` เป็น `external: true` ดังนั้น **ต้องสร้าง Network ก่อนในครั้งแรก** (ทำเพียงครั้งเดียว):

```bash
docker network create novels_network
```

---

### ขั้นตอนที่ 2: Build Image และเริ่มต้นระบบ
ใช้คำสั่งตามลำดับที่คุ้นเคย หรือจะรันคำสั่งควบก็ได้:

**แบบแยกคำสั่ง (ตามปกติ):**
```bash
# 1. ทำการ Build Docker Image (PostgreSQL ปรับแต่ง Locale)
docker compose build

# 2. เริ่มต้นรันคอนเทนเนอร์ในแบบเบื้องหลัง (Detached Mode)
docker compose up -d
```

**หรือแบบคำสั่งเดียวจบ:**
```bash
docker compose up -d --build
```

---

### ขั้นตอนที่ 3: ตรวจสอบสถานะการทำงาน
ตรวจสอบว่าคอนเทนเนอร์ทำงานสมบูรณ์หรือไม่ด้วยคำสั่ง:
```bash
docker compose ps
```
*(สถานะของ `db`, `pgadmin`, `minio` ควรเป็น `Up` ส่วน `createbuckets` จะเปลี่ยนเป็น `Exited (0)` หลังสร้าง Bucket เสร็จสิ้น ถือเป็นปกติ)*

---

## 🌐 พอร์ตและการเข้าใช้งาน Services ต่าง ๆ

| Service | Port ค่าเริ่มต้น (Host) | ทางเข้าใช้งาน | ข้อมูลเข้าสู่ระบบเริ่มต้น |
| :--- | :--- | :--- | :--- |
| **PostgreSQL DB** | `5435` | ต่อตรงผ่าน App / Client | User: `novel_user`<br>Pass: `your_strong_password`<br>Database: `database` |
| **pgAdmin 4** | `5055` | [http://localhost:5055](http://localhost:5055) | Email: `admin@admin.com`<br>Password: `password123` |
| **MinIO Console** | `9001` | [http://localhost:9001](http://localhost:9001) | User: `minionovel`<br>Password: `minionovel123` |
| **MinIO S3 API** | `9000` | [http://localhost:9000](http://localhost:9000) | สำหรับเชื่อมต่อจาก Backend API |

> [!TIP]
> ค่าพอร์ตและรหัสผ่านของ PostgreSQL และ pgAdmin สามารถแก้ไขได้จากไฟล์ [`.env`](file:///.env)

---

## 🔌 วิธีเชื่อมต่อ pgAdmin เข้ากับ PostgreSQL

เมื่อเปิดหน้า [http://localhost:5055](http://localhost:5055) และล็อกอินเรียบร้อย:
1. คลิกขวาที่ **Servers** -> **Register** -> **Server...**
2. แท็บ **General**:
   - Name: `Novels DB` (หรือชื่อใดก็ได้)
3. แท็บ **Connection**:
   - **Host name/address**: `db` *(ใช้ชื่อ service ภายใน docker network)*
   - **Port**: `5432` *(พอร์ตภายในของ container)*
   - **Maintenance database**: `database` *(หรือค่าจาก POSTGRES_DB ใน .env)*
   - **Username**: `novel_user` *(หรือค่าจาก POSTGRES_USER ใน .env)*
   - **Password**: `your_strong_password` *(หรือค่าจาก POSTGRES_PASSWORD ใน .env)*
4. กด **Save** เพื่อเริ่มจัดการฐานข้อมูลได้ทันที

---

## 🛠️ คำสั่งที่มีประโยชน์เพิ่มเติม (Useful Commands)

* **ดู Logs การทำงานของทุกระบบ:**
  ```bash
  docker compose logs -f
  ```
* **ดู Logs เฉพาะฐานข้อมูล:**
  ```bash
  docker compose logs -f db
  ```
* **หยุดการทำงานของระบบ (เก็บข้อมูลไว้):**
  ```bash
  docker compose down
  ```
* **หยุดการทำงานและล้างข้อมูลทั้งหมด (Reset ข้อมูลเพื่อเริ่มใหม่จาก `init.sql`):**
  ```bash
  docker compose down -v
  ```
* **การรันไฟล์ Migration เข้าสู่ฐานข้อมูล:**
  ```bash
  # ตัวอย่าง: รัน migration_add_audit_logs.sql
  docker exec -i novels_postgres psql -U novel_user -d database < docker/migration_add_audit_logs.sql
  ```
