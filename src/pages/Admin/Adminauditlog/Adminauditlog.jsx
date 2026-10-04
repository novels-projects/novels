import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  RotateCw,
  Filter,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Loader2,
  Inbox,
  Shield,
  Download,
  FileSpreadsheet,
  Home
} from "lucide-react";
import ExcelJS from "exceljs";
import "./Adminauditlog.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// =========================================================================
// 1. Mapping Dictionaries
// =========================================================================

// ตารางแปล Action ดิบจาก backend เป็นภาษาไทย + กลุ่มสี badge
export const ACTION_MAP = {
  REGISTER: { label: "สมัครสมาชิก", group: "gray", color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  LOGIN: { label: "เข้าสู่ระบบ", group: "gray", color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  LOGIN_FAILED: { label: "เข้าสู่ระบบไม่สำเร็จ", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  LOGOUT: { label: "ออกจากระบบ", group: "gray", color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  UPDATE_PROFILE: { label: "แก้ไขข้อมูลส่วนตัว", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  DELETE_ACCOUNT: { label: "ลบบัญชีตัวเอง", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  SUSPEND_USER: { label: "ระงับการใช้งานผู้ใช้", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  UNSUSPEND_USER: { label: "ยกเลิกการระงับผู้ใช้", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  RESTORE_WRITER_ACCESS: { label: "คืนสิทธิ์นักเขียน", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  CHANGE_ROLE: { label: "เปลี่ยนสิทธิ์ผู้ใช้", group: "orange", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  DELETE_USER: { label: "ลบผู้ใช้", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  APPROVE_WRITER: { label: "อนุมัติคำขอเป็นนักเขียน", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  REJECT_WRITER: { label: "ปฏิเสธคำขอเป็นนักเขียน", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  CREATE_NOVEL: { label: "สร้างนิยาย", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UPDATE_NOVEL: { label: "แก้ไขนิยาย", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  PUBLISH_NOVEL: { label: "เผยแพร่นิยาย", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UNPUBLISH_NOVEL: { label: "ยกเลิกการเผยแพร่นิยาย", group: "orange", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  DELETE_NOVEL: { label: "ลบนิยาย", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  CREATE_CHAPTER: { label: "สร้างตอน", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UPDATE_CHAPTER: { label: "แก้ไขตอน", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  DELETE_CHAPTER: { label: "ลบตอน", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  CREATE_SCENE: { label: "สร้างฉาก", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UPDATE_SCENE: { label: "แก้ไขฉาก", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  DELETE_SCENE: { label: "ลบฉาก", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  CREATE_CHOICE: { label: "สร้างตัวเลือก", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UPDATE_CHOICE: { label: "แก้ไขตัวเลือก", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  DELETE_CHOICE: { label: "ลบตัวเลือก", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  CREATE_CATEGORY: { label: "สร้างหมวดหมู่", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  UPDATE_CATEGORY: { label: "แก้ไขหมวดหมู่", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  DELETE_CATEGORY: { label: "ลบหมวดหมู่", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  UPDATE_REPORT_STATUS: { label: "อัปเดตสถานะรายงาน", group: "orange", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  DEMOTE_USER: { label: "ปลดสิทธิ์ผู้ใช้", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  UNAUTHORIZED_ACCESS: { label: "พยายามเข้าถึงโดยไม่มีสิทธิ์", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  // เพิ่ม: มีอยู่จริงใน backend (novel_handler.go, chapter_handler.go, scene_handler.go,
  // report_handler.go, admin_user_handler.go) แต่ยังไม่มีคำแปลใน frontend มาก่อน
  // หมายเหตุ: ไม่ใส่ BAN_NOVEL เพราะตรวจโค้อ backend แล้วยืนยันว่าไม่เคยถูกเรียกใช้จริง
  // (ทีม backend ยืนยันแล้วว่าลบออกจาก defaultActions ของ audit_repo.go แล้วด้วย)
  PUBLISH_CHAPTER: { label: "เผยแพร่ตอน", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  UNPUBLISH_CHAPTER: { label: "ยกเลิกการเผยแพร่ตอน", group: "orange", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  PUBLISH_SCENE: { label: "เผยแพร่ฉาก", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  UNPUBLISH_SCENE: { label: "ยกเลิกการเผยแพร่ฉาก", group: "orange", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" },
  SUSPEND_NOVEL: { label: "ระงับการเผยแพร่นิยาย", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
  // UNSUSPEND_NOVEL คือชื่อ action ปัจจุบัน (backend เปลี่ยนจาก UNBAN_NOVEL เพื่อให้
  // สมมาตรกับ SUSPEND_NOVEL แล้ว — ยืนยันจากทีม backend ว่า ณ ตอนแก้ไม่มี record เก่า
  // ที่ใช้ชื่อ UNBAN_NOVEL อยู่ในฐานข้อมูลจริงเลย) ให้ label เดียวกันทั้งคู่ เผื่ออนาคต
  // มี record เก่าโผล่มา (เช่น migrate ข้อมูลจากที่อื่น หรือ deploy ผิดเวอร์ชันชั่วคราว)
  // จะได้ยังกรอง/แสดงผลถูกต้อง ไม่ต้องแก้โค้ดฉุกเฉิน
  UNSUSPEND_NOVEL: { label: "ยกเลิกการระงับนิยาย", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  // hiddenInFilter: ไม่โชว์เป็นตัวเลือกในดรอปดาวน์ตัวกรอง (จะซ้ำหน้าตากับ
  // UNSUSPEND_NOVEL ด้านบนเป๊ะ ทำให้แอดมินงงว่าเลือกอันไหนดี) เก็บไว้แค่ให้
  // ACTION_MAP[log.action] แปล label ถูกต้อง ถ้า log เก่าที่ใช้ชื่อนี้โผล่มาจริง
  UNBAN_NOVEL: { label: "ยกเลิกการระงับนิยาย", group: "green", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0", hiddenInFilter: true },
  ADMIN_UPDATE_USERNAME: { label: "แอดมินแก้ไขชื่อผู้ใช้", group: "blue", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  SUBMIT_REPORT: { label: "ยื่นรายงาน", group: "gray", color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  SUBMIT_APPEAL: { label: "ยื่นอุทธรณ์", group: "gray", color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  SUSPEND_OWN_ACCOUNT: { label: "ระงับบัญชีตัวเอง", group: "red", color: "#e11d48", bg: "#ffe4e6", border: "#fecdd3" },
};

// จัดกลุ่ม action สำหรับแสดงเป็น <optgroup> ในดรอปดาวน์ตัวกรอง "การกระทำ"
// แยกจาก ACTION_MAP เพื่อไม่ต้องแก้ทุกรายการเดิม แค่กำหนดว่า key ไหนอยู่กลุ่มไหน
// action ที่ hiddenInFilter=true (เช่น UNBAN_NOVEL) จะถูกกรองออกจากทุกกลุ่มอัตโนมัติ
export const ACTION_GROUPS = [
  {
    label: "บัญชีผู้ใช้",
    keys: ["REGISTER", "LOGIN", "LOGIN_FAILED", "LOGOUT", "UPDATE_PROFILE", "DELETE_ACCOUNT", "SUSPEND_OWN_ACCOUNT"],
  },
  {
    label: "การจัดการผู้ใช้ (แอดมิน)",
    keys: ["SUSPEND_USER", "UNSUSPEND_USER", "RESTORE_WRITER_ACCESS", "DELETE_USER", "DEMOTE_USER", "ADMIN_UPDATE_USERNAME"],
  },
  {
    label: "นักเขียน",
    keys: ["APPROVE_WRITER", "REJECT_WRITER"],
  },
  {
    label: "นิยาย / ตอน / ฉาก / ตัวเลือก",
    keys: [
      "CREATE_NOVEL", "UPDATE_NOVEL", "PUBLISH_NOVEL", "UNPUBLISH_NOVEL", "DELETE_NOVEL",
      "SUSPEND_NOVEL", "UNSUSPEND_NOVEL",
      "CREATE_CHAPTER", "UPDATE_CHAPTER", "PUBLISH_CHAPTER", "UNPUBLISH_CHAPTER", "DELETE_CHAPTER",
      "CREATE_SCENE", "UPDATE_SCENE", "PUBLISH_SCENE", "UNPUBLISH_SCENE", "DELETE_SCENE",
      "CREATE_CHOICE", "UPDATE_CHOICE", "DELETE_CHOICE",
    ],
  },
  {
    label: "หมวดหมู่นิยาย",
    keys: ["CREATE_CATEGORY", "UPDATE_CATEGORY", "DELETE_CATEGORY"],
  },
  {
    label: "รายงาน / อุทธรณ์",
    keys: ["SUBMIT_REPORT", "SUBMIT_APPEAL", "UPDATE_REPORT_STATUS"],
  },
  {
    label: "ความปลอดภัย",
    keys: ["UNAUTHORIZED_ACCESS"],
  },
];


export const METADATA_KEY_MAP = {
  email: "อีเมล",
  username: "ชื่อผู้ใช้",
  field: "ฟิลด์ที่แก้ไข",
  deleted_user_id: "รหัสผู้ใช้ที่ถูกลบ",
  new_status: "สถานะใหม่",
  previous_status: "สถานะก่อนหน้า",
  old_status: "สถานะเดิม",
  reason: "เหตุผล",
  new_role: "สิทธิ์ใหม่",
  previous_role: "สิทธิ์ก่อนหน้า",
  role: "สิทธิ์",
  status: "สถานะ",
  rejection_reason: "เหตุผลที่ปฏิเสธ",
  title: "ชื่อเรื่อง",
  old_title: "ชื่อเรื่องเดิม",
  new_title: "ชื่อเรื่องใหม่",
  old_is_completed: "จบเรื่องแล้ว (ก่อนหน้า)",
  new_is_completed: "จบเรื่องแล้ว (ปัจจุบัน)",
  author_id: "รหัสผู้เขียน",
  novel_id: "รหัสนิยาย",
  novel_title: "ชื่อนิยาย",
  chapter_id: "รหัสตอน",
  chapter_title: "ชื่อตอน",
  scene_title: "ชื่อฉาก",
  from_scene_id: "ฉากต้นทาง",
  to_scene_id: "ฉากปลายทาง",
  name: "ชื่อ",
  old_name: "ชื่อเดิม",
  new_name: "ชื่อใหม่",
  profile_picture: "รูปโปรไฟล์",
  // key ที่ระบบสร้างได้จริงจาก before/after diff (scene/choice) และ UNAUTHORIZED_ACCESS แต่ยังไม่มีคำแปล
  old_type: "ประเภทเดิม",
  new_type: "ประเภทใหม่",
  old_label: "ข้อความตัวเลือกเดิม",
  new_label: "ข้อความตัวเลือกใหม่",
  old_to_scene_id: "ฉากปลายทางเดิม",
  new_to_scene_id: "ฉากปลายทางใหม่",
  path: "เส้นทางที่พยายามเข้าถึง",
  method: "HTTP Method",
  // เพิ่ม: พบจริงใน handler แต่ยังไม่มีคำแปลมาก่อน
  old_username: "ชื่อผู้ใช้เดิม",
  new_username: "ชื่อผู้ใช้ใหม่",
  previous_is_published: "เผยแพร่อยู่หรือไม่ (ก่อนหน้า)",
  new_is_published: "เผยแพร่อยู่หรือไม่ (ปัจจุบัน)",
  choices_diff: "การเปลี่ยนแปลงตัวเลือก",
  created_count: "สร้างใหม่ (จำนวน)",
  updated_count: "แก้ไข (จำนวน)",
  deleted_count: "ลบ (จำนวน)",
  report_type: "ประเภทรายงาน",
  author_user_id: "รหัสบัญชีผู้ใช้ของผู้เขียน",
  author_name: "ชื่อผู้เขียน",
};

// ตารางแปล Target Type ดิบเป็นภาษาไทย
export const TARGET_TYPE_MAP = {
  user: "ผู้ใช้",
  novel: "นิยาย",
  chapter: "ตอน",
  scene: "ฉาก",
  choice: "ตัวเลือก",
  category: "หมวดหมู่",
  writer: "นักเขียน",
  report: "รายงาน",
  route: "เส้นทาง (Route)",
};

// ตารางแปล Role
export const ROLE_MAP = {
  admin: "แอดมิน",
  writer: "นักเขียน",
  reader: "นักอ่าน",
};

// ตารางแปลค่าที่ตายตัวในระบบ
export const VALUE_MAP = {
  active: "ใช้งานปกติ",
  suspended: "ระงับการใช้งาน",
  draft: "แบบร่าง",
  published: "เผยแพร่แล้ว",
  "completed-published": "เผยแพร่แล้ว (จบเรื่อง)",
  pending: "รอตรวจสอบ",
  appeal_pending: "รอตรวจสอบ",
  resolved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธแล้ว",
  report: "รายงาน",
  appeal: "อุทธรณ์",
  admin: "แอดมิน",
  writer: "นักเขียน",
  reader: "นักอ่าน",
  true: "ใช่",
  false: "ไม่ใช่",
  // ค่า reason แบบ coded จาก UNAUTHORIZED_ACCESS (string คงที่จาก middleware ไม่ใช่ข้อความอิสระ)
  missing_token: "ไม่ได้แนบ Token เข้ามาในคำขอ",
  invalid_or_expired_token: "Token ไม่ถูกต้องหรือหมดอายุ",
  role_mismatch: "สิทธิ์ผู้ใช้ไม่ตรงกับที่เส้นทางนี้ต้องการ",
};

// ตารางแปลข้อความ Error จาก backend (400)
export const ERROR_MESSAGE_MAP = {
  "invalid audit log id": "รหัสรายการไม่ถูกต้อง",
  "invalid actor_user_id": "รหัสผู้กระทำไม่ถูกต้อง",
  "invalid target_id": "รหัสเป้าหมายไม่ถูกต้อง",
  "invalid page": "หมายเลขหน้าไม่ถูกต้อง",
  "limit must be between 1 and 100": "จำนวนรายการต่อหน้าต้องอยู่ระหว่าง 1-100",
  "invalid date_from": "วันที่เริ่มต้นไม่ถูกต้อง",
  "invalid date_to": "วันที่สิ้นสุดไม่ถูกต้อง",
  "date_from must be before date_to": "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด",
  "audit log not found": "ไม่พบรายการนี้",
  "failed to list audit logs": "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
  "failed to get audit log": "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
};

// =========================================================================
// 2. Format Helper Functions
// =========================================================================

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

// แปลงเป็นวันที่แบบย่อไทย เช่น 22 ส.ค. 2569 15:30 น.
const formatShortThaiDateTime = (dateString) => {
  if (!dateString) return "-";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${minutes} น.`;
  } catch {
    return dateString;
  }
};

// แปลงเป็นวันที่แบบเต็มไทย เช่น 22 สิงหาคม 2569 15:30:00 น.
const formatFullThaiDateTime = (dateString) => {
  if (!dateString) return "-";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = d.getDate();
    const month = THAI_MONTHS_FULL[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${minutes}:${seconds} น.`;
  } catch {
    return dateString;
  }
};

// แปลงค่า Value ให้อ่านง่ายเป็นภาษาไทย
const formatMetadataValue = (key, val, allMetadata = {}) => {
  if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) return "-";
  if (typeof val === "boolean") return val ? "ใช่" : "ไม่ใช่";
  // choices_diff เป็น object สรุปจำนวนตัวเลือกที่สร้าง/แก้/ลบตอนแก้ไขฉาก
  // (มาจาก SyncSceneChoices) แสดงเป็นข้อความไทยแทนการโชว์ JSON ดิบให้แอดมินอ่านเอง
  if (key === "choices_diff" && typeof val === "object") {
    const { created_count = 0, updated_count = 0, deleted_count = 0 } = val;
    const parts = [];
    if (created_count > 0) parts.push(`สร้างใหม่ ${created_count} รายการ`);
    if (updated_count > 0) parts.push(`แก้ไข ${updated_count} รายการ`);
    if (deleted_count > 0) parts.push(`ลบ ${deleted_count} รายการ`);
    return parts.length > 0 ? parts.join(", ") : "ไม่มีการเปลี่ยนแปลง";
  }
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  // ถ้าเป็น novel_id และมี novel_title ให้แสดงคู่กัน
  if (key === "novel_id" && allMetadata.novel_title) {
    return `${allMetadata.novel_title} (รหัส: ${val})`;
  }
  // ถ้าเป็น chapter_id และมี chapter_title ให้แสดงคู่กัน
  if (key === "chapter_id" && allMetadata.chapter_title) {
    return `${allMetadata.chapter_title} (รหัส: ${val})`;
  }

  const strVal = String(val).trim();
  const lowerVal = strVal.toLowerCase();

  if (VALUE_MAP[lowerVal]) {
    return VALUE_MAP[lowerVal];
  }

  return strVal;
};

// แสดงชื่อผู้กระทำ เช่น แอดมิน (admin_user) หรือ แอดมิน #5 หรือ ระบบ
const renderActorName = (actorUserId, actorRole, actorUsername) => {
  if (!actorUserId) return "ระบบ";
  const roleName = ROLE_MAP[actorRole?.toLowerCase()] || actorRole || "ผู้ใช้";
  if (actorUsername && actorUsername.trim() !== "") {
    return `${roleName} (${actorUsername})`;
  }
  return `${roleName} #${actorUserId}`;
};

// แสดงเป้าหมาย เช่น นิยาย (ชื่อเรื่อง) หรือ นิยาย #88
const renderTargetName = (targetType, targetId, targetName) => {
  if (!targetType && !targetId) return "-";
  const typeLabel = TARGET_TYPE_MAP[targetType?.toLowerCase()] || targetType || "เป้าหมาย";
  if (targetName && targetName.trim() !== "") {
    return `${typeLabel} (${targetName})`;
  }
  if (targetId !== null && targetId !== undefined && targetId !== "") {
    return `${typeLabel} #${targetId}`;
  }
  return typeLabel;
};

// แสดง Badge สถานะ (SUCCESS = เขียว, FAILURE = แดง, อื่นๆ = ส้ม/เทา)
const renderStatusBadge = (status) => {
  const upper = (status || "").toUpperCase();
  if (upper === "SUCCESS") {
    return (
      <span className="admin-audit-status-badge admin-audit-status-badge--success">
        <CheckCircle2 size={13} />
        <span>สำเร็จ</span>
      </span>
    );
  }
  if (upper === "FAILURE" || upper === "FAILED" || upper === "ERROR") {
    return (
      <span className="admin-audit-status-badge admin-audit-status-badge--failure">
        <AlertCircle size={13} />
        <span>ไม่สำเร็จ</span>
      </span>
    );
  }
  return (
    <span className="admin-audit-status-badge admin-audit-status-badge--other">
      {status || "-"}
    </span>
  );
};

// =========================================================================
// 3. Main Adminauditlog Component
// =========================================================================

export default function Adminauditlog() {
  // Main Data States
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [logView, setLogView] = useState("all"); // "all" | "content" | "security"
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [metadata, setMetadata] = useState({ actions: [], target_types: [], statuses: [] });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Filter States
  const [actionFilter, setActionFilter] = useState("");
  const [actorUserIdInput, setActorUserIdInput] = useState("");
  const [actorUserIdFilter, setActorUserIdFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [filterValidationMsg, setFilterValidationMsg] = useState("");

  // Debounce Actor User ID Input (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setActorUserIdFilter(actorUserIdInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [actorUserIdInput]);

  // Mobile Filter Drawer State
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  // ซ่อน/แสดงกลุ่มตัวกรองที่ใช้ไม่บ่อย (การกระทำแบบละเอียด, ประเภทเป้าหมาย, สถานะ)
  // เพื่อลดความรกของแถบเครื่องมือ — ค่าเริ่มต้นเปิดอัตโนมัติถ้ามีการเลือกฟิลเตอร์กลุ่มนี้ไว้อยู่แล้ว (เช่น มาจาก URL หรือรีเฟรชหน้า)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  // เปิด/ปิดเมนู dropdown ของปุ่ม "ส่งออก" ที่รวม CSV + Excel ไว้ในปุ่มเดียว
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Detail Modal States
  const [selectedLogId, setSelectedLogId] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // ตรวจสอบว่ามี Filter ที่กำลังใช้งานอยู่หรือไม่
  const hasActiveFilters = Boolean(
    actionFilter ||
    actorUserIdInput ||
    targetTypeFilter ||
    statusFilter ||
    dateFromFilter ||
    dateToFilter
  );

  // นับจำนวนตัวกรอง "ขั้นสูง" (การกระทำ, ประเภทเป้าหมาย, สถานะ) ที่กำลังใช้งานอยู่
  // ใช้โชว์เป็นตัวเลขบนปุ่ม "ตัวกรองเพิ่มเติม" เพื่อให้รู้ทันทีว่ามีฟิลเตอร์ซ่อนอยู่กี่ตัวโดยไม่ต้องกดเปิดดู
  const advancedFilterCount = [actionFilter, targetTypeFilter, statusFilter].filter(Boolean).length;

  // ถ้าหน้าโหลดมาพร้อมตัวกรองขั้นสูงที่ถูกตั้งค่าไว้แล้ว (เช่น รีเฟรชหน้าค้าง filter เดิม)
  // ให้เปิด panel นี้ให้อัตโนมัติ ผู้ใช้จะได้ไม่งงว่าทำไมผลลัพธ์ถูกกรองอยู่ทั้งที่มองไม่เห็นตัวกรอง
  useEffect(() => {
    if (advancedFilterCount > 0) {
      setShowAdvancedFilters(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // action กลุ่ม "security" (เข้า/ออกระบบ, สมัครสมาชิก, พยายามเข้าถึงโดยไม่มีสิทธิ์) — ใช้แยกออกจาก content activity
  const SECURITY_ACTIONS = useMemo(
    () => new Set(["LOGIN", "LOGOUT", "LOGIN_FAILED", "UNAUTHORIZED_ACCESS", "REGISTER", "SUSPEND_OWN_ACCOUNT"]),
    []
  );

  // Helper: ดึงรายการ log ทั้งหมดตามตัวกรองปัจจุบันเพื่อใช้แยกแยะจำนวนและกรอง client-side แบบข้ามทุกหน้า
  const fetchAllLogsForCurrentFilters = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return [];

    let allItems = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && allItems.length < 5000) {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "100");
      if (actionFilter) params.set("action", actionFilter);
      if (actorUserIdFilter) params.set("actor", actorUserIdFilter);
      if (targetTypeFilter) params.set("target_type", targetTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFromFilter) params.set("date_from", new Date(dateFromFilter).toISOString());
      if (dateToFilter) params.set("date_to", new Date(dateToFilter).toISOString());

      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!res || !res.ok) break;

      const json = await res.json().catch(() => null);
      const pageItems = json?.data?.items || [];
      const totalItems = json?.data?.total || pageItems.length;

      allItems = [...allItems, ...pageItems];
      if (allItems.length >= totalItems || pageItems.length === 0) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }
    return allItems;
  }, [actionFilter, actorUserIdFilter, targetTypeFilter, statusFilter, dateFromFilter, dateToFilter]);

  // คำนวณชุดข้อมูลเมื่อมีการสลับมุมมอง "ทั้งหมด" / "เนื้อหา" / "security"
  const activeDataset = useMemo(() => {
    const source = allLogs.length > 0 ? allLogs : logs;
    if (logView === "content") {
      return source.filter((l) => !SECURITY_ACTIONS.has(l.action));
    }
    if (logView === "security") {
      return source.filter((l) => SECURITY_ACTIONS.has(l.action));
    }
    return null; // "all"
  }, [logView, allLogs, logs, SECURITY_ACTIONS]);

  const displayTotal = useMemo(() => {
    if (logView === "all") return total;
    return activeDataset ? activeDataset.length : 0;
  }, [logView, total, activeDataset]);

  const displayTotalPages = useMemo(() => {
    return Math.ceil(displayTotal / limit) || 1;
  }, [displayTotal, limit]);

  const visibleLogs = useMemo(() => {
    if (logView === "all") return logs;
    if (!activeDataset) return [];
    const start = (page - 1) * limit;
    return activeDataset.slice(start, start + limit);
  }, [logView, logs, activeDataset, page, limit]);

  const allCount = total || (allLogs.length > 0 ? allLogs.length : logs.length);

  const contentCount = useMemo(() => {
    const source = allLogs.length > 0 ? allLogs : logs;
    return source.filter((l) => !SECURITY_ACTIONS.has(l.action)).length;
  }, [allLogs, logs, SECURITY_ACTIONS]);

  const securityCount = useMemo(() => {
    const source = allLogs.length > 0 ? allLogs : logs;
    return source.filter((l) => SECURITY_ACTIONS.has(l.action)).length;
  }, [allLogs, logs, SECURITY_ACTIONS]);

  const handleLogViewChange = (newView) => {
    setLogView(newView);
    setPage(1);
  };

  // 🟢 Fetch List Audit Logs
  const fetchAuditLogs = useCallback(async (isSilent = false) => {
    // Validate filters before calling API
    setFilterValidationMsg("");
    setError("");

    if (dateFromFilter && dateToFilter) {
      const fromD = new Date(dateFromFilter);
      const toD = new Date(dateToFilter);
      if (fromD >= toD) {
        setFilterValidationMsg("วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด");
        return;
      }
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login-register";
      return;
    }

    if (!isSilent) setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));

      if (actionFilter) params.set("action", actionFilter);
      if (actorUserIdFilter) params.set("actor", actorUserIdFilter);
      if (targetTypeFilter) params.set("target_type", targetTypeFilter);
      if (statusFilter) params.set("status", statusFilter);

      if (dateFromFilter) {
        const isoFrom = new Date(dateFromFilter).toISOString();
        params.set("date_from", isoFrom);
      }
      if (dateToFilter) {
        const isoTo = new Date(dateToFilter).toISOString();
        params.set("date_to", isoTo);
      }

      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login-register";
        return;
      }

      if (res.status === 403) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const text = await res.text();
      let resJson;
      try {
        resJson = JSON.parse(text);
      } catch {
        throw new Error(text || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }

      if (!res.ok) {
        const rawMsg = (typeof resJson?.error === "object" ? resJson.error?.message : resJson?.error) || resJson?.message || "";
        const thaiMsg = ERROR_MESSAGE_MAP[rawMsg] || rawMsg || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
        throw new Error(thaiMsg);
      }

      const data = resJson.data || {};
      const pageItems = data.items || [];
      setLogs(pageItems);
      setTotal(data.total || 0);

      // ดึงชุดข้อมูลเต็มแบบ async เบื้องหลังเพื่อคำนวณสถิติจำนวนรวมและการกรองแยกมุมมองได้ครบทุกหน้า
      fetchAllLogsForCurrentFilters().then((fetchedAll) => {
        if (fetchedAll && fetchedAll.length > 0) {
          setAllLogs(fetchedAll);
        } else {
          setAllLogs(pageItems);
        }
      });
    } catch (err) {
      console.error("Fetch audit logs error:", err);
      setError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, actorUserIdFilter, targetTypeFilter, statusFilter, dateFromFilter, dateToFilter, fetchAllLogsForCurrentFilters]);

  // จุดที่ 6: Auto-refresh / Polling ทุก 30 วินาที
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAuditLogs(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAuditLogs]);

  // 🟢 Fetch Filter Metadata
  const fetchMetadata = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs/metadata`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setMetadata(json.data);
        }
      }
    } catch (err) {
      console.error("Fetch audit metadata error:", err);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Initial and reactive fetch
  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Helper: ดึงข้อมูลทั้งหมดตามตัวกรองที่เลือกไว้ (ดึงทีละ 100 รายการจนครบ)
  const fetchFilteredLogsForExport = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login-register";
      return null;
    }

    let allItems = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && allItems.length < 5000) {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "100");
      if (actionFilter) params.set("action", actionFilter);
      if (actorUserIdFilter) params.set("actor", actorUserIdFilter);
      if (targetTypeFilter) params.set("target_type", targetTypeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFromFilter) params.set("date_from", new Date(dateFromFilter).toISOString());
      if (dateToFilter) params.set("date_to", new Date(dateToFilter).toISOString());

      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลเพื่อส่งออกได้");

      const json = await res.json();
      const pageItems = json.data?.items || [];
      const totalItems = json.data?.total || pageItems.length;

      allItems = [...allItems, ...pageItems];
      if (allItems.length >= totalItems || pageItems.length === 0) {
        hasMore = false;
      } else {
        currentPage++;
      }
    }

    return allItems.length > 0 ? allItems : logs;
  };

  // 1. Export CSV (พร้อม BOM UTF-8 สำหรับภาษาไทย)
  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const items = await fetchFilteredLogsForExport();
      if (!items) return;

      const headers = ["รหัสรายการ", "เวลา", "ผู้กระทำ", "การกระทำ", "เป้าหมาย", "สถานะ", "ไอพี"];
      const csvRows = [headers.join(",")];

      items.forEach((item) => {
        const timeStr = `"${formatFullThaiDateTime(item.created_at)}"`;
        const actorStr = `"${renderActorName(item.actor_user_id, item.actor_role, item.actor_username)}"`;
        const actionStr = `"${ACTION_MAP[item.action]?.label || item.action}"`;
        const targetStr = `"${renderTargetName(item.target_type, item.target_id, item.target_name)}"`;
        const statusStr = `"${item.status === "SUCCESS" ? "สำเร็จ" : (item.status === "FAILURE" ? "ไม่สำเร็จ" : item.status || "-")}"`;
        const ipStr = `"${item.ip_address || "-"}"`;

        csvRows.push([item.log_id, timeStr, actorStr, actionStr, targetStr, statusStr, ipStr].join(","));
      });

      // ใส่ \uFEFF (UTF-8 BOM) เพื่อให้ Microsoft Excel และ WPS Office รองรับภาษาไทยได้สมบูรณ์
      const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export CSV error:", err);
      alert(err.message || "เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV");
    } finally {
      setIsExportingCSV(false);
    }
  };

  // 2. Export Excel (.xlsx) ด้วย ExcelJS พร้อม formatting, column widths, wrap text, auto-filter, freeze header
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const items = await fetchFilteredLogsForExport();
      if (!items) return;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "StoryVerse Admin";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("ประวัติการใช้งาน", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }]
      });

      // กำหนดคอลัมน์พร้อมความกว้างที่เหมาะสมและอ่านง่ายทันที
      worksheet.columns = [
        { header: "รหัสรายการ", key: "log_id", width: 14 },
        { header: "เวลา", key: "created_at", width: 28 },
        { header: "ผู้กระทำ", key: "actor", width: 32 },
        { header: "การกระทำ", key: "action", width: 26 },
        { header: "เป้าหมาย", key: "target", width: 34 },
        { header: "สถานะ", key: "status", width: 16 },
        { header: "ไอพี", key: "ip_address", width: 18 },
      ];

      // จัดรูปแบบ Header (แถวที่ 1)
      const headerRow = worksheet.getRow(1);
      headerRow.height = 30;
      headerRow.eachCell((cell, colNumber) => {
        cell.font = {
          name: "Sarabun",
          size: 11,
          bold: true,
          color: { argb: "FFFFFFFF" }
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDB2777" } // StoryVerse signature theme pink (#DB2777)
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber === 1 || colNumber === 6 || colNumber === 7 ? "center" : "left",
          wrapText: true
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFBE185D" } },
          left: { style: "thin", color: { argb: "FFBE185D" } },
          bottom: { style: "medium", color: { argb: "FF9D174D" } },
          right: { style: "thin", color: { argb: "FFBE185D" } },
        };
      });

      // ใส่ข้อมูลแถว
      items.forEach((item, index) => {
        const row = worksheet.addRow({
          log_id: item.log_id,
          created_at: formatFullThaiDateTime(item.created_at),
          actor: renderActorName(item.actor_user_id, item.actor_role, item.actor_username),
          action: ACTION_MAP[item.action]?.label || item.action,
          target: renderTargetName(item.target_type, item.target_id, item.target_name),
          status: item.status === "SUCCESS" ? "สำเร็จ" : (item.status === "FAILURE" ? "ไม่สำเร็จ" : item.status || "-"),
          ip_address: item.ip_address || "-",
        });

        // จัดความสูงและจัด alignment ของแถวข้อมูล
        row.height = 26;
        const isEven = index % 2 === 1;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = {
            name: "Sarabun",
            size: 10.5,
            color: { argb: "FF1E293B" }
          };
          if (isEven) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFAFBFC" } // Zebra striping
            };
          }
          cell.alignment = {
            vertical: "middle",
            horizontal: colNumber === 1 || colNumber === 6 || colNumber === 7 ? "center" : "left",
            wrapText: true
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };

          // ปรับสีตัวหนังสือสถานะ
          if (colNumber === 6) {
            if (item.status === "SUCCESS") {
              cell.font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FF059669" } };
            } else if (item.status === "FAILURE") {
              cell.font = { name: "Sarabun", size: 10.5, bold: true, color: { argb: "FFE11D48" } };
            }
          }
        });
      });

      // เปิดใช้งาน Auto Filter ที่หัวตาราง
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 7 }
      };

      // เขียน Buffer และดาวน์โหลดไฟล์ .xlsx
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Excel error:", err);
      alert(err.message || "เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel (.xlsx)");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 🟢 Fetch Single Audit Log Detail
  const fetchLogDetail = async (id) => {
    setSelectedLogId(id);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailData(null);

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login-register";
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login-register";
        return;
      }

      if (res.status === 403) {
        setDetailError("คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
        return;
      }

      if (res.status === 404) {
        setDetailError("ไม่พบรายการนี้");
        return;
      }

      const text = await res.text();
      let resJson;
      try {
        resJson = JSON.parse(text);
      } catch {
        throw new Error("เกิดข้อผิดพลาด กรุณาลองใหม่");
      }

      if (!res.ok) {
        const rawMsg = (typeof resJson?.error === "object" ? resJson.error?.message : resJson?.error) || resJson?.message || "";
        const thaiMsg = ERROR_MESSAGE_MAP[rawMsg] || (res.status === 404 ? "ไม่พบรายการนี้" : "เกิดข้อผิดพลาด กรุณาลองใหม่");
        throw new Error(thaiMsg);
      }

      setDetailData(resJson.data);
    } catch (err) {
      console.error("Fetch log detail error:", err);
      setDetailError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setDetailLoading(false);
    }
  };

  // Filter change handlers (always resets page to 1)
  const handleActionChange = (e) => {
    setActionFilter(e.target.value);
    setPage(1);
  };

  const handleActorUserIdChange = (e) => {
    setActorUserIdInput(e.target.value);
  };

  const handleTargetTypeChange = (e) => {
    setTargetTypeFilter(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleDateFromChange = (e) => {
    setDateFromFilter(e.target.value);
    setPage(1);
  };

  const handleDateToChange = (e) => {
    setDateToFilter(e.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setActionFilter("");
    setActorUserIdInput("");
    setActorUserIdFilter("");
    setTargetTypeFilter("");
    setStatusFilter("");
    setDateFromFilter("");
    setDateToFilter("");
    setFilterValidationMsg("");
    setShowAdvancedFilters(false);
    setPage(1);
  };

  const handleLimitChange = (e) => {
    setLimit(Number(e.target.value));
    setPage(1);
  };

  // 🟢 จุดที่ 5: Handle 403 Forbidden Screen พร้อมปุ่มกลับหน้าแรก
  if (accessDenied) {
    return (
      <div className="admin-audit-container">
        <div className="admin-audit-access-denied">
          <Shield size={56} className="access-denied-icon" />
          <h2>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
          <p>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น</p>
          <a href="/" className="btn-back-home" style={{ marginTop: "16px", display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "8px", backgroundColor: "#0284c7", color: "#ffffff", textDecoration: "none", fontWeight: "600" }}>
            <Home size={18} />
            <span>กลับสู่หน้าหลัก</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-audit-container">
      <div className="admin-audit-content">
        
        {/* =======================================================
            1. Header
           ======================================================= */}
        <header className="admin-audit-header">
          <div className="admin-audit-header__left">
            <div className="admin-audit-title-wrap">
              <h1 className="admin-audit-title">ประวัติการใช้งานระบบ</h1>
              <span className="admin-audit-badge-total">
                ทั้งหมด {total.toLocaleString()} รายการ
              </span>
            </div>
            <p className="admin-audit-subtitle">ตรวจสอบและติดตามกิจกรรมต่าง ๆ ที่เกิดขึ้นภายในระบบ</p>
            <svg className="header-branch-accent" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 8 H70 M70 8 C 78 8, 78 2, 86 2 H130 M70 8 C 78 8, 78 14, 86 14 H130 M130 2 H200 M130 14 H160" />
            </svg>
          </div>
          <div className="admin-audit-header__actions">
            {/* ปุ่ม "ส่งออก" เดียว รวม CSV + Excel ไว้เป็นเมนู dropdown
                แทนที่จะโชว์ 2 ปุ่มแยกกันเต็มพื้นที่แถวบนสุด ลดความรกของ toolbar */}
            <div className="admin-audit-export-group">
              <button
                type="button"
                className="admin-audit-btn admin-audit-btn--export"
                onClick={() => setIsExportMenuOpen((open) => !open)}
                disabled={isExportingExcel || isExportingCSV || loading}
                aria-haspopup="true"
                aria-expanded={isExportMenuOpen}
                title="ส่งออกรายการ Log เป็นไฟล์"
              >
                <Download size={15} className={(isExportingCSV || isExportingExcel) ? "spin" : ""} />
                <span>
                  {isExportingCSV ? "กำลังส่งออก CSV..." : isExportingExcel ? "กำลังส่งออก Excel..." : "ส่งออก"}
                </span>
              </button>

              {isExportMenuOpen && (
                <>
                  {/* คลิกนอกเมนูเพื่อปิด */}
                  <div
                    className="admin-audit-export-menu-backdrop"
                    onClick={() => setIsExportMenuOpen(false)}
                  />
                  <div className="admin-audit-export-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-audit-export-menu-item"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        handleExportCSV();
                      }}
                      disabled={isExportingExcel || isExportingCSV || loading}
                    >
                      <FileText size={14} />
                      <span>ไฟล์ CSV</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="admin-audit-export-menu-item"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        handleExportExcel();
                      }}
                      disabled={isExportingExcel || isExportingCSV || loading}
                    >
                      <FileSpreadsheet size={14} />
                      <span>ไฟล์ Excel (.xlsx)</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Refresh Button (Ghost / Light Neutral) */}
            <button
              type="button"
              className="admin-audit-btn admin-audit-btn--refresh"
              onClick={() => fetchAuditLogs()}
              disabled={loading}
              title="รีเฟรชข้อมูลปัจจุบัน"
            >
              <RotateCw size={15} className={loading ? "spin" : ""} />
              <span>รีเฟรช</span>
            </button>
          </div>
        </header>

        {/* =======================================================
            1.5 Quick View Toggle — ซ่อน login/logout ที่ท่วม log ได้ในคลิกเดียว
            client-side เท่านั้น กรองภายในหน้าที่โหลดอยู่ (ไม่ใช่ query แยกไป backend)
           ======================================================= */}
        <div className="admin-audit-view-toggle" role="tablist" aria-label="มุมมอง Log">
          <button
            type="button"
            role="tab"
            aria-selected={logView === "all"}
            className={`admin-audit-view-btn ${logView === "all" ? "active" : ""}`}
            onClick={() => handleLogViewChange("all")}
          >
            ทั้งหมด {allCount > 0 && `(${allCount})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={logView === "content"}
            className={`admin-audit-view-btn ${logView === "content" ? "active" : ""}`}
            onClick={() => handleLogViewChange("content")}
            title="ซ่อนรายการ เข้าสู่ระบบ / ออกจากระบบ / สมัครสมาชิก"
          >
            เฉพาะกิจกรรมเนื้อหา ({contentCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={logView === "security"}
            className={`admin-audit-view-btn ${logView === "security" ? "active" : ""}`}
            onClick={() => handleLogViewChange("security")}
            title="ดูเฉพาะ เข้าสู่ระบบ / ออกจากระบบ / พยายามเข้าถึงโดยไม่มีสิทธิ์"
          >
            เฉพาะ Security ({securityCount})
          </button>
        </div>

        {/* =======================================================
            2. Filter Bar
           ======================================================= */}
        <div className="admin-audit-filter-card">
          {/* Mobile Filter Trigger Button */}
          <div className="admin-audit-mobile-filter-trigger">
            <button
              type="button"
              className="btn-open-mobile-filter"
              onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
            >
              <Filter size={16} />
              <span>ตัวกรองข้อมูล {hasActiveFilters && "(กำลังใช้งาน)"}</span>
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn-clear-filter-text"
                onClick={handleClearFilters}
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          <div className={`admin-audit-filter-grid ${isMobileFilterOpen ? "open" : ""}`}>
            {/* ตัวกรองหลักที่ใช้บ่อยสุด แสดงตลอดเวลา: ผู้กระทำ + ช่วงวันที่ */}

            {/* 1. Actor Filter (Debounced) */}
            <div className="admin-audit-filter-item">
              <label htmlFor="filter-actor" className="admin-audit-filter-label">ผู้กระทำ (ชื่อผู้ใช้ / ID)</label>
              <input
                id="filter-actor"
                type="text"
                className="admin-audit-input"
                placeholder="ชื่อผู้ใช้ หรือ ID เช่น jane_writer"
                value={actorUserIdInput}
                onChange={handleActorUserIdChange}
              />
            </div>

            {/* 2. Date Range Filter */}
            <div className="admin-audit-filter-item admin-audit-filter-item--date">
              <label className="admin-audit-filter-label">ช่วงวันที่</label>
              <div className="admin-audit-date-range-group">
                <input
                  type="datetime-local"
                  className="admin-audit-input admin-audit-input--date"
                  value={dateFromFilter}
                  onChange={handleDateFromChange}
                  title="จากวันที่"
                />
                <span className="admin-audit-date-sep">ถึง</span>
                <input
                  type="datetime-local"
                  className="admin-audit-input admin-audit-input--date"
                  value={dateToFilter}
                  onChange={handleDateToChange}
                  title="ถึงวันที่"
                />
              </div>
            </div>

            {/* ปุ่มเปิด/ปิดตัวกรองที่ใช้ไม่บ่อย (การกระทำ, ประเภทเป้าหมาย, สถานะ)
                วางแทนที่ตำแหน่งเดิมของฟิลเตอร์เหล่านี้ เพื่อลดจำนวนช่องที่เห็นพร้อมกันตลอดเวลา */}
            <div className="admin-audit-filter-item admin-audit-filter-item--toggle">
              <label className="admin-audit-filter-label">&nbsp;</label>
              <button
                type="button"
                className={`admin-audit-advanced-toggle ${showAdvancedFilters ? "is-open" : ""}`}
                onClick={() => setShowAdvancedFilters((open) => !open)}
                aria-expanded={showAdvancedFilters}
              >
                <Filter size={14} />
                <span>ตัวกรองเพิ่มเติม</span>
                {advancedFilterCount > 0 && (
                  <span className="admin-audit-advanced-toggle-count">{advancedFilterCount}</span>
                )}
                <ChevronDown size={14} className="admin-audit-advanced-toggle-chevron" />
              </button>
            </div>
          </div>

          {/* กลุ่มตัวกรองขั้นสูง: การกระทำแบบละเอียด / ประเภทเป้าหมาย / สถานะ
              ซ่อนไว้เป็นค่าเริ่มต้น กดปุ่ม "ตัวกรองเพิ่มเติม" ด้านบนเพื่อเปิด/ปิด */}
          {showAdvancedFilters && (
            <div className={`admin-audit-filter-grid admin-audit-filter-grid--advanced ${isMobileFilterOpen ? "open" : ""}`}>
              {/* 3. Action Filter */}
              <div className="admin-audit-filter-item">
                <label htmlFor="filter-action" className="admin-audit-filter-label">การกระทำ</label>
                <select
                  id="filter-action"
                  className="admin-audit-select"
                  value={actionFilter}
                  onChange={handleActionChange}
                >
                  <option value="">ทุกการกระทำ</option>
                  {ACTION_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.keys
                        .filter((actionKey) => ACTION_MAP[actionKey] && !ACTION_MAP[actionKey].hiddenInFilter)
                        .map((actionKey) => (
                          <option key={actionKey} value={actionKey}>
                            {ACTION_MAP[actionKey].label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 4. Target Type Filter */}
              <div className="admin-audit-filter-item">
                <label htmlFor="filter-target" className="admin-audit-filter-label">ประเภทเป้าหมาย</label>
                <select
                  id="filter-target"
                  className="admin-audit-select"
                  value={targetTypeFilter}
                  onChange={handleTargetTypeChange}
                >
                  <option value="">ทุกประเภท</option>
                  {Object.entries(TARGET_TYPE_MAP).map(([typeKey, label]) => (
                    <option key={typeKey} value={typeKey}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Status Filter */}
              <div className="admin-audit-filter-item">
                <label htmlFor="filter-status" className="admin-audit-filter-label">สถานะ</label>
                <select
                  id="filter-status"
                  className="admin-audit-select"
                  value={statusFilter}
                  onChange={handleStatusChange}
                >
                  <option value="">ทุกสถานะ</option>
                  {metadata.statuses && metadata.statuses.length > 0 ? (
                    metadata.statuses.map((st) => (
                      <option key={st} value={st}>
                        {st === "SUCCESS" ? "สำเร็จ" : st === "FAILURE" ? "ไม่สำเร็จ" : st}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="SUCCESS">สำเร็จ</option>
                      <option value="FAILURE">ไม่สำเร็จ</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Clear Filters Action Row */}
          {hasActiveFilters && (
            <div className="admin-audit-filter-actions">
              <button
                type="button"
                className="btn-clear-filter"
                onClick={handleClearFilters}
              >
                <X size={14} />
                <span>ล้างตัวกรองทั้งหมด</span>
              </button>
            </div>
          )}
        </div>

        {/* Validation Error Banner */}
        {filterValidationMsg && (
          <div className="admin-audit-banner admin-audit-banner--warning">
            <AlertCircle size={18} />
            <span>{filterValidationMsg}</span>
          </div>
        )}

        {/* Server/API Error Banner */}
        {error && (
          <div className="admin-audit-banner admin-audit-banner--error">
            <AlertCircle size={18} />
            <div className="admin-audit-banner__content">
              <span>{error}</span>
              <button type="button" className="btn-retry-banner" onClick={fetchAuditLogs}>
                ลองอีกครั้ง
              </button>
            </div>
          </div>
        )}

        {/* =======================================================
            3. Table & Card List
           ======================================================= */}
        <div className="admin-audit-table-card">
          
          {/* Desktop Table View */}
          <div className="admin-audit-table-wrapper">
            <table className="admin-audit-table">
              <thead>
                <tr>
                  <th style={{ width: "15%", minWidth: "130px" }}>เวลา</th>
                  <th style={{ width: "18%", minWidth: "140px" }}>ผู้กระทำ</th>
                  <th style={{ width: "18%", minWidth: "140px" }}>การกระทำ</th>
                  <th style={{ width: "20%", minWidth: "150px" }}>เป้าหมาย</th>
                  <th style={{ width: "11%", minWidth: "100px" }}>สถานะ</th>
                  <th style={{ width: "10%", minWidth: "100px" }}>ไอพี</th>
                  <th style={{ width: "8%", minWidth: "100px", textAlign: "center" }} className="text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Loading Skeleton Rows
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="admin-audit-row-skeleton">
                      <td><div className="skeleton-bar" style={{ width: "80%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "70%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "60%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "50%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "60%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "75%" }} /></td>
                      <td><div className="skeleton-bar" style={{ width: "100%" }} /></td>
                    </tr>
                  ))
                ) : visibleLogs.length === 0 ? (
                  // Empty State Row
                  <tr>
                    <td colSpan={7}>
                      <div className="admin-audit-empty-state">
                        <Inbox size={48} className="empty-icon" />
                        <h3>ไม่พบประวัติการใช้งาน</h3>
                        {hasActiveFilters && <p>ลองปรับตัวกรองใหม่อีกครั้ง</p>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  // Data Rows
                  visibleLogs.map((log) => {
                    const actionInfo = ACTION_MAP[log.action] || {
                      label: log.action,
                      group: "gray",
                      color: "#475569",
                      bg: "#f1f5f9",
                      border: "#cbd5e1",
                    };
                    const actorNameText = renderActorName(log.actor_user_id, log.actor_role, log.actor_username);
                    const targetNameText = renderTargetName(log.target_type, log.target_id, log.target_name);

                    return (
                      <tr
                        key={log.log_id}
                        className="admin-audit-row"
                        onClick={() => fetchLogDetail(log.log_id)}
                      >
                        {/* เวลา */}
                        <td>
                          <span
                            className="admin-audit-time"
                            title={formatFullThaiDateTime(log.created_at)}
                          >
                            {formatShortThaiDateTime(log.created_at)}
                          </span>
                        </td>

                        {/* ผู้กระทำ */}
                        <td>
                          <span className="admin-audit-actor" title={actorNameText}>
                            {actorNameText}
                          </span>
                        </td>

                        {/* การกระทำ */}
                        <td>
                          <span
                            className="admin-audit-action-badge"
                            style={{
                              backgroundColor: actionInfo.bg,
                              color: actionInfo.color,
                              borderColor: actionInfo.border,
                            }}
                            title={actionInfo.label}
                          >
                            {actionInfo.label}
                          </span>
                        </td>

                        {/* เป้าหมาย */}
                        <td>
                          <span className="admin-audit-target" title={targetNameText}>
                            {targetNameText}
                          </span>
                        </td>

                        {/* สถานะ */}
                        <td>
                          {renderStatusBadge(log.status)}
                        </td>

                        {/* ไอพี */}
                        <td>
                          <span className="admin-audit-ip font-mono">
                            {log.ip_address || "-"}
                          </span>
                        </td>

                        {/* ดูรายละเอียด */}
                        <td style={{ textAlign: "center" }} className="text-center">
                          <div className="action-cell-content">
                            <button
                              type="button"
                              className="btn-view-detail"
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchLogDetail(log.log_id);
                              }}
                            >
                              ดูรายละเอียด
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="admin-audit-mobile-card-list">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={`m-skeleton-${idx}`} className="admin-audit-mobile-card skeleton">
                  <div className="skeleton-bar" style={{ width: "40%", height: "16px", marginBottom: "8px" }} />
                  <div className="skeleton-bar" style={{ width: "70%", height: "20px", marginBottom: "8px" }} />
                  <div className="skeleton-bar" style={{ width: "50%", height: "14px" }} />
                </div>
              ))
            ) : visibleLogs.length === 0 ? (
              <div className="admin-audit-empty-state">
                <Inbox size={48} className="empty-icon" />
                <h3>ไม่พบประวัติการใช้งาน</h3>
                {hasActiveFilters && <p>ลองปรับตัวกรองใหม่อีกครั้ง</p>}
              </div>
            ) : (
              visibleLogs.map((log) => {
                const actionInfo = ACTION_MAP[log.action] || {
                  label: log.action,
                  group: "gray",
                  color: "#475569",
                  bg: "#f1f5f9",
                  border: "#cbd5e1",
                };

                return (
                  <div
                    key={`mobile-${log.log_id}`}
                    className="admin-audit-mobile-card"
                    onClick={() => fetchLogDetail(log.log_id)}
                  >
                    <div className="mobile-card-header">
                      <span className="mobile-card-time">
                        {formatShortThaiDateTime(log.created_at)}
                      </span>
                      {renderStatusBadge(log.status)}
                    </div>

                    <div className="mobile-card-body">
                      <span
                        className="admin-audit-action-badge"
                        style={{
                          backgroundColor: actionInfo.bg,
                          color: actionInfo.color,
                          borderColor: actionInfo.border,
                        }}
                      >
                        {actionInfo.label}
                      </span>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">ผู้กระทำ:</span>
                        <span className="mobile-card-value">
                          {renderActorName(log.actor_user_id, log.actor_role, log.actor_username)}
                        </span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">เป้าหมาย:</span>
                        <span className="mobile-card-value">
                          {renderTargetName(log.target_type, log.target_id, log.target_name)}
                        </span>
                      </div>
                    </div>

                    <div className="mobile-card-footer">
                      <span className="mobile-card-ip">IP: {log.ip_address || "-"}</span>
                      <span className="mobile-card-btn-text">แตะเพื่อดูรายละเอียด →</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* =======================================================
              4. Pagination
             ======================================================= */}
          <div className="admin-audit-pagination">
            <div className="admin-audit-pagination__left">
              <span className="admin-audit-page-info">
                หน้า <strong>{page}</strong> จาก <strong>{displayTotalPages}</strong>
                {/* <span style={{ fontSize: "0.82rem", color: "#64748b", marginLeft: "10px", fontWeight: 500 }}>
                  (แสดง {displayTotal > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, displayTotal)} จากทั้งหมด {displayTotal} รายการ)
                </span> */}
              </span>

              <div className="admin-audit-limit-selector">
                <label htmlFor="select-limit" className="limit-label">แสดงต่อหน้า</label>
                <select
                  id="select-limit"
                  className="admin-audit-select admin-audit-select--limit"
                  value={limit}
                  onChange={handleLimitChange}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="admin-audit-pagination__right">
              <button
                type="button"
                className="btn-page-nav"
                disabled={page <= 1 || loading}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              >
                <ChevronLeft size={16} />
                <span>ก่อนหน้า</span>
              </button>

              <button
                type="button"
                className="btn-page-nav"
                disabled={page >= displayTotalPages || loading}
                onClick={() => setPage((prev) => Math.min(prev + 1, displayTotalPages))}
              >
                <span>ถัดไป</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* =======================================================
          5. Detail Modal / Drawer
         ======================================================= */}
      {detailModalOpen && (
        <div className="admin-audit-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <div className="admin-audit-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-audit-modal-header">
              <div className="modal-header-title-wrap">
                <FileText size={20} className="modal-header-icon" />
                <h3 className="admin-audit-modal-title">
                  รายละเอียดรายการ #{selectedLogId}
                </h3>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setDetailModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="admin-audit-modal-body">
              {detailLoading ? (
                <div className="admin-audit-modal-loading">
                  <Loader2 size={36} className="spin loading-icon" />
                  <p>กำลังโหลดรายละเอียดประวัติ...</p>
                </div>
              ) : detailError ? (
                <div className="admin-audit-modal-error">
                  <AlertCircle size={36} className="error-icon" />
                  <h4>{detailError}</h4>
                  <button
                    type="button"
                    className="btn-retry-modal"
                    onClick={() => fetchLogDetail(selectedLogId)}
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                </div>
              ) : detailData ? (
                <div className="admin-audit-detail-wrapper">
                  
                  {/* Summary Section */}
                  <div className="detail-section">
                    <h4 className="detail-section-title">สรุปข้อมูล</h4>
                    <table className="admin-audit-detail-table">
                      <tbody>
                        <tr>
                          <td className="detail-label">ผู้กระทำ</td>
                          <td className="detail-value">
                            {renderActorName(detailData.actor_user_id, detailData.actor_role, detailData.actor_username)}
                          </td>
                        </tr>
                        <tr>
                          <td className="detail-label">การกระทำ</td>
                          <td className="detail-value">
                            {ACTION_MAP[detailData.action]?.label || detailData.action}
                          </td>
                        </tr>
                        <tr>
                          <td className="detail-label">เป้าหมาย</td>
                          <td className="detail-value">
                            {renderTargetName(detailData.target_type, detailData.target_id, detailData.target_name)}
                          </td>
                        </tr>
                        {detailData.metadata?.novel_title && (
                          <tr>
                            <td className="detail-label">นิยาย</td>
                            <td className="detail-value" style={{ fontWeight: 600, color: "#0284c7" }}>
                              {detailData.metadata.novel_title} {detailData.metadata.novel_id ? `(#${detailData.metadata.novel_id})` : ""}
                            </td>
                          </tr>
                        )}
                        {detailData.metadata?.chapter_title && (
                          <tr>
                            <td className="detail-label">ตอน</td>
                            <td className="detail-value" style={{ fontWeight: 600, color: "#475569" }}>
                              {detailData.metadata.chapter_title} {detailData.metadata.chapter_id ? `(#${detailData.metadata.chapter_id})` : ""}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="detail-label">สถานะ</td>
                          <td className="detail-value">
                            {renderStatusBadge(detailData.status)}
                          </td>
                        </tr>
                        <tr>
                          <td className="detail-label">ไอพี</td>
                          <td className="detail-value font-mono">
                            {detailData.ip_address || "-"}
                          </td>
                        </tr>
                        <tr>
                          <td className="detail-label">วันที่/เวลา</td>
                          <td className="detail-value">
                            {formatFullThaiDateTime(detailData.created_at)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Metadata Section */}
                  <div className="detail-section">
                    <h4 className="detail-section-title">ข้อมูลเพิ่มเติม</h4>
                    {detailData.metadata && Object.keys(detailData.metadata).length > 0 ? (
                      <table className="admin-audit-detail-table admin-audit-detail-table--metadata">
                        <thead>
                          <tr>
                            <th style={{ width: "40%" }}>ข้อมูล</th>
                            <th>ค่า</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(detailData.metadata).map(([metaKey, metaVal]) => {
                            const labelThai = METADATA_KEY_MAP[metaKey] || metaKey;
                            const formattedVal = formatMetadataValue(metaKey, metaVal, detailData.metadata);

                            return (
                              <tr key={metaKey}>
                                <td className="detail-label">{labelThai}</td>
                                <td className="detail-value">{formattedVal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="admin-audit-metadata-empty">
                        <p>ไม่มีข้อมูลเพิ่มเติม</p>
                      </div>
                    )}
                  </div>

                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="admin-audit-modal-footer">
              <button
                type="button"
                className="btn-modal-dismiss"
                onClick={() => setDetailModalOpen(false)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}