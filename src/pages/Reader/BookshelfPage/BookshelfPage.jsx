import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { NovelCardGridSkeleton, ButtonSpinner } from "../../../components/Skeleton";
import "./BookshelfPage.css";
import {
    ArrowLeft,
    Trash2,
    BookOpen,
    Play,
    RotateCw,
    Pencil,
    Clock,
    Eye,
    Heart,
    Bookmark,
    Map,
    X,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const formatNumber = (num) => {
    if (!num) return 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M+";
    if (num >= 1000) return (num / 1000).toFixed(1) + "k+";
    return num;
};

const THAI_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

const formatThaiDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear() + 543;
    return `${day} ${month} ${year}`;
};

const formatThaiDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
};

const formatLastReadInfo = (book) => {
    if (book.reading_status === "want_to_read") {
        return "";
    }
    if (book.lastReadAt) {
        const dateTimeStr = formatThaiDateTime(book.lastReadAt);
        if (dateTimeStr) return `อ่านล่าสุด ${dateTimeStr}`;
    }
    return "";
};

const FILTER_OPTIONS = [
    { value: "all", label: "ทั้งหมด" },
    { value: "want_to_read", label: "ยังไม่อ่าน" },
    { value: "reading", label: "กำลังอ่าน" },
    { value: "finished", label: "อ่านจบแล้ว" },
];

const formatMinioUrl = (url) => {
    if (!url) return "https://via.placeholder.com/320x420";
    return url.replace("http://minio:9000", "http://localhost:9000");
};

// 🔗 เชื่อมต่อ GET /api/v1/bookshelves?user_id=:id: เพื่อดึงรายการนิยายในชั้นหนังสือของผู้อ่าน
const getBookshelfApiUrl = (userId) => {
    const base = `${API_BASE_URL}/api/v1/bookshelves`;
    return userId ? `${base}?user_id=${userId}` : base;
};

const extractBookshelfList = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    // Check top-level properties
    if (Array.isArray(payload.bookshelf)) return payload.bookshelf;
    if (Array.isArray(payload.bookshelves)) return payload.bookshelves;
    if (Array.isArray(payload.books)) return payload.books;
    if (Array.isArray(payload.novels)) return payload.novels;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;

    // Check nested payload.data properties (e.g. { data: { bookshelf: [...] } })
    if (payload.data && typeof payload.data === "object") {
        if (Array.isArray(payload.data.bookshelf)) return payload.data.bookshelf;
        if (Array.isArray(payload.data.bookshelves)) return payload.data.bookshelves;
        if (Array.isArray(payload.data.books)) return payload.data.books;
        if (Array.isArray(payload.data.novels)) return payload.data.novels;
        if (Array.isArray(payload.data.items)) return payload.data.items;
        if (Array.isArray(payload.data.data)) return payload.data.data;
        if (Array.isArray(payload.data.results)) return payload.data.results;
    }

    return [];
};

const normalizeCategoryName = (cat) => {
    if (!cat) return "";
    if (typeof cat === "string") return cat.trim();
    if (typeof cat === "number") return String(cat);
    return String(cat.name || cat.Name || cat.title || cat.label || cat.label_th || "").trim();
};

const stripHtml = (html = "") => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || "").trim();
};

const getBookId = (item = {}) => {
    return item.novel_id || item.id || item._id || item.novel?.id || 0;
};

// นิยายจะถือว่า "จบ" ก็ต่อเมื่อตัวนิยายเองถูกทำเครื่องหมายว่าจบแล้วโดยผู้เขียน/ระบบ
// เช่น "completed" / "finished" / "จบแล้ว" เท่านั้น การอ่านถึงฉากล่าสุดที่มีอยู่
// ไม่ได้แปลว่านิยายจบ (นิยายอาจจะยังเขียนไม่จบ หรือฉากล่าสุดไม่ใช่ฉากจบเรื่องจริงๆ)
const NOVEL_COMPLETED_VALUES = new Set([
    "completed",
    "complete",
    "finished",
    "end",
    "completed-published",
    "completed-draft",
    "จบแล้ว",
]);

