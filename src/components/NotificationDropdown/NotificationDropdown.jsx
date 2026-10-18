import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "../Skeleton";
import { formatMinioUrl, getAvatar, resolveAvatarAsync } from "../../utils/avatarService";
import { apiFetch } from "../../utils/apiFetch";
import "./NotificationDropdown.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const AVATAR_PALETTE = [
  "#F472B6", "#A78BFA", "#60A5FA", "#34D399",
  "#FBBF24", "#FB7185", "#38BDF8", "#C084FC"
];

const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const NOTIFICATION_TYPE_LABEL = {
  system: "ระบบ",
  novel_update: "นิยาย",
  comment: "คอมเมนต์",
  like: "ถูกใจ",
  follower: "ผู้ติดตาม",
};

const normalizeNotification = (item = {}) => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const rawType = item.type || item.notification_type || "system";
  const type = rawType === "follow" ? "follower" : rawType;
  const isSystem = type === "system";

  const actorName = isSystem
    ? "StoryVerse ระบบ"
    : (item.actor_name || item.actor?.name || "StoryVerse");

  let actorAvatar = item.actor_avatar || item.actor?.avatar || null;
  // หากเป็นคอมเมนต์/การกระทำของผู้ใช้ปัจจุบัน ดึงรูปโปรไฟล์ของ currentUser มาแสดง
  if (!actorAvatar && !isSystem && currentUser) {
    if (
      (item.actor_id && Number(item.actor_id) === Number(currentUser.id || currentUser.user_id)) ||
      (actorName && currentUser.username && actorName.toLowerCase() === currentUser.username.toLowerCase())
    ) {
      actorAvatar = currentUser.pic_profile || null;
    }
  }

  // ดึงจาก Avatar Registry (ครอบคลุมทั้งนักเขียน, ผู้ใช้อื่น, และ Seed Data)
  if (!actorAvatar && !isSystem) {
    actorAvatar = getAvatar({
      userId: item.actor_id ?? item.actor?.id,
      username: actorName,
      novelId: (item.reference_type === "novel" || type === "novel_update") ? (item.reference_id ?? item.referenceId) : null,
    });
  }

  // แยกชื่อเรื่องและข้อความคอมเมนต์
  let title = item.title || "";
  let body = item.body || item.message || "";
  if (type === "comment" && item.message && item.message.includes("|")) {
    const parts = item.message.split("|");
    if (parts.length >= 2) {
      body = parts.slice(1).join("|").trim();
    }
  }

  return {
    id: item.id ?? item.notification_id,
    type,
    isSystem,
    read: Boolean(item.is_read ?? item.read),
    actorId: item.actor_id ?? item.actor?.id ?? 0,
    actorName,
    actorAvatar: formatMinioUrl(actorAvatar),
    title: title || (type === "comment" ? "นิยาย" : "มีการแจ้งเตือนใหม่"),
    body,
    referenceId: item.reference_id ?? item.referenceId ?? null,
    referenceType: item.reference_type ?? item.referenceType ?? "system",
    createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
    typeLabel: NOTIFICATION_TYPE_LABEL[type] || "ระบบ",
  };
};

const formatTime = (date) => {
  const diff = (Date.now() - new Date(date)) / 1000;
  if (diff < 60) return "เมื่อกี้";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
};

