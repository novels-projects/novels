import React, { useEffect, useState, createContext, useContext } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Outlet,
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation,
  Navigate,
} from "react-router-dom";

import Navbar from "./components/Navbar/Navbar";
import AdminNavbar from "./components/NavbarAdmin/AdminNavbar";

import HomePage from "./pages/Reader/HomePage/HomePage";
import NovelDetailPage from "./pages/Reader/NovelDetailPage/NovelDetailPage";
import Storytreepage from "./pages/Reader/Storytreepage/Storytreepage";
import ReadingPage from "./pages/Reader/Readingpage/Readingpage";
import CategoriesPage from "./pages/Reader/CategoriesPage/CategoriesPage";
import SearchPage from "./pages/Reader/SearchPage/SearchPage";
import BookshelfPage from "./pages/Reader/BookshelfPage/BookshelfPage";
import HistoryPage from "./pages/Reader/HistoryPage/HistoryPage";
import FollowingWriters from "./pages/Reader/FollowingWriters/FollowingWriters";
import NotificationPage from "./pages/Reader/NotificationPage/NotificationPage";
import ReaderSetting from "./pages/Reader/ReaderSetting/ReaderSetting";

import WriterDashboardPage from "./pages/Writer/WriterDashboardPage/WriterDashboardPage";
import CreateNovelPage from "./pages/Writer/Createnovelpage/Createnovelpage";
import ChapterManagerPage from "./pages/Writer/Chaptermanagerpage/Chaptermanagerpage";
import WriterStoryTreePage from "./pages/Writer/WriterStoryTreePage/WriterStoryTreePage";
import SceneEditorPage from "./pages/Writer/Sceneeditorpage/Sceneeditorpage";
import EditNovelPage from "./pages/Writer/Editnovelpage/Editnovelpage";
import WriterProfile from "./pages/Writer/WriterProfile/WriterProfile";
import StatisticsGraph from "./pages/Writer/StatisticsGraph/StatisticsGraph";


import Manageusers from "./pages/Admin/Manageusers/Manageusers";
import WriterRequestsPage from "./pages/Admin/WriterRequestsPage/WriterRequestsPage";
import AdminReportsDashboard from "./pages/Admin/AdminReportsDashboard/AdminReportsDashboard";
import AdminCategoryPage from "./pages/Admin/AdminCategoryPage/AdminCategoryPage";
import Adminauditlog from "./pages/Admin/Adminauditlog/Adminauditlog";
import AdminDashboardPage from "./pages/Admin/AdminDashboardPage/AdminDashboardPage";

import AuthPage from "./pages/Auth/AuthPage";
import WriterRegisterPage from "./pages/Auth/WriterRegisterPage";

import "./style/App.css";
import "./style/index.css";
import { i } from "framer-motion/client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ======================================================
// NavbarContext - ควบคุมการแสดง/ซ่อน Navbar
// ======================================================
const NavbarContext = createContext(true);

export const useNavbar = () => useContext(NavbarContext);

// ======================================================
// Reader Layout (มี Navbar)
// ======================================================
const ReaderLayout = ({ children }) => {
  return (
    <NavbarContext.Provider value={true}>
      <main className="reader-layout">
        {children}
      </main>
    </NavbarContext.Provider>
  );
};

// ======================================================
// Auth Layout (ไม่มี Navbar)
// ======================================================
const AuthLayout = ({ children }) => {
  return (
    <NavbarContext.Provider value={false}>
      <main className="auth-page-wrapper">
        {children}
      </main>
    </NavbarContext.Provider>
  );
};

// ======================================================
// Writer Layout (มี Navbar)
// ======================================================
const WriterLayout = ({ children, onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSelector, setShowSelector] = useState(false);
  const [novelsList, setNovelsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const currentPath = location.pathname;
  const isNovelRequiredPage = 
    currentPath.includes("/chapters") || 
    currentPath.includes("/scene/") || 
    currentPath.includes("/storytree") ||
    currentPath.includes("/edit");

  useEffect(() => {
    setShowSelector(false);
  }, [isNovelRequiredPage, location.pathname]);

  const fetchNovels = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_BASE_URL}/api/me/novels`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.novels || data.data?.novels || [];
        setNovelsList(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      console.error("ดึงข้อมูลนิยายไม่สำเร็จ:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNovel = async (novel) => {
    localStorage.setItem("selectedNovel", JSON.stringify(novel));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("novel-selected"));
    setShowSelector(false);

    const novelId = novel.id || novel.novel_id;
    if (currentPath.includes("/chapters")) {
      navigate(`/writer/${novelId}/chapters`);
    } else if (currentPath.includes("/storytree")) {
      navigate(`/writer/${novelId}/storytree`);
    } else if (currentPath.includes("/scene/")) {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };
        const chRes = await fetch(`${API_BASE_URL}/novels/${novelId}/chapters`, { headers });
        const chData = await chRes.json();
        const chapters = chData?.data?.chapters || chData?.chapters || [];
        if (chapters.length > 0) {
          const chId = chapters[0].id || chapters[0].chapter_id;
          const scRes = await fetch(`${API_BASE_URL}/chapters/${chId}/scenes`, { headers });
          const scData = await scRes.json();
          const scenes = scData?.data?.scenes || scData?.scenes || [];
          if (scenes.length > 0) {
            const scId = scenes[0].id || scenes[0].scene_id;
            navigate(`/writer/${novelId}/scene/${scId}`);
            return;
          }
        }
      } catch (e) {
        console.error(e);
      }
      navigate(`/writer/${novelId}/scene/empty`);
    } else if (currentPath.includes("/edit")) {
      navigate(`/writer/${novelId}/edit`);
    }
  };

  const filtered = novelsList.filter(n => 
    (n.title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <NavbarContext.Provider value={true}>
      <div className="writer-layout">
        <main className="writer-layout__content">
          {children}
        </main>
      </div>

      {showSelector && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(45, 27, 61, 0.4)", backdropFilter: "blur(8px)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 99999, padding: "20px"
        }}>
          <div style={{
            background: "var(--white)", width: "100%", maxLength: "500px", maxWidth: "500px",
            borderRadius: "24px", boxShadow: "var(--shadow-lg)", overflow: "hidden",
            border: "1px solid var(--pink-100)", display: "flex", flexDirection: "column",
            maxHeight: "85vh"
          }}>
            <div style={{
              background: "linear-gradient(135deg, var(--pink-50) 0%, var(--pink-100) 100%)",
              padding: "24px", borderBottom: "1.5px solid var(--pink-100)",
              textAlign: "center"
            }}>
              <span style={{ fontSize: "36px", display: "block", marginBottom: "8px" }}>✍️</span>
              <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--ink)", margin: 0 }}>
                กรุณาเลือกนิยายที่ต้องการแก้ไข
              </h2>
              <p style={{ fontSize: "13px", color: "var(--gray-600)", margin: "4px 0 0 0" }}>
                คุณกำลังเข้าใช้งานเครื่องมือของนิยาย กรุณาเลือกผลงานเพื่อดำเนินการต่อค่ะ
              </p>
            </div>

            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--gray-100)" }}>
              <input
                type="text"
                placeholder="🔍 ค้นหานิยายของคุณ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "10px 16px", borderRadius: "12px",
                  border: "1.5px solid var(--gray-300)", fontSize: "14px",
                  outline: "none", transition: "border-color 0.2s"
                }}
              />
            </div>

            <div style={{
              overflowY: "auto", padding: "12px 24px", flex: 1,
              display: "flex", flexDirection: "column", gap: "10px"
            }}>
              {loading ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--pink-500)", fontWeight: "600" }}>
                  กำลังโหลดผลงานทั้งหมด...
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--gray-600)" }}>
                  📚 ไม่พบผลงานนิยายของคุณ
                </div>
              ) : (
                filtered.map(novel => {
                  const coverImage = novel.cover_image || novel.coverImage;
                  return (
                    <button
                      key={novel.id || novel.novel_id}
                      onClick={() => handleSelectNovel(novel)}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px", width: "100%",
                        padding: "12px", borderRadius: "16px", border: "1.5px solid var(--gray-100)",
                        background: "var(--white)", cursor: "pointer", transition: "all 0.2s ease",
                        textAlign: "left"
                      }}
                    >
                      <div style={{
                        width: "48px", height: "64px", borderRadius: "8px", background: "var(--pink-100)",
                        display: "flex", justifyContent: "center", alignItems: "center", fontSize: "20px",
                        overflow: "hidden"
                      }}>
                        {coverImage ? (
                          <img
                            src={coverImage.replace("http://minio:9000", "http://localhost:9000")}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : "📖"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "700", color: "var(--ink)", fontSize: "14.5px" }}>
                          {novel.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--gray-600)", marginTop: "4px" }}>
                          📄 {novel.total_chapters ?? novel.chapter_count ?? 0} ตอน | 🎬 {novel.total_scenes ?? novel.scene_count ?? 0} ฉาก
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{
              padding: "16px 24px", background: "var(--gray-50)",
              borderTop: "1.5px solid var(--gray-100)", display: "flex",
              justifyContent: "center"
            }}>
              <button
                onClick={() => {
                  setShowSelector(false);
                  navigate("/writer/dashboard");
                }}
                style={{
                  background: "var(--gray-100)", color: "var(--gray-600)", border: "none",
                  padding: "10px 20px", borderRadius: "12px", fontWeight: "700",
                  cursor: "pointer", fontSize: "13.5px"
                }}
              >
                🏠 กลับไปหน้าแดชบอร์ด
              </button>
            </div>
          </div>
        </div>
      )}
    </NavbarContext.Provider>
  );
};

// ======================================================
// Navigation Central Handler
// ======================================================
const createNavigateHandler = (navigate, currentNovelId = null) => (page, payload = {}) => {
  const activeNovelId = typeof payload === "string" ? payload : (payload?.novelId || currentNovelId);

  switch (page) {
    case "dashboard":
      navigate("/writer/dashboard");
      break;
    case "create-novel":
      if (activeNovelId) {
        navigate(`/writer/${activeNovelId}/edit`);
      } else {
        navigate("/writer/create");
      }
      break;
    case "chapters":
      if (activeNovelId) {
        navigate(`/writer/${activeNovelId}/chapters`);
      } else {
        navigate("/writer/dashboard");
      }
      break;
    case "story-tree":
      if (activeNovelId) {
        navigate(`/writer/${activeNovelId}/storytree`);
      } else {
        navigate("/writer/dashboard");
      }
      break;
    case "analytics":
      if (activeNovelId) {
        navigate(`/writer/${activeNovelId}/analytics`);
      } else {
        navigate("/writer/dashboard");
      }
      break;
    case "novel-detail":
    case "detail":
      if (payload?.novelId || payload?.id) {
        navigate(`/novel/${payload?.novelId || payload?.id}`);
      } else {
        navigate("/");
      }
      break;
    case "reading": {
      const novelId = payload?.novelId;
      const sceneId = payload?.initialSceneId || payload?.sceneId;
      if (novelId) {
        navigate(`/reading/${novelId}${sceneId ? `/${sceneId}` : ""}`);
      } else {
        navigate("/");
      }
      break;
    }
    case "scene-editor":
    case "write":
      if (activeNovelId && payload?.sceneId) {
        const parts = [];
        if (payload?.chapterId) parts.push(`chapterId=${encodeURIComponent(payload.chapterId)}`);
        if (payload?.title) parts.push(`title=${encodeURIComponent(payload.title)}`);
        if (payload?.novelTitle) parts.push(`novelTitle=${encodeURIComponent(payload.novelTitle)}`);
        if (payload?.chapterTitle) parts.push(`chapterTitle=${encodeURIComponent(payload.chapterTitle)}`);
        const query = parts.length > 0 ? `?${parts.join("&")}` : "";
        navigate(`/writer/${activeNovelId}/scene/${payload.sceneId}${query}`);
      } else {
        console.warn("⚠️ ไม่สามารถเปิดหน้าเขียนได้เนื่องจากข้อมูลไม่ครบ:", { activeNovelId, payload });
      }
      break;
    case "login":
      navigate("/login-register");
      break;
    default:
      navigate("/");
      break;
  }
};

// ======================================================
// Route Wrappers 
// ======================================================
const HomePageRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <HomePage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const NovelDetailRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <NovelDetailPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const StoryTreeRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <Storytreepage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const CategoriesRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <CategoriesPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const SearchPageRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <SearchPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const ReadingRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <ReadingPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const BookshelfRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <BookshelfPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const HistoryRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <HistoryPage onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const FollowingWritersRoute = () => {
  const navigate = useNavigate();
  return (
    <ReaderLayout>
      <FollowingWriters onNavigate={createNavigateHandler(navigate)} />
    </ReaderLayout>
  );
};

const NotificationRoute = () => {
  return (
    <ReaderLayout>
      <NotificationPage />
    </ReaderLayout>
  );
};

const WriterDashboardRoute = () => {
  const navigate = useNavigate();
  const navHandler = createNavigateHandler(navigate);
  return (
    <WriterLayout onNavigate={navHandler}>
      <WriterDashboardPage onNavigate={navHandler} />
    </WriterLayout>
  );
};

const CreateNovelRoute = () => {
  const navigate = useNavigate();
  const navHandler = createNavigateHandler(navigate);
  return (
    <WriterLayout onNavigate={navHandler}>
      <CreateNovelPage onNavigate={navHandler} />
    </WriterLayout>
  );
};

const ChapterManagerRoute = () => {
  const navigate = useNavigate();
  const { novelId } = useParams();
  const navHandler = createNavigateHandler(navigate, novelId);
  
  return (
    <WriterLayout onNavigate={navHandler}>
      <ChapterManagerPage novelId={novelId} onNavigate={navHandler} />
    </WriterLayout>
  );
};

const WriterStoryTreeRoute = () => {
  const navigate = useNavigate();
  const { novelId } = useParams();
  const navHandler = createNavigateHandler(navigate, novelId);

  return (
    <WriterLayout onNavigate={navHandler}>
      <WriterStoryTreePage novelId={novelId} onNavigate={navHandler} />
    </WriterLayout>
  );
};

const StatisticsGraphRoute = () => {
  const navigate = useNavigate();
  const { novelId } = useParams();
  const navHandler = createNavigateHandler(navigate, novelId);

  return (
    <WriterLayout onNavigate={navHandler}>
      <StatisticsGraph novelId={novelId} onNavigate={navHandler} />
    </WriterLayout>
  );
};

const LegacyWriterStoryTreeRedirect = () => {
  const { novelId } = useParams();
  return <Navigate to={`/writer/${novelId}/storytree`} replace />;
};

const SceneEditorRoute = () => {
  const navigate = useNavigate();
  const { novelId, sceneId } = useParams();
  const location = useLocation();
  const navHandler = createNavigateHandler(navigate, novelId);

  const [chapterId, setChapterId] = useState("");
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [chapterError, setChapterError] = useState(null);

  const searchParams = new URLSearchParams(location.search);
  const fallbackChapterId = searchParams.get("chapterId") || "";
  const fallbackSceneTitle = searchParams.get("title") || "";
  const fallbackNovelTitle = searchParams.get("novelTitle") || "";
  const fallbackChapterTitle = searchParams.get("chapterTitle") || "";

  useEffect(() => {
    if (!sceneId || sceneId === "new") {
      setChapterId(fallbackChapterId);
      setLoadingChapter(false);
      return;
    }

    let active = true;
    setLoadingChapter(true);
    setChapterError(null);

    const token = localStorage.getItem("token");
    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    fetch(`${API_BASE_URL}/scenes/${sceneId}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`ไม่สามารถโหลดข้อมูลฉากได้ (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const sceneData = data?.data || data || {};
        const resolvedId = sceneData.chapterId ?? sceneData.chapter_id ?? "";
        setChapterId(resolvedId ? String(resolvedId) : fallbackChapterId);
      })
      .catch((err) => {
        if (!active) return;
        console.error("SceneEditorRoute load chapterId error:", err);
        setChapterError(err.message || "เกิดข้อผิดพลาดในการโหลด chapterId");
      })
      .finally(() => {
        if (!active) return;
        setLoadingChapter(false);
      });

    return () => {
      active = false;
    };
  }, [sceneId, location.search]);

  return (
    <WriterLayout onNavigate={navHandler}>
      {loadingChapter ? (
        <div style={{ padding: 28, color: "var(--gray-700)" }}>
          กำลังโหลดข้อมูลตอนของฉาก...
        </div>
      ) : (
        <SceneEditorPage
          novelId={novelId}
          chapterId={chapterId}
          sceneId={sceneId}
          initialSceneTitle={fallbackSceneTitle}
          initialNovelTitle={fallbackNovelTitle}
          initialChapterTitle={fallbackChapterTitle}
          onNavigate={navHandler}
        />
      )}
      {chapterError && (
        <div style={{ padding: 18, color: "#B91C1C", fontSize: 13 }}>
          {chapterError}
        </div>
      )}
    </WriterLayout>
  );
};

const EditNovelRoute = () => {
  const navigate = useNavigate();
  const navHandler = createNavigateHandler(navigate);
  
  return (
    <WriterLayout onNavigate={navHandler}>
      <EditNovelPage onNavigate={navHandler} />
    </WriterLayout>
  );
};

const WriterProfileRoute = () => {
  const navigate = useNavigate();
  return (
    <WriterLayout>
      <WriterProfile onNavigate={createNavigateHandler(navigate)} />
    </WriterLayout>
  );
};

const ReaderSettingRoute = () => {
  const navigate = useNavigate();
  const navHandler = createNavigateHandler(navigate);
  return (
    <ReaderLayout>
      <ReaderSetting onNavigate={navHandler} />
    </ReaderLayout>
  );
};

const getRoleFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = atob(payload);
    const json = decodeURIComponent(decoded.split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join(''));
    const parsed = JSON.parse(json);
    return parsed.role || null;
  } catch (error) {
    return null;
  }
};

const isTokenExpired = (token) => {
  if (!token) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;

  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = atob(payload);
    const json = decodeURIComponent(decoded.split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join(''));
    const parsed = JSON.parse(json);
    if (!parsed.exp) return true;
    const expiry = Number(parsed.exp) * 1000;
    return Date.now() >= expiry;
  } catch (error) {
    return true;
  }
};

const refreshAuthToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/api/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      return false;
    }

    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token);
    }
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
    }

    return true;
  } catch (error) {
    console.error('Failed to refresh auth token:', error);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    return false;
  }
};

// ======================================================
// NavbarWrapper - เลือก Navbar ตามสิทธิ์ผู้ใช้
// (Navbar.jsx รวม Navbar เดิม + Navbarwriter เดิมเป็นไฟล์เดียวแล้ว
//  ไม่ต้องเลือกระหว่าง 2 component อีกต่อไป — ข้างในคำนวณ isWriterMode เอง)
// ======================================================
const NavbarWrapper = () => {
  const showNavbar = useNavbar();
  if (!showNavbar) return null;

  const role = getRoleFromToken();
  if (role === "admin") return <AdminNavbar />;
  return <Navbar />;
};

// ======================================================
// RequireAdminRoute - ตรวจสอบสิทธิ์ผู้ใช้
// ======================================================
const RequireAdminRoute = ({ children }) => {
  const role = getRoleFromToken();
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return children;
};

const RedirectAdminIfNeeded = ({ children }) => {
  const role = getRoleFromToken();
  if (role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
};

// ======================================================
// RequireWriterRoute - ต้องล็อกอิน + สมัครเป็นนักเขียนแล้วเท่านั้น
// (ป้องกันผู้เยี่ยมชม/นักอ่านที่ยังไม่สมัครนักเขียนหลุดเข้าแดชบอร์ด
// ทั้งจากปุ่มในหน้าเว็บและจากการพิมพ์ URL ตรงๆ)
// ======================================================
const RequireWriterRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token || isTokenExpired(token)) {
    return <Navigate to="/login-register" replace />;
  }

  const role = getRoleFromToken();

  if (role === 'admin') {
    return <Navigate to="/admin/manage-users" replace />;
  }

  if (role !== 'writer') {
    return <Navigate to="/registerwriter" replace />;
  }

  return children;
};

// ======================================================
// RequireAuthRoute - ต้องล็อกอินก่อนเท่านั้น (ไม่จำเป็นต้องเป็นนักเขียน)
// ใช้กับหน้าส่วนตัวของนักอ่าน เช่น กระดานหนังสือ, ประวัติการอ่าน,
// นักเขียนที่ติดตาม, การแจ้งเตือน
// ======================================================
const RequireAuthRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token || isTokenExpired(token)) {
    return <Navigate to="/login-register" replace />;
  }

  const role = getRoleFromToken();
  if (role === 'admin') {
    return <Navigate to="/admin/manage-users" replace />;
  }

  return children;
};

// ======================================================
// Auth Route Wrappers
// ======================================================
const AuthPageRoute = () => {
  return (
    <AuthLayout>
      <AuthPage />
    </AuthLayout>
  );
};

const WriterRegisterPageRoute = () => {
  return (
    <AuthLayout>
      <WriterRegisterPage 
        onComplete={() => console.log("สมัครสมาชิกสำเร็จ")} 
        onBack={() => console.log("กดย้อนกลับหน้าแรก")} 
      />
    </AuthLayout>
  );
};

const AppRootLayout = () => {
  return (
    <>
      <NavbarWrapper />
      <Outlet />
    </>
  );
};

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppRootLayout />}>
      {/* Reader & Public Routes (Allowed for all users & Admin) */}
      <Route path="/" element={<RedirectAdminIfNeeded><HomePageRoute /></RedirectAdminIfNeeded>} />
      <Route path="/novel/:id" element={<NovelDetailPage />} />
      <Route path="/category" element={<Navigate to="/categories" replace />} />
      <Route path="/categories" element={<CategoriesRoute />} />
      <Route path="/search" element={<SearchPageRoute />} />
      <Route path="/bookshelf" element={<RequireAuthRoute><BookshelfRoute /></RequireAuthRoute>} />
      <Route path="/history" element={<RequireAuthRoute><HistoryRoute /></RequireAuthRoute>} />
      <Route path="/following-writers" element={<RequireAuthRoute><FollowingWritersRoute /></RequireAuthRoute>} />
      <Route path="/notifications" element={<RequireAuthRoute><NotificationRoute /></RequireAuthRoute>} />
      <Route path="/settings" element={<RequireAuthRoute><ReaderSettingRoute /></RequireAuthRoute>} />
      <Route path="/storytree/:novelId" element={<StoryTreeRoute />} />
      <Route path="/reading/:novelId" element={<ReadingRoute />} />
      <Route path="/reading/:novelId/:sceneId" element={<ReadingRoute />} />

      {/* Public Writer Profile Pages */}
      <Route path="/writer/profile/:id" element={<WriterProfileRoute />} />
      <Route path="/writer/:id/profile" element={<WriterProfileRoute />} />

      {/* Writer Private Workspace Routes (ต้องล็อกอิน + เป็นนักเขียนเท่านั้น) */}
      <Route path="/writer/profile" element={<RequireWriterRoute><WriterProfileRoute /></RequireWriterRoute>} />
      <Route path="/writer/settings" element={<Navigate to="/settings" replace />} />
      <Route path="/writer/dashboard" element={<RequireWriterRoute><WriterDashboardRoute /></RequireWriterRoute>} />
      <Route path="/writer/create" element={<RequireWriterRoute><CreateNovelRoute /></RequireWriterRoute>} />
      <Route path="/writer/:novelId/chapters" element={<RequireWriterRoute><ChapterManagerRoute /></RequireWriterRoute>} />
      <Route path="/writer/:novelId/scene/:sceneId" element={<RequireWriterRoute><SceneEditorRoute /></RequireWriterRoute>} />
      <Route path="/writer/:novelId/storytree" element={<RequireWriterRoute><WriterStoryTreeRoute /></RequireWriterRoute>} />
      <Route path="/writer/:novelId/analytics" element={<RequireWriterRoute><StatisticsGraphRoute /></RequireWriterRoute>} />
      <Route path="/writer/storytree/:novelId" element={<RequireWriterRoute><LegacyWriterStoryTreeRedirect /></RequireWriterRoute>} />
      <Route path="/writer/:novelId/edit" element={<RequireWriterRoute><EditNovelRoute /></RequireWriterRoute>} />
        
      {/* Admin Routes */}
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<RequireAdminRoute><AdminDashboardPage /></RequireAdminRoute>} />
      <Route path="/admin/users" element={<RequireAdminRoute><Manageusers /></RequireAdminRoute>} />
      <Route path="/admin/manage-users" element={<RequireAdminRoute><WriterRequestsPage /></RequireAdminRoute>} />
      {/* 🟢 2. เพิ่ม Route หน้ารายงาน/แจ้งลบ & จัดการเนื้อหา */}
      <Route path="/admin/reports" element={<RequireAdminRoute><AdminReportsDashboard /></RequireAdminRoute>} />
      <Route path="/admin/content-reports" element={<RequireAdminRoute><AdminReportsDashboard /></RequireAdminRoute>} />
      <Route path="/admin/categories" element={<RequireAdminRoute><AdminCategoryPage /></RequireAdminRoute>} />
      <Route path="/admin/audit-logs" element={<RequireAdminRoute><Adminauditlog /></RequireAdminRoute>} />

      {/* Auth Routes - ไม่มี Navbar */}
      <Route path="/login-register" element={<AuthPageRoute />} />
      <Route path="/registerwriter" element={<WriterRegisterPageRoute />} />
    </Route>
  )
);

// ======================================================
// Main Application Component
// ======================================================
function App() {
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refresh_token');

      if (!token && !refreshToken) {
        if (active) setAuthChecked(true);
        return;
      }

      if (!token || isTokenExpired(token)) {
        const refreshed = await refreshAuthToken();
        if (!refreshed) {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
        }
      }

      if (active) setAuthChecked(true);
    };

    initializeAuth();
    return () => {
      active = false;
    };
  }, []);

  if (!authChecked) {
    return null;
  }

  return <RouterProvider router={router} />;
}

export default App;