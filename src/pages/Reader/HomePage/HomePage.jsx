import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Pencil, Bookmark, Eye, Heart } from "lucide-react";
import "./HomePage.css";
import { getNovelStatusInfo } from "../../../utils/novelStatus";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const formatMinioUrl = (url) => {
  if (!url) return null;
  return url.replace('http://minio:9000', 'http://localhost:9000');
};

const formatNumber = (num) => {
  if (!num) return 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M+";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k+";
  return num;
};

const getTagClass = (cat) => {
  if (!cat) return "tag-romance";
  const c = cat.toLowerCase();
  if (c.includes("รัก") || c.includes("โรแมน") || c.includes("romance")) return "tag-romance";
  if (c.includes("แฟนตา") || c.includes("เวท") || c.includes("fantasy")) return "tag-fantasy";
  if (c.includes("สืบสวน") || c.includes("สอบสวน") || c.includes("mystery")) return "tag-mystery";
  if (c.includes("ต่อสู้") || c.includes("บู๊") || c.includes("action")) return "tag-action";
  if (c.includes("สยอง") || c.includes("ผี") || c.includes("horror")) return "tag-horror";
  if (c.includes("ไซไฟ") || c.includes("อนาคต") || c.includes("scifi")) return "tag-scifi";
  if (c.includes("ดราม่า") || c.includes("ชีวิต") || c.includes("drama")) return "tag-drama";
  return "tag-romance";
};

