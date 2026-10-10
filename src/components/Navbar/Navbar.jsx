import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
    Menu,
    X,
    Search,
    Home,
    LayoutGrid,
    Bookmark,
    History,
    Users,
    TrendingUp,
    User,
    Settings,
    LogOut,
    LayoutDashboard,
    Layers,
    PenTool,
    GitFork,
    BarChart2,
    BookOpen,
    LogIn,
    Bell,
    Pencil,
    Eye,
} from "lucide-react";
import "./Navbar.css";
import { useAuthUser, useNotifications, useNavSearch } from "../../hooks/useNavbar.jsx";
import NotificationDropdown from "../NotificationDropdown/NotificationDropdown";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// หน้าโปรไฟล์นักเขียนแบบสาธารณะ (ใครก็ดูได้ ไม่ใช่ workspace ของนักเขียน)
// ขึ้นต้นด้วย /writer เหมือนกัน แต่ไม่ควรนับเป็น "โหมดนักเขียน"
const isWriterPublicProfilePath = (pathname) =>
    /^\/writer\/profile\/[^/]+\/?$/.test(pathname) || // /writer/profile/:id
    /^\/writer\/[^/]+\/profile\/?$/.test(pathname); // /writer/:id/profile

const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const searchRef = useRef(null);
    const dropdownRef = useRef(null);

    // ── auth (แหล่งเดียว ใช้ร่วมกับ App.jsx ได้ด้วย) ──────────────
    const { isLoggedIn, userData, isLoadingUser, handleLogout: doLogout } = useAuthUser();

    // ── คำนวณโหมดจุดเดียว ไม่มีที่สองมาคำนวณแข่งกัน ────────────────
    const isWriterMode =
        location.pathname.startsWith("/writer") &&
        !isWriterPublicProfilePath(location.pathname) &&
        isLoggedIn &&
        userData.role === "writer";

    const { unreadCount } = useNotifications(isLoggedIn);

    const {
        searchValue, setSearchValue,
        searchFocused, setSearchFocused,
        recentSearches, popularNovels, categories,
        matchingNovels, highlightText,
        handleSearchSubmit, handleDeleteRecentSearch,
    } = useNavSearch();

    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    // ── novel selector (เฉพาะโหมดนักเขียน) ─────────────────────────
    const [novels, setNovels] = useState([]);
    const [showNovelPopup, setShowNovelPopup] = useState(false);
    const [popupTarget, setPopupTarget] = useState(null);
    const [searchNovel, setSearchNovel] = useState("");
    const [selectedNovel, setSelectedNovel] = useState(() => {
        try {
            const saved = localStorage.getItem("selectedNovel");
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        setIsMenuOpen(false);
        setIsDropdownOpen(false);
    }, [location.pathname]);

    const fetchNovels = async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/me/novels`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("โหลดนิยายไม่สำเร็จ");
            const data = await res.json();
            const list = data?.novels || data?.data?.novels || [];
            setNovels(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error("โหลดนิยายล้มเหลว:", err);
        }
    };

    // Extract novel ID from URL path if present (e.g. /writer/15/chapters -> "15")
    const urlNovelMatch = location.pathname.match(/\/writer\/([^/]+)/);
    const urlNovelId = urlNovelMatch && urlNovelMatch[1] !== "dashboard" && urlNovelMatch[1] !== "profile" ? urlNovelMatch[1] : null;

    const activeNovelId = urlNovelId || (selectedNovel ? String(selectedNovel.id || selectedNovel.novel_id) : null);
    const hasActiveNovel = Boolean(activeNovelId);

    useEffect(() => {
        if (isWriterMode) fetchNovels();
    }, [isWriterMode]);

    useEffect(() => {
        const syncSelectedNovel = () => {
            try {
                const saved = localStorage.getItem("selectedNovel");
                setSelectedNovel(saved ? JSON.parse(saved) : null);
            } catch {
                setSelectedNovel(null);
            }
        };
        window.addEventListener("storage", syncSelectedNovel);
        window.addEventListener("novel-selected", syncSelectedNovel);
        return () => {
            window.removeEventListener("storage", syncSelectedNovel);
            window.removeEventListener("novel-selected", syncSelectedNovel);
        };
    }, []);

    // Auto-sync selectedNovel with URL novelId if visiting a specific novel page directly
    useEffect(() => {
        if (!urlNovelId) return;

        const currentId = selectedNovel ? String(selectedNovel.id || selectedNovel.novel_id) : null;
        if (currentId === String(urlNovelId)) return;

        const found = novels.find((n) => String(n.id || n.novel_id) === String(urlNovelId));
        if (found) {
            setSelectedNovel(found);
            try {
                localStorage.setItem("selectedNovel", JSON.stringify(found));
                window.dispatchEvent(new Event("storage"));
            } catch (e) {}
            return;
        }

        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        fetch(`${API_BASE_URL}/novels/${urlNovelId}`, { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return;
                const nData = data.novel || data.data?.novel || data.data || data;
                const novelObj = {
                    id: nData.novel_id || nData.id || urlNovelId,
                    novel_id: nData.novel_id || nData.id || urlNovelId,
                    title: nData.title || nData.Title || "ไม่ทราบชื่อเรื่อง",
                    cover_image: nData.cover_image || nData.coverImage || null,
                };
                setSelectedNovel(novelObj);
                try {
                    localStorage.setItem("selectedNovel", JSON.stringify(novelObj));
                    window.dispatchEvent(new Event("storage"));
                } catch (e) {}
            })
            .catch((err) => console.warn("Auto-sync novel failed:", err));
    }, [urlNovelId, novels, selectedNovel]);

    // ── click-outside ──────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [setSearchFocused]);

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filteredNovels = novels.filter((n) =>
        (n.title || "").toLowerCase().includes(searchNovel.toLowerCase())
    );

    const openNovelPopup = (target = null) => {
        setPopupTarget(target);
        setSearchNovel("");
        setShowNovelPopup(true);
    };

    const navigateToNovelPage = async (novelId, target) => {
        if (target === "chapters") {
            navigate(`/writer/${novelId}/chapters`);
            return;
        }
        if (target === "tree") {
            navigate(`/writer/${novelId}/storytree`);
            return;
        }
        if (target === "analytics") {
            navigate(`/writer/${novelId}/analytics`);
            return;
        }
        if (target === "write") {
            try {
                const token = localStorage.getItem("token");
                const headers = { Authorization: `Bearer ${token}` };

                const chapterRes = await fetch(`${API_BASE_URL}/novels/${novelId}/chapters`, { headers });
                if (!chapterRes.ok) {
                    navigate(`/writer/${novelId}/chapters`);
                    return;
                }
                const chapterData = await chapterRes.json();
                const chapters = chapterData?.data?.chapters || chapterData?.chapters || chapterData?.data || [];

                if (!chapters.length) {
                    navigate(`/writer/${novelId}/scene/empty?reason=no-chapters`);
                    return;
                }

                let foundSceneId = null;
                for (const ch of chapters) {
                    const chId = ch.id || ch.chapter_id || ch.ChapterID;
                    if (!chId) continue;

                    const sceneRes = await fetch(`${API_BASE_URL}/chapters/${chId}/scenes`, { headers });
                    if (!sceneRes.ok) continue;

                    const sceneData = await sceneRes.json();
                    const scenes = sceneData?.data?.scenes || sceneData?.scenes || sceneData?.data || [];

                    if (scenes.length > 0) {
                        foundSceneId = scenes[0].id || scenes[0].scene_id || scenes[0].SceneID;
                        break;
                    }
                }

                if (!foundSceneId) {
                    alert("คุณต้องเพิ่มฉากแรกในหน้าจัดการตอนก่อน จึงจะสามารถไปหน้าเขียนเนื้อหาได้ค่ะ");
                    navigate(`/writer/${novelId}/chapters`);
                    return;
                }

                navigate(`/writer/${novelId}/scene/${foundSceneId}`);
            } catch (err) {
                console.error("ดึงข้อมูลฉากแรกล้มเหลว:", err);
                navigate(`/writer/${novelId}/chapters`);
            }
        }
    };

    const handleNovelMenu = async (target) => {
        const targetId = activeNovelId || (selectedNovel ? (selectedNovel.id || selectedNovel.novel_id) : null);
        if (!targetId) {
            openNovelPopup(target);
            return;
        }
        navigateToNovelPage(targetId, target);
    };

    const getCurrentNovelSection = () => {
        if (/^\/writer\/[^/]+\/chapters/.test(location.pathname)) return "chapters";
        if (/^\/writer\/[^/]+\/storytree/.test(location.pathname)) return "tree";
        if (/^\/writer\/[^/]+\/analytics/.test(location.pathname)) return "analytics";
        if (/^\/writer\/[^/]+\/scene\//.test(location.pathname)) return "write";
        return null;
    };

    const handleSelectNovel = (novel) => {
        setSelectedNovel(novel);
        localStorage.setItem("selectedNovel", JSON.stringify(novel));
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("novel-selected"));
        setShowNovelPopup(false);
        if (popupTarget) navigateToNovelPage(novel.id || novel.novel_id, popupTarget);
    };

    const handleLogout = async (event) => {
        await doLogout(event);
        navigate("/", { replace: true });
    };

    // ─────────────────────────────────────────────────────────────
    return (
        <>
            <nav className={`nav-header ${isScrolled ? "nav-sticky" : ""}`}>
                <div className="nav-container">

                    {/* โลโก้ */}
                    <div
                        className="nav-logo"
                        onClick={() => {
                            if (isWriterMode) {
                                localStorage.removeItem("selectedNovel");
                                setSelectedNovel(null);
                                navigate("/writer/dashboard");
                            } else {
                                navigate("/");
                            }
                        }}
                    >
                        <img src="/logo192.png" alt="logo" className="logo-img" />
                        <div className="navbar__logo-text">
                            <span className="navbar__logo-story">Story</span>
                            <span className="navbar__logo-verse">Verse</span>
                            <span className="navbar__logo-mode">
                                {isWriterMode ? "Writer Mode" : "Reader Mode"}
                            </span>
                        </div>
                    </div>

                    {/* ปุ่มสลับโหมด นักอ่าน/นักเขียน — โผล่เฉพาะบัญชีที่เป็นนักเขียนแล้วเท่านั้น (บนเดสก์ท็อป) */}
                    {isLoggedIn && userData.role === "writer" && (
                        <div className="mode-toggle mode-toggle--desktop">
                            <button
                                className={`mode-toggle__btn ${!isWriterMode ? "mode-toggle__btn--active" : ""}`}
                                onClick={() => navigate("/")}
                            >
                                นักอ่าน
                            </button>
                            <button
                                className={`mode-toggle__btn ${isWriterMode ? "mode-toggle__btn--active" : ""}`}
                                onClick={() => {
                                    localStorage.removeItem("selectedNovel");
                                    setSelectedNovel(null);
                                    navigate("/writer/dashboard");
                                }}
                            >
                                นักเขียน
                            </button>
                        </div>
                    )}

                    {/* เมนูกลาง (แสดงบนเดสก์ท็อป) */}
                    <ul className="nav-menu">
                        {isWriterMode ? (
                            <>
                                <li className={`nav-item ${location.pathname === "/writer/dashboard" ? "active-menu" : ""}`}>
                                    <Link
                                        to="/writer/dashboard"
                                        onClick={() => {
                                            localStorage.removeItem("selectedNovel");
                                            setSelectedNovel(null);
                                            setIsMenuOpen(false);
                                        }}
                                    >
                                        แดชบอร์ด
                                    </Link>
                                </li>

                                {hasActiveNovel && (
                                    <>
                                        <li className="nav-item nav-item-divider-container">
                                            <span className="nav-menu-divider"></span>
                                        </li>
                                        <li className="nav-item">
                                            <button 
                                                 className={`nav-menu-btn--pink ${location.pathname.includes("/chapters") ? "active" : ""}`} 
                                                 onClick={() => {
                                                     setIsMenuOpen(false);
                                                     handleNovelMenu("chapters");
                                                 }}
                                             >
                                                 จัดการตอน
                                             </button>
                                         </li>
                                         <li className="nav-item">
                                             <button 
                                                 className={`nav-menu-btn--pink ${location.pathname.includes("/scene/") ? "active" : ""}`} 
                                                 onClick={() => {
                                                     setIsMenuOpen(false);
                                                     handleNovelMenu("write");
                                                 }}
                                             >
                                                 เขียนเนื้อหา
                                             </button>
                                         </li>
                                        <li className="nav-item">
                                            <button 
                                                className={`nav-menu-btn--pink ${location.pathname.includes("/storytree") ? "active" : ""}`} 
                                                onClick={() => {
                                                    setIsMenuOpen(false);
                                                    handleNovelMenu("tree");
                                                }}
                                            >
                                                โครงสร้างเนื้อเรื่อง
                                            </button>
                                        </li>
                                        <li className="nav-item">
                                            <button 
                                                className={`nav-menu-btn--pink ${location.pathname.includes("/analytics") ? "active" : ""}`} 
                                                onClick={() => {
                                                    setIsMenuOpen(false);
                                                    handleNovelMenu("analytics");
                                                }}
                                            >
                                                สถิติทางเลือก
                                            </button>
                                        </li>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <li className={`nav-item ${location.pathname === "/" ? "active-menu" : ""}`}>
                                    <Link to="/" onClick={() => setIsMenuOpen(false)}>หน้าแรก</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith("/categories") ? "active-menu" : ""}`}>
                                    <Link to="/categories" onClick={() => setIsMenuOpen(false)}>หมวดหมู่</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith("/bookshelf") ? "active-menu" : ""}`}>
                                    <Link to="/bookshelf" onClick={() => setIsMenuOpen(false)}>ชั้นหนังสือ</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith("/history") ? "active-menu" : ""}`}>
                                    <Link to="/history" onClick={() => setIsMenuOpen(false)}>ประวัติการอ่าน</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith("/following-writers") ? "active-menu" : ""}`}>
                                    <Link to="/following-writers" onClick={() => setIsMenuOpen(false)}>นักเขียนที่ติดตาม</Link>
                                </li>
                                {isLoggedIn && userData.role !== "writer" && (
                                    <li className={`nav-item ${location.pathname.startsWith("/registerwriter") ? "active-menu" : ""}`}>
                                        <Link to="/registerwriter" onClick={() => setIsMenuOpen(false)}>สมัครนักเขียน</Link>
                                    </li>
                                )}
                            </>
                        )}
                    </ul>

                    {/* ฝั่งขวา */}
                    <div className="navbar__right">

                        {/* ชิปชื่อนิยายที่กำลังแก้อยู่ (โหมดนักเขียน) — ด้านหน้ากระดิ่ง */}
                        {isWriterMode && selectedNovel && (
                            <button
                                type="button"
                                className="selected-novel-btn"
                                onClick={() => openNovelPopup(getCurrentNovelSection())}
                                title="คลิกเพื่อเปลี่ยนนิยายที่กำลังแก้ไข"
                            >
                                <span className="selected-dot"></span>
                                <span className="selected-title">
                                    {selectedNovel.title || "ไม่ระบุชื่อนิยาย"}
                                </span>
                            </button>
                        )}

                        {/* กล่องค้นหา — โชว์เฉพาะโหมดนักอ่าน */}
                        {!isWriterMode && (
                            <div className="navbar__search-zone" ref={searchRef}>
                                <div className={`navbar__search ${searchFocused ? "navbar__search--focused" : ""}`}>
                                    <svg className="navbar__search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                                        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                    <input
                                        className="navbar__search-input"
                                        type="search"
                                        placeholder="ค้นหานิยาย"
                                        value={searchValue}
                                        onChange={(e) => setSearchValue(e.target.value)}
                                        onFocus={() => setSearchFocused(true)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(searchValue); }}
                                    />
                                </div>

                                {searchFocused && (
                                    <div className="search-overlay-dropdown">
                                        {searchValue.trim() !== "" ? (
                                            <div className="search-overlay-section">
                                                <h4 className="search-overlay-title">นิยายที่เกี่ยวข้อง</h4>
                                                <div className="search-overlay-matching-list">
                                                    {matchingNovels.length === 0 ? (
                                                        <div style={{ padding: "14px 0", color: "#94a3b8", fontSize: "0.88rem", textAlign: "center" }}>
                                                            ไม่พบนิยายที่เกี่ยวข้อง
                                                        </div>
                                                    ) : (
                                                        matchingNovels.map((novel, idx) => {
                                                            const rawCats = novel.categories || novel.Categories || [];
                                                            const cleanCats = rawCats
                                                                .map((c) => (typeof c === "string" ? c : c.name || c.title))
                                                                .slice(0, 2)
                                                                .join(", ");
                                                            const chapterCount =
                                                                novel.chapters_count || (novel.chapters ? novel.chapters.length : 0) || 0;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="search-overlay-match-card"
                                                                    onClick={() => {
                                                                        setSearchFocused(false);
                                                                        setSearchValue("");
                                                                        navigate(`/novel/${novel.id || novel.novel_id}`);
                                                                    }}
                                                                >
                                                                    <div className="match-card-cover">
                                                                        {novel.cover_image || novel.coverImage ? (
                                                                            <img
                                                                                src={(novel.cover_image || novel.coverImage).replace(
                                                                                    "http://minio:9000",
                                                                                    "http://localhost:9000"
                                                                                )}
                                                                                alt=""
                                                                            />
                                                                        ) : (
                                                                            <div className="match-card-placeholder">📘</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="match-card-info">
                                                                        <div className="match-card-title">
                                                                            {highlightText(novel.title || "", searchValue)}
                                                                        </div>
                                                                        <div className="match-card-meta">
                                                                            {novel.pen_name || novel.penName || "ไม่ระบุ"} • {cleanCats || "ทั่วไป"} • {chapterCount} ตอน
                                                                        </div>
                                                                    </div>
                                                                    <span className="match-card-arrow">➔</span>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                                <div className="search-overlay-footer-btn" onClick={() => handleSearchSubmit(searchValue)}>
                                                    ดูผลลัพธ์ทั้งหมดสำหรับ "{searchValue}"
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {recentSearches.length > 0 && (
                                                    <div className="search-overlay-section">
                                                        <h4 className="search-overlay-title">ค้นหาล่าสุด</h4>
                                                        <div className="search-overlay-recent-list">
                                                            {recentSearches.map((item, idx) => (
                                                                <div key={idx} className="search-overlay-recent-item">
                                                                    <span className="recent-text" onClick={() => handleSearchSubmit(item)}>
                                                                        {item}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        className="recent-delete-btn"
                                                                        onClick={(e) => handleDeleteRecentSearch(e, item)}
                                                                        title="ลบประวัติ"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {popularNovels.length > 0 && (
                                                    <div className="search-overlay-section">
                                                        <h4 className="search-overlay-title">กำลังเป็นที่นิยม</h4>
                                                        <div className="search-overlay-popular-list">
                                                            {popularNovels.map((novel, idx) => {
                                                                const views = novel.views || novel.view_count || 0;
                                                                const fv = views >= 1000 ? `${(views / 1000).toFixed(1)}k` : views;
                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        className="search-overlay-popular-item"
                                                                        onClick={() => {
                                                                            setSearchFocused(false);
                                                                            navigate(`/novel/${novel.id || novel.novel_id}`);
                                                                        }}
                                                                    >
                                                                        <span className="popular-badge">{idx + 1}</span>
                                                                        <div className="popular-info">
                                                                            <span className="popular-title">{novel.title}</span>
                                                                            <span className="popular-meta">
                                                                                <span className="popular-meta-item">
                                                                                    <Pencil size={11} className="novel-author-icon" />
                                                                                    <span>{novel.pen_name || novel.penName || "ไม่ระบุ"}</span>
                                                                                </span>
                                                                                <span className="popular-meta-dot">•</span>
                                                                                <span className="popular-meta-item">
                                                                                    <Eye size={11} className="popular-stat-icon" />
                                                                                    <span>{fv} ยอดอ่าน</span>
                                                                                </span>
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {categories.length > 0 && (
                                                    <div className="search-overlay-section">
                                                        <div className="search-overlay-header-row">
                                                            <h4 className="search-overlay-title">สำรวจหมวดหมู่</h4>
                                                            <span
                                                                className="search-overlay-view-all"
                                                                onClick={() => {
                                                                    setSearchFocused(false);
                                                                    navigate("/categories");
                                                                }}
                                                            >
                                                                ดูทั้งหมด
                                                            </span>
                                                        </div>
                                                        <div className="search-overlay-category-list">
                                                            {categories.map((cat, idx) => (
                                                                <button
                                                                    key={cat.id || idx}
                                                                    type="button"
                                                                    className="search-overlay-cat-chip"
                                                                    onClick={() => {
                                                                        setSearchFocused(false);
                                                                        navigate(`/categories?search=${encodeURIComponent(cat.name || cat.title)}`);
                                                                    }}
                                                                >
                                                                    {cat.name || cat.title}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* กระดิ่งแจ้งเตือน — เปิดรายการล่าสุดใน dropdown */}
                        {isLoggedIn && (
                            <NotificationDropdown unreadCount={unreadCount} />
                        )}

                        {/* ปุ่ม "สตูดิโอนักเขียน" — โชว์เฉพาะบัญชีนักเขียนที่กำลังอยู่โหมดนักอ่าน */}
                        {!isWriterMode && isLoggedIn && userData.role === "writer" && (
                            <button
                                type="button"
                                className="nav-switch-btn nav-switch-btn--writer"
                                onClick={() => navigate("/writer/dashboard")}
                            >
                                ✍️ สตูดิโอนักเขียน
                            </button>
                        )}

                        {/* โซน auth / profile */}
                        <div className="navbar__auth-zone" ref={dropdownRef}>
                            {isLoggedIn ? (
                                <div className="nav-profile-container">
                                    <button
                                        type="button"
                                        className="nav-profile-trigger"
                                        onClick={() => setIsDropdownOpen((prev) => !prev)}
                                        aria-label="เมนูผู้ใช้งาน"
                                        aria-expanded={isDropdownOpen}
                                    >
                                        <img
                                            src={userData.pic_profile || "https://api.dicebear.com/7.x/bottts/svg?seed=Lucky"}
                                            alt="User Avatar"
                                            className="nav-avatar-img"
                                        />
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="nav-dropdown">
                                            <div className="nav-dropdown__user-info">
                                                <p className="nav-dropdown__status">
                                                    {isLoadingUser ? "⏳ กำลังโหลด..." : `สิทธิ์: ${userData.role || "ผู้ใช้"}`}
                                                </p>
                                                <p className="nav-dropdown__user-id" title={userData.email}>
                                                    {userData.username || userData.email || "ผู้ใช้งาน"}
                                                </p>
                                            </div>
                                            <hr className="nav-dropdown__divider" />

                                            {userData.role === "writer" && (
                                                <button
                                                    type="button"
                                                    className="nav-dropdown__link-btn"
                                                    onClick={() => {
                                                        setIsDropdownOpen(false);
                                                        navigate("/writer/profile");
                                                    }}
                                                >
                                                    <User size={16} />
                                                    <span>โปรไฟล์ของฉัน</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                className="nav-dropdown__link-btn"
                                                onClick={() => {
                                                    setIsDropdownOpen(false);
                                                    navigate("/settings");
                                                }}
                                            >
                                                <Settings size={16} />
                                                <span>ตั้งค่า</span>
                                            </button>

                                            <hr className="nav-dropdown__divider" />
                                            <button
                                                type="button"
                                                className="nav-dropdown__logout-btn"
                                                onClick={() => { setIsDropdownOpen(false); setShowLogoutModal(true); }}
                                            >
                                                <LogOut size={16} />
                                                <span>ออกจากระบบ</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <Link to="/login-register" className="nav-login-btn">
                                    เข้าสู่ระบบ / สมัครสมาชิก
                                </Link>
                            )}
                        </div>

                        {/* ปุ่มเมนูมือถือ (ขีดสามขีด) — โผล่เฉพาะจอเล็ก */}
                        <button
                            type="button"
                            className="nav-hamburger"
                            onClick={() => setIsMenuOpen(true)}
                            aria-label="เปิดแถบเมนูด้านข้าง"
                            aria-expanded={isMenuOpen}
                        >
                            <Menu size={22} />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Backdrop Overlay สำหรับ Slide-out Drawer */}
            <div
                className={`nav-drawer-overlay ${isMenuOpen ? "active" : ""}`}
                onClick={() => setIsMenuOpen(false)}
                aria-hidden="true"
            />

            {/* Slide-out Mobile Drawer */}
            <aside className={`nav-drawer ${isMenuOpen ? "active" : ""}`} aria-label="แถบเมนูด้านข้าง">
                {/* 1. Header: Logo + StoryVerse + Mode + Close Button (Same format as navbar) */}
                <div className="nav-drawer__header">
                    <div
                        className="nav-logo"
                        onClick={() => {
                            setIsMenuOpen(false);
                            if (isWriterMode) {
                                localStorage.removeItem("selectedNovel");
                                setSelectedNovel(null);
                                navigate("/writer/dashboard");
                            } else {
                                navigate("/");
                            }
                        }}
                    >
                        <img src="/logo192.png" alt="logo" className="logo-img" />
                        <div className="navbar__logo-text">
                            <span className="navbar__logo-story">Story</span>
                            <span className="navbar__logo-verse">Verse</span>
                            <span className="navbar__logo-mode">
                                {isWriterMode ? "Writer Mode" : "Reader Mode"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="nav-drawer__close-btn"
                        onClick={() => setIsMenuOpen(false)}
                        aria-label="ปิดแถบเมนู"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 2. Toggle Switch สำหรับบัญชีที่มีสิทธิ์นักเขียน (แสดงทั้งโหมดนักอ่านและนักเขียน) */}
                {isLoggedIn && userData.role === "writer" && (
                    <div className="nav-drawer__toggle-wrap">
                        <div className="mode-toggle mode-toggle--drawer">
                            <button
                                type="button"
                                className={`mode-toggle__btn ${!isWriterMode ? "mode-toggle__btn--active" : ""}`}
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    navigate("/");
                                }}
                            >
                                โหมดนักอ่าน
                            </button>
                            <button
                                type="button"
                                className={`mode-toggle__btn ${isWriterMode ? "mode-toggle__btn--active" : ""}`}
                                onClick={() => {
                                    localStorage.removeItem("selectedNovel");
                                    setSelectedNovel(null);
                                    setIsMenuOpen(false);
                                    navigate("/writer/dashboard");
                                }}
                            >
                                โหมดนักเขียน
                            </button>
                        </div>
                    </div>
                )}

                {/* 3. Drawer Scrollable Body Menu */}
                <div className="nav-drawer__body">
                    {isWriterMode ? (
                        <>
                            <div className="nav-drawer__section-title">เมนูนักเขียน</div>
                            <nav className="nav-drawer__nav-list">
                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname === "/writer/dashboard" ? "active" : ""}`}
                                    onClick={() => {
                                        localStorage.removeItem("selectedNovel");
                                        setSelectedNovel(null);
                                        setIsMenuOpen(false);
                                        navigate("/writer/dashboard");
                                    }}
                                >
                                    <LayoutDashboard size={19} className="nav-drawer__item-icon" />
                                    <span>แดชบอร์ด</span>
                                </button>

                                {hasActiveNovel && (
                                    <>
                                        <button
                                            type="button"
                                            className={`nav-drawer__nav-item ${location.pathname.includes("/chapters") ? "active" : ""}`}
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                handleNovelMenu("chapters");
                                            }}
                                        >
                                            <BookOpen size={19} className="nav-drawer__item-icon" />
                                            <span>จัดการตอน</span>
                                        </button>

                                        <button
                                            type="button"
                                            className={`nav-drawer__nav-item ${location.pathname.includes("/scene/") ? "active" : ""}`}
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                handleNovelMenu("write");
                                            }}
                                        >
                                            <PenTool size={19} className="nav-drawer__item-icon" />
                                            <span>เขียนเนื้อหา</span>
                                        </button>

                                        <button
                                            type="button"
                                            className={`nav-drawer__nav-item ${location.pathname.includes("/storytree") ? "active" : ""}`}
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                handleNovelMenu("tree");
                                            }}
                                        >
                                            <GitFork size={19} className="nav-drawer__item-icon" />
                                            <span>โครงสร้างเนื้อเรื่อง</span>
                                        </button>

                                        <button
                                            type="button"
                                            className={`nav-drawer__nav-item ${location.pathname.includes("/analytics") ? "active" : ""}`}
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                handleNovelMenu("analytics");
                                            }}
                                        >
                                            <BarChart2 size={19} className="nav-drawer__item-icon" />
                                            <span>สถิติทางเลือก</span>
                                        </button>
                                    </>
                                )}
                            </nav>
                        </>
                    ) : (
                        <>
                            <div className="nav-drawer__section-title">เมนูนักอ่าน</div>
                            <nav className="nav-drawer__nav-list">
                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname === "/" ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/");
                                    }}
                                >
                                    <Home size={19} className="nav-drawer__item-icon" />
                                    <span>หน้าแรก</span>
                                </button>

                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname.startsWith("/categories") ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/categories");
                                    }}
                                >
                                    <LayoutGrid size={19} className="nav-drawer__item-icon" />
                                    <span>หมวดหมู่</span>
                                </button>

                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname.startsWith("/bookshelf") ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/bookshelf");
                                    }}
                                >
                                    <Bookmark size={19} className="nav-drawer__item-icon" />
                                    <span>ชั้นหนังสือ</span>
                                </button>

                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname.startsWith("/history") ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/history");
                                    }}
                                >
                                    <History size={19} className="nav-drawer__item-icon" />
                                    <span>ประวัติการอ่าน</span>
                                </button>

                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname.startsWith("/following-writers") ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/following-writers");
                                    }}
                                >
                                    <Users size={19} className="nav-drawer__item-icon" />
                                    <span>นักเขียนที่ติดตาม</span>
                                </button>

                                {isLoggedIn && userData.role !== "writer" && (
                                    <button
                                        type="button"
                                        className={`nav-drawer__nav-item ${location.pathname.startsWith("/registerwriter") ? "active" : ""}`}
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            navigate("/registerwriter");
                                        }}
                                    >
                                        <PenTool size={19} className="nav-drawer__item-icon" />
                                        <span>สมัครนักเขียน</span>
                                    </button>
                                )}
                            </nav>
                        </>
                    )}

                    {/* Section: Account (หมวดบัญชี) */}
                    <div className="nav-drawer__section-title">บัญชี</div>
                    <nav className="nav-drawer__nav-list">
                        {isLoggedIn ? (
                            <>
                                {isWriterMode ? (
                                    <button
                                        type="button"
                                        className={`nav-drawer__nav-item ${location.pathname === "/writer/profile" ? "active" : ""}`}
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            navigate("/writer/profile");
                                        }}
                                    >
                                        <User size={19} className="nav-drawer__item-icon" />
                                        <span>โปรไฟล์</span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className={`nav-drawer__nav-item ${location.pathname === "/notifications" ? "active" : ""}`}
                                        onClick={() => {
                                            setIsMenuOpen(false);
                                            navigate("/notifications");
                                        }}
                                    >
                                        <div className="nav-drawer__icon-wrap">
                                            <Bell size={19} className="nav-drawer__item-icon" />
                                            {unreadCount > 0 && (
                                                <span className="nav-drawer__item-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                                            )}
                                        </div>
                                        <span>การแจ้งเตือน</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    className={`nav-drawer__nav-item ${location.pathname.startsWith("/settings") ? "active" : ""}`}
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        navigate("/settings");
                                    }}
                                >
                                    <Settings size={19} className="nav-drawer__item-icon" />
                                    <span>ตั้งค่าบัญชี</span>
                                </button>

                                <button
                                    type="button"
                                    className="nav-drawer__nav-item nav-drawer__nav-item--logout"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        setShowLogoutModal(true);
                                    }}
                                >
                                    <LogOut size={19} className="nav-drawer__item-icon" />
                                    <span>ออกจากระบบ</span>
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="nav-drawer__nav-item active"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    navigate("/login-register");
                                }}
                            >
                                <LogIn size={19} className="nav-drawer__item-icon" />
                                <span>เข้าสู่ระบบ / สมัครสมาชิก</span>
                            </button>
                        )}
                    </nav>
                </div>

                {/* 4. Drawer Footer */}
                <div className="nav-drawer__footer">
                    {isLoggedIn ? (
                        <>
                            <div className="nav-drawer__footer-user">
                                <div className="nav-drawer__footer-avatar">
                                    {userData.pic_profile ? (
                                        <img src={userData.pic_profile} alt="" className="nav-drawer__avatar-img" />
                                    ) : (
                                        <span>{(userData.username || "U").charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="nav-drawer__footer-details">
                                    <span className="nav-drawer__footer-name">
                                        {userData.username || "ผู้ใช้งาน"}
                                    </span>
                                    <span className="nav-drawer__footer-role">
                                        {userData.role === "writer" ? "นักเขียน" : "นักอ่าน"}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="nav-drawer__footer-logout-btn"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setShowLogoutModal(true);
                                }}
                            >
                                ออก
                            </button>
                        </>
                    ) : (
                        <div className="nav-drawer__footer-guest">
                            <div className="nav-drawer__footer-user">
                                <div className="nav-drawer__footer-avatar">
                                    <User size={20} color="#64748b" />
                                </div>
                                <div className="nav-drawer__footer-details">
                                    <span className="nav-drawer__footer-name">ผู้เยี่ยมชม</span>
                                    <span className="nav-drawer__footer-role">ยินดีต้อนรับสู่ StoryVerse</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="nav-drawer__footer-login-btn"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    navigate("/login-register");
                                }}
                            >
                                เข้าสู่ระบบ
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Popup เลือกนิยาย (เฉพาะโหมดนักเขียน) */}
            {showNovelPopup && (
                <div className="novel-popup-overlay" onClick={() => setShowNovelPopup(false)}>
                    <div className="novel-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="novel-popup__header">
                            <div>
                                <h3>เลือกนิยาย</h3>
                                <p>เลือกนิยายที่ต้องการแก้ไข</p>
                            </div>
                            <button className="novel-popup__close" onClick={() => setShowNovelPopup(false)}>✕</button>
                        </div>

                        <div className="novel-popup__search-wrap">
                            <span className="novel-popup__search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อนิยายที่ต้องการแก้ไข..."
                                value={searchNovel}
                                onChange={(e) => setSearchNovel(e.target.value)}
                                className="novel-popup__search"
                            />
                        </div>

                        <div className="novel-popup__list">
                            {filteredNovels.length === 0 ? (
                                <div className="novel-popup__empty">
                                    <div className="novel-popup__empty-icon">📖</div>
                                    <div>ไม่พบนิยาย</div>
                                </div>
                            ) : (
                                filteredNovels.map((novel) => (
                                    <button
                                        key={novel.id || novel.novel_id}
                                        className="novel-popup__item"
                                        onClick={() => handleSelectNovel(novel)}
                                    >
                                        <div className="novel-popup__cover">
                                            {novel.cover_image ? (
                                                <img src={novel.cover_image.replace("http://minio:9000", "http://localhost:9000")} alt="" />
                                            ) : "📖"}
                                        </div>
                                        <div className="novel-popup__info">
                                            <div className="novel-popup__title">{novel.title}</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal ยืนยัน logout */}
            {showLogoutModal && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                    backgroundColor: "rgba(15, 23, 42, 0.45)",
                    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    zIndex: 999999, padding: "20px",
                }}>
                    <div style={{
                        background: "#ffffff", width: "100%", maxWidth: "350px",
                        borderRadius: "24px",
                        boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04)",
                        padding: "28px 24px 24px", textAlign: "center",
                        display: "flex", flexDirection: "column", alignItems: "center",
                    }}>
                        <div style={{
                            width: "60px", height: "60px", borderRadius: "18px",
                            background: "#FFF0F6", border: "1px solid #FCE7F3",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            marginBottom: "16px",
                        }}>
                            <LogOut size={26} color="#E91E8C" strokeWidth={2.2} />
                        </div>
                        <h3 style={{ fontSize: "19px", fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>
                            ยืนยันการออกจากระบบ
                        </h3>
                        <p style={{ fontSize: "13.5px", color: "#64748b", margin: "0 0 24px", lineHeight: 1.5 }}>
                            คุณต้องการออกจากระบบบัญชีผู้ใช้งานนี้ใช่หรือไม่?
                        </p>
                        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                            <button
                                type="button"
                                onClick={() => setShowLogoutModal(false)}
                                style={{
                                    flex: 1, padding: "11px 16px", borderRadius: "14px",
                                    border: "1.5px solid #F1F5F9", background: "#ffffff",
                                    color: "#1E293B", fontSize: "14px", fontWeight: 700, cursor: "pointer",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { setShowLogoutModal(false); handleLogout(e); }}
                                style={{
                                    flex: 1.1, padding: "11px 16px", borderRadius: "14px",
                                    border: "none",
                                    background: "#E91E8C",
                                    color: "#ffffff", fontSize: "14px", fontWeight: 700,
                                    cursor: "pointer", boxShadow: "0 4px 14px rgba(233, 30, 140, 0.35)",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                ยืนยันออกจากระบบ
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default Navbar;