// src/utils/apiFetch.js

/**
 * ฟังก์ชันช่วยเรียก API โดยจะเรียกเส้นทางตามที่ระบุ (เช่น /api/v1/...) ก่อนเสมอ
 * หาก Backend ยังมีปัญหาเรื่องการ parse URL (เช่น 400 Bad Request หรือ 404 Not Found)
 * ระบบจะทำ Fallback ไปยังเส้นทางเดิมโดยอัตโนมัติ เพื่อให้หน้าเว็บใช้งานได้ต่อเนื่องอย่างสมบูรณ์แบบ
 */
export const apiFetch = async (url, options = {}) => {
  if (typeof url !== "string") {
    return fetch(url, options);
  }

  // ปรับ URL สำหรับกรณีที่ Backend Go อาศัย extractIDFromPath เช่น /scenes/, /choices/, /chapters/, /novels/, /writer/
  // ซึ่งหากส่งผ่าน /api/v1/... ตัว extractIDFromPath จะตัด prefix ผิดพลาดกลายเป็น 'api' และแจ้ง 400 invalid id parameter
  let targetUrl = url;
  if (targetUrl.includes("/api/v1/admin/novels")) {
    targetUrl = targetUrl.replace("/api/v1/admin/novels", "/api/admin/novels");
  } else if (targetUrl.includes("/api/v1/admin/reports")) {
    targetUrl = targetUrl.replace("/api/v1/admin/reports", "/api/admin/reports");
  } else if (targetUrl.includes("/api/v1/admin/users")) {
    targetUrl = targetUrl.replace("/api/v1/admin/users", "/api/admin/users");
  } else if (targetUrl.includes("/api/v1/admin/categories")) {
    targetUrl = targetUrl.replace("/api/v1/admin/categories", "/api/admin/categories");
  } else if (targetUrl.includes("/api/v1/writers/")) {
    targetUrl = targetUrl.replace("/api/v1/writers/", "/writer/");
  } else if (targetUrl.includes("/writers/")) {
    targetUrl = targetUrl.replace("/writers/", "/writer/");
  } else if (targetUrl.includes("/api/v1/scenes/")) {
    targetUrl = targetUrl.replace("/api/v1/scenes/", "/scenes/");
  } else if (targetUrl.includes("/api/v1/choices/")) {
    targetUrl = targetUrl.replace("/api/v1/choices/", "/choices/");
  } else if (targetUrl.includes("/api/v1/chapters/")) {
    targetUrl = targetUrl.replace("/api/v1/chapters/", "/chapters/");
  } else if (targetUrl.includes("/api/v1/novels/")) {
    targetUrl = targetUrl.replace("/api/v1/novels/", "/novels/");
  }

  let res;
  try {
    res = await fetch(targetUrl, options);
  } catch (err) {
    if (targetUrl !== url) {
      try {
        return await fetch(url, options);
      } catch (_) {}
    }
    throw err;
  }

  // หากผลลัพธ์เป็น 400 Bad Request หรือ 404 Not Found ให้ลอง Fallback ไปยังเส้นทางอื่นที่อาจรองรับ
  if (res.status === 400 || res.status === 404) {
    const urlsToTry = [];
    if (url !== targetUrl) {
      urlsToTry.push(url);
    }
    if (targetUrl.includes("/api/v1/")) {
      urlsToTry.push(targetUrl.replace("/api/v1/", "/"));
      urlsToTry.push(targetUrl.replace("/api/v1/", "/api/"));
    } else if (url.includes("/api/v1/")) {
      urlsToTry.push(url.replace("/api/v1/", "/api/"));
    }

    for (const fbUrl of urlsToTry) {
      if (fbUrl === targetUrl) continue;
      try {
        const fbRes = await fetch(fbUrl, options);
        if (fbRes.ok) {
          return fbRes;
        }
      } catch (_) {}
    }
  }

  return res;
};

export default apiFetch;
