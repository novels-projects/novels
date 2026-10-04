import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import DOMPurify from "dompurify";
import {
  Pencil,
  Share2,
  BookOpen,
  Users,
  Eye,
  Bookmark,
  Calendar,
  Mail,
  Link as LinkIcon,
  Globe,
  ExternalLink,
  Heart
} from "lucide-react";
import FollowButton from "../../../components/FollowButton/FollowButton";
import GenreTag from "../../../components/GenreTag/GenreTag";
import AdminModeBanner from "../../../components/AdminModeBanner/AdminModeBanner";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import "./WriterProfile.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ฟังก์ชันแปลง Date เป็นแบบอ่านง่าย (เช่น "4 ต.ค. 2569")
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return "";
  }
}

// ปรับ MinIO URL ให้สามารถเปิดใน Browser Localhost ได้
const formatMinioUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  return url.replace('http://minio:9000', 'http://localhost:9000');
};

/**
 * parseContactInfo: แปลง contact_info ที่อาจมาในรูปแบบต่างๆ
 * คืนค่าเป็น object เสมอ { contact_required, contact_optional }
 */
function parseContactInfo(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return {};

  const s = raw.trim();
  if (!s) return {};

  if (s.startsWith("{") || s.startsWith("[")) {
    try { return JSON.parse(s); } catch (_) { }
  }

  try {
    const decoded = atob(s);
    if (decoded.startsWith("{") || decoded.startsWith("[")) {
      return JSON.parse(decoded);
    }
  } catch (_) { }

  return { contact_required: s };
}

