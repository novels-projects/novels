// src/pages/Reader/NotificationPage/NotificationPage.jsx

import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCheck,
  Trash2,
  Settings,
  BellOff,
  AlertCircle,
  X,
} from "lucide-react";
import "./NotificationPage.css";
import NotificationItem from "../../../components/Notification/NotificationItem";
import { NotificationListSkeleton, ButtonSpinner } from "../../../components/Skeleton";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const resolveNotificationType = (rawType) => {
  const t = String(rawType || "system").toLowerCase();
  if (["follow", "follower", "follows", "user_follow"].includes(t)) return "follower";
  if (["comment", "comments", "novel_comment", "chapter_comment"].includes(t)) return "comment";
  if (["like", "likes", "novel_like", "chapter_like"].includes(t)) return "like";
  if (["novel_update", "novel", "chapter", "new_chapter", "chapter_update"].includes(t)) return "novel_update";
  if (["system", "report", "ban", "notice"].includes(t)) return "system";
  return t;
};

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

const normalizeNotification = (item = {}) => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  const type = resolveNotificationType(
    item.type || item.notification_type || item.reference_type
  );

  const actorName = item.actor_name || item.actor?.name || "StoryVerse";
  const actorColor = item.actor_color || item.actor?.avatarColor || "#E91E8C";
  let actorAvatar = item.actor_avatar || item.actor?.avatar || "";

  // ถ้า actor เป็น currentUser (เช่น ผู้ใช้คอมเมนต์หรือถูกใจ) ใช้ pic_profile ของ currentUser
  if (!actorAvatar && currentUser && type !== "system") {
    const actorId = item.actor_id ?? item.actor?.id;
    if (
      (actorId && Number(actorId) === Number(currentUser.id || currentUser.user_id)) ||
      (actorName && currentUser.username && actorName.toLowerCase() === currentUser.username.toLowerCase())
    ) {
      actorAvatar = currentUser.pic_profile || "";
    }
  }

  // แยกข้อความคอมเมนต์กรณีเก็บในรูปแบบ "ชื่อ|ข้อความ"
  let body = item.message ?? item.body ?? "";
  if (type === "comment" && typeof body === "string" && body.includes("|")) {
    const parts = body.split("|");
    if (parts.length >= 2) {
      body = parts.slice(1).join("|").trim();
    }
  }

  return {
    id: item.id ?? item.notification_id,
    type,
    read: Boolean(item.is_read ?? item.read),
    actor: {
      id: item.actor_id ?? item.actor?.id ?? 0,
      name: actorName,
      avatar: formatMinioUrl(actorAvatar),
      avatarColor: actorColor,
    },
    title: item.title ?? null,
    body,
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
  if (!date) return "เมื่อสักครู่";
  const diff = (Date.now() - new Date(date).getTime()) / 1000;

  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 172800) return "เมื่อวาน";

  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}

