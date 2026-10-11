import React, { useState, useEffect, useMemo } from "react";
import "./Comments.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// จัดการแปลง URL รูปภาพ MinIO จาก Docker network ให้เป็น localhost ที่เบราว์เซอร์เปิดได้
const formatMinioUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let formatted = trimmed;
  if (formatted.includes("http://minio:9000")) {
    formatted = formatted.replace("http://minio:9000", "http://localhost:9000");
  }
  if (formatted.startsWith("/")) {
    formatted = `http://localhost:9000${formatted}`;
  }
  return formatted;
};

// สีพาสเทลสำหรับ avatar คอมเมนต์ — เลือกตามชื่อผู้ใช้แบบ deterministic
// (คนเดิมจะได้สีเดิมเสมอ ไม่ต้องเก็บ state เพิ่ม)
const AVATAR_PALETTE = [
  "#F472B6", // pink
  "#A78BFA", // purple
  "#60A5FA", // blue
  "#34D399", // green
  "#FBBF24", // amber
  "#FB7185", // rose
  "#38BDF8", // sky
  "#C084FC", // violet
];

const hashStringToIndex = (str, mod) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % mod;
};

const getAvatarColor = (name) => AVATAR_PALETTE[hashStringToIndex(name || "?", AVATAR_PALETTE.length)];

const getInitial = (name) => {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
};

