import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ============================================================
// useAuthUser — เช็คว่า login อยู่ไหม + ข้อมูล user (role ฯลฯ)
// ใช้ตัวนี้ตัวเดียวทั้งเว็บ กัน role ไม่ตรงกันระหว่างที่ต่างๆ
// ============================================================
export function useAuthUser() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userData, setUserData] = useState({ username: "", email: "", pic_profile: "", role: "" });
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const [authChecked, setAuthChecked] = useState(false); // true = รู้ผลชัวร์แล้ว

    // ไปดึงข้อมูล user จริงจาก API
    const fetchUserData = useCallback(async (token) => {
        setIsLoadingUser(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            if (data.user) {
                const next = {
                    username: data.user.username || "",
                    email: data.user.email || "",
                    pic_profile: data.user.pic_profile || "",
                    role: data.user.role || "",
                };
                setUserData(next);
                localStorage.setItem("user", JSON.stringify(data.user));
                localStorage.setItem("user_email", data.user.email);
            }
        } catch (err) {
            console.error("useAuthUser: fetchUserData error:", err);
        } finally {
            setIsLoadingUser(false);
            setAuthChecked(true);
        }
    }, []);

    // เช็ค token ใน localStorage แล้วตัดสินว่า login อยู่ไหม
    const refreshFromStorage = useCallback(() => {
        const token = localStorage.getItem("token");
        if (token) {
            setIsLoggedIn(true);
            fetchUserData(token);
        } else {
            setIsLoggedIn(false);
            setUserData({ username: "", email: "", pic_profile: "", role: "" });
            setAuthChecked(true);
        }
    }, [fetchUserData]);

    useEffect(() => {
        // โหลด cache เดิมก่อน กันจอกระพริบระหว่างรอ fetch จริง
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
            try {
                const p = JSON.parse(savedUser);
                setUserData((prev) => ({ ...prev, ...p }));
            } catch {
                /* เผื่อ JSON พัง ก็ข้ามไป */
            }
        }

        refreshFromStorage();

        // เผื่อมี tab อื่น login/logout แล้วอยากให้ sync กัน
        window.addEventListener("auth-change", refreshFromStorage);
        return () => window.removeEventListener("auth-change", refreshFromStorage);
    }, [refreshFromStorage]);

    // ออกจากระบบ: ยิง logout API + เคลียร์ localStorage
    const handleLogout = useCallback(async (event) => {
        event?.preventDefault?.();
        try {
            const token = localStorage.getItem("token");
            if (token) {
                await fetch(`${API_BASE_URL}/api/logout`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
            }
        } finally {
            ["token", "refresh_token", "user", "user_email", "selectedNovel"].forEach((k) =>
                localStorage.removeItem(k)
            );
            setIsLoggedIn(false);
            setUserData({ username: "", email: "", pic_profile: "", role: "" });
            window.dispatchEvent(new Event("auth-change"));
        }
    }, []);

    return { isLoggedIn, userData, isLoadingUser, authChecked, handleLogout };
}

