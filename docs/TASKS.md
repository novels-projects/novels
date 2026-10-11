# TASKS — novel-BE (งานตามลำดับความเสี่ยงและ Dependency)

> **สถานะเอกสาร:** สร้างใหม่จากหลักฐานปัจจุบัน ไม่มี Task ใดได้รับอนุมัติหรือผ่าน Acceptance Test แล้ว
> เว้นแต่จะระบุหลักฐานไว้ ทำทีละ 1 Task เท่านั้นตาม `AGENTS.md` (`Rules` ข้อ 2: ทำทีละ 1 Task)
> **ห้ามเริ่ม Task ที่มีสถานะ `AWAITING APPROVAL` โดยไม่ได้รับอนุมัติจากเจ้าของ**

**สถานะ:** `AWAITING APPROVAL` · `READY (no behavior change)` · `BLOCKED` · `DONE (มีหลักฐาน)`
**เทียบคำสถานะตาม `AGENTS.md`:** `AWAITING APPROVAL` = `รออนุมัติ` · `READY` = `พร้อมทำ` · `BLOCKED` = `Blocked` · งานที่รอคำตอบ OQ → ใช้ `รอคำตอบ` เมื่อมี — **ไม่สร้างรูปแบบรหัส `Q-xx`** (ไม่พบ template รหัสนี้ใน repo)
**Baseline:** Working Tree 79 รายการ (ณ ก่อนแก้เอกสารรอบนี้; เดิม 76 — เพิ่มจาก `AGENTS.md` ที่ถูกแก้นอกรอบ + `PLAN.md`/`TASKS.md` เป็น `??`) — ห้ามให้ diff เดิมหาย/เปลี่ยนโดยไม่เกี่ยวข้อง
**หมายเหตุไฟล์คู่มือ:** `PLAN.md`/`TASKS.md` เป็น untracked (`??`) — `git diff` ปกติไม่แสดงเนื้อหาที่เพิ่มใหม่ จึงต้องตรวจด้วยการอ่านเนื้อหาไฟล์เต็ม หรือเทียบกับสำเนา (copy) ที่เก็บไว้ก่อนแก้

---

## T0 — เก็บมติและขอบเขตจากเจ้าของโครงการ
- **สถานะ:** `AWAITING APPROVAL`
- **ประเภท:** Governance (เก็บมติ — ไม่แตะโค้ด/ข้อมูล)
- **ไฟล์ที่คาดว่าจะเปลี่ยน:** ไม่มี (บันทึกคำตอบลงใน `docs/PLAN.md` / `docs/TASKS.md` เมื่อมีมติ)
- **เหตุผล (Dependency):** T2/T4 ต้องยืนยัน DB isolation; T5/T7 ต้องการขอบเขต/นโยบาย → T0 เป็น gate ของงานที่เหลือ
- **รายการที่ต้องอนุมัติ:**
  1. ยืนยัน/จัด isolate ฐานข้อมูลสำหรับ test (ยังไม่พิสูจน์ว่าเป็น Test DB)
  2. Scope cleanup ข้อมูล `@test.local` (30 บัญชี: 21 writer / 9 reader, uid 102–131)
  3. อนุมัติแก้ Test Infrastructure (code change)
  4. อนุมัติสร้าง/รัน Integration Test ของ FR-STRUCT-09
  5. ขอบเขต re-verify Acceptance Test (Spec 001/002/011/019/020) + ที่บันทึกผล
  6. มติ XA-08 (Version/Last reviewed สำหรับ 17 Spec ที่ยังไม่ Review)
- **AC:** มีคำตอบเป็นลายลักษณ์อักษรครบ 6 ข้อ
- **Verify:** Checklist ใน `docs/PLAN.md` §7 ถูกติ๊กครบทุกข้อ

---

## T1 — ปิด Open Question ของ FR-STRUCT-04 ใน Spec 017 (เอกสารเท่านั้น)
- **สถานะ:** `READY (no behavior change)` — ไม่ต้องรอ T0
- **อ้างอิง:** `FR-STRUCT-04`; Spec 017 OQ **L138**; SRS L353, RTM L723; มติเจ้าของ = `SCENE_UNREACHABLE` เป็น Warning, Warning อย่างเดียวไม่บล็อก Publish, Blocking อื่นบล็อกตามเดิม
- **งาน:**
  1. แก้ `docs/specs/017-structure/spec.md` L138 — เปลี่ยนจาก "ยังไม่ตัดสินใจ" เป็นบันทึกมติแล้ว (warning / ไม่บล็อก)
  2. พิจารณา (ถามเจ้าของก่อน ทางเลือก): ปรับ SRS L353 / RTM L723 ให้ warning ชัดขึ้น หรือคงคำเดิม
- **ข้อจำกัด:** ห้ามแก้โค้ด `scene_publish_service.go` (สอดคล้องมติอยู่แล้ว); ห้ามแก้ AC/R-STRUCT-04 เนื้อหาอื่นโดยไม่จำเป็น
- **AC:** (ก) OQ L138 ไม่มีวลี "ยังไม่ตัดสินใจ" และระบุมติ warning ครบ; (ข) `git diff --name-status` ของ Task นี้มีเฉพาะไฟล์ Spec/SRS ที่อนุมัติ; (ค) ไม่มีไฟล์ `.go` เปลี่ยน
- **Verify:** `Select-String -Path docs/specs/017-structure/spec.md -Pattern 'ยังไม่ตัดสินใจ'` = 0 ผล; `git status --short` ไม่เพิ่มไฟล์ `.go`

---

## T3 — แก้ Test Infrastructure ไม่ให้เขียนข้อมูลค้าง (ต้องอนุมัติก่อน — ทำก่อน T2/T4)
- **สถานะ:** `AWAITING APPROVAL` (code change ใน Test Code)
- **อ้างอิง:** `internal/repository/auth_restore_integration_test.go` (`openTestDB`), `choice_graph_lock_integration_test.go`, `reading_progress_provenance_integration_test.go`, `scene_repo_test.go`; หลักฐานการรั่ว: บัญชี `restore_user_*` + nanotimestamp 28 บัญชีใน DB
- **งาน:** ทำให้ integration test ไม่เขียนข้อมูลถาวร — ทางเลือก (เลือกอย่างน้อยหนึ่งทางโดยไม่กระทบข้อมูลจริง):
  1. Transaction per test + rollback ท้าย test หรือ
  2. สร้าง/ลบข้อมูล test ใน scope ของ test เอง (cleanup ใน `t.Cleanup`) หรือ
  3. Guard ด้วย env flag (เช่น ต้องตั้ง `INTEGRATION_DB_CONFIRMED=1` ไม่งั้น `t.Skip`) เพื่อกันรันลง DB จริงโดยไม่ตั้งใจ — *(ยังไม่เลือกใช้: ยังไม่เพิ่ม env flag จนกว่าจะมีข้อเสนอทางเลือกให้พิจารณา)*
- **AC:** (ก) รันชุด integration แล้วจำนวนบัญชี `@test.local` + `restore_user_*` ใน DB **เท่าเดิมก่อน/หลัง**; (ข) test ยัง assert พฤติกรรมเดิมได้; (ค) ไม่มี production code เปลี่ยน
- **Verify:** SELECT นับ `users WHERE email LIKE '%test.local%'` ก่อนรันและหลังรันต้องเท่ากัน *(การรัน test เป็นการเขียนข้อมูล → ต้องรอ T0 ข้อ 1 และ 3 อนุมัติก่อน)*
- **Dependency:** ต้องทำ **ก่อน T2 และ T4** เพื่อไม่ให้ข้อมูลรั่วซ้ำ

---

## T4 — Cleanup ข้อมูล `@test.local` (ทำลายข้อมูล — ต้องอนุมัติก่อน ทำหลัง T3)
- **สถานะ:** `AWAITING APPROVAL` — ห้ามลบอัตโนมัติ
- **อ้างอิง:** รายงาน inspect — 30 บัญชี `@test.local` (uid 102–131); ตัวอย่างที่ยืนยันแล้ว: `uid=131 ac002_013506@test.local` มี `reading_progress` 1 แถว (progress_id 224, novel 1) และ `user_scene_history` 2 แถว; `uid=118 actest_reader_01@test.local` มี 1 + 2 แถว
- **เงื่อนไขความปลอดภัย (บังคับ):**
  1. อ่าน Foreign Key จริงของ `reading_progress`, `user_scene_history` → `users` ก่อน (schema ภายนอก)
  2. Backup (`pg_dump`) ก่อนลบ
  3. ลบเฉพาะที่ระบุตัวตนด้วย `email LIKE '%@test.local%'` **ห้ามลบด้วย ID ลอย ๆ และห้าม TRUNCATE ตาราง**
  4. ลบใน Transaction เดียว ตามลำดับ FK (children → parent)
  5. **อนุมัติ scope จากเจ้าของก่อนทุกครั้ง**
- **AC:** (ก) หลังลบ `SELECT count(*) WHERE email LIKE '%test.local%'` = 0; (ข) ข้อมูลที่ไม่ใช่ `@test.local` ไม่หาย; (ค) มี backup ก่อนลบ
- **Verify:** SELECT นับก่อน/หลัง + ตรวจแถวข้อมูลจริงกลุ่มอื่นยังอยู่ครบ
- **Dependency:** **ต้องทำหลัง T3** (ไม่งั้นรั่วซ้ำ)

---

## T2 — Integration Test ของ FR-STRUCT-09 promote/reindex (ต้องอนุมัติ + DB isolate)
- **สถานะ:** `BLOCKED` (รอ T0 ข้อ 1 และ 4 + ทำหลัง T3)
- **อ้างอิง:** `FR-STRUCT-09`, Spec 017 `R-STRUCT-09 → AC-STRUCT-09`; `internal/repository/chapter_repo.go` (`DeleteChapter`, guard L123, promote L167, reindex L150-159); infra: `openTestDB` ใน `auth_restore_integration_test.go`
- **กรณีทดสอบ 7 กรณี (ครบตามขอบเขต):**
  1. ลบ Chapter 1 (มี start scene) ที่มี Chapter ถัดไป → Chapter ถัดไปกลายเป็น episode 1 และฉากแรกถูกตั้งเป็น start scene (promote)
  2. Chapter ถัดไป **ไม่มี Scene** → ไม่มีฉากถูก promote, novel ยังใช้งานได้
  3. ลบ Chapter 1 ที่ **ไม่มี Chapter ถัดไป** → ลบสำเร็จ ไม่มี promote, ไม่ error
  4. ลบ Chapter ที่ **ไม่ใช่ Chapter 1** → episode ถัดไป reindex ต่อเนื่องไม่มีช่องว่าง และ start scene เดิมไม่ถูกแตะ
  5. ปฏิเสธการลบ Chapter ที่ไม่ใช่ Chapter 1 ซึ่งมี start scene → `ErrChapterHasStartScene`
  6. ปฏิเสธการลบ Chapter ที่มี incoming choices จากตอนอื่น → `ErrChapterHasIncomingChoices`
  7. Transaction rollback เมื่อเกิดข้อผิดพลาดระหว่างลบ → ข้อมูลกลับสู่สภาพก่อนลบครบถ้วน
- **การป้องกันการเขียนลง Production DB (บังคับก่อนเขียนแผนทดสอบจริง):**
  - ยืนยัน connection string ที่ `openTestDB` ใช้ชี้ไปยัง DB ที่แยก/isolate แล้วเท่านั้น (ยังไม่ยืนยัน — ดู PLAN §1)
  - รันด้วย env guard: ข้าม test หากไม่ได้ตั้ง flag ยืนยัน (ต่อยอดจาก T3) — *(ยังไม่อนุมัติ: ยังไม่เพิ่ม env flag จนกว่าจะมีข้อเสนอทางเลือกให้พิจารณา)*
  - ทุก test ต้อง scope ข้อมูลเองและ cleanup (หรือ rollback) ไม่แตะข้อมูลที่มีอยู่
  - **ห้ามรันจนกว่า T0 ข้อ 1+4 จะอนุมัติ**
- **AC:** ทั้ง 7 กรณี PASS; นับจำนวน `@test.local`/`restore_user_*` ก่อน-หลังรันเท่าเดิม; ไม่มี production code เปลี่ยน
- **Verify:** `go test ./internal/repository/ -run <TestName>` *(เมื่ออนุมัติแล้ว)* + SELECT นับข้อมูลก่อน/หลัง

---

## T5 — Re-verify และบันทึกผล Acceptance Test (Spec 001/002/011/019/020)
- **สถานะ:** `AWAITING APPROVAL` (ขอบเขต + ที่บันทึกผล)
- **ประเภท:** Verification/Read-only (รันตรวจ + สร้าง artifact ใหม่)
- **ไฟล์ที่คาดว่าจะเปลี่ยน:** ไฟล์ artifact ผลการทดสอบใหม่ (ยังไม่กำหนดชื่อ — รอขอบเขตจาก T0 ข้อ 5)
- **Dependency:** รอ T0 ข้อ 5 (ขอบเขต + ที่บันทึกผล)
- **อ้างอิง:** ยืนยันแล้วว่า **ไม่มีไฟล์ artifact บันทึกผล PASS/FAIL/UNABLE ใน repo**; ผลเดิมมีเฉพาะรายงานสนทนา:
  - Spec 001 — มีคำว่า "17 PASS / 0 FAIL / 0 UNABLE" อ้างจาก**รายงานสนทนาเดิม** — **ไม่ใช่ผลที่ยืนยันแล้ว ห้ามอ้างเป็นผลผ่าน** (ไม่มี artifact ใน repo, ไม่ทราบที่มาของการนับ; Spec 001 มี 6 AC)
  - Spec 002 — รายงานเดิมอ้างว่า `AC-PROG-01..03` ผ่าน (**ยังไม่มี artifact → ยังไม่ถือเป็นหลักฐาน**); fallback + start-position ยังเป็น OQ (Spec 002 L146-148)
  - Spec 011 (OQ L75) · Spec 019 (OQ L70-71) · Spec 020 (OQ L64) — รายงานเดิมอ้างว่าพฤติกรรมหลักผ่าน (**ยังไม่มี artifact → ยังไม่ถือเป็นหลักฐาน**) แต่ยังมี OQ
- **งาน:** re-verify เฉพาะจุดที่จำเป็น + บันทึกผลลงไฟล์ artifact ใหม่ (ระบุ PASS/FAIL/UNABLE ราย AC)
- **AC:** มีไฟล์ผลการทดสอบระบุราย AC; แยกชัดว่าข้อใดเป็น "หลักฐานเดิม (รายงานสนทนา)" กับ "ยืนยันในปัจจุบัน"
- **Verify:** อ่านไฟล์ artifact — ทุก AC มีค่า PASS/FAIL/UNABLE ไม่ใช่ค่าว่าง
- **ข้อจำกัด:** ห้ามสรุปว่าผ่านเพียงเพราะ `go test ./...` ผ่าน

---

## T6 — Review 8 ไฟล์ VAL test และยืนยัน VAL-01..11 (ไม่รวม VAL-05)
- **สถานะ:** `READY (no behavior change)` — review เท่านั้น ไม่แก้โค้ดผลิต
- **ประเภท:** Read-only (review เท่านั้น)
- **ไฟล์ที่คาดว่าจะเปลี่ยน:** ไม่มี — 8 ไฟล์ untracked เป็นวัตถุ review (การ commit ต้องขออนุมัติแยก)
- **Dependency:** ไม่มี (ทำคู่กันได้ — ไม่ต้องรอ T0)
- **อ้างอิง:** `FR-VALID-01` (Cross-cutting, RTM L766); SRS §3.1.17 (VAL ตาราง L477-487); 8 untracked: `dto/validation_rules_test.go`, `handlers/validation_rules_test.go`, `handlers/error_disclosure_test.go`, `handlers/media_upload_test.go`, `service/choice_label_validation_test.go`, `service/media_service_test.go`, `service/novel_category_validation_test.go`, `service/writer_apply_interests_test.go`
- **งาน:** review ให้ครบ VAL-01..VAL-04, VAL-06..VAL-11 (10 กฎ) + ยืนยัน VAL-05 ยังไม่มี `hint`
- **AC:** (ก) ทุก VAL (ยกเว้น VAL-05) มี test name โยง; (ข) `hint` = 0 hits; (ค) **ยังไม่สร้าง Spec 027**
- **Verify:** จับคู่ VAL ↔ test function; `Select-String -Pattern '\bhint\b'` ทั้งโค้ดและ openapi = 0
- **หมายเหตุ:** ยังไม่ commit/รัน โดยไม่ได้รับอนุมัติ

---

## T7 — XA-08: เติม Version / Last reviewed (ต้องมีมติ)
- **สถานะ:** `AWAITING APPROVAL`
- **ประเภท:** Documentation (ข้อมูล `Version` / `Last reviewed`)
- **ไฟล์ที่คาดว่าจะเปลี่ยน:** `docs/specs/*/spec.md` เฉพาะบรรทัด `Version` / `Last reviewed` — **ห้ามแก้ถ้าไม่มีหลักฐานการ review**
- **Dependency:** รอ T0 ข้อ 6 (นโยบาย XA-08)
- **หมายเหตุ ID:** `XA-08` **ไม่พบแหล่งอ้างอิงใน repo** (ค้นแล้วทั้ง docs, specs, โค้ด และ git history ของ BE/FE/DB; ในโค้ดมีเพียง `XA-11`) — **ห้ามเปลี่ยน ID เอง ต้องยืนยันกับเจ้าของก่อนใช้/เติมข้อมูล**
- **อ้างอิง:** ทั้ง 26 Spec มี `Version`/`Last reviewed` แต่ **17 ฉบับยัง "ยังไม่ได้ Review"** (เฉพาะ 001–008 และ 023 = 2026-10-09)
- **งาน:** รอนโยบายจากเจ้าของ (จะ review เมื่อใด / ค่ามาตรฐาน) แล้วจึงเติม
- **AC:** ตรงตามนโยบายที่อนุมัติ; ไม่แต่งข้อมูลย้อนหลังว่าเคย review แล้ว
- **Verify:** สแกน `**Last reviewed:**` ทุก spec เทียบกับนโยบาย

---

## T8 — ปิด Gap ของ Refresh, Report Notification และ Publish Regression
- **สถานะ:** `IMPLEMENTED — TARGETED TESTS PASSED; FULL DB INTEGRATION SUITE NOT RUN` (DB test credentials/isolation unavailable)
- **ประเภท:** Backend behavior + automated tests
- **อ้างอิง:** Spec 009 authentication; Spec 017 `R-STRUCT-10 → AC-STRUCT-10`; Spec 018 `R-PUBLISH-02/03`; Spec 023 `R-REPORT-05/06 → AC-REPORT-05/06`
- **งาน:**
  1. ตรวจสถานะบัญชีปัจจุบันก่อนออก token ใน RefreshToken; suspended account ต้องไม่ refresh
  2. เมื่อจัดการ report (`resolved`/`rejected`) แจ้งผู้รายงานและเจ้าของนิยายไม่เกินหนึ่ง notification ต่อผู้รับ ภายใน transaction เดิม
  3. เพิ่ม tests สำหรับ refresh ปกติ/ถูกปฏิเสธ และ report transitions/ผู้รับ/สถานะ
  4. เพิ่ม regression test ยืนยันว่าไม่มี start scene แล้วยัง publish ได้
- **ข้อจำกัด:** ไม่เปลี่ยน auth middleware, token storage/revocation, schema/migration, สิทธิ์ยื่น appeal, appeal/unban workflow หรือ severity ที่ Spec ยังไม่ตัดสิน; ไม่แก้ SRS/Spec
- **ไฟล์ที่คาดว่าจะเปลี่ยน:** `docs/TASKS.md`, `internal/service/auth_service.go`, `internal/service/auth_jwt_test.go`, `internal/repository/report_repo.go`, `internal/repository/report_repo_test.go`, `internal/service/scene_publish_service_test.go`
- **AC:** (ก) refresh ตรวจ current user status และปฏิเสธ suspended/missing/invalid/expired token; (ข) report ที่ resolve/reject แจ้งทั้ง reporter และ novel author โดยไม่ซ้ำ แม้เป็นคนเดียวกัน พร้อมสถานะ report/novel ถูกต้อง; (ค) ไม่มี start scene เป็น warning และยัง publish ได้
- **Verify:** PASS: targeted service/handler/dto/config tests, DB-independent repository tests, compile-only `go test ./... -run '^$'`, and `git diff --check`; NOT RUN: `go test ./...` because integration tests require `TEST_POSTGRES_USER` and isolated DB availability could not be confirmed; no schema, middleware, or Spec changes

---

## สรุป: Task ที่ต้องขออนุมัติเพิ่มก่อนเริ่ม

| Task | ต้องอนุมัติอะไร | สถานะ |
|---|---|---|
| **T0** | (เป็นตัวเก็บมติเอง) | `AWAITING APPROVAL` |
| **T3** | แก้ Test Code | `AWAITING APPROVAL` |
| **T4** | ลบข้อมูลจริง + scope | `AWAITING APPROVAL` |
| **T2** | สร้าง/รัน test + ยืนยัน DB isolate | `BLOCKED` |
| **T5** | ขอบเขต + ที่บันทึกผล | `AWAITING APPROVAL` |
| **T7** | นโยบาย XA-08 | `AWAITING APPROVAL` |
| **T1** | — (เอกสาร no behavior, แต่ทางเลือกแก้ SRS ต้องถาม) | `READY` |
| **T6** | — (review เท่านั้น; commit ต้องขอ) | `READY` |

**ลำดับที่แนะนำ:** T0 → T1 (ทำคู่กันได้) → T3 → (T4 และ T2) → T5 · T6 → T7