const HomePage = ({ onNavigate }) => {
  const [novels, setNovels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [continueReadingNovels, setContinueReadingNovels] = useState([]);

  const [activeGenre, setActiveGenre] = useState("");
  const [isFollowed, setIsFollowed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerOffset, setFollowerOffset] = useState(0); // 🟢 ตัวจำค่าเพิ่ม/ลดผู้ติดตามทันที
  const [toast, setToast] = useState({ isOpen: false, message: "" });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNovels = async () => {
      try {
        setLoading(true);
        setError(null);
        const [response, responseCats] = await Promise.all([
          fetch(`${API_BASE_URL}/novels`),
          fetch(`${API_BASE_URL}/categories`)
        ]);
        const payload = await response.json().catch(() => null);
        const payloadCats = await responseCats.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || "ดึงข้อมูลไม่สำเร็จ");
        }

        const catRaw = payloadCats?.data || payloadCats || [];
        const formattedCats = Array.isArray(catRaw)
          ? catRaw.map(c => ({ id: c.category_id || c.id, name: String(c.name || c.title || "").trim() }))
          : [];
        setCategories(formattedCats);

        const raw = payload?.data?.novels ?? payload?.data ?? payload?.novels ?? payload;
        const candidates = Array.isArray(raw) ? raw : (Array.isArray(raw?.novels) ? raw.novels : []);

        const publishedNovels = candidates.filter((data) => {
          const statusInfo = getNovelStatusInfo(data);
          if (!statusInfo.rawStatus) return true;
          return statusInfo.mode === "published" || statusInfo.mode === "completed-published";
        });

        const formatted = publishedNovels.map((data) => {
          const statusInfo = getNovelStatusInfo(data);
          const coverImg = formatMinioUrl(data.cover_image);
          const hasCover = !!coverImg;

          return {
            id: data.novel_id || data.id,
            title: data.title || "ไม่มีชื่อเรื่อง",
            createdAt: data.created_at || data.createdAt || null, // 🟢 ดึงวันที่สร้างมาใช้เช็คความใหม่
            categories: (() => {
              const cats = data.categories ?? data.Categories ?? data.CategoryIDs ?? data.category_ids ?? [];
              if (!Array.isArray(cats) || cats.length === 0) return ["ทั่วไป"];
              return cats.map((cat) => {
                if (!cat) return null;
                if (typeof cat === "string") return cat;
                if (typeof cat === "number") return String(cat);
                return cat.name || cat.Name || cat.title || cat.label || null;
              }).filter(Boolean);
            })(),
            coverImage: coverImg,
            coverEmoji: data.cover_emoji || (hasCover ? "" : "🔮"),
            bg: data.cover_bg || "#F5F3FF", // เลิกใช้ Math กะโหลกกะลา ใช้สีโทนสว่างเป็น Default
            author: {
              id: data.author_id || data.writer_id || data.user_id || data.author?.id || 0, // 🟢 เปลี่ยนจาก 3 เป็น 0 เพื่อไม่ให้ไปชนกับ User ที่มีอยู่จริง
              displayName: data.pen_name || data.author_pen_name || data.author_name || data.username || data.author?.displayName || data.author?.pen_name || "ไม่ทราบผู้แต่ง",
              avatarUrl: formatMinioUrl(
                data.author_avatar ||
                data.author_avatar_url ||
                data.authorAvatar ||
                data.avatar_url ||
                data.avatarUrl ||
                data.author?.avatar_url ||
                data.author?.avatarUrl ||
                data.author?.avatar ||
                data.writer_avatar ||
                data.user_avatar
              ),
              bio: data.author_bio || data.bio || data.author?.bio,
              follower_count: data.author_follower_count || data.follower_count || data.author?.follower_count || 0
            },
            synopsis: data.captions || data.introduction || data.synopsis || "ไม่มีคำโปรย", // 🟢 ดึงคำโปรยให้ครบ
            views: data.views || data.view_count || 0,
            like_count: data.like_count || data.likes || 0,
            bookshelf_count: data.bookshelf_count || data.bookmarks || 0,
            status: statusInfo.mode || "published",
            is_completed: statusInfo.isCompleted || false,
            chapters_count: data.chapters_count || data.chapters?.length || 0,
          };
        });

        setNovels(formatted);
      } catch (err) {
        console.error("API Error in HomePage:", err);
        setError("ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้");
      } finally {
        setLoading(false);
      }
    };

    fetchNovels();
  }, []);

  const showToast = (message) => {
    setToast({ isOpen: true, message });
    setTimeout(() => {
      setToast({ isOpen: false, message: "" });
    }, 2200);
  };

  const handleReadNovel = (novelId) => {
    navigate(`/novel/${novelId}`);
    if (onNavigate) {
      onNavigate("detail", { id: novelId });
    }
  };

  const activateCardAction = (event, handler) => {
    if (event.type === "keydown" && !(event.key === "Enter" || event.key === " ")) return;
    if (event.type === "keydown") event.preventDefault();
    handler();
  };

  const trendingNovels = useMemo(() => {
    return [...novels].sort((a, b) => b.views - a.views).slice(0, 8);
  }, [novels]);

  const newReleases = useMemo(() => {
    return [...novels].sort((a, b) => b.id - a.id).slice(0, 6);
  }, [novels]);

  const GENRES_LIST = useMemo(() => {
    return categories.map(cat => ({
      key: cat.name,
      name: cat.name
    }));
  }, [categories]);

  useEffect(() => {
    if (categories.length > 0 && !activeGenre) {
      setActiveGenre(categories[0].name);
    }
  }, [categories, activeGenre]);

  const spotlightNovels = useMemo(() => {
    if (!activeGenre) return novels.slice(0, 4);
    const filtered = novels.filter(n =>
      n.categories.some(cat =>
        cat.toLowerCase().includes(activeGenre.toLowerCase())
      )
    );
    return filtered.length > 0 ? filtered.slice(0, 4) : novels.slice(0, 4);
  }, [novels, activeGenre]);

  const statsSummary = useMemo(() => {
    const totalNovels = novels.length || 0;
    const totalViews = novels.reduce((acc, curr) => acc + (curr.views || 0), 0);
    const uniqueAuthors = new Set(novels.filter(n => n.author.id !== 0).map(n => n.author.id)).size || 0;

    return {
      novelsCount: totalNovels,
      authorsCount: uniqueAuthors,
      viewsCount: formatNumber(totalViews),
    };
  }, [novels]);

  const featuredWriter = useMemo(() => {
    if (trendingNovels.length === 0) return null;
    const topNovel = trendingNovels[0];
    const author = topNovel.author || {};
    if (!author.id) return null;

    const writerName = author.displayName || "ไม่ทราบผู้แต่ง";
    const works = novels.filter(n => n.author.id === author.id).slice(0, 3);

    // 🟢 ดึงข้อมูลที่เคยเซฟใน LocalStorage มาเช็คผู้ติดตามตั้งต้น
    let initialFollowers = author.follower_count || 0;
    let savedAvatar = null;
    try {
      const saved = localStorage.getItem("local_following_writers");
      const list = saved ? JSON.parse(saved) : [];
      const savedWriter = list.find(w => Number(w.id) === Number(author.id));
      if (savedWriter) {
        if (savedWriter.follower_count) initialFollowers = Math.max(initialFollowers, savedWriter.follower_count);
        if (savedWriter.avatar_url || savedWriter.avatarUrl) savedAvatar = formatMinioUrl(savedWriter.avatar_url || savedWriter.avatarUrl);
      }
    } catch (e) {
      console.warn("Failed to read followers from LocalStorage:", e);
    }

    return {
      id: author.id,
      name: writerName,
      handle: `@${writerName.replace(/\s+/g, '').toLowerCase()}`,
      bio: author.bio || "นักเขียนผู้สร้างสรรค์เรื่องราวแห่ง StoryVerse",
      avatarLetter: writerName.charAt(0).toUpperCase(),
      avatarUrl: author.avatarUrl || savedAvatar || null,
      followersCount: initialFollowers,
      viewsCount: formatNumber(works.reduce((acc, w) => acc + (w.views || 0), 0)),
      worksCount: works.length,
      worksList: works,
    };
  }, [novels, trendingNovels]);

  useEffect(() => {
    const fetchReadHistory = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const response = await axios.get(`${API_BASE_URL}/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const historyPayload = response.data?.data?.history || response.data?.history || response.data?.novels || response.data || [];
        const historyData = Array.isArray(historyPayload) ? historyPayload : [];

        const formattedHistory = historyData.slice(0, 4).map((novel) => {
          const statusInfo = getNovelStatusInfo(novel);
          const total = novel.total_scenes > 0 ? novel.total_scenes : 1;
          const visited = novel.visited_count || 0;
          const progressPercent = Math.min(Math.round((visited / total) * 100), 100);

          return {
            id: novel.novel_id || novel.id,
            title: novel.title,
            coverImage: formatMinioUrl(novel.cover_image),
            coverEmoji: novel.cover_emoji || "🔮",
            bg: novel.cover_bg || "#FFF0F8",
            categories: novel.categories?.map(c => c.name || c) || ["ทั่วไป"],
            progress: progressPercent,
            lastReadLocation: novel.last_read_scene_name || novel.last_read_scene_title || "อ่านล่าสุด",
            is_completed: statusInfo.isCompleted,
          };
        });

        setContinueReadingNovels(formattedHistory);
      } catch (err) {
        console.warn("ไม่สามารถดึงประวัติการอ่านได้:", err.message);
      }
    };

    fetchReadHistory();
  }, []);

  const heroFeaturedNovel = useMemo(() => {
    // 🟢 ลบข้อมูล "เอลฟ์" ตัวปลอมออกไป ดึงจากข้อมูลจริง ถ้าไม่มีก็คืนค่า null
    return trendingNovels.length > 0 ? trendingNovels[0] : null;
  }, [trendingNovels]);

  const primaryReadTarget = useMemo(() => {
    if (continueReadingNovels.length > 0) return continueReadingNovels[0];
    if (heroFeaturedNovel) return heroFeaturedNovel;
    return novels[0] || null;
  }, [continueReadingNovels, heroFeaturedNovel, novels]);

  useEffect(() => {
    if (!featuredWriter?.id) return;
    try {
      const saved = localStorage.getItem("local_following_writers");
      const list = saved ? JSON.parse(saved) : [];
      const hasFollowed = list.some(w => Number(w.id) === Number(featuredWriter.id));
      setIsFollowed(hasFollowed);

      // 🟢 ถ้าใน DB เป็น 0 แต่เราเคยติดตามไว้ ให้ตั้ง offset ปรับตัวเลขขั้นต่ำเป็น 1
      if (hasFollowed && featuredWriter.followersCount === 0) {
        setFollowerOffset(1);
      } else {
        setFollowerOffset(0);
      }
    } catch (e) {
      console.warn("Failed to read follow states:", e);
    }
  }, [featuredWriter]);

  return (
    <div className="home-container-new">

      {/* ═══ 1. HERO SECTION ═══ */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-eyebrow">
              <i className="ti ti-star-filled"></i>
              <span>นิยายทางเลือกแบบ Interactive</span>
            </div>

            <h1 className="hero-title">
              ทุกตัวเลือก<br />
              <em>เปลี่ยนชะตา</em><br />
              ของเรื่องราว
            </h1>

            <p className="hero-sub">
              สัมผัสประสบการณ์การอ่านนิยายทางเลือกที่คุณคือผู้กำหนดจุดจบ ทุกการตัดสินใจสร้างเรื่องราวที่แตกต่างและไม่ซ้ำใคร
            </p>

            <div className="hero-ctas">
              <button
                className="btn-hero-primary"
                onClick={() => {
                  if (primaryReadTarget) {
                    handleReadNovel(primaryReadTarget.id);
                  } else {
                    showToast("ยินดีต้อนรับสู่โลก StoryVerse!");
                  }
                }}
              >
                <i className="ti ti-book-2"></i>เริ่มอ่านเลย
              </button>
              <Link to="/categories" className="btn-hero-sec" style={{ textDecoration: 'none' }}>
                <i className="ti ti-compass"></i>สำรวจหมวดหมู่
              </Link>
            </div>
          </div>

          <div className="hero-right">
            {heroFeaturedNovel && (
              <div className="book-stack">
                <div className="book-card-float book-behind2"></div>
                <div className="book-card-float book-behind1"></div>
                <div
                  className="book-card-float book-main"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => activateCardAction(event, () => {
                    handleReadNovel(heroFeaturedNovel.id);
                    showToast(`เปิดเรื่อง: ${heroFeaturedNovel.title}`);
                  })}
                  onClick={() => {
                    handleReadNovel(heroFeaturedNovel.id);
                    showToast(`เปิดเรื่อง: ${heroFeaturedNovel.title}`);
                  }}
                >
                  {heroFeaturedNovel.coverImage ? (
                    <img
                      src={heroFeaturedNovel.coverImage}
                      alt="cover"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                    />
                  ) : (
                    <>
                      <span className="book-emoji">{heroFeaturedNovel.coverEmoji}</span>
                      <div className="book-title-float">{heroFeaturedNovel.title}</div>
                      <div className="book-author-float">โดย {heroFeaturedNovel.author?.displayName}</div>
                    </>
                  )}
                </div>

                <div className="float-badge float-badge-1">
                  <i className="ti ti-trending-up" style={{ color: "var(--pink)" }}></i>
                  <div>
                    <span>กำลังนิยม</span>
                    <sub>#1 สัปดาห์นี้</sub>
                  </div>
                </div>

                <div className="float-badge float-badge-2">
                  <i className="ti ti-git-branch" style={{ color: "#7C3AED" }}></i>
                  <div>
                    <span>ทางเลือกเยอะ</span>
                    <sub>ที่รอค้นพบ</sub>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ 2. TRENDING SECTION (Section A) ═══ */}
      <section className="home-section home-section--a">
        <div className="section">
          <div className="sec-head">
            <div>
              <div className="sec-title"><span>กำลังเป็นที่นิยม</span></div>
              <div className="sec-subtitle">อัปเดตแบบเรียลไทม์ตามยอดเข้าชมจริง</div>
            </div>
            <Link to="/categories" className="sec-link">
              ดูทั้งหมด <i className="ti ti-arrow-right"></i>
            </Link>
          </div>

          {loading ? (
            <LoadingScreen compact message="กำลังโหลดนิยายยอดนิยม..." />
          ) : trendingNovels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>ไม่มีนิยายยอดนิยมในขณะนี้</div>
          ) : (
            <div className="trending-scroll">
              {trendingNovels.map((novel, index) => {
                const rank = index + 1;
                const rankClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
                return (
                  <div
                    key={novel.id}
                    className="trending-card"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => activateCardAction(event, () => handleReadNovel(novel.id))}
                    onClick={() => handleReadNovel(novel.id)}
                  >
                    <div className="tc-cover" style={{ background: novel.bg }}>
                      {novel.coverImage ? (
                        <img
                          src={novel.coverImage}
                          alt={novel.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        novel.coverEmoji
                      )}
                      <div className={`tc-rank ${rankClass}`}>{rank}</div>
                      <div className="tc-badges-top">
                        {rank <= 3 && <div className="tc-hot">🔥 กำลังฮอต</div>}
                        {novel.is_completed && <div className="tc-finished-badge">จบแล้ว</div>}
                      </div>
                    </div>

                    <div className="tc-body">
                      <div className="tc-tags">
                        {novel.categories.slice(0, 2).map((cat, i) => (
                          <span key={i} className="tc-tag">{cat}</span>
                        ))}
                        {novel.categories.length > 2 && (
                          <span className="tc-tag tc-tag-overflow">+{novel.categories.length - 2}</span>
                        )}
                      </div>

                      <div className="tc-title" title={novel.title}>{novel.title}</div>

                      <div className="tc-author">
                        <Pencil size={12} className="novel-author-icon" /> <span>{novel.author.displayName}</span>
                      </div>

                      <div className="tc-excerpt" title={novel.synopsis}>
                        {novel.synopsis}
                      </div>

                      <div className="tc-stats">
                        <div className="tc-stat" title="เพิ่มเข้าชั้น"><Bookmark size={13} /><span>{formatNumber(novel.bookshelf_count)}</span></div>
                        <div className="tc-stat" title="ยอดวิว"><Eye size={13} /><span>{formatNumber(novel.views)}</span></div>
                        <div className="tc-stat" title="ยอดถูกใจ"><Heart size={13} /><span>{formatNumber(novel.like_count)}</span></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══ 3. NEW RELEASES SECTION (Section B) ═══ */}
      <section className="home-section home-section--b">
        <div className="section">
          <div className="sec-head">
            <div>
              <div className="sec-title">นิยาย<span>ใหม่ล่าสุด</span></div>
              <div className="sec-subtitle">ผลงานเขียนใหม่ล่าสุดที่ลงตีพิมพ์บนเว็บวันนี้</div>
            </div>
            <Link to="/categories" className="sec-link">
              ดูทั้งหมด <i className="ti ti-arrow-right"></i>
            </Link>
          </div>

          {loading ? (
            <LoadingScreen compact message="กำลังโหลดนิยายใหม่..." />
          ) : newReleases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>ไม่มีนิยายใหม่ในขณะนี้</div>
          ) : (
            <div className="new-grid">
              {newReleases.map((novel) => {
                // 🟢 ระบบเช็คของใหม่ของจริง เช็คว่าวันที่สร้างน้อยกว่า 30 วันหรือไม่
                let isReallyNew = false;
                if (novel.createdAt) {
                  const hoursSinceCreation = (new Date() - new Date(novel.createdAt)) / (1000 * 60 * 60);
                  isReallyNew = hoursSinceCreation <= 24;
                }

                return (
                  <div
                    key={novel.id}
                    className="novel-row-card"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => activateCardAction(event, () => handleReadNovel(novel.id))}
                    onClick={() => handleReadNovel(novel.id)}
                  >
                    <div className="nrc-cover" style={{ background: novel.bg, position: 'relative' }}>
                      {novel.coverImage ? (
                        <img
                          src={novel.coverImage}
                          alt={novel.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
                        />
                      ) : (
                        novel.coverEmoji
                      )}
                      {novel.is_completed && <div className="tc-finished-badge">จบแล้ว</div>}
                    </div>

                    <div className="nrc-body">
                      <div className="nrc-meta">
                        {novel.categories.slice(0, 2).map((cat, i) => (
                          <span key={i} className="nrc-tag">{cat}</span>
                        ))}
                        {novel.categories.length > 2 && (
                          <span className="nrc-tag tc-tag-overflow">+{novel.categories.length - 2}</span>
                        )}
                        {isReallyNew && <span className="nrc-new">ใหม่</span>}
                      </div>
                      <div className="nrc-title" title={novel.title}>{novel.title}</div>
                      <div className="nrc-author">
                        <Pencil size={12} className="novel-author-icon" /> <span>{novel.author.displayName}</span>
                      </div>
                      <div className="nrc-tagline" title={novel.synopsis}>{novel.synopsis}</div>

                      <div className="nrc-footer">
                        <div className="nrc-stats">
                          <div className="nrc-stat" title="เพิ่มเข้าชั้น"><Bookmark size={13} /><span>{formatNumber(novel.bookshelf_count)}</span></div>
                          <div className="nrc-stat" title="ยอดวิว"><Eye size={13} /><span>{formatNumber(novel.views)}</span></div>
                          <div className="nrc-stat" title="ยอดถูกใจ"><Heart size={13} /><span>{formatNumber(novel.like_count)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══ 4. GENRE SPOTLIGHT SECTION (Section C) ═══ */}
      <section className="home-section home-section--c genre-spotlight">
        <div className="section">
          <div className="sec-head">
            <div>
              <div className="sec-title">สำรวจตาม<span style={{ color: "var(--pink)" }}> หมวดหมู่</span></div>
              <div className="sec-subtitle">เลือกแนวที่สนใจแล้วร่วมออกผจญภัยแบบกำหนดทิศทางเอง</div>
            </div>
            <Link to="/categories" className="sec-link">
              ดูทุกหมวด <i className="ti ti-arrow-right"></i>
            </Link>
          </div>

          <div className="genre-scroll">
            {GENRES_LIST.map((g) => {
              const count = novels.filter(n =>
                n.categories.some(cat =>
                  cat.toLowerCase().includes(g.key.toLowerCase())
                )
              ).length;
              return (
                <div
                  key={g.key}
                  className={`genre-pill-card ${activeGenre === g.key ? "on" : ""}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => activateCardAction(event, () => setActiveGenre(g.key))}
                  onClick={() => setActiveGenre(g.key)}
                >
                  <div>
                    <div className="gpc-name">{g.name}</div>
                    <div className="gpc-count">{count} เรื่อง</div>
                  </div>
                </div>
              );
            })}
          </div>

          {loading ? (
            <LoadingScreen compact message="กำลังโหลดนิยายแนวนี้..." />
          ) : (
            <div className="dark-cards">
              {spotlightNovels.map((novel) => (
                <div
                  key={novel.id}
                  className="dark-novel-card"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => activateCardAction(event, () => handleReadNovel(novel.id))}
                  onClick={() => handleReadNovel(novel.id)}
                >
                  <div className="dnc-cover" style={{ background: novel.bg, position: 'relative' }}>
                    {novel.coverImage ? (
                      <img
                        src={novel.coverImage}
                        alt={novel.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      novel.coverEmoji
                    )}
                    {novel.is_completed && <div className="tc-finished-badge">จบแล้ว</div>}
                  </div>

                  <div className="dnc-body">
                    <div className="tc-tags" style={{ marginBottom: '4px' }}>
                      {novel.categories.slice(0, 2).map((cat, i) => (
                        <span key={i} className="tc-tag">{cat}</span>
                      ))}
                      {novel.categories.length > 2 && (
                        <span className="tc-tag tc-tag-overflow">+{novel.categories.length - 2}</span>
                      )}
                    </div>
                    <div className="dnc-title" title={novel.title}>{novel.title}</div>
                    <div className="dnc-meta">
                      <Pencil size={12} className="novel-author-icon" /> <span>{novel.author.displayName}</span>
                    </div>

                    <div className="dnc-stats">
                      <div className="dnc-stat" title="เพิ่มเข้าชั้น"><Bookmark size={13} /><span>{formatNumber(novel.bookshelf_count)}</span></div>
                      <div className="dnc-stat" title="ยอดวิว"><Eye size={13} /><span>{formatNumber(novel.views)}</span></div>
                      <div className="dnc-stat" title="ยอดถูกใจ"><Heart size={13} /><span>{formatNumber(novel.like_count)}</span></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </section>

      {/* ═══ 5. CONTINUE READING SECTION (Section D) ═══ */}
      {continueReadingNovels.length > 0 && (
        <section className="home-section home-section--d">
          <div className="section">
            <div className="sec-head">
              <div>
                <div className="sec-title">📖 อ่านต่อจาก<span>ที่ค้างไว้</span></div>
                <div className="sec-subtitle">ย้อนกลับไปผจญภัยในเส้นทางตัวเลือกที่กำลังค้างท่ออยู่</div>
              </div>
            </div>

            <div className="new-grid">
              {continueReadingNovels.map((novel) => (
                <div
                  key={novel.id}
                  className="novel-row-card"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => activateCardAction(event, () => handleReadNovel(novel.id))}
                  onClick={() => handleReadNovel(novel.id)}
                >
                  <div className="nrc-cover" style={{ background: novel.bg }}>
                    {novel.coverImage ? (
                      <img
                        src={novel.coverImage}
                        alt={novel.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
                      />
                    ) : (
                      novel.coverEmoji
                    )}
                      {novel.is_completed && <div className="tc-finished-badge">จบแล้ว</div>}
                  </div>

                  <div className="nrc-body">
                    <div className="nrc-meta">
                      {novel.categories?.slice(0, 2).map((cat, i) => (
                        <span key={i} className="nrc-tag">{cat}</span>
                      ))}
                      {novel.categories?.length > 2 && (
                        <span className="nrc-tag tc-tag-overflow">+{novel.categories.length - 2}</span>
                      )}
                      <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: "600", background: "#FEF3C7", color: "#92400E", border: "0.5px solid #FCD34D" }}>
                        กำลังอ่าน
                      </span>
                    </div>
                    <div className="nrc-title">{novel.title}</div>
                    <div className="nrc-tagline">{novel.lastReadLocation}</div>

                    <div style={{ height: "4px", background: "var(--border-m)", borderRadius: "999px", overflow: "hidden", margin: "6px 0" }}>
                      <div style={{ height: "4px", width: `${novel.progress}%`, background: "linear-gradient(90deg, var(--pink), #FF6EB4)", borderRadius: "999px" }}></div>
                    </div>

                    <div className="nrc-footer">
                      <div className="nrc-author">
                        <i className="ti ti-book-2"></i>อ่านไปแล้ว {novel.progress}%
                      </div>
                      <div className="nrc-stat nrc-stat-right">
                        <span style={{ color: "var(--pink)", fontWeight: "600" }}>อ่านต่อ</span>
                        <i className="ti ti-arrow-right" style={{ color: "var(--pink)", marginLeft: "4px" }}></i>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ 6. FEATURED WRITER SPOTLIGHT (Section E) ═══ */}
      {featuredWriter && (
        <section className="home-section home-section--e writer-spotlight">
          <div className="section">
            <div className="sec-head">
              <div>
                <div className="sec-title">นักเขียน<span>ประจำเดือน</span></div>
                <div className="sec-subtitle">ทำความรู้จักกับนักเขียนและผลงานเรื่องราวยอดนิยมประจำเดือนนี้</div>
              </div>
            </div>

            <div className="writer-inner">

              <div className="writer-profile">
                <div className="writer-avatar">
                  {featuredWriter.avatarUrl ? (
                    <img
                      src={featuredWriter.avatarUrl}
                      alt={featuredWriter.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                    />
                  ) : (
                    featuredWriter.avatarLetter
                  )}
                  <div className="writer-badge">
                    <Pencil size={12} />
                  </div>
                </div>

                <div>
                  <div className="writer-name">{featuredWriter.name}</div>
                  <div className="writer-handle">{featuredWriter.handle} · นักเขียนประจำเดือน</div>
                </div>

                <p className="writer-bio">{featuredWriter.bio}</p>

                <div className="writer-stats">
                  <div className="ws">
                    <div className="ws-val">{featuredWriter.worksCount}</div>
                    <div className="ws-label">นิยาย</div>
                  </div>
                  <div className="ws">
                    <div className="ws-val">{featuredWriter.followersCount + followerOffset}</div>
                    <div className="ws-label">ผู้ติดตาม</div>
                  </div>
                  <div className="ws">
                    <div className="ws-val">{featuredWriter.viewsCount}</div>
                    <div className="ws-label">ยอดอ่านรวม</div>
                  </div>
                </div>

                <button
                  className={`follow-btn ${isFollowed ? "followed" : ""}`}
                  disabled={followLoading}
                  onClick={async () => {
                    if (followLoading) return;
                    setFollowLoading(true);
                    const token = localStorage.getItem("token");
                    const nextState = !isFollowed;

                    setIsFollowed(nextState);

                    // คำนวณยอดผู้ติดตามใหม่
                    const currentTotal = featuredWriter.followersCount + followerOffset;
                    const newCount = nextState ? currentTotal + 1 : Math.max(0, currentTotal - 1);

                    setFollowerOffset(prev => nextState ? prev + 1 : prev - 1);

                    try {
                      const saved = localStorage.getItem("local_following_writers");
                      let list = saved ? JSON.parse(saved) : [];
                      if (nextState) {
                        const writerObject = {
                          id: featuredWriter.id,
                          writer_id: featuredWriter.id,
                          pen_name: featuredWriter.name,
                          bio: featuredWriter.bio,
                          avatar_url: featuredWriter.avatarUrl,
                          follower_count: newCount,
                          novel_count: featuredWriter.worksCount,
                          novels: featuredWriter.worksList.map(w => ({
                            novel_id: w.id,
                            title: w.title,
                            cover_image: w.coverImage,
                            cover_emoji: w.coverEmoji
                          }))
                        };
                        list = list.filter(w => Number(w.id) !== Number(featuredWriter.id));
                        list.push(writerObject);
                      } else {
                        list = list.filter(w => Number(w.id) !== Number(featuredWriter.id));
                      }
                      localStorage.setItem("local_following_writers", JSON.stringify(list));
                    } catch (e) {
                      console.warn("LocalStorage follow sync failed:", e);
                    }

                    showToast(nextState ? `กดติดตาม @${featuredWriter.name} เรียบร้อย!` : `ยกเลิกการติดตาม @${featuredWriter.name}`);

                    try {
                      if (token) {
                        const endpoint = nextState
                          ? `${API_BASE_URL}/api/writers/${featuredWriter.id}/follow`
                          : `${API_BASE_URL}/api/writers/${featuredWriter.id}/unfollow`;
                        await axios.post(endpoint, {}, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                      }
                    } catch (err) {
                      console.warn("API follow/unfollow request failed:", err.message);
                    } finally {
                      setFollowLoading(false);
                    }
                  }}
                >
                  {followLoading ? (
                    <><i className="ti ti-loader-2"></i>กำลังบันทึก...</>
                  ) : isFollowed ? (
                    <>
                      <i className="ti ti-user-check"></i>ติดตามแล้ว
                    </>
                  ) : (
                    <>
                      <i className="ti ti-user-plus"></i>ติดตาม
                    </>
                  )}
                </button>
              </div>

              <div className="writer-works">
                {featuredWriter.worksList.map((work) => (
                  <div
                    key={work.id}
                    className="writer-work"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => activateCardAction(event, () => handleReadNovel(work.id))}
                    onClick={() => handleReadNovel(work.id)}
                  >
                    <div className="ww-cover" style={{ background: work.bg }}>
                      {work.coverImage ? (
                        <img
                          src={work.coverImage}
                          alt={work.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                        />
                      ) : (
                        work.coverEmoji
                      )}
                      {work.is_completed && <div className="tc-finished-badge">จบแล้ว</div>}
                    </div>

                    <div className="ww-body">
                      <div className="ww-title">{work.title}</div>
                      <div className="ww-excerpt" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {work.synopsis}
                      </div>

                      <div className="ww-stats" style={{ display: 'flex', gap: '12px' }}>
                        <div className="ww-stat" title="เพิ่มเข้าชั้น"><Bookmark size={13} /><span>{formatNumber(work.bookshelf_count)}</span></div>
                        <div className="ww-stat" title="ยอดวิว"><Eye size={13} /><span>{formatNumber(work.views)}</span></div>
                        <div className="ww-stat" title="ยอดถูกใจ"><Heart size={13} /><span>{formatNumber(work.like_count)}</span></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </section>
      )}

      {/* ═══ 7. CTA BANNER ═══ */}
      <section className="cta-banner">
        <div className="cta-inner">
          <h2 className="cta-title">พร้อมเขียนเรื่องราวของคุณ?</h2>
          <p className="cta-sub">
            ร่วมสร้างนิยายทางเลือกของคุณ ด้วยเครื่องมือที่ออกแบบมาเพื่อช่วยจัดการโครงเรื่อง ฉาก และทางเลือกได้อย่างเป็นระบบ
          </p>
          <div className="cta-btns">
            <Link to="/writer/dashboard" className="cta-btn-w" style={{ textDecoration: 'none' }}>
              <i className="ti ti-pencil"></i>เริ่มเขียนเลย
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 8. FOOTER SECTION ═══ */}
      <footer className="footer">
        <div className="footer-logo">StoryVerse</div>
        <div className="footer-sub">© 2569 StoryVerse · ทุกตัวเลือกสร้างชะตากรรมเรื่องราว</div>
      </footer>

      {toast.isOpen && (
        <div className="toast-bar">
          <i className="ti ti-info-circle"></i>
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
};

export default HomePage;