export default function NotificationDropdown({ unreadCount = 0 }) {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState(new Set());

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const loadRecentNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      // 🔗 เชื่อมต่อ GET /api/v1/notifications?limit=5: เพื่อดึงรายการแจ้งเตือนล่าสุด 5 รายการมาแสดงในเมนู Dropdown
      const response = await apiFetch(`${API_BASE_URL}/api/v1/notifications?limit=5`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const payload = await response.json();
      const data = payload?.data ?? payload;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.notifications)
          ? data.notifications
          : [];
      const normalizedList = list.map(normalizeNotification).slice(0, 5);
      setItems(normalizedList);

      // วนลูปโหลดรูปภาพสำหรับแจ้งเตือนที่ยังไม่มีรูป
      normalizedList.forEach(async (notif) => {
        if (!notif.actorAvatar && !notif.isSystem) {
          const novelId = (notif.referenceType === "novel" || notif.type === "novel_update") ? notif.referenceId : null;
          const av = await resolveAvatarAsync({
            userId: notif.actorId,
            username: notif.actorName,
            novelId,
          });
          if (av) {
            setItems((prev) =>
              prev.map((i) => (i.id === notif.id ? { ...i, actorAvatar: av } : i))
            );
          }
        }
      });
    } catch (error) {
      console.warn("โหลดแจ้งเตือนใน dropdown ไม่สำเร็จ", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadRecentNotifications();
    }
  }, [open, loadRecentNotifications]);

  // ซิงค์ข้อมูลเมื่อมีการอัปเดตแจ้งเตือนจากหน้าอื่น หรือมีการอัปเดตรูปโปรไฟล์ในระบบ
  useEffect(() => {
    const handleUpdate = () => {
      if (open) {
        loadRecentNotifications();
      }
    };
    window.addEventListener("notifications-updated", handleUpdate);
    window.addEventListener("storyverse_avatar_updated", handleUpdate);
    return () => {
      window.removeEventListener("notifications-updated", handleUpdate);
      window.removeEventListener("storyverse_avatar_updated", handleUpdate);
    };
  }, [open, loadRecentNotifications]);

  const markReadAndNavigate = async (notification) => {
    if (!notification.read && notification.id) {
      const token = localStorage.getItem("token");
      // 🔗 เชื่อมต่อ PATCH /api/v1/notifications/:id/read: เพื่อทำเครื่องหมายการแจ้งเตือนนี้ว่าอ่านแล้ว เมื่อผู้ใช้กดคลิก
      await fetch(`${API_BASE_URL}/api/v1/notifications/${notification.id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
      window.dispatchEvent(new Event("notifications-updated"));
    }

    setOpen(false);

    const refId = notification.referenceId;
    const refType = notification.referenceType;

    // ถ้าเป็นการแจ้งเตือนคอมเมนต์ นำทางไปที่หน้ารายละเอียดนิยายพร้อมเลื่อนไปที่ส่วนคอมเมนต์
    if (notification.type === "comment" && refId) {
      navigate(`/novel/${refId}#comments`);
      return;
    }

    if (refType === "novel" && refId) {
      navigate(`/novel/${refId}`);
      return;
    }

    if (refType === "chapter" && refId) {
      navigate(`/novel/${refId}`);
      return;
    }

    if (refType === "user" && refId) {
      navigate(`/writer/${refId}/profile`);
      return;
    }

    if (notification.type === "follower" && (refId || notification.actorId)) {
      navigate(`/writer/${refId || notification.actorId}/profile`);
      return;
    }

    if (refId) {
      navigate(`/novel/${refId}`);
    }
  };

  const handleAvatarError = (id) => {
    setFailedAvatars((prev) => new Set(prev).add(id));
  };

  return (
    <div className="notification-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className="navbar__notification-btn"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell size={20} strokeWidth={2.2} />
        {unreadCount > 0 && (
          <span className="navbar__notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown__panel" role="menu" aria-label="การแจ้งเตือนล่าสุด">
          <div className="notification-dropdown__header">
            <div>
              <span className="notification-dropdown__eyebrow">อัปเดตล่าสุด</span>
              <h2>การแจ้งเตือน</h2>
            </div>
            {unreadCount > 0 && <span className="notification-dropdown__count">{unreadCount} ใหม่</span>}
          </div>

          <div className="notification-dropdown__list">
            {loading && items.length === 0 ? (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <Skeleton variant="circular" width="36px" height="36px" />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                      <Skeleton width="50%" height="13px" />
                      <Skeleton width="80%" height="11px" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="notification-dropdown__state">
                <Bell size={22} />
                ยังไม่มีการแจ้งเตือน
              </div>
            ) : (
              items.map((notification) => {
                const hasCustomPhoto = notification.actorAvatar && !failedAvatars.has(notification.id);

                return (
                  <button
                    type="button"
                    role="menuitem"
                    className={`notification-dropdown__item ${notification.read ? "" : "is-unread"}`}
                    key={notification.id}
                    onClick={() => markReadAndNavigate(notification)}
                  >
                    {notification.isSystem ? (
                      <span className="notification-dropdown__avatar notification-dropdown__avatar--system" title="StoryVerse">
                        <img src="/logo192.png" alt="StoryVerse" className="notification-dropdown__logo-img" />
                      </span>
                    ) : hasCustomPhoto ? (
                      <span className="notification-dropdown__avatar">
                        <img
                          src={notification.actorAvatar}
                          alt={notification.actorName}
                          className="notification-dropdown__avatar-img"
                          onError={() => handleAvatarError(notification.id)}
                        />
                      </span>
                    ) : (
                      <span
                        className="notification-dropdown__avatar"
                        style={{ backgroundColor: getAvatarColor(notification.actorName) }}
                      >
                        {notification.actorName.charAt(0).toUpperCase()}
                      </span>
                    )}

                    <span className="notification-dropdown__copy">
                      <span className="notification-dropdown__meta-row">
                        <strong title={notification.actorName}>{notification.actorName}</strong>
                        <span className="notification-dropdown__tag">{notification.typeLabel}</span>
                      </span>

                      {notification.type === "comment" ? (
                        <>
                          <span className="notification-dropdown__title" title={`เรื่อง : ${notification.title}`}>
                            เรื่อง : {notification.title}
                          </span>
                          {notification.body && (
                            <small title={`แสดงความคิดเห็นว่า : ${notification.body}`}>
                              แสดงความคิดเห็นว่า : {notification.body}
                            </small>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="notification-dropdown__title">{notification.title}</span>
                          {notification.body && <small>{notification.body}</small>}
                        </>
                      )}

                      <time>{formatTime(notification.createdAt)}</time>
                    </span>

                    {!notification.read && <span className="notification-dropdown__dot" aria-label="ยังไม่ได้อ่าน" />}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            className="notification-dropdown__all-button"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            ดูการแจ้งเตือนทั้งหมด <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