const isNovelCompleted = (novelStatus) =>
    NOVEL_COMPLETED_VALUES.has(String(novelStatus || "").trim().toLowerCase());

/**
 * สถานะการอ่านของ "ผู้ใช้" ต้องแยกออกจากสถานะของ "นิยาย" ให้ชัดเจน:
 *  - explicitStatus: สถานะการอ่านของผู้ใช้ที่ backend ส่งมาตรงๆ (ถ้ามี ให้เชื่อค่านี้เป็นหลัก)
 *  - novelStatus: สถานะของตัวนิยายเอง (จบแล้ว/ยังเขียนอยู่) — ใช้ตัดสินร่วมกับ reachedEnding เท่านั้น
 *  - reachedEnding: ผู้ใช้อ่านไปถึง "ฉากจบ" ของเส้นทางใดเส้นทางหนึ่งจริงๆ หรือไม่
 *    (ไม่ใช่แค่ "มีฉากล่าสุดที่ยังไม่ได้อ่านต่อ" หรือ "นิยายมี ending อยู่บ้าง")
 *
 * ถ้า backend ยังไม่มี field บอก reachedEnding ตรงๆ ให้ทีม backend เพิ่ม field นี้มาด้วย
 * (เช่น is_ending บน scene ปัจจุบัน) ไม่ควรเดาจาก ending_count ของทั้งเรื่อง เพราะนั่นคือ
 * จำนวน ending ทั้งหมดที่นิยายมี ไม่ใช่ว่าผู้ใช้คนนี้อ่านถึงหรือยัง
 */
const normalizeReadingStatus = ({ explicitStatus, novelStatus, reachedEnding, currentSceneId }) => {
    const raw = String(explicitStatus || "").trim().toLowerCase();
    if (raw === "want_to_read" || raw === "reading" || raw === "finished") {
        return raw;
    }

    if (isNovelCompleted(novelStatus) && reachedEnding) {
        return "finished";
    }

    if (currentSceneId > 0) return "reading";
    return "want_to_read";
};

