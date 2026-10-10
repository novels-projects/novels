// ⚠️ รอการแก้ไขโค้ดเรื่อง Backend PUT /novels/:id ล้างสถานะการถูกระงับ (suspended) เมื่อผู้เขียนแก้ไขรูปปกหรือข้อมูลนิยาย
import React, { useState, useEffect, useCallback } from "react";
import "./WriterDashboardPage.css";
import { getNovelStatusInfo, registerBannedNovel, cleanBanReason, extractBanDetails, getBannedRegistry, getCardBanReason } from "../../../utils/novelStatus";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import { ShieldAlert, X, Layers, FileText, Pencil, BarChart2, Library, Book, Heart, Eye, Bookmark } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const fmt = (n) => {
  if (!n || isNaN(n)) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
};

const formatCoverUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  let formatted = url.replace("http://minio:9000", "http://localhost:9000");
  if (formatted.startsWith("/uploads/") || formatted.startsWith("/static/")) {
    formatted = `${API_BASE_URL}${formatted}`;
  }
  return formatted;
};

const STAT_CARDS = [
  { key: "totalNovels", label: "นิยายทั้งหมด", icon: <Book size={24} strokeWidth={2.2} />, colorClass: "scard--pink" },
  { key: "totalLikes", label: "จำนวนการกดถูกใจ", icon: <Heart size={24} strokeWidth={2.2} />, colorClass: "scard--purple" },
  { key: "totalViews", label: "ยอดเข้าชมทั้งหมด", icon: <Eye size={24} strokeWidth={2.2} />, colorClass: "scard--blue" },
  { key: "totalBookmarks", label: "จำนวนเพิ่มเข้าชั้น", icon: <Bookmark size={24} strokeWidth={2.2} />, colorClass: "scard--green" },
];

const isSuspendedNovel = (novel) => {
  if (!novel) return false;
  return getNovelStatusInfo(novel).isBanned;
};

