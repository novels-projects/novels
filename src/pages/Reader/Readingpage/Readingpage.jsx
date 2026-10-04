import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom"; 
import { GitFork, ArrowLeft, Award, ChevronDown, RotateCcw, Smile, Bookmark } from "lucide-react";
import "react-quill-new/dist/quill.snow.css";
import "./Readingpage.css";
import ReadingBreadcrumb from "../../../components/ReadingBreadcrumb/ReadingBreadcrumb";
import ChoiceButtons from "../../../components/ChoiceButtons/ChoiceButtons";
import RestartReadingButton from "../../../components/RestartReadingButton/RestartReadingButton";
import ReadingSettings from "../../../components/ReadingSettings/ReadingSettings";
import ActionButtons from "../../../components/ActionButtons/ActionButtons";
import Comments from "../../../components/Comments/Comments";
import EndingUnlockedModal, { ENDING_DEFINITIONS } from "../../../components/EndingUnlockedModal/EndingUnlockedModal";
import AdminModeBanner from "../../../components/AdminModeBanner/AdminModeBanner";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080";

const ReadingPage = ({
  userId = 0,
  novelTitle = "กำลังโหลดชื่อเรื่อง...",
  initialSceneId = null, 
}) => {

  const { novelId, sceneId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const isPreviewMode = searchParams.get("preview") === "true";
  const previewQueryString = isPreviewMode ? `?${searchParams.toString()}` : "";

  const handleExitPreview = () => {
    const fallbackUrl = sessionStorage.getItem("previewReturnUrl") || "";
    sessionStorage.removeItem("previewReturnUrl");

    // แท็บนี้ถูกเปิดผ่าน window.open(...) จากหน้า Scene Editor เสมอเวลาเข้าโหมดทดลองอ่าน
    // (ดู handleOpenPreview / handleConfirmPendingAction ใน SceneEditorPage.jsx) ดังนั้นแท็บนี้
    // มีสิทธิ์ปิดตัวเองผ่าน window.close() ได้เลยโดยไม่ต้องพึ่ง window.opener
    //
    // บั๊กเดิม: window.open ฝั่ง editor เปิดด้วย flag "noopener" (กัน reverse-tabnabbing)
    // ทำให้ window.opener ในแท็บนี้เป็น null เสมอ แต่โค้ดเดิมเอา window.close() ไปซ่อนไว้
    // หลังเงื่อนไข `if (window.opener && ...)` ที่ไม่มีวันเป็นจริง -> กดออกจาก preview
    // แล้วแท็บไม่เคยถูกปิดเลย แค่ navigate เปลี่ยนหน้าในแท็บเดิมแทน
    window.close();

    // เผื่อ browser ไม่ยอมให้ปิดแท็บ (เช่น แท็บนี้ไม่ได้ถูกเปิดโดยสคริปต์จริงๆ อย่างกรณี
    // ผู้ใช้เปิดลิงก์เองหรือ refresh) ให้ fallback พากลับไปหน้าที่ควรกลับไปแทน
    // เพื่อไม่ให้ผู้ใช้ค้างอยู่ในโหมด preview
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

  const getCurrentUserId = () => {
    const userJson = localStorage.getItem("user");
    if (!userJson) return 0;
    try {
      const user = JSON.parse(userJson);
      return user?.id || user?.user_id || 0;
    } catch (err) {
      console.error("Failed to parse user from localStorage:", err);
      return 0;
    }
  };

  const checkIsAdmin = () => {
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        const r = (u?.role || u?.user_role || u?.role_name || "").toString().toLowerCase();
        if (r === "admin" || u?.is_admin === true || u?.isAdmin === true) return true;
      }
    } catch {}
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const parts = token.split(".");
        if (parts.length === 3) {
          let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          while (payload.length % 4) payload += "=";
          const decoded = atob(payload);
          const json = decodeURIComponent(
            decoded.split("").map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`).join("")
          );
          const parsed = JSON.parse(json);
          const r = (parsed?.role || parsed?.user_role || "").toString().toLowerCase();
          if (r === "admin" || parsed?.is_admin === true || parsed?.isAdmin === true) return true;
        }
      }
    } catch {}
    return false;
  };

  // เดิม checkIsAdmin()/getCurrentUserId() ถูกเรียกตรงๆ ทุก render (parse JSON + decode JWT
  // ซ้ำทุกครั้งที่ state ไหนๆ ในหน้าเปลี่ยน) ครอบด้วย useMemo ให้คำนวณใหม่เฉพาะตอน mount
  const isAdmin = useMemo(() => checkIsAdmin(), []);
  const effectiveUserId = useMemo(() => getCurrentUserId() || userId, [userId]);

  const [currentSceneId, setCurrentSceneId] = useState(initialSceneId || sceneId || null);
  const [sceneData, setSceneData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkProcessing, setBookmarkProcessing] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [commentText, setCommentText] = useState("");
  const [sceneComments, setSceneComments] = useState({});
  const comments = sceneComments[currentSceneId] || [];

  // State สำหรับ Pop-up ยินดีด้วย ค้นพบฉากจบใหม่
  const [showEndingModal, setShowEndingModal] = useState(false);
  const [allNovelEndings, setAllNovelEndings] = useState([]);
  const [showEndingActionsMenu, setShowEndingActionsMenu] = useState(false);

  // State สำหรับ Pop-up ยืนยันการเริ่มอ่านใหม่
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [restartError, setRestartError] = useState(null);

  // Pop-up ชวนเพิ่มเข้าชั้นหนังสือ ตอนอ่านมาถึงตอนล่าสุดที่ยังไม่จบเรื่อง
  const [bookmarkNudgeDismissed, setBookmarkNudgeDismissed] = useState(false);

  const fetchSceneComments = async (sceneId) => {
    if (!sceneId) return;

    try {
      const response = await fetch(`${BASE_URL}/scenes/${sceneId}/comments`);
      if (!response.ok) {
        throw new Error(`failed to load comments (${response.status})`);
      }
      const payload = await response.json().catch(() => null);
      const fetchedComments =
        Array.isArray(payload?.data?.comments) ? payload.data.comments :
        Array.isArray(payload?.comments) ? payload.comments :
        [];
      setSceneComments((prev) => ({
        ...prev,
        [sceneId]: fetchedComments,
      }));
    } catch (err) {
      console.warn("Failed to load scene comments:", err);
    }
  };

  const getSavedReadingSettings = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("readingSettings"));
      return {
        fontFamily: stored?.fontFamily || "Sarabun",
        fontSize: stored?.fontSize || 18,
        theme: stored?.theme || "light",
      };
    } catch {
      return {
        fontFamily: "Sarabun",
        fontSize: 18,
        theme: "light",
      };
    }
  };

  const savedReadingSettings = getSavedReadingSettings();
  const [fontFamily, setFontFamily] = useState(savedReadingSettings.fontFamily);
  const [fontSize, setFontSize] = useState(savedReadingSettings.fontSize);
  const [theme, setTheme] = useState(savedReadingSettings.theme);
  const contentRef = useRef(null);

  const getFontFamilyString = (value) => {
    switch (value) {
      case "Sarabun":
        return "'Sarabun', sans-serif";
      case "Open Sans":
        return "'Open Sans', sans-serif";
      case "Prompt":
        return "'Prompt', sans-serif";
      case "Kanit":
        return "'Kanit', sans-serif";
      default:
        return "'Sarabun', sans-serif";
    }
  };

  const showToast = (message) => {
    setToastMessage(message);
  };

  const fetchBookmarkedStatus = async (currentNovelId, userId, headers) => {
    if (!currentNovelId || !userId) return false;

    try {
      const response = await fetch(`${BASE_URL}/bookshelves?user_id=${userId}`, { headers });
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


  useEffect(() => {
    setBookmarkNudgeDismissed(false);
  }, [currentSceneId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const loadBookmarkStatus = async () => {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (!novelId || !effectiveUserId) {
        setIsBookmarked(false);
        return;
      }

      const bookmarked = await fetchBookmarkedStatus(novelId, effectiveUserId, headers);
      setIsBookmarked(bookmarked);
    };

    loadBookmarkStatus();
  }, [novelId, effectiveUserId]);

  const updateReadingProgress = async (nId, sId, sceneType) => {
    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      if (!effectiveUserId) {
        console.warn("No logged-in user found, skipping progress save.");
      } else {
        const progressRes = await fetch(`${BASE_URL}/progress`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            user_id: parseInt(effectiveUserId),
            novel_id: parseInt(nId),
            current_scene_id: parseInt(sId)
          })
        });

        if (!progressRes.ok) {
          const errText = await progressRes.text();
          console.error("Progress save failed:", progressRes.status, errText);
        }

        if ((sceneType === "ending" || sceneType === "Ending") && effectiveUserId) {
          const endingRes = await fetch(`${BASE_URL}/user-endings`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              user_id: parseInt(effectiveUserId),
              novel_id: parseInt(nId),
              scene_id: parseInt(sId)
            })
          });

          if (!endingRes.ok) {
            const errText = await endingRes.text();
            console.error("Ending record failed:", endingRes.status, errText);
          }

          // ดึงรายการฉากจบทั้งหมดของนิยายเรื่องนี้เพื่อนำมาแสดงใน Pop-up Modal
          try {
            const allEndingsRes = await fetch(`${BASE_URL}/novels/${nId}/endings?user_id=${effectiveUserId}`, { headers });
            if (allEndingsRes.ok) {
              const endingsPayload = await allEndingsRes.json();
              const fetchedEndings =
                Array.isArray(endingsPayload?.data?.endings) ? endingsPayload.data.endings :
                Array.isArray(endingsPayload?.endings) ? endingsPayload.endings :
                Array.isArray(endingsPayload?.data) ? endingsPayload.data : [];
              setAllNovelEndings(fetchedEndings);
            }
          } catch (e) {
            console.warn("Failed to fetch all novel endings:", e);
          }
        }
      }
    } catch (err) {
      console.error("❌ ไม่สามารถอัปเดตความคืบหน้าการอ่านได้:", err);
    }
  };

useEffect(() => {
    if (!novelId || novelId === "undefined") {
      console.error("❌ บั๊กหน้าจอ: ReadingPage ไม่ได้รับรหัสนิยาย");
      setError("ไม่พบรหัสนิยาย กรุณาตรวจสอบการส่งค่ามาจากหน้าก่อนหน้า");
      setLoading(false);
      return;
    }

    // 🎯 ดึงไอดีที่ส่งมาจาก URL หรือประวัติโดยตรง ณ วินาทีนั้น ไม่พึ่งพา State ภายในเพื่อป้องกันการหน่วง
    const activeSceneId = sceneId || initialSceneId || currentSceneId;

    // 🎯 กันปัญหา race condition: ถ้าผู้ใช้กดเลือกทางเลือกรัวๆ อาจมี fetch เก่าค้างตอบกลับ
    // มาทีหลัง fetch ใหม่แล้วทับข้อมูลฉากปัจจุบันด้วยข้อมูลฉากที่ไม่ใช่ฉากล่าสุดจริง
    // ใช้ flag นี้เช็คก่อน setState ทุกจุดว่า effect รอบนี้ยังเป็นรอบล่าสุดอยู่ไหม
    let isStale = false;

    const fetchScene = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = ""; 
        
        let query = effectiveUserId > 0 ? `?user_id=${effectiveUserId}` : "";
        
        if (isPreviewMode) {
          query += query ? "&preview=true" : "?preview=true";
        }
        
        // 🎯 ดักจับ 'new' เพื่อไม่ให้ยิงไป API /scenes/new จนเกิด 404
        const isInvalidSceneId = !activeSceneId || 
                                 activeSceneId === "undefined" || 
                                 activeSceneId === "0" || 
                                 activeSceneId === "new";

        if (isInvalidSceneId) {
          url = `${BASE_URL}/novels/${novelId}/start${query}`;
        } else {
          url = `${BASE_URL}/scenes/${activeSceneId}${query}`;
        }

        const token = localStorage.getItem("token");

        const headers = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, { headers });
        if (isStale) return;

        if (response.status === 404) {
          setError("EMPTY_SCENE"); 
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("ไม่สามารถโหลดเนื้อหาฉากจากระบบหลังบ้านได้");
        }

        const resData = await response.json();
        if (isStale) return;

        if (resData && resData.data) {
          const loadedNovelId = resData.data.novel_id || resData.data.novelId;
          
          if (loadedNovelId && String(loadedNovelId) !== String(novelId)) {
            console.error("Safety Net Triggered: ฉากที่โหลดมาไม่ตรงกับนิยายที่กำลังอ่าน");
            setError("EMPTY_SCENE"); 
            setLoading(false);
            return;
          }

          setSceneData(resData.data);
          const loadedSceneId = resData.data.scene_id || resData.data.id;
          
          setCurrentSceneId(loadedSceneId);
          fetchSceneComments(loadedSceneId);

          if (!isPreviewMode && !isAdmin) {
            updateReadingProgress(novelId, loadedSceneId, resData.data.type);
          }

        } else {
          setError("EMPTY_SCENE");
        }
      } catch (err) {
        if (isStale) return;
        console.error("Fetch error:", err);
        setError(err.message);
      } finally {
        if (!isStale) setLoading(false);
      }
    };

    fetchScene();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 🎯 เฝ้าดูเฉพาะ novelId และ sceneId ที่มาจาก URL เท่านั้น เมื่อเปลี่ยนปุ๊บเคลียร์ฉากใหม่ปั๊บ
    return () => {
      isStale = true;
    };
  }, [novelId, sceneId, initialSceneId]);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const endingModalTriggeredRef = useRef(false);

  // ฉากเปลี่ยน -> รีเซ็ต flag กันเด้ง modal ซ้ำ เพื่อให้ฉากจบถัดไปเด้งเตือนใหม่ได้
  useEffect(() => {
    endingModalTriggeredRef.current = false;
  }, [currentSceneId]);

  useEffect(() => {
    // 🎯 เดิมคำนวณ % สกรอลล์ + setState ทุกๆ scroll event (ยิงถี่มากตอนลากเมาส์/แตะจอ)
    // ครอบด้วย requestAnimationFrame ให้คำนวณอย่างมากแค่ 1 ครั้งต่อเฟรม ลดการ re-render รัวๆ
    let ticking = false;

    const computeScroll = () => {
      ticking = false;
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;

      setShowScrollTop(scrolled > 480);

      if (total > 0) {
        const pct = Math.round((scrolled / total) * 100);
        setReadProgress(pct);

        // 🎯 หากอยู่ในฉากจบ และสกรอลล์อ่านลงมาถึงก้นหน้า (90% ขึ้นไป) -> เด้ง Pop-up ค้นพบฉากจบใหม่ (ปิดถ้าอยู่ใน preview mode)
        // เดิมเรียก setShowEndingModal(true) ทุก tick ที่ผ่าน 90% แม้เปิดอยู่แล้ว/ผู้ใช้เพิ่งปิดเอง
        // เลยเด้งกลับมาเปิดซ้ำทันทีที่ขยับสกรอลล์นิดเดียว ใช้ ref เช็คว่าเคย trigger รอบนี้ไปแล้วหรือยัง
        if (
          !isPreviewMode &&
          !endingModalTriggeredRef.current &&
          sceneData &&
          (sceneData.type === "ending" || sceneData.type === "Ending") &&
          pct >= 90
        ) {
          endingModalTriggeredRef.current = true;
          setShowEndingModal(true);
        }
      }
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(computeScroll);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sceneData, isPreviewMode]);

  const handleScrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleChoose = async (choice) => {
    if (isTransitioning) return;
    // Reader ปกติ: เส้นทางยังมีอยู่ แต่ฉากปลายทางยังไม่พร้อมอ่าน
    // ต้องให้ feedback โดยไม่บันทึก choice history / navigate / update progress
    if (!isPreviewMode && choice.is_published === false) {
      showToast("ฉากถัดไปกำลังอยู่ระหว่างการเขียน โปรดกลับมาอ่านใหม่ภายหลัง");
      return;
    }

    setIsTransitioning(true);

    if (!isPreviewMode) {
      try {
        const token = localStorage.getItem("token");
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        if (!effectiveUserId) {
          console.warn("No logged-in user found, skipping choice history save.");
        } else {
          const response = await fetch(`${BASE_URL}/choice-history`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              user_id: parseInt(effectiveUserId),
              choice_id: parseInt(choice.choice_id)
            })
          });

          if (!response.ok) {
            setIsTransitioning(false);
            showToast("ฉากถัดไปกำลังอยู่ระหว่างการเขียน โปรดกลับมาอ่านใหม่ภายหลัง");
            return;
          }
        }
      } catch (err) {
        console.error("บันทึกประวัติการเลือกทางเลือกผิดพลาด:", err);
        setIsTransitioning(false);
        showToast("ฉากถัดไปกำลังอยู่ระหว่างการเขียน โปรดกลับมาอ่านใหม่ภายหลัง");
        return;
      }
    }

    setTimeout(() => {
      const nextSearchParams = new URLSearchParams(location.search);
      if (isPreviewMode) {
        nextSearchParams.set("preview", "true");
      } else {
        nextSearchParams.delete("preview");
      }
      const nextQuery = nextSearchParams.toString();
      navigate(`/reading/${novelId}/${choice.to_scene_id}${nextQuery ? `?${nextQuery}` : ""}`);
      setCurrentSceneId(choice.to_scene_id);
      setIsTransitioning(false);
    }, 350);
  };

  // 🟢 ตอนอยู่ใน preview mode ปุ่มย้อนกลับ/ดูผังเรื่องต้องพากลับไปหน้าที่ยัง "อยู่ใน preview" ต่อ
  // (ใช้ previewQueryString ตัวเดียวกับที่ handleChoose ใช้อยู่แล้ว ไม่สร้าง logic ใหม่ซ้ำ)
  // เดิมไม่แนบ query นี้เลย ทำให้กดย้อนกลับแล้วหลุดออกจาก preview ไปหน้ารายละเอียดจริงทันที
  const handleLocalNavigate = (targetView) => {
    if (targetView === "story-tree") {
      navigate(`/storytree/${novelId}${previewQueryString}`);
    } else if (targetView === "novel-detail") {
      navigate(`/novel/${novelId}${previewQueryString}`);
    }
  };

  const saveReadingSettings = (newSettings) => {
    const payload = {
      fontFamily,
      fontSize,
      theme,
      ...newSettings,
    };
    localStorage.setItem("readingSettings", JSON.stringify(payload));
  };

  const handleFontFamilyChange = (value) => {
    setFontFamily(value);
    saveReadingSettings({ fontFamily: value });
  };

  const handleDecreaseFont = () => {
    setFontSize((prev) => {
      const next = Math.max(14, prev - 2);
      saveReadingSettings({ fontSize: next });
      return next;
    });
  };

  const handleIncreaseFont = () => {
    setFontSize((prev) => {
      const next = Math.min(26, prev + 2);
      saveReadingSettings({ fontSize: next });
      return next;
    });
  };

  const handleThemeChange = (value) => {
    setTheme(value);
    saveReadingSettings({ theme: value });
  };

  // 🎯 เพิ่ม/ลบชั้นหนังสือจริง (ของเดิมมีแค่เช็คสถานะเฉยๆ ไม่เคยมีปุ่มกดใช้งาน)
  // ยืนยัน endpoint แล้วจาก AddToBookshelfHandler / RemoveFromBookshelfHandler ทั้งคู่ผ่าน
  // middleware.RequireAuth คือดึง user_id จาก token เอง ไม่ต้องส่ง user_id มาเอง
  const handleToggleBookmark = async (nextValue) => {
    if (!effectiveUserId) {
      navigate("/login-register");
      return;
    }
    if (bookmarkProcessing) return;

    setBookmarkProcessing(true);
    const previousValue = isBookmarked;
    setIsBookmarked(nextValue); // อัปเดตหน้าจอทันทีให้รู้สึกลื่น แล้วค่อย rollback ถ้า error

    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // 🎯 backend ดึง user_id จาก token ผ่าน middleware.RequireAuth เอง (ไม่อ่านจาก body/query)
      // ฝั่งนี้เลยส่งแค่ novel_id พอ — DELETE อ่าน novel_id จาก query, POST อ่านจาก JSON body
      const response = nextValue
        ? await fetch(`${BASE_URL}/bookshelves`, {
            method: "POST",
            headers,
            body: JSON.stringify({ novel_id: parseInt(novelId) }),
          })
        : await fetch(`${BASE_URL}/bookshelves?novel_id=${novelId}`, {
            method: "DELETE",
            headers,
          });

      if (!response.ok) {
        throw new Error(`bookshelf update failed (${response.status})`);
      }

      showToast(nextValue ? "เพิ่มเข้าชั้นหนังสือแล้ว" : "นำออกจากชั้นหนังสือแล้ว");
    } catch (err) {
      console.error("Failed to update bookshelf:", err);
      setIsBookmarked(previousValue);
      showToast("ไม่สามารถอัปเดตชั้นหนังสือได้ในขณะนี้");
    } finally {
      setBookmarkProcessing(false);
    }
  };

  const handleRestartClick = () => {
    setRestartError(null);
    setShowRestartConfirm(true);
  };

  const handleConfirmRestartReading = async () => {
    setRestartLoading(true);
    setRestartError(null);
    try {
      if (effectiveUserId) {
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(`${BASE_URL}/progress?user_id=${effectiveUserId}&novel_id=${novelId}`, {
          method: "DELETE",
          headers,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Reset progress failed:", response.status, errText);
          setRestartError("ไม่สามารถเริ่มอ่านใหม่ได้ในขณะนี้");
          setRestartLoading(false);
          return;
        }
      }

      setShowRestartConfirm(false);
      setShowEndingModal(false);
      endingModalTriggeredRef.current = true;
      setCurrentSceneId(null);
      navigate(`/reading/${novelId}${previewQueryString}`);
    } catch (err) {
      console.error("Error resetting progress:", err);
      setRestartError("เกิดข้อผิดพลาดขณะเริ่มอ่านใหม่");
    } finally {
      setRestartLoading(false);
    }
  };

  const parsePositiveInt = (value) => {
    const numeric = Number(value);
    return Number.isNaN(numeric) || numeric <= 0 ? null : numeric;
  };

  const getCommentSceneId = () => {
    const maybeSceneId = currentSceneId || sceneData?.scene_id || sceneData?.id;
    if (maybeSceneId == null) return null;

    return parsePositiveInt(maybeSceneId);
  };

  const handleCommentSubmit = async (text) => {
    const trimmed = (text || "").trim();
    const numericNovelId = parsePositiveInt(novelId);
    if (!trimmed || !numericNovelId) {
      if (!trimmed) return;
      showToast("ไม่สามารถโพสต์คอมเมนต์ได้ เนื่องจากรหัสนิยายไม่ถูกต้อง");
      return;
    }

    const sceneIdNumber = getCommentSceneId();
    if (!sceneIdNumber) {
      showToast("ไม่สามารถโพสต์คอมเมนต์ได้ เนื่องจากไม่พบฉากที่กำลังอ่าน");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }

    setCommentSubmitting(true);
    try {
      const bodyPayload = {
        novel_id: parseInt(novelId, 10),
        scene_id: sceneIdNumber,
        content: trimmed,
      };

      const response = await fetch(`${BASE_URL}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      await fetchSceneComments(sceneIdNumber);
      setCommentText("");
      showToast("ส่งความคิดเห็นแล้ว");
    } catch (err) {
      console.error("Failed to post comment:", err);
      showToast("ไม่สามารถส่งความคิดเห็นได้ในขณะนี้");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!commentId) return;

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/comments?comment_id=${commentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
      }

      await fetchSceneComments(currentSceneId);
      showToast("ลบความคิดเห็นเรียบร้อยแล้ว");
    } catch (err) {
      console.error("Failed to delete comment:", err);
      showToast("ไม่สามารถลบความคิดเห็นได้");
    }
  };

  const currentEndingInfo = useMemo(() => {
    if (!sceneData) return null;

    const rawType = (
      sceneData?.scene_type ||
      sceneData?.type ||
      sceneData?.sceneType ||
      sceneData?.Type ||
      sceneData?.scene_type_name ||
      sceneData?.typeName ||
      ""
    ).toString().toLowerCase().trim();

    const choicesList = sceneData?.choices || [];
    const hasNoChoices = choicesList.length === 0;
    const isEndingType = rawType === "ending";
    const isTrueEnding = hasNoChoices && isEndingType;

    if (!isTrueEnding) return null;

    const currentId = sceneData?.scene_id || sceneData?.id;
    const matchedInList = (allNovelEndings || []).find(
      (e) => String(e.scene_id || e.id || e.sceneId) === String(currentId)
    );

    const sTitle = sceneData?.scene_title || sceneData?.sceneTitle || sceneData?.title || sceneData?.Title || "";
    const cOrder = sceneData?.chapter_order || sceneData?.order || sceneData?.chapter_episode || sceneData?.chapterEpisode || "";

    const rawEndingType = (
      matchedInList?.ending_type ||
      matchedInList?.endingType ||
      matchedInList?.type ||
      sceneData?.ending_type ||
      sceneData?.endingType ||
      sceneData?.ending_category ||
      sceneData?.endingCategory ||
      "true"
    ).toString().toLowerCase().trim();

    let endingKey = "true";
    if (rawEndingType.includes("good")) endingKey = "good";
    else if (rawEndingType.includes("bad")) endingKey = "bad";
    else if (rawEndingType.includes("secret")) endingKey = "secret";
    else if (rawEndingType.includes("true")) endingKey = "true";
    else endingKey = "true";

    const def = ENDING_DEFINITIONS[endingKey] || ENDING_DEFINITIONS.true || {
      key: "true",
      typeLabel: "TRUE ENDING",
      emoji: "👑",
      badgeBg: "#fef3c7",
      badgeColor: "#b45309",
      cardBorder: "#fde68a",
      cardBg: "#fffbeb",
      defaultTitle: "ฉากจบสมบูรณ์",
      defaultDesc: "",
    };

    const endingTitle =
      matchedInList?.title ||
      matchedInList?.scene_title ||
      matchedInList?.ending_title ||
      sceneData?.ending_title ||
      sceneData?.title ||
      sceneData?.scene_title ||
      sTitle ||
      def.defaultTitle;

    const endingDesc =
      matchedInList?.description ||
      matchedInList?.ending_description ||
      sceneData?.ending_description ||
      sceneData?.description ||
      def.defaultDesc ||
      "";

    const endingNum =
      matchedInList?.ending_number ||
      matchedInList?.order ||
      sceneData?.ending_number ||
      cOrder ||
      "";

    return {
      key: endingKey,
      emoji: def.emoji,
      typeLabelEN: def.typeLabelEN || def.typeLabel || "TRUE ENDING",
      typeLabelTH: def.typeLabelTH || "ฉากจบแท้จริง",
      typeLabel: def.typeLabel,
      badgeBg: def.badgeBg,
      badgeColor: def.badgeColor,
      cardBorder: def.cardBorder,
      cardBg: def.cardBg,
      title: endingTitle,
      description: endingDesc,
      number: endingNum,
    };
  }, [sceneData, allNovelEndings]);

  if (loading) {
    return <LoadingScreen message="กำลังดึงเนื้อหาฉากจริงจากระบบฐานข้อมูล..." />;
  }

  if (error) {
    if (error === "EMPTY_SCENE") {
      return (
        <div className="rp__empty-state">
          <div className="rp__empty-state-icon">🚧</div>
          <h2 className="rp__empty-state-title">
            ยังไม่มีเนื้อหาในนิยายเรื่องนี้
          </h2>
          <p className="rp__empty-state-text">
            นักเขียนกำลังเรียบเรียงและยังไม่ได้เผยแพร่ฉากแรก โปรดรอติดตามและกลับมาดูใหม่ในภายหลัง
          </p>
          <button
            onClick={() => handleLocalNavigate("novel-detail")}
            className="rp__empty-state-button"
          >
            กลับหน้ารายละเอียดนิยาย
          </button>
        </div>
      );
    }

    return (
      <div className="rp__error-state">
        <h3 className="rp__error-state-title">เกิดข้อผิดพลาดในการโหลดเนื้อหา</h3>
        <p className="rp__error-state-text">{error}</p>
        <button
          onClick={() => handleLocalNavigate("novel-detail")}
          className="rp__error-state-button"
        >
          กลับไปหน้ารายละเอียดนิยาย
        </button>
      </div>
    );
  }

  const {
    content,
    choices,
    type,
    novel_title,
    chapter_title,
    scene_title,
    title,
    chapter_order,
    order,
    chapter_episode,
    chapterEpisode,
    novelTitle: sceneNovelTitle,
    chapterTitle: sceneChapterTitle,
  } = sceneData || {};

  const sceneTitle = scene_title || sceneData?.sceneTitle || title || sceneData?.Title || "";
  const chapterTitleUsed = chapter_title || sceneChapterTitle || sceneData?.chapter_title || sceneData?.ChapterTitle || "";
  const novelTitleUsed = novel_title || sceneNovelTitle || sceneData?.novelTitle || sceneData?.NovelTitle || novelTitle;
  const currentOrder = chapter_order || order || chapter_episode || chapterEpisode || sceneData?.chapterOrder || sceneData?.chapter_order || null;

  const rawSceneType = (
    sceneData?.scene_type ||
    sceneData?.type ||
    sceneData?.sceneType ||
    sceneData?.Type ||
    sceneData?.scene_type_name ||
    sceneData?.typeName ||
    type ||
    "normal"
  ).toString().toLowerCase().trim();

  const rawSceneTypeLabel =
    sceneData?.scene_type_label ||
    sceneData?.type_label ||
    sceneData?.type_name ||
    sceneData?.typeName ||
    sceneData?.scene_type_name ||
    "";

  const getSceneTagDetails = (sceneType, customLabel) => {
    if (customLabel && typeof customLabel === "string" && customLabel.trim()) {
      const lowerCustom = customLabel.toLowerCase().trim();
      if (lowerCustom.includes("จบ") || lowerCustom.includes("end")) {
        return { text: customLabel, bg: "var(--tag-ending-bg)", color: "var(--tag-ending-color)", typeClass: "rp__meta-tag--ending" };
      }
      if (lowerCustom.includes("เริ่ม") || lowerCustom.includes("start")) {
        return { text: customLabel, bg: "var(--tag-start-bg)", color: "var(--tag-start-color)", typeClass: "rp__meta-tag--start" };
      }
      return { text: customLabel, bg: "var(--tag-normal-bg)", color: "var(--tag-normal-color)", typeClass: "rp__meta-tag--normal" };
    }

    switch (sceneType) {
      case "start":
      case "starting":
        return { text: "จุดเริ่มต้นเนื้อเรื่อง", bg: "var(--tag-start-bg)", color: "var(--tag-start-color)", typeClass: "rp__meta-tag--start" };
      case "ending":
      case "end":
        return { text: "ฉากจบ", bg: "var(--tag-ending-bg)", color: "var(--tag-ending-color)", typeClass: "rp__meta-tag--ending" };
      case "normal":
      default:
        return { text: "เนื้อเรื่องหลัก", bg: "var(--tag-normal-bg)", color: "var(--tag-normal-color)", typeClass: "rp__meta-tag--normal" };
    }
  };

  const tag = getSceneTagDetails(rawSceneType, rawSceneTypeLabel);

  // 🎯 แยกให้ชัดว่า "ไม่มีตัวเลือกไปต่อ" ไม่ได้แปลว่า "จบเรื่องแล้ว" เสมอไป
  // ต้องเช็ค type จาก backend ควบคู่ไปด้วย ถึงจะถือว่าเป็นฉากจบจริงๆ
  const hasNoChoices = !choices || choices.length === 0;
  const isEndingType = rawSceneType === "ending";
  const isTrueEnding = hasNoChoices && isEndingType;
  const isUnfinishedDeadEnd = hasNoChoices && !isEndingType;

  return (
    <div
      className={`rp rp--theme-${theme}`}
      style={{
        "--reader-font-family": getFontFamilyString(fontFamily),
        fontFamily: getFontFamilyString(fontFamily),
      }}
    >
      <div className="rp__progress-bar" style={{ width: `${readProgress}%` }} role="progressbar" />

      {toastMessage && (
        <div className="rp-toast" role="status" aria-live="polite">
          <div className="rp-toast__icon" aria-hidden="true">✍️</div>

          <div className="rp-toast__content">
            <strong className="rp-toast__title">เส้นทางนี้กำลังเขียน</strong>
            <span className="rp-toast__message">{toastMessage}</span>
          </div>

          <button
            type="button"
            className="rp-toast__close"
            onClick={() => setToastMessage("")}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {isAdmin && <AdminModeBanner page="หน้าอ่านนิยาย" />}

      {isPreviewMode && (
        <div style={{
          width: "100%",
          background: "#eff6ff",
          borderBottom: "1px solid #bfdbfe",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          color: "#1e40af"
        }}>
          <span style={{ fontWeight: 700 }}>คุณกำลังอยู่ในโหมดทดลองอ่าน</span>
          <button
            type="button"
            onClick={handleExitPreview}
            style={{
              background: "#1d4ed8",
              color: "#ffffff",
              border: "none",
              borderRadius: "999px",
              padding: "8px 14px",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            ออกจากโหมดทดลองอ่าน
          </button>
        </div>
      )}

      <div className="rp__container">
        <ReadingBreadcrumb
            novelTitle={novelTitleUsed}
            chapterTitle={chapterTitleUsed || (rawSceneType === "start" ? "บทนำ" : "ตอนอ่านต่อ")}
            onBack={() => handleLocalNavigate("novel-detail")}
            onStoryMap={() => handleLocalNavigate("story-tree")}
            settingsComponent={
              <ReadingSettings
                fontFamily={fontFamily}
                onFontFamilyChange={handleFontFamilyChange}
                fontSize={fontSize}
                onDecreaseFont={handleDecreaseFont}
                onIncreaseFont={handleIncreaseFont}
                theme={theme}
                onThemeChange={handleThemeChange}
              />
            }
          />

          <article
            className={`rp__article ${isTransitioning ? "rp__article--out" : "rp__article--in"}`}
            style={{
              "--reader-font-family": getFontFamilyString(fontFamily),
              fontFamily: getFontFamilyString(fontFamily),
            }}
            ref={contentRef}
          >

            <div className="rp__header-group">
              <div className="rp__novel-subtitle">
                เรื่อง : {novelTitleUsed}
              </div>

              <h1 className="rp__title">
                {sceneTitle || (rawSceneType === "start" ? "จุดเริ่มต้นการเดินทาง" : "ดำเนินเรื่องย่อย")}
              </h1>

              <div className="rp__meta">
                <span className="rp__meta-chapter">
                  {currentOrder ? `ตอนที่ ${currentOrder} : ` : "ตอน : "}
                  {chapterTitleUsed || (rawSceneType === "start" ? "บทนำ" : "บททั่วไป")}
                </span>
                <span className="rp__meta-sep">|</span>
                <span
                  className={`rp__meta-tag ${tag.typeClass || ""}`}
                  style={{ backgroundColor: tag.bg, color: tag.color }}
                >
                  {tag.text}
                </span>
              </div>
            </div>
          <div className="rp__ornament" aria-hidden="true">
            <span className="rp__orn-line" />
            <span className="rp__orn-dot">✦</span>
            <span className="rp__orn-dot">✦</span>
            <span className="rp__orn-dot">✦</span>
            <span className="rp__orn-line" />
          </div>

          <div className="ql-snow">
            <div
              className={`rp__body rp__body--${theme} ql-editor`}
              aria-label="เนื้อหา"
              style={{
                "--reader-font-family": getFontFamilyString(fontFamily),
                fontFamily: getFontFamilyString(fontFamily),
                fontSize: `${fontSize}px`,
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>

          {choices && choices.length > 0 && (
            <ChoiceButtons
              prompt="คุณจะเลือกเส้นทางดำเนินเรื่องอย่างไรต่อไป?"
              choices={choices.map((c) => {
                const choiceText = c.label || c.text;
                const isDraftDestination = !isPreviewMode && c.is_published === false;

                return {
                  id: c.choice_id,
                  text: choiceText,
                  choice_id: c.choice_id,
                  to_scene_id: c.to_scene_id,
                  is_published: c.is_published,
                  is_unavailable: isDraftDestination,
                };
              })}
              onChoose={handleChoose}
              disabled={isTransitioning}
            />
          )}

          {isTrueEnding && (
            <div
              className={`rp__ending-card rp__ending-card--${currentEndingInfo?.key || "true"}`}
              data-theme={theme}
            >
              {/* 1. Header Row: Badge (2 ภาษา) + Signal Pill (คุณอ่านจบแล้ว) */}
              <div className="rp__ending-card-header-row">
                <div className={`rp__ending-badge-pill rp__ending-badge-pill--${currentEndingInfo?.key || "true"}`}>
                  <div className="rp__ending-badge-icon">
                    {currentEndingInfo?.emoji || "👑"}
                  </div>
                  <div className="rp__ending-badge-text">
                    <span className="rp__ending-badge-en">{currentEndingInfo?.typeLabelEN || "TRUE ENDING"}</span>
                    <span className="rp__ending-badge-th">{currentEndingInfo?.typeLabelTH || "ฉากจบแท้จริง"}</span>
                  </div>
                </div>

                <div className="rp__ending-read-pill">
                  <span>คุณอ่านจบแล้ว</span>
                </div>
              </div>

              {/* 2. Content Row: Artwork / Icon + Title & Description */}
              <div className="rp__ending-content-row">
                <div className={`rp__ending-art-box rp__ending-art-box--${currentEndingInfo?.key || "true"}`}>
                  <span className="rp__ending-art-icon">{currentEndingInfo?.emoji || "👑"}</span>
                </div>

                <div className="rp__ending-text-box">
                  <div className="rp__ending-chapter-eyebrow">
                    เรื่อง : {novelTitleUsed}
                  </div>
                  <h3 className="rp__ending-main-title">
                    {currentEndingInfo?.number ? `ฉากจบที่ ${currentEndingInfo.number} : ` : ""}
                    {currentEndingInfo?.title || "ฉากจบสมบูรณ์"}
                  </h3>
                  <p className="rp__ending-main-desc">
                    {currentEndingInfo?.description || "บางเส้นทางไม่ได้มีจุดสิ้นสุดที่สวยงาม แต่มันก็เป็นส่วนหนึ่งของเรื่องราวที่สมบูรณ์..."}
                  </p>
                </div>
              </div>

              <div className="rp__ending-divider" />

              {/* 3. Callout Notice Box */}
              <div className="rp__ending-notice-box">
                <div className="rp__ending-notice-text">
                  <strong className="rp__ending-notice-title">คุณได้พบกับหนึ่งในบทจบของเรื่องนี้</strong>
                  <span className="rp__ending-notice-sub">ลองย้อนกลับไปเลือกทางอื่น เพื่อค้นพบเส้นทางที่ต่างออกไป</span>
                </div>
              </div>

              {/* 4. Action Buttons (Primary: คลังฉากจบ, Dropdown: ตัวเลือกเพิ่มเติม) */}
              <div className="rp__ending-actions-center">
                {!isAdmin && (
                  <button
                    type="button"
                    className="rp__ending-btn rp__ending-btn--primary-filled"
                    onClick={() => setShowEndingModal(true)}
                  >
                    <Award size={16} />
                    <span>คลังฉากจบ</span>
                  </button>
                )}

                <div className="rp__ending-dropdown-container">
                  <button
                    type="button"
                    className="rp__ending-btn rp__ending-btn--outline"
                    onClick={() => setShowEndingActionsMenu((prev) => !prev)}
                  >
                    <span>ตัวเลือกเพิ่มเติม</span>
                    <ChevronDown
                      size={16}
                      style={{
                        transform: showEndingActionsMenu ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  </button>

                  {showEndingActionsMenu && (
                    <div className="rp__ending-dropdown-menu">
                      {!isAdmin && (
                        <button
                          type="button"
                          className="rp__ending-dropdown-item"
                          onClick={() => {
                            setShowEndingActionsMenu(false);
                            handleRestartClick();
                          }}
                        >
                          <RotateCcw size={16} />
                          <span>เริ่มอ่านใหม่</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="rp__ending-dropdown-item"
                        onClick={() => {
                          setShowEndingActionsMenu(false);
                          handleLocalNavigate("story-tree");
                        }}
                      >
                        <GitFork size={16} />
                        <span>ดูแผนผังการอ่าน</span>
                      </button>

                      <button
                        type="button"
                        className="rp__ending-dropdown-item"
                        onClick={() => {
                          setShowEndingActionsMenu(false);
                          handleLocalNavigate("novel-detail");
                        }}
                      >
                        <ArrowLeft size={16} />
                        <span>กลับหน้ารายละเอียด</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isUnfinishedDeadEnd && (
            <div className="rp__tbc-card">
              <div className="rp__tbc-icon-wrapper">
                <div className="rp__tbc-icon-circle">
                  <span className="rp__tbc-icon-emoji">📖</span>
                </div>
              </div>

              <h2 className="rp__tbc-title">โปรดติดตามตอนต่อไป</h2>
              <p className="rp__tbc-desc">
                เนื้อเรื่องส่วนนี้ยังเดินทางมาไม่ถึงฉากจบ <br />
                ผู้เขียนกำลังรังสรรค์เส้นทางต่อไปอยู่ กลับมาติดตามใหม่ในภายหลังนะ!
              </p>

              <div className="rp__tbc-actions">
                <button
                  type="button"
                  className="rp__tbc-btn rp__tbc-btn--primary"
                  onClick={() => handleLocalNavigate("story-tree")}
                >
                  <GitFork size={16} />
                  <span>ดูแผนผังการอ่าน</span>
                </button>

                <div className="rp__tbc-actions-row">
                  {!isAdmin && (
                    <button
                      type="button"
                      className="rp__tbc-btn rp__tbc-btn--secondary"
                      onClick={handleRestartClick}
                    >
                      <RotateCcw size={15} />
                      <span>เริ่มอ่านใหม่</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="rp__tbc-btn rp__tbc-btn--outline"
                    onClick={() => handleLocalNavigate("novel-detail")}
                  >
                    <ArrowLeft size={15} />
                    <span>กลับหน้ารายละเอียด</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8">
            <Comments
              comments={comments}
              currentUserId={effectiveUserId}
              commentText={commentText}
              onCommentTextChange={(e) => setCommentText(e.target.value)}
              onSubmit={handleCommentSubmit}
              onDeleteComment={handleDeleteComment}
              isSubmitting={commentSubmitting}
              readOnly={isAdmin}
            />
          </div>
        </article>
      </div>

      {/* Pop-up ยินดีด้วย ค้นพบฉากจบใหม่ — ไม่แสดงสำหรับแอดมิน */}
      {!isAdmin && (
        <EndingUnlockedModal
          isOpen={showEndingModal}
          currentScene={sceneData}
          allNovelEndings={allNovelEndings}
          novelId={novelId}
          onClose={() => setShowEndingModal(false)}
          onViewStoryTree={() => handleLocalNavigate("story-tree")}
          onRestartReading={handleRestartClick}
        />
      )}

      {/* 🎯 Pop-up ยืนยันการเริ่มอ่านใหม่ */}
      {showRestartConfirm && (
        <div className="rp__modal-overlay" onClick={() => setShowRestartConfirm(false)}>
          <div className="rp__restart-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rp__modal-close"
              onClick={() => setShowRestartConfirm(false)}
              aria-label="ปิด"
            >
              ✕
            </button>
            <div className="rp__restart-modal-icon">↻</div>
            <h3 className="rp__restart-modal-title">ยืนยันการเริ่มอ่านใหม่</h3>
            <p className="rp__restart-modal-text">
              คุณต้องการเริ่มอ่านใหม่ตั้งแต่จุดเริ่มต้นใช่หรือไม่? <br />
              ระบบจะพาคุณกลับไปที่ฉากแรก แต่ฉากจบที่คุณเคยปลดล็อกแล้วจะยังอยู่ครบถ้วน
            </p>
            {restartError && <div className="rp__restart-modal-error">{restartError}</div>}
            <div className="rp__restart-modal-actions">
              <button
                type="button"
                className="rp__restart-btn rp__restart-btn--cancel"
                onClick={() => setShowRestartConfirm(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="rp__restart-btn rp__restart-btn--confirm"
                onClick={handleConfirmRestartReading}
                disabled={restartLoading}
              >
                {restartLoading ? "กำลังเริ่มใหม่..." : "ยืนยันเริ่มอ่านใหม่"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up ชวนเพิ่มเข้าชั้นหนังสือ — ไม่แสดงสำหรับแอดมิน หรือโหมด preview */}
      {!isAdmin && !isPreviewMode && isUnfinishedDeadEnd && !isBookmarked && !bookmarkNudgeDismissed && (
        <div
          className="rp__modal-overlay"
          onClick={() => setBookmarkNudgeDismissed(true)}
        >
          <div className="rp__bookmark-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rp__modal-close"
              onClick={() => setBookmarkNudgeDismissed(true)}
              aria-label="ปิด"
            >
              ✕
            </button>
            <div className="rp__bookmark-modal-icon">📌</div>
            <h3 className="rp__bookmark-modal-title">อ่านมาถึงตอนล่าสุดแล้ว!</h3>
            <p className="rp__bookmark-modal-text">
              เพิ่มเรื่องนี้เข้าชั้นหนังสือไว้ จะได้ไม่พลาดตอนใหม่ที่นักเขียนอัปเดต
            </p>
            <button
              type="button"
              className="rp__bookmark-modal-btn"
              disabled={bookmarkProcessing}
              onClick={() => {
                handleToggleBookmark(true);
                setBookmarkNudgeDismissed(true);
              }}
            >
              <Bookmark size={18} />
              <span>{bookmarkProcessing ? "กำลังบันทึก..." : "เพิ่มเข้าชั้นหนังสือ"}</span>
            </button>
            <button
              type="button"
              className="rp__bookmark-modal-skip"
              onClick={() => setBookmarkNudgeDismissed(true)}
            >
              ไว้ทีหลัง
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`rp__scroll-top ${showScrollTop ? "rp__scroll-top--visible" : ""}`}
        onClick={handleScrollToTop}
        aria-label="เลื่อนกลับขึ้นบนสุด"
        tabIndex={showScrollTop ? 0 : -1}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 15V5M10 5L5 10M10 5l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
};

export default ReadingPage;