import { useState, useEffect } from "react";
import "./FollowButton.css";
import { showToast } from "../../utils/toast";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const formatMinioUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  return url.replace("http://minio:9000", "http://localhost:9000");
};

const getErrorMessage = (body, status) => {
  if (!body) return `การติดตามล้มเหลว (${status})`;
  const msg = body.message || body.error || body.msg;
  if (typeof msg === "string") return msg;
  if (typeof msg === "object" && msg !== null) {
    return msg.message || msg.error || JSON.stringify(msg);
  }
  return `การติดตามล้มเหลว (${status})`;
};

/**
 * FollowButton Component - ปุ่มติดตามนักเขียน (Capsule shape with Sparkle/Fireworks Animation)
 * @param {object} props
 * @param {number} props.writerId - ID ของนักเขียนที่ต้องการติดตาม
 * @param {string} props.writerName - ชื่อนักเขียน (สำหรับ display/logging)
 * @param {boolean} props.isFollowing - State ว่ากำลังติดตามหรือไม่
 * @param {function} props.onFollowChange - Callback เมื่อสถานะการติดตามเปลี่ยน (รับ isFollowing)
 * @param {string} props.size - ขนาดปุ่ม "small" | "medium" | "large" (default: "medium")
 */
export default function FollowButton({
  writerId,
  writerName = "นักเขียน",
  avatarUrl = null,
  novels = [],
  isFollowing = false,
  onFollowChange,
  size = "medium",
  followedText = "ติดตามแล้ว",
  unfollowedText = "ติดตาม",
}) {
  const [loading, setLoading] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [isSparking, setIsSparking] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsFollowed(false);
      return;
    }
    if (isFollowing) {
      setIsFollowed(true);
      return;
    }
    // ตรวจสอบสถานะการติดตามจาก local_following_writers ใน localStorage
    try {
      const rawWriterId = typeof writerId === "object" && writerId !== null
        ? (writerId.writer_id || writerId.id || writerId.writerId || writerId.user_id)
        : writerId;
      const numId = Number(rawWriterId);
      if (numId) {
        const saved = localStorage.getItem("local_following_writers");
        const list = saved ? JSON.parse(saved) : [];
        if (Array.isArray(list) && list.some((w) => Number(w.id || w.writer_id) === numId)) {
          setIsFollowed(true);
          return;
        }
      }
    } catch (_) {}
    setIsFollowed(false);
  }, [isFollowing, writerId]);

  // ซิงค์สถานะอัตโนมัติเมื่อมีการเปลี่ยนแปลงใน local_following_writers จากหน้าอื่นๆ หรือปุ่มอื่นๆ
  useEffect(() => {
    const handleStorageChange = (e) => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsFollowed(false);
        return;
      }
      const rawWriterId = typeof writerId === "object" && writerId !== null
        ? (writerId.writer_id || writerId.id || writerId.writerId || writerId.user_id)
        : writerId;
      const numId = Number(rawWriterId);
      if (e?.detail?.writerId && numId && Number(e.detail.writerId) === numId) {
        setIsFollowed(Boolean(e.detail.isFollowing));
      } else if (numId) {
        try {
          const saved = localStorage.getItem("local_following_writers");
          const list = saved ? JSON.parse(saved) : [];
          setIsFollowed(Array.isArray(list) && list.some((w) => Number(w.id || w.writer_id) === numId));
        } catch (_) {}
      }
    };

    window.addEventListener("local_following_writers_changed", handleStorageChange);
    return () => window.removeEventListener("local_following_writers_changed", handleStorageChange);
  }, [writerId]);

  // ปิด modal เมื่อกด Escape
  useEffect(() => {
    if (!showAuthModal) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setShowAuthModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAuthModal]);

  const handleFollowClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    const token = localStorage.getItem("token");
    // 🟢 ถ้าเป็น Guest ให้แสดง Popup แจ้งเตือนเข้าสู่ระบบ/สมัครสมาชิก ไม่ยิง API ไม่เซฟข้อมูล
    if (!token) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);

    try {
      const userId = localStorage.getItem("user_id") || (() => {
        const userJson = localStorage.getItem("user");
        if (!userJson) return null;
        try {
          const u = JSON.parse(userJson);
          const idVal = u?.id ?? u?.user_id ?? null;
          if (idVal) localStorage.setItem("user_id", String(idVal));
          return idVal ? String(idVal) : null;
        } catch (e) {
          return null;
        }
      })();

      // Validate writerId (ensure numeric)
      const rawWriterId =
        typeof writerId === "object" && writerId !== null
          ? (writerId.writer_id || writerId.id || writerId.writerId || writerId.user_id)
          : writerId;
      const numericWriterId = Number(rawWriterId);
      if (!numericWriterId || Number.isNaN(numericWriterId)) {
        const msg = "missing writerId";
        console.error("FollowButton:", msg, { writerId });
        showToast(msg, { type: "error" });
        setLoading(false);
        return;
      }

      if (userId && String(userId) === String(numericWriterId)) {
        showToast("คุณไม่สามารถติดตามตัวเองได้", { type: "warning" });
        setLoading(false);
        return;
      }

      // 🔗 เชื่อมต่อ POST /api/writers/:id/follow หรือ POST /api/writers/:id/unfollow: เพื่อส่งคำสั่งติดตามหรือยกเลิกติดตามนักเขียน
      const primaryEndpoint = isFollowed
        ? `${API_BASE_URL}/api/writers/${numericWriterId}/unfollow`
        : `${API_BASE_URL}/api/writers/${numericWriterId}/follow`;

      console.log("FollowButton: calling endpoint", primaryEndpoint, { writerId, isFollowed });

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      let response = null;
      try {
        response = await fetch(primaryEndpoint, {
          method: "POST",
          headers,
        });
      } catch (e) {
        console.warn("FollowButton: primary fetch error", e);
      }

      // Only retry a legacy route when the primary route is unavailable, not when it failed server-side.
      if (!response || response.status === 404 || response.status === 405) {
        const fallbackEndpoint = isFollowed
          ? `${API_BASE_URL}/api/v1/writers/${numericWriterId}/unfollow`
          : `${API_BASE_URL}/api/v1/writers/${numericWriterId}/follow`;
        try {
          response = await fetch(fallbackEndpoint, { method: "POST", headers });
        } catch (e) {
          console.warn("FollowButton: versioned fallback fetch error", e);
        }
      }

      // Second fallback for follow using POST /api/v1/follows with JSON payload
      if ((!response || response.status === 404 || response.status === 405) && !isFollowed) {
        try {
          response = await fetch(`${API_BASE_URL}/api/v1/follows`, {
            method: "POST",
            headers,
            body: JSON.stringify({ following_id: numericWriterId }),
          });
        } catch (e) {
          console.warn("FollowButton: follows fallback fetch error", e);
        }
      }

      let respBody = null;
      if (response) {
        try {
          respBody = await response.json().catch(() => null);
        } catch (e) {
          respBody = null;
        }
      }

      if (!response) {
        const message = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่";
        showToast(message, { type: "error" });
        return;
      }

      if (!response.ok) {
        if (response.status === 401) {
          setShowAuthModal(true);
          setLoading(false);
          return;
        }

        const isSelfFollow = respBody && (
          String(respBody.message || respBody.error || "").toLowerCase().includes("self") ||
          String(respBody.message || respBody.error || "").includes("ตัวเอง")
        );
        if (isSelfFollow) {
          showToast("คุณไม่สามารถติดตามตัวเองได้", { type: "warning" });
          setLoading(false);
          return;
        }
        const message = getErrorMessage(respBody, response.status);
        showToast(message, { type: "error" });
        return;
      }

      // อัปเดต state ของการติดตาม
      const newFollowStatus = !isFollowed;
      setIsFollowed(newFollowStatus);

      // ซิงค์ข้อมูลจริงลง localStorage เพื่อให้หน้านักเขียนที่ติดตาม (FollowingWriters) แสดงผลได้ทันที
      try {
        const saved = localStorage.getItem("local_following_writers");
        let list = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(list)) list = [];

        if (newFollowStatus) {
          let writerDetails = {
            id: numericWriterId,
            writer_id: numericWriterId,
            pen_name: writerName,
            name: writerName,
            avatar_url: formatMinioUrl(avatarUrl),
            avatarUrl: formatMinioUrl(avatarUrl),
            avatar: formatMinioUrl(avatarUrl),
            novels: Array.isArray(novels) ? novels : [],
            followers: 1,
            follower_count: 1,
            novel_count: Array.isArray(novels) ? novels.length : 0,
          };

          // 1. ดึงข้อมูลโปรไฟล์จริงของนักเขียนจาก Backend API (/writer/:id หรือ /api/v1/writers/:id)
          try {
            let wRes = await fetch(`${API_BASE_URL}/writer/${numericWriterId}`, { headers });
            if (!wRes.ok) {
              wRes = await fetch(`${API_BASE_URL}/api/v1/writers/${numericWriterId}`, { headers });
            }
            if (wRes.ok) {
              const wJson = await wRes.json().catch(() => null);
              const wData = wJson?.data || wJson?.writer || wJson || {};
              if (wData) {
                const realPenName = wData.pen_name || wData.name_lastname || wData.name || writerName;
                const realAvatar = formatMinioUrl(wData.avatar_url || wData.pic_profile || wData.avatarUrl || avatarUrl);
                const realFollowers = Math.max(Number(wData.follower_count ?? wData.followers ?? 0) + 1, 1);

                writerDetails = {
                  ...writerDetails,
                  ...wData,
                  id: numericWriterId,
                  writer_id: numericWriterId,
                  name: realPenName,
                  pen_name: realPenName,
                  bio: wData.bio || "",
                  avatar_url: realAvatar,
                  avatarUrl: realAvatar,
                  avatar: realAvatar,
                  follower_count: realFollowers,
                  followers: realFollowers,
                  user_id: wData.user_id || wData.userId,
                };
              }
            }
          } catch (wErr) {
            console.warn("FollowButton: failed to fetch writer profile from API", wErr);
          }

          // 2. ดึงรายการนิยายจริงทั้งหมดของนักเขียนคนนี้จาก Backend API (/api/v1/novels)
          try {
            const novelsRes = await fetch(`${API_BASE_URL}/api/v1/novels`, { headers });
            if (novelsRes.ok) {
              const nJson = await novelsRes.json().catch(() => null);
              const rawAll = nJson?.novels || nJson?.data?.novels || nJson?.data || (Array.isArray(nJson) ? nJson : []);
              const targetUserId = writerDetails.user_id;
              const realNovels = (Array.isArray(rawAll) ? rawAll : [])
                .filter(n => {
                  const nAuthorId = String(n.author_id ?? n.authorId ?? n.writer_id ?? "");
                  const nUserId = String(n.user_id ?? n.userId ?? "");
                  return (
                    (nAuthorId && nAuthorId === String(numericWriterId)) ||
                    (targetUserId && nUserId && nUserId === String(targetUserId))
                  );
                })
                .map(n => ({
                  id: n.novel_id ?? n.id ?? n.novelId,
                  title: n.title || n.name || "ไม่มีชื่อเรื่อง",
                  status: (n.is_completed && n.is_published) ? "finished" : (n.is_published ? "ongoing" : (n.status || "ongoing")),
                  cover: formatMinioUrl(n.cover_image || n.cover || n.thumbnail) || null,
                  chapterCount: n.chapter_count ?? n.chapterCount ?? (Array.isArray(n.chapters) ? n.chapters.length : 0),
                  updatedAt: n.updated_at || n.updatedAt || n.created_at || null,
                }));

              if (realNovels.length > 0) {
                writerDetails.novels = realNovels;
                writerDetails.novel_count = realNovels.length;

                // คำนวณ latestUpdate จากผลงานจริงที่อัปเดตล่าสุด
                const sortedNovels = [...realNovels].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
                if (sortedNovels[0]) {
                  const latestN = sortedNovels[0];
                  writerDetails.latestUpdate = {
                    title: latestN.title,
                    detail: `เพิ่มตอนที่ ${latestN.chapterCount || 1}`,
                    time: latestN.updatedAt ? new Date(latestN.updatedAt).toISOString() : new Date().toISOString(),
                    timestamp: latestN.updatedAt ? new Date(latestN.updatedAt).getTime() : Date.now(),
                  };
                }
              }
            }
          } catch (nErr) {
            console.warn("FollowButton: failed to fetch novels from API", nErr);
          }

          const existsIndex = list.findIndex((w) => Number(w.id || w.writer_id) === numericWriterId);
          if (existsIndex >= 0) {
            list[existsIndex] = { ...list[existsIndex], ...writerDetails };
          } else {
            list.push(writerDetails);
          }
          localStorage.setItem("local_following_writers", JSON.stringify(list));
        } else {
          list = list.filter((w) => Number(w.id || w.writer_id) !== numericWriterId);
          localStorage.setItem("local_following_writers", JSON.stringify(list));
        }

        window.dispatchEvent(new CustomEvent("local_following_writers_changed", {
          detail: { writerId: numericWriterId, isFollowing: newFollowStatus }
        }));
      } catch (localErr) {
        console.warn("FollowButton: failed to sync local_following_writers", localErr);
      }

      // Trigger burst sparkle animation when followed
      if (newFollowStatus) {
        setIsSparking(true);
        setTimeout(() => setIsSparking(false), 900);
      }

      if (onFollowChange) onFollowChange(newFollowStatus);
      showToast(newFollowStatus ? `ติดตาม ${writerName} แล้ว` : `เลิกติดตาม ${writerName} แล้ว`, { type: "success" });
    } catch (err) {
      const errMsg = typeof err === "object" && err !== null ? (err.message || String(err)) : String(err);
      console.error("ติดตามนักเขียนล้มเหลว:", errMsg);
      showToast("ดำเนินการติดตามไม่สำเร็จ กรุณาลองใหม่", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const getIcon = () => {
    if (loading) return "⏳";
    return isFollowed ? "✓" : "+";
  };

  const getText = () => {
    if (loading) return "กำลังดำเนิน...";
    return isFollowed ? (followedText || "ติดตามแล้ว") : (unfollowedText || "ติดตาม");
  };

  return (
    <div className="follow-button-wrapper">
      {isSparking && (
        <div className="follow-sparkles" aria-hidden="true">
          <span className="spark spark-1">✨</span>
          <span className="spark spark-2">✦</span>
          <span className="spark spark-3">💖</span>
          <span className="spark spark-4">✦</span>
          <span className="spark spark-5">✨</span>
          <span className="spark spark-6">✦</span>
        </div>
      )}
      <button
        className={`follow-button follow-button--${size} ${
          isFollowed ? "follow-button--followed" : ""
        } ${loading ? "follow-button--loading" : ""} ${
          isSparking ? "follow-button--sparking" : ""
        }`}
        onClick={handleFollowClick}
        disabled={loading}
        title={isFollowed ? `เลิกติดตาม ${writerName}` : `ติดตาม ${writerName}`}
        aria-label={isFollowed ? `เลิกติดตาม ${writerName}` : `ติดตาม ${writerName}`}
      >
        <span className="follow-button__icon">
          {getIcon()}
        </span>
        <span className="follow-button__text">
          {getText()}
        </span>
      </button>

      {/* 🟢 Popup แจ้งเตือนเมื่อ Guest กดติดตาม */}
      {showAuthModal && (
        <div
          className="follow-auth-modal-overlay"
          onClick={() => setShowAuthModal(false)}
          role="presentation"
        >
          <div
            className="follow-auth-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-auth-modal-title"
          >
            <button
              type="button"
              className="follow-auth-modal__close"
              onClick={() => setShowAuthModal(false)}
              aria-label="ปิด"
            >
              ×
            </button>
            <div className="follow-auth-modal__icon" aria-hidden="true">
              ✨
            </div>
            <h3 className="follow-auth-modal__title" id="follow-auth-modal-title">
              เข้าสู่ระบบเพื่อติดตามนักเขียน
            </h3>
            <p className="follow-auth-modal__desc">
              กรุณาเข้าสู่ระบบหรือสมัครสมาชิกเพื่อติดตามผลงานของ <strong>{writerName}</strong> และรับการแจ้งเตือนตอนใหม่ก่อนใคร
            </p>
            <div className="follow-auth-modal__actions">
              <a
                href="/login-register"
                className="follow-auth-modal__btn follow-auth-modal__btn--login"
                onClick={() => setShowAuthModal(false)}
              >
                เข้าสู่ระบบ
              </a>
              <a
                href="/login-register?tab=register"
                className="follow-auth-modal__btn follow-auth-modal__btn--register"
                onClick={() => setShowAuthModal(false)}
              >
                สมัครสมาชิก
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