const WriterDashboardPage = ({ onNavigate, onSelectNovel }) => {
  const [stats, setStats] = useState({
    totalNovels: 0,
    totalLikes: 0,
    totalViews: 0,
    totalBookmarks: 0,
  });
  const [novels, setNovels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuspendedModal, setShowSuspendedModal] = useState(false);
  
  const buildAuthHeaders = () => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = buildAuthHeaders();
      if (!headers) throw new Error("กรุณาเข้าสู่ระบบก่อนดูแดชบอร์ดนักเขียน");

      const response = await fetch(`${API_BASE_URL}/api/me/novels`, { headers });
      
      if (!response.ok) {
        if (response.status === 401) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
        throw new Error("ไม่สามารถดึงข้อมูลนิยายได้");
      }

      const result = await response.json();
      let fetchedNovels = result?.novels || result?.data?.novels || [];
      
      if (Array.isArray(fetchedNovels)) {
        fetchedNovels.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0);
          const dateB = new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      let calculatedLikes = 0;
      let calculatedViews = 0;
      let calculatedBookmarks = 0;

      if (Array.isArray(fetchedNovels)) {
        fetchedNovels.forEach(novel => {
          const statusInfo = getNovelStatusInfo(novel);
          if (statusInfo.isBanned) {
            registerBannedNovel(novel.id || novel.novel_id, novel);
          }
          calculatedViews += novel.total_views ?? novel.view_count ?? novel.stats?.views ?? novel.views ?? 0;
          calculatedLikes += novel.total_likes ?? novel.like_count ?? novel.stats?.likes ?? novel.likes ?? 0;
          calculatedBookmarks += novel.total_bookmarks ?? novel.bookmark_count ?? novel.bookshelf_count ?? novel.stats?.bookmarks ?? novel.bookmarks ?? 0;
        });
      }

      setStats({
        totalNovels: fetchedNovels.length,
        totalLikes: calculatedLikes,
        totalViews: calculatedViews,
        totalBookmarks: calculatedBookmarks,
      });
      
      setNovels(Array.isArray(fetchedNovels) ? fetchedNovels : []);
    } catch (err) {
      console.error("Fetch dashboard error:", err);
      setError(err instanceof Error ? err.message : "ไม่สามารถเชื่อมต่อกับระบบหลังบ้านได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleDeleteNovel = async (novelId) => {
    try {
      const headers = buildAuthHeaders();
      if (!headers) throw new Error("กรุณาเข้าสู่ระบบก่อนลบนิยาย");

      const response = await fetch(`${API_BASE_URL}/novels/${novelId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        const errResult = await response.json().catch(() => null);
        throw new Error(errResult?.error || "Failed to delete novel");
      }

      fetchDashboardData();
    } catch (err) {
      console.error("Delete novel error:", err);
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบนิยาย");
    }
  };

  const handleEdit = (novelObj) => {
    localStorage.setItem("selectedNovel", JSON.stringify(novelObj));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("novel-selected"));
    const id = novelObj.id || novelObj.novel_id;
    onNavigate("chapters", { novelId: id });
  };

  const handleTree = (novelObj) => {
    localStorage.setItem("selectedNovel", JSON.stringify(novelObj));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("novel-selected"));
    const id = novelObj.id || novelObj.novel_id;
    onNavigate("story-tree", { novelId: id });
  };

  const handleAnalytics = (novelObj) => {
    localStorage.setItem("selectedNovel", JSON.stringify(novelObj));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("novel-selected"));
    const id = novelObj.id || novelObj.novel_id;
    onNavigate("analytics", { novelId: id });
  };

  if (loading) {
    return <LoadingScreen message="กำลังดึงข้อมูลแดชบอร์ดนักเขียน..." />;
  }

  const suspendedNovels = novels.filter(isSuspendedNovel);

  const handleContinueSuspension = () => {
    if (suspendedNovels.length === 1) {
      handleEdit(suspendedNovels[0]);
    } else if (suspendedNovels.length > 1) {
      setShowSuspendedModal(true);
    }
  };

  const filteredNovels = novels.filter(novel => {
    const title = novel.title || novel.Title || "";
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="wdb-page">
      <div className="wdb">
      <div className="wdb__header">
        <div>
          <h1 className="wdb__title">แดชบอร์ด</h1>
          <p className="wdb__sub">ภาพรวมผลงานของคุณทั้งหมด</p>
        </div>
        <button className="wdb__create-btn" onClick={() => onNavigate("create-novel")} aria-label="สร้างนิยายเรื่องใหม่">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          สร้างนิยายใหม่
        </button>
      </div>

      {/* 🔴 แถบแจ้งเตือนเมื่อมีนิยายถูกระงับ (ตามรูปที่ 1) */}
      {suspendedNovels.length > 0 && (
        <div className="wdb-ban-alert-banner" role="alert">
          <div className="wdb-ban-alert-banner__left">
            <div className="wdb-ban-alert-banner__icon-box">
              <ShieldAlert size={22} className="wdb-ban-alert-banner__shield-icon" />
            </div>
            <div className="wdb-ban-alert-banner__content">
              <h3 className="wdb-ban-alert-banner__title">
                มี {suspendedNovels.length} นิยายถูกระงับ ต้องดำเนินการ
              </h3>
              <p className="wdb-ban-alert-banner__sub">
                ตรวจสอบและยื่นคำขอปลดแบนเพื่อกลับมาเผยแพร่
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="wdb-ban-alert-banner__btn"
            onClick={handleContinueSuspension}
          >
            ดำเนินการต่อ <span>→</span>
          </button>
        </div>
      )}

      {error && (
        <div className="wdb__error-banner" style={{ background: "#FEE2E2", color: "#DC2626", padding: "12px", borderRadius: "8px", marginBottom: "20px", textAlign: "center" }}>
          {error}
        </div>
      )}

      <div className="wdb__stats">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className={`scard ${card.colorClass}`}>
            <span className="scard__icon">{card.icon}</span>
            <div className="scard__val">{fmt(stats[card.key])}</div>
            <div className="scard__label">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="wdb__novels-header">
        <div>
          <h2 className="wdb__novels-title">นิยายของฉัน</h2>
          <p className="wdb__novels-count">{filteredNovels.length} เรื่องที่พบ (เรียงตามอัปเดตล่าสุด)</p>
        </div>
        
        <div className="wdb__search">
          <svg className="wdb__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="wdb__search-input"
            placeholder="ค้นหาชื่อนิยาย..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="wdb__grid">
        {filteredNovels.length > 0 ? (
          <>
            {filteredNovels.map((novel) => {
              const id = novel.id || novel.novel_id;
              return (
                <NovelCard
                  key={id}
                  novel={novel}
                  onEdit={() => handleEdit(novel)}
                  onTree={() => handleTree(novel)}
                  onAnalytics={() => handleAnalytics(novel)}
                  onDelete={() => handleDeleteNovel(id)}
                />
              );
            })}
            {!searchQuery && (
              <button className="wdb__empty-card" onClick={() => onNavigate("create-novel")} aria-label="สร้างนิยายใหม่">
                <span className="wdb__empty-icon">✦</span>
                <span className="wdb__empty-label">สร้างนิยายใหม่</span>
                <span className="wdb__empty-sub">เริ่มเรื่องราวใหม่ของคุณ</span>
              </button>
            )}
          </>
        ) : (
          novels.length === 0 && !searchQuery ? (
            <div className="wdb__empty-container" style={{ gridColumn: "1 / -1" }}>
              <div className="wdb__empty-icon-box">
                <Library size={38} strokeWidth={2.2} className="wdb__empty-icon-svg" />
              </div>
              <h3 className="wdb__empty-title">ยังไม่มีนิยาย</h3>
              <p className="wdb__empty-sub">เริ่มสร้างนิยายเรื่องแรกของคุณได้เลย</p>
              <button 
                type="button" 
                className="wdb__empty-create-btn" 
                onClick={() => onNavigate("create-novel")}
                aria-label="สร้างนิยายใหม่"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>สร้างนิยายใหม่</span>
              </button>
            </div>
          ) : (
            <div className="wdb__empty-search" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "var(--gray-500)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "2rem" }}>🔍</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--gray-800)", fontFamily: "'Sarabun', sans-serif" }}>ไม่พบนิยายที่ตรงกับ "{searchQuery}"</strong>
              <span style={{ fontSize: "0.9rem", color: "var(--gray-500)", fontFamily: "'Sarabun', sans-serif" }}>กรุณาลองระบุคำค้นหาใหม่อีกครั้ง</span>
            </div>
          )
        )}
      </div>

      {/* 🔴 Modal เลือกลิสต์นิยายที่ถูกระงับเมื่อมีหลายเรื่อง */}
      {showSuspendedModal && suspendedNovels.length > 1 && (
        <div className="cm-modal-overlay" onClick={() => setShowSuspendedModal(false)}>
          <div className="wdb-suspended-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wdb-suspended-modal__header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="wdb-ban-alert-banner__icon-box" style={{ width: 36, height: 36 }}>
                  <ShieldAlert size={18} className="wdb-ban-alert-banner__shield-icon" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>นิยายที่ถูกระงับ ({suspendedNovels.length} เรื่อง)</h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>เลือกนิยายที่ต้องการตรวจสอบและยื่นคำขอปลดแบน</p>
                </div>
              </div>
              <button type="button" className="wdb-suspended-modal__close" onClick={() => setShowSuspendedModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="wdb-suspended-modal__list">
              {suspendedNovels.map((sn) => (
                <div key={sn.id || sn.novel_id} className="wdb-suspended-item">
                  <div className="wdb-suspended-item__info">
                    <strong className="wdb-suspended-item__title">{sn.title || sn.Title}</strong>
                    <span className="wdb-suspended-item__reason">
                      สาเหตุการระงับ: {cleanBanReason(sn.ban_reason || sn.banReason || sn.reason)}
                    </span>
                    {(() => {
                      const regData = getBannedRegistry()[String(sn.id || sn.novel_id)] || {};
                      const adminDetails = extractBanDetails(sn.ban_reason || sn.banReason || sn.reason, sn.ban_details || sn.banDetails || sn.details || regData.details);
                      if (!adminDetails) return null;
                      return (
                        <span className="wdb-suspended-item__details" style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "12.5px" }}>
                          <strong>เหตุผล/รายละเอียดเพิ่มเติมจากแอดมิน:</strong> {adminDetails}
                        </span>
                      );
                    })()}
                  </div>
                  <button 
                    type="button" 
                    className="wdb-suspended-item__btn"
                    onClick={() => {
                      setShowSuspendedModal(false);
                      handleEdit(sn);
                    }}
                  >
                    จัดการเรื่องนี้ →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

const NovelCard = ({ novel, onEdit, onTree, onAnalytics, onDelete }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const title = novel.title || "";
  const coverImage = novel.cover_image || novel.coverImage || novel.cover_url || novel.coverUrl || novel.cover;
  const statusInfo = getNovelStatusInfo(novel);
  const isSuspended = statusInfo.isBanned;
  const statusVariant = statusInfo.isCompleted ? "completed" : statusInfo.isPublished ? "published" : "draft";
  const status = statusVariant;
  
  const isPublishedNovel = status === "published" || statusInfo.isPublished;

  const categoryList = novel.categories || novel.Categories || [];
  const parsedCategories = Array.isArray(categoryList)
    ? categoryList.map(c => c.name || c.Name).filter(Boolean)
    : [];

  const maxDisplay = 2;
  const visibleCategories = parsedCategories.slice(0, maxDisplay);
  const remainingCount = parsedCategories.length - maxDisplay;

  const chapterCount = novel.total_chapters ?? novel.chapter_count ?? novel.chapterCount ?? 0;
  const sceneCount = novel.total_scenes ?? novel.scene_count ?? novel.sceneCount ?? 0;

  const getUpdatedText = (rawDate) => {
    if (!rawDate) return "ไม่มีการอัปเดต";
    try {
      const normalizedRawDate = String(rawDate).replace(" ", "T");
      const dateObj = new Date(normalizedRawDate);
      if (Number.isNaN(dateObj.getTime())) return "ไม่มีการอัปเดต";

      const now = new Date();
      const diffMs = now - dateObj;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 60) return `อัปเดตล่าสุด ${diffMins === 0 ? "เมื่อสักครู่" : diffMins + " นาทีที่แล้ว"}`;
      if (diffHours < 24) return `อัปเดตล่าสุด ${diffHours} ชั่วโมงที่แล้ว`;
      if (diffDays < 7) return `อัปเดตล่าสุด ${diffDays} วันที่แล้ว`;

      const formattedDate = dateObj.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `แก้ไขล่าสุด ${formattedDate}`;
    } catch (e) {
      return "ไม่มีการอัปเดต";
    }
  };

  const updatedAtText = getUpdatedText(novel.updated_at || novel.updatedAt || novel.created_at || novel.createdAt);

  const handleCloseConfirm = () => {
    setShowConfirm(false);
    setDeleteConfirmText("");
  };

  return (
    <article className="nvc" onClick={onEdit}>
      {/* ── Cover Zone ── */}
      <div className="nvc__cover">
        {coverImage ? (
          <img 
            src={formatCoverUrl(coverImage)} 
            alt={`ปกนิยายเรื่อง ${title}`}
            className="nvc__cover-img"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        {/* 🟢 เช็กสถานะถูกระงับ ให้แสดง Badge สีแดง */}
        {isSuspended ? (
          <span className="nvc__status" style={{ backgroundColor: "#ef4444", color: "#ffffff" }}>
            ⚠️ ถูกระงับการเผยแพร่
          </span>
        ) : (
          <span className={`nvc__status ${status === "published" ? "nvc__status--pub" : status === "completed" ? "nvc__status--completed" : "nvc__status--draft"}`}>
            {statusInfo.mode === "completed-published" ? "จบแล้ว • เผยแพร่" : statusInfo.mode === "completed-draft" ? "จบแล้ว • ฉบับร่าง" : status === "published" ? "เผยแพร่" : "ฉบับร่าง"}
          </span>
        )}

        {/* ปุ่มลบ */}
        <button className="nvc__cover-del" onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }} title="ลบนิยาย">
          ✕
        </button>
      </div>

      {/* ── Body Zone ── */}
      <div className="nvc__body">
        <div className="nvc__header-info">
          <h3 className="nvc__title" title={title}>{title}</h3>
          <p className="nvc__date">{updatedAtText}</p>
        </div>
        
        <div className="nvc__story-stats">
          <span>
            <Layers size={13} className="nvc__stat-icon" /> {chapterCount} ตอน
          </span>
          <span>
            <FileText size={13} className="nvc__stat-icon" /> {sceneCount} ฉาก
          </span>
        </div>
        
        <div className="nvc__categories-row">
          {visibleCategories.length > 0 ? (
            visibleCategories.map((catName, idx) => (
              <span key={idx} className="nvc__tag">{catName}</span>
            ))
          ) : (
            <span style={{ fontSize: "10px", color: "#9ca3af", fontStyle: "italic" }}>#ไม่มีหมวดหมู่</span>
          )}
        </div>

        {isSuspended ? (
          (() => {
            const regData = getBannedRegistry()[String(novel.id || novel.novel_id)] || {};
            const rawReason = novel.ban_reason || novel.banReason || novel.reason || regData.reason;
            const explicitDetails = novel.ban_details || novel.banDetails || novel.details || regData.details;
            const cardReason = getCardBanReason(rawReason, explicitDetails);
            return (
              <div className="nvc__banned-actions">
                <div 
                  className="nvc__banned-reason-box" 
                  title={`สาเหตุ: ${cardReason}`}
                >
                  <span className="nvc__banned-reason-text">
                    ⚠️ สาเหตุ: {cardReason}
                  </span>
                </div>
                <button 
                  type="button" 
                  className="nvc__banned-appeal-btn" 
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                  ยื่นคำขอปลดระงับ <span>→</span>
                </button>
              </div>
            );
          })()
        ) : (
          <div className="nvc__actions">
            <button className="nvc__btn nvc__btn--edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil size={13} strokeWidth={2.4} />
              <span>แก้ไข</span>
            </button>
            <button className="nvc__btn nvc__btn--stats" onClick={(e) => { e.stopPropagation(); onAnalytics(); }}>
              <BarChart2 size={14} strokeWidth={2.2} />
              <span>สถิติ</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm overlay */}
      {showConfirm && (
        <div className="nvc__confirm" onClick={(e) => e.stopPropagation()}>
          {isPublishedNovel ? (
            <>
              <p className="nvc__confirm-text nvc__confirm-text--warning">
                ⚠️ นิยายเรื่องนี้เผยแพร่แล้ว!
              </p>
              <p className="nvc__confirm-sub">
                ข้อมูลและยอดคนอ่านทั้งหมดจะหายไปอย่างถาวร
              </p>
              <input
                type="text"
                className="nvc__confirm-input"
                placeholder='พิมพ์คำว่า "ลบ" เพื่อยืนยัน'
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </>
          ) : (
            <p className="nvc__confirm-text">ต้องการลบนิยายเรื่องนี้หรือไม่?</p>
          )}

          <div className="nvc__confirm-btns">
            <button 
              type="button"
              className="nvc__confirm-yes" 
              disabled={isPublishedNovel && deleteConfirmText !== "ลบ"}
              onClick={() => { 
                handleCloseConfirm(); 
                onDelete(); 
              }}
            >
              ยืนยัน
            </button>
            <button 
              type="button"
              className="nvc__confirm-no" 
              onClick={handleCloseConfirm}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

export default WriterDashboardPage;