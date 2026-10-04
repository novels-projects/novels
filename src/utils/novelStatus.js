// ⚠️ รอการแก้ไขโค้ดเรื่อง Backend PUT /novels/:id ล้างสถานะการถูกระงับ (suspended) เมื่อผู้เขียนแก้ไขรูปปกหรือข้อมูลนิยาย
// Registry เพื่อรักษาข้อมูลการถูกระงับของนิยายฝั่ง Frontend ป้องกันไม่ให้การอัปเดตรูปปกหรือข้อมูลนิยายหลุดจากสถานะแบน

const BANNED_REGISTRY_KEY = "banned_novels_registry";

export function getBannedRegistry() {
  try {
    const raw = localStorage.getItem(BANNED_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function cleanBanReason(reason) {
  if (!reason) return "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";
  let str = String(reason).trim();
  str = str.replace(/\s*\([^)]*รายละเอียด[^)]*\)/gi, "");
  str = str.replace(/\s*\(รายละเอียด:.*$/gi, "");
  return str.trim() || "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";
}

export function extractBanDetails(rawReason, explicitDetails = null) {
  if (explicitDetails) return String(explicitDetails).trim();
  if (!rawReason) return null;
  const str = String(rawReason).trim();

  const match = str.match(/\((?:รายละเอียด:?\s*)?([^)]+)\)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  if (str.includes("รายละเอียด:")) {
    const parts = str.split("รายละเอียด:");
    if (parts[1] && parts[1].trim()) {
      return parts[1].trim();
    }
  }

  const main = cleanBanReason(str);
  if (main === "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง" && str !== "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง") {
    return str;
  }

  return null;
}

export function getCardBanReason(rawReason, explicitDetails = null) {
  if (!rawReason && !explicitDetails) return "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";
  const rawStr = String(rawReason || "").trim();
  const main = cleanBanReason(rawStr);
  const details = extractBanDetails(rawStr, explicitDetails);

  if (main === "อื่นๆ" || main.startsWith("อื่นๆ")) {
    if (details && details.trim() && details !== "อื่นๆ") {
      return details.trim();
    }
    return "อื่นๆ";
  }

  return main || "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";
}

export function registerBannedNovel(novelId, banInfo = {}) {
  if (!novelId) return;
  try {
    const reg = getBannedRegistry();
    const key = String(novelId);
    const existing = reg[key] || {};

    const rawReason = banInfo.reason || banInfo.ban_reason || banInfo.suspend_reason || banInfo.report_reason || existing.reason || "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";
    const explicitDetails = banInfo.details || banInfo.ban_details || banInfo.suspend_details || banInfo.report_details || existing.details || null;
    const finalDetails = extractBanDetails(rawReason, explicitDetails);

    reg[key] = {
      ...existing,
      ...banInfo,
      bannedAt: existing.bannedAt || new Date().toISOString(),
      reason: cleanBanReason(rawReason),
      details: finalDetails,
      appeal_status: banInfo.appeal_status !== undefined ? banInfo.appeal_status : (existing.appeal_status || null),
    };
    localStorage.setItem(BANNED_REGISTRY_KEY, JSON.stringify(reg));
  } catch (e) {
    console.warn("registerBannedNovel error", e);
  }
}

export function unregisterBannedNovel(novelId) {
  if (!novelId) return;
  try {
    const reg = getBannedRegistry();
    delete reg[String(novelId)];
    localStorage.setItem(BANNED_REGISTRY_KEY, JSON.stringify(reg));
  } catch (e) {
    console.warn("unregisterBannedNovel error", e);
  }
}

export function isNovelBannedInRegistry(novelId) {
  if (!novelId) return false;
  const reg = getBannedRegistry();
  return Boolean(reg[String(novelId)]);
}

function normalizeStatus(value) {
  if (!value) return "draft";
  const v = String(value).toLowerCase().trim();
  switch (v) {
    case "publish":
    case "published":
      return "published";
    case "completed":
    case "complete":
    case "finished":
      return "completed";
    case "completed-published":
    case "completed_published":
    case "completed+published":
      return "completed-published";
    case "completed-draft":
    case "completed_draft":
    case "completed+draft":
      return "completed-draft";
    default:
      return "draft";
  }
}

function deriveMode(isCompleted, isPublished) {
  if (isCompleted && isPublished) return "completed-published";
  if (isCompleted) return "completed-draft";
  if (isPublished) return "published";
  return "draft";
}

function labelFor(mode) {
  switch (mode) {
    case "published":
      return "เผยแพร่";
    case "completed-published":
      return "จบแล้ว (เผยแพร่)";
    case "completed-draft":
      return "จบแล้ว (ฉบับร่าง)";
    default:
      return "ฉบับร่าง";
  }
}

export function getNovelStatusInfo(input = {}) {
  // input may contain: status, is_published, is_completed, isPublished, isCompleted, is_banned, id, novel_id, novelId, ID, NovelID
  const novelId = input.id || input.novel_id || input.novelId || input.ID || input.NovelID;
  const inRegistry = isNovelBannedInRegistry(novelId);
  const registryData = inRegistry ? getBannedRegistry()[String(novelId)] : null;

  const statusRaw = String(input.status || input.Status || "").toLowerCase().trim();
  const isBannedFlag = Boolean(input.is_banned ?? input.IsBanned ?? input.isBanned ?? input.banned);
  const isBanned = statusRaw === "suspended" || statusRaw === "banned" || statusRaw === "ban" || statusRaw === "ระงับ" || isBannedFlag || inRegistry;

  // Auto-register in persistent registry if backend reported banned/suspended
  if ((statusRaw === "suspended" || statusRaw === "banned" || statusRaw === "ban" || isBannedFlag) && novelId) {
    registerBannedNovel(novelId, input);
  }

  const flagPublished = (typeof input.is_published === "boolean") ? input.is_published : (typeof input.isPublished === "boolean" ? input.isPublished : null);
  const flagCompleted = (typeof input.is_completed === "boolean") ? input.is_completed : (typeof input.isCompleted === "boolean" ? input.isCompleted : null);

  let resolvedPublished = false;
  let resolvedCompleted = false;

  if (flagPublished !== null) resolvedPublished = flagPublished;
  if (flagCompleted !== null) resolvedCompleted = flagCompleted;

  if (flagPublished === null && flagCompleted === null) {
    const norm = normalizeStatus(statusRaw);
    if (norm === "published") resolvedPublished = true;
    if (norm === "completed-published") {
      resolvedPublished = true; resolvedCompleted = true;
    }
    if (norm === "completed-draft" || norm === "completed") resolvedCompleted = true;
  }

  const mode = deriveMode(resolvedCompleted, resolvedPublished);
  const info = {
    rawStatus: isBanned ? "suspended" : statusRaw,
    isBanned,
    isPublished: isBanned ? false : Boolean(resolvedPublished),
    isCompleted: Boolean(resolvedCompleted),
    mode: isBanned ? "banned" : mode,
    label: isBanned ? "ถูกระงับการเผยแพร่" : labelFor(mode),
    badgeLabel: isBanned ? "ถูกระงับ" : (mode === "published" ? "เผยแพร่" : (mode.startsWith("completed") ? "จบ" : "ฉบับร่าง")),
    registryData,
  };
  return info;
}

export default getNovelStatusInfo;
