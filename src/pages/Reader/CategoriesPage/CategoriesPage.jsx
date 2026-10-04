import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { getNovelStatusInfo } from "../../../utils/novelStatus";
import { Eye, Heart, Bookmark, Pencil } from "lucide-react";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import "./CategoriesPage.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const formatNumber = (num) => {
  if (!num) return 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M+";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k+";
  return num;
};

// เดิม hardcode "http://minio:9000" -> "http://localhost:9000" ไว้ตรงๆ ในโค้ด
// (พังทันทีถ้า deploy จริงหรือเปลี่ยน infra) ย้ายมาตั้งผ่าน env แทน — ค่า default ยังเหมือนเดิมทุกอย่าง
const MEDIA_INTERNAL_HOST = import.meta.env.VITE_MEDIA_INTERNAL_HOST || "http://minio:9000";
const MEDIA_PUBLIC_HOST = import.meta.env.VITE_MEDIA_PUBLIC_HOST || "http://localhost:9000";

function resolveCoverUrl(url) {
  if (!url) return null;
  return url.replace(MEDIA_INTERNAL_HOST, MEDIA_PUBLIC_HOST);
}



const normalizeNovel = (data) => {
  const rawCats = data.categories ?? data.Categories ?? data.category_ids ?? data.CategoryIDs ?? [];
  const statusInfo = getNovelStatusInfo(data);

  const cleanCategories = Array.isArray(rawCats) 
    ? rawCats.map(c => {
        if (!c) return "";
        if (typeof c === "string") return c.trim();
        return String(c.name || c.Title || c.title || c.label || "").trim();
      }).filter(Boolean) 
    : [];
    
  const uniqueCategories = [...new Set(cleanCategories)];

  return {
    id: data.id || data.novel_id,
    title: data.title || "ไม่มีชื่อเรื่อง",
    categories: uniqueCategories,
    coverImage: data.cover_image || data.coverImage || null,
    synopsis: data.captions || data.introduction || data.description || "",
    author: data.pen_name || data.penName || data.author_pen_name || data.author_penName || data.author_name || data.authorName || "ไม่ทราบผู้แต่ง",
    stats: {
      views: data.views || data.view_count || 0,
      likes: data.like_count || data.likes || 0,
      chaptersCount: data.chapters_count ?? data.chaptersCount ?? (data.chapters ? data.chapters.length : 0),
      bookshelfCount: data.bookshelf_count || data.bookshelfCount || data.saved_count || data.added_count || 0,
    },
    status: data.status || "draft",
    // isPublished = เผยแพร่ให้อ่านได้หรือยัง, isCompleted = แต่งจบเรื่องหรือยัง — คนละแกนกัน ห้ามใช้แทนกัน
    isPublished: statusInfo.isPublished,
    isCompleted: statusInfo.isCompleted,
  };
};

const CategoriesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ดึงคำค้นหาเริ่มต้นจาก URL Query (?search=...)
  const getSearchFromUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    return params.get("search") || "";
  }, [location.search]);

  const [categories, setCategories] = useState([]);
  const [novels, setNovels] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState(getSearchFromUrl());
  
  // ตัวกรองสถานะนิยายและตัวกรองข้อมูล
  const [statusFilter, setStatusFilter] = useState("all"); 
  const [sortBy, setSortBy] = useState("popular"); 
  const [viewMode, setViewMode] = useState("grid"); 
  
  // การแบ่งหน้า
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // เปลี่ยนแปลงคำค้นหาตาม URL
  useEffect(() => {
    setSearchQuery(getSearchFromUrl());
  }, [location.search, getSearchFromUrl]);

  // จัดการฟัง Event การค้นหาเรียลไทม์
  useEffect(() => {
    const handleSearchChange = (e) => {
      if (e.detail !== undefined) {
        setSearchQuery(e.detail);
        setCurrentPage(1);
      }
    };
    window.addEventListener("search-change", handleSearchChange);
    return () => window.removeEventListener("search-change", handleSearchChange);
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, novelRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/categories`),
        axios.get(`${API_BASE_URL}/novels`),
      ]);

      const catData = catRes.data?.data || catRes.data || [];
      const novelData = novelRes.data?.data?.novels
                     || novelRes.data?.novels
                     || novelRes.data?.data
                     || novelRes.data
                     || [];

      const allNovels = Array.isArray(novelData) ? novelData.map(normalizeNovel) : [];
      const publishedNovels = allNovels.filter(n => n.isPublished);

      const dbCats = Array.isArray(catData)
        ? catData.map(c => ({ id: c.category_id || c.id, name: String(c.name || c.title || "").trim() }))
        : [];

      // คำนวณนิยายต่อนั้นๆ
      const counts = {};
      publishedNovels.forEach(novel => {
        novel.categories.forEach(name => {
          counts[name] = (counts[name] || 0) + 1;
        });
      });

      const mergedCats = dbCats.map(c => ({
        ...c,
        count: counts[c.name] || 0
      }));

      setNovels(publishedNovels);
      setCategories(mergedCats);
    } catch (err) {
      console.error(err);
      setError("ไม่สามารถโหลดข้อมูลนิยายได้ในขณะนี้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // การกรองหมวดหมู่หลายตัวเลือก
  const handleCategorySelect = (name) => {
    setSelectedCategories(prev => {
      const next = prev.includes(name)
        ? prev.filter(c => c !== name)
        : [...prev, name];
      setCurrentPage(1);
      return next;
    });
  };

  const handleResetFilters = () => {
    setSelectedCategories([]);
    setCurrentPage(1);
  };

  // กรองและเรียงลำดับนิยาย
  const filteredAndSortedNovels = useMemo(() => {
    let result = [...novels];

    // 1. กรองคำค้นหา
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(n => 
        n.title.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q) ||
        n.synopsis.toLowerCase().includes(q)
      );
    }

    // 2. กรองด้วยหมวดหมู่ (แบบ OR)
    if (selectedCategories.length > 0) {
      result = result.filter(n => 
        n.categories.some(cat => selectedCategories.includes(cat))
      );
    }

    // 3. กรองประเภทสถานะ (จบแล้ว vs ยังไม่จบ)
    if (statusFilter === "finished") {
      result = result.filter(n => n.isCompleted);
    } else if (statusFilter === "ongoing" || statusFilter === "writing") {
      result = result.filter(n => !n.isCompleted);
    }

    // 4. เรียงลำดับ
    if (sortBy === "popular") {
      result.sort((a, b) => b.stats.views - a.stats.views);
    } else if (sortBy === "latest") {
      result.sort((a, b) => (b.id || 0) - (a.id || 0));
    } else if (sortBy === "thai") {
      result.sort((a, b) => a.title.localeCompare(b.title, 'th'));
    }

    return result;
  }, [novels, searchQuery, selectedCategories, statusFilter, sortBy]);

  // ระบบ pagination
  const totalPages = Math.ceil(filteredAndSortedNovels.length / itemsPerPage);
  const paginatedNovels = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedNovels.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredAndSortedNovels, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 380, behavior: "smooth" });
    }
  };

  return (
    <div className="search-page">
      <div className="search-page-container">
        
        {/* 1. แบนเนอร์ด้านบน */}
        <header className="category-hero-banner">
          <span className="banner-eyebrow">สำรวจทุกแนวนิยาย</span>
          <h1 className="banner-title">อ่านเรื่องที่ <span className="highlight-text">ใช่</span> สำหรับคุณ</h1>
          <p className="banner-desc">เลือกหมวดหมู่ที่สนใจ แล้วก้าวเข้าสู่โลกแห่งนิยายทางเลือกที่ไม่มีวันสิ้นสุด</p>
        </header>

        {/* 2. ส่วนเลือกหมวดหมู่ที่สนใจ */}
        <section className="categories-selection-sec">
          <div className="selection-header">
            <h2 className="selection-title">เลือกหมวดหมู่ <span className="pink-text">ที่สนใจ</span></h2>
            {selectedCategories.length > 0 && (
              <button type="button" className="reset-filter-btn" onClick={handleResetFilters}>
                🗘 รีเซ็ต
              </button>
            )}
          </div>

          <div className="categories-theme-grid">
            {categories.map((cat) => {
              const isSelected = selectedCategories.includes(cat.name);

              return (
                <div
                  key={cat.id}
                  className={`theme-card ${isSelected ? "selected" : ""}`}
                  onClick={() => handleCategorySelect(cat.name)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleCategorySelect(cat.name);
                    }
                  }}
                >
                  {isSelected && <span className="card-check-badge">✓</span>}
                  <div className="theme-card-info">
                    <span className="theme-name">{cat.name}</span>
                    <span className="theme-count">{cat.count.toLocaleString()} เรื่อง</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. แถบเครื่องมือจัดการ Toolbar */}
        <div className="toolbar-bar">
          <div className="toolbar-left-group">
            <span className="toolbar-label">⚙️ กรอง</span>
            <div className="status-tabs-group">
              <button 
                type="button" 
                className={`status-tab-btn ${statusFilter === "all" ? "active" : ""}`}
                aria-pressed={statusFilter === "all"}
                onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
              >
                ทั้งหมด
              </button>
              <button 
                type="button" 
                className={`status-tab-btn ${statusFilter === "ongoing" || statusFilter === "writing" ? "active" : ""}`}
                aria-pressed={statusFilter === "ongoing" || statusFilter === "writing"}
                onClick={() => { setStatusFilter("ongoing"); setCurrentPage(1); }}
              >
                ยังไม่จบ
              </button>
              <button 
                type="button" 
                className={`status-tab-btn ${statusFilter === "finished" ? "active" : ""}`}
                aria-pressed={statusFilter === "finished"}
                onClick={() => { setStatusFilter("finished"); setCurrentPage(1); }}
              >
                จบแล้ว
              </button>
            </div>

            <div className="toolbar-result-count">
              แสดง {filteredAndSortedNovels.length} เรื่อง
            </div>
          </div>

          <div className="toolbar-right-group">
            <div className="sort-dropdown-wrapper">
              <select 
                className="toolbar-select" 
                value={sortBy} 
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
              >
                <option value="popular">ยอดนิยม</option>
                <option value="latest">อัปเดตล่าสุด</option>
                <option value="thai">ก-ฮ</option>
              </select>
            </div>

            <div className="view-mode-toggle">
              <button 
                type="button" 
                className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
                aria-label="มุมมองตาราง"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                title="มุมมองตาราง"
              >
                ⊞
              </button>
              <button 
                type="button" 
                className={`view-btn ${viewMode === "list" ? "active" : ""}`}
                aria-label="มุมมองรายการ"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                title="มุมมองรายการ"
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        {/* 4. แสดงผลการ์ดนิยาย */}
        {loading ? (
          <LoadingScreen compact message="กำลังโหลดนิยาย..." />
        ) : error ? (
          <div className="search-error">{error}</div>
        ) : paginatedNovels.length === 0 ? (
          <div className="search-empty-state">
            <div className="empty-icon">🔍</div>
            <h3>ยังไม่มีนิยายที่ตรงกับตัวเลือกนี้</h3>
            <p>ลองเปลี่ยนหมวดหมู่หรือสถานะการแสดงผล เพื่อค้นพบเรื่องใหม่ ๆ ที่น่าสนใจ</p>
          </div>
        ) : viewMode === "grid" ? (
          /* 📌 Grid View */
          <div className="novel-grid-layout">
            {paginatedNovels.map((novel) => {
              const isFinished = novel.isCompleted;

              return (
                <div 
                  key={novel.id} 
                  className="novel-grid-card"
                  onClick={() => navigate(`/novel/${novel.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/novel/${novel.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="novel-grid-cover">
                    {novel.coverImage ? (
                      <img 
                        src={resolveCoverUrl(novel.coverImage)} 
                        alt={novel.title} 
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid-cover-placeholder">📘</div>
                    )}
                    {isFinished && (
                      <span className="card-status-tag finished">
                        จบแล้ว
                      </span>
                    )}
                  </div>

                  <div className="novel-grid-body">
                    <div className="novel-grid-tags">
                      {novel.categories.slice(0, 2).map((cat, cIdx) => (
                        <span key={cIdx} className="grid-tag-item">{cat}</span>
                      ))}
                      {novel.categories.length > 2 && (
                        <span className="grid-tag-item grid-tag-overflow">+{novel.categories.length - 2}</span>
                      )}
                    </div>

                    <h3 className="novel-grid-title" title={novel.title}>{novel.title}</h3>
                    
                    <div className="novel-grid-author">
                      <Pencil size={12} className="novel-author-icon" /> <span>{novel.author}</span>
                    </div>

                    <p className="novel-grid-synopsis" title={novel.synopsis || ""}>
                      {novel.synopsis || ""}
                    </p>

                    <div className="novel-grid-stats">
                      <div className="novel-grid-stat-item" title="เพิ่มเข้าชั้น">
                        <Bookmark size={13} />
                        <span>{formatNumber(novel.stats.bookshelfCount)}</span>
                      </div>
                      <div className="novel-grid-stat-item" title="ยอดเข้าชม">
                        <Eye size={13} />
                        <span>{formatNumber(novel.stats.views)}</span>
                      </div>
                      <div className="novel-grid-stat-item" title="ยอดถูกใจ">
                        <Heart size={13} />
                        <span>{formatNumber(novel.stats.likes)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 📌 List View */
          <div className="novel-list-vertical">
            {paginatedNovels.map((novel) => {
              const isFinished = novel.isCompleted;

              return (
                <article 
                  key={novel.id} 
                  className="novel-horiz-card"
                  onClick={() => navigate(`/novel/${novel.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/novel/${novel.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div className="novel-horiz-cover">
                    {novel.coverImage ? (
                      <img 
                        src={resolveCoverUrl(novel.coverImage)} 
                        alt={novel.title} 
                        loading="lazy"
                      />
                    ) : (
                      <div className="novel-cover-placeholder">📘</div>
                    )}
                    {isFinished && (
                      <span className="card-status-tag finished">
                        จบแล้ว
                      </span>
                    )}
                  </div>

                  <div className="novel-horiz-details">
                    <div className="novel-grid-tags">
                      {novel.categories.slice(0, 2).map((cat, cIdx) => (
                        <span key={cIdx} className="grid-tag-item">{cat}</span>
                      ))}
                      {novel.categories.length > 2 && (
                        <span className="grid-tag-item grid-tag-overflow">+{novel.categories.length - 2}</span>
                      )}
                    </div>

                    <div className="novel-horiz-header">
                      <h3 className="novel-horiz-title" title={novel.title}>{novel.title}</h3>
                      <span className="novel-horiz-author">
                        <Pencil size={12} className="novel-author-icon" /> <span>{novel.author}</span>
                      </span>
                    </div>

                    <p className="novel-horiz-synopsis" title={novel.synopsis || ""}>
                      {novel.synopsis || ""}
                    </p>

                    <div className="novel-horiz-footer">
                      <div className="novel-meta-info">
                        <div className="novel-horiz-stat-item" title="เพิ่มเข้าชั้น">
                          <Bookmark size={13} />
                          <span>{formatNumber(novel.stats.bookshelfCount)}</span>
                        </div>
                        <div className="novel-horiz-stat-item" title="ยอดเข้าชม">
                          <Eye size={13} />
                          <span>{formatNumber(novel.stats.views)}</span>
                        </div>
                        <div className="novel-horiz-stat-item" title="ยอดถูกใจ">
                          <Heart size={13} />
                          <span>{formatNumber(novel.stats.likes)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* 5. Pagination */}
        {totalPages > 1 && (
          <div className="pagination-wrapper">
            <button 
              type="button" 
              className="page-nav-btn"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              &lt;
            </button>
            
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`page-num-btn ${currentPage === pageNum ? "active" : ""}`}
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}

            <button 
              type="button" 
              className="page-nav-btn"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              &gt;
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default CategoriesPage;