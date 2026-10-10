import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./NotificationPage.css";
import NotificationItem from "../../../components/Notification/NotificationItem";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const normalizeNotification = (item = {}) => {
  const rawType = String(item.type || item.notification_type || item.reference_type || "system").toLowerCase();

  let type = "system";
  if (["follow", "follower", "follows", "user_follow"].includes(rawType)) {
    type = "follower";
  } else if (["comment", "comments", "novel_comment", "chapter_comment"].includes(rawType)) {
    type = "comment";
  } else if (["like", "likes", "novel_like", "chapter_like"].includes(rawType)) {
    type = "like";
  } else if (["novel_update", "novel", "chapter", "new_chapter", "chapter_update"].includes(rawType)) {
    type = "novel_update";
  } else if (["system", "report", "ban", "notice"].includes(rawType)) {
    type = "system";
  } else {
    type = rawType;
  }

  const actorName = item.actor_name || item.actor?.name || "StoryVerse System";
  const actorColor = item.actor_color || item.actor?.avatarColor || "#E91E8C";
  const actorAvatar = item.actor_avatar || item.actor?.avatar || "";

  return {
    id: item.id ?? item.notification_id,
    type,
    read: Boolean(item.is_read ?? item.read),
    actor: {
      id: item.actor_id ?? item.actor?.id ?? 0,
      name: actorName,
      avatar: actorAvatar,
      avatarColor: actorColor,
    },
    title: item.title ?? null,
    body: item.message ?? item.body ?? "",
    novelCover: item.cover_image ?? item.cover ?? item.novelCover ?? null,
    referenceId: item.reference_id ?? item.referenceId ?? null,
    referenceType: item.reference_type ?? item.referenceType ?? "system",
    createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
    time: item.time ?? item.created_at ?? item.createdAt ?? new Date().toISOString(),
  };
};

const buildHeaders = (extra = {}) => {
  const token = localStorage.getItem("token") || "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: buildHeaders(options.headers || {}),
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return null;
};

function relativeTime(date) {
  const diff = (Date.now() - new Date(date)) / 1000;

  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 172800) return "เมื่อวาน";

  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}

function groupLabel(date) {
  const diff = (Date.now() - new Date(date)) / 86400000;

  if (diff < 1) return "วันนี้";
  if (diff < 2) return "เมื่อวาน";
  if (diff < 7) return "สัปดาห์นี้";

  return "เก่ากว่านี้";
}

