// src/utils/avatarService.js

import { apiFetch } from "./apiFetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const REGISTRY_STORAGE_KEY = "storyverse_avatar_registry";

/**
 * ปรับ URL รูปภาพ MinIO จาก Docker Network ให้เบราว์เซอร์เปิดได้บน Localhost
 */
export const formatMinioUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let formatted = trimmed;

  if (formatted.includes("http://minio:9000")) {
    formatted = formatted.replace(/http:\/\/minio:9000/g, "http://localhost:9000");
  } else if (formatted.includes("//minio:9000")) {
    formatted = formatted.replace(/\/\/minio:9000/g, "//localhost:9000");
  }

  if (formatted.startsWith("/")) {
    formatted = `http://localhost:9000${formatted}`;
  }

  return formatted;
};

/**
 * ฐานข้อมูลโปรไฟล์เริ่มต้นสำหรับผู้ใช้และนักเขียนตามฐานข้อมูล Seed
 * ทำให้รูปโปรไฟล์สามารถแสดงได้ทันทีทั้งในหน้าการแจ้งเตือนและคอมเมนต์
 */
const SEEDED_USERS = [
  { id: 1, username: "admin_master", avatar: "http://localhost:9000/novels-images/admin.jpg" },
  { id: 2, username: "jane_writer55", penName: "JaneTheAuthor", writerId: 1, avatar: "http://localhost:9000/novel-buckets/uploads/1787241382-dog-2449668_1280.jpg", writerAvatar: "http://localhost:9000/novel-buckets/uploads/1791067107-flower.jpg" },
  { id: 3, username: "dark_john", penName: "DarkMaster", writerId: 2, avatar: "http://localhost:9000/novels-images/john.jpg" },
  { id: 4, username: "alice_reader", avatar: "http://localhost:9000/novels-images/alice.jpg" },
  { id: 5, username: "mi____kry", penName: "popupสำเร็จ", writerId: 13, avatar: "http://localhost:9000/novel-buckets/uploads/1791872699-avatar.jpg", writerAvatar: "http://localhost:9000/novel-buckets/uploads/1791465780-avatar.jpg" },
  { id: 6, username: "maymay", avatar: "http://localhost:9000/novel-buckets/uploads/1787133202-แพนด้าตุ้ย.jpg" },
  { id: 13, username: "maymay5588", penName: "สมัครเขียน", writerId: 4, avatar: "http://localhost:9000/novel-buckets/uploads/1791872635-avatar.jpg", writerAvatar: "http://localhost:9000/novel-buckets/uploads/1789403638-29d12118407b97927c8d3b07400c365a.jpg" },
  { id: 22, username: "lnwzahahaplus", penName: "โฮ่งๆ", writerId: 12, avatar: "http://localhost:9000/novel-buckets/uploads/1791049127-ท่านประธานโฮ่งๆ.jpg", writerAvatar: "http://localhost:9000/novel-buckets/uploads/1791049582-ไร้เต้อโฮ่งๆ.jpg" },
  { id: 23, username: "jingjinghahaplusss", avatar: "http://localhost:9000/novel-buckets/uploads/1791466954-avatar.jpg" },
  { id: 99, username: "mike_reader", avatar: "http://localhost:9000/novels-images/alice.jpg" },
];

const SEEDED_NOVEL_AUTHORS = {
  1: "http://localhost:9000/novel-buckets/uploads/1791067107-flower.jpg", // แสงสุดท้ายแห่งเอลฟ์ -> JaneTheAuthor
  2: "http://localhost:9000/novels-images/john.jpg", // คฤหาสน์ซ่อนเงา -> DarkMaster
  3: "http://localhost:9000/novel-buckets/uploads/1791067107-flower.jpg", // รักวุ่นวายยัยแฮกเกอร์ -> JaneTheAuthor
  4: "http://localhost:9000/novels-images/john.jpg", // สงครามจักรกลแห่งอนาคต -> DarkMaster
};

// หน่วยความจำแคชในแอปพลิเคชัน
let memoryRegistry = null;

