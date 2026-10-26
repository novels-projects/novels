import { useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Heart,
  UserCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatMinioUrl, getAvatar } from "../../utils/avatarService";
import "./NotificationItem.css";

// สีพาสเทลสำหรับ avatar สำรองแบบ deterministic (คนเดิมได้สีเดิมเสมอตามชื่อ)
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

const getAvatarColor = (name) =>
  AVATAR_PALETTE[hashStringToIndex(name || "?", AVATAR_PALETTE.length)];

const getInitial = (name) => {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
};

const TYPE_CONFIG = {
  novel_update: {
    icon: BookOpen,
    label: "นิยาย",
    action: "อัปเดตนิยายใหม่",
    accent: "#F59E0B",
    accentSoft: "#FFFBEB",
    accentBorder: "#FDE68A",
    hasPreview: true,
  },
  comment: {
    icon: MessageSquare,
    label: "คอมเมนต์",
    action: "แสดงความคิดเห็น",
    accent: "#6366F1",
    accentSoft: "#EEF2FF",
    accentBorder: "#C7D2FE",
    hasPreview: true,
  },
  like: {
    icon: Heart,
    label: "ถูกใจ",
    action: "กดถูกใจนิยาย",
    accent: "#EC4899",
    accentSoft: "#FDF2F8",
    accentBorder: "#FBCFE8",
    hasPreview: false,
  },
  follower: {
    icon: UserCheck,
    label: "ผู้ติดตาม",
    action: "เริ่มติดตามคุณแล้ว",
    accent: "#8B5CF6",
    accentSoft: "#F5F3FF",
    accentBorder: "#DDD6FE",
    hasPreview: false,
  },
  system: {
    icon: Sparkles,
    label: "ระบบ",
    action: "การแจ้งเตือนจากระบบ",
    accent: "#F526A2",
    accentSoft: "#FDEAF5",
    accentBorder: "#F6DCEC",
    hasPreview: true,
  },
};

export default function NotificationItem({
  notification,
  onClick,
  onDelete,
  isDeleting = false,
}) {
  const [avatarError, setAvatarError] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const typeConfig = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system;
  const TypeIcon = typeConfig.icon;

  const isSystem = notification.type === "system";
  const actorName = isSystem ? "StoryVerse ระบบ" : (notification.actor?.name || "StoryVerse");

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  let resolvedAvatarUrl = notification.actor?.avatar;
  if (!resolvedAvatarUrl && !isSystem && currentUser) {
    const actorId = notification.actor?.id;
    if (
      (actorId && Number(actorId) === Number(currentUser.id || currentUser.user_id)) ||
      (actorName && currentUser.username && actorName.toLowerCase() === currentUser.username.toLowerCase())
    ) {
      resolvedAvatarUrl = currentUser.pic_profile || null;
    }
  }

  // ดึงจาก Avatar Registry
  if (!resolvedAvatarUrl && !isSystem) {
    resolvedAvatarUrl = getAvatar({
      userId: notification.actor?.id,
      username: actorName,
      novelId: (notification.referenceType === "novel" || notification.type === "novel_update") ? notification.referenceId : null,
    });
  }

  const formattedAvatarUrl = formatMinioUrl(resolvedAvatarUrl);
  const showPhotoAvatar = !isSystem && Boolean(formattedAvatarUrl) && !avatarError;

  const displayTime = notification.relativeTime || "เมื่อสักครู่";
  const rawCoverUrl = notification.novelCover;
  const formattedCoverUrl = formatMinioUrl(rawCoverUrl);
  const showCover = Boolean(formattedCoverUrl) && !coverError;

  const showPreview = showCover || Boolean(notification.title) || Boolean(notification.body);

  const handleItemClick = () => {
    if (onClick) onClick(notification);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleItemClick();
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (onDelete && !isDeleting) {
      onDelete(notification.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`notification-item ${notification.read ? "read" : "unread"}`}
      style={{
        "--type-accent": typeConfig.accent,
        "--type-accent-soft": typeConfig.accentSoft,
        "--type-accent-border": typeConfig.accentBorder,
      }}
      onClick={handleItemClick}
      onKeyDown={handleKeyDown}
      aria-label={`${notification.read ? "อ่านแล้ว" : "ยังไม่ได้อ่าน"}: ${actorName} ${typeConfig.action}`}
    >
      {/* 1. อวาตาร์โปรไฟล์ของ Actor จริง หรือ โลโก้ระบบ */}
      <div className="notification-avatar-wrapper">
        {isSystem ? (
          <div className="notification-avatar notification-avatar--system" title="StoryVerse">
            <img src="/logo192.png" alt="StoryVerse" className="notification-system-logo" />
          </div>
        ) : showPhotoAvatar ? (
          <div className="notification-avatar">
            <img
              src={formattedAvatarUrl}
              alt={actorName}
              className="notification-avatar-img"
              onError={() => setAvatarError(true)}
            />
          </div>
        ) : (
          <div
            className="notification-avatar notification-avatar--letter"
            style={{
              backgroundColor: getAvatarColor(actorName),
            }}
          >
            {getInitial(actorName)}
          </div>
        )}

        {/* แบดจ์ไอคอนประเภทการแจ้งเตือน */}
        <span className="notification-type-badge" title={typeConfig.label}>
          <TypeIcon size={12} />
        </span>
      </div>

      {/* 2. เนื้อหาหลักของการแจ้งเตือน */}
      <div className="notification-main">
        <div className="notification-top">
          <div className="notification-user">
            <span className="notification-actor-name">{actorName}</span>
            <span className="notification-action-text">{typeConfig.action}</span>
          </div>

          <div className="notification-meta">
            {!notification.read && (
              <span className="notification-dot" aria-label="ยังไม่ได้อ่าน" />
            )}
            <span className="notification-time">{displayTime}</span>
          </div>
        </div>

        {/* การแสดงตัวอย่างเนื้อหา (ชื่อนิยาย, ข้อความ, ปก) */}
        {showPreview && (
          <div className="notification-preview">
            {showCover && (
              <img
                src={formattedCoverUrl}
                alt="หน้าปกนิยาย"
                className="notification-cover"
                onError={() => setCoverError(true)}
              />
            )}

            <div className="notification-preview-text">
              {notification.type === "comment" ? (
                <>
                  <div className="notification-title notification-title--comment">
                    <span className="notification-label">เรื่อง :</span>
                    <span className="notification-novel-name">{notification.title || "นิยาย"}</span>
                  </div>
                  {notification.body && (
                    <div className="notification-message notification-message--comment">
                      <span className="notification-label">แสดงความคิดเห็นว่า :</span>
                      <span className="notification-comment-text">{notification.body}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {notification.title && (
                    <div className="notification-title">{notification.title}</div>
                  )}
                  {notification.body && (
                    <div className="notification-message">{notification.body}</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. ปุ่มลบการแจ้งเตือนแต่ละรายการ */}
      <div className="notification-actions">
        <button
          type="button"
          className="notification-delete-btn"
          onClick={handleDeleteClick}
          disabled={isDeleting}
          aria-label="ลบการแจ้งเตือนนี้"
          title="ลบรายการนี้"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}