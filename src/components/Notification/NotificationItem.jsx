// src/components/Notification/NotificationItem.jsx

import "./NotificationItem.css";

const formatRelativeTime = (iso) => {
  const diff = (Date.now() - new Date(iso)) / 1000;

  if (diff < 60) return "เมื่อกี้";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 172800) return "เมื่อวาน";
  if (diff < 604800) return `${Math.floor(diff / 86400)} วันที่แล้ว`;

  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
};

const TYPE_CONFIG = {
  novel_update: {
    icon: "📖",
    action: "อัปเดตนิยายเรื่องใหม่",
    accent: "#f59e0b",
    accentSoft: "#fffbeb",
    hasPreview: true,
  },
  comment: {
    icon: "💬",
    action: "แสดงความคิดเห็นในนิยายของคุณ",
    accent: "#6366f1",
    accentSoft: "#eef2ff",
    hasPreview: true,
  },
  like: {
    icon: "❤️",
    action: "กดถูกใจนิยายของคุณ",
    accent: "#ec4899",
    accentSoft: "#fdf2f8",
    hasPreview: false,
  },
  follower: {
    icon: "👤",
    action: "เริ่มติดตามคุณแล้ว",
    accent: "#8b5cf6",
    accentSoft: "#f5f3ff",
    hasPreview: false,
  },
  system: {
    icon: "✨",
    action: "ส่งการแจ้งเตือนให้คุณ",
    accent: "#10b981",
    accentSoft: "#ecfdf5",
    hasPreview: true,
  },
};

export default function NotificationItem({
  notification,
  onClick,
  onDelete,
  isDeleting = false,
}) {
  const type = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
  const actorName = notification.actor?.name || "StoryVerse";
  // ใช้ relativeTime ที่ NotificationPage คำนวณมาให้แล้ว ถ้าไม่มี (เช่น ใช้ component นี้แบบเดี่ยวๆ) ค่อย fallback มาคำนวณเอง
  const displayTime = notification.relativeTime || formatRelativeTime(notification.time);

  // ประเภทที่เป็นแค่กิจกรรมโซเชียลล้วน (ถูกใจ/ติดตาม) มักมี body ที่พูดซ้ำกับบรรทัดหัวข้อไปแล้ว
  // เลยแสดง preview เพิ่มเฉพาะตอนมีเนื้อหาจริง (ปกนิยาย) หรือเป็นประเภทที่มีเนื้อหาเสมอ (คอมเมนต์/อัปเดตนิยาย/ระบบ)
  const showPreview = Boolean(notification.novelCover) || type.hasPreview;

  const handleActivate = () => onClick && onClick(notification);

  return (
    <div
      className={`notification-item ${notification.read ? "" : "unread"}`}
      style={{ "--type-accent": type.accent, "--type-accent-soft": type.accentSoft }}
    >
      <button type="button" className="notification-item__open" onClick={handleActivate}>
        <div className="notification-avatar-wrapper">
          <div
            className="notification-avatar"
            style={{
              background: notification.actor?.avatar ? "transparent" : (notification.actor?.avatarColor || "#E91E8C"),
            }}
          >
            {notification.actor?.avatar ? (
              <img
                src={notification.actor.avatar}
                alt={actorName}
                className="notification-avatar-img"
              />
            ) : (
              actorName.charAt(0)
            )}
          </div>

          <span className="notification-type-badge">
            {type.icon}
          </span>
        </div>

        <div className="notification-main">
          <div className="notification-top">
            <div className="notification-user">
              <strong>{actorName}</strong>
              <span>{type.action}</span>
            </div>

            <div className="notification-meta">
              {!notification.read && (
                <span className="notification-dot" aria-label="ยังไม่ได้อ่าน" />
              )}
              <span className="notification-time">{displayTime}</span>
            </div>
          </div>

          {showPreview && (notification.novelCover || notification.title || notification.body) && (
            <div className="notification-preview">
              {notification.novelCover && (
                <img
                  src={notification.novelCover}
                  alt=""
                  className="notification-cover"
                />
              )}

              <div className="notification-preview-text">
                {notification.title && (
                  <div className="notification-title">
                    {notification.title}
                  </div>
                )}

                {notification.body && (
                  <div className="notification-message">
                    {notification.body}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </button>

      <div className="notification-footer">
        <button
          type="button"
          className="notification-delete"
          aria-label="ลบการแจ้งเตือนนี้"
          onClick={() => onDelete?.(notification.id)}
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          <span className="notification-delete-icon" aria-hidden="true">{isDeleting ? "⏳" : "🗑"}</span>
          {isDeleting ? "กำลังลบ..." : "ลบ"}
        </button>
      </div>
    </div>
  );
}