const initRegistry = () => {
  if (memoryRegistry) return memoryRegistry;

  let stored = {};
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch (_) {}

  const byUserId = { ...(stored.byUserId || {}) };
  const byUsername = { ...(stored.byUsername || {}) };
  const byWriterId = { ...(stored.byWriterId || {}) };
  const byNovelId = { ...SEEDED_NOVEL_AUTHORS, ...(stored.byNovelId || {}) };

  // บรรจุ Seed Users
  SEEDED_USERS.forEach((u) => {
    const av = formatMinioUrl(u.avatar);
    const wav = formatMinioUrl(u.writerAvatar) || av;
    if (u.id && av && !byUserId[String(u.id)]) byUserId[String(u.id)] = av;
    if (u.username && av && !byUsername[u.username.toLowerCase()]) byUsername[u.username.toLowerCase()] = av;
    if (u.penName && wav && !byUsername[u.penName.toLowerCase()]) byUsername[u.penName.toLowerCase()] = wav;
    if (u.writerId && wav && !byWriterId[String(u.writerId)]) byWriterId[String(u.writerId)] = wav;
  });

  memoryRegistry = { byUserId, byUsername, byWriterId, byNovelId };
  return memoryRegistry;
};

const persistRegistry = () => {
  if (!memoryRegistry) return;
  try {
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(memoryRegistry));
    window.dispatchEvent(new CustomEvent("storyverse_avatar_updated", { detail: memoryRegistry }));
  } catch (_) {}
};

/**
 * ดึง URL รูปโปรไฟล์แบบ Synchronous จาก Cache หรือ Seed Data
 */
export const getAvatar = ({ userId, username, writerId, novelId } = {}) => {
  const reg = initRegistry();

  // 1. ค้นหาจาก novelId
  if (novelId && reg.byNovelId[String(novelId)]) {
    return reg.byNovelId[String(novelId)];
  }

  // 2. ค้นหาจาก writerId
  if (writerId && reg.byWriterId[String(writerId)]) {
    return reg.byWriterId[String(writerId)];
  }

  // 3. ค้นหาจาก userId
  if (userId && reg.byUserId[String(userId)]) {
    return reg.byUserId[String(userId)];
  }

  // 4. ค้นหาจาก username หรือ นามปากกา
  if (username && typeof username === "string") {
    const clean = username.trim().toLowerCase();
    if (clean && reg.byUsername[clean]) {
      return reg.byUsername[clean];
    }
  }

  return null;
};

/**
 * บันทึกรูปโปรไฟล์ของผู้ใช้เข้าสู่ Registry
 */
export const saveUserAvatar = (user) => {
  if (!user || typeof user !== "object") return;
  const reg = initRegistry();

  const uid = user.id || user.user_id || user.userId;
  const username = user.username || user.name;
  const rawAvatar = user.pic_profile || user.avatar_url || user.avatarUrl || user.avatar || user.profile_picture;
  const formatted = formatMinioUrl(rawAvatar);

  if (!formatted) return;

  let changed = false;
  if (uid && reg.byUserId[String(uid)] !== formatted) {
    reg.byUserId[String(uid)] = formatted;
    changed = true;
  }
  if (username && typeof username === "string") {
    const clean = username.trim().toLowerCase();
    if (clean && reg.byUsername[clean] !== formatted) {
      reg.byUsername[clean] = formatted;
      changed = true;
    }
  }

  if (changed) {
    persistRegistry();
  }
};

/**
 * บันทึกรูปโปรไฟล์ของนักเขียนเข้าสู่ Registry
 */
export const saveWriterAvatar = (writer) => {
  if (!writer || typeof writer !== "object") return;
  const reg = initRegistry();

  const wid = writer.writer_id || writer.writerId || writer.id;
  const uid = writer.user_id || writer.userId;
  const penName = writer.pen_name || writer.penName || writer.name || writer.displayName;
  const username = writer.username;
  const rawAvatar = writer.avatar_url || writer.avatarUrl || writer.avatar || writer.pic_profile;
  const formatted = formatMinioUrl(rawAvatar);

  if (!formatted) return;

  let changed = false;
  if (wid && reg.byWriterId[String(wid)] !== formatted) {
    reg.byWriterId[String(wid)] = formatted;
    changed = true;
  }
  if (uid && reg.byUserId[String(uid)] !== formatted) {
    reg.byUserId[String(uid)] = formatted;
    changed = true;
  }
  if (penName && typeof penName === "string") {
    const clean = penName.trim().toLowerCase();
    if (clean && reg.byUsername[clean] !== formatted) {
      reg.byUsername[clean] = formatted;
      changed = true;
    }
  }
  if (username && typeof username === "string") {
    const clean = username.trim().toLowerCase();
    if (clean && reg.byUsername[clean] !== formatted) {
      reg.byUsername[clean] = formatted;
      changed = true;
    }
  }

  if (changed) {
    persistRegistry();
  }
};