export default function WriterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ------------------------------------------
  // States
  // ------------------------------------------
  const [writerInfo, setWriterInfo] = useState(null);
  const [novelsList, setNovelsList] = useState([]);
  const [totalViews, setTotalViews] = useState(0);
  const [bookshelfCount, setBookshelfCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [novelCount, setNovelCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [showEditModal, setShowEditModal] = useState(false);

  const checkIsAdmin = () => {
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        const r = (u?.role || u?.user_role || u?.role_name || "").toString().toLowerCase();
        if (r === "admin" || u?.is_admin === true || u?.isAdmin === true) return true;
      }
    } catch { }
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const parts = token.split(".");
        if (parts.length === 3) {
          let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          while (payload.length % 4) payload += "=";
          const decoded = atob(payload);
          const json = decodeURIComponent(decoded.split("").map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`).join(""));
          const parsed = JSON.parse(json);
          const r = (parsed?.role || parsed?.user_role || "").toString().toLowerCase();
          if (r === "admin" || parsed?.is_admin === true || parsed?.isAdmin === true) return true;
        }
      }
    } catch { }
    return false;
  };
  const isAdmin = checkIsAdmin();

  const getLoggedInUser = () => {
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) return JSON.parse(userJson);
    } catch (e) {
      console.error("Error parsing user from localStorage:", e);
    }
    return null;
  };

  useEffect(() => {
    let active = true;
    const currentUser = getLoggedInUser();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      try {
        let targetWriterId = id;
        let myWriterId = null;

        if (token) {
          try {
            const meRes = await fetch(`${API_BASE_URL}/api/writers/me`, { headers });
            if (meRes.ok) {
              const meData = await meRes.json();
              myWriterId = meData.writer_id || meData.data?.writer_id || null;
            }
          } catch (_) { }
        }

        if (!targetWriterId) {
          targetWriterId = myWriterId;
        }

        if (!targetWriterId) {
          targetWriterId = currentUser?.id || currentUser?.user_id;
        }

        if (!targetWriterId) {
          setError("ไม่พบข้อมูลนักเขียนที่ต้องการ");
          setLoading(false);
          return;
        }

        const writerRes = await fetch(`${API_BASE_URL}/writer/${targetWriterId}`, { headers });
        let writerData = null;
        if (writerRes.ok) {
          const resJson = await writerRes.json();
          writerData = resJson.data || resJson.writer || resJson;
        }

        if (!writerData) {
          throw new Error("ไม่พบข้อมูลนักเขียน");
        }

        let computedIsOwner = Boolean(
          myWriterId && String(myWriterId) === String(targetWriterId)
        );
        if (!computedIsOwner && currentUser && writerData) {
          const currentUserIdStr = String(currentUser.id || currentUser.user_id || "");
          const writerUserIdStr = String(writerData.user_id || writerData.userId || "");
          computedIsOwner = Boolean(
            currentUserIdStr && writerUserIdStr && currentUserIdStr === writerUserIdStr
          );
        }
        setIsOwner(computedIsOwner);

        let novelsArr = [];
        try {
          const novelsRes = await fetch(`${API_BASE_URL}/novels`, { headers });
          if (novelsRes.ok) {
            const nJson = await novelsRes.json();
            const rawList = nJson.novels || nJson.data?.novels || nJson.data || (Array.isArray(nJson) ? nJson : []);
            novelsArr = (Array.isArray(rawList) ? rawList : []).filter(
              n => String(n.author_id || n.authorId || n.user_id || n.userId) === String(targetWriterId)
            );
          }
        } catch (e) {
          console.warn("ดึงรายการนิยายล้มเหลว:", e);
        }

        let followingState = false;
        if (token && !computedIsOwner) {
          try {
            const followRes = await fetch(`${API_BASE_URL}/api/me/following-writers`, { headers });
            if (followRes.ok) {
              const fJson = await followRes.json();
              const followList = fJson.writers || fJson.data || (Array.isArray(fJson) ? fJson : []);
              followingState = (Array.isArray(followList) ? followList : []).some(
                w => String(w.id || w.writer_id) === String(targetWriterId)
              );
            }
          } catch (e) {
            console.warn("ดึงสถานะการติดตามล้มเหลว:", e);
          }
        }

        if (!active) return;

        const displayName = writerData.pen_name || writerData.name_lastname || writerData.username || `นักเขียน #${targetWriterId}`;
        const rawBio = writerData.bio || "";
        const sanitizedBio = rawBio ? DOMPurify.sanitize(rawBio) : "";
        const parsedContact = parseContactInfo(writerData.contact_info);
        const rawAvatar = writerData.avatar_url || writerData.pic_profile || writerData.avatarUrl || null;
        const avatarUrl = formatMinioUrl(rawAvatar) || `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(displayName)}`;
        const joinDateRaw = writerData.approved_at || writerData.applied_at || null;

        setWriterInfo({
          id: targetWriterId,
          userId: writerData.user_id || writerData.userId,
          name: displayName,
          username: writerData.username || null,
          emailWriter: writerData.email_writer || writerData.email || null,
          bio: sanitizedBio,
          contactInfo: parsedContact,
          avatarUrl: avatarUrl,
          joinedAt: joinDateRaw,
          role: writerData.role || "writer",
          categories: Array.isArray(writerData.categories) ? writerData.categories : [],
        });

        setTotalViews(writerData.total_view_count || 0);
        setBookshelfCount(writerData.total_bookshelf_count || 0);
        setFollowersCount(writerData.follower_count || 0);
        setNovelCount(writerData.novel_count ?? novelsArr.length);
        setNovelsList(novelsArr);
        setIsFollowing(followingState);

      } catch (err) {
        if (!active) return;
        console.error("โหลดข้อมูลโปรไฟล์นักเขียนล้มเหลว:", err);
        setError("ไม่สามารถโหลดข้อมูลโปรไฟล์นักเขียนได้ กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [id]);

  const formatNumber = (num = 0) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return String(num);
  };

  const filteredNovels = novelsList.filter((novel) => {
    const isCompleted = novel.status === "completed" || novel.is_completed === true;
    if (activeTab === "ongoing") return !isCompleted;
    if (activeTab === "completed") return isCompleted;
    return true;
  });

  const handleFollowChange = (newStatus) => {
    setIsFollowing(newStatus);
    setFollowersCount(prev => newStatus ? prev + 1 : Math.max(0, prev - 1));
  };

  if (loading) {
    return <LoadingScreen message="กำลังโหลดข้อมูลโปรไฟล์นักเขียน..." />;
  }

  if (error || !writerInfo) {
    return (
      <div className="profile-wrapper">
        <div className="profile-container">
          <div className="profile-error-card">
            <span className="profile-error-icon">⚠️</span>
            <h2>เกิดข้อผิดพลาด</h2>
            <p>{error || "ไม่พบข้อมูลโปรไฟล์นักเขียน"}</p>
            <button className="btn-back-home" onClick={() => navigate("/")}>
              🏠 กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  const contactObj = writerInfo.contactInfo || {};
  const contactReq = contactObj.contact_required || contactObj.primary_contact || "";
  const contactOpt = contactObj.contact_optional || contactObj.secondary_contact || "";
  const hasContactInfo = Boolean(writerInfo.emailWriter || contactReq || contactOpt);

  return (
    <div className="profile-wrapper" style={{ paddingTop: isAdmin ? 0 : undefined }}>
      {isAdmin && <AdminModeBanner page="โปรไฟล์นักเขียน" />}
      <div className="profile-container">
        {/* Back Button */}
        <div style={{ marginBottom: "12px", display: "flex", justifyContent: "flex-start" }}>
          <button
            type="button"
            className="profile-back-button"
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
          >
            ← ย้อนกลับ
          </button>
        </div>

        {/* ============================================================== */}
        {/* 1. Header Card (Dek-D / ReadAWrite Style) */}
        {/* ============================================================== */}
        <div className="profile-header-card">
          {(() => {
            const activeThemeId = localStorage.getItem(`profile_theme_${writerInfo.id}`) || "soft-pink";
            const foundTheme = BANNER_THEMES.find(t => t.id === activeThemeId);
            const bannerGradient = foundTheme ? foundTheme.gradient : BANNER_THEMES[0].gradient;
            return <div className="profile-header-banner" style={{ background: bannerGradient }}></div>;
          })()}

          <div className="profile-header-content">
            <div className="profile-avatar-wrapper">
              <img
                src={writerInfo.avatarUrl}
                alt={writerInfo.name}
                className="profile-avatar-img"
              />
              <span className="profile-badge-icon" title="นักเขียนได้รับการยืนยัน">✨</span>
            </div>

            <div className="profile-details">
              <div className="profile-title-row">
                <div className="profile-title-left">
                  <h1 className="profile-writer-name">{writerInfo.name}</h1>
                </div>

                <div className="profile-title-actions">
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        className="btn-edit-profile-pill"
                        onClick={() => setShowEditModal(true)}
                      >
                        <Pencil size={14} />
                        <span>แก้ไขโปรไฟล์</span>
                      </button>
                      <button
                        type="button"
                        className="btn-share-profile-pill"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          alert("คัดลอกลิงก์โปรไฟล์เรียบร้อยแล้วค่ะ! 🔗");
                        }}
                      >
                        <Share2 size={14} />
                        <span>แชร์</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {!isAdmin && (
                        <FollowButton
                          writerId={writerInfo.id}
                          writerName={writerInfo.name}
                          isFollowing={isFollowing}
                          onFollowChange={handleFollowChange}
                          size="small"
                        />
                      )}
                      <button
                        type="button"
                        className="btn-share-profile-pill"
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          alert("คัดลอกลิงก์โปรไฟล์เรียบร้อยแล้วค่ะ! 🔗");
                        }}
                      >
                        <Share2 size={14} />
                        <span>แชร์</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {writerInfo.username && (
                <p className="profile-writer-handle">@{writerInfo.username}</p>
              )}

              {/* หมวดหมู่ที่ถนัด (ข้อ 7: เพิ่มข้อความ "ประเภทนิยายที่แต่ง :" + ใช้สีเดียวกันหมด) */}
              {writerInfo.categories && writerInfo.categories.length > 0 && (
                <div className="profile-categories-row">
                  <span className="categories-prefix-label">ประเภทนิยายที่แต่ง :</span>
                  <div className="categories-tags">
                    {writerInfo.categories.map((cat, idx) => {
                      const catLabel = typeof cat === "object" ? cat.name : cat;
                      return (
                        <GenreTag
                          key={cat.category_id || idx}
                          label={catLabel}
                          colorByCategory={false}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bio (ประวัตินักเขียน) */}
              {writerInfo.bio && (
                <div
                  className="profile-writer-bio-rich"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(writerInfo.bio) }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 2. Statistics Section (การ์ดสถิติ ตามรูปที่ 1 เป้ะๆ) */}
        {/* ============================================================== */}
        <div className="profile-stats-grid">
          <div className="profile-stat-card stat-card--pink">
            <div className="stat-card-icon-badge stat-icon--pink">
              <BookOpen size={16} />
            </div>
            <div className="stat-card-body">
              <span className="stat-card-value">{novelCount}</span>
              <span className="stat-card-label">นิยายเผยแพร่</span>
            </div>
          </div>

          <div className="profile-stat-card stat-card--purple">
            <div className="stat-card-icon-badge stat-icon--purple">
              <Users size={16} />
            </div>
            <div className="stat-card-body">
              <span className="stat-card-value">{formatNumber(followersCount)}</span>
              <span className="stat-card-label">ผู้ติดตาม</span>
            </div>
          </div>

          <div className="profile-stat-card stat-card--blue">
            <div className="stat-card-icon-badge stat-icon--blue">
              <Eye size={16} />
            </div>
            <div className="stat-card-body">
              <span className="stat-card-value">{formatNumber(totalViews)}</span>
              <span className="stat-card-label">ยอดชมรวม</span>
            </div>
          </div>

          <div className="profile-stat-card stat-card--green">
            <div className="stat-card-icon-badge stat-icon--green">
              <Bookmark size={16} />
            </div>
            <div className="stat-card-body">
              <span className="stat-card-value">{formatNumber(bookshelfCount)}</span>
              <span className="stat-card-label">ถูกเก็บเข้าชั้น</span>
            </div>
          </div>

          {writerInfo.joinedAt && (
            <div className="profile-stat-card stat-card--amber">
              <div className="stat-card-icon-badge stat-icon--amber">
                <Calendar size={16} />
              </div>
              <div className="stat-card-body">
                <span className="stat-card-value">{formatDate(writerInfo.joinedAt)}</span>
                <span className="stat-card-label">เป็นนักเขียนเมื่อ</span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* 3. Contact Information Section (ช่องทางติดต่อแบบกะทัดรัด) */}
        {/* ============================================================== */}
        {hasContactInfo && (
          <div className="profile-contact-compact">
            <span className="contact-compact-label">ช่องทางติดต่อ :</span>
            <div className="contact-compact-items">
              {writerInfo.emailWriter && (
                <a href={`mailto:${writerInfo.emailWriter}`} className="contact-compact-chip">
                  <Mail size={13} />
                  <span>{writerInfo.emailWriter}</span>
                </a>
              )}

              {contactReq && (
                contactReq.startsWith("http") ? (
                  <a href={contactReq} target="_blank" rel="noopener noreferrer" className="contact-compact-chip">
                    <LinkIcon size={13} />
                    <span>{contactReq}</span>
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="contact-compact-chip text">
                    <LinkIcon size={13} />
                    <span>{contactReq}</span>
                  </span>
                )
              )}

              {contactOpt && (
                contactOpt.startsWith("http") ? (
                  <a href={contactOpt} target="_blank" rel="noopener noreferrer" className="contact-compact-chip">
                    <Globe size={13} />
                    <span>{contactOpt}</span>
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="contact-compact-chip text">
                    <Globe size={13} />
                    <span>{contactOpt}</span>
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. Works Section (ผลงานนิยาย รูปแบบการ์ดหมวดหมู่เป้ะๆ) */}
        {/* ============================================================== */}
        <div className="works-section">
          <div className="works-section-header">
            <div className="works-title-group">
              <h2 className="works-title">ผลงานนิยายทั้งหมด</h2>
              <span className="works-count-badge">{filteredNovels.length} เรื่อง</span>
            </div>

            <div className="profile-tabs" role="tablist" aria-label="กรองผลงานนิยาย">
              <button
                type="button"
                role="tab"
                className={`profile-tab-btn ${activeTab === "all" ? "active" : ""}`}
                aria-selected={activeTab === "all"}
                onClick={() => setActiveTab("all")}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                role="tab"
                className={`profile-tab-btn ${activeTab === "ongoing" ? "active" : ""}`}
                aria-selected={activeTab === "ongoing"}
                onClick={() => setActiveTab("ongoing")}
              >
                กำลังเขียน
              </button>
              <button
                type="button"
                role="tab"
                className={`profile-tab-btn ${activeTab === "completed" ? "active" : ""}`}
                aria-selected={activeTab === "completed"}
                onClick={() => setActiveTab("completed")}
              >
                จบแล้ว
              </button>
            </div>
          </div>

          {filteredNovels.length > 0 ? (
            <div className="novel-grid-layout">
              {filteredNovels.map((novel) => {
                const isCompleted = novel.status === "completed" || novel.is_completed === true;
                const coverUrl = formatMinioUrl(novel.cover_image || novel.coverImage || novel.cover);
                const novelTitle = novel.title || "ไม่มีชื่อเรื่อง";
                const authorName = novel.pen_name || novel.author_name || novel.authorName || writerInfo.name;
                const synopsisText = novel.captions || novel.introduction || novel.synopsis || "";

                const rawCats = novel.categories || novel.Categories || [];
                const catList = Array.isArray(rawCats)
                  ? rawCats.map(c => (typeof c === "object" ? c.name : c)).filter(Boolean)
                  : [];

                const views = novel.views || novel.view_count || novel.total_views || 0;
                const likes = novel.like_count || novel.likes || novel.total_likes || 0;
                const bookshelf = novel.bookshelf_count || novel.bookshelfCount || novel.saved_count || 0;

                return (
                  <div
                    key={novel.novel_id || novel.id}
                    className="novel-grid-card"
                    onClick={() => navigate(`/novel/${novel.novel_id || novel.id}`)}
                    role="link"
                    tabIndex={0}
                  >
                    <div className="novel-grid-cover">
                      {coverUrl ? (
                        <img src={coverUrl} alt={novelTitle} loading="lazy" />
                      ) : (
                        <div className="grid-cover-placeholder">📘</div>
                      )}
                      {isCompleted && (
                        <span className="card-status-tag finished">
                          จบแล้ว
                        </span>
                      )}
                    </div>

                    <div className="novel-grid-body">
                      <div className="novel-grid-tags">
                        {catList.slice(0, 2).map((cat, cIdx) => (
                          <span key={cIdx} className="grid-tag-item">{cat}</span>
                        ))}
                        {catList.length > 2 && (
                          <span className="grid-tag-item grid-tag-overflow">+{catList.length - 2}</span>
                        )}
                      </div>

                      <h3 className="novel-grid-title" title={novelTitle}>{novelTitle}</h3>

                      <div className="novel-grid-author">
                        <Pencil size={12} className="novel-author-icon" /> <span>{authorName}</span>
                      </div>

                      <p className="novel-grid-synopsis" title={synopsisText}>
                        {synopsisText}
                      </p>

                      <div className="novel-grid-stats">
                        <div className="novel-grid-stat-item" title="เพิ่มเข้าชั้น">
                          <Bookmark size={13} />
                          <span>{formatNumber(bookshelf)}</span>
                        </div>
                        <div className="novel-grid-stat-item" title="ยอดเข้าชม">
                          <Eye size={13} />
                          <span>{formatNumber(views)}</span>
                        </div>
                        <div className="novel-grid-stat-item" title="ยอดถูกใจ">
                          <Heart size={13} />
                          <span>{formatNumber(likes)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="profile-empty-works">
              <span className="empty-icon">📖</span>
              <h3>ไม่พบผลงานในหมวดหมู่นี้</h3>
              <p>นักเขียนยังไม่มีผลงานนิยายในหมวดหมู่ที่เลือกค่ะ</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal แก้ไขโปรไฟล์นักเขียน */}
      {showEditModal && (
        <EditProfileModal
          writerInfo={writerInfo}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------
// Presets Gradient Themes สำหรับโปรไฟล์
// ------------------------------------------
const BANNER_THEMES = [
  { id: "soft-pink", name: "Soft Pink", gradient: "linear-gradient(135deg, #fbcfe8 0%, #f472b6 50%, #ec4899 100%)" },
  { id: "sunset-blush", name: "Sunset Blush", gradient: "linear-gradient(135deg, #ffedd5 0%, #fb923c 50%, #f43f5e 100%)" },
  { id: "lavender-dream", name: "Lavender", gradient: "linear-gradient(135deg, #e0e7ff 0%, #c084fc 50%, #9333ea 100%)" },
  { id: "mint-breeze", name: "Mint", gradient: "linear-gradient(135deg, #ccfbf1 0%, #2dd4bf 50%, #0d9488 100%)" },
  { id: "midnight-romance", name: "Midnight Romance", gradient: "linear-gradient(135deg, #312e81 0%, #4c1d95 50%, #831843 100%)" },
];

// Component Modal สำหรับแก้ไขโปรไฟล์
function EditProfileModal({ writerInfo, onClose, onSuccess }) {
  const [penName, setPenName] = useState(writerInfo?.name || "");
  const [emailWriter, setEmailWriter] = useState(writerInfo?.emailWriter || "");
  const [bio, setBio] = useState(writerInfo?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(writerInfo?.avatarUrl || "");
  const [avatarPreview, setAvatarPreview] = useState(
    writerInfo?.avatarUrl ? formatMinioUrl(writerInfo.avatarUrl) : null
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(
    () => localStorage.getItem(`profile_theme_${writerInfo?.id}`) || "soft-pink"
  );

  // ช่องทางติดต่อตาม DB Schema — 2 ฟิลด์เท่านั้น
  const contactObj = writerInfo?.contactInfo || {};
  const [contactRequired, setContactRequired] = useState(
    contactObj.contact_required || contactObj.primary_contact || ""
  );
  const [contactOptional, setContactOptional] = useState(
    contactObj.contact_optional || contactObj.secondary_contact || ""
  );

  // หมวดหมู่ที่ถนัด
  const [allCategories, setAllCategories] = useState([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(
    () => (writerInfo?.categories || []).map(c => (typeof c === "object" ? c.category_id : c))
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Toolbar สมบูรณ์สำหรับ ReactQuill (Heading H1-H3, Font Size, Bold, Italic, Underline, Text Color, Bullet List, Ordered List, Link)
  const QUILL_MODULES = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      [{ size: ["small", false, "large", "huge"] }],
      ["bold", "italic", "underline"],
      [{ color: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link"],
      ["clean"],
    ],
  };

  const QUILL_FORMATS = [
    "header",
    "size",
    "bold",
    "italic",
    "underline",
    "color",
    "list",
    "bullet",
    "link",
  ];

  // โหลดรายการหมวดหมู่ทั้งหมดจาก Backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/categories`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        const list = Array.isArray(data) ? data : (data.categories || data.data || []);
        setAllCategories(list);
      })
      .catch(err => console.warn("โหลดหมวดหมู่ล้มเหลว:", err));
  }, []);

  // อัปโหลดรูป Avatar เข้า MinIO (Preview ทันทีที่เลือกไฟล์)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    setUploadingImage(true);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/upload/image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const raw = await res.text();
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง: " + raw.slice(0, 120));
      }

      if (!res.ok) {
        throw new Error(json?.message || json?.error?.message || "อัปโหลดรูปภาพไม่สำเร็จ");
      }

      const uploadedUrl =
        json?.data?.full_url ||
        json?.data?.saved_path ||
        json?.full_url ||
        json?.url;

      if (uploadedUrl) {
        setAvatarUrl(uploadedUrl);
        setAvatarPreview(formatMinioUrl(uploadedUrl) || localPreview);
      }
    } catch (err) {
      console.error("Upload Error:", err);
      setErrorMsg("อัปโหลดรูปภาพไม่สำเร็จ: " + err.message);
      setAvatarPreview(writerInfo?.avatarUrl ? formatMinioUrl(writerInfo.avatarUrl) : null);
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleCategory = (catId) => {
    setSelectedCategoryIds(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  // บันทึกข้อมูลโปรไฟล์
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!penName.trim()) {
      setErrorMsg("กรุณากรอก นามปากกา ค่ะ");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const payload = {
      pen_name: penName?.trim() || "",
      email_writer: emailWriter?.trim() || "",
      bio: bio || "",
      avatar_url: avatarUrl || "",
      category_ids: Array.isArray(selectedCategoryIds) ? selectedCategoryIds : [],

      // รวบฟิลด์ติดต่อให้อยู่ในรูปแบบ Object ตามที่ Backend คาดหวัง
      contact_info: {
        ...(contactRequired?.trim() ? { contact_required: contactRequired.trim() } : {}),
        ...(contactOptional?.trim() ? { contact_optional: contactOptional.trim() } : {}),
      },
    };

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/writers/me/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let json;
      try { json = JSON.parse(raw); } catch { json = {}; }

      if (!res.ok) {
        throw new Error(json?.message || json?.error?.message || "บันทึกข้อมูลไม่สำเร็จ");
      }

      localStorage.setItem(`profile_theme_${writerInfo?.id}`, selectedTheme);
      onSuccess();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
    } finally {
      setSaving(false);
    }
  };

  const currentAvatarSrc =
    avatarPreview ||
    `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(writerInfo?.name || "writer")}`;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="edit-profile-modal">

        {/* Header */}
        <div className="modal-header">
          <h2>แก้ไขโปรไฟล์</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="ปิด">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMsg && <div className="modal-error-banner">⚠️ {errorMsg}</div>}

          {/* 1. รูปโปรไฟล์ */}
          <section className="form-section">
            <p className="form-section-label">รูปโปรไฟล์</p>
            <div className="avatar-edit-row">
              <img src={currentAvatarSrc} alt="รูปโปรไฟล์" className="avatar-preview-img" />
              <label className={`avatar-upload-label ${uploadingImage ? "loading" : ""}`}>
                {uploadingImage ? "กำลังอัปโหลด..." : "เลือกรูปใหม่"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  hidden
                />
              </label>
            </div>
          </section>

          <div className="form-divider" />

          {/* 2. ข้อมูลพื้นฐาน */}
          <section className="form-section">
            <p className="form-section-label">ข้อมูลพื้นฐาน</p>
            <div className="form-group">
              <label className="form-label">
                นามปากกา <span className="required-mark">*</span>
              </label>
              <input
                type="text"
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                placeholder="ชื่อที่แสดงบนหน้าโปรไฟล์ของคุณ"
                className="form-control-input"
                required
              />
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label className="form-label">อีเมลสำหรับติดต่อ</label>
              <input
                type="email"
                value={emailWriter}
                onChange={(e) => setEmailWriter(e.target.value)}
                placeholder="email@example.com"
                className="form-control-input"
              />
            </div>
          </section>

          <div className="form-divider" />

          {/* 3. แนะนำตัว (Bio) — ReactQuill Toolbar สมบูรณ์ */}
          <section className="form-section">
            <p className="form-section-label">แนะนำตัว (Bio)</p>
            <div className="quill-wrapper">
              <ReactQuill
                theme="snow"
                value={bio}
                onChange={setBio}
                modules={QUILL_MODULES}
                formats={QUILL_FORMATS}
                placeholder="เขียนแนะนำตัวสั้นๆ ให้ผู้อ่านรู้จักคุณ..."
              />
            </div>
          </section>

          <div className="form-divider" />

          {/* 4. หมวดหมู่ที่ถนัด */}
          {allCategories.length > 0 && (
            <section className="form-section">
              <p className="form-section-label">หมวดหมู่ที่ถนัด</p>
              <div className="category-chips">
                {allCategories.map((cat) => {
                  const id = cat.category_id || cat.id;
                  const selected = selectedCategoryIds.includes(id);
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`chip-btn ${selected ? "chip-selected" : ""}`}
                      onClick={() => toggleCategory(id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="form-divider" />

          {/* 5. ธีมสีแบนเนอร์ — Color Swatches */}
          <section className="form-section">
            <p className="form-section-label">ธีมสีแบนเนอร์</p>
            <div className="theme-swatches">
              {BANNER_THEMES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  title={t.name}
                  className={`swatch-btn ${selectedTheme === t.id ? "swatch-active" : ""}`}
                  style={{ background: t.gradient }}
                  onClick={() => setSelectedTheme(t.id)}
                />
              ))}
            </div>
            <p className="theme-selected-label">
              {BANNER_THEMES.find((t) => t.id === selectedTheme)?.name}
            </p>
          </section>

          <div className="form-divider" />

          {/* 6. ช่องทางติดต่อ — 2 ฟิลด์ตาม DB Schema เดิม */}
          <section className="form-section">
            <p className="form-section-label">ช่องทางติดต่อ</p>
            <div className="form-group">
              <label className="form-label">ช่องทางติดต่อหลัก</label>
              <input
                type="text"
                value={contactRequired}
                onChange={(e) => setContactRequired(e.target.value)}
                placeholder="เช่น facebook.com/yourpage หรือ @yourhandle"
                className="form-control-input"
                />
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label className="form-label">ช่องทางติดต่อเพิ่มเติม</label>
              <input
                type="text"
                value={contactOptional}
                onChange={(e) => setContactOptional(e.target.value)}
                placeholder="ช่องทางสำรอง (ถ้ามี)"
                className="form-control-input"
              />
            </div>
          </section>

          {/* ปุ่มบันทึก */}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
              ยกเลิก
            </button>
            <button type="submit" className="btn-save-profile" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}