import React, { useState, useEffect } from "react";
import "./FollowButton.css";
import { showToast } from "../../utils/toast";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

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
  const [error, setError] = useState(null);
  const [isFollowed, setIsFollowed] = useState(isFollowing);
  const [isSparking, setIsSparking] = useState(false);

  useEffect(() => {
    setIsFollowed(isFollowing);
  }, [isFollowing]);

  const handleFollowClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        showToast("กรุณาเข้าสู่ระบบก่อน", { type: "info" });
        window.location.href = "/login-register";
        return;
      }

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
      const numericWriterId = Number(writerId);
      if (!numericWriterId || Number.isNaN(numericWriterId)) {
        const msg = "missing writerId";
        console.error("FollowButton:", msg);
        showToast(msg, { type: "error" });
        setLoading(false);
        return;
      }

      if (userId && String(userId) === String(numericWriterId)) {
        showToast("คุณไม่สามารถติดตามตัวเองได้", { type: "warning" });
        setLoading(false);
        return;
      }

      // เรียก API ติดตามนักเขียน
      const primaryEndpoint = isFollowed
        ? `${API_BASE_URL}/api/writers/${numericWriterId}/unfollow`
        : `${API_BASE_URL}/api/writers/${numericWriterId}/follow`;

      console.log("FollowButton: calling endpoint", primaryEndpoint, { writerId, isFollowed });

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      let response = await fetch(primaryEndpoint, {
        method: "POST",
        headers,
      });

      // Fallback endpoint if primary fails with 500 or 404
      if (!response.ok && (response.status === 500 || response.status === 404)) {
        const fallbackEndpoint = isFollowed
          ? `${API_BASE_URL}/writers/${numericWriterId}/unfollow`
          : `${API_BASE_URL}/writers/${numericWriterId}/follow`;
        try {
          const fbRes = await fetch(fallbackEndpoint, { method: "POST", headers });
          if (fbRes.ok) {
            response = fbRes;
          }
        } catch (_) {}
      }

      let respBody = null;
      try {
        respBody = await response.json().catch(() => null);
      } catch (e) {
        respBody = null;
      }

      if (!response.ok) {
        const errorText = getErrorMessage(respBody, response.status);
        showToast(errorText, { type: "error" });
        throw new Error(errorText);
      }

      // อัปเดต state เฉพาะเมื่อ API สำเร็จ
      const newFollowStatus = !isFollowed;
      setIsFollowed(newFollowStatus);

      // ซิงค์ข้อมูลลง localStorage เพื่อให้หน้านักเขียนที่ติดตาม (FollowingWriters) แสดงผลได้ทันที
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
            avatar_url: avatarUrl || null,
            avatarUrl: avatarUrl || null,
            novels: novels || [],
          };

          try {
            const wRes = await fetch(`${API_BASE_URL}/writer/${numericWriterId}`, { headers });
            if (wRes.ok) {
              const wJson = await wRes.json().catch(() => null);
              const wData = wJson?.data || wJson?.writer || wJson || {};
              if (wData) {
                writerDetails = {
                  ...writerDetails,
                  ...wData,
                  id: numericWriterId,
                  writer_id: numericWriterId,
                  pen_name: wData.pen_name || writerName,
                  follower_count: wData.follower_count ?? wData.followers ?? 1,
                  novel_count: wData.novel_count ?? (Array.isArray(wData.novels) ? wData.novels.length : 1),
                  novels: Array.isArray(wData.novels) && wData.novels.length > 0 ? wData.novels : writerDetails.novels,
                };
              }
            }
          } catch (_) {}

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
      setError(errMsg);
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
    </div>
  );
}
