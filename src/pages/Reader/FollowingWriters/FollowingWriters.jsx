import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowUpDown, ArrowLeft, AlertTriangle, Feather } from "lucide-react";
import WriterCard from "../../../components/WriterCard/WriterCard"; // เรียกใช้ Component ย่อยที่แยกออกมา
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import "./FollowingWriters.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function stripHTML(value) {
  if (!value || typeof value !== "string") return null;
  return value.replace(/<[^>]*>/g, "").trim();
}

function formatThaiDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const datePart = new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);

  return `${datePart.replace(/,/, "")} เวลา ${timePart} น.`;
}

function normalizeLatestUpdate(rawUpdate) {
  if (!rawUpdate) return null;

  if (typeof rawUpdate === "string" || rawUpdate instanceof Date || typeof rawUpdate === "number") {
    const formattedTime = formatThaiDate(rawUpdate);
    return {
      title: "อัปเดตล่าสุด",
      detail: null,
      time: formattedTime,
      timestamp: new Date(rawUpdate).getTime(),
    };
  }

  if (typeof rawUpdate === "object") {
    const timestampValue = rawUpdate.timestamp ?? rawUpdate.updated_at ?? rawUpdate.updatedAt ?? rawUpdate.created_at ?? rawUpdate.createdAt ?? rawUpdate.date ?? rawUpdate.datetime ?? rawUpdate.time ?? null;
    const parsedTimestamp = timestampValue ? new Date(timestampValue) : null;
    const formattedTime = parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
      ? formatThaiDate(parsedTimestamp)
      : formatThaiDate(rawUpdate.time || rawUpdate.formattedTime || rawUpdate.formatted_time || null);

    return {
      title: rawUpdate.title || rawUpdate.name || "อัปเดตล่าสุด",
      detail: rawUpdate.detail || rawUpdate.description || rawUpdate.message || rawUpdate.summary || null,
      time: formattedTime || rawUpdate.time || rawUpdate.formattedTime || rawUpdate.formatted_time || null,
      timestamp: parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime()) ? parsedTimestamp.getTime() : null,
    };
  }

  return null;
}

const formatMinioUrl = (url) => {
  if (!url) return null;
  return url.replace('http://minio:9000', 'http://localhost:9000');
};

function normalizeNovel(novel) {
  if (!novel || typeof novel !== "object") return null;
  return {
    id: novel.novel_id ?? novel.id ?? novel.novelId,
    title: novel.title || novel.name || "ไม่ทราบชื่อเรื่อง",
    status: novel.status || novel.state || "ongoing",
    cover: formatMinioUrl(novel.cover || novel.cover_image || novel.coverImage || novel.thumbnail) || null,
    chapterCount: novel.chapter_count ?? novel.chapterCount ?? 0,
  };
}

function mapWriter(writer) {
  const rawBio = writer.bio || writer.description || writer.bio_html || writer.bioHtml || null;
  const plainBio = stripHTML(rawBio);
  const novels = Array.isArray(writer.novels)
    ? writer.novels.map(normalizeNovel).filter(Boolean)
    : [];
  const latestUpdate = normalizeLatestUpdate(writer.latest_update || writer.latestUpdate || null);

  const rawAvatar =
    writer.avatar_url ||
    writer.avatar ||
    writer.avatarUrl ||
    writer.pic_profile ||
    writer.author_avatar ||
    writer.user_avatar ||
    writer.profile_picture;

  const resolvedAvatar = formatMinioUrl(rawAvatar) || null;

  const followerCount =
    writer.follower_count ??
    writer.followers_count ??
    writer.total_followers ??
    writer.total_like_count ??
    writer.followers ??
    0;

  const novelCount =
    writer.novel_count ??
    writer.total_novels ??
    writer.novels_count ??
    writer.novelCount ??
    novels.length;

  return {
    id: writer.writer_id ?? writer.id,
    name: writer.pen_name || writer.name || writer.name_lastname || "นักเขียน",
    bio: plainBio || null,
    avatar: resolvedAvatar,
    color: writer.color || ["#6D28D9", "#E91E8C", "#0F766E", "#0EA5E9"][Math.abs((writer.writer_id ?? writer.id ?? 0) % 4)],
    followers: followerCount,
    novelCount: novelCount,
    hasUnreadUpdate: Boolean(writer.has_unread_update || writer.hasUnreadUpdate),
    novels,
    latestUpdate,
    latestUpdateTimestamp: latestUpdate?.timestamp ?? null,
  };
}

