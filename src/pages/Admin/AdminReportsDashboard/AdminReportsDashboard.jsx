import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    Search,
    X,
    Check,
    RotateCw,
    ExternalLink,
    Loader2,
    AlertTriangle,
    Inbox,
    Eye,
    Ban,
    Trash2,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    Flag,
    BookOpen,
    FileText,
    Undo2,
    Clock,
    ShieldCheck,
    RotateCcw,
    Calendar,
    ArrowDown,
    ArrowUp
} from "lucide-react";
import "./AdminReportsDashboard.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// แปลงวันที่เป็นรูปแบบภาษาไทยที่อ่านง่าย
const formatThaiDate = (dateString) => {
    if (!dateString) return "-";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "-";
        return date.toLocaleDateString("th-TH", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "-";
    }
};

// ล้าง HTML tags
const stripHtml = (text) => {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, "").trim();
};

const getApiErrorMessage = async (res, fallback) => {
    try {
        const data = await res.json();
        return data?.error?.message || data?.message || fallback;
    } catch {
        return fallback;
    }
};

// 🟢 Component for displaying Category Tags in Table (Explicit 2-Row Grid: Line 1 = Cats 1-2, Line 2 = Cats 3-4 + [+N หมวด])
function CategoryTagsWithPopover({ categories }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const containerRef = useRef(null);

    const catList = Array.isArray(categories) ? categories : [];

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const showPopover = isOpen || isHovered;

    if (catList.length === 0) {
        return <span className="admin-text-subtle">-</span>;
    }

    const line1 = catList.slice(0, 2);
    const line2 = catList.slice(2, 4);
    const remainingCount = catList.length > 4 ? catList.length - 4 : 0;
    const hasMore = remainingCount > 0;

    return (
        <div 
            ref={containerRef}
            className={`admin-cat-2row-container ${showPopover ? "is-popover-open" : ""}`}
        >
            {/* Line 1: หมวดหมู่ 1-2 */}
            <div className="admin-cat-row">
                {line1.map((cat, idx) => (
                    <span key={idx} className="category-badge-unified" title={cat}>
                        {cat}
                    </span>
                ))}
            </div>

            {/* Line 2: หมวดหมู่ 3-4 + [+N หมวด] */}
            {(line2.length > 0 || hasMore) && (
                <div className="admin-cat-row">
                    {line2.map((cat, idx) => (
                        <span key={idx} className="category-badge-unified" title={cat}>
                            {cat}
                        </span>
                    ))}

                    {hasMore && (
                        <div 
                            className="category-more-badge-container"
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                        >
                            <button
                                type="button"
                                className={`category-badge-more ${showPopover ? "is-active" : ""}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsOpen((prev) => !prev);
                                }}
                                title="คลิกหรือชี้เพื่อดูหมวดหมู่ทั้งหมด"
                            >
                                +{remainingCount} หมวด
                            </button>

                            {showPopover && (
                                <div className="category-popover-card" onClick={(e) => e.stopPropagation()}>
                                    <div className="category-popover-header">
                                        <span>หมวดหมู่ทั้งหมด ({catList.length})</span>
                                    </div>
                                    <div className="category-popover-body">
                                        {catList.map((cat, idx) => (
                                            <span key={idx} className="category-badge-unified" title={cat}>
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function AdminReportsDashboard() {
    // -------------------------------------------------------------
    // Tab Navigation State: "stories" (จัดการเรื่อง) | "reports" (รายงาน / แจ้งลบ)
    // -------------------------------------------------------------
    const [activeTab, setActiveTab] = useState("stories");

    // -------------------------------------------------------------
    // Data States
    // -------------------------------------------------------------
    const [novels, setNovels] = useState([]);
    const [categories, setCategories] = useState([]);
    const [reports, setReports] = useState([]);
    const [reportStats, setReportStats] = useState({ pending: 0, resolved: 0, rejected: 0 });
    const [storyTotal, setStoryTotal] = useState(0);
    const [reportTotal, setReportTotal] = useState(0);

    const [loadingStories, setLoadingStories] = useState(false);
    const [loadingReports, setLoadingReports] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [storiesError, setStoriesError] = useState("");
    const [reportsError, setReportsError] = useState("");
    const [toastMessage, setToastMessage] = useState(null);

    // -------------------------------------------------------------
    // Tab 1: Stories Filters & Search
    // -------------------------------------------------------------
    const [storySearch, setStorySearch] = useState("");
    const [debouncedStorySearch, setDebouncedStorySearch] = useState("");
    const [storyStatusFilter, setStoryStatusFilter] = useState("all"); // all, published, suspended
    const [storyCategoryFilter, setStoryCategoryFilter] = useState("all");
    const [storySortOrder, setStorySortOrder] = useState("desc"); // 'desc' = ใหม่ไปเก่า, 'asc' = เก่าไปใหม่
    const [storyPage, setStoryPage] = useState(1);
    const [storyPageSize, setStoryPageSize] = useState(20);

    // -------------------------------------------------------------
    // Tab 2: Reports Filters & Search
    // -------------------------------------------------------------
    const [reportSearch, setReportSearch] = useState("");
    const [debouncedReportSearch, setDebouncedReportSearch] = useState("");
    const [reportStatusFilter, setReportStatusFilter] = useState("all"); // all, pending, resolved, rejected
    const [reportTypeFilter, setReportTypeFilter] = useState("all"); // all, report, appeal
    const [reportPage, setReportPage] = useState(1);
    const [reportPageSize, setReportPageSize] = useState(20);

    // -------------------------------------------------------------
    // Modals & Drawers States
    // -------------------------------------------------------------
    // Story Actions Modal
    const [storyModalType, setStoryModalType] = useState(null); // 'suspend' | 'unsuspend' | 'delete' | null
    const [selectedStory, setSelectedStory] = useState(null);
    const [actionReason, setActionReason] = useState("");
    const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
    const [actionSubmitting, setActionSubmitting] = useState(false);
    const [actionError, setActionError] = useState("");

    // Report Review Modal
    const [selectedReport, setSelectedReport] = useState(null);
    const [reportDecisionReason, setReportDecisionReason] = useState("");
    const [reportActionSubmitting, setReportActionSubmitting] = useState(false);
    const [reportActionError, setReportActionError] = useState("");

    // -------------------------------------------------------------
    // Debounce Search Inputs
    // -------------------------------------------------------------
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedStorySearch(storySearch);
            setStoryPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [storySearch]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedReportSearch(reportSearch);
            setReportPage(1);
        }, 350);
        return () => clearTimeout(timer);
    }, [reportSearch]);

    // -------------------------------------------------------------
    // Toast Notification Auto-hide
    // -------------------------------------------------------------
    const showToast = (message, type = "success") => {
        setToastMessage({ message, type });
        setTimeout(() => {
            setToastMessage(null);
        }, 4000);
    };

    // -------------------------------------------------------------
    // Fetch Data
    // -------------------------------------------------------------
    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/categories`);
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                setCategories(list);
            }
        } catch (err) {
            console.warn("Fetch categories error:", err);
        }
    }, []);

    const fetchStories = useCallback(async (silent = false) => {
        if (!silent) setLoadingStories(true);
        setStoriesError("");
        const token = localStorage.getItem("token");

        try {
            const headers = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const params = new URLSearchParams({
                search: debouncedStorySearch.trim(),
                status: storyStatusFilter,
                page: String(storyPage),
                limit: String(storyPageSize),
            });
            if (storyCategoryFilter !== "all") params.set("category_id", storyCategoryFilter);
            const res = await fetch(`${API_BASE_URL}/api/admin/novels?${params}`, { headers });
            if (!res.ok) {
                if (res.status === 401) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
                if (res.status === 403) throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
                throw new Error(await getApiErrorMessage(res, "ไม่สามารถโหลดรายการเรื่องได้ กรุณาลองใหม่อีกครั้ง"));
            }

            const data = await res.json();
            const list = Array.isArray(data) ? data : (data?.novels ?? data?.data ?? []);
            setNovels(list);
            setStoryTotal(Number(data?.total ?? list.length));
        } catch (err) {
            console.error("Fetch stories error:", err);
            setStoriesError(err.message || "เกิดข้อผิดพลาดในการโหลดรายการเรื่อง");
        } finally {
            if (!silent) setLoadingStories(false);
        }
    }, [debouncedStorySearch, storyCategoryFilter, storyPage, storyPageSize, storyStatusFilter]);

    const fetchReports = useCallback(async (silent = false) => {
        if (!silent) setLoadingReports(true);
        setReportsError("");
        const token = localStorage.getItem("token");

        try {
            const params = new URLSearchParams({
                status: reportStatusFilter,
                type: reportTypeFilter,
                search: debouncedReportSearch.trim(),
                page: String(reportPage),
                limit: String(reportPageSize),
            });
            const res = await fetch(`${API_BASE_URL}/api/admin/reports?${params}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                if (res.status === 401) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
                if (res.status === 403) throw new Error("คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
                throw new Error(await getApiErrorMessage(res, "ไม่สามารถดึงข้อมูลรายการรายงานได้ กรุณาลองใหม่อีกครั้ง"));
            }

            const data = await res.json();
            const list = Array.isArray(data) ? data : (data?.reports ?? []);
            setReports(list);
            setReportTotal(Number(data?.total ?? list.length));
        } catch (err) {
            console.error("Fetch reports error:", err);
            setReportsError(err.message || "เกิดข้อผิดพลาดในการโหลดรายการรายงาน");
        } finally {
            if (!silent) setLoadingReports(false);
        }
    }, [debouncedReportSearch, reportPage, reportPageSize, reportStatusFilter, reportTypeFilter]);

    const fetchReportStats = useCallback(async () => {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const getCount = async (status) => {
            const params = new URLSearchParams({ status, type: "all", page: "1", limit: "1" });
            const res = await fetch(`${API_BASE_URL}/api/admin/reports?${params}`, { headers });
            if (!res.ok) throw new Error(await getApiErrorMessage(res, "ไม่สามารถดึงสรุปจำนวนรายงานได้"));
            const data = await res.json();
            return Number(data?.total ?? 0);
        };

        try {
            const [pending, resolved, rejected] = await Promise.all([
                getCount("pending"),
                getCount("resolved"),
                getCount("rejected"),
            ]);
            setReportStats({
                pending,
                resolved,
                rejected,
            });
        } catch (err) {
            console.warn("Fetch report stats error:", err);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        void fetchReportStats();
        if (activeTab === "stories") {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void fetchStories();
            return;
        }

        void fetchReports();
    }, [activeTab, fetchReportStats, fetchReports, fetchStories]);

    // Refresh Handler
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            if (activeTab === "stories") {
                await Promise.all([fetchStories(true), fetchCategories()]);
            } else {
                await Promise.all([fetchReports(true), fetchReportStats()]);
            }
            showToast("รีเฟรชข้อมูลล่าสุดสำเร็จ", "success");
        } catch (e) {
            console.error(e);
        } finally {
            setIsRefreshing(false);
        }
    };

    // -------------------------------------------------------------
    // Helper: Normalize Novel Status & Categories
    // -------------------------------------------------------------
    const getNovelStatusInfo = (novel) => {
        const rawStatus = (novel?.status || novel?.Status || "").toLowerCase();
        const isPublished = novel?.is_published ?? novel?.IsPublished ?? false;

        if (rawStatus === "suspended" || rawStatus === "ระงับ") {
            return {
                key: "suspended",
                label: "ระงับ",
                className: "status-badge status-badge--suspended",
            };
        }
        if (rawStatus === "deleted" || rawStatus === "ลบ") {
            return {
                key: "deleted",
                label: "ลบ",
                className: "status-badge status-badge--deleted",
            };
        }
        if (isPublished || rawStatus === "published" || rawStatus === "completed-published") {
            return {
                key: "published",
                label: "เผยแพร่",
                className: "status-badge status-badge--published",
            };
        }
        return {
            key: "draft",
            label: "แบบร่าง",
            className: "status-badge status-badge--draft",
        };
    };

    // 🟢 ดึงรายชื่อหมวดหมู่แบบตัดรายการซ้ำ (Deduplicate)
    const getNovelCategoryNames = (novel) => {
        const rawCats = novel?.categories ?? novel?.Categories ?? novel?.category_ids ?? [];
        if (Array.isArray(rawCats) && rawCats.length > 0) {
            const uniqueNames = [];
            const seen = new Set();

            for (const cat of rawCats) {
                let name = "";
                let id = null;

                if (typeof cat === "string") {
                    name = cat.trim();
                } else if (typeof cat === "object" && cat !== null) {
                    id = cat.category_id ?? cat.CategoryID ?? cat.id;
                    name = (cat.name || cat.Name || cat.title || cat.Title || "").trim();
                    if (!name && id !== null && id !== undefined) {
                        const found = categories.find((c) => Number(c.category_id || c.id) === Number(id));
                        if (found) name = found.name;
                    }
                } else if (typeof cat === "number") {
                    id = cat;
                    const found = categories.find((c) => Number(c.category_id || c.id) === Number(cat));
                    name = found ? found.name : `หมวด ${cat}`;
                }

                if (name) {
                    const norm = name.toLowerCase();
                    if (!seen.has(norm)) {
                        seen.add(norm);
                        uniqueNames.push(name);
                    }
                } else if (id !== null && id !== undefined) {
                    const fallbackName = `หมวด ${id}`;
                    const norm = fallbackName.toLowerCase();
                    if (!seen.has(norm)) {
                        seen.add(norm);
                        uniqueNames.push(fallbackName);
                    }
                }
            }

            if (uniqueNames.length > 0) {
                return uniqueNames;
            }
        }
        if (novel?.category_name) return [novel.category_name];
        return ["ทั่วไป"];
    };

    const sortedStories = useMemo(() => {
        if (!novels || novels.length === 0) return [];
        if (!storySortOrder) return novels;
        return [...novels].sort((a, b) => {
            const timeA = new Date(a.published_at || a.created_at || a.CreatedAt || 0).getTime();
            const timeB = new Date(b.published_at || b.created_at || b.CreatedAt || 0).getTime();
            return storySortOrder === "asc" ? timeA - timeB : timeB - timeA;
        });
    }, [novels, storySortOrder]);

    const paginatedStories = sortedStories;
    const totalStoryPages = Math.ceil(storyTotal / storyPageSize) || 1;
    const paginatedReports = reports;
    const totalReportPages = Math.ceil(reportTotal / reportPageSize) || 1;

    // Pending Reports Count
    const pendingReportsCount = useMemo(() => {
        return reportStats.pending || reports.filter((r) => r.status === "pending" || r.status === "appeal_pending").length || 0;
    }, [reportStats.pending, reports]);

    // -------------------------------------------------------------
    // Story Action Handlers
    // -------------------------------------------------------------
    // Open novel detail in Admin View (reuses NovelDetailPage)
    const handleViewStory = (novelId) => {
        if (!novelId) return;
        window.open(`/novel/${novelId}`, "_blank", "noopener,noreferrer");
    };

    // Open Suspend Modal
    const openSuspendModal = (story) => {
        setSelectedStory(story);
        setStoryModalType("suspend");
        setActionReason("");
        setActionError("");
    };

    // Open Unsuspend Modal
    const openUnsuspendModal = (story) => {
        setSelectedStory(story);
        setStoryModalType("unsuspend");
        setActionReason("");
        setActionError("");
    };

    // Open Delete Modal
    const openDeleteModal = (story) => {
        setSelectedStory(story);
        setStoryModalType("delete");
        setActionReason("");
        setDeleteConfirmChecked(false);
        setActionError("");
    };

    const closeStoryModal = () => {
        if (actionSubmitting) return;
        setStoryModalType(null);
        setSelectedStory(null);
        setActionReason("");
        setDeleteConfirmChecked(false);
        setActionError("");
    };

    // Execute Story Action
    const handleExecuteStoryAction = async () => {
        if (!selectedStory) return;
        const novelId = selectedStory.novel_id || selectedStory.id || selectedStory.NovelID;
        const token = localStorage.getItem("token");

        setActionSubmitting(true);
        setActionError("");

        try {
            if (storyModalType === "suspend" || storyModalType === "delete") {
                const reason = actionReason.trim();
                if (!reason) {
                    throw new Error(storyModalType === "suspend" ? "กรุณาระบุเหตุผลก่อนระงับนิยาย" : "กรุณาระบุเหตุผลก่อนลบนิยาย");
                }
                if (storyModalType === "delete" && !deleteConfirmChecked) {
                    throw new Error("กรุณายืนยันว่าคุณต้องการลบเรื่องนี้จริงเพื่อดำเนินการต่อ");
                }
                const action = storyModalType === "suspend" ? "suspend" : "delete";
                const res = await fetch(`${API_BASE_URL}/api/admin/novels/${novelId}/moderation`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        action,
                        reason: actionReason.trim() || undefined,
                    }),
                });

                if (!res.ok) {
                    if (res.status === 403) throw new Error("คุณไม่มีสิทธิ์ดำเนินการนี้");
                    if (res.status === 409) throw new Error(await getApiErrorMessage(res, "สถานะนิยายไม่รองรับการดำเนินการนี้"));
                    if (res.status === 404) throw new Error("ไม่พบเรื่องที่ต้องการระงับ");
                    throw new Error(await getApiErrorMessage(res, "ไม่สามารถดำเนินการกับเรื่องได้ กรุณาลองใหม่อีกครั้ง"));
                }

                await fetchStories(true);
                showToast(`${storyModalType === "suspend" ? "ระงับ" : "ลบ"}เรื่อง “${selectedStory.title || selectedStory.Title}” สำเร็จ`, "success");
                setStoryModalType(null);
                setSelectedStory(null);
            } else if (storyModalType === "unsuspend") {
                const res = await fetch(`${API_BASE_URL}/api/admin/novels/${novelId}/unban`, {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!res.ok) {
                    if (res.status === 403) throw new Error("คุณไม่มีสิทธิ์ดำเนินการนี้");
                    if (res.status === 409) throw new Error(await getApiErrorMessage(res, "สถานะนิยายไม่รองรับการยกเลิกการระงับ"));
                    if (res.status === 404) throw new Error("ไม่พบเรื่องที่ต้องการยกเลิกการระงับ");
                    throw new Error(await getApiErrorMessage(res, "ไม่สามารถยกเลิกการระงับเรื่องได้ กรุณาลองใหม่อีกครั้ง"));
                }

                await fetchStories(true);
                showToast(`ยกเลิกการระงับเรื่อง “${selectedStory.title || selectedStory.Title}” สำเร็จ`, "success");
                setStoryModalType(null);
                setSelectedStory(null);
            }
        } catch (err) {
            console.error("Execute story action error:", err);
            setActionError(err.message || "เกิดข้อผิดพลาดในการดำเนินการ");
        } finally {
            setActionSubmitting(false);
        }
    };

    // -------------------------------------------------------------
    // Report Action Handlers
    // -------------------------------------------------------------
    const handleUpdateReportStatus = async (report, newStatus) => {
        if (!report) return;
        if (report.report_type === "appeal" && report.status !== "appeal_pending") return;
        setReportActionSubmitting(true);
        setReportActionError("");
        const token = localStorage.getItem("token");

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/reports/${report.report_id}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus, reason: reportDecisionReason.trim() }),
            });

            if (!res.ok) {
                if (res.status === 403) throw new Error("คุณไม่มีสิทธิ์ดำเนินการนี้");
                if (res.status === 409) throw new Error(await getApiErrorMessage(res, "สถานะรายงานไม่รองรับการดำเนินการนี้"));
                if (res.status === 404) throw new Error("ไม่พบรายงานนี้ในระบบ");
                throw new Error(await getApiErrorMessage(res, "ไม่สามารถอัปเดตสถานะรายงานได้ กรุณาลองใหม่อีกครั้ง"));
            }

            await Promise.all([fetchReports(true), fetchReportStats(), fetchStories(true)]);

            const successText =
                newStatus === "resolved"
                    ? report.report_type === "appeal"
                        ? "อนุมัติคำขอปลดแบนเรียบร้อยแล้ว"
                        : "ดำเนินการระงับเรื่องตามรายงานเรียบร้อยแล้ว"
                    : "บันทึกผลพิจารณาเรียบร้อยแล้ว";

            showToast(successText, "success");
            setSelectedReport(null);
        } catch (err) {
            console.error("Update report status error:", err);
            setReportActionError(err.message || "เกิดข้อผิดพลาดในการอัปเดตสถานะ");
        } finally {
            setReportActionSubmitting(false);
        }
    };

    // Helper for Report Status info
    const getReportStatusInfo = (status) => {
        const s = (status || "").toLowerCase();
        if (s === "pending") {
            return { label: "รอตรวจสอบ", className: "report-badge report-badge--pending" };
        }
        if (s === "appeal_pending") {
            return { label: "คำขอปลดแบน", className: "report-badge report-badge--appeal" };
        }
        if (s === "resolved") {
            return { label: "ดำเนินการแล้ว", className: "report-badge report-badge--resolved" };
        }
        if (s === "rejected") {
            return { label: "ปฏิเสธ / ยังมีปัญหา", className: "report-badge report-badge--rejected" };
        }
        return { label: status || "-", className: "report-badge report-badge--neutral" };
    };

    return (
        <div className="admin-content-management">
            {/* Toast Notification */}
            {toastMessage && (
                <div className={`admin-toast admin-toast--${toastMessage.type}`} role="alert">
                    {toastMessage.type === "success" ? (
                        <CheckCircle2 size={18} className="admin-toast__icon" />
                    ) : (
                        <AlertCircle size={18} className="admin-toast__icon" />
                    )}
                    <span className="admin-toast__text">{toastMessage.message}</span>
                    <button
                        type="button"
                        className="admin-toast__close"
                        onClick={() => setToastMessage(null)}
                        aria-label="ปิดแจ้งเตือน"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className="admin-content-container">
                {/* -------------------------------------------------------------
                   1. Header Section
                   ------------------------------------------------------------- */}
                <header className="admin-page-header">
                    <div className="admin-page-header__left">
                        <div className="admin-title-row">
                            <h1 className="admin-page-title">จัดการเนื้อหาและการรายงาน</h1>
                        </div>
                        <p className="admin-page-subtitle">
                            ตรวจสอบและจัดการเรื่อง รวมถึงรายงานและการแจ้งลบจากผู้ใช้
                        </p>
                        {/* Standard Admin Header Decorative Branch Accent */}
                        <svg
                            className="header-branch-accent"
                            viewBox="0 0 200 16"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            <path d="M0 8 H70 M70 8 C 78 8, 78 2, 86 2 H130 M70 8 C 78 8, 78 14, 86 14 H130 M130 2 H200 M130 14 H160" />
                        </svg>
                    </div>

                    <div className="admin-page-header__actions">
                        <button
                            type="button"
                            className="admin-btn admin-btn--refresh"
                            onClick={handleRefresh}
                            disabled={isRefreshing || loadingStories || loadingReports}
                            title="รีเฟรชข้อมูลล่าสุด"
                        >
                            <RotateCw
                                size={15}
                                className={isRefreshing ? "admin-icon-spin" : ""}
                            />
                            <span>{isRefreshing ? "กำลังรีเฟรช..." : "รีเฟรช"}</span>
                        </button>
                    </div>
                </header>

                {/* -------------------------------------------------------------
                   2. Tab Navigation
                   ------------------------------------------------------------- */}
                <div className="admin-tabs-bar" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "stories"}
                        className={`admin-tab-btn ${activeTab === "stories" ? "admin-tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("stories")}
                    >
                        <BookOpen size={18} />
                        <span>จัดการเรื่อง</span>
                        {novels.length > 0 && (
                            <span className="admin-tab-count">{novels.length.toLocaleString()}</span>
                        )}
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "reports"}
                        className={`admin-tab-btn ${activeTab === "reports" ? "admin-tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("reports")}
                    >
                        <Flag size={18} />
                        <span>รายงาน / แจ้งลบ</span>
                        {pendingReportsCount > 0 && (
                            <span className="admin-tab-count admin-tab-count--alert">
                                {pendingReportsCount.toLocaleString()}
                            </span>
                        )}
                    </button>
                </div>

                {/* -------------------------------------------------------------
                   3. TAB 1: จัดการเรื่อง (Story Management)
                   ------------------------------------------------------------- */}
                {activeTab === "stories" && (
                    <div className="admin-tab-pane" role="tabpanel">
                        {/* Error Banner */}
                        {storiesError && (
                            <div className="admin-error-banner" role="alert">
                                <AlertTriangle size={20} className="admin-error-banner__icon" />
                                <div className="admin-error-banner__text">
                                    <strong>เกิดข้อผิดพลาด:</strong> {storiesError}
                                </div>
                                <button
                                    type="button"
                                    className="admin-btn admin-btn--retry"
                                    onClick={() => fetchStories()}
                                >
                                    ลองอีกครั้ง
                                </button>
                            </div>
                        )}

                        {/* Stories Table Card */}
                        <div className="admin-table-card">
                            {/* 🔍 Search Bar & Filters อยู่ภายใน Container เดียวกับ Table */}
                            <div className="admin-table-top-bar">
                                <div className="search-box-wrapper">
                                    <Search className="search-icon" size={16} />
                                    <input
                                        type="text"
                                        className="admin-search-input"
                                        placeholder="ค้นหาชื่อเรื่อง หรือชื่อผู้เขียน..."
                                        value={storySearch}
                                        onChange={(e) => setStorySearch(e.target.value)}
                                    />
                                </div>

                                <div className="filter-controls-group">
                                    <div className="select-filter-item">
                                        <span className="filter-label-text">สถานะ:</span>
                                        <div className="select-filter-wrapper">
                                            <select
                                                className="admin-filter-select"
                                                value={storyStatusFilter}
                                                onChange={(e) => {
                                                    setStoryStatusFilter(e.target.value);
                                                    setStoryPage(1);
                                                }}
                                            >
                                                <option value="all">ทุกสถานะ</option>
                                                <option value="published">เผยแพร่</option>
                                                <option value="suspended">ระงับ</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="select-filter-item">
                                        <span className="filter-label-text">หมวดหมู่:</span>
                                        <div className="select-filter-wrapper">
                                            <select
                                                className="admin-filter-select"
                                                value={storyCategoryFilter}
                                                onChange={(e) => {
                                                    setStoryCategoryFilter(e.target.value);
                                                    setStoryPage(1);
                                                }}
                                            >
                                                <option value="all">ทุกหมวดหมู่</option>
                                                {categories.map((cat) => (
                                                    <option
                                                        key={cat.category_id || cat.id || cat.name}
                                                        value={cat.category_id ?? cat.id}
                                                    >
                                                        {cat.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {(storySearch.trim() !== "" ||
                                        storyStatusFilter !== "all" ||
                                        storyCategoryFilter !== "all" ||
                                        storySortOrder !== "desc") && (
                                        <button
                                            type="button"
                                            className="clear-filter-btn"
                                            onClick={() => {
                                                setStorySearch("");
                                                setStoryStatusFilter("all");
                                                setStoryCategoryFilter("all");
                                                setStorySortOrder("desc");
                                                setStoryPage(1);
                                            }}
                                            title="ล้างตัวกรองทั้งหมด"
                                        >
                                            <RotateCcw size={13} />
                                            <span>ล้างตัวกรอง</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {loadingStories ? (
                                /* Skeleton Rows */
                                <div className="admin-skeleton-table">
                                    <div className="admin-skeleton-header" />
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <div key={i} className="admin-skeleton-row">
                                            <div className="admin-skeleton-cell skeleton-thumb" />
                                            <div className="admin-skeleton-cell skeleton-title" />
                                            <div className="admin-skeleton-cell skeleton-author" />
                                            <div className="admin-skeleton-cell skeleton-badge" />
                                            <div className="admin-skeleton-cell skeleton-status" />
                                            <div className="admin-skeleton-cell skeleton-date" />
                                            <div className="admin-skeleton-cell skeleton-actions" />
                                        </div>
                                    ))}
                                </div>
                            ) : storyTotal === 0 ? (
                                /* Empty State */
                                <div className="admin-empty-state">
                                    <div className="admin-empty-state__icon">
                                        <Inbox size={48} strokeWidth={1.5} />
                                    </div>
                                    <h3 className="admin-empty-state__title">
                                        {storySearch ||
                                        storyStatusFilter !== "all" ||
                                        storyCategoryFilter !== "all"
                                            ? "ไม่พบเรื่องที่ตรงกับเงื่อนไข"
                                            : "ยังไม่มีข้อมูลเรื่องในระบบ"}
                                    </h3>
                                    <p className="admin-empty-state__desc">
                                        {storySearch ||
                                        storyStatusFilter !== "all" ||
                                        storyCategoryFilter !== "all"
                                            ? "ลองเปลี่ยนคำค้นหาหรือตัวกรองใหม่อีกครั้ง"
                                            : "เมื่อมีนิยายสร้างขึ้นในระบบ จะปรากฏในตารางนี้"}
                                    </p>
                                    {(storySearch ||
                                        storyStatusFilter !== "all" ||
                                        storyCategoryFilter !== "all") && (
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn--reset-empty"
                                            onClick={() => {
                                                setStorySearch("");
                                                setStoryStatusFilter("all");
                                                setStoryCategoryFilter("all");
                                                setStoryPage(1);
                                            }}
                                        >
                                            ล้างตัวกรองทั้งหมด
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="admin-table-responsive">
                                        <table className="admin-table">
                                             <thead>
                                                 <tr>
                                                     <th style={{ width: "20%", minWidth: "180px" }}>เรื่อง</th>
                                                     <th style={{ width: "13%", minWidth: "120px" }}>ผู้เขียน</th>
                                                     <th style={{ width: "19%", minWidth: "150px" }}>หมวดหมู่</th>
                                                     <th style={{ width: "10%", minWidth: "90px" }}>สถานะ</th>
                                                     <th style={{ width: "13%", minWidth: "125px" }}>
                                                         <div className="th-date-wrapper">
                                                             <span>วันที่เผยแพร่</span>
                                                             <button
                                                                 type="button"
                                                                 className={`btn-date-sort ${storySortOrder === 'asc' ? 'asc' : 'desc'}`}
                                                                 onClick={() => setStorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                                                 title={storySortOrder === 'desc' ? "เรียงจากใหม่อยู่บน (คลิกเพื่อสลับเป็นเก่าอยู่บน)" : "เรียงจากเก่าอยู่บน (คลิกเพื่อสลับเป็นใหม่อยู่บน)"}
                                                             >
                                                                 <Calendar size={12} />
                                                                 {storySortOrder === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                                                             </button>
                                                         </div>
                                                     </th>
                                                     <th style={{ width: "25%", minWidth: "270px", textAlign: "center" }} className="text-center">การจัดการ</th>
                                                 </tr>
                                             </thead>
                                             <tbody>
                                                 {paginatedStories.map((story) => {
                                                     const novelId = story.novel_id || story.id || story.NovelID;
                                                     const title = story.title || story.Title || "ไม่มีชื่อเรื่อง";
                                                     const cover = story.cover_image || story.CoverImage || "/default-cover.png";
                                                     const authorName =
                                                         story.pen_name ||
                                                         story.PenName ||
                                                         story.author_name ||
                                                         story.AuthorName ||
                                                         story.username ||
                                                         "-";
                                                     const statusInfo = getNovelStatusInfo(story);
                                                     const catNames = getNovelCategoryNames(story);
                                                     const dateStr = story.published_at || story.created_at || story.CreatedAt;

                                                     return (
                                                         <tr key={novelId} className="admin-table-row">
                                                             {/* Story Title & Cover */}
                                                             <td>
                                                                 <div className="admin-story-cell">
                                                                     <img
                                                                         src={cover}
                                                                         alt={title}
                                                                         className="admin-story-thumb"
                                                                         onError={(e) => {
                                                                             e.target.src = "https://placehold.co/80x110/f1f5f9/94a3b8?text=Story";
                                                                         }}
                                                                     />
                                                                     <div className="admin-story-info">
                                                                         <span className="admin-story-title" title={title}>
                                                                             {title}
                                                                         </span>
                                                                     </div>
                                                                 </div>
                                                             </td>

                                                             {/* Author */}
                                                             <td>
                                                                 <span className="admin-text-medium" title={authorName}>{authorName}</span>
                                                             </td>

                                                            {/* Categories (Deduplicated, Max 2 lines with +N Popover) */}
                                                            <td>
                                                                <CategoryTagsWithPopover categories={catNames} />
                                                            </td>

                                                            {/* Status */}
                                                            <td>
                                                                <span className={statusInfo.className}>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </td>

                                                            {/* Published Date */}
                                                            <td>
                                                                <span className="admin-text-subtle">
                                                                    {formatThaiDate(dateStr)}
                                                                </span>
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="text-center align-center">
                                                                <div className="action-cell-content admin-action-group">
                                                                    {/* ดูเรื่อง -> เปิด Admin View หน้ารายละเอียดเรื่อง */}
                                                                    <button
                                                                        type="button"
                                                                        className="admin-action-btn admin-action-btn--view"
                                                                        onClick={() => handleViewStory(novelId)}
                                                                        title="ดูเรื่องในมุมมองผู้ดูแลระบบ"
                                                                    >
                                                                        <Eye size={14} />
                                                                        <span>ดูเรื่อง</span>
                                                                    </button>

                                                                    {/* ระงับเรื่อง / ยกเลิกการระงับ */}
                                                                    {statusInfo.key === "suspended" ? (
                                                                        <button
                                                                            type="button"
                                                                            className="admin-action-btn admin-action-btn--unsuspend"
                                                                            onClick={() => openUnsuspendModal(story)}
                                                                            title="ยกเลิกการระงับเรื่อง"
                                                                        >
                                                                            <Check size={14} />
                                                                            <span>ยกเลิกการระงับ</span>
                                                                        </button>
                                                                    ) : statusInfo.key !== "deleted" ? (
                                                                        <button
                                                                            type="button"
                                                                            className="admin-action-btn admin-action-btn--suspend"
                                                                            onClick={() => openSuspendModal(story)}
                                                                            title="ระงับการเผยแพร่เรื่องนี้"
                                                                        >
                                                                            <Ban size={14} />
                                                                            <span>ระงับ</span>
                                                                        </button>
                                                                    ) : null}

                                                                    {/* ลบเรื่อง */}
                                                                    {statusInfo.key !== "deleted" && (
                                                                        <button
                                                                            type="button"
                                                                            className="admin-action-btn admin-action-btn--delete"
                                                                            onClick={() => openDeleteModal(story)}
                                                                            title="ลบเรื่องนี้ออกจากระบบ"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                            <span>ลบ</span>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Cards View */}
                                    <div className="admin-cards-mobile">
                                        {paginatedStories.map((story) => {
                                            const novelId = story.novel_id || story.id || story.NovelID;
                                            const title = story.title || story.Title || "ไม่มีชื่อเรื่อง";
                                            const cover = story.cover_image || story.CoverImage || "/default-cover.png";
                                            const authorName =
                                                story.pen_name ||
                                                story.PenName ||
                                                story.author_name ||
                                                story.AuthorName ||
                                                story.username ||
                                                "-";
                                            const statusInfo = getNovelStatusInfo(story);
                                            const catNames = getNovelCategoryNames(story);
                                            const dateStr = story.published_at || story.created_at || story.CreatedAt;

                                            return (
                                                <div key={novelId} className="admin-story-card-mobile">
                                                    <div className="admin-story-card-mobile__header">
                                                        <img
                                                            src={cover}
                                                            alt={title}
                                                            className="admin-story-card-mobile__thumb"
                                                            onError={(e) => {
                                                                e.target.src = "https://placehold.co/80x110/f1f5f9/94a3b8?text=Story";
                                                            }}
                                                        />
                                                        <div className="admin-story-card-mobile__meta">
                                                            <div className="admin-story-card-mobile__title">{title}</div>
                                                            <div className="admin-story-card-mobile__author">
                                                                ผู้เขียน: <strong>{authorName}</strong>
                                                            </div>
                                                            <div className="admin-story-card-mobile__status">
                                                                <span className={statusInfo.className}>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="admin-story-card-mobile__cats">
                                                        {catNames.map((cat, idx) => (
                                                            <span key={idx} className="category-badge-unified">
                                                                {cat}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    <div className="admin-story-card-mobile__date">
                                                        เผยแพร่: {formatThaiDate(dateStr)}
                                                    </div>

                                                    <div className="admin-story-card-mobile__actions">
                                                        <button
                                                            type="button"
                                                            className="admin-action-btn admin-action-btn--view"
                                                            onClick={() => handleViewStory(novelId)}
                                                        >
                                                            <Eye size={14} />
                                                            <span>ดูเรื่อง</span>
                                                        </button>

                                                        {statusInfo.key === "suspended" ? (
                                                            <button
                                                                type="button"
                                                                className="admin-action-btn admin-action-btn--unsuspend"
                                                                onClick={() => openUnsuspendModal(story)}
                                                            >
                                                                <Check size={14} />
                                                                <span>ยกเลิกการระงับ</span>
                                                            </button>
                                                        ) : statusInfo.key !== "deleted" ? (
                                                            <button
                                                                type="button"
                                                                className="admin-action-btn admin-action-btn--suspend"
                                                                onClick={() => openSuspendModal(story)}
                                                            >
                                                                <Ban size={14} />
                                                                <span>ระงับ</span>
                                                            </button>
                                                        ) : null}

                                                        {statusInfo.key !== "deleted" && (
                                                            <button
                                                                type="button"
                                                                className="admin-action-btn admin-action-btn--delete"
                                                                onClick={() => openDeleteModal(story)}
                                                            >
                                                                <Trash2 size={14} />
                                                                <span>ลบ</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    <div className="admin-table-footer">
                                        <div className="admin-table-footer-left">
                                            <span className="admin-table-info-text">
                                                แสดง <strong>{storyTotal === 0 ? 0 : (storyPage - 1) * storyPageSize + 1}–{Math.min(storyPage * storyPageSize, storyTotal)}</strong> จาก <strong>{storyTotal.toLocaleString()}</strong> รายการ
                                            </span>

                                            <div className="admin-table-per-page">
                                                <span>แสดงต่อหน้า</span>
                                                <select
                                                    className="admin-per-page-select"
                                                    value={storyPageSize}
                                                    onChange={(e) => {
                                                        setStoryPageSize(Number(e.target.value));
                                                        setStoryPage(1);
                                                    }}
                                                >
                                                    <option value={20}>20</option>
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="admin-pagination-img2">
                                            <button
                                                type="button"
                                                className="page-btn-box"
                                                onClick={() => setStoryPage((prev) => Math.max(1, prev - 1))}
                                                disabled={storyPage === 1}
                                            >
                                                <ChevronLeft size={16} />
                                                <span>ก่อนหน้า</span>
                                            </button>

                                            <span className="page-indicator-text">
                                                หน้า <strong>{storyPage}</strong> จาก <strong>{totalStoryPages}</strong>
                                            </span>

                                            <button
                                                type="button"
                                                className="page-btn-box"
                                                onClick={() => setStoryPage((prev) => Math.min(totalStoryPages, prev + 1))}
                                                disabled={storyPage === totalStoryPages}
                                            >
                                                <span>ถัดไป</span>
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* -------------------------------------------------------------
                   4. TAB 2: รายงาน / แจ้งลบ (Reports & Moderation)
                   ------------------------------------------------------------- */}
                {activeTab === "reports" && (
                    <div className="admin-tab-pane" role="tabpanel">
                        <div className="admin-report-stats-grid" aria-label="สรุปสถานะรายงาน">
                            <button
                                type="button"
                                className={`admin-report-stat-card admin-report-stat-card--pending ${reportStatusFilter === "pending" ? "admin-report-stat-card--active" : ""}`}
                                onClick={() => {
                                    setReportStatusFilter("pending");
                                    setReportPage(1);
                                }}
                                aria-pressed={reportStatusFilter === "pending"}
                            >
                                <span className="admin-report-stat-icon"><Clock size={20} /></span>
                                <span>
                                    <span className="admin-report-stat-label">รอตรวจสอบ</span>
                                    <span className="admin-report-stat-value">{reportStats.pending.toLocaleString()}</span>
                                </span>
                            </button>

                            <button
                                type="button"
                                className={`admin-report-stat-card admin-report-stat-card--resolved ${reportStatusFilter === "resolved" ? "admin-report-stat-card--active" : ""}`}
                                onClick={() => {
                                    setReportStatusFilter("resolved");
                                    setReportPage(1);
                                }}
                                aria-pressed={reportStatusFilter === "resolved"}
                            >
                                <span className="admin-report-stat-icon"><ShieldCheck size={20} /></span>
                                <span>
                                    <span className="admin-report-stat-label">อนุมัติแล้ว</span>
                                    <span className="admin-report-stat-value">{reportStats.resolved.toLocaleString()}</span>
                                </span>
                            </button>

                            <button
                                type="button"
                                className={`admin-report-stat-card admin-report-stat-card--rejected ${reportStatusFilter === "rejected" ? "admin-report-stat-card--active" : ""}`}
                                onClick={() => {
                                    setReportStatusFilter("rejected");
                                    setReportPage(1);
                                }}
                                aria-pressed={reportStatusFilter === "rejected"}
                            >
                                <span className="admin-report-stat-icon"><X size={20} /></span>
                                <span>
                                    <span className="admin-report-stat-label">ปฏิเสธแล้ว</span>
                                    <span className="admin-report-stat-value">{reportStats.rejected.toLocaleString()}</span>
                                </span>
                            </button>
                        </div>

                        {/* Error Banner */}
                        {reportsError && (
                            <div className="admin-error-banner" role="alert">
                                <AlertTriangle size={20} className="admin-error-banner__icon" />
                                <div className="admin-error-banner__text">
                                    <strong>เกิดข้อผิดพลาด:</strong> {reportsError}
                                </div>
                                <button
                                    type="button"
                                    className="admin-btn admin-btn--retry"
                                    onClick={() => fetchReports()}
                                >
                                    ลองอีกครั้ง
                                </button>
                            </div>
                        )}

                        {/* Reports Table Card */}
                        <div className="admin-table-card">
                            {/* 🔍 Search Bar & Filters อยู่ภายใน Container เดียวกับ Table */}
                            <div className="admin-table-top-bar">
                                <div className="search-box-wrapper">
                                    <Search className="search-icon" size={16} />
                                    <input
                                        type="text"
                                        className="admin-search-input"
                                        placeholder="ค้นหาชื่อเรื่อง, ผู้รายงาน หรือเหตุผล..."
                                        value={reportSearch}
                                        onChange={(e) => setReportSearch(e.target.value)}
                                    />
                                </div>

                                <div className="filter-controls-group">
                                    <div className="select-filter-item">
                                        <span className="filter-label-text">สถานะรายงาน:</span>
                                        <div className="select-filter-wrapper">
                                            <select
                                                className="admin-filter-select"
                                                value={reportStatusFilter}
                                                onChange={(e) => {
                                                    setReportStatusFilter(e.target.value);
                                                    setReportPage(1);
                                                }}
                                            >
                                                <option value="all">ทุกสถานะ</option>
                                                <option value="pending">รอตรวจสอบ</option>
                                                <option value="appeal_pending">คำขอปลดแบนรอตรวจสอบ</option>
                                                <option value="resolved">ดำเนินการแล้ว (อนุมัติ)</option>
                                                <option value="rejected">ไม่พบการละเมิด (ปฏิเสธ)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="select-filter-item">
                                        <span className="filter-label-text">ประเภท:</span>
                                        <div className="select-filter-wrapper">
                                            <select
                                                className="admin-filter-select"
                                                value={reportTypeFilter}
                                                onChange={(e) => {
                                                    setReportTypeFilter(e.target.value);
                                                    setReportPage(1);
                                                }}
                                            >
                                                <option value="all">ทุกประเภท</option>
                                                <option value="report">รายงานเนื้อหา</option>
                                                <option value="appeal">คำขอปลดแบน</option>
                                            </select>
                                        </div>
                                    </div>

                                    {(reportSearch.trim() !== "" ||
                                        reportStatusFilter !== "all" ||
                                        reportTypeFilter !== "all") && (
                                        <button
                                            type="button"
                                            className="clear-filter-btn"
                                            onClick={() => {
                                                setReportSearch("");
                                                setReportStatusFilter("all");
                                                setReportTypeFilter("all");
                                                setReportPage(1);
                                            }}
                                            title="ล้างตัวกรองทั้งหมด"
                                        >
                                            <RotateCcw size={13} />
                                            <span>ล้างตัวกรอง</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            {loadingReports ? (
                                /* Skeleton Rows */
                                <div className="admin-skeleton-table">
                                    <div className="admin-skeleton-header" />
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div key={i} className="admin-skeleton-row">
                                            <div className="admin-skeleton-cell skeleton-title" />
                                            <div className="admin-skeleton-cell skeleton-author" />
                                            <div className="admin-skeleton-cell skeleton-reason" />
                                            <div className="admin-skeleton-cell skeleton-date" />
                                            <div className="admin-skeleton-cell skeleton-status" />
                                            <div className="admin-skeleton-cell skeleton-actions" />
                                        </div>
                                    ))}
                                </div>
                            ) : reportTotal === 0 ? (
                                /* Empty State */
                                <div className="admin-empty-state">
                                    <div className="admin-empty-state__icon">
                                        <Inbox size={48} strokeWidth={1.5} />
                                    </div>
                                    <h3 className="admin-empty-state__title">
                                        {reportSearch ||
                                        reportStatusFilter !== "all" ||
                                        reportTypeFilter !== "all"
                                            ? "ไม่พบรายการรายงานที่ตรงกับเงื่อนไข"
                                            : "ไม่มีรายการรายงานหรือคำขอปลดแบนในขณะนี้"}
                                    </h3>
                                    <p className="admin-empty-state__desc">
                                        เมื่อมีผู้ใช้รายงานเนื้อหาหรือนักเขียนยื่นคำขอปลดแบน จะแสดงที่หน้านี้
                                    </p>
                                    {(reportSearch ||
                                        reportStatusFilter !== "all" ||
                                        reportTypeFilter !== "all") && (
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn--reset-empty"
                                            onClick={() => {
                                                setReportSearch("");
                                                setReportStatusFilter("all");
                                                setReportTypeFilter("all");
                                                setReportPage(1);
                                            }}
                                        >
                                            ล้างตัวกรองทั้งหมด
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="admin-table-responsive">
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                     <th style={{ width: "22%", minWidth: "180px" }}>เรื่องที่รายงาน</th>
                                                     <th style={{ width: "14%", minWidth: "120px" }}>ผู้รายงาน</th>
                                                     <th style={{ width: "21%", minWidth: "170px" }}>เหตุผล</th>
                                                     <th style={{ width: "13%", minWidth: "125px" }}>วันที่รายงาน</th>
                                                     <th style={{ width: "11%", minWidth: "95px" }}>สถานะ</th>
                                                     <th style={{ width: "19%", minWidth: "160px", textAlign: "center" }} className="text-center">การจัดการ</th>
                                                 </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedReports.map((report) => {
                                                    const statusInfo = getReportStatusInfo(report.status);
                                                    const isAppeal = report.report_type === "appeal";
                                                    const cleanReason = stripHtml(report.reason);

                                                    return (
                                                        <tr key={report.report_id} className="admin-table-row">
                                                            {/* Story Title & Cover */}
                                                            <td>
                                                                <div className="admin-story-cell">
                                                                    <img
                                                                        src={report.novel_cover || "/default-cover.png"}
                                                                        alt={report.novel_title}
                                                                        className="admin-story-thumb admin-story-thumb--sm"
                                                                        onError={(e) => {
                                                                            e.target.src = "https://placehold.co/80x110/f1f5f9/94a3b8?text=Cover";
                                                                        }}
                                                                    />
                                                                    <div className="admin-story-info">
                                                                        <span
                                                                            className="admin-story-title"
                                                                            title={report.novel_title}
                                                                        >
                                                                            {report.novel_title || `นิยาย #${report.novel_id}`}
                                                                        </span>
                                                                        <span className="admin-story-id">
                                                                            ผู้เขียน: {report.author_pen_name || "-"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Reporter */}
                                                            <td>
                                                                <span className="admin-text-medium">
                                                                    {isAppeal ? "นักเขียนเจ้าของเรื่อง" : report.username || `User #${report.user_id}`}
                                                                </span>
                                                            </td>

                                                            {/* Reason */}
                                                            <td>
                                                                <span
                                                                    className="admin-reason-cell"
                                                                    title={cleanReason}
                                                                >
                                                                    {cleanReason || "-"}
                                                                </span>
                                                            </td>

                                                            {/* Created Date */}
                                                            <td>
                                                                <span className="admin-text-subtle">
                                                                    {formatThaiDate(report.created_at)}
                                                                </span>
                                                            </td>

                                                            {/* Status */}
                                                            <td>
                                                                <span className={statusInfo.className}>
                                                                    {statusInfo.label}
                                                                </span>
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="text-center align-center">
                                                                <div className="action-cell-content">
                                                                    <button
                                                                        type="button"
                                                                        className="admin-action-btn admin-action-btn--inspect"
                                                                        onClick={() => {
                                                                            setSelectedReport(report);
                                                                            setReportDecisionReason("");
                                                                        }}
                                                                        title="ตรวจสอบรายละเอียดรายงาน"
                                                                    >
                                                                        <FileText size={14} />
                                                                        <span>ตรวจสอบ</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Cards View */}
                                    <div className="admin-cards-mobile">
                                        {paginatedReports.map((report) => {
                                            const statusInfo = getReportStatusInfo(report.status);
                                            const isAppeal = report.report_type === "appeal";
                                            const cleanReason = stripHtml(report.reason);

                                            return (
                                                <div key={report.report_id} className="admin-report-card-mobile">
                                                    <div className="admin-report-card-mobile__header">
                                                        <div className="admin-report-card-mobile__title">
                                                            {report.novel_title || `นิยาย #${report.novel_id}`}
                                                        </div>
                                                        <span className={statusInfo.className}>
                                                            {statusInfo.label}
                                                        </span>
                                                    </div>

                                                    <div className="admin-report-card-mobile__detail">
                                                        <div>
                                                            ผู้รายงาน: <strong>{isAppeal ? "นักเขียนเจ้าของเรื่อง" : report.username || `User #${report.user_id}`}</strong>
                                                        </div>
                                                        <div>
                                                            วันที่: {formatThaiDate(report.created_at)}
                                                        </div>
                                                    </div>

                                                    <div className="admin-report-card-mobile__reason">
                                                        <strong>เหตุผล:</strong> {cleanReason || "-"}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="admin-action-btn admin-action-btn--inspect admin-btn--block"
                                                        onClick={() => {
                                                            setSelectedReport(report);
                                                            setReportDecisionReason("");
                                                        }}
                                                    >
                                                        <FileText size={14} />
                                                        <span>ตรวจสอบรายงาน</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    <div className="admin-table-footer">
                                        <div className="admin-table-footer-left">
                                            <span className="admin-table-info-text">
                                                แสดง <strong>{reportTotal === 0 ? 0 : (reportPage - 1) * reportPageSize + 1}–{Math.min(reportPage * reportPageSize, reportTotal)}</strong> จาก <strong>{reportTotal.toLocaleString()}</strong> รายการ
                                            </span>

                                            <div className="admin-table-per-page">
                                                <span>แสดงต่อหน้า</span>
                                                <select
                                                    className="admin-per-page-select"
                                                    value={reportPageSize}
                                                    onChange={(e) => {
                                                        setReportPageSize(Number(e.target.value));
                                                        setReportPage(1);
                                                    }}
                                                >
                                                    <option value={20}>20</option>
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="admin-pagination-img2">
                                            <button
                                                type="button"
                                                className="page-btn-box"
                                                onClick={() => setReportPage((prev) => Math.max(1, prev - 1))}
                                                disabled={reportPage === 1}
                                            >
                                                <ChevronLeft size={16} />
                                                <span>ก่อนหน้า</span>
                                            </button>

                                            <span className="page-indicator-text">
                                                หน้า <strong>{reportPage}</strong> จาก <strong>{totalReportPages}</strong>
                                            </span>

                                            <button
                                                type="button"
                                                className="page-btn-box"
                                                onClick={() => setReportPage((prev) => Math.min(totalReportPages, prev + 1))}
                                                disabled={reportPage === totalReportPages}
                                            >
                                                <span>ถัดไป</span>
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* -------------------------------------------------------------
               5. Story Action Confirmation Modals (Suspend / Unsuspend / Delete)
               ------------------------------------------------------------- */}
            {storyModalType && selectedStory && (
                <div className="admin-modal-overlay" onClick={closeStoryModal}>
                    <div
                        className="admin-modal-card"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="admin-modal-header">
                            <div className="admin-modal-header__title-group">
                                {storyModalType === "delete" ? (
                                    <div className="admin-modal-icon admin-modal-icon--danger">
                                        <Trash2 size={20} />
                                    </div>
                                ) : storyModalType === "suspend" ? (
                                    <div className="admin-modal-icon admin-modal-icon--warning">
                                        <Ban size={20} />
                                    </div>
                                ) : (
                                    <div className="admin-modal-icon admin-modal-icon--success">
                                        <Check size={20} />
                                    </div>
                                )}
                                <h3 className="admin-modal-title">
                                    {storyModalType === "suspend"
                                        ? "ยืนยันการระงับเรื่อง"
                                        : storyModalType === "unsuspend"
                                        ? "ยืนยันการยกเลิกการระงับ"
                                        : "ยืนยันการลบเรื่อง"}
                                </h3>
                            </div>
                            <button
                                type="button"
                                className="admin-modal-close"
                                onClick={closeStoryModal}
                                disabled={actionSubmitting}
                                aria-label="ปิดกล่องข้อความ"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="admin-modal-body">
                            <p className="admin-modal-question">
                                คุณต้องการ
                                {storyModalType === "suspend"
                                    ? "ระงับการเผยแพร่เรื่อง"
                                    : storyModalType === "unsuspend"
                                    ? "ยกเลิกการระงับและเปิดเผยแพร่เรื่อง"
                                    : "ลบเรื่อง"}{" "}
                                <strong>“{selectedStory.title || selectedStory.Title}”</strong> หรือไม่?
                            </p>

                            {storyModalType === "suspend" && (
                                <p className="admin-modal-consequence">
                                    เมื่อระงับแล้ว ผู้ใช้ทั่วไปจะไม่สามารถค้นหาหรือเปิดอ่านเรื่องนี้ได้จนกว่าจะได้รับการยกเลิกการระงับ
                                </p>
                            )}

                            {storyModalType === "delete" && (
                                <p className="admin-modal-consequence admin-modal-consequence--danger">
                                    การลบจะทำให้เรื่องนี้ไม่แสดงผลบนระบบและไม่สามารถกู้คืนได้ตามปกติ
                                </p>
                            )}

                            {/* Required Reason Input for Suspend & Delete */}
                            {(storyModalType === "suspend" || storyModalType === "delete") && (
                                <div className="admin-modal-form-group">
                                    <label htmlFor="action-reason" className="admin-form-label">
                                        เหตุผลที่ต้องระบุ:
                                    </label>
                                    <textarea
                                        id="action-reason"
                                        className="admin-form-textarea"
                                        rows={3}
                                        placeholder="ระบุเหตุผลในการดำเนินการ..."
                                        value={actionReason}
                                        onChange={(e) => setActionReason(e.target.value)}
                                        disabled={actionSubmitting}
                                    />
                                </div>
                            )}

                            {storyModalType === "delete" && (
                                <label className="admin-confirm-check">
                                    <input
                                        type="checkbox"
                                        checked={deleteConfirmChecked}
                                        onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                                        disabled={actionSubmitting}
                                    />
                                    <span>ฉันยืนยันว่าต้องการลบเรื่องนี้จริง และจะไม่กดโดย mistake</span>
                                </label>
                            )}

                            {/* Action Error */}
                            {actionError && (
                                <div className="admin-modal-error" role="alert">
                                    <AlertCircle size={16} />
                                    <span>{actionError}</span>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="admin-modal-footer">
                            <button
                                type="button"
                                className="admin-btn admin-btn--modal-cancel"
                                onClick={closeStoryModal}
                                disabled={actionSubmitting}
                            >
                                ยกเลิก
                            </button>

                            <button
                                type="button"
                                className={`admin-btn ${
                                    storyModalType === "delete"
                                        ? "admin-btn--modal-danger"
                                        : storyModalType === "suspend"
                                        ? "admin-btn--modal-warning"
                                        : "admin-btn--modal-success"
                                }`}
                                onClick={handleExecuteStoryAction}
                                disabled={actionSubmitting}
                            >
                                {actionSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="admin-icon-spin" />
                                        <span>
                                            {storyModalType === "suspend"
                                                ? "กำลังระงับ..."
                                                : storyModalType === "unsuspend"
                                                ? "กำลังยกเลิก..."
                                                : "กำลังลบ..."}
                                        </span>
                                    </>
                                ) : (
                                    <span>
                                        {storyModalType === "suspend"
                                            ? "ระงับเรื่อง"
                                            : storyModalType === "unsuspend"
                                            ? "ยกเลิกการระงับ"
                                            : "ลบเรื่อง"}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* -------------------------------------------------------------
               6. Report Review Modal / Drawer (ตรวจสอบรายงาน)
               ------------------------------------------------------------- */}
            {selectedReport && (
                <div
                    className="admin-modal-overlay"
                    onClick={() => {
                        if (!reportActionSubmitting) setSelectedReport(null);
                    }}
                >
                    <div
                        className="admin-modal-card admin-modal-card--lg"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="admin-modal-header">
                            <div className="admin-modal-header__title-group">
                                <div className="admin-modal-icon admin-modal-icon--info">
                                    <FileText size={20} />
                                </div>
                                <h3 className="admin-modal-title">
                                    {selectedReport.report_type === "appeal"
                                        ? "ตรวจสอบคำขอปลดแบน"
                                        : "ตรวจสอบรายงานเนื้อหา"}
                                </h3>
                            </div>
                            <button
                                type="button"
                                className="admin-modal-close"
                                onClick={() => setSelectedReport(null)}
                                disabled={reportActionSubmitting}
                                aria-label="ปิดกล่องข้อความ"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="admin-modal-body admin-report-review-body">
                            {/* Report Meta Card */}
                            <div className="admin-review-grid">
                                <div className="admin-review-cover-wrap">
                                    <img
                                        src={selectedReport.novel_cover || "/default-cover.png"}
                                        alt={selectedReport.novel_title}
                                        className="admin-review-cover"
                                        onError={(e) => {
                                            e.target.src = "https://placehold.co/120x160/f1f5f9/94a3b8?text=Cover";
                                        }}
                                    />
                                    {/* Link to Open Story in Admin View */}
                                    <button
                                        type="button"
                                        className="admin-btn admin-btn--view-novel"
                                        onClick={() => handleViewStory(selectedReport.novel_id)}
                                        title="เปิดอ่านเรื่องนี้ในมุมมองผู้ดูแลระบบ"
                                    >
                                        <ExternalLink size={14} />
                                        <span>ดูเนื้อหานิยาย</span>
                                    </button>
                                </div>

                                <div className="admin-review-details">
                                    <div className="admin-review-field">
                                        <label className="admin-review-label">ชื่อเรื่อง:</label>
                                        <div className="admin-review-value admin-review-value--title">
                                            {selectedReport.novel_title || `รหัส #${selectedReport.novel_id}`}
                                        </div>
                                    </div>

                                    <div className="admin-review-row-2col">
                                        <div className="admin-review-field">
                                            <label className="admin-review-label">ผู้เขียน:</label>
                                            <div className="admin-review-value">
                                                {selectedReport.author_pen_name || "-"}
                                            </div>
                                        </div>

                                        <div className="admin-review-field">
                                            <label className="admin-review-label">
                                                {selectedReport.report_type === "appeal"
                                                    ? "ผู้ยื่นคำขอ:"
                                                    : "ผู้รายงาน:"}
                                            </label>
                                            <div className="admin-review-value">
                                                {selectedReport.username || `User #${selectedReport.user_id}`}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-review-row-2col">
                                        <div className="admin-review-field">
                                            <label className="admin-review-label">วันที่ส่งรายการ:</label>
                                            <div className="admin-review-value">
                                                {formatThaiDate(selectedReport.created_at)}
                                            </div>
                                        </div>

                                        <div className="admin-review-field">
                                            <label className="admin-review-label">สถานะปัจจุบัน:</label>
                                            <div>
                                                <span
                                                    className={
                                                        getReportStatusInfo(selectedReport.status).className
                                                    }
                                                >
                                                    {getReportStatusInfo(selectedReport.status).label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-review-field">
                                        <label className="admin-review-label">
                                            {selectedReport.report_type === "appeal"
                                                ? "เหตุผลในการขอปลดแบน:"
                                                : "เหตุผลที่รายงาน:"}
                                        </label>
                                        <div className="admin-review-reason-box">
                                            {stripHtml(selectedReport.reason) || "ไม่ได้ระบุเหตุผล"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Error Notification inside modal */}
                            {reportActionError && (
                                <div className="admin-modal-error" role="alert">
                                    <AlertCircle size={16} />
                                    <span>{reportActionError}</span>
                                </div>
                            )}
                            {((selectedReport.report_type === "appeal" &&
                                selectedReport.status === "appeal_pending") ||
                                (selectedReport.report_type === "report" &&
                                    selectedReport.status === "pending")) && (
                                <div className="admin-modal-form-group">
                                    <label htmlFor="report-decision-reason" className="admin-form-label">
                                        เหตุผลการพิจารณา:
                                    </label>
                                    <textarea
                                        id="report-decision-reason"
                                        className="admin-form-textarea"
                                        rows={3}
                                        value={reportDecisionReason}
                                        onChange={(e) => setReportDecisionReason(e.target.value)}
                                        disabled={reportActionSubmitting}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="admin-modal-footer admin-report-review-footer">
                            <button
                                type="button"
                                className="admin-btn admin-btn--modal-cancel"
                                onClick={() => setSelectedReport(null)}
                                disabled={reportActionSubmitting}
                            >
                                ปิด
                            </button>

                            {/* แสดงปุ่ม Action เฉพาะเมื่อสถานะยังรอการตรวจสอบ (pending หรือ appeal_pending) */}
                            {selectedReport.report_type === "appeal" &&
                            selectedReport.status === "appeal_pending" ? (
                                /* Appeal Actions (รอพิจารณาคำขอปลดแบน) */
                                <div className="admin-review-action-btns">
                                    <button
                                        type="button"
                                        className="admin-btn admin-btn--modal-secondary"
                                        onClick={() => handleUpdateReportStatus(selectedReport, "rejected")}
                                        disabled={reportActionSubmitting}
                                    >
                                        {reportActionSubmitting ? (
                                            <Loader2 size={16} className="admin-icon-spin" />
                                        ) : (
                                            <X size={16} />
                                        )}
                                        <span>ปฏิเสธคำขอปลดแบน</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="admin-btn admin-btn--modal-success"
                                        onClick={() => handleUpdateReportStatus(selectedReport, "resolved")}
                                        disabled={reportActionSubmitting}
                                    >
                                        {reportActionSubmitting ? (
                                            <Loader2 size={16} className="admin-icon-spin" />
                                        ) : (
                                            <Check size={16} />
                                        )}
                                        <span>อนุมัติการปลดแบน</span>
                                    </button>
                                </div>
                            ) : selectedReport.status === "pending" ? (
                                /* Report Actions (รอตรวจสอบรายงานทั่วไป) */
                                <div className="admin-review-action-btns">
                                    <button
                                        type="button"
                                        className="admin-btn admin-btn--modal-secondary"
                                        onClick={() => handleUpdateReportStatus(selectedReport, "rejected")}
                                        disabled={reportActionSubmitting}
                                        title="รายงานนี้ไม่มีมูล / ไม่พบการทำผิดเงื่อนไข"
                                    >
                                        {reportActionSubmitting ? (
                                            <Loader2 size={16} className="admin-icon-spin" />
                                        ) : (
                                            <Check size={16} />
                                        )}
                                        <span>ปฏิเสธรายงาน / ไม่มีการละเมิด</span>
                                    </button>

                                    <button
                                        type="button"
                                        className="admin-btn admin-btn--modal-danger"
                                        onClick={() => handleUpdateReportStatus(selectedReport, "resolved")}
                                        disabled={reportActionSubmitting}
                                        title="พบการละเมิดจริง สั่งระงับเรื่องนี้"
                                    >
                                        {reportActionSubmitting ? (
                                            <Loader2 size={16} className="admin-icon-spin" />
                                        ) : (
                                            <Ban size={16} />
                                        )}
                                        <span>ระงับเรื่อง (อนุมัติรายงาน)</span>
                                    </button>
                                </div>
                            ) : (
                                /* รายการที่ดำเนินการเสร็จสิ้นแล้ว (resolved หรือ rejected) */
                                <div className="admin-review-status-notice">
                                    {selectedReport.status === "resolved" ? (
                                        <span className="notice-badge notice-badge--resolved">
                                            <CheckCircle2 size={15} /> ดำเนินการอนุมัติแล้ว
                                        </span>
                                    ) : (
                                        <span className="notice-badge notice-badge--rejected">
                                            <X size={15} /> ดำเนินการปฏิเสธ / ยังมีปัญหาอยู่
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export function getPendingAppealsList() {
  try {
    const reg = JSON.parse(localStorage.getItem('banned_novels_registry') || '{}');
    const appeals = [];
    Object.keys(reg).forEach((novelId) => {
      const item = reg[novelId];
      if (item && item.appeal_status === 'pending') {
        appeals.push({
          novel_id: novelId,
          novel_title: item.title || item.novel_title || item.Title || ('นิยาย #' + novelId),
          reason: item.appeal_reason || item.reason || 'คำขอปลดระงับจากนักเขียน',
          created_at: item.appeal_at || item.bannedAt || new Date().toISOString(),
          ...item,
        });
      }
    });
    return appeals;
  } catch {
    return [];
  }
}