export default function NotificationPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [deletingNotificationId, setDeletingNotificationId] = useState(null);
  const [notifSettings, setNotifSettings] = useState(null);
  const settingsRef = useRef(null);
  const clearModalCancelRef = useRef(null);

  const activeTabs = useMemo(() => {
    return [
      { key: "all", label: "ทั้งหมด" },
      { key: "unread", label: "ยังไม่อ่าน" },
      { key: "system", label: "ระบบ" },
      { key: "novel_update", label: "นิยาย" },
      { key: "comment", label: "คอมเมนต์" },
      { key: "like", label: "ถูกใจ" },
      { key: "follower", label: "ผู้ติดตาม" }
    ];
  }, []);

  const isCurrentTabDisabled = useMemo(() => {
    if (!notifSettings) return false;
    if (tab === "novel_update" && notifSettings.novel_updates === false) return true;
    if (tab === "follower" && notifSettings.follows === false) return true;
    if (tab === "comment" && notifSettings.comments === false) return true;
    if (tab === "like" && notifSettings.likes === false) return true;
    if (tab === "system" && notifSettings.in_app_notifications === false) return true;
    return false;
  }, [tab, notifSettings]);

  const disabledNotifTypes = useMemo(() => {
    if (!notifSettings) return [];
    const list = [];
    if (notifSettings.novel_updates === false) list.push("นิยายหรือตอนใหม่");
    if (notifSettings.follows === false) list.push("นักเขียนที่ผู้ใช้ติดตาม");
    if (notifSettings.comments === false) list.push("ความคิดเห็น");
    if (notifSettings.likes === false) list.push("การถูกใจ");
    if (notifSettings.in_app_notifications === false) list.push("การแจ้งเตือนจากระบบ");
    return list;
  }, [notifSettings]);

  const unreadCount = items.filter((i) => !i.read).length;

  useEffect(() => {
    if (!showClearConfirm) return undefined;

    clearModalCancelRef.current?.focus();
    const handleModalKeyDown = (event) => {
      if (event.key === "Escape" && !actionLoading) setShowClearConfirm(false);
    };
    document.addEventListener("keydown", handleModalKeyDown);
    return () => document.removeEventListener("keydown", handleModalKeyDown);
  }, [showClearConfirm, actionLoading]);

  const loadNotifications = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Load settings first
      const settingsRes = await fetch(`${API_BASE_URL}/api/me/notification-settings`, { headers });
      let settings = {
        in_app_notifications: true,
        novel_updates: true,
        comments: true,
        likes: true,
        follows: true
      };
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        settings = settingsData?.data || settingsData || settings;
      }
      setNotifSettings(settings);
      settingsRef.current = settings;

      const payload = await requestJson(`/notifications?limit=50`);
      const data = payload?.data ?? payload;
      const list = Array.isArray(data) ? data : Array.isArray(data?.notifications) ? data.notifications : [];
      const normalized = list.map(normalizeNotification);

      setItems(normalized);
      setError("");
    } catch (err) {
      console.error("โหลดแจ้งเตือนไม่สำเร็จ", err);
      setError("โหลดการแจ้งเตือนไม่สำเร็จ");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    const token = localStorage.getItem("token");
    if (!token) return;

    const eventSource = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const incoming = normalizeNotification(payload);

        const currentSettings = settingsRef.current;
        if (currentSettings) {
          if (incoming.type === "novel_update" && currentSettings.novel_updates === false) return;
          if (incoming.type === "follower" && currentSettings.follows === false) return;
          if (incoming.type === "comment" && currentSettings.comments === false) return;
          if (incoming.type === "like" && currentSettings.likes === false) return;
          if (incoming.type === "system" && currentSettings.in_app_notifications === false) return;
        }

        setItems((prev) =>
          prev.some((item) => item.id === incoming.id) ? prev : [incoming, ...prev]
        );
      } catch {
        // ignore heartbeat
      }
    };

    window.addEventListener("notifications-updated", loadNotifications);
    return () => {
      eventSource.close();
      window.removeEventListener("notifications-updated", loadNotifications);
    };
  }, []);

  const filtered = useMemo(() => {
    return items
      .filter((item) => {
        if (tab === "all") return true;
        if (tab === "unread") return !item.read;
        return item.type === tab;
      })
      .map((item) => ({
        ...item,
        relativeTime: relativeTime(item.time),
      }));
  }, [items, tab]);

  const grouped = useMemo(() => {
    const result = {};

    filtered.forEach((item) => {
      const label = groupLabel(item.time);
      if (!result[label]) result[label] = [];
      result[label].push(item);
    });

    return result;
  }, [filtered]);

  const markRead = async (id) => {
    try {
      await requestJson(`/notifications/${id}/read`, { method: "PATCH" });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      const status = document.getElementById("notification-status");
      if (status) status.textContent = "อ่านแล้ว";
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("mark read failed", err);
    } finally {
      window.setTimeout(() => {
        const status = document.getElementById("notification-status");
        if (status) status.textContent = "";
      }, 1800);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification) return;

    if (!notification.read) {
      await markRead(notification.id);
    }

    const refType = notification.referenceType || "system";
    const refId = notification.referenceId ?? null;
    const userRole = JSON.parse(localStorage.getItem("user") || "{}").role;
    const isWriter = userRole === "writer" || userRole === "admin";
    const textToCheck = `${notification.title || ""} ${notification.body || ""}`.toLowerCase();
    const isBanOrReportNotice = textToCheck.includes("ระงับ") || textToCheck.includes("แบน") || textToCheck.includes("รายงาน") || textToCheck.includes("ban") || textToCheck.includes("suspend") || textToCheck.includes("appeal") || refType === "report" || refType === "ban";

    try {
      if ((isBanOrReportNotice || isWriter) && refId && (refType === "novel" || refType === "chapter" || refType === "report" || refType === "ban" || refType === "system")) {
        navigate(`/writer/${refId}/chapters`);
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
    } catch (err) {
      console.error("navigation failed", err);
    }
  };

  const markAllRead = async () => {
    if (actionLoading) return;
    setActionLoading("mark-all");
    try {
      await requestJson(`/notifications/read-all`, { method: "PATCH" });
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("mark all read failed", err);
    } finally {
      setActionLoading("");
    }
  };

  const deleteNotification = async (id) => {
    if (!id || deletingNotificationId) return;
    setDeletingNotificationId(id);
    try {
      await requestJson(`/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
      const status = document.getElementById("notification-status");
      if (status) status.textContent = "ลบการแจ้งเตือนสำเร็จ";
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("delete notification failed", err);
    } finally {
      setDeletingNotificationId(null);
      window.setTimeout(() => {
        const status = document.getElementById("notification-status");
        if (status) status.textContent = "";
      }, 1800);
    }
  };

  const confirmClearAll = async () => {
    if (actionLoading) return;
    setActionLoading("clear-all");
    try {
      await requestJson(`/notifications`, { method: "DELETE" });
      setItems([]);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("clear all failed", err);
    } finally {
      setActionLoading("");
      setShowClearConfirm(false);
    }
  };
  const hasItems = items.length > 0;

  return (
    <div className="notification-page">
      {/* ================= HEADER ================= */}
      <div className="notification-page__sticky-header">
        <div className="notification-page__top">
          <div className="notification-page__heading">
            <button type="button" className="notification-page__back-btn" onClick={() => navigate(-1)} aria-label="ย้อนกลับ">
              ←
            </button>
            <div className="notification-page__labels">
              <div className="notification-page__eyebrow">การแจ้งเตือน</div>
              <div className="notification-page__title">ศูนย์การแจ้งเตือน</div>
              <p aria-live="polite" aria-atomic="true">
                {unreadCount > 0
                  ? `${unreadCount} รายการที่ยังไม่ได้อ่าน`
                  : "อ่านครบทุกรายการแล้ว"}
              </p>
              <div id="notification-status" className="notification-page__live-status" aria-live="polite" aria-atomic="true" />
            </div>
          </div>

          <div className="notification-page__sr-only" aria-live="polite" aria-atomic="true">
            {`${unreadCount} รายการที่ยังไม่ได้อ่าน`}
          </div>

          <div className="notification-page__actions">
            {unreadCount > 0 && (
              <button type="button" className="read-all-button" onClick={markAllRead} disabled={actionLoading !== ""}>
                {actionLoading === "mark-all" ? "กำลังอ่านทั้งหมด..." : "อ่านทั้งหมด"}
              </button>
            )}

            <button
              type="button"
              className="settings-nav-button"
              onClick={() => navigate("/settings")}
            >
              ตั้งค่าการแจ้งเตือน
            </button>
          </div>
        </div>
      </div>

      {/* ================= CLEAR ALL CONFIRM MODAL ================= */}
      {showClearConfirm && (
        <div
          className="confirm-modal-overlay"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header-icon">
              <span>🗑️</span>
            </div>
            <h2 id="clear-confirm-title">ล้างการแจ้งเตือนทั้งหมด?</h2>
            <p>
              การแจ้งเตือนทั้งหมด {items.length} รายการจะถูกลบถาวร และไม่สามารถกู้คืนได้
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-modal-cancel"
                ref={clearModalCancelRef}
                onClick={() => setShowClearConfirm(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="confirm-modal-confirm"
                onClick={confirmClearAll}
                disabled={actionLoading !== ""}
              >
                {actionLoading === "clear-all" ? "กำลังล้าง..." : "ล้างทั้งหมด"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB ================= */}
      <div className="notification-tabs-container">
        <div className="notification-tabs" role="tablist" aria-label="กรองการแจ้งเตือน">
          {activeTabs.map((tabItem) => {
            const count =
              tabItem.key === "all"
                ? items.length
                : tabItem.key === "unread"
                ? unreadCount
                : items.filter((item) => item.type === tabItem.key).length;

            return (
              <button
                type="button"
                key={tabItem.key}
                role="tab"
                id={`notification-tab-${tabItem.key}`}
                aria-selected={tab === tabItem.key}
                aria-controls={`notification-panel-${tabItem.key}`}
                className={tab === tabItem.key ? "tab active" : "tab"}
                onClick={() => setTab(tabItem.key)}
              >
                {tabItem.label}
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= SUB BAR ================= */}
      <div className="notification-sub-bar">
        <button
          type="button"
          className="clear-button"
          onClick={() => setShowClearConfirm(true)}
          disabled={!hasItems}
        >
          ล้างทั้งหมด
        </button>
      </div>

      {/* ================= CONTENT ================= */}
      <div id={`notification-panel-${tab}`} className="notification-content" role="tabpanel" aria-labelledby={`notification-tab-${tab}`}>
        {isCurrentTabDisabled ? (
          <div className="notification-empty" style={{ padding: "40px 20px" }}>
            <div className="empty-icon empty-icon--warning">
              <span>⚠️</span>
            </div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800 }}>การแจ้งเตือนหมวดนี้ถูกปิดอยู่</h2>
            <p style={{ maxWidth: "380px", margin: "8px auto 16px auto", color: "#64748b", fontSize: "0.85rem" }}>
              คุณได้ปิดการแจ้งเตือนนี้ไว้ในหน้าตั้งค่าระบบ ทำให้ไม่มีข้อความแจ้งเตือนใหม่เข้ามาและไม่แสดงผลในหมวดนี้ค่ะ
            </p>
            <button 
              type="button" 
              onClick={() => navigate("/settings")} 
              style={{
                padding: "10px 20px",
                backgroundColor: "#ec4899",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: "0.85rem"
              }}
            >
              ไปเปิดที่หน้าตั้งค่า
            </button>
          </div>
        ) : loading ? (
          <LoadingScreen compact message="กำลังโหลดการแจ้งเตือน..." />
        ) : error ? (
          <div className="notification-empty notification-empty-error">
            <div className="empty-icon empty-icon--warning">
              <span>⚠️</span>
            </div>
            <h2>{error}</h2>
            <p>ลองใหม่อีกครั้ง หรือตรวจสอบการเชื่อมต่อของคุณ</p>
            <button type="button" onClick={loadNotifications}>
              ลองอีกครั้ง
            </button>
          </div>
        ) : (
          <>
            {filtered.length === 0 ? (
              <div className="notification-empty">
                <h2>
                  {hasItems ? "ไม่มีรายการแจ้งเตือน" : "ยังไม่มีการแจ้งเตือน"}
                </h2>
                <p>
                  {hasItems
                    ? "ลองเลือกแท็บอื่นเพื่อดูการแจ้งเตือนประเภทอื่น"
                    : "การแจ้งเตือนใหม่จะปรากฏที่นี่"}
                </p>
                {hasItems ? (
                  <button type="button" onClick={() => setTab("all")}>
                    ดูทั้งหมด
                  </button>
                ) : (
                  <button type="button" onClick={() => navigate("/")}>
                    ไปสำรวจนิยาย
                  </button>
                )}
              </div>
            ) : (
              ["วันนี้", "เมื่อวาน", "สัปดาห์นี้", "เก่ากว่านี้"]
                .filter((group) => grouped[group])
                .map((group) => (
                  <section key={group} className="notification-group">
                    <h3 className="group-title">{group}</h3>
                    <div className="notification-group-list">
                      {grouped[group].map((notification) => (
                        <NotificationItem
                          key={notification.id}
                          notification={notification}
                          onClick={handleNotificationClick}
                          onDelete={deleteNotification}
                          isDeleting={deletingNotificationId === notification.id}
                        />
                      ))}
                    </div>
                  </section>
                ))
            )}
          </>
        )}
      </div>
    </div>
  );
}