export default function FollowingWriters() {
  const navigate = useNavigate();
  const [writers, setWriters] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [showSort, setShowSort] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const SORT_OPTIONS = {
    recent:    "อัปเดตล่าสุด",
    followers: "ผู้ติดตามมากสุด",
    name:      "ตามชื่อ",
  };

  useEffect(() => {
    const fetchFollowingWriters = async () => {
      const token = localStorage.getItem("token");
      
      // อ่านข้อมูลจาก LocalStorage เสมอเพื่อเตรียมไว้สำหรับ Fallback/Merge
      let localWriters = [];
      try {
        const localSaved = localStorage.getItem("local_following_writers");
        const list = localSaved ? JSON.parse(localSaved) : [];
        localWriters = Array.isArray(list) ? list.map(mapWriter) : [];
      } catch (e) {
        console.warn("Failed to read local following writers:", e);
      }

      if (!token) {
        // หากไม่มี token ให้ใช้เฉพาะข้อมูลจาก LocalStorage เพื่อให้ใช้งานหน้าหลักซิงค์มาหน้าติดตามได้
        setWriters(localWriters);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/users/following-writers`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "โหลดรายการนักเขียนที่ติดตามไม่สำเร็จ");
        }

        const payload = await response.json().catch(() => null) || {};
        const body = payload?.data ?? payload ?? {};
        const followedArray = Array.isArray(body) ? body : (body.following || body.writers || []);
        const followedWriters = Array.isArray(followedArray) ? followedArray.map(mapWriter) : [];
        
        // ผนวกรวมข้อมูลจาก API และ LocalStorage โดยไม่ให้ไอดีทับซ้อนกัน
        const mergedList = [...followedWriters];
        localWriters.forEach(lw => {
          if (!mergedList.some(w => Number(w.id) === Number(lw.id))) {
            mergedList.push(lw);
          }
        });

        // 🟢 ดึงข้อมูลสถิติที่แท้จริง (จำนวนผู้ติดตาม + นิยายที่เผยแพร่ทั้งหมด) จาก /writer/:id และ /novels
        let enrichedList = [...mergedList];
        try {
          enrichedList = await Promise.all(
            mergedList.map(async (writer) => {
              const wId = writer.id;
              if (!wId) return writer;

              try {
                const res = await fetch(`${API_BASE_URL}/writer/${wId}`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                  const resJson = await res.json().catch(() => null);
                  const wData = resJson?.data || resJson?.writer || resJson || {};
                  if (wData) {
                    let rawNovels = Array.isArray(wData.novels) ? wData.novels : [];

                    // ถ้า wData.novels ไม่มีหรือโล่ง ให้ดึงรายการนิยายทั้งหมดจาก /novels
                    if (rawNovels.length === 0) {
                      try {
                        const nRes = await fetch(`${API_BASE_URL}/novels`, {
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (nRes.ok) {
                          const nJson = await nRes.json().catch(() => null);
                          const rawAll = nJson?.novels || nJson?.data?.novels || nJson?.data || (Array.isArray(nJson) ? nJson : []);
                          rawNovels = (Array.isArray(rawAll) ? rawAll : []).filter(
                            n => String(n.author_id || n.authorId || n.user_id || n.userId || n.writer_id) === String(wId)
                          );
                        }
                      } catch (_) {}
                    }

                    const normalizedNovels = rawNovels.map(normalizeNovel).filter(Boolean);
                    const finalNovels = normalizedNovels.length > 0 ? normalizedNovels : writer.novels;

                    const followerCount =
                      wData.follower_count ??
                      wData.followers_count ??
                      wData.followers ??
                      wData.total_followers ??
                      writer.followers ??
                      0;

                    const novelCount =
                      wData.novel_count ??
                      wData.total_novels ??
                      wData.novels_count ??
                      finalNovels.length ??
                      writer.novelCount ??
                      0;

                    return {
                      ...writer,
                      name: wData.pen_name || wData.name || writer.name,
                      bio: stripHTML(wData.bio || writer.bio),
                      avatar: formatMinioUrl(wData.avatar_url || wData.avatar || wData.pic_profile || writer.avatar) || writer.avatar,
                      followers: followerCount,
                      novelCount: Math.max(novelCount, finalNovels.length),
                      novels: finalNovels,
                      latestUpdate: normalizeLatestUpdate(wData.latest_update || wData.latestUpdate || writer.latestUpdate),
                    };
                  }
                }
              } catch (e) {
                console.warn("Failed to fetch full stats for writer", wId, e);
              }
              return writer;
            })
          );
        } catch (e) {
          enrichedList = mergedList;
        }

        setWriters(enrichedList);
        setError("");
      } catch (err) {
        console.error("โหลดรายการนักเขียนที่ติดตามล้มเหลว:", err);
        // หาก API ล้มเหลว ให้ใช้ข้อมูลจาก LocalStorage แทนเพื่อไม่ให้หน้าว่างเปล่า
        setWriters(localWriters);
        setError("");
      } finally {
        setLoading(false);
      }
    };

    fetchFollowingWriters();
  }, []);

  const handleUnfollow = async (id) => {
    const confirmed = window.confirm("คุณต้องการเลิกติดตามนักเขียนคนนี้ใช่หรือไม่?");
    if (!confirmed) return;

    const removedWriter = writers.find((writer) => Number(writer.id) === Number(id));
    const savedFollowingWriters = localStorage.getItem("local_following_writers");

    // อัปเดต UI ทันที แล้วคืนรายการถ้า backend ปฏิเสธคำขอ
    setWriters((previous) => previous.filter((writer) => writer.id !== id));

    // 2. อัปเดตและซิงค์ลบออกจาก LocalStorage
    try {
      const saved = localStorage.getItem("local_following_writers");
      let list = saved ? JSON.parse(saved) : [];
      list = list.filter(w => Number(w.id) !== Number(id));
      localStorage.setItem("local_following_writers", JSON.stringify(list));
    } catch (e) {
      console.warn("Failed to remove from local_following_writers:", e);
    }

    // 3. เรียก API ลบออกจากระบบ Backend จริง (ถ้ามี Token)
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/writers/${id}/unfollow`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) throw new Error(`unfollow failed: ${response.status}`);
      } catch (e) {
        console.warn("API unfollow request warning:", e.message);
        if (removedWriter) setWriters((previous) => [removedWriter, ...previous]);
        if (savedFollowingWriters !== null) {
          localStorage.setItem("local_following_writers", savedFollowingWriters);
        }
        alert("ไม่สามารถเลิกติดตามนักเขียนได้ กรุณาลองใหม่อีกครั้ง");
      }
    }
  };

  let visible = writers.filter(w => {
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      w.novels.some(n => n.title.toLowerCase().includes(q))
    );
  });
  if (sort === "followers") visible = [...visible].sort((a,b) => b.followers - a.followers);
  if (sort === "name") visible = [...visible].sort((a,b) => a.name.localeCompare(b.name));
  if (sort === "recent") visible = [...visible].sort((a,b) => (b.latestUpdateTimestamp ?? 0) - (a.latestUpdateTimestamp ?? 0));

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="following-page">
      <div className="following-page__sticky-header">
        <div className="following-page__top">
          <div className="following-page__heading">
            <button className="backBtn" onClick={() => navigate(-1)} aria-label="ย้อนกลับ">
              <ArrowLeft size={18} />
            </button>
            <div className="following-page__labels">
              <div className="following-page__eyebrow">นักเขียนของฉัน</div>
              <div className="following-page__title">นักเขียนที่ติดตาม</div>
            </div>
          </div>

          <div className="following-page__count">ทั้งหมด {writers.length} คน</div>
        </div>
      </div>

      <div className="following-page__container">
        <div className="filterRow">
          <div className="searchBar">
            <span className="searchIcon"><Search size={16} /></span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อนักเขียนหรือนิยาย..."
              className="searchInput"
            />
            {search && (
              <button onClick={() => setSearch("")} className="clearBtn" aria-label="ล้างคำค้นหา">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sortWrapper">
              <button
                type="button"
                onClick={() => setShowSort(p => !p)}
                className="sortTrigger"
                aria-expanded={showSort}
                aria-haspopup="menu"
              >
              <ArrowUpDown size={14} /> <span className="sortLabel">{SORT_OPTIONS[sort]}</span>
            </button>
            
            {showSort && (
              <>
                <div onClick={() => setShowSort(false)} className="backdrop" />
                <div className="dropdownMenu">
                  {Object.entries(SORT_OPTIONS).map(([k, v]) => (
                    <button 
                      key={k} 
                      onClick={() => { setSort(k); setShowSort(false); }} 
                      className={`dropdownItem ${sort === k ? "dropdownItemActive" : ""}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="emptyState">
            <div className="emptyIcon"><AlertTriangle size={40} /></div>
            <div className="emptyTitle">ไม่สามารถโหลดข้อมูลได้</div>
            <div className="emptyText">{error}</div>
          </div>
        )}

        {!error && visible.length === 0 ? (
          <div className="emptyState">
            <div className="emptyIcon">
              {search ? <Search size={40} /> : <Feather size={40} />}
            </div>
            <div className="emptyTitle">
              {search ? "ไม่พบนักเขียนที่ค้นหา" : "ยังไม่ได้ติดตามนักเขียนคนไหน"}
            </div>
            <div className="emptyText">
              {search ? "ลองเปลี่ยนคำค้นหาดูนะ" : "ไปค้นหานักเขียนที่ชอบแล้วกดติดตามได้เลย"}
            </div>
          </div>
        ) : (
          <div className="listGrid">
            {visible.map(w => (
              <WriterCard key={w.id} writer={w} onUnfollow={handleUnfollow} isFollowing={true} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}