// แปลงวันที่คอมเมนต์เป็นภาษาไทย — เพิ่งคอมเมนต์แสดงเป็น "X นาที/ชั่วโมงที่แล้ว"
// เก่ากว่า 7 วันแสดงวันที่แบบไทยเต็ม (เช่น "3 ส.ค. 2569")
const formatThaiDate = (dateInput) => {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return String(dateInput); // เผื่อ backend ส่งมาเป็น string ที่ format ไว้แล้ว

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const Comments = ({
  comments = [],
  currentUserId = 0,
  currentUser = null,
  novelAuthor = null,
  novelAuthorAvatar = null,
  novelAuthorName = null,
  novelAuthorId = null,
  commentText = "",
  onCommentTextChange = () => {},
  onSubmit = () => {},
  onDeleteComment = () => {},
  isSubmitting = false,
  title = "แสดงความคิดเห็น",
  subtitle = "แบ่งปันความรู้สึกของคุณได้ที่นี่",
  readOnly = false,
}) => {
  // ดึงข้อมูลผู้ใช้ปัจจุบันจาก prop หรือ localStorage
  const resolvedCurrentUser = useMemo(() => {
    if (currentUser && typeof currentUser === "object") return currentUser;
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, [currentUser]);

  const effectiveUserId = useMemo(() => {
    if (currentUserId && Number(currentUserId) > 0) return Number(currentUserId);
    const uid = resolvedCurrentUser?.id || resolvedCurrentUser?.user_id;
    return uid ? Number(uid) : 0;
  }, [currentUserId, resolvedCurrentUser]);

  const currentUserName = resolvedCurrentUser?.username || resolvedCurrentUser?.name || "";
  const rawCurrentUserAvatar =
    resolvedCurrentUser?.pic_profile ||
    resolvedCurrentUser?.avatarUrl ||
    resolvedCurrentUser?.avatar_url ||
    resolvedCurrentUser?.avatar;
  const currentUserAvatar = formatMinioUrl(rawCurrentUserAvatar);

  // ข้อมูลผู้แต่งนิยาย
  const resolvedAuthorUserId = Number(
    novelAuthor?.user_id || novelAuthor?.userId || 0
  );
  const resolvedAuthorWriterId = Number(
    novelAuthor?.writer_id || novelAuthor?.writerId || novelAuthor?.id || novelAuthorId || 0
  );
  const resolvedAuthorName = (
    novelAuthor?.penName ||
    novelAuthor?.displayName ||
    novelAuthor?.name ||
    novelAuthorName ||
    ""
  ).trim();
  const rawAuthorAvatar =
    novelAuthor?.avatarUrl ||
    novelAuthor?.avatar_url ||
    novelAuthor?.pic_profile ||
    novelAuthorAvatar ||
    null;
  const resolvedAuthorAvatar = formatMinioUrl(rawAuthorAvatar);

  // รายการ comment ID ที่โหลดรูปภาพไม่สำเร็จ เพื่อสลับไปใช้ Default Initial Avatar ทันที
  const [failedAvatarIds, setFailedAvatarIds] = useState(new Set());
  const [currentUserAvatarFailed, setCurrentUserAvatarFailed] = useState(false);

  const handleImageError = (commentId) => {
    if (!commentId) return;
    setFailedAvatarIds((prev) => {
      const next = new Set(prev);
      next.add(commentId);
      return next;
    });
  };

  const getCommentMeta = (c) => {
    const cid = c.comment_id || c.id;
    const uid = Number(c.user_id || c.userId || 0);
    const username = (c.username || c.author || "").trim();

    // เช็คว่าเป็นผู้แต่งนิยายหรือไม่
    const isAuthor = Boolean(
      (resolvedAuthorUserId && uid === resolvedAuthorUserId) ||
      (resolvedAuthorWriterId && uid === resolvedAuthorWriterId) ||
      (resolvedAuthorName && username && (
        username.toLowerCase() === resolvedAuthorName.toLowerCase() ||
        (novelAuthor?.displayName && username.toLowerCase() === novelAuthor.displayName.toLowerCase())
      ))
    );

    // เช็คว่าเป็นผู้ใช้งานที่ล็อกอินอยู่ปัจจุบันหรือไม่
    const isCurrentUser = Boolean(
      (effectiveUserId && uid === effectiveUserId) ||
      (currentUserName && username && username.toLowerCase() === currentUserName.toLowerCase())
    );

    let resolvedAvatar = null;

    // 1. Backend ส่งรูปภาพมาโดยตรงใน comment
    const directAvatar =
      c.pic_profile ||
      c.avatarUrl ||
      c.avatar_url ||
      c.profileImage ||
      c.profile_image ||
      c.userAvatar ||
      c.user_avatar;
    if (directAvatar) {
      resolvedAvatar = formatMinioUrl(directAvatar);
    }
    // 2. ถ้าเป็นคอมเมนต์ของผู้แต่งนิยายเรื่องนี้ ให้ใช้รูปโปรไฟล์ของผู้แต่ง
    else if (isAuthor && resolvedAuthorAvatar) {
      resolvedAvatar = resolvedAuthorAvatar;
    }
    // 3. ถ้าเป็นคอมเมนต์ของบัญชีที่ล็อกอินอยู่ปัจจุบัน ให้ใช้รูปโปรไฟล์ของตนเอง
    else if (isCurrentUser && currentUserAvatar) {
      resolvedAvatar = currentUserAvatar;
    }

    // ถ้าเคยโหลดภาพนี้ไม่สำเร็จ ให้เคลียร์เป็น null เพื่อใช้ Default Avatar แทน
    if (cid && failedAvatarIds.has(cid)) {
      resolvedAvatar = null;
    }

    return {
      cid,
      isAuthor,
      isCurrentUser,
      avatarUrl: resolvedAvatar,
      displayName: username || "ผู้ใช้งานนิรนาม",
    };
  };

  return (
    <section className="novel-detail__comments-section" id="comments">
      <div className="novel-detail__comments-header">
        <div>
          <h4 className="novel-detail__section-title">{title}</h4>
          <p className="novel-detail__section-sub">{subtitle}</p>
        </div>
        <span className="novel-detail__comments-count">{comments.length} คอมเมนต์</span>
      </div>

      {!readOnly && (
        <form
          className="novel-detail__comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(commentText);
          }}
        >
          {/* ข้อมูลโปรไฟล์ของผู้ที่จะส่งความคิดเห็น */}
          <div className="novel-detail__comment-composer-header">
            <div className="novel-detail__composer-avatar">
              {currentUserAvatar && !currentUserAvatarFailed ? (
                <img
                  src={currentUserAvatar}
                  alt={currentUserName || "ผู้ใช้งาน"}
                  className="novel-detail__composer-avatar-img"
                  onError={() => setCurrentUserAvatarFailed(true)}
                />
              ) : (
                <div
                  className="novel-detail__composer-avatar-placeholder"
                  style={{ background: getAvatarColor(currentUserName || "U") }}
                >
                  {getInitial(currentUserName || "U")}
                </div>
              )}
            </div>
            <div className="novel-detail__composer-info">
              <span className="novel-detail__composer-name">
                {effectiveUserId > 0 ? (
                  <>แสดงความคิดเห็นในชื่อ <strong>{currentUserName || "คุณ"}</strong></>
                ) : (
                  <>กรุณาเข้าสู่ระบบก่อนแสดงความคิดเห็น</>
                )}
              </span>
            </div>
          </div>

          <textarea
            className="novel-detail__comment-input"
            value={commentText}
            onChange={onCommentTextChange}
            rows={3}
            placeholder={
              effectiveUserId > 0
                ? "เขียนความรู้สึกของคุณที่นี่..."
                : "กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น..."
            }
            disabled={effectiveUserId <= 0}
          />
          <div className="novel-detail__comment-actions">
            <button
              type="submit"
              className="novel-detail__comment-button"
              disabled={isSubmitting || effectiveUserId <= 0 || !commentText.trim()}
            >
              {isSubmitting ? (
                <span aria-hidden="true">⏳</span>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              )}
              <span>{isSubmitting ? "กำลังส่งความคิดเห็น..." : "ส่งความคิดเห็น"}</span>
            </button>
          </div>
        </form>
      )}

      <div className="novel-detail__comments-list">
        {comments.length === 0 ? (
          <div className="novel-detail__comments-empty">ยังไม่มีความคิดเห็น เป็นคนแรกที่คอมเมนต์เลย 💖</div>
        ) : (
          comments.map((c) => {
            const { cid, isAuthor, isCurrentUser, avatarUrl, displayName } = getCommentMeta(c);

            return (
              <article
                key={cid}
                className={`novel-detail__comment-card ${isAuthor ? "novel-detail__comment-card--author" : ""} ${isCurrentUser ? "novel-detail__comment-card--you" : ""}`}
              >
                <div className="novel-detail__comment-avatar">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="novel-detail__comment-avatar-img"
                      onError={() => handleImageError(cid)}
                    />
                  ) : (
                    <div
                      className="novel-detail__comment-avatar-placeholder"
                      style={{ background: getAvatarColor(displayName) }}
                    >
                      {getInitial(displayName)}
                    </div>
                  )}
                </div>
                <div className="novel-detail__comment-body">
                  <div className="novel-detail__comment-top">
                    <div className="novel-detail__comment-user-wrap">
                      <span className="novel-detail__comment-user">{displayName}</span>
                      {isAuthor && (
                        <span className="novel-detail__comment-badge novel-detail__comment-badge--author">
                          ผู้แต่ง
                        </span>
                      )}
                      {isCurrentUser && (
                        <span className="novel-detail__comment-badge novel-detail__comment-badge--you">
                          คุณ
                        </span>
                      )}
                    </div>
                    <div className="novel-detail__comment-meta">
                      <span className="novel-detail__comment-date">{formatThaiDate(c.createdAt || c.created_at)}</span>
                      {(c.user_id === effectiveUserId || c.userId === effectiveUserId) && (
                        <button
                          type="button"
                          className="novel-detail__comment-delete"
                          onClick={() => onDeleteComment(cid)}
                          aria-label="ลบความคิดเห็น"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="novel-detail__comment-content">{c.content || c.comment || ""}</p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};

export default Comments;