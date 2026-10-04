import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Bell, Menu, X, LogOut, User } from "lucide-react";
import "./Navbarwriter.css";
import { getNovelStatusInfo } from "../../utils/novelStatus";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const Navbarwriter = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // ── Refs ──────────────────────────────────────────────────────
    const searchRef = useRef(null);
    const dropdownRef = useRef(null);

    // ── UI & Auth States ──────────────────────────────────────────
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoadingUser, setIsLoadingUser] = useState(false);

    const [userData, setUserData] = useState({
        username: "",
        email: "",
        pic_profile: "",
        role: "",
    });

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    // ── กันไม่ให้คนที่ไม่ใช่นักเขียนเห็น Writer Navbar ──────────────
    // false จนกว่าจะรู้ผลชัวร์ว่า login อยู่ไหม + role คืออะไร
    const [authChecked, setAuthChecked] = useState(false);

    // ── Search States ─────────────────────────────────────────────
    const [searchValue, setSearchValue] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);

    const [recentSearches, setRecentSearches] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("recent_searches") || "[]");
        } catch {
            return [];
        }
    });
    const [popularNovels, setPopularNovels] = useState([]);
    const [overlayCategories, setOverlayCategories] = useState([]);
    const [allNovels, setAllNovels] = useState([]);

    // ── Writer Mode & Novel Selector States ───────────────────────
    const isWriterMode = location.pathname.startsWith("/writer");
    const [novels, setNovels] = useState([]);
    const [showNovelPopup, setShowNovelPopup] = useState(false);
    const [popupTarget, setPopupTarget] = useState(null);
    const [searchNovel, setSearchNovel] = useState("");
    const [selectedNovel, setSelectedNovel] = useState(() => {
        const saved = localStorage.getItem("selectedNovel");
        return saved ? JSON.parse(saved) : null;
    });

    // ── Fetch Search Overlay Data ─────────────────────────────────
    useEffect(() => {
        const fetchSearchOverlayData = async () => {
            try {
                const [novelRes, catRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/novels`),
                    fetch(`${API_BASE_URL}/categories`)
                ]);
                if (novelRes.ok) {
                    const novelData = await novelRes.json();
                    const list = novelData.novels || novelData.data?.novels || novelData.data || [];
                    const published = list.filter(n => n.status?.toLowerCase() === "published" || n.is_published === true);
                    setAllNovels(published);

                    const sorted = [...published].sort((a, b) => (b.views || b.view_count || 0) - (a.views || a.view_count || 0));
                    setPopularNovels(sorted.slice(0, 5));
                }
                if (catRes.ok) {
                    const catData = await catRes.json();
                    const list = catData.categories || catData.data || [];
                    setOverlayCategories(list.slice(0, 5));
                }
            } catch (e) {
                console.warn("Failed to fetch search overlay data:", e);
            }
        };
        fetchSearchOverlayData();
    }, []);

    // ── Fetch Unread Notification Count ───────────────────────────
    const fetchUnreadCount = async (token) => {
        const t = token || localStorage.getItem("token");
        if (!t) { setUnreadCount(0); return; }
        try {
            const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
                headers: { Authorization: `Bearer ${t}` },
                credentials: "include",
            });
            if (res.ok) {
                // เปลี่ยนชื่อตัวแปรนิดหน่อย จะได้ไม่งง
                const responseJson = await res.json();
                
                // ชี้เป้าไปที่ responseJson.data.unread_count ให้ตรงกับที่ API ส่งมา
                setUnreadCount(Number(responseJson.data?.unread_count || 0));
            }
        } catch (err) {
            console.warn("Failed to fetch notification count:", err);
        }
    };

    // ── Scroll, Auth & Notification Polling Setup ─────────────────
    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 10);
        window.addEventListener("scroll", handleScroll);

        // Restore User from LocalStorage
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                setUserData(prev => ({
                    ...prev,
                    username: parsedUser.username || prev.username,
                    email: parsedUser.email || prev.email,
                    pic_profile: parsedUser.pic_profile || prev.pic_profile,
                    role: parsedUser.role || prev.role,
                }));
            } catch (err) {
                console.warn("ไม่สามารถอ่านข้อมูลผู้ใช้จาก localStorage ได้", err);
            }
        }

        const token = localStorage.getItem("token");
        if (token) {
            setIsLoggedIn(true);
            fetchUserData(token); // จะ setAuthChecked(true) เองตอนโหลด role เสร็จ (ดู fetchUserData ด้านล่าง)
            fetchNovels(token);
            fetchUnreadCount(token);
        } else {
            setUnreadCount(0);
            setAuthChecked(true); // ไม่มี token = รู้ผลแน่นอนแล้วว่าไม่ได้ล็อกอิน ไม่ต้องรอ
        }

        // Custom Event Listener สำหรับอัปเดตแจ้งเตือน
        const refreshNotifications = () => {
            fetchUnreadCount();
        };
        window.addEventListener("notifications-updated", refreshNotifications);
        window.addEventListener("focus", refreshNotifications);

        // 🔄 Polling: เช็กแจ้งเตือนใหม่อัตโนมัติทุกๆ 10 วินาที
        const intervalId = setInterval(() => {
            if (localStorage.getItem("token")) {
                fetchUnreadCount();
            }
        }, 10000);

        // SSE Real-time Notification Stream (ถ้าเซิร์ฟเวอร์รองรับ)
        let eventSource = null;
        if (token) {
            try {
                eventSource = new EventSource(
                    `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
                );
                eventSource.onmessage = refreshNotifications;
            } catch (e) {
                console.warn("SSE connection error:", e);
            }
        }

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("notifications-updated", refreshNotifications);
            window.removeEventListener("focus", refreshNotifications);
            clearInterval(intervalId);
            eventSource?.close();
        };
    }, []);

    // ── Auth Change Listener ──────────────────────────────────────
    useEffect(() => {
        const handleAuthChange = () => {
            const token = localStorage.getItem("token");
            if (token) {
                setIsLoggedIn(true);
                fetchUserData(token);
                fetchNovels(token);
                fetchUnreadCount(token);
            } else {
                setIsLoggedIn(false);
                setUnreadCount(0);
            }
        };

        window.addEventListener("auth-change", handleAuthChange);
        return () => window.removeEventListener("auth-change", handleAuthChange);
    }, []);

    // ── Click Outside Handlers ────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ── Sync Selected Novel ───────────────────────────────────────
    useEffect(() => {
        const syncSelectedNovel = () => {
            const saved = localStorage.getItem("selectedNovel");
            setSelectedNovel(saved ? JSON.parse(saved) : null);
        };
        window.addEventListener("storage", syncSelectedNovel);
        window.addEventListener("novel-selected", syncSelectedNovel);
        syncSelectedNovel();
        return () => {
            window.removeEventListener("storage", syncSelectedNovel);
            window.removeEventListener("novel-selected", syncSelectedNovel);
        };
    }, []);

    // ── Guard: ไม่ใช่นักเขียน ห้ามอยู่ต่อในโหมดนักเขียน ─────────────
    useEffect(() => {
        if (!authChecked) return;           // ยังไม่รู้ผล role ชัวร์ ๆ อย่าเพิ่งตัดสิน
        if (!isWriterMode) return;          // guard เฉพาะตอนอยู่ใน path /writer

        const isWriter = isLoggedIn && userData.role === "writer";
        if (!isWriter) {
            // ผู้เยี่ยมชม / นักอ่านที่ยังไม่สมัครนักเขียน -> เด้งออกทันที
            navigate(isLoggedIn ? "/" : "/login-register", { replace: true });
        }
    }, [authChecked, isWriterMode, isLoggedIn, userData.role, navigate]);

    // ── Fetch Helpers ─────────────────────────────────────────────
    const fetchUserData = async (token) => {
        setIsLoadingUser(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data.user) {
                setUserData({
                    username: data.user.username || "",
                    email: data.user.email || "",
                    pic_profile: data.user.pic_profile || "",
                    role: data.user.role || "",
                });
                localStorage.setItem("user", JSON.stringify(data.user));
                localStorage.setItem("user_email", data.user.email);
            }
        } catch (err) {
            console.error("Error fetching user data:", err);
        } finally {
            setIsLoadingUser(false);
            setAuthChecked(true); // ตอนนี้รู้ role ชัวร์แล้ว ค่อยอนุญาตให้เช็คสิทธิ์ต่อ
        }
    };

    const fetchNovels = async (token) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/me/novels`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("โหลดนิยายไม่สำเร็จ");
            const data = await response.json();
            const novelList = data?.novels || data?.data?.novels || [];
            setNovels(Array.isArray(novelList) ? novelList : []);
        } catch (err) {
            console.error("โหลดนิยายล้มเหลว:", err);
        }
    };

    // ── Search & Filter Logic ─────────────────────────────────────
    const matchingNovels = useMemo(() => {
        if (!searchValue.trim()) return [];
        const q = searchValue.toLowerCase().trim();
        return allNovels.filter(n =>
            (n.title && n.title.toLowerCase().includes(q)) ||
            (n.pen_name && n.pen_name.toLowerCase().includes(q)) ||
            (n.penName && n.penName.toLowerCase().includes(q))
        ).slice(0, 3);
    }, [searchValue, allNovels]);

    const highlightText = (text, highlight) => {
        if (!highlight.trim()) return text;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === highlight.toLowerCase()
                        ? <span key={i} style={{ color: "#db2777", fontWeight: "800" }}>{part}</span>
                        : part
                )}
            </span>
        );
    };

    const handleSearchSubmit = (query) => {
        if (!query.trim()) return;
        const q = query.trim();
        setRecentSearches(prev => {
            const next = [q, ...prev.filter(item => item !== q)].slice(0, 5);
            localStorage.setItem("recent_searches", JSON.stringify(next));
            return next;
        });
        window.dispatchEvent(new CustomEvent("search-change", { detail: q }));
        navigate(`/search?search=${encodeURIComponent(q)}`);
        setSearchFocused(false);
        setSearchValue("");
    };

    const handleDeleteRecentSearch = (e, q) => {
        e.preventDefault();
        e.stopPropagation();
        setRecentSearches(prev => {
            const next = prev.filter(item => item !== q);
            localStorage.setItem("recent_searches", JSON.stringify(next));
            return next;
        });
    };

    const filteredNovels = useMemo(() => {
        return novels.filter((novel) =>
            novel.title?.toLowerCase().includes(searchNovel.toLowerCase())
        );
    }, [novels, searchNovel]);

    // ── Writer Action Navigation ──────────────────────────────────
    const navigateToNovelPage = async (novelId, target) => {
        if (target === "chapters") {
            window.location.href = `/writer/${novelId}/chapters`;
            return;
        }
        if (target === "tree") {
            window.location.href = `/writer/${novelId}/storytree`;
            return;
        }
        if (target === "analytics") {
            window.location.href = `/writer/${novelId}/analytics`;
            return;
        }
        if (target === "write") {
            try {
                const token = localStorage.getItem("token");
                const headers = { Authorization: `Bearer ${token}` };

                const chapterRes = await fetch(`${API_BASE_URL}/novels/${novelId}/chapters`, { headers });
                const chapterData = await chapterRes.json();
                const chapters = chapterData?.data?.chapters || chapterData?.chapters || chapterData?.data || [];

                if (!chapters.length) {
                    window.location.href = `/writer/${novelId}/scene/empty?reason=no-chapters`;
                    return;
                }

                let foundSceneId = null;
                for (const ch of chapters) {
                    const chId = ch.id || ch.chapter_id || ch.ChapterID;
                    if (!chId) continue;

                    const sceneRes = await fetch(`${API_BASE_URL}/chapters/${chId}/scenes`, { headers });
                    const sceneData = await sceneRes.json();
                    const scenes = sceneData?.data?.scenes || sceneData?.scenes || sceneData?.data || [];

                    if (scenes.length > 0) {
                        foundSceneId = scenes[0].id || scenes[0].scene_id || scenes[0].SceneID;
                        break;
                    }
                }

                if (!foundSceneId) {
                    window.location.href = `/writer/${novelId}/scene/empty?reason=no-scenes`;
                    return;
                }

                window.location.href = `/writer/${novelId}/scene/${foundSceneId}`;
            } catch (err) {
                console.error("ดึงข้อมูลฉากแรกล้มเหลว:", err);
                window.location.href = `/writer/${novelId}/scene/empty?reason=no-chapters`;
            }
            return;
        }

        if (!target) {
            window.location.reload();
        }
    };

    const handleSelectNovel = async (novel) => {
        setSelectedNovel(novel);
        localStorage.setItem("selectedNovel", JSON.stringify(novel));

        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("novel-selected"));
        setShowNovelPopup(false);

        const novelId = novel.id || novel.novel_id;
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const chapterRes = await fetch(`${API_BASE_URL}/novels/${novelId}/chapters`, { headers });
            const chapterData = await chapterRes.json();
            const chapters = chapterData?.data?.chapters || chapterData?.chapters || chapterData?.data || [];

            if (!chapters.length) {
                window.location.href = `/writer/${novelId}/chapters`;
                return;
            }

            const firstChapter = chapters[0];
            const firstChapterId = firstChapter.id || firstChapter.chapter_id || firstChapter.ChapterID;

            const sceneRes = await fetch(`${API_BASE_URL}/chapters/${firstChapterId}/scenes`, { headers });
            const sceneData = await sceneRes.json();
            const scenes = sceneData?.data?.scenes || sceneData?.scenes || sceneData?.data || [];

            if (!scenes.length) {
                window.location.href = `/writer/${novelId}/chapters`;
                return;
            }

            const firstScene = scenes[0];
            const firstSceneId = firstScene.id || firstScene.scene_id || firstScene.SceneID;

            const currentPath = location.pathname;

            if (currentPath.includes("/scene/")) {
                window.location.href = `/writer/${novelId}/scene/${firstSceneId}`;
                return;
            }
            if (currentPath.includes("/chapters")) {
                window.location.href = `/writer/${novelId}/chapters`;
                return;
            }
            if (currentPath.includes("/storytree")) {
                window.location.href = `/writer/${novelId}/storytree`;
                return;
            }

            window.location.href = `/writer/${novelId}/scene/${firstSceneId}`;
        } catch (err) {
            console.error("เปลี่ยนนิยายล้มเหลว:", err);
            window.location.href = `/writer/${novelId}/chapters`;
        }
    };

    const openNovelPopup = (target = null) => {
        setPopupTarget(target);
        setSearchNovel("");
        setShowNovelPopup(true);
    };

    const handleNovelMenu = async (target) => {
        if (!selectedNovel) {
            openNovelPopup(target);
            return;
        }
        const novelId = selectedNovel.id || selectedNovel.novel_id;
        await navigateToNovelPage(novelId, target);
    };

    // ── Logout Handler ────────────────────────────────────────────
    const handleLogout = async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        try {
            const token = localStorage.getItem("token");
            if (token) {
                await fetch(`${API_BASE_URL}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }).catch(err => console.warn("Logout API warning:", err));
            }
        } catch (err) {
            console.error("Logout error:", err);
        } finally {
            ["token", "refresh_token", "user", "user_email", "selectedNovel"].forEach(k =>
                localStorage.removeItem(k)
            );

            setSelectedNovel(null);
            setIsLoggedIn(false);
            setIsDropdownOpen(false);
            setUnreadCount(0);
            setUserData({ username: "", email: "", pic_profile: "", role: "" });

            window.dispatchEvent(new Event("auth-change"));
            navigate("/", { replace: true });
            window.location.replace("/");
        }
    };

    // ยังไม่รู้ผล role ชัวร์ๆ หรือรู้แล้วว่าไม่ใช่นักเขียน -> อย่าเพิ่ง render เครื่องมือนักเขียนออกไป
    // (กันแฟลชโชว์ navbar นักเขียนก่อน redirect จะทำงาน)
    if (isWriterMode && (!authChecked || !(isLoggedIn && userData.role === "writer"))) {
        return null;
    }

    return (
        <>
            <nav className={`nav-header ${isScrolled ? "nav-sticky" : ""}`}>
                <div className="nav-container">

                    {/* Logo */}
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

                    {/* Mode Toggle */}
                    <div className="mode-toggle">
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

                    {/* ปุ่มเมนูมือถือ */}
                    <button
                        type="button"
                        className="nav-hamburger"
                        onClick={() => setIsMenuOpen((prev) => !prev)}
                        aria-label={isMenuOpen ? "ปิดเมนู" : "เปิดเมนู"}
                        aria-expanded={isMenuOpen}
                    >
                        {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>

                    {/* Backdrop Overlay สำหรับเมนูมือถือ */}
                    <div
                        className={`nav-menu-overlay ${isMenuOpen ? "active" : ""}`}
                        onClick={() => setIsMenuOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Center Menu */}
                    <ul className={`nav-menu ${isMenuOpen ? "active" : ""}`}>
                        <li className="nav-menu__drawer-header">
                            <div className="nav-menu__drawer-title">
                                <span>{isWriterMode ? "เมนูนักเขียน" : "เมนูหลัก"}</span>
                            </div>
                            <button
                                type="button"
                                className="nav-menu__drawer-close"
                                onClick={() => setIsMenuOpen(false)}
                                aria-label="ปิดเมนู"
                            >
                                <X size={20} />
                            </button>
                        </li>

                        {!isWriterMode ? (
                            <>
                                <li className={`nav-item ${location.pathname === '/' ? 'active-menu' : ''}`}>
                                    <Link to="/" onClick={() => setIsMenuOpen(false)}>หน้าแรก</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith('/categories') ? 'active-menu' : ''}`}>
                                    <Link to="/categories" onClick={() => setIsMenuOpen(false)}>หมวดหมู่</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith('/bookshelf') ? 'active-menu' : ''}`}>
                                    <Link to="/bookshelf" onClick={() => setIsMenuOpen(false)}>ชั้นหนังสือ</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith('/history') ? 'active-menu' : ''}`}>
                                    <Link to="/history" onClick={() => setIsMenuOpen(false)}>ประวัติการอ่าน</Link>
                                </li>
                                <li className={`nav-item ${location.pathname.startsWith('/following-writers') ? 'active-menu' : ''}`}>
                                    <Link to="/following-writers" onClick={() => setIsMenuOpen(false)}>นักเขียนที่ติดตาม</Link>
                                </li>
                                {userData.role === "writer" && (
                                    <li className={`nav-item ${location.pathname.startsWith('/writer/dashboard') ? 'active-menu' : ''}`}>
                                        <Link to="/writer/dashboard" onClick={() => setIsMenuOpen(false)}>สตูดิโอนักเขียน</Link>
                                    </li>
                                )}
                            </>
                        ) : (
                            <>
                                <li className={`nav-item ${location.pathname === '/writer/dashboard' ? 'active-menu' : ''}`}>
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

                                {selectedNovel && (
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
                        )}
                    </ul>

                    {/* Right Menu */}
                    <div className="navbar__right">

                        {/* ชิปชื่อนิยายที่กำลังแก้อยู่ (โหมดนักเขียน) — ด้านหน้ากระดิ่ง/โปรไฟล์ */}
                        {isWriterMode && selectedNovel && (
                            <button
                                type="button"
                                className="selected-novel-btn"
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    openNovelPopup(popupTarget);
                                }}
                                title="คลิกเพื่อเปลี่ยนนิยายที่กำลังแก้ไข"
                            >
                                <span className="selected-dot"></span>
                                <span className="selected-title">
                                    {selectedNovel.title || "ไม่ระบุชื่อนิยาย"}
                                </span>
                            </button>
                        )}

                        {/* Search Zone */}
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
                                                            const cleanCats = rawCats.map(c => typeof c === "string" ? c : (c.name || c.title)).slice(0, 2).join(", ");
                                                            const chapterCount = novel.chapters_count || (novel.chapters ? novel.chapters.length : 0) || 0;

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
                                                                            <img src={(novel.cover_image || novel.coverImage).replace("http://minio:9000", "http://localhost:9000")} alt="" />
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
                                                        <h4 className="search-overlay-title">🕒 ค้นหาล่าสุด</h4>
                                                        <div className="search-overlay-recent-list">
                                                            {recentSearches.map((item, idx) => (
                                                                <div key={idx} className="search-overlay-recent-item">
                                                                    <span className="recent-text" onClick={() => handleSearchSubmit(item)}>
                                                                        {item}
                                                                    </span>
                                                                    <button type="button" className="recent-delete-btn" onClick={(e) => handleDeleteRecentSearch(e, item)} title="ลบประวัติ">
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {popularNovels.length > 0 && (
                                                    <div className="search-overlay-section">
                                                        <h4 className="search-overlay-title">🔥 กำลังเป็นที่นิยม</h4>
                                                        <div className="search-overlay-popular-list">
                                                            {popularNovels.map((novel, idx) => {
                                                                const views = novel.views || novel.view_count || 0;
                                                                const formattedViews = views >= 1000 ? `${(views / 1000).toFixed(1)}k` : views;
                                                                return (
                                                                    <div key={idx} className="search-overlay-popular-item" onClick={() => { setSearchFocused(false); navigate(`/novel/${novel.id || novel.novel_id}`); }}>
                                                                        <span className="popular-badge">{idx + 1}</span>
                                                                        <div className="popular-info">
                                                                            <span className="popular-title">{novel.title}</span>
                                                                            <span className="popular-meta">✍️ {novel.pen_name || novel.penName || "ไม่ระบุ"} • 👁️ {formattedViews} ยอดอ่าน</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {overlayCategories.length > 0 && (
                                                    <div className="search-overlay-section">
                                                        <h4 className="search-overlay-title">🗂️ สำรวจหมวดหมู่</h4>
                                                        <div className="search-overlay-category-list">
                                                            {overlayCategories.map((cat, idx) => (
                                                                <button key={idx} type="button" className="search-overlay-cat-chip" onClick={() => { setSearchFocused(false); navigate(`/categories`); window.dispatchEvent(new CustomEvent("search-change", { detail: "" })); }}>
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

                        {/* 🔔 ปุ่มกระดิ่งแจ้งเตือน */}
                        {isLoggedIn && (
                            <button
                                type="button"
                                className="navbar__notification-btn"
                                onClick={() => navigate("/notifications")}
                                aria-label="การแจ้งเตือน"
                            >
                                <Bell size={20} strokeWidth={2.2} />
                                
                                {unreadCount > 0 && (
                                    <span className="navbar__notification-badge">
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Profile Dropdown */}
                        <div className="nav-profile-container" ref={dropdownRef}>
                            <button
                                type="button"
                                className="nav-profile-trigger"
                                onClick={() => setIsDropdownOpen(prev => !prev)}
                                aria-label="เมนูผู้ใช้งาน"
                            >
                                <img
                                    src={userData.pic_profile || "https://api.dicebear.com/7.x/bottts/svg?seed=storyverse"}
                                    alt="avatar"
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
                                            {userData.username || userData.email}
                                        </p>
                                    </div>
                                    <hr className="nav-dropdown__divider" />

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

                                    <hr className="nav-dropdown__divider" style={{ marginTop: "4px", marginBottom: "10px" }} />

                                    <button
                                        type="button"
                                        className="nav-dropdown__logout-btn"
                                        onClick={() => {
                                            setIsDropdownOpen(false);
                                            setShowLogoutModal(true);
                                        }}
                                    >
                                        <LogOut size={16} />
                                        <span>ออกจากระบบ</span>
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </nav>

            {/* Novel Selection Popup */}
            {showNovelPopup && (
                <div className="novel-popup-overlay" onClick={() => setShowNovelPopup(false)}>
                    <div className="novel-popup" onClick={(e) => e.stopPropagation()}>
                        <div className="novel-popup__header">
                            <div>
                                <h3>เลือกนิยาย</h3>
                                <p>เลือกนิยายที่ต้องการแก้ไข</p>
                            </div>
                            <button className="novel-popup__close" onClick={() => setShowNovelPopup(false)}>
                                ✕
                            </button>
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
                                filteredNovels.map((novel) => {
                                    const isActiveNovel = selectedNovel && (selectedNovel.id || selectedNovel.novel_id) === (novel.id || novel.novel_id);
                                    return (
                                        <button
                                            key={novel.id || novel.novel_id}
                                            className={`novel-popup__item ${isActiveNovel ? "novel-popup__item--active" : ""}`}
                                            onClick={() => handleSelectNovel(novel)}
                                        >
                                            <div className="novel-popup__cover">
                                                {novel.cover_image ? (
                                                    <img src={novel.cover_image.replace("http://minio:9000", "http://localhost:9000")} alt="" />
                                                ) : "📖"}
                                            </div>

                                            <div className="novel-popup__info">
                                                <div className="novel-popup__title">{novel.title}</div>
                                                <div className="novel-popup__meta">{getNovelStatusInfo(novel).label}</div>
                                                {isActiveNovel && (
                                                    <div style={{
                                                        marginTop: "8px", background: "#ffe4f1", color: "#d63384",
                                                        padding: "6px 10px", borderRadius: "999px", fontSize: "12px",
                                                        fontWeight: "600", width: "fit-content"
                                                    }}>
                                                        ✨ กำลังแก้ไขนิยายเรื่องนี้อยู่
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Logout Modal */}
            {showLogoutModal && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                    backgroundColor: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                    display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999999, padding: "20px"
                }}>
                    <div style={{
                        background: "#ffffff", width: "100%", maxWidth: "350px", borderRadius: "24px",
                        boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04)",
                        padding: "28px 24px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center"
                    }}>
                        <div style={{
                            width: "60px", height: "60px", borderRadius: "18px", background: "#FFF0F6", border: "1px solid #FCE7F3",
                            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px"
                        }}>
                            <LogOut size={26} color="#E91E8C" strokeWidth={2.2} />
                        </div>
                        <h3 style={{ fontSize: "19px", fontWeight: "800", color: "#0F172A", margin: "0 0 8px 0" }}>
                            ยืนยันการออกจากระบบ
                        </h3>
                        <p style={{ fontSize: "13.5px", color: "#64748b", margin: "0 0 24px 0", lineHeight: "1.5" }}>
                            คุณต้องการออกจากระบบบัญชีผู้ใช้งานนี้ใช่หรือไม่?
                        </p>
                        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                            <button
                                type="button"
                                onClick={() => setShowLogoutModal(false)}
                                style={{
                                    flex: 1, padding: "11px 16px", borderRadius: "14px", border: "1.5px solid #F1F5F9",
                                    background: "#ffffff", color: "#1E293B", fontSize: "14px", fontWeight: "700", cursor: "pointer",
                                    transition: "all 0.2s ease"
                                }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    setShowLogoutModal(false);
                                    handleLogout(e);
                                }}
                                style={{
                                    flex: 1.1, padding: "11px 16px", borderRadius: "14px", border: "none",
                                    background: "#E91E8C", color: "#ffffff",
                                    fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 14px rgba(233, 30, 140, 0.35)",
                                    transition: "all 0.2s ease"
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

export default Navbarwriter;