import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import "./NovelDetailPage.css";

import NovelCoverCard from "../../../components/NovelCoverCard/NovelCoverCard";
import GenreTag from "../../../components/GenreTag/GenreTag";
import FollowButton from "../../../components/FollowButton/FollowButton";
import NovelProgressBar from "../../../components/NovelProgressBar/NovelProgressBar";
import EndingCollection from "../../../components/EndingCollection/EndingCollection";
import Comments from "../../../components/Comments/Comments";
import ReaderReportButton from "../../../components/ReaderReportButton/ReaderReportButton";
import AdminModeBanner from "../../../components/AdminModeBanner/AdminModeBanner";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import { ShieldAlert, ChevronDown, Pencil, Map, Bookmark, Heart, MoreVertical, RotateCcw, Flag, Play, CheckCircle2, MapPin, Trophy } from "lucide-react";
import { getBannedRegistry, cleanBanReason, extractBanDetails } from "../../../utils/novelStatus";
// Removed authUtils import per user request

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const initialNovelState = {
  id: null,
  title: "",
  categories: [],
  coverImage: null,
  coverEmoji: "📘",
  status: "draft",
  isCompleted: false,
  author: {
    displayName: "ไม่ทราบผู้แต่ง",
    avatarUrl: null,
  },
  synopsis: "",
  stats: {
    views: 0,
    likes: 0,
    bookshelfCount: 0,
    comments: 0,
    choicePoints: 0,
    endings: 0,
  },
  userProgress: {
    percentage: 0,
    currentChapter: 0,
    totalChapters: 0,
    discoveredChoices: 0,
    totalChoices: 0,
  },
  synopsis_detail: "",
  isLiked: false,
  isBookmarked: false,
};

const formatMinioUrl = (url) => {
  if (!url) return null;
  return url.replace('http://minio:9000', 'http://localhost:9000');
};

const stripHtml = (html = "") => {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
};

// ใช้ร่วมกันระหว่าง showNoContentDialog กับ showRestartConfirm แทนที่จะก็อปปี้
// โครง overlay/กล่องเดิมซ้ำสองรอบด้วย inline style คนละชุด (คนละสีกับธีมหลักของเว็บ)
const SimpleModal = ({ onClose, maxWidth = 400, children }) => (
  <div
    className="novel-detail__modal-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget && onClose) onClose();
    }}
  >
    <div className="novel-detail__modal-box" style={{ maxWidth }}>
      {children}
    </div>
  </div>
);

