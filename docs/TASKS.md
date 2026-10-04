# TASKS.md - Interactive Fiction Platform Task List (60% MVP Architecture)

---

## 1. Contract Phase

### T-01: [Contract] ตรวจสอบและปรับปรุง API Specification (openapi.yaml)
- **สิ่งที่ทำ**: ตรวจสอบ API Endpoints, Request/Response Payloads และ Error Response Format ใน `docs/openapi.yaml` ให้ตรงตาม `SPEC.md` และการทำงานจริงของ Handler ปัจจุบัน
- **Dependencies**: ไม่มี
- **Definition of Done (DoD)**: ไฟล์ `docs/openapi.yaml` มีสเปกตรงตาม OpenAPI 3.0, ครอบคลุมทุก Endpoint ตาม SPEC.md และทุก Error Response ใช้โครงสร้างมาตรฐาน `{"error": {"code": "...", "message": "..."}}` 100%

---

## 2. Vertical Slices (Verify & Improve Existing Features)

### Slice 1: Authentication & Role Management
- **T-02: [Verify - Auth System]** ตรวจสอบระบบ Login, Register, JWT & Role Authorization (Reader, Writer, Admin, Guest)
  - **Dependencies**: T-01
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: Login/Register ได้รับ Token, Token หมดอายุคืน 401 Unauthorized, ผิด Role คืน 403 Forbidden และ Error Format ตรงตาม API Contract
- **T-03: [Improve - Auth System]** แก้ไข Bug การจัดการ Token หมดอายุ, ปรับปรุง Validation สีแดง และ Security Password Hashing
  - **Dependencies**: T-02
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/handlers ./internal/middleware` ผ่าน 100%, หน้า Login/Register ผ่าน E2E Checklist (Loading, Error, Empty, Success) และไม่มี Regression

### Slice 2: Novel Management
- **T-04: [Verify - Novel Management]** ตรวจสอบระบบ CRUD Novel, Filter หมวดหมู่ และ Author Ownership Check
  - **Dependencies**: T-03
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: นักเขียนจัดการได้เฉพาะนิยายของตนเอง การดึงรายการนิยายตามหมวดหมู่และสถานะถูกต้องตาม SPEC.md
- **T-05: [Improve - Novel Management]** แก้ไข Bug อัปโหลดภาพปกเข้า MinIO, ปรับปรุง Form Validation และ Writer Dashboard UI
  - **Dependencies**: T-04
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/handlers ./internal/service` ผ่าน 100%, UI จัดการนิยายผ่าน E2E Checklist และ `cd novel-FE && npm run build` ผ่านโดยไม่มี Error

### Slice 3: Chapter Management
- **T-06: [Verify - Chapter Management]** ตรวจสอบการจัดกลุ่ม Scene ด้วย Chapter และเงื่อนไข "1 ตอนสังกัดได้ 1 นิยาย, ไม่มี Text Editor"
  - **Dependencies**: T-05
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: สามารถสร้าง/แก้ไข/ลบตอนได้ถูกต้อง และ Chapter ไม่มี Text Content ตามกฎใน SPEC.md
- **T-07: [Improve - Chapter Management]** เติมฟีเจอร์ Reorder Chapter, แก้ไข Bug ลบตอนที่มีฉากผูกอยู่ และปรับปรุง UI รายการตอน
  - **Dependencies**: T-06
  - **Definition of Done (DoD)**: API `/novels/{id}/chapters/reorder` ทำงานถูกต้อง, คำสั่งทดสอบ Backend ผ่าน 100% และ UI จัดการตอนผ่าน E2E Checklist

