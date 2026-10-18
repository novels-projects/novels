import React, { useEffect, useState } from "react";
import axios from "axios";
import "./NovelProgressBar.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const NODE_STATUS = {
  VISITED: "visited",
  CURRENT: "current",
  LOCKED: "locked",
  ENDING_UNLOCKED: "ending_unlocked",
  ENDING_LOCKED: "ending_locked",
};

const ITEMS_PER_PAGE = 6;

const stripHtml = (text) => {
  if (!text || typeof text !== "string") return "";
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
};

const NovelProgressBar = ({
  novelId,
  autoFetch = false,
  isPreview = false,
  isAdmin = false,
  onStoryMapClick,
  onEndingCollectionClick,
  onContinueRead,
  onSceneClick,
  className = "",
}) => {
  const [visitedNodes, setVisitedNodes] = useState([]);
  const [latestNode, setLatestNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // ตอนกด "อ่านเลย/อ่านต่อ" ต้องยิง API เช็กฉากก่อน navigate (ดู handleRead ที่ NovelDetailPage)
  // ถ้าไม่มี loading ตรงนี้ผู้ใช้จะกดแล้วเห็นปุ่มนิ่งเฉยๆ ไม่รู้ว่ากำลังทำงานอยู่
  const [navLoading, setNavLoading] = useState(false);

  const handleContinueClick = async (sceneId) => {
    if (navLoading) return;
    setNavLoading(true);
    try {
      if (sceneId && onSceneClick) {
        await onSceneClick(sceneId);
      } else if (onContinueRead) {
        await onContinueRead();
      }
    } finally {
      setNavLoading(false);
    }
  };

  const getCurrentUserId = () => {
    const token = localStorage.getItem("token");
    if (!token) return 0;
    const userJson = localStorage.getItem("user");
    if (!userJson) return 0;
    try {
      const user = JSON.parse(userJson);
      return user?.id || user?.user_id || 0;
    } catch (err) {
      return 0;
    }
  };

  const checkIsAdmin = () => {
    if (isAdmin) return true;
    const token = localStorage.getItem("token");
    if (!token) return false;
    try {
      const userJson = localStorage.getItem("user");
      if (userJson) {
        const u = JSON.parse(userJson);
        const r = (u?.role || u?.user_role || u?.role_name || "").toString().toLowerCase();
        if (r === "admin" || u?.is_admin === true || u?.isAdmin === true) return true;
      }
    } catch {}
    try {
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
    } catch {}
    return false;
  };

  const effectiveIsAdmin = checkIsAdmin();

  useEffect(() => {
    // โหมด preview แสดงทุกฉาก ส่วน admin แสดงเฉพาะฉากที่เผยแพร่แล้ว
    // ทั้งสองโหมดเป็นสารบัญแบบ read-only จึงไม่ใช้ความคืบหน้าของผู้ใช้
    if (isPreview || isAdmin) {
      if (!novelId) return;

      let isMounted = true;
      const fetchAllScenesForPreview = async () => {
        setLoading(true);
        try {
          const token = localStorage.getItem("token");
          const headers = token ? { Authorization: `Bearer ${token}` } : {};

          const query = isPreview ? "?preview=true" : "";
          const res = await axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree${query}`, { headers });
          const treeData = res.data?.data || res.data;
          const rawNodes = treeData?.nodes || [];

          const allNodes = rawNodes.filter((node) => {
            const isPublished =
              typeof node.is_published === "boolean"
                ? node.is_published
                : String(node.status ?? node.Status ?? "").toLowerCase() === "published";
            return isPreview || isPublished;
          }).map((node) => {
            const isPublished =
              typeof node.is_published === "boolean"
                ? node.is_published
                : String(node.status ?? node.Status ?? "").toLowerCase() === "published";
            return { ...node, computedStatus: isPublished ? "published" : "draft" };
          });

          // เรียงลำดับตามตอน/ลำดับฉาก ให้อ่านเป็นสารบัญได้เป็นธรรมชาติ
          allNodes.sort((a, b) => {
            const episodeA = a.chapter_episode ?? a.chapterEpisode ?? a.episode ?? a.chapter_order ?? 0;
            const episodeB = b.chapter_episode ?? b.chapterEpisode ?? b.episode ?? b.chapter_order ?? 0;
            if (episodeA !== episodeB) return episodeA - episodeB;
            return (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0);
          });

          if (isMounted) {
            setVisitedNodes(allNodes);
            setLatestNode(null);
          }
        } catch (err) {
          console.error("Error fetching full story tree for preview:", err);
          if (isMounted) setVisitedNodes([]);
        } finally {
          if (isMounted) setLoading(false);
        }
      };

      fetchAllScenesForPreview();

      return () => {
        isMounted = false;
      };
    }

    if (!autoFetch || !novelId) return;

    let isMounted = true;
    const fetchTreeProgress = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const userId = getCurrentUserId();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const query = (userId > 0 && !effectiveIsAdmin) ? `?user_id=${userId}` : "";

        const res = await axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree${query}`, { headers });
        const treeData = res.data?.data || res.data;

        if (treeData && isMounted) {
          const rawNodes = treeData.nodes || [];
          const currentSceneIdStr = treeData.current_scene_id ? String(treeData.current_scene_id) : null;
          const startNode = rawNodes.find((n) => n.type === "start") || rawNodes[0];
          const startNodeIdStr = startNode ? String(startNode.id) : null;
          const hasBackendCurrent = rawNodes.some((n) => n.is_current === true);
          // ถ้า backend ไม่เคยส่ง current_scene_id หรือ is_current มาเลย แปลว่าผู้ใช้ยังไม่เคย
          // เริ่มอ่านจริงๆ — โค้ดด้านล่างจะ fallback ให้ "ฉากเริ่มต้น" เป็น current เพื่อประโยชน์
          // ของแผนผังการอ่าน (StoryMap) เท่านั้น ห้ามเอา fallback นี้มานับเป็น "ความคืบหน้าจริง"
          // ไม่งั้นจะเห็นแถบ "อ่านล่าสุด" + "1 ฉากที่ค้นพบ" ทั้งที่ยังไม่เคยกดอ่านเลย
          const hasRealProgress = Boolean(currentSceneIdStr) || hasBackendCurrent;

          const computedNodes = rawNodes.map((node) => {
            const nodeIdStr = String(node.id);
            const isCurrentNode =
              node.is_current ||
              (currentSceneIdStr
                ? nodeIdStr === currentSceneIdStr
                : !hasBackendCurrent && nodeIdStr === startNodeIdStr);

            let computedStatus = NODE_STATUS.LOCKED;

            if (node.type === "start") {
              computedStatus = isCurrentNode ? NODE_STATUS.CURRENT : NODE_STATUS.VISITED;
            } else if (node.type === "ending") {
              computedStatus = isCurrentNode
                ? NODE_STATUS.CURRENT
                : node.is_unlocked
                ? NODE_STATUS.ENDING_UNLOCKED
                : NODE_STATUS.ENDING_LOCKED;
            } else {
              computedStatus = isCurrentNode
                ? NODE_STATUS.CURRENT
                : node.is_unlocked
                ? NODE_STATUS.VISITED
                : NODE_STATUS.LOCKED;
            }

            return { ...node, computedStatus };
          });

          const discovered = effectiveIsAdmin
            ? computedNodes.map((n) => ({
                ...n,
                computedStatus:
                  n.computedStatus === NODE_STATUS.LOCKED
                    ? NODE_STATUS.VISITED
                    : n.computedStatus === NODE_STATUS.ENDING_LOCKED
                    ? NODE_STATUS.ENDING_UNLOCKED
                    : n.computedStatus,
              }))
            : !hasRealProgress
            ? []
            : computedNodes.filter((n) => {
                return (
                  n.computedStatus === NODE_STATUS.CURRENT ||
                  n.computedStatus === NODE_STATUS.VISITED ||
                  n.computedStatus === NODE_STATUS.ENDING_UNLOCKED
                );
              });

          setVisitedNodes(discovered);

          const current = hasRealProgress
            ? computedNodes.find((n) => n.computedStatus === NODE_STATUS.CURRENT) ||
              discovered[discovered.length - 1] ||
              null
            : null;

          setLatestNode(current);
        }
      } catch (err) {
        console.error("Error fetching story tree progress:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTreeProgress();

    return () => {
      isMounted = false;
    };
  }, [novelId, autoFetch, isPreview]);

  useEffect(() => {
    if (!visitedNodes.length) {
      setCurrentPage(1);
      return;
    }
    const idx = latestNode ? visitedNodes.findIndex((n) => n.id === latestNode.id) : -1;
    const targetPage = idx >= 0 ? Math.floor(idx / ITEMS_PER_PAGE) + 1 : 1;
    setCurrentPage(targetPage);
  }, [visitedNodes, latestNode]);

  const totalPages = Math.max(1, Math.ceil(visitedNodes.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedNodes = visitedNodes.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const getChapterLabel = (node) => {
    if (!node) return "";
    const episode = node.chapter_episode || node.chapterEpisode || node.episode || node.chapter_order;
    const title = node.chapter_title || node.ChapterTitle || node.chapterName;
    if (node.type === "start") return "จุดเริ่มต้น";
    if (episode) return `ตอนที่ ${episode}`;
    if (title) return title;
    return `ฉากที่ ${node.id}`;
  };

  const getSceneTitle = (node) => {
    if (!node) return "ไม่ระบุชื่อฉาก";
    return stripHtml(node.title || node.scene_name || node.name || node.label || `ฉากที่ ${node.id}`);
  };

  // 👁️ โหมดทดลองอ่านของนักเขียนเจ้าของนิยาย: เรนเดอร์เป็นสารบัญของตัวเอง
  // เห็นทุกฉาก (ทั้งเผยแพร่แล้ว/ฉบับร่าง) กดเข้าอ่านจากตรงนี้ได้เลย
  // ไม่มีปุ่มบันทึกความคืบหน้า ไม่มี "อ่านล่าสุด" เพราะเป็นแค่การจำลองมุมมองนักอ่าน
  if (isPreview || effectiveIsAdmin) {
    if (loading) {
      return (
        <div className={`novel-timeline-card loading ${className}`}>
          <div className="spinner" />
          <span>กำลังโหลดสารบัญ...</span>
        </div>
      );
    }

    if (visitedNodes.length === 0) {
      return (
        <div className={`novel-timeline-card empty-state ${className}`}>
          <div className="empty-state-content">
            <div className="empty-icon">📖</div>
            <div>
              <h4 className="empty-title">ยังไม่มีฉากในนิยายเรื่องนี้</h4>
              <p className="empty-subtitle">เริ่มสร้างฉากแรกเพื่อดูตัวอย่างสารบัญที่นี่</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`novel-timeline-card ${className}`}>
        {isPreview && (
          <div className="preview-toc-banner">
            👁️ สารบัญโหมดทดลองอ่าน — เห็นทุกฉากรวมฉบับร่าง ไม่มีการบันทึกความคืบหน้าใดๆ
          </div>
        )}

        <div className="timeline-list-section">
          <div className="timeline-header-flex">
            <div>
              <h3 className="timeline-section-title">
                {isAdmin ? "รายการตอนที่เผยแพร่แล้ว" : "สารบัญทั้งหมด"}
              </h3>
              <p className="timeline-section-subtitle">
                {isAdmin ? "คลิกฉากเพื่อเปิดอ่านตรวจสอบเนื้อหา" : "คลิกฉากใดก็ได้เพื่อทดลองอ่าน"}
              </p>
            </div>
            <span className="timeline-count-badge">{visitedNodes.length} ฉาก</span>
          </div>

          <ul className="timeline-list">
            {paginatedNodes.map((node) => (
              <li
                key={node.id}
                className="timeline-item timeline-item--clickable preview-toc-item"
                role="button"
                tabIndex={0}
                onClick={() => onSceneClick && onSceneClick(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSceneClick && onSceneClick(node.id);
                  }
                }}
              >
                <div className="timeline-item-icon">
                  {node.type === "start" ? "▶" : node.type === "ending" ? "🏁" : "•"}
                </div>
                <div className="timeline-item-content">
                  <span className="timeline-item-chapter">{getChapterLabel(node)}</span>
                  <span className="timeline-item-title">
                    {getSceneTitle(node)}
                    {node.type === "ending" && <span className="ending-inline-tag">🏆 ฉากจบ</span>}
                    {isPreview && <span
                      className={`toc-status-badge ${
                        node.computedStatus === "published"
                          ? "toc-status-badge--published"
                          : "toc-status-badge--draft"
                      }`}
                    >
                      {node.computedStatus === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
                    </span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="timeline-pagination">
              <button
                type="button"
                className="timeline-page-btn"
                onClick={goToPrevPage}
                disabled={safePage === 1}
                aria-label="หน้าก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>
              <span className="timeline-page-indicator">
                หน้า {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="timeline-page-btn"
                onClick={goToNextPage}
                disabled={safePage === totalPages}
                aria-label="หน้าถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`novel-timeline-card loading ${className}`}>
        <div className="spinner" />
        <span>กำลังโหลดข้อมูลการอ่าน...</span>
      </div>
    );
  }

  // 🟡 เคสที่ยังไม่เคยอ่านเลย (Empty State)
  if (visitedNodes.length === 0 && !isPreview) {
    return (
      <div className={`novel-timeline-card empty-state ${className}`}>
        <div className="empty-state-content">
          <div className="empty-icon">📖</div>
          <div>
            <h4 className="empty-title">คุณยังไม่ได้เริ่มอ่านนิยายเรื่องนี้</h4>
            <p className="empty-subtitle">เริ่มอ่านเพื่อค้นหาทางเลือกและปลดล็อกฉากต่างๆ</p>
          </div>
        </div>
        <div className="timeline-actions-row">
          <button
            type="button"
            className="btn-continue-read primary"
            onClick={() => handleContinueClick()}
            disabled={navLoading}
          >
            {navLoading ? "กำลังเปิดฉาก..." : "เริ่มอ่านตอนแรก →"}
          </button>
          <button type="button" className="btn-view-map" onClick={onStoryMapClick}>
            แผนผังการอ่าน →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`novel-timeline-card ${className}`}>
      {isPreview && (
        <div style={{ background: "#fef3c7", color: "#92400e", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "bold", textAlign: "center" }}>
          👁️ โหมดตัวอย่างสำหรับนักเขียน (Preview Mode)
        </div>
      )}

      {/* อ่านล่าสุด */}
      <div className="timeline-latest-box">
        <div className="timeline-latest-info">
          <span className="timeline-label">อ่านล่าสุด</span>
          <h4 className="timeline-title">
            <span className="timeline-chapter">{getChapterLabel(latestNode)} · </span>
            {getSceneTitle(latestNode)}
            {latestNode?.type === "ending" && <span className="ending-badge">🏆 ฉากจบ</span>}
          </h4>
        </div>
        <div className="timeline-latest-actions">
          <div className="timeline-stats">
            <strong>{visitedNodes.length}</strong> 
            <span>ฉากที่ค้นพบ</span>
          </div>
          <button
            type="button"
            className="btn-continue-read"
            onClick={() => handleContinueClick(latestNode?.id)}
            disabled={navLoading}
          >
            {navLoading ? "กำลังเปิดฉาก..." : "อ่านต่อ →"}
          </button>
        </div>
      </div>

      {/* รายการฉากที่ค้นพบ */}
      <div className="timeline-list-section">
        <div className="timeline-header-flex">
          <div>
            <h3 className="timeline-section-title">จุดที่ค้นพบ</h3>
            <p className="timeline-section-subtitle">เรื่องราวที่เปิดเผยในเส้นทางของคุณ</p>
          </div>
          <span className="timeline-count-badge">{visitedNodes.length} ฉาก</span>
        </div>
        
        <ul className="timeline-list">
          {paginatedNodes.map((node) => {
            const isCurrent = latestNode?.id === node.id;
            return (
              <li
                key={node.id}
                className={`timeline-item timeline-item--clickable ${isCurrent ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (onSceneClick) {
                    onSceneClick(node.id);
                  } else if (onContinueRead) {
                    onContinueRead(node.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (onSceneClick) {
                      onSceneClick(node.id);
                    } else if (onContinueRead) {
                      onContinueRead(node.id);
                    }
                  }
                }}
              >
                <div className="timeline-item-icon">
                  {isCurrent ? <span className="pulse-dot"></span> : "✓"}
                </div>
                <div className="timeline-item-content">
                  <span className="timeline-item-chapter">{getChapterLabel(node)}</span>
                  <span className="timeline-item-title">
                    {getSceneTitle(node)}
                    {node.type === "ending" && <span className="ending-inline-tag">🏆 ฉากจบ</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {totalPages > 1 && (
          <div className="timeline-pagination">
            <button
              type="button"
              className="timeline-page-btn"
              onClick={goToPrevPage}
              disabled={safePage === 1}
              aria-label="หน้าก่อนหน้า"
            >
              ← ก่อนหน้า
            </button>
            <span className="timeline-page-indicator">
              หน้า {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="timeline-page-btn"
              onClick={goToNextPage}
              disabled={safePage === totalPages}
              aria-label="หน้าถัดไป"
            >
              ถัดไป →
            </button>
          </div>
        )}

        <div className="timeline-actions-row">
          <button type="button" className="btn-view-map" onClick={onStoryMapClick}>
            แผนผังการอ่าน →
          </button>
          {!effectiveIsAdmin && (
            <button type="button" className="btn-ending-collection" onClick={onEndingCollectionClick}>
              🏆 คลังฉากจบ
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NovelProgressBar;