// 🟢 Component แสดงหน้านิยายโดนระงับแบบละเอียดสำหรับผู้อ่าน/นักเขียน
const BannedNovelView = ({ novel, novelId, navigate }) => {
  const [showSteps, setShowSteps] = useState(false);

  const bannedReg = getBannedRegistry();
  const regInfo = bannedReg[String(novelId)] || {};

  const rawReason =
    novel?.banReason ||
    novel?.ban_reason ||
    novel?.suspend_reason ||
    novel?.reason ||
    regInfo.reason ||
    "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง";

  const mainReason = cleanBanReason(rawReason);

  const adminDetails = extractBanDetails(
    rawReason,
    novel?.banDetails ||
    novel?.ban_details ||
    novel?.suspend_details ||
    novel?.details ||
    regInfo.details ||
    regInfo.ban_details
  );

  return (
    <div className="novel-detail">
      <div className="novel-detail__container novel-detail__banned-screen">
        <div className="novel-detail__banned-card">
          <div className="novel-detail__banned-header">
            <ShieldAlert className="novel-detail__banned-shield-icon" size={48} color="#ef4444" />
            <h2 className="novel-detail__banned-title">
              นิยายเรื่อง "{novel?.title || "ไม่ทราบชื่อเรื่อง"}" ถูกระงับการเผยแพร่ชั่วคราว
            </h2>
            <span className="novel-detail__banned-badge">สถานะ: ถูกระงับการเผยแพร่</span>
          </div>

          <div className="novel-detail__banned-reason-box">
            <div>
              <strong style={{ color: "#b91c1c", fontSize: "14.5px" }}>สาเหตุการระงับ:</strong>
              <p style={{ marginTop: "4px", color: "#1e293b", fontWeight: 600 }}>{mainReason}</p>
            </div>
            {adminDetails && (
              <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1.5px dashed #fca5a5" }}>
                <strong style={{ color: "#991b1b", fontSize: "14px" }}>เหตุผล/รายละเอียดเพิ่มเติมจากแอดมิน:</strong>
                <p style={{ marginTop: "4px", color: "#334155", fontWeight: 500 }}>{adminDetails}</p>
              </div>
            )}
          </div>

          <div className="novel-detail__banned-steps-accordion">
            <button
              type="button"
              className="novel-detail__banned-steps-toggle"
              onClick={() => setShowSteps((prev) => !prev)}
            >
              <span>ขั้นตอนการยื่นขอปลดแบน</span>
              <ChevronDown
                size={18}
                style={{
                  transform: showSteps ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease"
                }}
              />
            </button>

            {showSteps && (
              <ol className="novel-detail__banned-steps-list">
                <li>1. แก้ไขเนื้อหาหรือภาพปกนิยายที่ขัดต่อกฎระเบียบ</li>
                <li>2. กดยื่นคำขอปลดแบนในหน้าจัดการตอนของนักเขียน</li>
                <li>3. รอผู้ดูแลระบบ (Admin) ตรวจสอบและพิจารณาอนุมัติคำขอ</li>
              </ol>
            )}
          </div>

          <div className="novel-detail__banned-actions">
            <button
              type="button"
              className="novel-detail__banned-btn novel-detail__banned-btn--primary"
              onClick={() => navigate(`/writer/${novelId}/chapters`)}
            >
              <Pencil size={16} style={{ marginRight: 6 }} />
              ไปที่หน้าจัดการตอนและแก้ไขเนื้อหา
            </button>
            <button
              type="button"
              className="novel-detail__banned-btn novel-detail__banned-btn--secondary"
              onClick={() => navigate("/")}
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NovelDetailPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isPreview = new URLSearchParams(location.search).get("preview") === "true";

  const handleExitPreview = () => {
    const fallbackUrl = sessionStorage.getItem("previewReturnUrl") || "";
    sessionStorage.removeItem("previewReturnUrl");

    // แท็บทดลองอ่านถูกเปิดผ่าน window.open(...,'_blank','noopener,noreferrer') จากหน้า
    // Scene Editor เสมอ (ดู handleOpenPreview ใน SceneEditorPage.jsx) ดังนั้นแท็บนี้มีสิทธิ์
    // ปิดตัวเองผ่าน window.close() ได้เลยโดยไม่ต้องพึ่ง window.opener
    //
    // บั๊กเดิม (จุดเดียวกับ ReadingPage.jsx): เพราะ noopener ทำให้ window.opener เป็น null
    // เสมอ โค้ดเดิมเอา window.close() ไปซ่อนไว้หลังเงื่อนไข `if (window.opener && ...)`
    // ที่ไม่มีวันเป็นจริง -> กดออกจาก preview จากหน้ารายละเอียดนี้แล้วแท็บไม่เคยถูกปิดเลย
    window.close();

    // เผื่อ browser ไม่ยอมให้ปิดแท็บ ให้ fallback พากลับไปหน้าที่ควรกลับไปแทน
    if (fallbackUrl) {
      navigate(fallbackUrl);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/");
  };

  const [novel, setNovel] = useState(initialNovelState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [endings, setEndings] = useState([]);
  const [showEndingModal, setShowEndingModal] = useState(false);
  const [nextSceneId, setNextSceneId] = useState(null);
  const [showNoContentDialog, setShowNoContentDialog] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartError, setRestartError] = useState(null);
  const [bookmarkProcessing, setBookmarkProcessing] = useState(false);
  const [likeProcessing, setLikeProcessing] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  // handleRead ยิง API เช็กฉากก่อน navigate เสมอ (ดู fetchFirstSceneAndNavigate ด้านล่าง) —
  // ถ้าไม่มี state นี้ ปุ่ม "อ่านเลย/อ่านต่อ" จะดูนิ่งเฉยๆ ระหว่างรอ ทำให้ผู้ใช้กดซ้ำหรืองงว่าใช้งานได้ไหม
  const [readLoading, setReadLoading] = useState(false);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);

  // 🟢 ข้อมูลการอ่านล่าสุด + เส้นทางที่ค้นพบของผู้ใช้ที่เคยอ่านแล้ว
  const [visitedNodes, setVisitedNodes] = useState([]);
  const [latestNode, setLatestNode] = useState(null);
  const [totalTreeNodes, setTotalTreeNodes] = useState(0);
  const [hasReadBefore, setHasReadBefore] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [discoveredPage, setDiscoveredPage] = useState(1);
  const moreMenuRef = useRef(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  const formatRelativeTime = (isoString) => {
    if (!isoString) return null;
    const timestamp = Date.parse(isoString);
    if (Number.isNaN(timestamp)) return null;
    const diff = (Date.now() - timestamp) / 1000;
    if (diff < 60) return "เมื่อสักครู่";
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.max(1, Math.floor(diff / 3600))} ชั่วโมงที่แล้ว`;
    if (diff < 604800) return `${Math.max(1, Math.floor(diff / 86400))} วันที่แล้ว`;
    return new Date(timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  };

  const getLatestReadInfo = (node) => {
    if (!node) return { chapter: "ไม่มีข้อมูลฉาก", scene: "" };
    const epNum = node.chapter_episode || node.chapterEpisode || node.episode || node.chapter_order || node.chapterOrder || 1;
    const chapterName = stripHtml(node.chapter_title || node.chapterTitle || node.chapter_name || node.chapterName || "").trim();
    const rawSceneName = stripHtml(node.title || node.scene_name || node.name || "เนื้อเรื่อง").trim();
    const cleanSceneName = rawSceneName.replace(/^(ตอนที่|ฉากที่)\s*\d+[\s:•-]*/i, "").trim() || rawSceneName;

    if (node.type === "start") {
      return {
        chapter: "จุดเริ่มต้น",
        scene: `ฉาก : ${cleanSceneName}`
      };
    }

    const chapterText = chapterName ? `ตอนที่ ${epNum} : ${chapterName}` : `ตอนที่ ${epNum}`;
    const sceneText = `ฉาก : ${cleanSceneName}`;

    return {
      chapter: chapterText,
      scene: sceneText
    };
  };

  const getLatestReadLabel = (node) => {
    const info = getLatestReadInfo(node);
    return info.scene ? `${info.chapter} • ${info.scene}` : info.chapter;
  };

  const DISCOVERED_ITEMS_PER_PAGE = 5;
  const discoveredTotalPages = Math.max(1, Math.ceil((visitedNodes || []).length / DISCOVERED_ITEMS_PER_PAGE));
  const paginatedDiscoveredNodes = (visitedNodes || []).slice(
    (discoveredPage - 1) * DISCOVERED_ITEMS_PER_PAGE,
    discoveredPage * DISCOVERED_ITEMS_PER_PAGE
  );

  const getCurrentUser = () => {
    const userJson = localStorage.getItem("user");
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch (err) {
      console.warn("Failed to parse user from localStorage:", err);
      return null;
    }
  };

  const isCurrentUserAdmin = () => {
    try {
      const user = getCurrentUser();
      const r = (user?.role || user?.user_role || user?.role_name || "").toString().toLowerCase();
      if (r === "admin" || user?.is_admin === true || user?.isAdmin === true) return true;
    } catch (e) {}

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
    } catch (e) {}

    return false;
  };


  const getCurrentUserId = () => {
    const user = getCurrentUser();
    return user?.id || user?.user_id || 0;
  };



  const fetchBookmarkedStatus = async (currentNovelId, userId, headers) => {
    if (!currentNovelId || !userId) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/bookshelves?user_id=${userId}`, { headers });
      if (!response.ok) return false;

      const payload = await response.json().catch(() => null);
      const bookshelfItems = payload?.data?.bookshelf || payload?.bookshelf || payload?.novels || payload?.data || [];
      const items = Array.isArray(bookshelfItems) ? bookshelfItems : [];

      return items.some((item) => String(item.novel_id ?? item.id ?? item.novel?.id ?? "") === String(currentNovelId));
    } catch (err) {
      console.warn("Failed to fetch bookshelf status:", err);
      return false;
    }
  };

  const fetchNovelComments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/novels/${id}/comments`);
      if (!response.ok) throw new Error(`failed to load comments: ${response.status}`);

      const payload = await response.json().catch(() => null);
      const commentsData = payload?.comments || payload?.data?.comments || [];
      setComments(Array.isArray(commentsData) ? commentsData : []);
    } catch (err) {
      console.warn("Failed to load novel comments:", err);
      setComments([]);
    }
  };

  useEffect(() => {
    const fetchNovel = async () => {
      if (!id) {
        setError("ไม่พบรหัสนิยาย");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setNextSceneId(null);

      try {
        const token = localStorage.getItem("token");
        const userId = getCurrentUserId();
        const headers = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const query = userId > 0 && !isCurrentUserAdmin() ? `?user_id=${userId}` : "";
        const response = await fetch(`${API_BASE_URL}/novels/${id}${query}`, { headers });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload?.error || payload?.message || `${response.status} ${response.statusText}`
          );
        }

        const data = payload?.data || payload || {};
        const nData = data.novel || {};

        const progressSource = data.progress || data.user_progress || data.userProgress || data || {};

        const resolveSceneId = (source) => {
          if (!source) return null;
          return source.current_scene_id ?? source.CurrentSceneID ?? source.currentSceneId ?? null;
        };

        const progressSceneId = resolveSceneId(progressSource);
        // 🟢 โหมดทดลองอ่าน (preview) ต้องเริ่มจากฉากแรกเสมอ ห้ามพึ่งความคืบหน้าการอ่านจริงของ user
        // (เดิมไม่มีเงื่อนไข isPreview ตรงนี้ ทำให้ปุ่ม "อ่านต่อ" ใน preview พาไปที่ scene ตาม
        // progress จริงแทนที่จะเริ่มฉากแรกตามที่ preview ควรเป็น)
        if (progressSceneId && !isPreview) {
          setNextSceneId(String(progressSceneId));
        }

        let chaptersCountFromApi = 0;
        try {
          const chaptersResponse = await fetch(`${API_BASE_URL}/novels/${id}/chapters`);
          if (chaptersResponse.ok) {
            const chaptersPayload = await chaptersResponse.json();
            const chaptersList = chaptersPayload?.data?.chapters || chaptersPayload?.chapters || [];

            if (isPreview) {
              chaptersCountFromApi = Array.isArray(chaptersList) ? chaptersList.length : 0;
            } else {
              const publishedChapters = chaptersList.filter((chapter) => {
                if (typeof chapter.is_published === "boolean") {
                  return chapter.is_published === true;
                }
                const status = chapter.status ?? chapter.Status ?? "";
                return String(status).toLowerCase() === "published";
              });
              chaptersCountFromApi = publishedChapters.length;
            }
          }
        } catch (err) {
          console.warn("Failed to fetch chapters:", err);
        }

        let commentsCount = 0;

        try {
          const countResponse = await fetch(`${API_BASE_URL}/novels/${id}/comments/count`);
          if (countResponse.ok) {
            const countPayload = await countResponse.json().catch(() => null);
            commentsCount = Number(countPayload?.data?.count ?? countPayload?.count ?? 0) || 0;
          }
        } catch (err) {
          console.warn("Failed to fetch comment count:", err);
          commentsCount = 0;
        }
        const isBookmarked = userId > 0 ? await fetchBookmarkedStatus(id, userId, headers) : false;

        let currentChapterProgress = progressSource.current_chapter ?? progressSource.currentChapter ?? 0;
        const totalChaptersProgress = chaptersCountFromApi > 0
          ? chaptersCountFromApi
          : (progressSource.total_chapters ?? progressSource.totalChapters ?? 0);
        const totalChoices = progressSource.total_choices ?? progressSource.totalChoices ?? 0;
        const discoveredChoices = progressSource.discovered_choices ?? progressSource.discoveredChoices ?? 0;
        const totalEndings = progressSource.total_endings ?? progressSource.totalEndings ?? 0;

        if (currentChapterProgress === 0 && progressSceneId) {
          try {
            const sceneResp = await fetch(`${API_BASE_URL}/scenes/${progressSceneId}`, { headers });
            if (sceneResp.ok) {
              const scenePayload = await sceneResp.json().catch(() => null);
              const sceneData = scenePayload?.data || scenePayload || {};
              const sceneEpisode = sceneData.chapter_episode ?? sceneData.chapterEpisode ?? sceneData.episode ?? sceneData.chapter_order ?? sceneData.order ?? 0;
              if (sceneEpisode > 0) {
                currentChapterProgress = sceneEpisode;
              }
            }
          } catch (err) {
            console.warn("Failed to fetch current scene chapter for progress:", err);
          }
        }

        const calculatedPercentage = totalChaptersProgress > 0
          ? Math.round((currentChapterProgress / totalChaptersProgress) * 100)
          : 0;

        const authorDisplayName = nData.pen_name || nData.penName || nData.author_pen_name || nData.author_penName || nData.author_name || nData.authorName || nData.name_lastname || nData.name || "ไม่ทราบผู้แต่ง";

        // "synopsis" เป็นข้อความสั้นที่ render เป็น plain text ตรงๆ (ไม่ผ่าน dangerouslySetInnerHTML)
        // ถ้าไม่มี captions จะ fallback ไปที่ introduction ซึ่งเป็น HTML (ดู synopsis_detail ด้านล่าง
        // ที่ต้องใช้ dangerouslySetInnerHTML) — ถ้าไม่ strip ก่อน จะเห็น tag <p> โผล่มาเป็นตัวหนังสือจริงๆ
        // และถ้าใช้ introduction เต็มๆ ก็จะซ้ำกับเนื้อหาที่โชว์เต็มอยู่แล้วในส่วน "แนะนำเรื่อง" ด้านล่าง
        // จึงตัดให้สั้นลงเมื่อต้อง fallback
        const shortSynopsis = nData.captions
          ? stripHtml(nData.captions)
          : (() => {
            const plain = stripHtml(nData.introduction || "");
            return plain.length > 150 ? `${plain.slice(0, 150)}…` : plain;
          })();

        let realWriterId =
          nData.writer_id ||
          nData.author_writer_id ||
          nData.author_writerId ||
          nData.author_id ||
          nData.author?.writer_id ||
          nData.author?.id ||
          null;
        let realUserId = nData.user_id || nData.author?.user_id || null;
        let queryId = realWriterId || realUserId || nData.id;

        let resolvedAuthorAvatar = formatMinioUrl(
          nData.author_avatar ||
          nData.author_avatar_url ||
          nData.authorAvatar ||
          nData.writer_avatar ||
          nData.user_avatar ||
          nData.pic_profile ||
          nData.avatar_url ||
          nData.avatarUrl ||
          nData.author?.avatar_url ||
          nData.author?.avatarUrl ||
          nData.author?.avatar
        ) || null;

        if (queryId) {
          try {
            const wRes = await fetch(`${API_BASE_URL}/writer/${queryId}`, { headers });
            if (wRes.ok) {
              const wJson = await wRes.json().catch(() => null);
              const wData = wJson?.data || wJson?.writer || wJson || {};
              const rawWAvatar = wData.avatar_url || wData.pic_profile || wData.avatarUrl || wData.author_avatar || null;
              if (rawWAvatar && !resolvedAuthorAvatar) {
                resolvedAuthorAvatar = formatMinioUrl(rawWAvatar);
              }
              const fetchedWriterId = wData.writer_id || wData.id;
              if (fetchedWriterId) {
                realWriterId = fetchedWriterId;
              }
            }
          } catch (e) {
            console.warn("Failed to fetch author info from writer endpoint:", e);
          }
        }

        const finalWriterId = realWriterId || queryId;

        setNovel({
          id: nData.novel_id || nData.id || id,
          title: nData.title || "ไม่พบชื่อเรื่อง",
          status: nData.status || "draft",
          // เรื่องจบแล้วหรือยัง — ใช้เกณฑ์เดียวกับหน้าโปรไฟล์นักเขียน (status "completed" หรือ is_completed)
          isCompleted: nData.status === "completed" || nData.is_completed === true,
          categories: Array.isArray(nData.categories)
            ? Array.from(new Set(
              nData.categories
                .map(cat => typeof cat === "object" ? cat.name : cat)
                .filter(Boolean)
            ))
            : ["ทั่วไป"],
          coverImage: formatMinioUrl(nData.cover_image) || null,
          author: {
            displayName: authorDisplayName,
            penName: nData.pen_name || nData.penName || nData.author_pen_name || nData.author_penName || null,
            avatarUrl: resolvedAuthorAvatar,
            writer_id: finalWriterId,
            user_id: realUserId,
            id: finalWriterId,
          },
          synopsis: shortSynopsis || "ไม่มีเรื่องย่อ",

          stats: {
            views: nData.views || 0,
            likes: nData.like_count || nData.likeCount || 0,
            bookshelfCount:
              nData.bookshelf_count || nData.bookmark_count || nData.total_bookmarks || 0,
            comments: commentsCount,
            choicePoints: totalChoices,
            endings: totalEndings,
          },

          userProgress: {
            percentage: calculatedPercentage,
            currentChapter: currentChapterProgress,
            totalChapters: totalChaptersProgress,
            discoveredChoices: discoveredChoices,
            totalChoices: totalChoices,
          },
          synopsis_detail: nData.introduction || "ยังไม่มีรายละเอียดเพิ่มเติม",
          isLiked: nData.is_liked || nData.isLiked || false,
          isBookmarked: isBookmarked,
        });

        let isFollowing = Boolean(data.is_following || data.isFollowing || nData.is_following || nData.isFollowing);

        if (token && finalWriterId) {
          try {
            const followCheckRes = await fetch(`${API_BASE_URL}/api/users/following-writers`, { headers });
            if (followCheckRes.ok) {
              const followPayload = await followCheckRes.json().catch(() => null);
              const followBody = followPayload?.data ?? followPayload ?? {};
              const followList = Array.isArray(followBody) ? followBody : (followBody.following || followBody.writers || []);
              if (Array.isArray(followList) && followList.some((w) => Number(w.writer_id ?? w.id) === Number(finalWriterId))) {
                isFollowing = true;
              }
            }
          } catch (e) {
            console.warn("Failed to check following writers status:", e);
          }
        }

        if (!isFollowing && finalWriterId) {
          try {
            const localSaved = localStorage.getItem("local_following_writers");
            const list = localSaved ? JSON.parse(localSaved) : [];
            if (Array.isArray(list) && list.some(w => Number(w.id || w.writer_id) === Number(finalWriterId))) {
              isFollowing = true;
            }
          } catch (e) {}
        }

        setIsFollowingAuthor(isFollowing);
        setEndings(data.endings || []);

        // 🟢 ดึงข้อมูลความคืบหน้าการอ่านและเส้นทางที่ค้นพบจริงจาก Backend
        let discoveredNodesList = [];
        let currentLatestNode = null;
        let readerHasReadBefore = false;

        if (userId > 0 && !isCurrentUserAdmin() && !isPreview) {
          try {
            const treeRes = await fetch(`${API_BASE_URL}/novels/${id}/story-tree?user_id=${userId}`, { headers });
            if (treeRes.ok) {
              const treePayload = await treeRes.json().catch(() => null);
              const treeData = treePayload?.data || treePayload || {};
              const rawNodes = treeData?.nodes || [];
              setTotalTreeNodes(rawNodes.length);
              const currentSceneIdStr = treeData.current_scene_id ? String(treeData.current_scene_id) : null;
              const hasBackendCurrent = rawNodes.some((n) => n.is_current === true);
              const hasRealProgress = Boolean(currentSceneIdStr) || hasBackendCurrent || rawNodes.some((n) => n.is_unlocked && n.type !== "start");

              if (hasRealProgress) {
                discoveredNodesList = rawNodes.filter((n) => {
                  return n.is_current === true || n.is_unlocked === true || (currentSceneIdStr && String(n.id) === currentSceneIdStr);
                });

                currentLatestNode = rawNodes.find((n) => n.is_current === true || (currentSceneIdStr && String(n.id) === currentSceneIdStr)) ||
                  discoveredNodesList[discoveredNodesList.length - 1] || null;

                readerHasReadBefore = discoveredNodesList.length > 0 && currentLatestNode !== null;
              }
            }
          } catch (treeErr) {
            console.warn("Failed to fetch story tree progress:", treeErr);
          }
        }

        setVisitedNodes(discoveredNodesList);
        setLatestNode(currentLatestNode);
        setHasReadBefore(readerHasReadBefore);

        fetchNovelComments();
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setLoading(false);
      }
    };

    fetchNovel();
  }, [id]);

  // ใช้ร่วมกันระหว่างเคส admin กับเคส non-admin ที่ไม่มี nextSceneId บันทึกไว้
  // (เดิมสองเคสนี้ fetch story-tree แล้วดึง first_scene_id ด้วยโค้ดชุดเดียวกันซ้ำสองรอบ)
const fetchFirstSceneAndNavigate = async (previewSuffix) => {
    try {
      const userId = getCurrentUserId();
      const headers = { "Content-Type": "application/json" };
      const token = localStorage.getItem("token");
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const previewQuery = isPreview ? "&preview=true" : "";
      const treeResponse = await fetch(`${API_BASE_URL}/novels/${id}/story-tree?user_id=${userId}${previewQuery}`, { headers });

      const treePayload = await treeResponse.json().catch(() => null);
      const treeData = treePayload?.data || treePayload || {};

      const firstScene =
        treeData.first_scene_id ||
        treeData.current_scene_id ||
        treeData.CurrentSceneID ||
        treeData.currentSceneId ||
        treeData.nodes?.find((node) => node.type === "start")?.id ||
        null;

      if (firstScene) {
        // ✅ ยิง API ไปโหลดข้อมูลฉากเพื่อแกะดูสถานะข้างใน
        const sceneResp = await fetch(`${API_BASE_URL}/scenes/${firstScene}`, { headers });
        if (sceneResp.ok) {
          const scenePayload = await sceneResp.json().catch(() => null);
          const sceneData = scenePayload?.data || scenePayload || {};
          
          // ✅ เช็กสถานะ Publish จาก JSON จริงๆ (รองรับทั้ง is_published และ status)
          const isPub = (typeof sceneData.is_published === "boolean") 
            ? sceneData.is_published === true 
            : String(sceneData.status ?? sceneData.Status ?? "").toLowerCase() === "published";

          // ถ้า Published แล้ว, หรือเป็น Admin, หรืออยู่ในโหมด Preview ค่อยให้เข้าอ่าน
          if (isPub || isPreview || isAdmin) {
            navigate(`/reading/${novel.id}/${firstScene}${previewSuffix}`);
          } else {
            setShowNoContentDialog(true);
          }
        } else {
          setShowNoContentDialog(true);
        }
      } else {
        setShowNoContentDialog(true);
      }
    } catch (err) {
      console.warn("Failed to fetch initial scene", err);
      setShowNoContentDialog(true);
    }
  };

  const handleRead = async () => {
    if (readLoading) return;

    if (!novel.id) return;
    const previewSuffix = isPreview ? "?preview=true" : "";

    setReadLoading(true);
    try {
      if (isAdmin) {
        await fetchFirstSceneAndNavigate(previewSuffix);
        return;
      }

      // 🟢 preview mode ต้องไม่เข้าทางนี้เลย ต้องเริ่มฉากแรกเสมอผ่าน fetchFirstSceneAndNavigate() ด้านล่าง
      if (nextSceneId && !isPreview) {
        try {
          const headers = { "Content-Type": "application/json" };
          const token = localStorage.getItem("token");
          if (token) headers["Authorization"] = `Bearer ${token}`;

          // ✅ ยิง API เช็กฉากถัดไปเหมือนกัน
          const checkResp = await fetch(`${API_BASE_URL}/scenes/${nextSceneId}`, { headers });
          if (checkResp.ok) {
            const scenePayload = await checkResp.json().catch(() => null);
            const sceneData = scenePayload?.data || scenePayload || {};

            // ✅ เช็กสถานะ Publish จริงๆ ไม่พึ่งแค่ HTTP 200 OK
            const isPub = (typeof sceneData.is_published === "boolean")
              ? sceneData.is_published === true
              : String(sceneData.status ?? sceneData.Status ?? "").toLowerCase() === "published";

            if (isPub || isPreview || isAdmin) {
              navigate(`/reading/${novel.id}/${nextSceneId}${previewSuffix}`);
            } else {
              setShowNoContentDialog(true);
            }
          } else {
            setShowNoContentDialog(true);
          }
        } catch (err) {
          setShowNoContentDialog(true);
        }
        return;
      }

      await fetchFirstSceneAndNavigate(previewSuffix);
    } finally {
      setReadLoading(false);
    }
  };

  const handleBookmark = async (isBookmarked) => {
    if (!id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }

    if (bookmarkProcessing) return;
    setBookmarkProcessing(true);

    try {
      const method = isBookmarked ? "POST" : "DELETE";
      const url = `${API_BASE_URL}/bookshelves${isBookmarked ? "" : `?novel_id=${id}`}`;
      const body = isBookmarked ? JSON.stringify({ novel_id: parseInt(id, 10) }) : undefined;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      setNovel((prev) => ({
        ...prev,
        isBookmarked: isBookmarked,
        stats: {
          ...prev.stats,
          bookshelfCount: Math.max(0, prev.stats.bookshelfCount + (isBookmarked ? 1 : -1)),
        },
      }));
    } catch (err) {
      console.error("Failed to update bookshelf status:", err);
      setNovel((prev) => ({ ...prev, isBookmarked: !isBookmarked }));
    } finally {
      setBookmarkProcessing(false);
    }
  };

  const handleLike = async (isLiked) => {
    if (!id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }

    if (likeProcessing) return;
    setLikeProcessing(true);

    try {
      const method = isLiked ? "POST" : "DELETE";
      const url = isLiked ? `${API_BASE_URL}/likes` : `${API_BASE_URL}/likes?novel_id=${id}`;
      const body = isLiked ? JSON.stringify({ novel_id: parseInt(id, 10) }) : undefined;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      setNovel((prev) => ({
        ...prev,
        isLiked: isLiked,
        stats: {
          ...prev.stats,
          likes: Math.max(0, prev.stats.likes + (isLiked ? 1 : -1)),
        },
      }));
    } catch (err) {
      console.error("Failed to update like status:", err);
      setNovel((prev) => ({ ...prev, isLiked: !isLiked }));
    } finally {
      setLikeProcessing(false);
    }
  };

  const handleRestartConfirmOpen = () => {
    setRestartError(null);
    setShowRestartConfirm(true);
  };

  const handleRestartConfirmClose = () => {
    setShowRestartConfirm(false);
    setRestartLoading(false);
    setRestartError(null);
  };

  const handleRestart = async () => {
    if (!id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setRestartError("กรุณาเข้าสู่ระบบก่อนเริ่มอ่านใหม่");
      return;
    }

    setRestartLoading(true);
    setRestartError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/novels/${id}/restart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      const startSceneId = payload?.data?.start_scene_id || payload?.data?.StartSceneID || payload?.start_scene_id || payload?.startSceneId;
      if (startSceneId) {
        navigate(`/reading/${id}/${startSceneId}`);
      } else {
        navigate(`/reading/${id}`);
      }
    } catch (err) {
      setRestartError(err.message || "ไม่สามารถเริ่มอ่านใหม่ได้ในขณะนี้");
    } finally {
      setRestartLoading(false);
    }
  };

  const handleStoryMap = (sceneId) => {
    if (novel.id) {
      const query = sceneId ? `?highlight_scene=${sceneId}` : "";
      navigate(`/storytree/${novel.id}${query}`);
    }
  };

  const handleEndingCollection = () => {
    setShowEndingModal(true);
  };

  const handleSendComment = async (text) => {
    if (commentSubmitting) return;
    const value = typeof text === "string" ? text : commentText;
    if (!value.trim()) return;

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }

    setCommentSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          novel_id: parseInt(id, 10),
          content: value,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      setCommentText("");
      await fetchNovelComments();
    } catch (err) {
      console.error("Failed to post comment:", err);
      alert(`ไม่สามารถส่งความคิดเห็นได้: ${err.message || "ระบบขัดข้อง"}`);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const currentUserId = getCurrentUserId();
  const isLoggedIn = currentUserId > 0;
  const isAdmin = isLoggedIn && isCurrentUserAdmin();

  // นักเขียนเจ้าของนิยายไม่ควรเห็นปุ่ม "ติดตาม" สำหรับตัวเอง
  // เทียบกับทุก id ที่เป็นไปได้ของผู้แต่ง เผื่อ backend ส่งมาคนละ field กัน
  const isOwnNovel =
    isLoggedIn &&
    [novel.author?.user_id, novel.author?.writer_id, novel.author?.id]
      .filter(Boolean)
      .some((authorId) => String(authorId) === String(currentUserId));

  // id ของผู้แต่งไว้ใช้ลิงก์ไปหน้าโปรไฟล์นักเขียน + ส่งให้ FollowButton
  // (เดิมคำนวณ fallback chain เดียวกันนี้ซ้ำ 4 รอบในหลายจุด)
  const authorId = novel.author?.writer_id || novel.author?.id || novel.author?.user_id || null;
  const handleAuthorClick = () => {
    if (authorId) navigate(`/writer/profile/${authorId}`);
  };

  // คำนวณ % ความคืบหน้าการอ่านจากฉากที่ค้นพบ เหมือนกับในหน้าประวัติการอ่าน (HistoryPage)
  const readingPercent = totalTreeNodes > 0
    ? Math.round((visitedNodes.length / totalTreeNodes) * 100)
    : (novel.userProgress?.percentage || 0);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="novel-detail">
        <div className="novel-detail__container">
          <div className="novel-detail__state-card novel-detail__state-card--error">
            <div className="novel-detail__state-icon" aria-hidden="true">⚠️</div>
            <p className="novel-detail__state-text">เกิดข้อผิดพลาด: {error}</p>
            <button className="novel-detail__banned-btn" onClick={() => navigate("/")}>
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🟢 หากนิยายถูกระงับ ให้แสดงหน้าแจ้งเตือนและซ่อนเนื้อหา
  // ยกเว้นแอดมิน ซึ่งต้องเห็นเนื้อหาเต็มเพื่อตรวจสอบ/จัดการรายงานที่เกี่ยวข้อง
  if ((novel.status === "banned" || novel.status === "suspended") && !isAdmin) {
    return <BannedNovelView novel={novel} novelId={id} navigate={navigate} />;
  }

  return (
    <div className="novel-detail">
      {isPreview && (
        <div className="novel-detail__preview-banner">
          <span className="novel-detail__preview-banner-label">
            👁️ คุณกำลังอยู่ในโหมดทดลองอ่าน
          </span>
          <button
            type="button"
            className="novel-detail__preview-banner-btn"
            onClick={handleExitPreview}
          >
            ออกจากโหมดทดลองอ่าน
          </button>
        </div>
      )}

      {isAdmin && (novel.status === "banned" || novel.status === "suspended") && (
        <div className="novel-detail__admin-banned-banner">
          <span>
            ⚠️ นิยายเรื่องนี้ถูกระงับการเผยแพร่อยู่ ผู้อ่านทั่วไปจะมองไม่เห็นหน้านี้ — คุณเห็นเพราะเข้าสู่ระบบในฐานะแอดมิน
          </span>
        </div>
      )}

      {isAdmin && <AdminModeBanner page="หน้ารายละเอียดนิยาย" />}

      <div className="novel-detail__container">
        <button
          className="novel-detail__back"
          onClick={() => navigate("/")}
          aria-label="กลับหน้าหลัก"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          กลับหน้าหลัก
        </button>

        <div className="novel-detail__main">
          <aside className="novel-detail__aside" aria-label="ภาพปกและสถิติ">
            <NovelCoverCard novel={novel} />
          </aside>

          <main className="novel-detail__info" aria-label="ข้อมูลนิยาย">
            <div className="novel-detail__header-card">
            {novel.categories.length > 0 && (
              <div className="novel-detail__tags" role="list" aria-label="หมวดหมู่">
                {novel.categories.map((cat) => (
                  <div role="listitem" key={cat}>
                    <GenreTag label={cat} />
                  </div>
                ))}
              </div>
            )}

            <h1 className="novel-detail__title">{novel.title}</h1>

            <div className="novel-detail__author" aria-label={`ผู้แต่ง: ${novel.author.displayName}`}>
              <button
                type="button"
                className="novel-detail__author-avatar"
                aria-label={`ดูโปรไฟล์ผู้แต่ง ${novel.author.displayName}`}
                disabled={!authorId}
                style={{ cursor: authorId ? "pointer" : "default" }}
                onClick={handleAuthorClick}
              >
                {novel.author.avatarUrl ? (
                  <img src={novel.author.avatarUrl} alt={novel.author.displayName} />
                ) : (
                  <span>👤</span>
                )}
              </button>
              <button
                type="button"
                className="novel-detail__author-name"
                aria-label={`ดูโปรไฟล์ผู้แต่ง ${novel.author.displayName}`}
                disabled={!authorId}
                style={{ cursor: authorId ? "pointer" : "default" }}
                onClick={handleAuthorClick}
              >
                {novel.author.displayName}
              </button>

              {!isPreview && !isAdmin && !isOwnNovel && authorId ? (
                <FollowButton
                  writerId={authorId}
                  writerName={novel.author.displayName}
                  avatarUrl={novel.author.avatarUrl}
                  novels={[{ id: novel.id, title: novel.title, cover: novel.coverImage }]}
                  isFollowing={isFollowingAuthor}
                  onFollowChange={setIsFollowingAuthor}
                  size="small"
                />
              ) : null}
            </div>

            <p className="novel-detail__synopsis">{novel.synopsis}</p>
            </div>

            {!isAdmin && (
              <div className="novel-detail__action-bar-container">
                <div className="novel-detail__action-bar" role="group" aria-label="การกระทำสำหรับนิยาย">
                  {/* 1. ปุ่มอ่านต่อ / อ่านเลย */}
                  <button
                    type="button"
                    className="action-bar-btn action-bar-btn--primary"
                    onClick={handleRead}
                    disabled={readLoading}
                    aria-label={hasReadBefore ? "อ่านต่อ" : "อ่านเลย"}
                  >
                    <Play size={14} fill="currentColor" />
                    <span>{readLoading ? "กำลังเปิด..." : (hasReadBefore ? "อ่านต่อ" : "อ่านเลย")}</span>
                  </button>

                  {/* 🟢 ปุ่มคลังฉากจบ (แสดงเมื่อเคยอ่านแล้ว) */}
                  {hasReadBefore && (
                    <button
                      type="button"
                      className="action-bar-btn action-bar-btn--ending"
                      onClick={handleEndingCollection}
                      title="ดูคลังฉากจบที่ค้นพบ"
                    >
                      <Trophy size={15} />
                      <span>คลังฉากจบ</span>
                    </button>
                  )}

                  {/* 2. ปุ่มดูแผนผังการอ่าน */}
                  <button
                    type="button"
                    className="action-bar-btn action-bar-btn--map"
                    onClick={() => handleStoryMap()}
                    title="ดูผังเรื่องราวและเส้นทางคำเลือก"
                  >
                    <Map size={15} />
                    <span>ดูแผนผังการอ่าน</span>
                  </button>

                  {/* 3. ปุ่มเพิ่มเข้าชั้นหนังสือ */}
                  {!isPreview && (
                    <button
                      type="button"
                      className={`action-bar-btn action-bar-btn--bookmark ${novel.isBookmarked ? "is-active" : ""}`}
                      onClick={() => handleBookmark(!novel.isBookmarked)}
                      disabled={bookmarkProcessing}
                      aria-pressed={novel.isBookmarked}
                    >
                      <Bookmark size={15} fill={novel.isBookmarked ? "currentColor" : "none"} />
                      <span>{bookmarkProcessing ? "กำลังบันทึก..." : (novel.isBookmarked ? "อยู่ในชั้นหนังสือ" : "เพิ่มเข้าชั้นหนังสือ")}</span>
                    </button>
                  )}

                  {/* 4. ปุ่มถูกใจ ♡ */}
                  {!isPreview && (
                    <button
                      type="button"
                      className={`action-bar-btn action-bar-btn--icon-only action-bar-btn--like ${novel.isLiked ? "is-active" : ""}`}
                      onClick={() => handleLike(!novel.isLiked)}
                      disabled={likeProcessing}
                      title={novel.isLiked ? "ยกเลิกถูกใจ" : "กดถูกใจ"}
                      aria-label={novel.isLiked ? "ยกเลิกถูกใจ" : "กดถูกใจ"}
                      aria-pressed={novel.isLiked}
                    >
                      <Heart size={18} fill={novel.isLiked ? "currentColor" : "none"} />
                    </button>
                  )}

                  {/* 5. ปุ่ม ⋮ (Menu: เริ่มอ่านใหม่ / รายงานเรื่อง) */}
                  {!isPreview && (
                    <div className="action-bar-more-wrap" ref={moreMenuRef}>
                      <button
                        type="button"
                        className={`action-bar-btn action-bar-btn--icon-only action-bar-btn--more ${showMoreMenu ? "is-active" : ""}`}
                        onClick={() => setShowMoreMenu((prev) => !prev)}
                        title="เมนูเพิ่มเติม"
                        aria-label="เมนูเพิ่มเติม"
                        aria-expanded={showMoreMenu}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {showMoreMenu && (
                        <div className="action-bar-dropdown-menu" role="menu">
                          {isLoggedIn && (
                            <button
                              type="button"
                              className="dropdown-menu-item"
                              onClick={() => {
                                setShowMoreMenu(false);
                                handleRestartConfirmOpen();
                              }}
                              role="menuitem"
                            >
                              <RotateCcw size={15} />
                              <span>เริ่มอ่านใหม่</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="dropdown-menu-item dropdown-menu-item--report"
                            onClick={() => {
                              setShowMoreMenu(false);
                              if (!isLoggedIn) {
                                navigate("/login-register");
                              } else {
                                setShowReportModal(true);
                              }
                            }}
                            role="menuitem"
                          >
                            <Flag size={15} />
                            <span>รายงานเรื่อง</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card "อ่านล่าสุด" สำหรับนักอ่านที่เคยอ่านแล้ว */}
                {hasReadBefore && latestNode && (() => {
                  const readInfo = getLatestReadInfo(latestNode);
                  const relTime = formatRelativeTime(latestNode.visited_at || latestNode.last_read_at || latestNode.updated_at);
                  return (
                    <div className="novel-detail__latest-read-card" onClick={handleRead} role="button" tabIndex={0}>
                      <div className="latest-read-card__top">
                        <div className="latest-read-card__left">
                          <div className="latest-read-card__header-row">
                            <span className="latest-read-card__label">📍 อ่านล่าสุดที่</span>
                            {relTime && (
                              <span className="latest-read-card__time">
                                • อ่านเมื่อ {relTime}
                              </span>
                            )}
                          </div>

                          <div className="latest-read-card__chapter-info">
                            <span className="latest-read-card__chapter-title">
                              {readInfo.chapter}
                            </span>
                          </div>

                          {readInfo.scene && (
                            <div className="latest-read-card__scene-info">
                              <span className="latest-read-card__scene-chip">
                                {readInfo.scene}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="latest-read-card__right">
                          <span className="latest-read-card__count">
                            {visitedNodes.length}{totalTreeNodes > 0 ? `/${totalTreeNodes}` : ""} ฉากที่ค้นพบ
                          </span>
                          <button
                            type="button"
                            className="latest-read-card__btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRead();
                            }}
                          >
                            อ่านต่อ →
                          </button>
                        </div>
                      </div>

                      {/* หลอด % ความคืบหน้าการอ่าน (คำนวณเหมือนหน้าประวัติการอ่าน) */}
                      <div className="latest-read-card__progress-container">
                        <div className="latest-read-card__progress-header">
                          <span className="latest-read-card__progress-text">ความคืบหน้าการอ่าน</span>
                          <span className="latest-read-card__progress-percent">
                            {readingPercent}%
                          </span>
                        </div>
                        <div className="latest-read-card__progress-track">
                          <div
                            className="latest-read-card__progress-fill"
                            style={{ width: `${Math.min(100, Math.max(0, readingPercent))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {isAdmin ? (
              <div className="novel-detail__progress">
                <NovelProgressBar
                  novelId={novel.id}
                  autoFetch={true}
                  isPreview={false}
                  isAdmin={true}
                  onStoryMapClick={handleStoryMap}
                  onEndingCollectionClick={handleEndingCollection}
                  onContinueRead={handleRead}
                  onSceneClick={(sceneId) => navigate(`/reading/${novel.id}/${sceneId}`)}
                />
              </div>
            ) : isPreview ? (
              <div className="novel-detail__progress">
                <NovelProgressBar
                  novelId={novel.id}
                  isPreview={true}
                  onSceneClick={(sceneId) => navigate(`/reading/${novel.id}/${sceneId}?preview=true`)}
                />
              </div>
            ) : null}

          </main>
        </div>

        {/* 🟢 Card "จุดที่ค้นพบ" สำหรับนักอ่านที่เคยอ่านแล้ว */}
        {hasReadBefore && visitedNodes.length > 0 && (
          <section className="novel-detail__discovered-section">
            <div className="discovered-card">
              <div className="discovered-card__header">
                <div>
                  <h2 className="discovered-card__title">จุดที่ค้นพบ</h2>
                  <p className="discovered-card__subtitle">เรื่องราวที่เปิดเผยในเส้นทางของคุณ</p>
                </div>
                <span className="discovered-card__badge">
                  ค้นพบ {visitedNodes.length}{totalTreeNodes > 0 ? ` จากทั้งหมด ${totalTreeNodes}` : ""} ฉาก
                </span>
              </div>

              <div className="discovered-card__list">
                {paginatedDiscoveredNodes.map((node) => {
                  const isCurrent = latestNode && String(node.id) === String(latestNode.id);
                  const epNum = node.chapter_episode || node.chapterEpisode || node.episode || node.chapter_order || node.chapterOrder;
                  const chapterLabel = node.type === "start"
                    ? "จุดเริ่มต้น"
                    : epNum
                    ? `ตอนที่ ${epNum}`
                    : node.chapter_title || "ฉากเนื้อเรื่อง";
                  const sceneTitle = stripHtml(node.title || node.scene_name || node.name || "เนื้อเรื่อง");

                  return (
                    <div
                      key={node.id}
                      className={`discovered-item ${isCurrent ? "discovered-item--current" : ""}`}
                      onClick={() => navigate(`/reading/${novel.id}/${node.id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="discovered-item__icon">
                        {isCurrent ? <MapPin size={16} /> : <CheckCircle2 size={16} />}
                      </div>
                      <div className="discovered-item__content">
                        <span className="discovered-item__chapter">{chapterLabel}</span>
                        <span className="discovered-item__scene">{sceneTitle}</span>
                      </div>
                      {isCurrent && (
                        <span className="discovered-item__current-badge">ฉากปัจจุบัน</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {discoveredTotalPages > 1 && (
                <div className="discovered-card__pagination">
                  <button
                    type="button"
                    className="discovered-page-btn"
                    disabled={discoveredPage === 1}
                    onClick={() => setDiscoveredPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ ก่อนหน้า
                  </button>
                  <span className="discovered-page-info">
                    หน้า {discoveredPage} จาก {discoveredTotalPages}
                  </span>
                  <button
                    type="button"
                    className="discovered-page-btn"
                    disabled={discoveredPage === discoveredTotalPages}
                    onClick={() => setDiscoveredPage((p) => Math.min(discoveredTotalPages, p + 1))}
                  >
                    ถัดไป ›
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="novel-detail__synopsis-section" aria-labelledby="synopsis-heading">
          <h2 id="synopsis-heading" className="novel-detail__section-title">
            แนะนำเรื่อง
          </h2>
          <div
            className="novel-detail__synopsis-detail"
            dangerouslySetInnerHTML={{ __html: novel.synopsis_detail }}
          />
        </section>

        {/* 🟢 โหมดทดลองอ่านของนักเขียนเจ้าของนิยายก็ยังต้องเห็นคอมเมนต์เพื่อจำลองมุมมองนักอ่าน */}
        <Comments
          comments={comments}
          currentUserId={getCurrentUserId()}
          commentText={commentText}
          isSubmitting={commentSubmitting}
          onCommentTextChange={(e) => setCommentText(e.target.value)}
          onSubmit={isPreview ? undefined : (text) => handleSendComment(text)}
          readOnly={isAdmin || isPreview}
          onDeleteComment={
            isPreview
              ? undefined
              : async (commentId) => {
                  const token = localStorage.getItem("token");
                  if (!token) {
                    navigate("/login-register");
                    return;
                  }

                  try {
                    const response = await fetch(`${API_BASE_URL}/comments?comment_id=${commentId}`, {
                      method: "DELETE",
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    });

                    if (!response.ok) {
                      const payload = await response.json().catch(() => null);
                      throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
                    }

                    await fetchNovelComments();
                  } catch (err) {
                    console.error("Failed to delete comment:", err);
                    alert(`ไม่สามารถลบความคิดเห็นได้: ${err.message || "ระบบขัดข้อง"}`);
                  }
                }
          }
        />

        <EndingCollection
          isOpen={showEndingModal && isLoggedIn}
          endings={endings}
          onClose={() => setShowEndingModal(false)}
          onViewStoryMap={(sceneId) => handleStoryMap(sceneId)}
        />

        {showNoContentDialog && (
          <SimpleModal onClose={() => setShowNoContentDialog(false)} maxWidth={400}>
            <div className="novel-detail__modal-emoji">✍️✨</div>
            <h3 className="novel-detail__modal-title">นักเขียนกำลังรังสรรค์เนื้อหา</h3>
            <p className="novel-detail__modal-text">
              นิยายเรื่องนี้ยังไม่มีเนื้อหาให้อ่าน <br />
              รอนักเขียนปล่อยฉากใหม่เร็วๆ นี้นะ
            </p>
            <button
              className="novel-detail__modal-primary-btn"
              onClick={() => setShowNoContentDialog(false)}
            >
              รับทราบ ยินดีรอคอย
            </button>
          </SimpleModal>
        )}

        {showRestartConfirm && isLoggedIn && (
          <SimpleModal onClose={handleRestartConfirmClose} maxWidth={420}>
            <h3 className="novel-detail__modal-title novel-detail__modal-title--left">เริ่มอ่านใหม่</h3>
            <p className="novel-detail__modal-text novel-detail__modal-text--left">
              การเริ่มอ่านใหม่นี้จะคืนสถานะความคืบหน้าและผังเรื่องกลับไปยังจุดเริ่มต้น แต่จะยังเก็บตอนจบที่คุณค้นพบไว้
            </p>
            {restartError && (
              <div className="novel-detail__modal-error">{restartError}</div>
            )}
            <div className="novel-detail__modal-actions">
              <button
                type="button"
                className="novel-detail__modal-secondary-btn"
                onClick={handleRestartConfirmClose}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="novel-detail__modal-primary-btn"
                onClick={handleRestart}
                disabled={restartLoading}
              >
                {restartLoading ? "กำลังเริ่มใหม่..." : "ยืนยันเริ่มอ่านใหม่"}
              </button>
            </div>
          </SimpleModal>
        )}

      </div>

      <ReaderReportButton
        novelId={novel.id}
        novelTitle={novel.title}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        showRibbon={false}
      />
    </div>
  );
};

export default NovelDetailPage;