### Slice 4: Scene Management
- **T-08: [Verify - Scene Management]** ตรวจสอบการสร้าง/แก้ไข/ลบ Scene และกฎ "1 ฉากสังกัดได้เพียง 1 ตอนเท่านั้น"
  - **Dependencies**: T-07
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: ฉากบันทึกเข้าตอนได้ถูกต้อง และคำขอสร้างฉากโดยไม่ระบุ Chapter ID ถูกปฏิเสธด้วย 400 Bad Request
- **T-09: [Improve - Scene Management]** ปรับปรุง Rich Text Editor UX, Image Crop/Upload Validation และ Error Handling
  - **Dependencies**: T-08
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/service` ผ่าน 100%, UI Scene Editor ผ่าน E2E Checklist ทั้ง 4 สภาวะ และไม่มีปัญหาความเสถียร

### Slice 5: Choice Management & DAG Validation Engine
- **T-10: [Verify - Choice & DAG Engine]** ตรวจสอบการเชื่อม Choice (`from_scene` $\rightarrow$ `to_scene`) และการดักจับ Circular Dependency
  - **Dependencies**: T-09
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: การเชื่อม Choice ปกติสำเร็จ (201 Created), การเชื่อม Choice ที่ทำให้เกิด Loop ถูกปฏิเสธด้วย 400 Bad Request ("DAG Loop Conflict")
- **T-11: [Improve - Choice & DAG Engine]** ปรับปรุง DAG Detection Algorithm (DFS) ฝั่ง Backend และ Toast เตือนสีแดงเมื่อติด Loop บน UI
  - **Dependencies**: T-10
  - **Definition of Done (DoD)**: คำสั่งทดสอบ Backend ผ่าน 100%, UI ลากสาย Choice แสดง Toast เตือนสีแดงเมื่อติด Loop และผ่าน Verification Checklist โดยไม่มี Regression

### Slice 6: Ending Setting
- **T-12: [Verify - Ending Setting]** ตรวจสอบการตั้งค่าฉากจบฝั่งนักเขียน (Good, Bad, True, Secret) และการบันทึกข้อมูลฉากจบ
  - **Dependencies**: T-11
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: บันทึกข้อมูลฉากจบถูกต้อง (`ending_title`, `ending_type`, `ending_description`) และประเภทฉากจบตรงตาม SPEC.md
- **T-13: [Improve - Ending Setting]** ปรับปรุง UI Modal ตั้งค่าฉากจบ และ Badge แสดงประเภทฉากจบบน Node ฝั่งนักเขียน
  - **Dependencies**: T-12
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/service ./internal/handlers` ผ่าน 100%, UI หน้าตั้งค่า Ending ผ่าน E2E Checklist ทั้ง 4 สภาวะ

### Slice 7: Story Structure Graph Editor
- **T-14: [Verify - Story Structure UI]** ตรวจสอบการดึง Node (Chapter, Scene, Ending) และ Edge (Choice) มาเรนเดอร์บน React Flow
  - **Dependencies**: T-13
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: React Flow แสดงผล Chapter (Group Node), Scene (Node) และ Choice (Edge) สอดคล้องกับฐานข้อมูล
- **T-15: [Improve - Story Structure UI]** ปรับปรุง UX Drag & Drop, Zoom/Pan, Node Styling และ Error Handling เมื่อติด DAG Loop
  - **Dependencies**: T-14
  - **Definition of Done (DoD)**: UI Story Structure ผ่าน E2E Checklist (Loading, Error, Empty, Success), `cd novel-FE && npm run build` ผ่านโดยไม่มี Error

### Slice 8: Writer Preview Mode
- **T-16: [Verify - Preview Mode]** ตรวจสอบความโดดเดี่ยวของระบบทดลองอ่าน (ต้องไม่กระทบตาราง `reading_progress` หรือ DB ฝั่ง Reader)
  - **Dependencies**: T-15
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: ทดลองอ่านใน Preview Mode ได้ถูกต้อง โดยไม่เพิ่มหรือแก้ไข Record ใดๆ ในฐานข้อมูลฝั่ง Reader
- **T-17: [Improve - Preview Mode]** เติม UI Banner แจ้งเตือนสีเหลือง "Preview Mode" และปรับปรุง Preview Simulator UX
  - **Dependencies**: T-16
  - **Definition of Done (DoD)**: คำสั่งทดสอบ Backend ผ่าน 100% และ UI Preview Mode ผ่าน E2E Checklist ทั้ง 4 สภาวะ

### Slice 9: Reading System & Progress
- **T-18: [Verify - Reading System]** ตรวจสอบการเลือกทางเลือกอ่านนิยาย, การอัปเดต `reading_progress.current_scene_id` และปุ่ม "อ่านต่อ"
  - **Dependencies**: T-17
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: `current_scene_id` เก็บเฉพาะฉากปัจจุบันที่อ่านถึง ปุ่ม "อ่านต่อ" เปิดไปยังฉากปัจจุบันได้ถูกต้อง 100%
- **T-19: [Improve - Reading System]** แก้ไข Bug การเปิดฉากค้าง (Fallback เมื่อฉากถูกลบ), Reading History Read-Only Check และปรับปรุง Reading UX
  - **Dependencies**: T-18
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/service ./internal/handlers` ผ่าน 100% และ UI หน้าอ่านนิยายผ่าน E2E Checklist ทั้ง 4 สภาวะ

### Slice 10: Story Map Navigation
- **T-20: [Verify - Story Map]** ตรวจสอบว่า Story Map เรนเดอร์เฉพาะเส้นทางที่ Reader ปลดล็อกแล้ว และการกดย้อนเปลี่ยนสายอ่าน
  - **Dependencies**: T-19
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: แสดงเฉพาะ Unlocked Nodes/Edges เท่านั้น และกดย้อนฉากแล้วอัปเดต `current_scene_id` สำเร็จ
- **T-21: [Improve - Story Map]** ปรับปรุง Story Map Visualization, Soft Pink Layout และ Animation Transition เมื่อสลับสายอ่าน
  - **Dependencies**: T-20
  - **Definition of Done (DoD)**: UI หน้า Story Map ผ่าน E2E Checklist ครบถ้วน และ `cd novel-FE && npm run build` ผ่าน 100%

### Slice 11: Ending Collection
- **T-22: [Verify - Ending Collection]** ตรวจสอบระบบปลดล็อกฉากจบฝั่ง Reader และการดึงข้อมูลใน Ending Collection Page
  - **Dependencies**: T-21
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: Reader อ่านถึงฉากจบแล้วปลดล็อกสำเร็จ ไม่บันทึกซ้ำใน `user_endings` และดึงรายการคอลเลกชันถูกต้อง
- **T-23: [Improve - Ending Collection]** เติม Celebration Popup Modal เมื่อปลดล็อกฉากจบ และปรับปรุง UI หน้า Ending Collection
  - **Dependencies**: T-22
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/service` ผ่าน 100%, หน้า Ending Collection และ Popup ฉากจบผ่าน E2E Checklist ทั้ง 4 สภาวะ

### Slice 12: Social System
- **T-24: [Verify - Social System]** ตรวจสอบ Bookmark, Like, Comment, Follow Writer APIs และการบล็อก Guest Access (401 Unauthorized)
  - **Dependencies**: T-23
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: Reader Bookmark/Like/Comment/Follow ได้ถูกต้อง, Guest ถูกปฏิเสธด้วย 401 Unauthorized
- **T-25: [Improve - Social System]** แก้ไข Bug ยอดนับซ้ำ, เติมระบบลบ Comment ตนเอง และปรับปรุง Social UI Toast Feedback
  - **Dependencies**: T-24
  - **Definition of Done (DoD)**: `cd novel-BE && go test ./internal/handlers` ผ่าน 100% และ UI ส่วน Social ทั้งหมดผ่าน E2E Checklist

### Slice 13: Admin System
- **T-26: [Verify - Admin System]** ตรวจสอบระบบสมัครเป็นนักเขียน, Admin Pending Requests และการกดอนุมัติ/ปฏิเสธ (Role changed to Writer)
  - **Dependencies**: T-25
  - **Definition of Done (DoD)**: ผ่าน Verification Checklist: Admin เท่านั้นที่เข้าถึง API อนุมัติได้ (403 สำหรับผู้อื่น), อนุมัติแล้ว Role เปลี่ยนเป็น Writer ทันที
- **T-27: [Improve - Admin System]** พัฒนา Admin Dashboard UI สำหรับจัดการคำขอนักเขียน จัดการ Report และ Banner ให้สมบูรณ์
  - **Dependencies**: T-26
  - **Definition of Done (DoD)**: หน้า Admin Dashboard UI ผ่าน E2E Checklist (Loading, Error, Empty, Success) และผ่านการสอบทาน Business Rules

---

## 3. Integration Phase

### T-28: [Integration] ทดสอบการทำงานเชื่อมโยงข้ามโมดูล (Cross-Module E2E Integration)
- **สิ่งที่ทำ**: ทดสอบ User Flow ตั้งแต่ Guest $\rightarrow$ Reader (อ่าน/เลือกทางเลือก/ปลดล็อก Ending) $\rightarrow$ Writer Application $\rightarrow$ Admin Approve $\rightarrow$ Writer (สร้างนิยาย/จัดกราฟ/Publish)
- **Dependencies**: T-27
- **Definition of Done (DoD)**: ผ่าน Cross-Module Verification Checklist 100% โดยไม่มีข้อผิดพลาดระหว่างเปลี่ยนผ่านสถานะหรือย้อนอ่าน

### T-29: [Feature - Notification] พัฒนาระบบแจ้งเตือนผู้ใช้งาน (Notification System)
- **สิ่งที่ทำ**: พัฒนาระบบแจ้งเตือนเมื่อคำขอสมัครนักเขียนได้รับอนุมัติ และแจ้งเตือนเมื่อนักเขียนที่ติดตามเพิ่มตอนใหม่
- **Dependencies**: T-28
- **Definition of Done (DoD)**: API Notification และ UI แจ้งเตือนแสดงผลบน Header ทำงานถูกต้อง และผ่าน E2E Checklist

---

## 4. Deployment Phase

### T-30: [Deployment] ตรวจสอบความพร้อมของ Docker Compose, Railway และ Vercel Setup
- **สิ่งที่ทำ**: ตรวจสอบการรัน Infra Stack ผ่าน Docker Compose (`docker compose up -d`), การตั้งค่า Environment Variables และคอนฟิก Deployment สำหรับ Railway (Backend) / Vercel (Frontend)
- **Dependencies**: T-29
- **Definition of Done (DoD)**: คำสั่ง `docker compose up -d` รันบริการทั้งหมด (Backend, PostgreSQL, MinIO) ได้ราบรื่น สื่อสารกันผ่าน Network ได้ 100%

---

## 5. Hardening Phase (6 Tasks)

### T-31: [Hardening - Quality Gates] ตั้งค่าและทดสอบ Quality Gates บนเครื่องการพัฒนา
- **สิ่งที่ทำ**: รันการตรวจคุณภาพโค้ด, Unit/Integration Test Coverage, Golangci-lint, Gosec Security Audit และ Frontend ESLint
- **Dependencies**: T-30
- **Definition of Done (DoD)**:
  - Backend: `cd novel-BE && go test -v -cover ./... && golangci-lint run && gosec ./...` ผ่าน 100% โดยไม่มี Error
  - Frontend: `cd novel-FE && npm run lint && npm run build` ผ่าน 100% โดยไม่มี Warning หรือ Error

### T-32: [Hardening - Security Review] ตรวจสอบความปลอดภัยตามมาตรฐาน OWASP
- **สิ่งที่ทำ**: ตรวจสอบการป้องกัน SQL Injection (`database/sql`), JWT Expiration & Signature Validation, Password Hashing (Bcrypt) และ CORS Middleware Configuration
- **Dependencies**: T-31
- **Definition of Done (DoD)**: ผ่าน Security Review Checklist ครบทุกข้อ และไม่มีช่องโหว่ความปลอดภัยระดับ High/Critical เหลืออยู่

### T-33: [Hardening - Performance Review] ตรวจสอบและปรับปรุง Performance ของระบบ
- **สิ่งที่ทำ**: ตรวจสอบ API Response Latency (เป้าหมาย < 500ms บน Local), ตรวจสอบ DB Indexing ใน PostgreSQL และ MinIO Image Caching
- **Dependencies**: T-32
- **Definition of Done (DoD)**: API Endpoints หลักมี Response Latency ต่ำกว่า 500ms และผ่าน Performance Verification Checklist

### T-34: [Hardening - Deployment Verification] ทดสอบรันและยืนยันความเสถียรบน Deployment Environment
- **สิ่งที่ทำ**: ทดสอบ Deploy และรันแอปพลิเคชันจริงบน Docker / Staging Environment พร้อมทดสอบ Healthcheck และ Database Connectivity
- **Dependencies**: T-33
- **Definition of Done (DoD)**: แอปพลิเคชันรันได้เสถียร Healthcheck คืนค่า 200 OK และบริการทั้งหมดเชื่อมต่อได้ไม่มีสะดุด

### T-35: [Hardening - Continuous Integration] ปรับปรุง GitHub Actions CI Pipeline
- **สิ่งที่ทำ**: เขียนและตรวจสอบไฟล์ `.github/workflows/ci.yml` สำหรับรัน Quality Gates, Test Suite และ Build Verification อัตโนมัติบนทุก Push/PR
- **Dependencies**: T-34
- **Definition of Done (DoD)**: ไฟล์ `.github/workflows/ci.yml` ทำงานสำเร็จและแสดงสถานะสีเขียว (Passed) บน GitHub Actions

### T-36: [Hardening - Cross-Agent Review] ดำเนินการ Cross-Agent Review ด้วย Session ใหม่
- **สิ่งที่ทำ**: เปิด Agent Session ใหม่เพื่อตรวจสอบความเรียบร้อยของระบบในภาพรวม Security, DAG Constraints, SPEC Compliance และ Regression Testing
- **Dependencies**: T-35
- **Definition of Done (DoD)**: รายงานการตรวจสอบจาก Cross-Agent Review ใน Session ใหม่ผ่านครบถ้วนทุกข้อ โดยไม่มีข้อบกพร่องระดับ Critical หรือ High เหลืออยู่

---

## 6. Architecture Organization

### T-37: [Architecture] จัดระเบียบไฟล์ Backend ภายใน layer packages เดิม
- **สิ่งที่ทำ**: แยก handlers/helpers, route registrations และ scene service ตาม responsibility โดยคง package เดิมและย้าย declaration เท่านั้น
- **ข้อจำกัด**: ห้ามเปลี่ยน business logic, API contract, middleware behavior, database/schema, frontend หรือ layer boundaries; ห้ามลบ DTO/model candidates
- **Definition of Done (DoD)**: การจัดไฟล์ครบทั้ง 3 phases, `gofmt -d .`, `git diff --check` และ `go test ./...` ผ่าน โดยไม่มี behavior change

### T-38: [Cleanup] ตรวจและนำ Unused DTO / Model ออกจาก Backend
- **สิ่งที่ทำ**: ตรวจ references, tests, serialization, OpenAPI และ workspace dependencies ก่อนลบเฉพาะ DTO/model ที่พิสูจน์ได้ว่าไม่มีการใช้งาน
- **ข้อจำกัด**: ทำทีละกลุ่ม; เก็บ type ไว้เมื่อมี dependency หรือ compatibility ที่ตรวจไม่ครบ; ห้ามเปลี่ยน behavior, API contract, schema หรือ frontend
- **Definition of Done (DoD)**: ทุกกลุ่มผ่าน `gofmt`, `git diff --check` และ `go test ./...`; ไม่มีการลบ type ที่ยังมี usage หรือ test dependency

---

## 7. OpenAPI Contract Consistency

### T-39: [Contract] ตรวจและปรับ OpenAPI ให้ตรงกับ Backend API ปัจจุบัน
- **สิ่งที่ทำ**: เปรียบเทียบ OpenAPI method/path, auth, request/response fields และ status codes กับ routes, handlers, request types และ frontend calls
- **ข้อจำกัด**: แก้เฉพาะ mismatch ที่ยืนยันได้; ห้ามเปลี่ยน runtime, database, frontend หรือเพิ่ม contract โดยเดา; ระบุ route ที่ยังไม่ยืนยันเป็น follow-up
- **Definition of Done (DoD)**: มี contract matrix ครบทุก OpenAPI operation, mismatch ที่ยืนยันแล้วถูกแก้ใน OpenAPI เท่าที่พิสูจน์ได้ และไม่มี runtime/API behavior change
