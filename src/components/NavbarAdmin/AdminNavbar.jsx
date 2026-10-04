import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./AdminNavbar.css";
import {
    LayoutDashboard,
    Users,
    BadgeCheck,
    Flag,
    Shield,
    LogOut,
    FolderTree,
    ScrollText,
    Menu,
    X
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const AdminNavbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dropdownRef = useRef(null);

    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [userData, setUserData] = useState({
        username: "Admin",
        email: "",
        pic_profile: "",
    });

    useEffect(() => {
        setIsMenuOpen(false);
        setIsDropdownOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isMenuOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                setUserData((prev) => ({
                    ...prev,
                    username: parsedUser.username || prev.username,
                    email: parsedUser.email || prev.email,
                    pic_profile: parsedUser.pic_profile || prev.pic_profile,
                }));
            } catch (err) {
                console.warn("ไม่สามารถอ่านข้อมูลผู้ใช้จาก localStorage ได้", err);
            }
        }
    }, []);

    const isActive = (path) => {
        if (path === "/admin/dashboard") {
            return location.pathname === "/admin/dashboard" || location.pathname === "/admin";
        }
        if (path === "/admin/reports") {
            return location.pathname === "/admin/reports" || location.pathname === "/admin/content-reports";
        }
        return location.pathname.startsWith(path);
    };

    const handleLogout = async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        console.log("🚪 Admin logout clicked");

        try {
            const token = localStorage.getItem("token");
            if (token) {
                await fetch(`${API_BASE_URL}/api/logout`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }).catch((err) => console.warn("Logout API warning:", err));
            }
        } catch (err) {
            console.error("Logout error:", err);
        } finally {
            localStorage.removeItem("token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("user");
            localStorage.removeItem("user_email");
            localStorage.removeItem("selectedNovel");
            setIsDropdownOpen(false);
            navigate("/", { replace: true });
            window.location.replace("/");
        }
    };

    return (
        <>
            <header className={`admin-nav-header ${isScrolled ? "admin-nav-sticky" : ""}`}>
                <div className="admin-nav-container">
                    {/* Left: Brand Logo + StoryVerse + Admin Mode */}
                    <div
                        className="admin-nav-logo"
                        onClick={() => {
                            setIsMenuOpen(false);
                            navigate("/admin/dashboard");
                        }}
                    >
                        <img src="/logo192.png" alt="Logo" className="logo-img" />
                        <div className="admin-nav-logo-text">
                            <span className="admin-nav-logo-story">Story</span>
                            <span className="admin-nav-logo-verse">Verse</span>
                            <span className="admin-nav-logo-mode">Admin Mode</span>
                        </div>
                    </div>

                    {/* Center: Desktop Navigation Menu */}
                    <ul className="admin-nav-menu">
                        <li className={`admin-nav-item ${isActive("/admin/dashboard") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/dashboard">
                                <LayoutDashboard size={18} strokeWidth={2} />
                                <span>แดชบอร์ด</span>
                            </Link>
                        </li>

                        <li className={`admin-nav-item ${isActive("/admin/users") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/users">
                                <Users size={18} strokeWidth={2} />
                                <span>จัดการผู้ใช้</span>
                            </Link>
                        </li>

                        <li className={`admin-nav-item ${isActive("/admin/manage-users") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/manage-users">
                                <BadgeCheck size={18} strokeWidth={2} />
                                <span>อนุมัตินักเขียน</span>
                            </Link>
                        </li>

                        <li className={`admin-nav-item ${isActive("/admin/reports") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/reports">
                                <Flag size={18} strokeWidth={2} />
                                <span>จัดการเนื้อหาและการรายงาน</span>
                            </Link>
                        </li>

                        <li className={`admin-nav-item ${isActive("/admin/categories") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/categories">
                                <FolderTree size={18} strokeWidth={2} />
                                <span>จัดการหมวดหมู่</span>
                            </Link>
                        </li>

                        <li className={`admin-nav-item ${isActive("/admin/audit-logs") ? "admin-nav-item--active" : ""}`}>
                            <Link to="/admin/audit-logs">
                                <ScrollText size={18} strokeWidth={2} />
                                <span>ประวัติการใช้งาน</span>
                            </Link>
                        </li>
                    </ul>

                    {/* Right side: Admin Pill + Profile Avatar + Hamburger */}
                    <div className="admin-nav-right">
                        <div className="admin-role-pill">
                            <Shield size={14} className="admin-role-pill__icon" />
                            <span>Admin</span>
                        </div>

                        <div className="admin-profile-container" ref={dropdownRef}>
                            <button
                                type="button"
                                className="admin-profile-trigger"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                aria-label="เมนูผู้ใช้งาน"
                            >
                                <img
                                    src={
                                        userData.pic_profile ||
                                        "https://api.dicebear.com/7.x/bottts/svg?seed=storyverse-admin"
                                    }
                                    alt="avatar"
                                />
                            </button>

                            {isDropdownOpen && (
                                <div className="admin-dropdown">
                                    <div className="admin-dropdown__user-info">
                                        <p className="admin-dropdown__status">ADMIN</p>
                                        <p className="admin-dropdown__name">{userData.username || "ผู้ดูแลระบบ"}</p>
                                        <p className="admin-dropdown__email">
                                            {userData.email || "admin@storyverse.local"}
                                        </p>
                                    </div>
                                    <hr className="admin-dropdown__divider" />
                                    <button
                                        type="button"
                                        className="admin-dropdown__logout-btn"
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

                        {/* Hamburger Button for Mobile/Tablet */}
                        <button
                            type="button"
                            className="admin-nav-hamburger"
                            onClick={() => setIsMenuOpen(true)}
                            aria-label="เปิดแถบเมนูด้านข้าง"
                            aria-expanded={isMenuOpen}
                        >
                            <Menu size={22} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Backdrop Overlay สำหรับ Slide-out Drawer */}
            <div
                className={`admin-drawer-overlay ${isMenuOpen ? "active" : ""}`}
                onClick={() => setIsMenuOpen(false)}
                aria-hidden="true"
            />

            {/* Slide-out Mobile Drawer */}
            <aside className={`admin-drawer ${isMenuOpen ? "active" : ""}`} aria-label="แถบเมนูด้านข้างผู้ดูแลระบบ">
                {/* 1. Drawer Header */}
                <div className="admin-drawer__header">
                    <div
                        className="admin-nav-logo"
                        onClick={() => {
                            setIsMenuOpen(false);
                            navigate("/admin/dashboard");
                        }}
                    >
                        <img src="/logo192.png" alt="Logo" className="logo-img" />
                        <div className="admin-nav-logo-text">
                            <span className="admin-nav-logo-story">Story</span>
                            <span className="admin-nav-logo-verse">Verse</span>
                            <span className="admin-nav-logo-mode">Admin Mode</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="admin-drawer__close-btn"
                        onClick={() => setIsMenuOpen(false)}
                        aria-label="ปิดแถบเมนู"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* 2. Drawer Body (Categorized Menu Sections) */}
                <div className="admin-drawer__body">
                    {/* Section: เมนูแอดมิน */}
                    <div className="admin-drawer__section-title">เมนูแอดมิน</div>
                    <nav className="admin-drawer__nav-list">
                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/dashboard") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/dashboard");
                            }}
                        >
                            <LayoutDashboard size={19} className="admin-drawer__item-icon" />
                            <span>แดชบอร์ด</span>
                        </button>
                    </nav>

                    {/* Section: ผู้ใช้ */}
                    <div className="admin-drawer__section-title">ผู้ใช้</div>
                    <nav className="admin-drawer__nav-list">
                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/users") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/users");
                            }}
                        >
                            <Users size={19} className="admin-drawer__item-icon" />
                            <span>จัดการผู้ใช้</span>
                        </button>

                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/manage-users") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/manage-users");
                            }}
                        >
                            <BadgeCheck size={19} className="admin-drawer__item-icon" />
                            <span>อนุมัตินักเขียน</span>
                        </button>
                    </nav>

                    {/* Section: เนื้อหา */}
                    <div className="admin-drawer__section-title">เนื้อหา</div>
                    <nav className="admin-drawer__nav-list">
                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/reports") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/reports");
                            }}
                        >
                            <Flag size={19} className="admin-drawer__item-icon" />
                            <span>จัดการเนื้อหาและการรายงาน</span>
                        </button>

                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/categories") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/categories");
                            }}
                        >
                            <FolderTree size={19} className="admin-drawer__item-icon" />
                            <span>จัดการหมวดหมู่</span>
                        </button>
                    </nav>

                    {/* Section: ระบบ */}
                    <div className="admin-drawer__section-title">ระบบ</div>
                    <nav className="admin-drawer__nav-list">
                        <button
                            type="button"
                            className={`admin-drawer__nav-item ${isActive("/admin/audit-logs") ? "active" : ""}`}
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate("/admin/audit-logs");
                            }}
                        >
                            <ScrollText size={19} className="admin-drawer__item-icon" />
                            <span>ประวัติการใช้งาน</span>
                        </button>

                        <button
                            type="button"
                            className="admin-drawer__nav-item admin-drawer__nav-item--logout"
                            onClick={() => {
                                setIsMenuOpen(false);
                                setShowLogoutModal(true);
                            }}
                        >
                            <LogOut size={19} className="admin-drawer__item-icon" />
                            <span>ออกจากระบบ</span>
                        </button>
                    </nav>
                </div>

                {/* 3. Drawer Footer */}
                <div className="admin-drawer__footer">
                    <div className="admin-drawer__footer-user">
                        <div className="admin-drawer__footer-avatar">
                            {userData.pic_profile ? (
                                <img src={userData.pic_profile} alt="" className="admin-drawer__avatar-img" />
                            ) : (
                                <Shield size={20} color="#64748b" />
                            )}
                        </div>
                        <div className="admin-drawer__footer-details">
                            <span className="admin-drawer__footer-name">
                                {userData.username || "ผู้ดูแลระบบ"}
                            </span>
                            <span className="admin-drawer__footer-role">
                                ผู้ดูแลระบบ (Admin)
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="admin-drawer__footer-logout-btn"
                        onClick={() => {
                            setIsMenuOpen(false);
                            setShowLogoutModal(true);
                        }}
                    >
                        ออก
                    </button>
                </div>
            </aside>

            {/* Modal ยืนยันการออกจากระบบสำหรับแอดมิน */}
            {showLogoutModal && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                    backgroundColor: "rgba(15, 23, 42, 0.45)",
                    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    zIndex: 999999, padding: "20px"
                }}>
                    <div style={{
                        background: "#ffffff", width: "100%", maxWidth: "350px",
                        borderRadius: "24px",
                        boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04)",
                        padding: "28px 24px 24px", textAlign: "center",
                        display: "flex", flexDirection: "column", alignItems: "center"
                    }}>
                        <div style={{
                            width: "60px", height: "60px", borderRadius: "18px",
                            background: "#FFF0F6", border: "1px solid #FCE7F3",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            marginBottom: "16px"
                        }}>
                            <LogOut size={26} color="#E91E8C" strokeWidth={2.2} />
                        </div>
                        <h3 style={{ fontSize: "19px", fontWeight: "800", color: "#0F172A", margin: "0 0 8px 0" }}>
                            ยืนยันการออกจากระบบ
                        </h3>
                        <p style={{ fontSize: "13.5px", color: "#64748b", margin: "0 0 24px 0", lineHeight: "1.5" }}>
                            คุณต้องการออกจากระบบบัญชีผู้ดูแลระบบใช่หรือไม่?
                        </p>
                        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                            <button
                                type="button"
                                onClick={() => setShowLogoutModal(false)}
                                style={{
                                    flex: 1, padding: "11px 16px", borderRadius: "14px",
                                    border: "1.5px solid #F1F5F9", background: "#ffffff",
                                    color: "#1E293B", fontSize: "14px", fontWeight: "700",
                                    cursor: "pointer", transition: "all 0.2s ease"
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
                                    flex: 1.1, padding: "11px 16px", borderRadius: "14px",
                                    border: "none", background: "#E91E8C",
                                    color: "#ffffff", fontSize: "14px", fontWeight: "700",
                                    cursor: "pointer", boxShadow: "0 4px 14px rgba(233, 30, 140, 0.35)",
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

export default AdminNavbar;