import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  Handle,
  Position,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from "reactflow";
import { ArrowLeft, ChevronUp, ChevronDown, Info, Palette, Flame, GitFork, Eye, AlertTriangle, AlertCircle, Users, Trophy, Lock, BookOpen, FileText, Sparkles, Layers, RefreshCw, BarChart2, X } from "lucide-react";
import axios from "axios";
import "reactflow/dist/style.css";
import "./StatisticsGraph.css";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 118;
const NODE_HORIZONTAL_GAP = 360;
const NODE_VERTICAL_GAP = 250;
const CANVAS_MARGIN = 80;

const VISITOR_SHADES = {
  HIGH: { bg: "#F3B7D2", border: "#D95791", text: "#54213A", label: "ผู้ชมมาก" },
  MEDIUM: { bg: "#F9D7E6", border: "#E9A5C3", text: "#63364B", label: "ผู้ชมปานกลาง" },
  LOW: { bg: "#FFF2F8", border: "#EBCBD9", text: "#704C5D", label: "ผู้ชมน้อย" },
};

// ---------------------------------------------------------------------------
// Formatters and Safety Helpers (Requirement 7)
// ---------------------------------------------------------------------------
const formatNumber = (val) => {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return "-";
  return num.toLocaleString();
};

const formatPercentage = (val) => {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return "-";
  return `${Math.round(num)}%`;
};

const getErrorMessage = (err, fallback = "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง") => {
  if (!err) return fallback;
  if (axios.isCancel(err)) return null;

  const status = err.response?.status;
  if (status === 403) {
    return "forbidden";
  }

  const rawMsg =
    err.response?.data?.error?.message ||
    (typeof err.response?.data?.error === "string" ? err.response?.data?.error : null) ||
    err.response?.data?.message ||
    err.message ||
    fallback;

  if (typeof rawMsg === "string" && rawMsg.toLowerCase().includes("forbidden")) {
    return "forbidden";
  }

  return rawMsg;
};

const normalizeId = (value) => {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
};

const stripHtml = (value) => {
  if (typeof value !== "string" || !value) return "";
  let text = value;
  if (typeof document !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(value, "text/html");
      text = doc.body.textContent || doc.body.innerText || "";
    } catch {
      text = value.replace(/<[^>]+>/g, " ");
    }
  } else {
    text = value.replace(/<[^>]+>/g, " ");
  }

  return text
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
};