// ป้องกันการยิง API ซ้ำซ้อนพร้อมกัน
const activeRequests = new Map();

/**
 * ดึงรูปโปรไฟล์แบบ Asynchronous เมื่อใน Cache ยังไม่มี
 */
export const resolveAvatarAsync = async ({ userId, username, writerId, novelId } = {}) => {
  const existing = getAvatar({ userId, username, writerId, novelId });
  if (existing) return existing;

  const cacheKey = `${userId || ""}:${username || ""}:${writerId || ""}:${novelId || ""}`;
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const reg = initRegistry();
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. ถ้ามี novelId: ดึงข้อมูลนิยายและนักเขียน
      if (novelId) {
        try {
          const res = await apiFetch(`${API_BASE_URL}/api/v1/novels/${novelId}`);
          if (res.ok) {
            const data = await res.json().catch(() => null);
            const nData = data?.data?.novel || data?.novel || data?.data || {};
            const authorWriterId = nData.author_id || nData.writer_id;

            if (authorWriterId) {
              const wRes = await apiFetch(`${API_BASE_URL}/api/v1/writers/${authorWriterId}`, { headers });
              if (wRes.ok) {
                const wJson = await wRes.json().catch(() => null);
                const wData = wJson?.data || wJson?.writer || wJson || {};
                const av = formatMinioUrl(wData.avatar_url || wData.pic_profile);
                if (av) {
                  reg.byNovelId[String(novelId)] = av;
                  reg.byWriterId[String(authorWriterId)] = av;
                  if (wData.user_id) reg.byUserId[String(wData.user_id)] = av;
                  if (wData.username) reg.byUsername[wData.username.toLowerCase()] = av;
                  if (wData.pen_name) reg.byUsername[wData.pen_name.toLowerCase()] = av;
                  persistRegistry();
                  return av;
                }
              }
            }
          }
        } catch (_) {}
      }

      // 2. ถ้ามี writerId: ดึงข้อมูลนักเขียน
      if (writerId) {
        try {
          const wRes = await apiFetch(`${API_BASE_URL}/api/v1/writers/${writerId}`, { headers });
          if (wRes.ok) {
            const wJson = await wRes.json().catch(() => null);
            const wData = wJson?.data || wJson?.writer || wJson || {};
            const av = formatMinioUrl(wData.avatar_url || wData.pic_profile);
            if (av) {
              reg.byWriterId[String(writerId)] = av;
              if (wData.user_id) reg.byUserId[String(wData.user_id)] = av;
              if (wData.username) reg.byUsername[wData.username.toLowerCase()] = av;
              if (wData.pen_name) reg.byUsername[wData.pen_name.toLowerCase()] = av;
              persistRegistry();
              return av;
            }
          }
        } catch (_) {}
      }

    } catch (_) {}

    return null;
  })();

  activeRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    activeRequests.delete(cacheKey);
  }
};

/**
 * เรียกซิงค์ผู้ใช้ทั้งหมดกรณีผู้ใช้เป็น Admin
 */
export const syncAdminUsersIfAvailable = async () => {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const role = String(user?.role || user?.user_role || user?.role_name || "").toLowerCase();
    if (role !== "admin") return;
  } catch {
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/admin/users?limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const list = data?.data?.users || data?.users || (Array.isArray(data?.data) ? data.data : []);
      if (Array.isArray(list)) {
        list.forEach(saveUserAvatar);
      }
    }
  } catch (_) {}
};

export default {
  formatMinioUrl,
  getAvatar,
  saveUserAvatar,
  saveWriterAvatar,
  resolveAvatarAsync,
  syncAdminUsersIfAvailable,
};