const normalizeBook = (item) => {
    // สถานะของ "ตัวนิยาย" เอง (จบแล้ว/ยังเขียนอยู่) แยกจากสถานะการอ่านของผู้ใช้
    const novelStatus = item.status || item.novel_status || item.novel?.status || item.novel_completion_status;
    const novelCompleted = item.is_completed === true || item.novel?.is_completed === true || isNovelCompleted(novelStatus);

    // ผู้ใช้อ่านไปถึงฉากจบจริงๆ หรือไม่ (ต้องเป็นสัญญาณเฉพาะผู้ใช้ ไม่ใช่สถิติรวมของนิยาย)
    const reachedEnding = Boolean(
        item.reached_ending ??
        item.is_ending ??
        item.ending_reached ??
        item.current_scene?.is_ending ??
        item.currentScene?.isEnding ??
        false
    );

    const currentSceneId =
        item.current_scene_id ??
        item.currentSceneId ??
        item.novel?.current_scene_id ??
        item.novel?.CurrentSceneID ??
        0;

    return {
        id: getBookId(item),

        title:
            item.title ||
            item.novel?.title ||
            "ไม่มีชื่อเรื่อง",

        author:
            item.pen_name ||
            item.penName ||
            item.author_pen_name ||
            item.author_penName ||
            item.author_name ||
            item.authorName ||
            item.author?.name ||
            item.novel?.pen_name ||
            item.novel?.author_name ||
            "ไม่ทราบผู้แต่ง",

        // คำโปรยของนิยาย — backend ส่งมาเป็น "captions" (เผื่อ endpoint อื่นใช้ชื่ออื่น จึงเก็บ fallback เดิมไว้ด้วย)
        description: stripHtml(
            item.captions ||
            item.novel?.captions ||
            item.description ||
            item.synopsis ||
            item.blurb ||
            item.novel?.description ||
            item.novel?.synopsis ||
            ""
        ),

        categories: (() => {
            const cats =
                item.categories ??
                item.Categories ??
                item.CategoryIDs ??
                item.category_ids ??
                item.novel?.categories ??
                item.novel?.Categories ??
                item.novel?.category_ids ??
                item.novel?.CategoryIDs ??
                [];

            if (!Array.isArray(cats) || cats.length === 0) return ["ทั่วไป"];

            const cleanCats = cats.map(normalizeCategoryName).filter(Boolean);
            const uniqueCats = Array.from(new Set(cleanCats));
            return uniqueCats.length > 0 ? uniqueCats : ["ทั่วไป"];
        })(),

        coverImage: formatMinioUrl(
            item.cover_image ||
            item.coverImage ||
            item.novel?.cover_image
        ),

        reading_status: normalizeReadingStatus({
            explicitStatus: item.reading_status || item.status,
            novelStatus,
            reachedEnding,
            currentSceneId,
        }),
        novelCompleted,

        latestChapter:
            item.latest_chapter ||
            item.latestChapter ||
            item.last_chapter ||
            item.chapter_title ||
            "ยังไม่มีตอน",

        lastReadAt:
            item.last_read_at ||
            item.lastReadAt ||
            item.updated_at ||
            item.updatedAt ||
            null,

        savedAt:
            item.created_at ||
            item.createdAt ||
            item.saved_at ||
            null,

        lastReadSceneTitle:
            item.last_read_scene_title ||
            item.lastReadSceneTitle ||
            "ยังไม่มีประวัติการอ่าน",

        startSceneId:
            item.start_scene_id ||
            item.startSceneId ||
            item.first_scene_id ||
            item.firstSceneId ||
            0,

        currentSceneId,

        // ---------- Statistics ----------

        // จำนวนครั้งที่นิยายเรื่องนี้ถูกเพิ่มเข้าชั้นหนังสือ (ของนิยาย ไม่ใช่ของผู้ใช้คนเดียว)
        bookshelfCount:
            item.bookshelf_count ||
            item.bookshelfCount ||
            item.shelf_count ||
            item.saved_count ||
            item.added_count ||
            item.novel?.bookshelf_count ||
            item.novel?.bookshelfCount ||
            item.novel?.shelf_count ||
            item.novel?.saved_count ||
            0,

        visitedCount:
            item.visited_count ||
            item.VisitedCount ||
            item.novel?.visited_count ||
            0,

        endingCount:
            item.ending_count ||
            item.endingCount ||
            item.novel?.ending_count ||
            0,

        totalScenes:
            item.total_scenes ||
            item.totalScenes ||
            item.scene_count ||
            item.novel?.total_scenes ||
            item.novel?.totalScenes ||
            0,

        views:
            item.views ||
            item.view_count ||
            item.novel?.views ||
            item.novel?.view_count ||
            0,

        likes:
            item.like_count ||
            item.likeCount ||
            item.likes ||
            item.novel?.like_count ||
            item.novel?.likes ||
            0,
    };
};

const statusLabels = {
    all: "ทั้งหมด",
    want_to_read: "ยังไม่อ่าน",
    reading: "กำลังอ่าน",
    finished: "อ่านจบแล้ว",
};