const getEndingTypeColor = (typeStr) => {
  if (!typeStr || typeof typeStr !== "string") return "#64748b";
  const cleanType = typeStr.trim().toLowerCase();
  
  if (cleanType.includes("true")) return "#10b981";
  if (cleanType.includes("happy") || cleanType.includes("good")) return "#059669";
  if (cleanType.includes("bad") || cleanType.includes("worst") || cleanType.includes("dead")) return "#ef4444";
  if (cleanType.includes("normal") || cleanType.includes("neutral")) return "#3b82f6";
  if (cleanType.includes("secret") || cleanType.includes("special") || cleanType.includes("hidden")) return "#8b5cf6";
  if (cleanType.includes("alt") || cleanType.includes("other")) return "#d97706";

  const palette = [
    "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#d97706",
    "#06b6d4", "#ec4899", "#6366f1", "#14b8a6", "#eab308"
  ];
  let hash = 0;
  for (let i = 0; i < cleanType.length; i++) {
    hash = cleanType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
};

const getNodeId = (node) => normalizeId(node?.ID ?? node?.id ?? node?.SceneID ?? node?.scene_id);
const isPublishedSceneAndChapter = (node) => {
  const status = String(node?.status ?? node?.Status ?? "").trim().toLowerCase();
  const isPub = node?.is_published ?? node?.IsPublished ?? node?.isPublished;
  return status === "published" || isPub === true || isPub === 1 || String(isPub).toLowerCase() === "true";
};
const isReaderAccessibleNovel = (novel) => {
  if (!novel) return false;
  const status = String(novel?.status ?? novel?.Status ?? "").trim().toLowerCase();
  const isPub = novel?.is_published ?? novel?.IsPublished;
  const isPublished = isPub === true || isPub === 1 || String(isPub).toLowerCase() === "true" || status === "published";
  const isBan = novel?.is_banned ?? novel?.IsBanned;
  const isBanned = isBan === true || isBan === 1 || String(isBan).toLowerCase() === "true" || status === "suspended" || status === "banned";
  return isPublished && !isBanned;
};

const getNodeType = (node) => {
  const type = stripHtml((node?.Type ?? node?.type ?? "")).toLowerCase();
  if (type === "start" || type === "starting" || node?.is_start_scene || node?.isStart || node?.isStartScene) {
    return "start";
  }
  if (type === "ending" || type === "end" || Boolean(node?.ending_title || node?.EndingTitle || node?.endingTitle || node?.isEnding)) {
    return "ending";
  }
  return "normal";
};

const getNodeTitle = (node) => stripHtml(node?.Title || node?.title || node?.Label || node?.label || `ฉากที่ ${getNodeId(node)}`);
const getNodeChapter = (node) => stripHtml(node?.ChapterTitle || node?.chapter_title || node?.chapter || node?.chapterName || node?.chapter_name || "");

// 🟢 Custom Node Component (AnalyticsNode)
const AnalyticsNode = ({ data }) => {
  const isSelected = data.isSelected;
  const isEnding = data.isEnding;
  const isMaxDrop = !isEnding && Boolean(data.isMaxDrop);
  const isHighExit = !isEnding && !isMaxDrop && Number(data.exitRate) >= 25;
  
  let shade = VISITOR_SHADES.LOW;
  if (data.visitors >= (data.highMax || 1600)) shade = VISITOR_SHADES.HIGH;
  else if (data.visitors >= (data.midMax || 800)) shade = VISITOR_SHADES.MEDIUM;

  const accentColor = isSelected ? "#D95791" : (isMaxDrop ? "#E11D48" : (isHighExit ? "#F59E0B" : shade.border));

  const nodeStyle = {
    backgroundColor: shade.bg,
    color: shade.text,
    position: "relative",
    borderColor: accentColor,
    borderWidth: isSelected ? "2.5px" : (isMaxDrop || isHighExit ? "2px" : "1.5px"),
  };

  return (
    <div
      className={`wsg-flow-node ${isMaxDrop ? "max-drop" : (isHighExit ? "high-exit" : "")} ${
        isSelected ? "active-selection" : ""
      } ${data.hasActiveSelection && !isSelected ? "dimmed" : ""}`}
      style={nodeStyle}
    >
      <Handle type="target" position={Position.Top} style={{ background: accentColor, width: 8, height: 8 }} />

      {/* 1. แถวบน: Capsule Pill ฉากทางซ้าย + Capsule Pill ระดับผู้ชมทางขวา */}
      <div className="wsg-node-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        {/* ฉากที่ X.X (ปรับระยะ padding และ line-height เพื่อจัดให้อยู่กึ่งกลางแนวตั้งพอดีช่อง) */}
        <span 
          style={{ 
            backgroundColor: "#ffffff",
            border: `1.5px solid ${shade.border}`,
            color: shade.text,
            fontSize: "0.76rem", 
            fontWeight: 800, 
            padding: "4px 10px 2px 10px",
            borderRadius: "16px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            lineHeight: 1.25
          }}
        >
          {data.labelNum || "ฉากนิยาย"}
        </span>

        {/* ป้ายบอกระดับผู้ชม (ผู้ชมมาก / ผู้ชมปานกลาง / ผู้ชมน้อย) */}
        <span 
          style={{ 
            backgroundColor: "rgba(255, 255, 255, 0.65)",
            color: shade.text,
            fontSize: "0.72rem", 
            fontWeight: 700, 
            padding: "3px 10px",
            borderRadius: "16px",
            display: "inline-flex",
            alignItems: "center",
            lineHeight: 1,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
          }}
        >
          {shade.label}
        </span>
      </div>
      
      {/* 2. ส่วนกลาง: ชื่อฉาก + ตัวอย่างเนื้อหา (รองรับ React Quill HTML / Unescape &nbsp;) */}
      <div style={{ marginBottom: "8px" }}>
        <h4 
          className="wsg-node-title" 
          title={data.title} 
          style={{ 
            color: shade.text, 
            fontWeight: 800, 
            fontSize: "0.95rem", 
            margin: "0 0 3px 0",
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {data.title || "ไม่มีชื่อฉาก"}
        </h4>

        <p 
          style={{ 
            margin: 0, 
            fontSize: "0.74rem", 
            color: shade.text, 
            opacity: 0.7,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={data.preview || "ไม่มีข้อความตัวอย่างเนื้อหา"}
        >
          {data.preview || "ไม่มีข้อความตัวอย่างเนื้อหา"}
        </p>
      </div>
      
      {/* 3. เส้นแบ่งแนวนอนเรียบเนียน (ลบเส้นประออก) */}
      <div style={{ borderTop: "1px solid rgba(84, 33, 58, 0.12)", margin: "6px 0 8px 0" }} />

      {/* 4. แถวล่าง: [ 👁️ ผู้ชม 1,203 ]  |  [ Exit Rate: สัญลักษณ์แจ้งเตือน + % ] */}
      <div 
        className="wsg-node-stats" 
        style={{ 
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: shade.text, 
          fontSize: "0.78rem"
        }}
      >
        {/* ด้านซ้าย: 👁️ ผู้ชม 1,203 */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", lineHeight: 1 }}>
          <Eye size={15} strokeWidth={2.2} style={{ color: shade.text, opacity: 0.85, flexShrink: 0, display: "block" }} />
          <span style={{ opacity: 0.8, fontWeight: 600, fontSize: "0.76rem", lineHeight: 1, display: "inline-block" }}>ผู้ชม</span>
          <strong style={{ color: shade.text, fontWeight: 800, fontSize: "0.85rem", lineHeight: 1, display: "inline-block" }}>
            {formatNumber(data.visitors)}
          </strong>
        </div>

        {/* เส้นแบ่งแนวตั้งกลางแถวล่าง */}
        <div 
          style={{ 
            width: "1px", 
            height: "16px", 
            backgroundColor: "rgba(84, 33, 58, 0.18)",
            margin: "0 6px"
          }} 
        />

        {/* ด้านขวา: Exit Rate + สัญลักษณ์แจ้งเตือนหลังคำว่า Exit Rate */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ opacity: 0.8, fontWeight: 600 }}>Exit Rate</span>

          {/* สัญลักษณ์แจ้งเตือน ออกสูงสุด (🔥) หลังคำว่า Exit Rate */}
          {isMaxDrop && (
            <span 
              style={{ 
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                backgroundColor: "#E11D48",
                color: "#ffffff",
                padding: "1px 6px",
                borderRadius: "10px",
                fontSize: "0.7rem",
                fontWeight: 800,
                boxShadow: "0 2px 5px rgba(225, 29, 72, 0.3)"
              }}
              title={`ฉากที่มีอัตราผู้ชมออกสูงสุด: ${formatPercentage(data.exitRate)}`}
            >
              <Flame size={11} strokeWidth={2.5} color="#ffffff" style={{ flexShrink: 0 }} />
              <span>{formatPercentage(data.exitRate)}</span>
            </span>
          )}

          {/* สัญลักษณ์แจ้งเตือน ออกสูง ≥25% (⚠️) หลังคำว่า Exit Rate */}
          {isHighExit && (
            <span 
              style={{ 
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                backgroundColor: "#F59E0B",
                color: "#ffffff",
                padding: "1px 6px",
                borderRadius: "10px",
                fontSize: "0.7rem",
                fontWeight: 800,
                boxShadow: "0 2px 5px rgba(245, 158, 11, 0.3)"
              }}
              title={`จุดที่มีอัตราผู้ชมออกจากฉากสูง (≥25%): ${formatPercentage(data.exitRate)}`}
            >
              <AlertTriangle size={10} strokeWidth={2.5} color="#ffffff" style={{ flexShrink: 0 }} />
              <span>{formatPercentage(data.exitRate)}</span>
            </span>
          )}

          {/* กรณี Exit Rate ปกติ (<25%) */}
          {!isMaxDrop && !isHighExit && (
            <strong style={{ color: shade.text, fontWeight: 800, fontSize: "0.88rem" }}>
              {isEnding ? "-" : formatPercentage(data.exitRate)}
            </strong>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: accentColor, width: 8, height: 8 }} />
    </div>
  );
};

let cachedAnalyticsPathElement = null;
const getPointOnAnalyticsSvgPath = (pathD, ratio = 0.5) => {
  if (typeof document === "undefined" || !pathD) return null;
  try {
    if (!cachedAnalyticsPathElement) {
      cachedAnalyticsPathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    }
    cachedAnalyticsPathElement.setAttribute("d", pathD);
    const totalLen = cachedAnalyticsPathElement.getTotalLength();
    if (!totalLen || isNaN(totalLen)) return null;
    const pt = cachedAnalyticsPathElement.getPointAtLength(totalLen * ratio);
    return { x: pt.x, y: pt.y, totalLen };
  } catch (e) {
    return null;
  }
};

// 🟢 Custom Edge Component (AnalyticsEdge) - จัดวางข้อความทางเลือกให้อยู่ในช่องข้อความบนเส้นเชื่อม 100%
const AnalyticsEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  data,
  selected,
}) => {
  const outIndex = data?.outIndex ?? 0;
  const outCount = data?.outCount ?? 1;
  const inIndex = data?.inIndex ?? 0;
  const inCount = data?.inCount ?? 1;
  const allEdges = data?.allEdges || [];
  const allNodes = data?.allNodes || [];
  const source = data?.source;
  const target = data?.target;

  let adjustedSourceX = sourceX;
  let adjustedTargetX = targetX;

  if (outCount > 1) {
    const maxWidth = Math.min(180, (outCount - 1) * 36);
    const step = maxWidth / (outCount - 1);
    adjustedSourceX = (sourceX - maxWidth / 2) + outIndex * step;
  }

  if (inCount > 1) {
    const maxWidth = Math.min(180, (inCount - 1) * 36);
    const step = maxWidth / (inCount - 1);
    adjustedTargetX = (targetX - maxWidth / 2) + inIndex * step;
  }

  const samePairEdges = allEdges.filter(
    (e) => String(e.source) === String(source) && String(e.target) === String(target)
  );
  const pairIndex = samePairEdges.findIndex((e) => String(e.id) === String(id));
  const pairCount = samePairEdges.length;

  const baseOffset = 28;
  const outStep = 32;
  const pairStep = 32;
  const edgeOffset = baseOffset + (outIndex * outStep) + ((pairIndex > 0 ? pairIndex : 0) * pairStep);

  const [edgePath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX: adjustedSourceX,
    sourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY,
    targetPosition,
    borderRadius: 14,
    offset: edgeOffset,
  });

  const badgeWidth = 140;
  const badgeHeight = 24;

  let baseRatio = 0.5;
  if (outCount > 1) {
    const step = 0.48 / Math.max(1, outCount - 1);
    baseRatio = 0.26 + outIndex * step;
  } else if (pairCount > 1) {
    const step = 0.48 / Math.max(1, pairCount - 1);
    baseRatio = 0.26 + pairIndex * step;
  }

  const candidateRatios = [
    baseRatio,
    baseRatio - 0.06, baseRatio + 0.06,
    baseRatio - 0.12, baseRatio + 0.12,
    baseRatio - 0.18, baseRatio + 0.18,
    0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75
  ].filter((r) => r >= 0.12 && r <= 0.88);

  let labelX = defaultLabelX;
  let labelY = defaultLabelY;
  let selectedPt = null;

  const isPointInsideAnyNode = (px, py) => {
    for (const node of allNodes) {
      const nx = node.position?.x ?? node.x ?? 0;
      const ny = node.position?.y ?? node.y ?? 0;

      const left = nx - 10 - badgeWidth / 2;
      const right = nx + 260 + 10 + badgeWidth / 2;
      const top = ny - 10 - badgeHeight / 2;
      const bottom = ny + 118 + 10 + badgeHeight / 2;

      if (px >= left && px <= right && py >= top && py <= bottom) {
        return true;
      }
    }
    return false;
  };

  for (const ratio of candidateRatios) {
    const pt = getPointOnAnalyticsSvgPath(edgePath, ratio);
    if (pt) {
      if (!isPointInsideAnyNode(pt.x, pt.y)) {
        selectedPt = pt;
        break;
      }
      if (!selectedPt) selectedPt = pt;
    }
  }

  if (selectedPt) {
    labelX = selectedPt.x;
    labelY = selectedPt.y;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            <div 
              className={`wsg-edge-label-wrap ${selected ? "highlighted" : ""}`}
              style={{
                backgroundColor: "#ffffff",
                border: `1.5px solid ${style.stroke || "#64748b"}`,
                borderRadius: "10px",
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#1e293b",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                whiteSpace: "nowrap",
                maxWidth: "260px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
              }}
              title={typeof label === "string" ? label : undefined}
            >
              {label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const getSceneTypeBadge = (typeStr) => {
  const type = stripHtml(typeStr || "").toLowerCase();
  
  const isStart = type === "start" || type === "starting" || type.includes("เริ่มต้น");
  const isEnding = type === "ending" || type === "end" || type.includes("จบ");

  const typeLabel = isStart ? "จุดเริ่มต้น"
    : isEnding ? "ฉากจบ"
      : "ฉากทั่วไป";

  const typeColor = isStart ? "#16A34A"
    : isEnding ? "#EF4444"
      : "#38BDF8";

  const typeBgColor = isStart ? "#DCFCE7"
    : isEnding ? "#FEE2E2"
      : "#E0F2FE";

  const typeIcon = isStart ? "▶"
    : isEnding ? "🏆"
      : "📖";

  return (
    <span 
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 8px",
        borderRadius: "12px",
        backgroundColor: typeBgColor,
        color: typeColor,
        fontSize: "0.75rem",
        fontWeight: 700,
        marginLeft: "8px",
        verticalAlign: "middle"
      }}
    >
      <span>{typeIcon}</span>
      <span>{typeLabel}</span>
    </span>
  );
};

const nodeTypes = {
  analyticsNode: AnalyticsNode,
};

const edgeTypes = {
  analyticsEdge: AnalyticsEdge,
};

function StatisticsGraph() {
  const { novelId } = useParams();
  const navigate = useNavigate();
  
  const [novelTitle, setNovelTitle] = useState("นิยายของฉัน");
  const [treeData, setTreeData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [isNovelReaderAccessible, setIsNovelReaderAccessible] = useState(false);
  
  // Analytics States
  const [overallAnalytics, setOverallAnalytics] = useState(null);
  const [sceneAnalytics, setSceneAnalytics] = useState(null);
  const [choiceAnalytics, setChoiceAnalytics] = useState(null);
  const [allScenesAnalytics, setAllScenesAnalytics] = useState([]);
  
  // Requirement 2: Edge Analytics State & Status
  const [edgeAnalytics, setEdgeAnalytics] = useState([]);
  const [isEdgeLoading, setIsEdgeLoading] = useState(true);
  const [edgeError, setEdgeError] = useState(null);

  const [isSceneLoading, setIsSceneLoading] = useState(false);
  const [isChoiceLoading, setIsChoiceLoading] = useState(false);
  const [sceneError, setSceneError] = useState(null);
  const [choiceError, setChoiceError] = useState(null);
  
  // Abort Controllers & Request Sequence ID
  const sceneRequestIdRef = useRef(0);
  const mainAbortRef = useRef(null);
  const sceneAbortRef = useRef(null);
  
  // Selection
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("scene");
  const [highlightedChoiceId, setHighlightedChoiceId] = useState(null);
  const [hasInteractedWithNode, setHasInteractedWithNode] = useState(false);

  // Legend & Modal Popup States
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [isModalDismissed, setIsModalDismissed] = useState(false);

  useEffect(() => {
    setIsDataLoaded(false);
    setIsModalDismissed(false);
  }, [novelId]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      if (mainAbortRef.current) mainAbortRef.current.abort();
      if (sceneAbortRef.current) sceneAbortRef.current.abort();
    };
  }, []);

  // Fetch Data (Story Tree + Overall Analytics + All Scenes Analytics + Edge Analytics)
  // Requirements 1, 2 & 5: Pass JWT token header to all requests & use Promise.allSettled
  const fetchData = useCallback(async () => {
    if (!novelId) return;

    if (mainAbortRef.current) {
      mainAbortRef.current.abort();
    }
    const controller = new AbortController();
    mainAbortRef.current = controller;

    setIsLoading(true);
    setIsDataLoaded(false);
    setError(null);
    setIsEdgeLoading(true);
    setEdgeError(null);
    setIsNovelReaderAccessible(false);

    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Requirement 1 & 2: Send token to all requests including story-tree and new edge analytics
      const [treeSettled, analyticsSettled, scenesAnalyticsSettled, edgeAnalyticsSettled, novelsSettled] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree`, { headers, signal: controller.signal }),
        axios.get(`${API_BASE_URL}/api/v1/writer/novels/${novelId}/analytics`, { headers, signal: controller.signal }),
        axios.get(`${API_BASE_URL}/api/v1/writer/novels/${novelId}/analytics/scenes`, { headers, signal: controller.signal }),
        axios.get(`${API_BASE_URL}/api/v1/writer/novels/${novelId}/analytics/edges`, { headers, signal: controller.signal }),
        axios.get(`${API_BASE_URL}/api/me/novels`, { headers, signal: controller.signal }),
      ]);

      if (controller.signal.aborted || mainAbortRef.current !== controller) {
        return;
      }
      
      // Process story tree
      if (treeSettled.status === "fulfilled") {
        const tree = treeSettled.value.data?.data || treeSettled.value.data || null;
        setTreeData(tree);
        const title = tree?.NovelTitle || tree?.novel_title;
        if (title) setNovelTitle(title);
      } else {
        if (!axios.isCancel(treeSettled.reason)) {
          console.error("Story tree fetch error:", treeSettled.reason);
          setError(getErrorMessage(treeSettled.reason, "ไม่สามารถดึงข้อมูลโครงสร้างนิยายได้"));
        }
      }

      // Process overall analytics (Requirement 5: Failure won't break tree)
      if (analyticsSettled.status === "fulfilled") {
        setOverallAnalytics(analyticsSettled.value.data?.data || analyticsSettled.value.data || null);
      } else {
        if (!axios.isCancel(analyticsSettled.reason)) {
          console.warn("Overall analytics fetch warning:", analyticsSettled.reason);
        }
      }

      // Process all scenes analytics
      if (scenesAnalyticsSettled.status === "fulfilled") {
        setAllScenesAnalytics(scenesAnalyticsSettled.value.data?.data || scenesAnalyticsSettled.value.data || []);
      } else {
        if (!axios.isCancel(scenesAnalyticsSettled.reason)) {
          console.warn("Scenes analytics fetch warning:", scenesAnalyticsSettled.reason);
        }
      }

      // Requirement 2 & 5: Process edge analytics (Failure won't break graph)
      if (edgeAnalyticsSettled.status === "fulfilled") {
        const edgeList = edgeAnalyticsSettled.value.data?.data || edgeAnalyticsSettled.value.data || [];
        setEdgeAnalytics(Array.isArray(edgeList) ? edgeList : []);
      } else {
        if (!axios.isCancel(edgeAnalyticsSettled.reason)) {
          console.warn("Edge analytics fetch warning:", edgeAnalyticsSettled.reason);
          setEdgeError(getErrorMessage(edgeAnalyticsSettled.reason, "ไม่สามารถโหลดสถิติเส้นเชื่อมได้"));
        }
      }

      if (novelsSettled.status === "fulfilled") {
        const rawNovelsData = novelsSettled.value.data;
        const responseData = rawNovelsData?.data || rawNovelsData || {};
        const novels = Array.isArray(rawNovelsData)
          ? rawNovelsData
          : Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.novels)
          ? responseData.novels
          : Array.isArray(rawNovelsData?.novels)
          ? rawNovelsData.novels
          : [];
        const currentNovel = Array.isArray(novels)
          ? novels.find((novel) => normalizeId(novel?.novel_id ?? novel?.ID ?? novel?.id) === normalizeId(novelId))
          : null;
        let accessible = isReaderAccessibleNovel(currentNovel);
        if (!accessible && currentNovel === null) {
          const tree = treeSettled.status === "fulfilled" ? (treeSettled.value.data?.data || treeSettled.value.data) : null;
          if (tree && isReaderAccessibleNovel(tree)) {
            accessible = true;
          } else if (scenesAnalyticsSettled.status === "fulfilled" && ((Array.isArray(scenesAnalyticsSettled.value.data?.data) && scenesAnalyticsSettled.value.data.data.length > 0) || (Array.isArray(scenesAnalyticsSettled.value.data) && scenesAnalyticsSettled.value.data.length > 0))) {
            accessible = true;
          }
        }
        setIsNovelReaderAccessible(accessible);
      } else if (!axios.isCancel(novelsSettled.reason)) {
        const hasAnalyticsData = scenesAnalyticsSettled.status === "fulfilled" || analyticsSettled.status === "fulfilled";
        if (hasAnalyticsData) {
          setIsNovelReaderAccessible(true);
        } else {
          console.error("Novel publication status fetch error:", novelsSettled.reason);
          setError(getErrorMessage(novelsSettled.reason, "ไม่สามารถตรวจสอบสถานะการเผยแพร่นิยายได้"));
        }
      }
    } catch (err) {
      if (controller.signal.aborted || mainAbortRef.current !== controller) return;
      if (!axios.isCancel(err)) {
        console.error("Error fetching analytics data:", err);
        setError(getErrorMessage(err, "ไม่สามารถดึงข้อมูลนิยายและสถิติได้ กรุณาลองใหม่อีกครั้ง"));
      }
    } finally {
      if (!controller.signal.aborted && mainAbortRef.current === controller) {
        setIsLoading(false);
        setIsEdgeLoading(false);
        setIsDataLoaded(true);
      }
    }
  }, [novelId]);

  // Requirement 1 & 6: Fetch Scene Details with JWT token & immediate state reset / cancellation
  const fetchSceneDetails = useCallback(async (sceneId) => {
    if (!novelId || !sceneId) return;

    if (sceneAbortRef.current) {
      sceneAbortRef.current.abort();
    }
    const controller = new AbortController();
    sceneAbortRef.current = controller;

    const requestId = sceneRequestIdRef.current + 1;
    sceneRequestIdRef.current = requestId;

    // Requirement 6: Clear previous scene data immediately to prevent stale data display
    setSceneAnalytics(null);
    setChoiceAnalytics(null);
    setSceneError(null);
    setChoiceError(null);
    setIsSceneLoading(true);
    setIsChoiceLoading(true);
    
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [sceneSettled, choiceSettled] = await Promise.allSettled([
        axios.get(
          `${API_BASE_URL}/api/v1/writer/novels/${novelId}/analytics/scenes/${sceneId}`,
          { headers, signal: controller.signal }
        ),
        axios.get(
          `${API_BASE_URL}/api/v1/writer/novels/${novelId}/analytics/scenes/${sceneId}/choices`,
          { headers, signal: controller.signal }
        )
      ]);

      if (sceneRequestIdRef.current === requestId) {
        const sceneWasUnpublished = sceneSettled.status === "rejected" && sceneSettled.reason?.response?.status === 404;
        const choicesWereUnpublished = choiceSettled.status === "rejected" && choiceSettled.reason?.response?.status === 404;
        if (sceneSettled.status === "fulfilled") {
          setSceneAnalytics(sceneSettled.value.data?.data || sceneSettled.value.data || null);
        } else {
          if (!axios.isCancel(sceneSettled.reason)) {
            console.error("Error fetching scene analytics:", sceneSettled.reason);
            setSceneAnalytics(null);
            setSceneError(sceneWasUnpublished
              ? "ฉากนี้ไม่พร้อมใช้งานสำหรับ Analytics แล้ว"
              : getErrorMessage(sceneSettled.reason, "ไม่สามารถโหลดสถิติฉากนี้ได้"));
          }
        }

        if (choiceSettled.status === "fulfilled") {
          setChoiceAnalytics(choiceSettled.value.data?.data || choiceSettled.value.data || null);
        } else {
          if (!axios.isCancel(choiceSettled.reason)) {
            console.error("Error fetching choice analytics:", choiceSettled.reason);
            setChoiceAnalytics(null);
            setChoiceError(choicesWereUnpublished
              ? "ฉากนี้ไม่พร้อมใช้งานสำหรับ Analytics แล้ว"
              : getErrorMessage(choiceSettled.reason, "ไม่สามารถโหลดสถิติทางเลือกของฉากนี้ได้"));
          }
        }
        if (sceneWasUnpublished || choicesWereUnpublished) {
          fetchData();
        }
      }
    } catch (err) {
      if (!axios.isCancel(err) && sceneRequestIdRef.current === requestId) {
        console.error("Error in scene details request:", err);
      }
    } finally {
      if (sceneRequestIdRef.current === requestId) {
        setIsSceneLoading(false);
        setIsChoiceLoading(false);
      }
    }
  }, [novelId, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rawNodes = useMemo(() => {
    if (Array.isArray(treeData)) return treeData;
    return treeData?.Nodes ?? treeData?.nodes ?? treeData?.data?.nodes ?? [];
  }, [treeData]);

  // ใช้รายการ Scene และ Edge จาก Analytics API ซึ่ง Backend กรอง Reachability ตาม Reader Flow แล้ว
  // เพื่อไม่คำนวณหรือทำซ้ำกติกา Reachability ในหน้า Analytics
  const reachableSceneIds = useMemo(
    () => new Set((Array.isArray(allScenesAnalytics) ? allScenesAnalytics : [])
      .map((scene) => normalizeId(scene?.scene_id ?? scene?.SceneID ?? scene?.id ?? scene?.ID))
      .filter(Boolean)),
    [allScenesAnalytics]
  );

  const uniqueNodes = useMemo(() => {
    const seen = new Set();
    if (!isNovelReaderAccessible) return [];
    const hasReachabilityData = reachableSceneIds.size > 0;
    return rawNodes.filter((scene) => {
      const id = getNodeId(scene);
      if (!id || seen.has(id) || !isPublishedSceneAndChapter(scene)) return false;
      if (hasReachabilityData && !reachableSceneIds.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [rawNodes, isNovelReaderAccessible, reachableSceneIds]);

  const analyticsEdges = useMemo(() => {
    const publishedNodeIds = new Set(uniqueNodes.map(getNodeId));
    return (Array.isArray(edgeAnalytics) ? edgeAnalytics : [])
      .map((edge, index) => {
        const source = normalizeId(edge?.from_scene_id ?? edge?.FromSceneID);
        const target = normalizeId(edge?.to_scene_id ?? edge?.ToSceneID);
        return {
          id: normalizeId(edge?.choice_id ?? edge?.ChoiceID ?? `edge-${source}-${target}-${index}`),
          source,
          target,
          label: edge?.choice_label ?? edge?.ChoiceLabel ?? "",
          data: edge,
        };
      })
      .filter((edge) => publishedNodeIds.has(edge.source) && publishedNodeIds.has(edge.target));
  }, [edgeAnalytics, uniqueNodes]);

  useEffect(() => {
    if (selectedSceneId && uniqueNodes.some((node) => getNodeId(node) === selectedSceneId)) {
      fetchSceneDetails(selectedSceneId);
    } else {
      if (sceneAbortRef.current) {
        sceneAbortRef.current.abort();
      }
      sceneRequestIdRef.current += 1;
      // Requirement 6: Reset scene analytics state when scene selection is cleared
      setSceneAnalytics(null);
      setChoiceAnalytics(null);
      setSceneError(null);
      setChoiceError(null);
      setIsSceneLoading(false);
      setIsChoiceLoading(false);
    }

    return () => {
      if (sceneAbortRef.current) {
        sceneAbortRef.current.abort();
      }
      sceneRequestIdRef.current += 1;
    };
  }, [selectedSceneId, fetchSceneDetails, uniqueNodes]);

  // Map display layout - chapter grouping
  const chapterAndSceneDisplayMap = useMemo(() => {
    if (!uniqueNodes.length) return new Map();

    const chapterGroups = new Map();
    const chapterOrder = [];
    uniqueNodes.forEach((scene) => {
      const chapter = getNodeChapter(scene) || "อื่นๆ";
      if (!chapterGroups.has(chapter)) {
        chapterGroups.set(chapter, []);
        chapterOrder.push(chapter);
      }
      chapterGroups.get(chapter).push(scene);
    });

    const displayMap = new Map();
    chapterOrder.forEach((chapter, chapterIndex) => {
      chapterGroups.get(chapter).forEach((scene, sceneIndex) => {
        const id = getNodeId(scene);
        if (id) {
          displayMap.set(id, {
            display: `ฉากที่ ${chapterIndex + 1}.${sceneIndex + 1}`,
            chapterName: chapter || `ตอนที่ ${chapterIndex + 1}`,
            chapterNum: chapterIndex + 1,
            sceneNum: sceneIndex + 1,
          });
        }
      });
    });

    return displayMap;
  }, [uniqueNodes]);

  // Pre-build O(1) lookup maps for analytics data
  const allScenesAnalyticsMap = useMemo(() => {
    const m = new Map();
    if (Array.isArray(allScenesAnalytics)) {
      allScenesAnalytics.forEach((s) => {
        const id = normalizeId(s.scene_id);
        if (id) m.set(id, s);
      });
    }
    return m;
  }, [allScenesAnalytics]);

  const topDropOffMap = useMemo(() => {
    const m = new Map();
    overallAnalytics?.top_drop_off_scenes?.forEach((d) => {
      const id = normalizeId(d.scene_id);
      if (id) m.set(id, d);
    });
    return m;
  }, [overallAnalytics]);

  // Node analytics data mapping
  const nodeAnalyticsMap = useMemo(() => {
    const analytics = new Map();
    
    uniqueNodes.forEach((node) => {
      const id = getNodeId(node);
      if (!id) return;
      
      const type = getNodeType(node);
      
      let visitors = 0;
      let exitRate = 0;

      const sceneData = allScenesAnalyticsMap.get(id);
      if (sceneData) {
        visitors = sceneData.unique_readers ?? 0;
        exitRate = Math.round(Number(sceneData.drop_off_rate ?? 0));
      }

      const dropData = topDropOffMap.get(id);
      if (dropData) {
        visitors = dropData.unique_readers ?? 0;
        exitRate = Math.round(Number(dropData.drop_off_rate ?? 0));
      }

      if (selectedSceneId === id && sceneAnalytics) {
        visitors = sceneAnalytics.unique_readers ?? 0;
        exitRate = Math.round(Number(sceneAnalytics.drop_off_rate ?? 0));
      }

      if (type === "ending" || type === "end") {
        exitRate = 0;
      }

      analytics.set(id, { visitors, exitRate });
    });
    return analytics;
  }, [uniqueNodes, allScenesAnalyticsMap, topDropOffMap, selectedSceneId, sceneAnalytics]);

  // Find the maximum exit rate across all non-ending nodes
  const maxExitRate = useMemo(() => {
    let max = 0;
    uniqueNodes.forEach((node) => {
      const id = getNodeId(node);
      const type = getNodeType(node);
      if (type === "ending" || type === "end") return;
      const analytics = nodeAnalyticsMap.get(id);
      if (analytics && Number(analytics.exitRate) > max) {
        max = Number(analytics.exitRate);
      }
    });
    return max;
  }, [uniqueNodes, nodeAnalyticsMap]);

  // Requirement 3: Build edge analytics maps by choice_id and from_to
  const edgeAnalyticsMap = useMemo(() => {
    const byChoiceId = new Map();
    const byFromTo = new Map();

    if (Array.isArray(edgeAnalytics)) {
      edgeAnalytics.forEach((item) => {
        const cId = normalizeId(item.choice_id ?? item.ChoiceID ?? item.choiceId);
        if (cId) {
          byChoiceId.set(cId, item);
        }
        const fromId = normalizeId(item.from_scene_id ?? item.from_id ?? item.fromSceneId);
        const toId = normalizeId(item.to_scene_id ?? item.to_id ?? item.toSceneId);
        if (fromId && toId) {
          byFromTo.set(`${fromId}->${toId}`, item);
        }
      });
    }

    return { byChoiceId, byFromTo };
  }, [edgeAnalytics]);

  // Position Elements for ReactFlow
  const positionedElements = useMemo(() => {
    if (!uniqueNodes.length) return { nodes: [], edges: [] };

    const nodeIds = uniqueNodes.map((n) => getNodeId(n));
    const localMap = new Map();
    uniqueNodes.forEach((n) => localMap.set(getNodeId(n), n));

    const edgeList = analyticsEdges;

    const adjacency = {};
    const inDegree = {};
    const nodeLevels = {};

    nodeIds.forEach((id) => {
      adjacency[id] = [];
      inDegree[id] = 0;
    });

    edgeList.forEach((edge) => {
      if (edge.source && edge.target && adjacency[edge.source] && inDegree[edge.target] !== undefined) {
        adjacency[edge.source].push(edge.target);
        inDegree[edge.target] += 1;
      }
    });

    const queue = [];
    nodeIds.forEach((id) => {
      const scene = localMap.get(id);
      const type = getNodeType(scene);
      if (type === "start" || type === "starting" || inDegree[id] === 0) {
        nodeLevels[id] = 0;
        queue.push(id);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift();
      const level = nodeLevels[current] ?? 0;
      adjacency[current].forEach((childId) => {
        const offset = (inDegree[childId] >= 3) ? 2 : 1;
        const nextLevel = level + offset;
        if (nodeLevels[childId] === undefined || nodeLevels[childId] > nextLevel) {
          nodeLevels[childId] = nextLevel;
          queue.push(childId);
        }
      });
    }

    const levelsMap = {};
    nodeIds.forEach((id) => {
      const level = nodeLevels[id] ?? 0;
      if (!levelsMap[level]) levelsMap[level] = [];
      levelsMap[level].push(id);
    });

    const positions = {};
    const sortedLevels = Object.keys(levelsMap).map(Number).sort((a, b) => a - b);
    const HORIZONTAL_STEP = NODE_WIDTH + NODE_HORIZONTAL_GAP;
    const VERTICAL_STEP = NODE_HEIGHT + NODE_VERTICAL_GAP;

    if (sortedLevels.length > 0) {
      const level0Ids = levelsMap[0] || [];
      level0Ids.sort();
      const total0 = level0Ids.length;
      const offset0 = ((total0 - 1) * HORIZONTAL_STEP) / 2;
      level0Ids.forEach((id, colIndex) => {
        positions[id] = {
          x: CANVAS_MARGIN + colIndex * HORIZONTAL_STEP - offset0,
          y: CANVAS_MARGIN + 0 * VERTICAL_STEP,
        };
      });
    }

    const parentMap = {};
    nodeIds.forEach((id) => {
      parentMap[id] = [];
    });
    edgeList.forEach((edge) => {
      if (edge.source && edge.target && parentMap[edge.target]) {
        parentMap[edge.target].push(edge.source);
      }
    });

    for (let i = 1; i < sortedLevels.length; i++) {
      const level = sortedLevels[i];
      const ids = levelsMap[level] || [];

      const idealXValues = {};
      ids.forEach((id) => {
        const parents = parentMap[id] || [];
        const activeParents = parents.filter((pId) => positions[pId] !== undefined);
        if (activeParents.length > 0) {
          const sumX = activeParents.reduce((sum, pId) => sum + positions[pId].x, 0);
          idealXValues[id] = sumX / activeParents.length;
        } else {
          idealXValues[id] = 0;
        }
      });

      ids.sort((a, b) => idealXValues[a] - idealXValues[b]);

      const total = ids.length;
      const offset = ((total - 1) * HORIZONTAL_STEP) / 2;
      ids.forEach((id, colIndex) => {
        positions[id] = {
          x: CANVAS_MARGIN + colIndex * HORIZONTAL_STEP - offset,
          y: CANVAS_MARGIN + level * VERTICAL_STEP,
        };
      });
    }

    const allY = Object.values(positions).map((pos) => pos.y);
    const minY = Math.min(...allY, 0);
    const shiftY = Math.max(CANVAS_MARGIN, CANVAS_MARGIN - minY);

    Object.keys(positions).forEach((sceneId) => {
      positions[sceneId].y += shiftY;
    });

    const finalNodes = [];
    const finalEdges = [];

    const totalVisitors = overallAnalytics?.unique_readers ?? 0;
    const highMax = totalVisitors > 0 ? Math.round(totalVisitors * 0.66) : 1;
    const midMax = totalVisitors > 0 ? Math.round(totalVisitors * 0.33) : 1;

    nodeIds.forEach((sceneId) => {
      const scene = localMap.get(sceneId);
      const position = positions[sceneId] || { x: CANVAS_MARGIN, y: CANVAS_MARGIN };

      const apiX = scene.node_x ?? scene.NodeX;
      const apiY = scene.node_y ?? scene.NodeY;
      const hasSavedPosition = apiX !== null && apiX !== undefined && apiY !== null && apiY !== undefined;

      const finalX = hasSavedPosition ? apiX : (scene.x ?? position.x);
      const finalY = hasSavedPosition ? apiY : (scene.y ?? position.y);

      const pos = chapterAndSceneDisplayMap.get(sceneId);
      const analytics = nodeAnalyticsMap.get(sceneId) || { visitors: 0, exitRate: 0 };
      const isEnding = getNodeType(scene) === "ending";
      const exitRate = analytics.exitRate ?? 0;

      const isMaxDrop = !isEnding && maxExitRate >= 25 && exitRate === maxExitRate;

      const rawContent = scene?.content ?? scene?.Content ?? scene?.summary ?? scene?.Summary ?? scene?.description ?? scene?.Description ?? scene?.preview ?? scene?.Preview ?? "";
      const previewText = stripHtml(rawContent);

      finalNodes.push({
        id: sceneId,
        type: "analyticsNode",
        position: { x: finalX, y: finalY },
        data: {
          title: getNodeTitle(scene),
          preview: previewText,
          labelNum: pos ? pos.display : "ฉากนิยาย",
          visitors: analytics.visitors,
          exitRate: analytics.exitRate,
          isSelected: selectedSceneId === sceneId,
          hasActiveSelection: !!selectedSceneId,
          highMax,
          midMax,
          isMaxDrop,
          type: getNodeType(scene),
          isEnding,
        },
      });
    });

    // Requirements 2, 3 & 4: Process edges with choice_id matching and proper 0% / loading / error / missing state rules
    const outgoingCount = {};
    const incomingCount = {};
    edgeList.forEach((edge) => {
      const src = normalizeId(edge.source);
      const tgt = normalizeId(edge.target);
      outgoingCount[src] = (outgoingCount[src] || 0) + 1;
      incomingCount[tgt] = (incomingCount[tgt] || 0) + 1;
    });

    const outgoingIndex = {};
    const incomingIndex = {};

    edgeList.forEach((edge) => {
      const src = edge.source;
      const tgt = edge.target;
      const normSrc = normalizeId(src);
      const normTgt = normalizeId(tgt);

      const outIdx = outgoingIndex[normSrc] || 0;
      outgoingIndex[normSrc] = outIdx + 1;

      const inIdx = incomingIndex[normTgt] || 0;
      incomingIndex[normTgt] = inIdx + 1;

      const choiceName = edge.label || "";
      const edgeChoiceId = normalizeId(
        edge.data?.choice_id ??
        edge.data?.ChoiceID ??
        edge.data?.ChoiceId ??
        edge.data?.ID ??
        edge.data?.id ??
        edge.choice_id ??
        edge.ChoiceID
      );

      // Requirement 3: Match edge by choice_id first, fallback to from_id + to_id
      let matchedEdge = null;
      if (edgeChoiceId) {
        matchedEdge = edgeAnalyticsMap.byChoiceId.get(edgeChoiceId);
      }
      if (!matchedEdge) {
        matchedEdge = edgeAnalyticsMap.byFromTo.get(`${src}->${tgt}`);
      }

      // Incorporate choiceAnalytics if source scene is selected
      if (selectedSceneId && src === selectedSceneId && choiceAnalytics?.choices) {
        const realChoice = choiceAnalytics.choices.find(
          (c) =>
            (edgeChoiceId && normalizeId(c.choice_id) === edgeChoiceId) ||
            c.label === choiceName
        );
        if (realChoice && realChoice.percentage !== undefined && realChoice.percentage !== null) {
          matchedEdge = {
            ...matchedEdge,
            percentage: realChoice.percentage,
            selection_count: realChoice.selection_count,
          };
        }
      }

      // Requirement 4: Edge percentage displays
      let edgeLabelDisplay = choiceName;
      let strokeWidth = 2.5;
      let strokeColor = "#C9A7B8";
      let hasData = false;
      let pctValue = null;

      if (isEdgeLoading) {
        // API loading -> display "-"
        edgeLabelDisplay = choiceName ? `${choiceName} (-)` : "-";
      } else if (edgeError) {
        // API error -> display "ไม่มีข้อมูล"
        edgeLabelDisplay = choiceName ? `${choiceName} (ไม่มีข้อมูล)` : "ไม่มีข้อมูล";
      } else if (!matchedEdge) {
        // No edge analytics -> display "-"
        edgeLabelDisplay = choiceName ? `${choiceName} (-)` : "-";
      } else {
        // Matched edge exists
        const pct = matchedEdge.percentage;
        if (pct !== undefined && pct !== null && !isNaN(Number(pct))) {
          hasData = true;
          pctValue = Number(pct);
          const formattedPct = formatPercentage(pctValue);
          edgeLabelDisplay = choiceName ? `${choiceName} (${formattedPct})` : formattedPct;

          if (pctValue >= 60) {
            strokeWidth = 3.8;
            strokeColor = "#10B981";
          } else if (pctValue >= 30) {
            strokeWidth = 2.8;
            strokeColor = "#F59E0B";
          } else {
            strokeWidth = 2.0;
            strokeColor = "#64748B";
          }
        } else {
          edgeLabelDisplay = choiceName ? `${choiceName} (-)` : "-";
          strokeColor = "#64748B";
          strokeWidth = 2.0;
        }
      }

      const isConnectedToSelection = selectedSceneId && (src === selectedSceneId || tgt === selectedSceneId);
      if (selectedSceneId) {
        if (!isConnectedToSelection) {
          strokeColor = "#E2E8F0";
          strokeWidth = 1.5;
        }
      }

      finalEdges.push({
        id: edge.id,
        source: src,
        target: tgt,
        label: edgeLabelDisplay,
        type: "analyticsEdge",
        animated: false,
        style: {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
        data: {
          pct: pctValue,
          hasData,
          choiceId: edgeChoiceId,
          allEdges: edgeList,
          allNodes: finalNodes,
          source: src,
          target: tgt,
          outIndex: outIdx,
          outCount: outgoingCount[normSrc] || 1,
          inIndex: inIdx,
          inCount: incomingCount[normTgt] || 1,
        },
      });
    });

    return { nodes: finalNodes, edges: finalEdges };
  }, [uniqueNodes, analyticsEdges, selectedSceneId, chapterAndSceneDisplayMap, nodeAnalyticsMap, edgeAnalyticsMap, overallAnalytics, maxExitRate, isEdgeLoading, edgeError, choiceAnalytics]);

  const [rfNodes, setRfNodes] = useNodesState([]);
  const [rfEdges, setRfEdges] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  useEffect(() => {
    if (treeData) {
      setRfNodes(positionedElements.nodes);
      setRfEdges(positionedElements.edges);
    }
  }, [positionedElements, treeData, setRfNodes, setRfEdges]);

  const hasGraphNodes = Boolean((positionedElements?.nodes?.length > 0) || (rfNodes?.length > 0));
  const displayNodes = rfNodes.length > 0 ? rfNodes : positionedElements.nodes;
  const displayEdges = rfEdges.length > 0 ? rfEdges : positionedElements.edges;

  const onNodeClick = useCallback((event, node) => {
    setHasInteractedWithNode(true);
    setHighlightedChoiceId(null);
    setSelectedSceneId(prev => {
      const next = prev === node.id ? null : node.id;
      if (next) {
        setIsCollapsed(false);
      }
      return next;
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setHighlightedChoiceId(null);
    setSelectedSceneId(null);
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setHasInteractedWithNode(true);
    setHighlightedChoiceId(normalizeId(edge.data?.choiceId ?? edge.data?.ID ?? edge.data?.id) || edge.label || null);
    setSelectedSceneId(edge.source);
    setActiveTab("choice");
    setIsCollapsed(false);
  }, []);

  const focusNode = useCallback((sceneId) => {
    if (!reactFlowInstance || !sceneId) return;

    const targetNode =
      reactFlowInstance.getNode(sceneId) ||
      rfNodes.find((node) => node.id === sceneId) ||
      positionedElements.nodes.find((node) => node.id === sceneId);
    if (!targetNode) return;

    requestAnimationFrame(() => {
      const position = targetNode.positionAbsolute || targetNode.position;
      const width = targetNode.measured?.width || targetNode.width || NODE_WIDTH;
      const height = targetNode.measured?.height || targetNode.height || NODE_HEIGHT;

      reactFlowInstance.setCenter(
        position.x + width / 2,
        position.y + height / 2,
        { zoom: 1.1, duration: 500 }
      );
    });
  }, [reactFlowInstance, rfNodes, positionedElements]);

  const onPreviousSceneClick = useCallback((sceneId) => {
    if (!sceneId) return;
    setHasInteractedWithNode(true);
    setActiveTab("scene");
    setIsCollapsed(false);
    setSelectedSceneId(sceneId);
    focusNode(sceneId);
  }, [focusNode]);

  const onNextSceneClick = useCallback((sceneId) => {
    if (!sceneId) return;
    setHasInteractedWithNode(true);
    setActiveTab("scene");
    setIsCollapsed(false);
    setSelectedSceneId(sceneId);
    focusNode(sceneId);
  }, [focusNode]);

  const onChoiceDestinationClick = useCallback((sceneId) => {
    if (!sceneId) return;
    focusNode(sceneId);
  }, [focusNode]);

  const nextScenesList = useMemo(() => {
    if (!selectedSceneId) return [];
    const publishedNodeIds = new Set(uniqueNodes.map(getNodeId));

    // 1. Direct from API payload sceneAnalytics if present
    const apiNext = sceneAnalytics?.next_scenes || sceneAnalytics?.destination_scenes || sceneAnalytics?.nextScenes;
    if (Array.isArray(apiNext) && apiNext.length > 0) {
      return apiNext.map((item) => ({
        sceneId: normalizeId(item.scene_id || item.target_scene_id || item.id),
        title: item.title || item.target_scene_title || item.label || "",
        choiceText: item.choice_label || item.choice_text || item.label || "",
        transitionCount: item.transition_count ?? item.selection_count ?? item.count,
        percentage: item.percentage,
      })).filter((scene) => publishedNodeIds.has(scene.sceneId));
    }

    // 2. Derive from choiceAnalytics.choices if available
    if (choiceAnalytics?.choices && choiceAnalytics.choices.length > 0) {
      const list = [];
      choiceAnalytics.choices.forEach((choice) => {
        const targetId = normalizeId(choice.to_scene_id || choice.target_scene_id);
        if (targetId && publishedNodeIds.has(targetId)) {
          let title = choice.target_scene_title;
          if (!title) {
            const targetNode = uniqueNodes.find((n) => getNodeId(n) === targetId);
            if (targetNode) title = getNodeTitle(targetNode);
          }
          list.push({
            sceneId: targetId,
            title: title || "ไม่มีชื่อฉาก",
            choiceText: choice.label || "",
            transitionCount: choice.selection_count,
            percentage: choice.percentage,
          });
        }
      });
      if (list.length > 0) return list;
    }

    // 3. Fallback to rawEdges where source === selectedSceneId
    if (analyticsEdges.length > 0) {
      const list = [];
      analyticsEdges.forEach((edge) => {
        const src = edge.source;
        if (src === selectedSceneId) {
          const tgt = edge.target;
          if (tgt) {
            const targetNode = uniqueNodes.find((n) => getNodeId(n) === tgt);
            const title = targetNode ? getNodeTitle(targetNode) : "ไม่มีชื่อฉาก";
            const choiceText = edge.label || "";
            
            const edgeChoiceId = normalizeId(
              edge.data?.choice_id ?? edge.data?.ChoiceID ?? edge.data?.ID ?? edge.data?.id ?? edge.choice_id
            );
            let matched = null;
            if (edgeChoiceId) matched = edgeAnalyticsMap.byChoiceId.get(edgeChoiceId);
            if (!matched) matched = edgeAnalyticsMap.byFromTo.get(`${src}->${tgt}`);

            list.push({
              sceneId: tgt,
              title,
              choiceText,
              transitionCount: matched?.selection_count ?? matched?.count,
              percentage: matched?.percentage,
            });
          }
        }
      });
      if (list.length > 0) return list;
    }

    return [];
  }, [selectedSceneId, sceneAnalytics, choiceAnalytics, analyticsEdges, uniqueNodes, edgeAnalyticsMap]);


  const selectedSceneDetails = useMemo(() => {
    if (!selectedSceneId) return null;
    
    const node = uniqueNodes.find((n) => getNodeId(n) === selectedSceneId);
    if (!node) return null;
    
    const pos = chapterAndSceneDisplayMap.get(selectedSceneId);
    const type = getNodeType(node);
    let sceneType = "ฉากทั่วไป";
    if (type === "start" || type === "starting") sceneType = "ฉากเริ่มต้น";
    else if (type === "ending" || type === "end") sceneType = "ฉากตอนจบ";
    
    return {
      id: selectedSceneId,
      title: getNodeTitle(node),
      label: pos ? pos.display : "ฉากนิยาย",
      chapterName: pos ? pos.chapterName : "",
      sceneType,
    };
  }, [selectedSceneId, uniqueNodes, chapterAndSceneDisplayMap]);

  // Ending stats mapping
  const mappedEndings = useMemo(() => {
    const formatEndingTitle = (type) => {
      if (!type) return "ฉากจบไม่ระบุประเภท";
      const text = type.trim();
      const lower = text.toLowerCase();
      if (lower.endsWith(" ending")) {
        const prefix = text.slice(0, text.length - 7).trim();
        return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Ending`;
      } else if (lower === "ending") {
        return "Ending";
      } else {
        return `${text.charAt(0).toUpperCase() + text.slice(1)} Ending`;
      }
    };

    const rawEndings = overallAnalytics?.ending_stats || [];
    const result = rawEndings.map((e) => {
      const rawType = e.ending_type || "";
      const typeLabel = formatEndingTitle(rawType);
      const titleLabel = e.ending_title ? `${e.ending_title} (${typeLabel})` : typeLabel;
      return {
        title: titleLabel,
        endingType: rawType,
        count: e.count ?? 0,
        percentage: parseFloat(e.percentage !== undefined ? e.percentage : 0),
      };
    });
    result.sort((a, b) => b.percentage - a.percentage || b.count - a.count);
    return result;
  }, [overallAnalytics]);

  if (isLoading || (!isDataLoaded && !error)) {
    return <LoadingScreen message="กำลังโหลดสถิติกราฟนิยาย..." />;
  }

  if (error) {
    const isForbidden =
      String(error).toLowerCase().includes("forbidden") ||
      String(error).toLowerCase().includes("403") ||
      String(error).toLowerCase().includes("unauthorized") ||
      String(error).toLowerCase().includes("no permission");

    if (isForbidden && !isModalDismissed) {
      return (
        <div className="wsg-page">
          {/* Topbar */}
          <header className="wsg-topbar">
            <div className="wsg-topbar__left">
              <button 
                type="button"
                className="wsg-topbar__back"
                onClick={() => navigate(`/writer/${novelId}/chapters`)}
                title="ย้อนกลับไปหน้ารายชื่อตอน"
              >
                <ArrowLeft size={16} />
                <span>ย้อนกลับ</span>
              </button>
              <div className="wsg-topbar__divider-v" />
              <h2 className="wsg-topbar__title" title={novelTitle}>
                เรื่อง: {novelTitle.length > 28 ? `${novelTitle.slice(0, 28)}...` : novelTitle}
              </h2>
            </div>
          </header>

          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsModalDismissed(true);
              }
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px"
            }}
          >
            <div style={{
              backgroundColor: "#ffffff",
              padding: "40px 32px 32px 32px",
              borderRadius: "24px",
              border: "1.5px solid #fbcfe8",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
              maxWidth: "520px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              textAlign: "center",
              position: "relative"
            }}>
              {/* ปุ่มกากบาทสำหรับปิด Pop-up Modal */}
              <button
                type="button"
                onClick={() => setIsModalDismissed(true)}
                title="ปิดหน้าต่างนี้"
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#e2e8f0";
                  e.currentTarget.style.color = "#0f172a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                <X size={18} />
              </button>
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#fce7f3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <Lock size={28} color="#be185d" />
              </div>
              
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
                ยังไม่มีข้อมูลสถิติสำหรับนิยายเรื่องนี้
              </h3>
              
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
                นิยายหรือฉากเรื่องนี้ยังไม่ได้ถูกเผยแพร่ให้ผู้อ่านเข้าถึงได้ ระบบจะเริ่มรวบรวมและแสดงสถิติต่างๆ เมื่อมีฉากที่เปิดเผยแพร่ (Published) และมีผู้อ่านเข้าอ่านเนื้อหาแล้ว
              </p>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => navigate(`/writer/${novelId}/chapters`)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "14px",
                    border: "none",
                    background: "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(219, 39, 119, 0.25)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Layers size={16} /> ไปหน้าจัดการตอนเพื่อเผยแพร่
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/writer/${novelId}/storytree`)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "14px",
                    border: "1.5px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <GitFork size={16} /> ไปหน้าโครงสร้างเนื้อเรื่อง
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="wsg-page">
        <div className="wst-loading-state">
          <AlertCircle size={36} color="#ef4444" style={{ marginBottom: "8px" }} />
          <p className="wst-error-text" style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a", margin: "0 0 8px 0" }}>
            ไม่สามารถดึงข้อมูลสถิติได้
          </p>
          <p style={{ fontSize: "13.5px", color: "#64748b", margin: "0 0 20px 0", maxWidth: "380px", textAlign: "center" }}>
            {error}
          </p>
          <button className="wst-error-button" onClick={fetchData} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <RefreshCw size={15} /> โหลดใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wsg-page">
      {/* Topbar */}
      <header className="wsg-topbar">
        <div className="wsg-topbar__left">
          <button 
            type="button"
            className="wsg-topbar__back"
            onClick={() => navigate(`/writer/${novelId}/chapters`)}
            title="ย้อนกลับไปหน้ารายชื่อตอน"
          >
            <ArrowLeft size={16} />
            <span>ย้อนกลับ</span>
          </button>
          <div className="wsg-topbar__divider-v" />
          <h2 className="wsg-topbar__title" title={novelTitle}>
            เรื่อง: {novelTitle.length > 28 ? `${novelTitle.slice(0, 28)}...` : novelTitle}
          </h2>
        </div>

        <div className="wsg-toggle-wrap">
          <button 
            type="button"
            className="wsg-toggle-btn"
            onClick={() => navigate(`/writer/${novelId}/storytree`)}
          >
            โครงสร้าง
          </button>
          <button type="button" className="wsg-toggle-btn active">
            วิเคราะห์การเลือกของนักอ่าน
          </button>
        </div>
      </header>

      <div
        role="note"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "9px 24px",
          background: "#fff7ed",
          borderBottom: "1px solid #fed7aa",
          color: "#9a3412",
          fontSize: "0.82rem",
          lineHeight: 1.5,
          flexShrink: 0,
        }}
      >
        <Info size={16} aria-hidden="true" />
        <span>
          หมายเหตุ: สถิตินี้แสดงเฉพาะเนื้อหาที่เผยแพร่และผู้อ่านเข้าถึงได้จากจุดเริ่มต้นในปัจจุบัน
          ไม่รวมฉาก Draft หรือฉากที่ไม่มีเส้นทางจากจุดเริ่มต้น
        </span>
      </div>

      {/* 🟢 KPI Dashboard แสดงตัวเลขภาพรวม 5 การ์ด */}
      <section className="wsg-kpis-new-container">
        {/* การ์ด 1: ยอดวิวรวม */}
        <div className="wsg-kpi-card-large">
          <div className="wsg-kpi-card-header">
            <span className="wsg-kpi-label-new">
              <Eye size={16} strokeWidth={2.2} style={{ color: "#2563eb", flexShrink: 0 }} />
              <span>ยอดวิวรวม</span>
            </span>
          </div>
          <div>
            <div className="wsg-kpi-val-large">
              {formatNumber(overallAnalytics?.total_views)}
            </div>
            <span className="wsg-kpi-sub-text">มีคนเปิดอ่านกี่ครั้ง</span>
          </div>
        </div>

        {/* การ์ด 2: จำนวนคนอ่านจริง */}
        <div className="wsg-kpi-card-large">
          <div className="wsg-kpi-card-header">
            <span className="wsg-kpi-label-new">
              <Users size={16} strokeWidth={2.2} style={{ color: "#0d9488", flexShrink: 0 }} />
              <span>จำนวนคนอ่าน</span>
            </span>
          </div>
          <div>
            <div className="wsg-kpi-val-large color-teal">
              {formatNumber(overallAnalytics?.unique_readers)}
            </div>
            <span className="wsg-kpi-sub-text">คน</span>
          </div>
        </div>

        {/* การ์ด 3: คนอ่านจบกี่คน / กี่ % */}
        <div className="wsg-kpi-card-large">
          <div className="wsg-kpi-card-header">
            <span className="wsg-kpi-label-new">
              <Trophy size={16} strokeWidth={2.2} style={{ color: "#7c3aed", flexShrink: 0 }} />
              <span>คนอ่านจบ</span>
            </span>
          </div>
          <div>
            <div className="wsg-kpi-val-large color-purple">
              {overallAnalytics?.completed_readers !== undefined && overallAnalytics?.completed_readers !== null
                ? `${formatNumber(overallAnalytics.completed_readers)} คน`
                : "-"}
            </div>
            <span className="wsg-kpi-rate-text color-purple">
              คิดเป็น {formatPercentage(overallAnalytics?.completion_rate)}
            </span>
          </div>
        </div>

        {/* การ์ด 4: จบแบบไหนบ้าง (เป็น %) */}
        <div className="wsg-kpi-card-large wsg-kpi-card-endings">
          <div className="wsg-kpi-card-header">
            <span className="wsg-kpi-label-new">
              <GitFork size={16} strokeWidth={2.2} style={{ color: "#db2777", flexShrink: 0 }} />
              <span>จบแบบไหนบ้าง (เป็น %)</span>
            </span>
          </div>
          <div className="wsg-endings-scroll-list">
            {mappedEndings.length === 0 ? (
              <p className="wsg-endings-empty">
                ไม่มีข้อมูลฉากจบ
              </p>
            ) : (
              mappedEndings.map((ending, idx) => {
                const color = getEndingTypeColor(ending.endingType);
                const isLast = idx === mappedEndings.length - 1;
                return (
                  <div key={idx} className={`wsg-ending-row ${isLast ? "last" : ""}`}>
                    <span className="wsg-ending-title" style={{ color }} title={ending.title}>
                      {ending.title} ({formatNumber(ending.count)} คน)
                    </span>
                    <span className="wsg-ending-pct">
                      {formatPercentage(ending.percentage)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Requirement 8: การ์ด 5 ฉากที่ผู้ชมที่คาดว่าออกเยอะสุด */}
        <div className="wsg-kpi-card-large wsg-kpi-card-dropoff">
          <div className="wsg-kpi-card-header">
            <span className="wsg-kpi-label-new text-red">
              <Flame size={15} strokeWidth={2.2} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>ฉากที่ผู้ชมที่คาดว่าออกเยอะสุด</span>
            </span>
          </div>
          {(() => {
            const topDrop = overallAnalytics?.top_drop_off_scenes?.[0];
            if (topDrop) {
              const displayLabel = chapterAndSceneDisplayMap.get(normalizeId(topDrop.scene_id))?.display || `ฉากที่ ${topDrop.scene_id}`;
              return (
                <div className="wsg-dropoff-info">
                  <div className="wsg-dropoff-title" title={`${displayLabel} - ${topDrop.title}`}>
                    {displayLabel} - {topDrop.title}
                  </div>
                  <div className="wsg-dropoff-stats">
                    อัตราผู้ชมที่คาดว่าออก: <strong>{formatPercentage(topDrop.drop_off_rate)}</strong> (ประมาณ)
                  </div>
                </div>
              );
            }
            return <div className="wsg-dropoff-empty">ไม่มีข้อมูลผู้ชมที่คาดว่าออกสูง</div>;
          })()}
          <div className="wsg-dropoff-footnote">
            "ฉากที่ผู้ชมที่คาดว่าออกเยอะที่สุด" เป็นค่าประมาณจาก Exit Rate ของฉาก
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="wsg-body">
        {/* 🟢 Detail Sidebar ทางซ้าย */}
        {selectedSceneDetails && (
          <aside className={`wsg-sidebar ${isCollapsed ? "collapsed" : ""}`}>
            <div className="wsg-sidebar-tabs">
              <div className="wsg-sidebar-tab-btns">
                <button 
                  type="button"
                  className={`wsg-sidebar-tab-btn ${activeTab === "scene" ? "active" : ""}`}
                  onClick={() => setActiveTab("scene")}
                >
                  สถิติฉาก
                </button>
                <button 
                  type="button"
                  className={`wsg-sidebar-tab-btn ${activeTab === "choice" ? "active" : ""}`}
                  onClick={() => setActiveTab("choice")}
                >
                  สถิติทางเลือก
                </button>
              </div>
              <button 
                type="button"
                className="wsg-sidebar-close-btn" 
                onClick={() => setIsCollapsed(true)} 
                title="ซ่อนรายละเอียด"
              >
                ✕
              </button>
            </div>

            <div className="wsg-sidebar-content">
              {activeTab === "scene" ? (
                isSceneLoading ? (
                  <div className="wsg-loading-overlay">
                    <LoadingScreen message="กำลังโหลดสถิติฉาก..." compact />
                  </div>
                ) : sceneError ? (
                  <div className="wsg-loading-overlay">
                    <p style={{ fontSize: "0.85rem", color: "#b91c1c", margin: 0 }}>{sceneError}</p>
                    <button className="wst-error-button" onClick={() => fetchSceneDetails(selectedSceneId)}>
                      ลองใหม่อีกครั้ง
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: "20px", textAlign: "left" }}>
                      <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: "0 0 4px 0" }}>
                        {selectedSceneDetails.label} {selectedSceneDetails.title}
                      </h3>
                      <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 500, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                        <span>ประเภท:</span>
                        {getSceneTypeBadge(selectedSceneDetails.sceneType)}
                      </span>
                    </div>

                    {/* สถิติสรุปทั่วไป 4 กล่องย่อย (Requirement 8 - Update drop-off labels) */}
                    <div className="wsg-stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
                      {/* ผู้เข้าชมไม่ซ้ำ */}
                      <div style={{ 
                        padding: "12px 8px", 
                        backgroundColor: "#f8fafc", 
                        border: "1px solid #f1f5f9", 
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                      }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f766e" }}>
                          จำนวนคนอ่าน
                        </span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                          {formatNumber(sceneAnalytics?.unique_readers)}
                        </span>
                        <span style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>คน</span>
                      </div>
                      
                      {/* เข้าฉากทั้งหมด */}
                      <div style={{ 
                        padding: "12px 8px", 
                        backgroundColor: "#f8fafc", 
                        border: "1px solid #f1f5f9", 
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                      }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#3b82f6" }}>
                          เข้าฉากทั้งหมด
                        </span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                          {formatNumber(sceneAnalytics?.visit_count)}
                        </span>
                        <span style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>ครั้ง</span>
                      </div>
                      
                      {/* เข้าซ้ำ */}
                      <div style={{ 
                        padding: "12px 8px", 
                        backgroundColor: "#f8fafc", 
                        border: "1px solid #f1f5f9", 
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                      }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#7c3aed" }}>
                          การเข้า Scene ซ้ำ
                        </span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                          {formatNumber(sceneAnalytics?.repeat_visit_count)}
                        </span>
                        <span style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>ครั้ง</span>
                      </div>

                      {/* Drop-off Rate (Requirement 8) */}
                      <div style={{ 
                        padding: "12px 8px", 
                        backgroundColor: "#f8fafc", 
                        border: "1px solid #f1f5f9", 
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                      }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#ef4444" }}>
                          อัตราผู้ชมที่คาดว่าออก
                        </span>
                        <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                          {formatPercentage(sceneAnalytics?.drop_off_rate)}
                        </span>
                        <span style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px", textAlign: "center" }}>
                          {sceneAnalytics && sceneAnalytics.unique_readers !== undefined && sceneAnalytics.drop_off_rate !== undefined
                            ? `คาดว่าออก ~${Math.round((Number(sceneAnalytics?.unique_readers ?? 0) * Number(sceneAnalytics?.drop_off_rate ?? 0)) / 100).toLocaleString()} คน`
                            : "คาดว่าออก -"}
                        </span>
                      </div>
                    </div>

                    {/* มาจากฉากก่อนหน้า */}
                    <div style={{ marginTop: "20px" }}>
                      <h4 style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", margin: "0 0 12px 0", textAlign: "left" }}>
                        มาจากฉากก่อนหน้า
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(() => {
                          const prevList = sceneAnalytics?.previous_scenes || [];
                          if (prevList.length > 0) {
                            return prevList.map((item, idx) => {
                              const scId = normalizeId(item.scene_id);
                              const displayLabel = chapterAndSceneDisplayMap.get(scId)?.display || "ฉากก่อนหน้า";

                              return (
                                <button
                                  key={idx} 
                                  type="button"
                                  onClick={() => onPreviousSceneClick(scId)}
                                  style={{ 
                                    padding: "10px 14px", 
                                    backgroundColor: "#f8fafc", 
                                    borderRadius: "8px", 
                                    border: "1px solid #e2e8f0", 
                                    fontSize: "0.85rem", 
                                    color: "#334155",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    width: "100%"
                                  }}
                                >
                                  <div>มาจาก <strong>{displayLabel}</strong> - {item.title || "ไม่มีชื่อฉาก"}</div>
                                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
                                    ผ่านเข้าฉาก {formatNumber(item.transition_count)} ครั้ง ({formatPercentage(item.percentage)})
                                  </div>
                                </button>
                              );
                            });
                          }
                          return <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0, textAlign: "left" }}>ไม่มีฉากก่อนหน้า (ฉากนี้เป็นฉากเริ่มต้น)</p>;
                        })()}
                      </div>
                    </div>
                  </>
                )
              ) : (
                isChoiceLoading ? (
                  <div className="wsg-loading-overlay">
                    <LoadingScreen message="กำลังโหลดสถิติทางเลือก..." compact />
                  </div>
                ) : choiceError ? (
                  <div className="wsg-loading-overlay">
                    <p style={{ fontSize: "0.85rem", color: "#b91c1c", margin: 0 }}>{choiceError}</p>
                    <button className="wst-error-button" onClick={() => fetchSceneDetails(selectedSceneId)}>
                      ลองใหม่อีกครั้ง
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: "20px", textAlign: "left" }}>
                      <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: "0 0 4px 0" }}>
                        {selectedSceneDetails.label} {selectedSceneDetails.title}
                      </h3>
                      <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 500, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                        <span>ประเภท:</span>
                        {getSceneTypeBadge(selectedSceneDetails.sceneType)}
                      </span>
                    </div>

                    <h4 className="wsg-section-title" style={{ fontSize: "0.85rem", fontWeight: 800, color: "#334155", margin: "0 0 12px 0", textAlign: "left" }}>
                      สถิติปุ่มทางเลือกในฉากนี้
                    </h4>
                    {choiceAnalytics?.choices && choiceAnalytics.choices.length > 0 ? (
                      <div className="wsg-choice-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(() => {
                          const topId = choiceAnalytics.top_choice?.choice_id;

                          return choiceAnalytics.choices.map((choice, idx) => {
                            const isTop = topId !== undefined && normalizeId(choice.choice_id) === normalizeId(topId);
                            const choiceId = normalizeId(choice.choice_id);
                            const isHighlighted = highlightedChoiceId === choiceId || highlightedChoiceId === choice.label;
                            const targetSceneId = normalizeId(choice.to_scene_id);
                            const hasTarget = Boolean(targetSceneId);
                            const targetLabel = hasTarget ? (chapterAndSceneDisplayMap.get(targetSceneId)?.display || "ฉากปลายทาง") : "";
                            
                            return (
                              <button
                                key={idx} 
                                type="button"
                                disabled={!hasTarget}
                                onClick={() => hasTarget && onChoiceDestinationClick(targetSceneId)}
                                className={`wsg-choice-row-container ${isTop ? "wsg-top-choice-row" : ""} ${isHighlighted ? "wsg-highlighted-choice-row" : ""}`} 
                                style={{ 
                                  padding: "12px 14px", 
                                  backgroundColor: isTop ? "#fffdf0" : "#ffffff",
                                  border: isTop ? "1.5px solid #d97706" : (isHighlighted ? "2px solid #db2777" : "1px solid #cbd5e1"),
                                  borderRadius: "10px",
                                  width: "100%",
                                  textAlign: "left",
                                  cursor: hasTarget ? "pointer" : "default",
                                  opacity: 1,
                                  boxShadow: isTop ? "0 2px 8px rgba(217, 119, 6, 0.12)" : "0 1px 3px rgba(0,0,0,0.02)"
                                }}
                              >
                                <div className="wsg-choice-row-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontWeight: 800, fontSize: "0.82rem", color: isTop ? "#92400e" : "#0f172a" }}>
                                    ปุ่ม: "{choice.label || "ไม่มีข้อความ"}"
                                  </span>
                                  {isTop && (
                                    <span className="wsg-top-choice-badge" style={{ backgroundColor: "#d97706", color: "#ffffff", padding: "3px 8px", borderRadius: "12px", fontSize: "0.65rem", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                      <Trophy size={12} color="#ffffff" /> ปุ่มที่นิยมที่สุด
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.74rem", color: "#475569", marginTop: "4px", fontWeight: 600, textAlign: "left" }}>
                                  {hasTarget ? (
                                    <span>ไปยัง: <strong style={{ color: "#0f172a", fontWeight: 800 }}>{targetLabel}</strong> - {choice.target_scene_title || "ไม่มีชื่อฉาก"}</span>
                                  ) : (
                                    <span style={{ color: "#94a3b8" }}>ไปยัง: ยังไม่มีฉากปลายทาง</span>
                                  )}
                                </div>
                                <div className="wsg-choice-row-bottom" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                                  <div className="wsg-choice-progress-wrap" style={{ flex: 1, height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px" }}>
                                    <div 
                                      className="wsg-choice-progress-bar" 
                                      style={{ width: `${Math.min(100, Math.max(0, Number(choice.percentage ?? 0)))}%`, height: "100%", backgroundColor: isTop ? "#d97706" : "#db2777", borderRadius: "4px" }} 
                                    />
                                  </div>
                                  <div style={{ fontSize: "0.74rem", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                    <span style={{ color: isTop ? "#d97706" : "#db2777" }}>{formatPercentage(choice.percentage)}</span>
                                    <span style={{ fontSize: "0.68rem", color: "#64748b" }}>กด {formatNumber(choice.selection_count)} ครั้ง</span>
                                  </div>
                                </div>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="wsg-empty-choices" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 10px" }}>
                        <GitFork size={28} color="#94a3b8" />
                        <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0, marginTop: "8px" }}>ฉากนี้ไม่มีปุ่มทางเลือก</p>
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          </aside>
        )}

        {/* 🟢 Canvas Area ทางขวา */}
        <div className="wsg-canvas-area">
          {/* ข้อความแนะนำเมื่อยังไม่ได้เลือกโหนดฉาก และยังไม่เคยคลิกเลือกโหนดมาก่อนในรอบการเข้าหน้านี้ */}
          {!hasInteractedWithNode && !selectedSceneId && (
            <div className="wsg-canvas-hint-pill">
              <Sparkles size={15} style={{ color: "#f59e0b", flexShrink: 0 }} />
              <span className="wsg-canvas-hint-text">
                {!hasGraphNodes
                  ? "ยังไม่มีฉากที่เปิดเผยแพร่ให้นักอ่านเข้าถึงได้"
                  : "เลือกฉากในแผนผังเพื่อดูสถิติและการตัดสินใจของนักอ่าน"}
              </span>
            </div>
          )}

          {/* ปุ่มเปิดสไลด์บาร์เมื่อมีโหนดที่เลือกแต่ถูกกดซ่อนไว้ */}
          {isCollapsed && selectedSceneId && (
            <button 
              type="button"
              className="wsg-slidebar-toggle-open" 
              onClick={() => setIsCollapsed(false)}
              title="เปิดแถบรายละเอียดสถิติฉาก"
            >
              <BarChart2 size={16} style={{ color: "#db2777", flexShrink: 0 }} />
              <span>เปิดสถิติฉาก</span>
            </button>
          )}

          <div className="wsg-canvas-wrap">
            {/* 🟢 Legend Overlay แบบ Dropdown ที่สามารถกดซ่อน/แสดงได้ (แบ่ง 3 ส่วนชัดเจน) */}
            {(() => {
              const totalVis = overallAnalytics?.unique_readers ?? 0;
              let hMax = totalVis > 0 ? Math.max(2, Math.round(totalVis * 0.66)) : 2;
              let mMax = totalVis > 0 ? Math.max(1, Math.round(totalVis * 0.33)) : 1;
              if (mMax >= hMax) mMax = Math.max(1, hMax - 1);

              return (
                <div className={`wsg-legend-overlay ${isLegendOpen ? "is-open" : "is-collapsed"}`}>
                  <button
                    type="button"
                    className="wsg-legend-header-btn"
                    onClick={() => setIsLegendOpen((prev) => !prev)}
                    title={isLegendOpen ? "ซ่อนคำอธิบายสัญลักษณ์" : "แสดงคำอธิบายสัญลักษณ์"}
                  >
                    <div className="wsg-legend-header-title">
                      <div className="wsg-legend-info-icon-wrap">
                        <Info size={16} strokeWidth={2.5} color="#db2777" />
                      </div>
                      <span>คำอธิบายสัญลักษณ์</span>
                    </div>
                    <span className="wsg-legend-toggle-icon">
                      {isLegendOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </button>

                  {isLegendOpen && (
                    <div className="wsg-legend-body">
                      {/* 1. สีโหนดฉาก */}
                      <div className="wsg-legend-overlay__section">
                        <div className="wsg-legend-section-header">
                          <Palette size={15} strokeWidth={2.2} color="#db2777" />
                          <h4 className="wsg-legend-overlay__title">สีโหนดฉาก</h4>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-color-box" style={{ backgroundColor: VISITOR_SHADES.HIGH.bg, border: `1.5px solid ${VISITOR_SHADES.HIGH.border}` }} />
                            <span className="wsg-legend-label-text">ผู้ชมสูง</span>
                          </div>
                          <span className="wsg-legend-value-text">≥ {formatNumber(hMax)} คน</span>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-color-box" style={{ backgroundColor: VISITOR_SHADES.MEDIUM.bg, border: `1.5px solid ${VISITOR_SHADES.MEDIUM.border}` }} />
                            <span className="wsg-legend-label-text">ปานกลาง</span>
                          </div>
                          <span className="wsg-legend-value-text">{formatNumber(mMax)}–{formatNumber(hMax - 1)} คน</span>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-color-box" style={{ backgroundColor: VISITOR_SHADES.LOW.bg, border: `1.5px solid ${VISITOR_SHADES.LOW.border}` }} />
                            <span className="wsg-legend-label-text">ผู้ชมน้อย</span>
                          </div>
                          <span className="wsg-legend-value-text">&lt; {formatNumber(mMax)} คน</span>
                        </div>
                      </div>

                      {/* 2. สัญลักษณ์แจ้งเตือน */}
                      <div className="wsg-legend-overlay__section">
                        <div className="wsg-legend-section-header">
                          <Flame size={15} strokeWidth={2.2} color="#db2777" />
                          <h4 className="wsg-legend-overlay__title">สัญลักษณ์แจ้งเตือน</h4>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-node-badge-pill max-drop" style={{ position: "static", padding: "2px 6px", fontSize: "0.6rem", pointerEvents: "none" }}>
                              <Flame size={11} strokeWidth={2.5} color="#ffffff" style={{ flexShrink: 0 }} />
                              <span>สูงสุด</span>
                            </span>
                            <span className="wsg-legend-label-text">ออกสูงสุด (Exit Rate)</span>
                          </div>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-node-badge-pill high-exit" style={{ position: "static", padding: "2px 6px", fontSize: "0.6rem", pointerEvents: "none" }}>
                              <AlertTriangle size={11} strokeWidth={2.5} color="#ffffff" style={{ flexShrink: 0 }} />
                              <span>≥25%</span>
                            </span>
                            <span className="wsg-legend-label-text">ออกสูง ≥ 25%</span>
                          </div>
                        </div>
                      </div>

                      {/* 3. เส้นเชื่อมทางเลือก (ปรับสีให้ตรงกับในกราฟ 100%) */}
                      <div className="wsg-legend-overlay__section">
                        <div className="wsg-legend-section-header">
                          <GitFork size={15} strokeWidth={2.2} color="#db2777" />
                          <h4 className="wsg-legend-overlay__title">เส้นเชื่อมทางเลือก</h4>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-line" style={{ height: "3.8px", backgroundColor: "#10B981" }} />
                            <span className="wsg-legend-label-text">นิยมสูง</span>
                          </div>
                          <span className="wsg-legend-value-text">≥ 60%</span>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-line" style={{ height: "2.8px", backgroundColor: "#F59E0B" }} />
                            <span className="wsg-legend-label-text">ปานกลาง</span>
                          </div>
                          <span className="wsg-legend-value-text">30%–59%</span>
                        </div>
                        <div className="wsg-legend-overlay__row">
                          <div className="wsg-legend-row-left">
                            <span className="wsg-legend-line" style={{ height: "2px", backgroundColor: "#64748B" }} />
                            <span className="wsg-legend-label-text">เลือกน้อย</span>
                          </div>
                          <span className="wsg-legend-value-text">&lt; 30%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {isDataLoaded && !isLoading && !hasGraphNodes && !isModalDismissed && (
              <div 
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setIsModalDismissed(true);
                  }
                }}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(15, 23, 42, 0.45)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 9999,
                  padding: "20px"
                }}
              >
                <div style={{
                  backgroundColor: "#ffffff",
                  padding: "36px 32px 32px 32px",
                  borderRadius: "24px",
                  border: "1.5px solid #fbcfe8",
                  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
                  maxWidth: "480px",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "14px",
                  textAlign: "center",
                  position: "relative"
                }}>
                  {/* ปุ่มกากบาทสำหรับปิด Pop-up Modal */}
                  <button
                    type="button"
                    onClick={() => setIsModalDismissed(true)}
                    title="ปิดหน้าต่างนี้"
                    style={{
                      position: "absolute",
                      top: "14px",
                      right: "14px",
                      background: "#f1f5f9",
                      border: "none",
                      borderRadius: "50%",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#64748b",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#e2e8f0";
                      e.currentTarget.style.color = "#0f172a";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                      e.currentTarget.style.color = "#64748b";
                    }}
                  >
                    <X size={18} />
                  </button>

                  <div style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "#fce7f3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {rawNodes.length === 0 ? (
                      <FileText size={26} color="#be185d" />
                    ) : (!isNovelReaderAccessible ? (
                      <BookOpen size={26} color="#be185d" />
                    ) : (
                      <Lock size={26} color="#be185d" />
                    ))}
                  </div>

                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                    {rawNodes.length === 0
                      ? "ยังไม่ได้สร้างฉากในนิยายเรื่องนี้"
                      : (!isNovelReaderAccessible
                        ? "นิยายยังอยู่ในสถานะฉบับร่าง (Draft)"
                        : "ยังไม่มีฉากที่เปิดเผยแพร่ให้ผู้อ่านเข้าถึงได้")}
                  </h3>

                  <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b", lineHeight: 1.6 }}>
                    {rawNodes.length === 0
                      ? "คุณยังไม่ได้สร้างฉากใดๆ ในนิยายเรื่องนี้ เริ่มต้นสร้างตอนและฉากแรกได้ในหน้าจัดการตอน"
                      : (!isNovelReaderAccessible
                        ? "หน้านี้จะแสดงสถิติการอ่านและการเลือกเส้นทางเมื่อนิยายเรื่องนี้ได้รับการเผยแพร่เรียบร้อยแล้ว"
                        : "คุณมีฉากในระบบแล้ว แต่ฉากเหล่านั้นยังอยู่ในสถานะฉบับร่าง (Draft) หรือยังไม่ได้ถูกเผยแพร่ ระบบสถิติจะแสดงผลเฉพาะฉากที่เผยแพร่แล้วเท่านั้น")}
                  </p>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center", marginTop: "6px" }}>
                    <button
                      type="button"
                      onClick={() => navigate(`/writer/${novelId}/chapters`)}
                      style={{
                        padding: "9px 18px",
                        borderRadius: "12px",
                        border: "none",
                        background: "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(219, 39, 119, 0.2)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      {rawNodes.length === 0 ? (
                        <>ไปสร้างฉากใหม่ในหน้าจัดการตอน</>
                      ) : (
                        <>ไปหน้าจัดการตอนและเผยแพร่</>
                      )}
                    </button>
                    {rawNodes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/writer/${novelId}/storytree`)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "12px",
                          border: "1.5px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#475569",
                          fontWeight: 700,
                          fontSize: "13.5px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <GitFork size={16} /> ไปหน้าโครงสร้างเนื้อเรื่อง
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={setReactFlowInstance}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              fitView
              minZoom={0.2}
              maxZoom={2}
            >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#e2e8f0" />
                <Controls showInteractive={false} />
                <MiniMap 
                  nodeColor={(node) => {
                    if (node.data?.isMaxDrop) return "#ef4444";
                    if (node.data?.visitors >= (node.data?.highMax || 1600)) return VISITOR_SHADES.HIGH.border;
                    if (node.data?.visitors >= (node.data?.midMax || 800)) return VISITOR_SHADES.MEDIUM.border;
                    return VISITOR_SHADES.LOW.border;
                  }}
                  maskColor="rgba(250, 249, 246, 0.6)"
                />
              </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatisticsGraph;