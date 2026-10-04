# Feature Specification: อ่านนิยายแบบเลือกเส้นทาง

**Feature ID:** `001-read-novel`
**Status:** Draft
**Source:** `docs/SRS.md`

## 1. Goal

ให้ Reader สามารถอ่านนิยายที่เผยแพร่แล้ว และเลือกทางเลือกของเรื่องเพื่อดำเนินไปยัง Scene ที่เชื่อมโยงไว้ได้

## 2. Scope

### In Scope

* อ่านเนื้อหาของนิยายที่เผยแพร่แล้ว
* แสดงทางเลือกของ Scene ที่กำลังอ่าน
* เลือกทางเลือกเพื่อไปยัง Scene ปลายทาง
* จำกัดการอ่านตามสถานะการเผยแพร่ของ Novel, ตอน และ Scene

### Out of Scope

* การค้นหาและเรียกดูนิยาย
* การบันทึกและอ่านต่อจากตำแหน่งเดิม
* การดูโครงสร้างเนื้อเรื่องจากแผนผังการอ่าน
* การเลือก Scene จากแผนผังการอ่าน
* การสร้างหรือแก้ไข Novel, ตอน, Scene และ Choice
* การเผยแพร่นิยาย
* Preview
* ชั้นหนังสือและการติดตามนักเขียน
* การแจ้งเตือน
* การจัดการของ Admin

## 3. Requirements

### R-READ-01 — อ่านเนื้อหานิยาย

ระบบต้องให้ Reader อ่านเนื้อหาของ Novel ที่เผยแพร่แล้ว โดยเนื้อหาที่แสดงต้องอยู่ในตอนและ Scene ที่เผยแพร่แล้ว

**Traceability:** `FR-READ-04`, `FR-READ-08`

### R-READ-02 — แสดงทางเลือก

เมื่อ Scene มี Choice ระบบต้องแสดงทางเลือกที่ Reader สามารถเลือกได้

**Traceability:** `FR-READ-05`

### R-READ-03 — ดำเนินเรื่องตามทางเลือก

เมื่อ Reader เลือก Choice ระบบต้องนำไปยัง Scene ปลายทางที่ Choice นั้นเชื่อมโยงไว้

**Traceability:** `FR-READ-06`

## 4. Acceptance Criteria

### AC-READ-01

**Given** Novel, ตอน และ Scene อยู่ในสถานะเผยแพร่
**When** Reader เปิด Scene
**Then** ระบบแสดงเนื้อหาของ Scene นั้น

### AC-READ-02

**Given** Scene มี Choice
**When** Reader เปิด Scene
**Then** ระบบแสดง Choice ที่สามารถเลือกได้

### AC-READ-03

**Given** Reader เลือก Choice ที่เชื่อมโยงกับ Scene ปลายทาง
**When** ระบบประมวลผล Choice
**Then** ระบบนำ Reader ไปยัง Scene ปลายทางนั้น

### AC-READ-04

**Given** Novel, ตอน หรือ Scene ยังไม่เผยแพร่
**When** Reader พยายามเข้าถึงเนื้อหานั้น
**Then** ระบบไม่อนุญาตให้ Reader ทั่วไปอ่านเนื้อหาดังกล่าว

### AC-READ-05

**Given** Reader ดำเนินเรื่องผ่าน Choice ที่ถูกต้อง
**When** เลือก Choice
**Then** ระบบต้องนำไปยัง Scene ที่ Choice ระบุไว้ และไม่ให้ข้ามไปยัง Scene ที่ไม่ได้อยู่ในเส้นทางที่ระบบอนุญาต

## 5. Constraints

* โครงสร้างเนื้อหาเป็น `Novel → ตอน → Scene → Choice`
* Choice ต้องเชื่อมโยงไปยัง Scene ปลายทาง
* Reader ทั่วไปอ่านได้เฉพาะเนื้อหาที่เผยแพร่แล้ว
* รายละเอียดเกี่ยวกับการบันทึกตำแหน่งการอ่านไม่อยู่ใน Feature นี้
* รายละเอียดเกี่ยวกับแผนผังการอ่านไม่อยู่ใน Feature นี้

## 6. Traceability

| SRS ID       | Spec Requirement | Acceptance Criteria        |
| ------------ | ---------------- | -------------------------- |
| `FR-READ-04` | `R-READ-01`      | `AC-READ-01`               |
| `FR-READ-05` | `R-READ-02`      | `AC-READ-02`               |
| `FR-READ-06` | `R-READ-03`      | `AC-READ-03`, `AC-READ-05` |
| `FR-READ-08` | `R-READ-01`      | `AC-READ-04`               |

## 7. Open Questions

ไม่มีสำหรับขอบเขตของ Feature นี้ในขณะนี้

ประเด็นที่พบจากการตรวจ implementation เช่น Reading Progress และพฤติกรรมของแผนผังการอ่านของ Reader จะถูกจัดการใน Spec ของ Feature ที่เกี่ยวข้อง ไม่รวมไว้ใน Feature นี้

## 8. Review Status

**Version:** 1.2
**Status:** Draft — Terminology aligned with SRS
**Last reviewed:** 2026-10-05
    