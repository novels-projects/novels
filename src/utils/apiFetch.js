// src/utils/apiFetch.js

/**
 * ใช้เส้นทาง API ที่ผู้เรียกระบุเป็นหลัก และลอง legacy aliases เฉพาะเมื่อ
 * backend ตอบ 400/404 เท่านั้น ไม่ retry เมื่อถูกปฏิเสธสิทธิ์หรือเกิด server error
 */
export const apiFetch = async (url, options = {}) => {
  if (typeof url !== "string") {
    return fetch(url, options);
  }

  const res = await fetch(url, options);

  // หากผลลัพธ์เป็น 400 Bad Request หรือ 404 Not Found ให้ลอง Fallback ไปยังเส้นทางอื่นที่อาจรองรับ
  if (res.status === 400 || res.status === 404) {
    const urlsToTry = [];
    if (url.includes("/api/v1/")) {
      urlsToTry.push(url.replace("/api/v1/", "/"));
      urlsToTry.push(url.replace("/api/v1/", "/api/"));
    }

    for (const fbUrl of urlsToTry) {
      if (fbUrl === url) continue;
      try {
        const fbRes = await fetch(fbUrl, options);
        if (fbRes.ok) {
          return fbRes;
        }
      } catch (error) {
        console.warn("API fallback request failed", error);
      }
    }
  }

  return res;
};

export default apiFetch;