// ============================================================
// useNotifications — นับแจ้งเตือนที่ยังไม่อ่าน (badge บนกระดิ่ง)
// รีเฟรชอัตโนมัติ: polling ทุก 10 วิ + SSE + ตอน focus tab
// ============================================================
export function useNotifications(isLoggedIn) {
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchUnreadCount = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) {
            setUnreadCount(0);
            return;
        }
        try {
            const headers = { Authorization: `Bearer ${token}` };

            // 1. Fetch settings
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

            // 2. Fetch notifications to calculate setting-filtered count
            const res = await fetch(`${API_BASE_URL}/notifications?limit=100`, {
                headers,
                credentials: "include",
            });
            if (res.ok) {
                const payload = await res.json();
                const data = payload?.data ?? payload;
                const list = Array.isArray(data) ? data : Array.isArray(data?.notifications) ? data.notifications : [];
                
                const filteredUnread = list.filter(item => {
                    const isRead = Boolean(item.is_read ?? item.read);
                    if (isRead) return false;

                    const type = item.type === "follow" ? "follower" : item.type || "system";
                    if (type === "novel_update" && settings.novel_updates === false) return false;
                    if (type === "follower" && settings.follows === false) return false;
                    if (type === "comment" && settings.comments === false) return false;
                    if (type === "like" && settings.likes === false) return false;
                    if (type === "system" && settings.in_app_notifications === false) return false;

                    return true;
                });
                
                setUnreadCount(filteredUnread.length);
            }
        } catch (err) {
            console.warn("useNotifications: fetch error:", err);
        }
    }, []);

    useEffect(() => {
        if (!isLoggedIn) {
            setUnreadCount(0);
            return;
        }

        fetchUnreadCount();

        const refresh = () => fetchUnreadCount();
        window.addEventListener("notifications-updated", refresh);
        window.addEventListener("focus", refresh);
        const intervalId = setInterval(refresh, 60000);

        // ต่อ SSE ไว้ด้วย เผื่อมีแจ้งเตือนใหม่แบบ real-time
        const token = localStorage.getItem("token");
        let eventSource = null;
        if (token) {
            try {
                eventSource = new EventSource(
                    `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
                );
                eventSource.onmessage = refresh;
            } catch (e) {
                console.warn("useNotifications: SSE error:", e);
            }
        }

        return () => {
            window.removeEventListener("notifications-updated", refresh);
            window.removeEventListener("focus", refresh);
            clearInterval(intervalId);
            eventSource?.close();
        };
    }, [isLoggedIn, fetchUnreadCount]);

    return { unreadCount };
}

// ============================================================
// useNavSearch — logic กล่องค้นหา + overlay (ล่าสุด/ยอดนิยม/หมวดหมู่)
// ============================================================
export function useNavSearch() {
    const navigate = useNavigate();
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
    const [categories, setCategories] = useState([]);
    const [allNovels, setAllNovels] = useState([]);

    // โหลดข้อมูลนิยาย/หมวดหมู่ไว้ใช้ใน overlay ตอนเปิดหน้า
    useEffect(() => {
        const run = async () => {
            try {
                const [novelRes, catRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/novels`),
                    fetch(`${API_BASE_URL}/categories`),
                ]);
                if (novelRes.ok) {
                    const d = await novelRes.json();
                    const list = d.novels || d.data?.novels || d.data || [];
                    const published = list.filter(
                        (n) => n.status?.toLowerCase() === "published" || n.is_published === true
                    );
                    setAllNovels(published);
                    const sorted = [...published].sort(
                        (a, b) => (b.views || b.view_count || 0) - (a.views || a.view_count || 0)
                    );
                    setPopularNovels(sorted.slice(0, 5));

                    if (catRes.ok) {
                        const catData = await catRes.json();
                        const rawCats = catData.categories || catData.data || [];

                        // นับจำนวนนิยายที่เผยแพร่แล้วในแต่ละหมวดหมู่
                        const counts = {};
                        published.forEach((novel) => {
                            const raw = novel.categories || novel.Categories || novel.category_ids || [];
                            const cleanCats = Array.isArray(raw)
                                ? raw.map((c) => {
                                      if (!c) return "";
                                      if (typeof c === "string") return c.trim();
                                      return String(c.name || c.Title || c.title || c.label || "").trim();
                                  }).filter(Boolean)
                                : [];
                            cleanCats.forEach((name) => {
                                counts[name] = (counts[name] || 0) + 1;
                            });
                        });

                        const processedCats = (Array.isArray(rawCats) ? rawCats : []).map((c) => {
                            const catName = String(c.name || c.title || c.label || "").trim();
                            return {
                                id: c.category_id || c.id,
                                name: catName,
                                count: counts[catName] || 0,
                            };
                        });

                        // เรียงลำดับจากหมวดหมู่ที่มีนิยายเยอะสุดไปน้อยสุด
                        processedCats.sort((a, b) => b.count - a.count);
                        setCategories(processedCats);
                    }
                }
            } catch (e) {
                console.warn("useNavSearch: load overlay data error:", e);
            }
        };
        run();
    }, []);

    // นิยายที่ตรงกับคำค้นหา (เอาแค่ 3 อันดับแรกพอ)
    const matchingNovels = useMemo(() => {
        if (!searchValue.trim()) return [];
        const q = searchValue.toLowerCase().trim();
        return allNovels
            .filter(
                (n) =>
                    n.title?.toLowerCase().includes(q) ||
                    n.pen_name?.toLowerCase().includes(q) ||
                    n.penName?.toLowerCase().includes(q)
            )
            .slice(0, 3);
    }, [searchValue, allNovels]);

    // ไฮไลต์คำที่ตรงกับที่พิมพ์ค้นหา
    const highlightText = useCallback((text, highlight) => {
        if (!highlight.trim()) return text;
        const parts = text.split(new RegExp(`(${highlight})`, "gi"));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === highlight.toLowerCase() ? (
                        <span key={i} style={{ color: "#db2777", fontWeight: 800 }}>{part}</span>
                    ) : (
                        part
                    )
                )}
            </span>
        );
    }, []);

    // กดค้นหาจริง: เก็บประวัติ + ไปหน้าผลลัพธ์
    const handleSearchSubmit = useCallback(
        (query) => {
            if (!query.trim()) return;
            const q = query.trim();
            setRecentSearches((prev) => {
                const next = [q, ...prev.filter((item) => item !== q)].slice(0, 5);
                localStorage.setItem("recent_searches", JSON.stringify(next));
                return next;
            });
            navigate(`/search?search=${encodeURIComponent(q)}`);
            setSearchFocused(false);
            setSearchValue("");
        },
        [navigate]
    );

    // ลบประวัติค้นหาทีละอัน
    const handleDeleteRecentSearch = useCallback((e, q) => {
        e.preventDefault();
        e.stopPropagation();
        setRecentSearches((prev) => {
            const next = prev.filter((item) => item !== q);
            localStorage.setItem("recent_searches", JSON.stringify(next));
            return next;
        });
    }, []);

    return {
        searchValue, setSearchValue,
        searchFocused, setSearchFocused,
        recentSearches, popularNovels, categories, allNovels,
        matchingNovels, highlightText,
        handleSearchSubmit, handleDeleteRecentSearch,
    };
}