function groupLabel(date) {
  if (!date) return "วันนี้";
  const diff = (Date.now() - new Date(date).getTime()) / 86400000;

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
  const authorAvatarCache = useRef(new Map());

  // การนับจำนวนทั้งหมดและจำนวนที่ยังไม่ได้อ่าน
  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items]);

  const activeTabs = useMemo(() => {
    return [
      { key: "all", label: "ทั้งหมด", count: items.length },
      { key: "unread", label: "ยังไม่อ่าน", count: unreadCount },
      { key: "system", label: "ระบบ", count: items.filter((i) => i.type === "system").length },
      { key: "novel_update", label: "นิยาย", count: items.filter((i) => i.type === "novel_update").length },
      { key: "comment", label: "คอมเมนต์", count: items.filter((i) => i.type === "comment").length },
      { key: "like", label: "ถูกใจ", count: items.filter((i) => i.type === "like").length },
      { key: "follower", label: "ผู้ติดตาม", count: items.filter((i) => i.type === "follower").length },
    ];
  }, [items, unreadCount]);

  // ตรวจสอบว่าแท็บที่เลือกถูกปิดไว้ในการตั้งค่าหรือไม่
  const isCurrentTabDisabled = useMemo(() => {
    if (!notifSettings) return false;
    if (tab === "novel_update" && notifSettings.novel_updates === false) return true;
    if (tab === "follower" && notifSettings.follows === false) return true;
    if (tab === "comment" && notifSettings.comments === false) return true;
    if (tab === "like" && notifSettings.likes === false) return true;
    if (tab === "system" && notifSettings.in_app_notifications === false) return true;
    return false;
  }, [tab, notifSettings]);

  // จัดการ Modal การกดยกเลิกด้วย ESC
  useEffect(() => {
    if (!showClearConfirm) return undefined;

    clearModalCancelRef.current?.focus();
    const handleModalKeyDown = (event) => {
      if (event.key === "Escape" && !actionLoading) setShowClearConfirm(false);
    };
    document.addEventListener("keydown", handleModalKeyDown);
    return () => document.removeEventListener("keydown", handleModalKeyDown);
  }, [showClearConfirm, actionLoading]);

  const [reloadKey, setReloadKey] = useState(0);

  // โหลดรายการแจ้งเตือนจาก Backend
  useEffect(() => {
    let active = true;

    const fetchNotifications = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        if (active) {
          setItems([]);
          setLoading(false);
          setError("");
        }
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${token}` };

        // ดึงการตั้งค่าการแจ้งเตือน
        const settingsRes = await fetch(`${API_BASE_URL}/api/me/notification-settings`, { headers });
        let settings = {
          in_app_notifications: true,
          novel_updates: true,
          comments: true,
          likes: true,
          follows: true,
        };
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          settings = settingsData?.data || settingsData || settings;
        }
        if (active) {
          setNotifSettings(settings);
          settingsRef.current = settings;
        }

        // ดึงรายการแจ้งเตือนจริงจาก Backend ตามสเปก
        const payload = await requestJson(`/notifications?limit=50`);
        const data = payload?.data ?? payload;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.notifications)
          ? data.notifications
          : [];
        const normalized = list.map(normalizeNotification);

        // ดึงรูปโปรไฟล์จริงของนักเขียนสำหรับแจ้งเตือนประเภท novel_update ที่ Backend ไม่ได้แนบ avatar มา
        const missingNovelIds = normalized
          .filter(
            (item) =>
              item.type === "novel_update" &&
              item.referenceId &&
              !item.actor?.avatar
          )
          .map((item) => item.referenceId);

        const uniqueNovelIds = [...new Set(missingNovelIds)];
        if (uniqueNovelIds.length > 0) {
          await Promise.all(
            uniqueNovelIds.map(async (novelId) => {
              try {
                if (authorAvatarCache.current.has(novelId)) return;
                const res = await fetch(`${API_BASE_URL}/novels/${novelId}`);
                if (!res.ok) return;
                const nData = await res.json();
                const authorId = nData?.data?.novel?.author_id || nData?.novel?.author_id;
                if (!authorId) return;

                const writerRes = await fetch(`${API_BASE_URL}/writer/${authorId}`);
                if (!writerRes.ok) return;
                const writerData = await writerRes.json();
                const avatar = writerData?.data?.avatar_url || writerData?.avatar_url;
                if (avatar) {
                  authorAvatarCache.current.set(novelId, avatar);
                }
              } catch {
                // ละเว้นข้อผิดพลาดกรณีเครือข่ายขัดข้อง
              }
            })
          );

          normalized.forEach((item) => {
            if (item.type === "novel_update" && authorAvatarCache.current.has(item.referenceId)) {
              item.actor.avatar = authorAvatarCache.current.get(item.referenceId);
            }
          });
        }



        if (active) {
          setItems(normalized);
          setError("");
        }
      } catch (err) {
        console.error("โหลดแจ้งเตือนไม่สำเร็จ:", err);
        if (active) {
          setError("ไม่สามารถโหลดการแจ้งเตือนได้ในขณะนี้");
          setItems([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchNotifications();

    const token = localStorage.getItem("token");
    if (!token) return undefined;

    const eventSource = new EventSource(
      `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
    );

    eventSource.onmessage = async (event) => {
      try {
        const eventPayload = JSON.parse(event.data);
        const incoming = normalizeNotification(eventPayload);

        const currentSettings = settingsRef.current;
        if (currentSettings) {
          if (incoming.type === "novel_update" && currentSettings.novel_updates === false) return;
          if (incoming.type === "follower" && currentSettings.follows === false) return;
          if (incoming.type === "comment" && currentSettings.comments === false) return;
          if (incoming.type === "like" && currentSettings.likes === false) return;
          if (incoming.type === "system" && currentSettings.in_app_notifications === false) return;
        }

        // ดึงรูปโปรไฟล์นักเขียนถ้าเป็น novel_update และยังไม่มีรูป
        if (incoming.type === "novel_update" && incoming.referenceId && !incoming.actor.avatar) {
          if (authorAvatarCache.current.has(incoming.referenceId)) {
            incoming.actor.avatar = authorAvatarCache.current.get(incoming.referenceId);
          } else {
            try {
              const res = await fetch(`${API_BASE_URL}/novels/${incoming.referenceId}`);
              if (res.ok) {
                const nData = await res.json();
                const authorId = nData?.data?.novel?.author_id || nData?.novel?.author_id;
                if (authorId) {
                  const writerRes = await fetch(`${API_BASE_URL}/writer/${authorId}`);
                  if (writerRes.ok) {
                    const writerData = await writerRes.json();
                    const avatar = writerData?.data?.avatar_url || writerData?.avatar_url;
                    if (avatar) {
                      authorAvatarCache.current.set(incoming.referenceId, avatar);
                      incoming.actor.avatar = avatar;
                    }
                  }
                }
              }
            } catch {
              // ละเว้น
            }
          }
        }

        setItems((prev) =>
          prev.some((item) => item.id === incoming.id) ? prev : [incoming, ...prev]
        );
      } catch {
        // ignore heartbeat
      }
    };

    const handleNotificationsUpdate = () => {
      fetchNotifications();
    };

    window.addEventListener("notifications-updated", handleNotificationsUpdate);
    return () => {
      active = false;
      eventSource.close();
      window.removeEventListener("notifications-updated", handleNotificationsUpdate);
    };
  }, [reloadKey]);

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

  // ทำเครื่องหมายว่าอ่านแล้วสำหรับ 1 รายการ
  const markRead = async (id) => {
    try {
      await requestJson(`/notifications/${id}/read`, { method: "PATCH" });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("ทำเครื่องหมายว่าอ่านไม่สำเร็จ:", err);
    }
  };

  // คลิกเปิดการแจ้งเตือน
  const handleNotificationClick = async (notification) => {
    if (!notification) return;

    if (!notification.read) {
      await markRead(notification.id);
    }

    const refType = String(notification.referenceType || "").toLowerCase();
    const refId = notification.referenceId ?? null;
    const notifType = notification.type;

    try {
      // 1. นิยาย / ตอนใหม่ / คอมเมนต์ / ถูกใจ -> ไปหน้ารายละเอียดนิยาย
      if (
        notifType === "novel_update" ||
        notifType === "comment" ||
        notifType === "like" ||
        refType === "novel" ||
        refType === "chapter"
      ) {
        if (refId) {
          if (notifType === "comment") {
            navigate(`/novel/${refId}#comments`);
            return;
          }
          navigate(`/novel/${refId}`);
          return;
        }
      }

      // 2. ผู้ติดตาม -> ไปหน้าโปรไฟล์นักเขียน/ผู้ใช้
      if (notifType === "follower" || refType === "user") {
        const targetId = refId || notification.actor?.id;
        if (targetId) {
          navigate(`/writer/${targetId}/profile`);
          return;
        }
      }

      // 3. ระบบ -> ตรวจสอบบริบท
      if (notifType === "system" || refType === "system") {
        const text = `${notification.title || ""} ${notification.body || ""}`.toLowerCase();
        if (text.includes("อนุมัติเป็นนักเขียน") || text.includes("สมัครนักเขียน")) {
          navigate("/writer/dashboard");
          return;
        }
        if (refId) {
          navigate(`/novel/${refId}`);
          return;
        }
      }
    } catch (err) {
      console.error("การนำทางล้มเหลว:", err);
    }
  };

  // ทำเครื่องหมายว่าอ่านทั้งหมด
  const markAllRead = async () => {
    if (actionLoading || unreadCount === 0) return;
    setActionLoading("mark-all");
    try {
      await requestJson(`/notifications/read-all`, { method: "PATCH" });
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("อ่านทั้งหมดไม่สำเร็จ:", err);
    } finally {
      setActionLoading("");
    }
  };

  // ลบการแจ้งเตือน 1 รายการ
  const deleteNotification = async (id) => {
    if (!id || deletingNotificationId) return;
    setDeletingNotificationId(id);
    try {
      await requestJson(`/notifications/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("ลบการแจ้งเตือนไม่สำเร็จ:", err);
    } finally {
      setDeletingNotificationId(null);
    }
  };

  // ล้างการแจ้งเตือนทั้งหมด
  const confirmClearAll = async () => {
    if (actionLoading) return;
    setActionLoading("clear-all");
    try {
      await requestJson(`/notifications`, { method: "DELETE" });
      setItems([]);
      window.dispatchEvent(new Event("notifications-updated"));
    } catch (err) {
      console.error("ล้างการแจ้งเตือนทั้งหมดไม่สำเร็จ:", err);
    } finally {
      setActionLoading("");
      setShowClearConfirm(false);
    }
  };

  const handleManualReload = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="notification-page">
      {/* ================= HEADER (ต้นแบบตาม HistoryPage / BookshelfPage) ================= */}
      <div className="notification-page__sticky-header">
        <div className="notification-page__top">
          <div className="notification-page__heading">
            <button
              type="button"
              className="notification-page__back-btn"
              onClick={() => navigate(-1)}
              aria-label="ย้อนกลับ"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="notification-page__labels">
              <div className="notification-page__eyebrow">ศูนย์การแจ้งเตือน</div>
              <div className="notification-page__title">การแจ้งเตือนของคุณ</div>
            </div>
          </div>

          <div className="notification-page__top-actions">
            <div className="notification-page__count">
              {unreadCount > 0 ? `ยังไม่อ่าน ${unreadCount} รายการ` : "อ่านครบทุกรายการแล้ว"}
            </div>

            <div className="notification-page__actions-row">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notification-page__read-all-btn"
                  onClick={markAllRead}
                  disabled={actionLoading !== ""}
                  title="ทำเครื่องหมายว่าอ่านแล้วทั้งหมด"
                >
                  <CheckCheck size={14} />
                  {actionLoading === "mark-all" ? "กำลังอ่าน..." : "อ่านทั้งหมด"}
                </button>
              )}

              {items.length > 0 && (
                <button
                  type="button"
                  className="notification-page__delete-all-btn"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={actionLoading !== ""}
                  title="ล้างการแจ้งเตือนทั้งหมด"
                >
                  <Trash2 size={14} />
                  ล้างทั้งหมด
                </button>
              )}

              <button
                type="button"
                className="notification-page__settings-btn"
                onClick={() => navigate("/settings")}
                title="ตั้งค่าการแจ้งเตือน"
              >
                <Settings size={14} />
                ตั้งค่า
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ================= CONTAINER ================= */}
      <div className="notification-page__container">
        {/* ================= FILTER PILLS (ต้นแบบตาม HistoryPage / BookshelfPage) ================= */}
        <div className="notification-page__filters" role="tablist" aria-label="กรองประเภทการแจ้งเตือน">
          {activeTabs.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              className={`notification-page__filter-button ${tab === tabItem.key ? "active" : ""}`}
              role="tab"
              aria-selected={tab === tabItem.key}
              id={`notification-tab-${tabItem.key}`}
              aria-controls={`notification-panel-${tabItem.key}`}
              onClick={() => setTab(tabItem.key)}
            >
              {tabItem.label}
              <span className="notification-page__filter-count"> ({tabItem.count})</span>
            </button>
          ))}
        </div>

        {/* ================= CONTENT PANEL ================= */}
        <div
          id={`notification-panel-${tab}`}
          className="notification-page__panel"
          role="tabpanel"
          aria-labelledby={`notification-tab-${tab}`}
        >
          {isCurrentTabDisabled ? (
            <div className="notification-page__empty notification-page__empty--warning">
              <div className="notification-page__empty-icon notification-page__empty-icon--warning">
                <AlertCircle size={32} />
              </div>
              <div className="notification-page__empty-title">การแจ้งเตือนหมวดนี้ถูกปิดอยู่</div>
              <div className="notification-page__empty-desc">
                คุณได้ปิดการแจ้งเตือนนี้ไว้ในหน้าการตั้งค่า จึงไม่แสดงรายการใหม่ในหมวดนี้
              </div>
              <button
                type="button"
                className="notification-page__primary-btn"
                onClick={() => navigate("/settings")}
              >
                ไปที่หน้าตั้งค่า
              </button>
            </div>
          ) : (loading && items.length === 0) ? (
            <NotificationListSkeleton count={5} />
          ) : error ? (
            <div className="notification-page__empty notification-page__empty--error">
              <div className="notification-page__empty-icon notification-page__empty-icon--warning">
                <AlertCircle size={32} />
              </div>
              <div className="notification-page__empty-title">{error}</div>
              <div className="notification-page__empty-desc">
                กรุณาตรวจสอบการเชื่อมต่อของคุณ หรือลองโหลดใหม่อีกครั้ง
              </div>
              <button
                type="button"
                className="notification-page__primary-btn"
                onClick={handleManualReload}
              >
                ลองอีกครั้ง
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="notification-page__empty">
              <div className="notification-page__empty-icon">
                {tab === "unread" ? <CheckCheck size={32} /> : <BellOff size={32} />}
              </div>
              <div className="notification-page__empty-title">
                {tab === "unread"
                  ? "ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน"
                  : items.length > 0
                  ? "ไม่มีรายการแจ้งเตือนในหมวดนี้"
                  : "ยังไม่มีการแจ้งเตือน"}
              </div>
              <div className="notification-page__empty-desc">
                {items.length > 0
                  ? "ลองเลือกแท็บอื่น หรือดูการแจ้งเตือนทั้งหมด"
                  : "เมื่อมีการอัปเดตนิยาย คอมเมนต์ หรือกิจกรรมใหม่ๆ จะปรากฏที่นี่"}
              </div>
              {items.length > 0 ? (
                <button
                  type="button"
                  className="notification-page__filter-reset-btn"
                  onClick={() => setTab("all")}
                >
                  ดูทั้งหมด
                </button>
              ) : (
                <button
                  type="button"
                  className="notification-page__primary-btn"
                  onClick={() => navigate("/")}
                >
                  ไปสำรวจนิยาย
                </button>
              )}
            </div>
          ) : (
            <div className="notification-page__groups">
              {["วันนี้", "เมื่อวาน", "สัปดาห์นี้", "เก่ากว่านี้"]
                .filter((group) => grouped[group] && grouped[group].length > 0)
                .map((group) => (
                  <section key={group} className="notification-page__group">
                    <h3 className="notification-page__group-title">{group}</h3>
                    <div className="notification-page__list">
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
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ================= CONFIRM CLEAR ALL MODAL (ต้นแบบตาม HistoryPage) ================= */}
      {showClearConfirm && (
        <div
          className="notification-modal__overlay"
          onClick={() => !actionLoading && setShowClearConfirm(false)}
        >
          <div
            className="notification-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="notification-modal__close-btn"
              onClick={() => setShowClearConfirm(false)}
              disabled={actionLoading !== ""}
              aria-label="ปิด"
            >
              <X size={18} />
            </button>

            <div className="notification-modal__icon">
              <Trash2 size={24} />
            </div>

            <h2 id="clear-confirm-title" className="notification-modal__title">
              ล้างการแจ้งเตือนทั้งหมด?
            </h2>

            <div className="notification-modal__body">
              ต้องการล้างการแจ้งเตือนทั้งหมด {items.length} รายการใช่หรือไม่
              ข้อมูลจะถูกลบถาวรและไม่สามารถกู้คืนได้
            </div>

            <div className="notification-modal__actions">
              <button
                type="button"
                className="notification-modal__cancel-btn"
                ref={clearModalCancelRef}
                onClick={() => setShowClearConfirm(false)}
                disabled={actionLoading !== ""}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="notification-modal__confirm-btn"
                onClick={confirmClearAll}
                disabled={actionLoading !== ""}
              >
                {actionLoading === "clear-all" ? "กำลังล้าง..." : "ล้างทั้งหมด"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}