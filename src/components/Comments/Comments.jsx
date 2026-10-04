import React from "react";
import "./Comments.css";

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

// เผื่อ backend ส่ง field รูปโปรไฟล์มาจริง (เหมือน novel.author.avatarUrl ที่ใช้อยู่แล้ว
// ในส่วนผู้แต่ง) เช็คชื่อ field ที่เป็นไปได้ — ถ้ามีรูปให้ใช้รูปจริงก่อนเสมอ
// ตัวอักษร+สีเป็นแค่ fallback ตอนไม่มีรูป
const getAvatarUrl = (c) =>
  c.pic_profile || c.avatarUrl || c.avatar_url || c.profileImage || c.profile_image || c.userAvatar || c.user_avatar || null;

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
  commentText = "",
  onCommentTextChange = () => {},
  onSubmit = () => {},
  onDeleteComment = () => {},
  isSubmitting = false,
  title = "แสดงความคิดเห็น",
  subtitle = "แบ่งปันความรู้สึกของคุณได้ที่นี่",
  readOnly = false,
}) => {
  return (
    <section className="novel-detail__comments-section">
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
          <textarea
            className="novel-detail__comment-input"
            value={commentText}
            onChange={onCommentTextChange}
            rows={3}
            placeholder="เขียนความรู้สึกของคุณที่นี่..."
          />
          <div className="novel-detail__comment-actions">
            <button type="submit" className="novel-detail__comment-button" disabled={isSubmitting}>
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
            const displayName = c.author || c.username || "ผู้ใช้งานนิรนาม";
            const avatarUrl = getAvatarUrl(c);
            return (
            <article key={c.id || c.comment_id} className="novel-detail__comment-card">
              {avatarUrl ? (
                <div className="novel-detail__comment-avatar">
                  <img src={avatarUrl} alt={displayName} className="novel-detail__comment-avatar-img" />
                </div>
              ) : (
                <div className="novel-detail__comment-avatar" style={{ background: getAvatarColor(displayName) }}>
                  {getInitial(displayName)}
                </div>
              )}
              <div className="novel-detail__comment-body">
                <div className="novel-detail__comment-top">
                <span className="novel-detail__comment-user">{displayName}</span>
                <div className="novel-detail__comment-meta">
                  <span className="novel-detail__comment-date">{formatThaiDate(c.createdAt || c.created_at)}</span>
                  {(c.user_id === currentUserId || c.userId === currentUserId) && (
                    <button
                      type="button"
                      className="novel-detail__comment-delete"
                      onClick={() => onDeleteComment(c.comment_id || c.id)}
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