import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./NotificationDropdown.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const NOTIFICATION_TYPE_LABEL = {
  system: "ระบบ",
  novel_update: "นิยาย",
  comment: "คอมเมนต์",
  like: "ถูกใจ",
  follower: "ผู้ติดตาม",
};

const normalizeNotification = (item = {}) => ({
  id: item.id ?? item.notification_id,
  type: item.type === "follow" ? "follower" : item.type || "system",
  read: Boolean(item.is_read ?? item.read),
  actorName: item.actor_name || item.actor?.name || "StoryVerse System",
  actorColor: item.actor_color || item.actor?.avatarColor || "#E91E8C",
  title: item.title || item.message || item.body || "มีการแจ้งเตือนใหม่",
  body: item.title ? item.message || item.body || "" : "",
  referenceId: item.reference_id ?? item.referenceId ?? null,
  referenceType: item.reference_type ?? item.referenceType ?? "system",
  createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
  typeLabel: NOTIFICATION_TYPE_LABEL[item.type === "follow" ? "follower" : item.type || "system"] || "ระบบ",
});

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

  useEffect(() => {
    if (!open) return;

    const loadRecentNotifications = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_BASE_URL}/notifications?limit=5`, {
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
        setItems(list.map(normalizeNotification).slice(0, 5));
      } catch (error) {
        console.warn("โหลดแจ้งเตือนใน dropdown ไม่สำเร็จ", error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadRecentNotifications();
  }, [open]);

  const markReadAndNavigate = async (notification) => {
    if (!notification.read && notification.id) {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE_URL}/notifications/${notification.id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
      window.dispatchEvent(new Event("notifications-updated"));
    }

    setOpen(false);

    const userObj = JSON.parse(localStorage.getItem("user") || "{}");
    const userRole = (userObj.role || userObj.user_role || "").toLowerCase();
    const isWriter = userRole === "writer" || userRole === "admin";
    const refId = notification.referenceId;
    const refType = notification.referenceType;

    if (isWriter && refId && (refType === "novel" || refType === "chapter" || refType === "report" || refType === "ban" || refType === "system")) {
      navigate(`/writer/${refId}/chapters`);
      return;
    }

    if (refType === "novel" && refId) {
      if (isWriter) {
        navigate(`/writer/${refId}/chapters`);
      } else {
        navigate(`/novel/${refId}`);
      }
    } else if (refType === "chapter" && refId) {
      if (isWriter) {
        navigate(`/writer/${refId}/chapters`);
      } else {
        navigate(`/novel/${refId}`);
      }
    } else if (refType === "user" && refId) {
      navigate(`/writer/${refId}/profile`);
    } else if (refId && isWriter) {
      navigate(`/writer/${refId}/chapters`);
    }
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
            {loading ? (
              <div className="notification-dropdown__state">
                <Loader2 size={20} className="notification-dropdown__spinner" />
                กำลังโหลด...
              </div>
            ) : items.length === 0 ? (
              <div className="notification-dropdown__state">
                <Bell size={22} />
                ยังไม่มีการแจ้งเตือน
              </div>
            ) : (
              items.map((notification) => (
                <button
                  type="button"
                  role="menuitem"
                  className={`notification-dropdown__item ${notification.read ? "" : "is-unread"}`}
                  key={notification.id}
                  onClick={() => markReadAndNavigate(notification)}
                >
                  <span
                    className="notification-dropdown__avatar"
                    style={{ backgroundColor: notification.actorColor }}
                  >
                    {notification.actorName.charAt(0)}
                  </span>
                  <span className="notification-dropdown__copy">
                    <span className="notification-dropdown__meta-row">
                      <strong>{notification.actorName}</strong>
                      <span className="notification-dropdown__tag">{notification.typeLabel}</span>
                    </span>
                    <span className="notification-dropdown__title">{notification.title}</span>
                    {notification.body && <small>{notification.body}</small>}
                    <time>{formatTime(notification.createdAt)}</time>
                  </span>
                  {!notification.read && <span className="notification-dropdown__dot" aria-label="ยังไม่ได้อ่าน" />}
                </button>
              ))
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