const BookshelfPage = () => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState("all");
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteTarget, setDeleteTarget] = useState(null); // book object
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);
    const deleteModalCloseRef = useRef(null);

    useEffect(() => {
        if (!deleteTarget) return undefined;

        deleteModalCloseRef.current?.focus();
        const handleModalKeyDown = (event) => {
            if (event.key === "Escape" && !deleting) handleCancelDelete();
        };
        document.addEventListener("keydown", handleModalKeyDown);
        return () => document.removeEventListener("keydown", handleModalKeyDown);
    }, [deleteTarget, deleting]);

    const getStoredUser = () => {
        const raw = localStorage.getItem("user");
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    const isTokenExpired = (token) => {
        if (!token) return true;
        try {
            const [, payloadBase64] = token.split(".");
            if (!payloadBase64) return true;
            const payload = JSON.parse(atob(payloadBase64));
            if (!payload.exp) return false;
            return payload.exp < Math.floor(Date.now() / 1000);
        } catch {
            return true;
        }
    };

    useEffect(() => {
        let isMounted = true;

        const fetchBookshelf = async () => {
            const token = localStorage.getItem("token");
            if (!token || isTokenExpired(token)) {
                if (isMounted) setLoading(false);
                return;
            }

            const storedUser = getStoredUser();
            const userId = storedUser?.id || storedUser?.user_id;

            try {
                const headers = {};
                if (token) headers.Authorization = `Bearer ${token}`;

                const response = await axios.get(getBookshelfApiUrl(userId), {
                    headers,
                });

                const rawItems = extractBookshelfList(response.data);
                const mapped = rawItems.map(normalizeBook);

                if (isMounted) {
                    setBooks(mapped);
                }
            } catch (err) {
                console.error("Bookshelf fetch error:", err);
                if (err.response?.status === 401) {
                    localStorage.removeItem("token");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchBookshelf();

        const handleSync = () => {
            fetchBookshelf();
        };

        window.addEventListener("bookshelf-updated", handleSync);
        window.addEventListener("reading-history-updated", handleSync);
        window.addEventListener("focus", handleSync);

        return () => {
            isMounted = false;
            window.removeEventListener("bookshelf-updated", handleSync);
            window.removeEventListener("reading-history-updated", handleSync);
            window.removeEventListener("focus", handleSync);
        };
    }, []);

    const filteredBooks = useMemo(() => {
        if (filter === "all") return books;
        return books.filter((book) => book.reading_status === filter);
    }, [books, filter]);

    const statusCounts = useMemo(() => {
        const counts = { all: books.length, want_to_read: 0, reading: 0, finished: 0 };
        books.forEach((book) => {
            counts[book.reading_status] = (counts[book.reading_status] ?? 0) + 1;
        });
        return counts;
    }, [books]);

    const filterOptions = useMemo(
        () => [
            { value: "all", label: "ทั้งหมด", count: statusCounts.all },
            { value: "want_to_read", label: "ยังไม่อ่าน", count: statusCounts.want_to_read },
            { value: "reading", label: "กำลังอ่าน", count: statusCounts.reading },
            { value: "finished", label: "อ่านจบแล้ว", count: statusCounts.finished },
        ],
        [statusCounts]
    );

    const handleRequestDelete = (book) => {
        setDeleteError(null);
        setDeleteTarget(book);
    };

    const handleCancelDelete = () => {
        if (deleting) return;
        setDeleteTarget(null);
        setDeleteError(null);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const token = localStorage.getItem("token");
            const headers = { "Content-Type": "application/json" };
            if (token) headers.Authorization = `Bearer ${token}`;

            const bookId = deleteTarget.id;
            // 🔗 เชื่อมต่อ DELETE /api/v1/bookshelves: เพื่อนำนิยายออกจากชั้นหนังสือของผู้ใช้
            await axios.delete(`${API_BASE_URL}/api/v1/bookshelves`, {
                headers,
                data: { novel_id: bookId },
            });

            setBooks((prev) => prev.filter((b) => b.id !== bookId));
            setDeleteTarget(null);
        } catch (err) {
            console.error("Remove from bookshelf error:", err);
            setDeleteError("ไม่สามารถนำนิยายออกจากชั้นหนังสือได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="bookshelf-page">
            <div className="bookshelf-page__sticky-header">
                <div className="bookshelf-page__top">
                    <div className="bookshelf-page__heading">
                        <button className="bookshelf-page__back-btn" onClick={() => navigate(-1)} aria-label="ย้อนกลับ">
                            <ArrowLeft size={18} />
                        </button>
                        <div className="bookshelf-page__labels">
                            <div className="bookshelf-page__eyebrow">ชั้นหนังสือของฉัน</div>
                            <div className="bookshelf-page__title">นิยายที่บันทึกไว้</div>
                        </div>
                    </div>
                    <div className="bookshelf-page__top-actions">
                        <div className="bookshelf-page__count">ทั้งหมด {books.length} เรื่อง</div>
                    </div>
                </div>
            </div>

            <div className="bookshelf-page__container">
                <div className="bookshelf-page__filters" role="tablist" aria-label="กรองสถานะการอ่าน">
                    {filterOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={filter === option.value}
                            className={`bookshelf-page__filter-button ${filter === option.value ? "active" : ""}`}
                            onClick={() => setFilter(option.value)}
                        >
                            {option.label}
                            <span className="bookshelf-page__filter-count"> ({option.count})</span>
                        </button>
                    ))}
                </div>

                {loading && books.length === 0 ? (
                    <NovelCardGridSkeleton count={6} />
                ) : (
                    <>
                        {filteredBooks.length === 0 ? (
                            <div className="bookshelf-page__empty">
                                <BookOpen size={28} strokeWidth={1.5} />
                                <p>ยังไม่มีนิยายในสถานะนี้ ลองเลือกสถานะอื่น หรือเพิ่มนิยายเข้าชั้นหนังสือของคุณ</p>
                            </div>
                        ) : (
                            <div className="bookshelf-page__grid">
                                {filteredBooks.map((book) => {
                                    const isFinished = book.reading_status === "finished";
                                    const isReading = book.reading_status === "reading";
                                    const isWantToRead = book.reading_status === "want_to_read";

                                    const handleRead = () => {
                                        if (isWantToRead) {
                                            if (book.startSceneId) {
                                                navigate(`/reading/${book.id}/${book.startSceneId}`);
                                                return;
                                            }
                                            window.alert("นิยายเรื่องนี้ยังไม่มีฉากเริ่มต้นให้เปิดอ่านได้ในตอนนี้");
                                            navigate(`/novel/${book.id}`);
                                            return;
                                        }

                                        if (isReading) {
                                            if (book.currentSceneId) {
                                                navigate(`/reading/${book.id}/${book.currentSceneId}`);
                                                return;
                                            }
                                            navigate(`/reading/${book.id}`);
                                            return;
                                        }

                                        if (isFinished) {
                                            if (book.startSceneId) {
                                                navigate(`/reading/${book.id}/${book.startSceneId}`);
                                                return;
                                            }
                                            navigate(`/novel/${book.id}`);
                                        }
                                    };

                                    return (
                                        <article
                                            key={book.id}
                                            className="bookshelf-card"
                                        >
                                            <button
                                                type="button"
                                                className="bookshelf-card__remove-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRequestDelete(book);
                                                }}
                                                title="นำออกจากชั้นหนังสือ"
                                                aria-label={`นำ ${book.title} ออกจากชั้นหนังสือ`}
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            <div className="bookshelf-card__main-content">
                                                {/* Left: Cover Image with Status Badge */}
                                                <div className="bookshelf-card__cover-wrap">
                                                    <div
                                                        className="bookshelf-card__cover"
                                                        onClick={() => navigate(`/novel/${book.id}`)}
                                                    >
                                                        <img src={book.coverImage} alt={`${book.title} ปกนิยาย`} />
                                                        <span className={`bookshelf-card__status bookshelf-card__status--${book.reading_status}`}>
                                                            {statusLabels[book.reading_status] || "ไม่ระบุสถานะ"}
                                                        </span>
                                                        {book.novelCompleted && (
                                                            <span className="bookshelf-card__novel-status">จบแล้ว</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right: Info details */}
                                                <div className="bookshelf-card__info-col">
                                                    <div className="bookshelf-card__info-top">
                                                        <h3
                                                            className="bookshelf-card__title"
                                                            onClick={() => navigate(`/novel/${book.id}`)}
                                                            title={book.title}
                                                        >
                                                            {book.title}
                                                        </h3>

                                                        <div className="bookshelf-card__author">
                                                            <Pencil size={12} className="bookshelf-card__author-icon" />
                                                            <span>{book.author}</span>
                                                        </div>

                                                        <div className="bookshelf-card__categories">
                                                            {book.categories.slice(0, 2).map((category, index) => (
                                                                <span
                                                                    key={`${book.id}-${category}-${index}`}
                                                                    className="bookshelf-card__tag"
                                                                >
                                                                    {category}
                                                                </span>
                                                            ))}
                                                            {book.categories.length > 2 && (
                                                                <span className="bookshelf-card__extra-categories">
                                                                    +{book.categories.length - 2}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <p className="bookshelf-card__description" title={book.description || ""}>
                                                            {book.description || ""}
                                                        </p>
                                                    </div>

                                                    <div className="bookshelf-card__info-bottom">
                                                        {formatLastReadInfo(book) ? (
                                                            <div className="bookshelf-card__time-meta">
                                                                <Clock size={12} className="bookshelf-card__time-icon" />
                                                                <span>{formatLastReadInfo(book)}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="bookshelf-card__time-meta bookshelf-card__time-meta--empty" aria-hidden="true" />
                                                        )}

                                                        <div className="bookshelf-card__stats">
                                                            <div className="bookshelf-card__stat" title="ยอดวิว">
                                                                <Eye size={13} />
                                                                <span>{formatNumber(book.views)}</span>
                                                            </div>
                                                            <div className="bookshelf-card__stat" title="ยอดถูกใจ">
                                                                <Heart size={13} />
                                                                <span>{formatNumber(book.likes)}</span>
                                                            </div>
                                                            <div className="bookshelf-card__stat" title="เพิ่มเข้าชั้น">
                                                                <Bookmark size={13} />
                                                                <span>{formatNumber(book.bookshelfCount)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Bottom: Action Buttons (Read + Story Tree / Map) */}
                                            <div className="bookshelf-card__actions">
                                                <button
                                                    type="button"
                                                    className={`bookshelf-card__read-btn bookshelf-card__read-btn--${
                                                        isReading ? "continue" : isFinished ? "reread" : "start"
                                                    }`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRead();
                                                    }}
                                                >
                                                    {isReading ? (
                                                        <>
                                                            <Play size={14} fill="currentColor" />
                                                            <span>อ่านต่อ</span>
                                                        </>
                                                    ) : isFinished ? (
                                                        <>
                                                            <RotateCw size={14} />
                                                            <span>อ่านอีกครั้ง</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Play size={14} fill="currentColor" />
                                                            <span>อ่านเลย</span>
                                                        </>
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="bookshelf-card__map-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/storytree/${book.id}`);
                                                    }}
                                                    title="ดูแผนผังการอ่าน"
                                                >
                                                    <Map size={14} />
                                                    <span>แผนผัง</span>
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {deleteTarget && (
                <div className="bookshelf-delete-modal__overlay" onClick={handleCancelDelete}>
                    <div
                        className="bookshelf-delete-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bookshelf-delete-modal-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="bookshelf-delete-modal__close"
                            ref={deleteModalCloseRef}
                            onClick={handleCancelDelete}
                            aria-label="ปิด"
                            disabled={deleting}
                        >
                            <X size={18} />
                        </button>

                        <div className="bookshelf-delete-modal__icon">
                            <Trash2 size={22} />
                        </div>

                        <div id="bookshelf-delete-modal-title" className="bookshelf-delete-modal__title">
                            นำออกจากชั้นหนังสือ?
                        </div>
                        <div className="bookshelf-delete-modal__body">
                            ต้องการนำนิยาย "{deleteTarget.title}" ออกจากชั้นหนังสือใช่หรือไม่
                        </div>

                        {deleteError && <div className="bookshelf-delete-modal__error">{deleteError}</div>}

                        <div className="bookshelf-delete-modal__actions">
                            <button
                                type="button"
                                className="bookshelf-delete-modal__cancel-btn"
                                onClick={handleCancelDelete}
                                disabled={deleting}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                className="bookshelf-delete-modal__confirm-btn"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                            >
                                {deleting ? "กำลังนำออก..." : "นำออก"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookshelfPage;