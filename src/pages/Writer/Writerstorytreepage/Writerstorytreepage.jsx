import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactFlow, {
  Handle,
  Position,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider, // หุ้ม React Flow ด้วย Provider
  useReactFlow,      // ใช้ hook เพื่อแปลงพิกัดหน้าจอกับพิกัด Canvas
  MarkerType,
  getSmoothStepPath,
  EdgeLabelRenderer,
} from "reactflow";
import axios from "axios";
import "./Writerstorytreepage.css";
import { ChevronRight } from "lucide-react";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 118;
const NODE_HORIZONTAL_GAP = 360;
const NODE_VERTICAL_GAP = 300;
const CANVAS_MARGIN = 36;

const WRITER_NODE_STATUS = {
  START: "start",
  NORMAL: "normal",
  ENDING: "ending",
  ORPHAN: "orphan",
};

const WRITER_NODE_STYLE = {
  // จุดเริ่มต้น = เขียวมรกต (Emerald Green)
  [WRITER_NODE_STATUS.START]: {
    stroke: "#059669",
    fill: "#ECFDF5",
    text: "#065F46",
  },

  // ฉากทั่วไป = ฟ้าคราม (Sky Blue)
  [WRITER_NODE_STATUS.NORMAL]: {
    stroke: "#0EA5E9",
    fill: "#F0F9FF",
    text: "#0369A1",
  },

  // ฉากจบ = ม่วงแดง/กุหลาบ (Rose Red)
  [WRITER_NODE_STATUS.ENDING]: {
    stroke: "#E11D48",
    fill: "#FFF1F2",
    text: "#9F1239",
  },

  // ฉากไม่มีการเชื่อมต่อ = ส้มทอง/อำพัน (Amber/Orange) - แยกชัดเจนจากสีเทาของฉบับร่าง
  [WRITER_NODE_STATUS.ORPHAN]: {
    stroke: "#F59E0B",
    fill: "#FEF3C7",
    text: "#92400E",
  },
};

const WRITER_LEGEND = [
  { label: "จุดเริ่มต้น", color: "#059669" },
  { label: "ฉากทั่วไป", color: "#0EA5E9" },
  { label: "ฉากจบ", color: "#E11D48" },
  { label: "ยังไม่เชื่อมต่อ", color: "#F59E0B" },
  { label: "เผยแพร่แล้ว", color: "#2563EB", isBadge: true },
  { label: "ฉบับร่าง", color: "#94A3B8", isBadge: true },
];

const normalizeId = (value) => {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
};

const stripHtml = (value) => {
  if (typeof value !== "string" || !value) return "";
  
  let text = value;

  // 1. Convert block-level tags & line breaks to spaces
  text = text
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|table)>/gi, " ")
    .replace(/<br\s*[\/]?>/gi, " ");

  // 2. Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 3. Decode common HTML entities (double-pass to catch double-encoded entities like &amp;nbsp;)
  for (let i = 0; i < 2; i++) {
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#160;/gi, " ")
      .replace(/&[a-z0-9#]+;/gi, " ");
  }

  // 4. Decode via browser DOM if available
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      text = textarea.value;
    } catch (e) {
      // fallback
    }
  }

  // 5. Replace non-breaking space characters (\u00A0, \xa0) and collapse whitespace
  text = text.replace(/[\u00A0\xa0]/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  return text;
};

const getNodeId = (node) => normalizeId(node?.ID ?? node?.id ?? node?.SceneID ?? node?.scene_id);
const getNodeType = (node) => stripHtml((node?.Type ?? node?.type ?? "")).toLowerCase();
const getNodeTitle = (node) => stripHtml(node?.Title || node?.title || node?.Label || node?.label || `ฉากที่ ${getNodeId(node)}`);
const getNodeContent = (node) => stripHtml(node?.Content || node?.content || node?.Excerpt || node?.excerpt || "รายละเอียดฉากนี้ยังไม่มี");
const getNodeChapter = (node) => stripHtml(node?.ChapterTitle || node?.chapter_title || node?.chapter || node?.chapterName || node?.chapter_name || "");
const getChoiceLabel = (choice) => stripHtml(choice?.Label || choice?.label || choice?.choice_text || choice?.text || "ไม่มีชื่อ");
const getChapterId = (node) =>
  normalizeId(
    node?.ChapterID ??
    node?.chapter_id ??
    node?.chapterId
  );

const getSceneId = (node) =>
  normalizeId(
    node?.ID ??
    node?.id ??
    node?.SceneID ??
    node?.scene_id
  );

const formatNodeStatus = (node) => {
  const type = getNodeType(node);
  if (type === "start" || type === "starting") return WRITER_NODE_STATUS.START;
  if (type === "ending" || type === "end") return WRITER_NODE_STATUS.ENDING;
  return WRITER_NODE_STATUS.NORMAL;
};

// ==========================================
// DAG Guard: ตรวจสอบ Backward / Cycle ก่อนเชื่อมเส้นทุกครั้ง
// ==========================================
// ตรวจสอบว่าถ้าเชื่อม sourceId -> targetId แล้ว จะทำให้กราฟกลายเป็นวงวน (Cycle)
// หรือเป็นการเชื่อมย้อนกลับ (Backward) หรือไม่ โดยอนุญาตให้เชื่อม "ไปข้างหน้า" เท่านั้น
// วิธีตรวจ: เดินตามเส้นทางที่มีอยู่จริงจาก targetId ไปข้างหน้า ถ้าเดินย้อนไปเจอ sourceId ได้
// แปลว่าเส้นทางเดิมมันวนกลับมาหา source อยู่แล้ว -> ห้ามเชื่อมเส้นใหม่นี้ (จะเกิด Loop)
const isTargetAncestorOfSource = (sourceId, targetId, edgeList) => {
  const source = normalizeId(sourceId);
  const target = normalizeId(targetId);
  if (!source || !target) return false;
  if (source === target) return true; // ห้ามลากเส้นกลับเข้าฉากตัวเอง (self-loop)

  // 1. สร้างแผนที่เชื่อมโยงแบบ "ย้อนกลับ" (Reverse Adjacency List: target -> [source]) เพื่อเดินย้อนขึ้นไปหาโหนดแม่
  const reverseAdjacency = new Map();
  (edgeList || []).forEach((edge) => {
    if (!edge || edge.id === "cursor-edge") return;
    const from = normalizeId(edge.source ?? edge.fromId ?? edge.from_id);
    const to = normalizeId(edge.target ?? edge.toId ?? edge.to_id);
    if (!from || !to) return;
    
    if (!reverseAdjacency.has(to)) {
      reverseAdjacency.set(to, []);
    }
    reverseAdjacency.get(to).push(from);
  });

  // 2. เดินย้อนรอยขึ้นไป (Trace back) หาบรรพบุรุษของ source ทั้งหมด
  const visited = new Set();
  const queue = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === target) {
      return true; // Target เป็นหนึ่งในบรรพบุรุษของ Source (พบวงวนลูป)
    }
    if (visited.has(current)) continue;
    visited.add(current);

    const parents = reverseAdjacency.get(current) || [];
    for (const p of parents) {
      queue.push(p);
    }
  }

  return false; // Target ไม่ใช่บรรพบุรุษของ Source สามารถเชื่อมต่อได้ปลอดภัย
};

// เทียบ "ลำดับฉาก" (เลขตอน.เลขฉาก) เพื่อกันกรณีเชื่อมย้อนกลับที่ไม่ได้เกิด Cycle ในกราฟ
// เช่น ฉากที่ 1.2 -> 1.1 : กรณีนี้ยังไม่มีเส้นทางวนกลับจริงในกราฟ (wouldCreateCycle จะไม่จับ)
// แต่ในเชิงลำดับเนื้อเรื่องถือว่า "ย้อนกลับ" อยู่ดี เพราะฉากปลายทางเกิดขึ้น "ก่อน" ฉากต้นทาง
// posMap: Map ที่ได้จาก scenePositionMap (key = sceneId, value = { chapterNumber, sceneNumber })
const getSceneOrderKey = (sceneId, posMap) => {
  const pos = posMap?.get(normalizeId(sceneId));
  if (!pos || !pos.chapterNumber || !pos.sceneNumber) return null; // ฉากใหม่/ชั่วคราวที่ยังไม่มีลำดับ -> ไม่ทราบ ปล่อยให้ไปเช็คด้วยกราฟแทน
  return pos.chapterNumber * 1000000 + pos.sceneNumber;
};

const isBackwardByScenePosition = (sourceId, targetId, posMap) => {
  const sourceKey = getSceneOrderKey(sourceId, posMap);
  const targetKey = getSceneOrderKey(targetId, posMap);
  if (sourceKey === null || targetKey === null) return false; // ไม่มีข้อมูลลำดับฝั่งใดฝั่งหนึ่ง ปล่อยผ่านเงื่อนไขนี้
  return targetKey <= sourceKey; // ฉากปลายทางต้องอยู่ "หลัง" ฉากต้นทางเท่านั้น ห้ามเท่ากันหรือย้อนกลับ
};


const StoryNode = ({ data }) => {
  const status = data.status;
  const style = WRITER_NODE_STYLE[status] || WRITER_NODE_STYLE[WRITER_NODE_STATUS.NORMAL];
  const title = getNodeTitle(data);

  // ดึงข้อมูลเลขตอนและฉากจาก data ที่ถูกส่งต่อมาอย่างถูกต้อง
  const chapterNo = data.chapterNumber ?? "?";
  const sceneNo = data.sceneNumber ?? "?";
  const chapterTitle = data.chapterTitle || getNodeChapter(data) || "";
  const description = getNodeContent(data);

  // ตรวจจับสถานะการโฟกัสคลิกเลือกโหนดใน Select Mode
  const isSelected = !!data.isSelectedNode;
  const hasSelection = !!data.hasActiveSelection;

  // สถานะระหว่าง Connect Mode: "valid" = เชื่อมได้ (เขียวจาง), "invalid" = เชื่อมไม่ได้ (แดงจาง), null = ยังไม่ได้เลือก source
  const connectTargetStatus = data.connectTargetStatus || null;
  const isConnectSourceNode = !!data.isConnectSourceNode;

  const cardClassName = [
    "wst-node-card",
    isSelected ? "wst-node-card--selected" : "",
    hasSelection && !isSelected ? "wst-node-card--dimmed" : "",
    isConnectSourceNode ? "wst-node-card--connect-source" : "",
    connectTargetStatus === "valid" ? "wst-node-card--valid-target" : "",
    connectTargetStatus === "invalid" ? "wst-node-card--invalid-target" : "",
  ].filter(Boolean).join(" ");

  const nodeCustomStyle = {
    borderColor: isSelected ? "#2563EB" : style.stroke,
    background: style.fill,
    color: style.text,
    borderWidth: isSelected ? "3.5px" : "2.5px",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    opacity: hasSelection && !isSelected ? 0.35 : 1,
    transform: isSelected ? "scale(1.04)" : "scale(1)",
    boxShadow: isSelected 
      ? `0 10px 25px -5px rgba(37, 99, 235, 0.25), 0 8px 10px -6px rgba(37, 99, 235, 0.3), 0 0 0 3px rgba(37, 99, 235, 0.4)`
      : "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)",
    animation: isSelected ? "wst-pulse-border 1.8s infinite alternate" : "none",
    cursor: connectTargetStatus === "invalid" ? "not-allowed" : undefined,
  };

  // ดึงข้อมูลสถานะการเผยแพร่ของฉาก (published หรือ draft)
  const isPublished = (() => {
    // 1. ตรวจสอบจาก data.is_published, isPublished boolean
    if (data.is_published === true || data.isPublished === true || data.is_published === 1) return true;
    if (data.is_published === false || data.isPublished === false || data.is_published === 0) return false;

    // 2. ตรวจสอบจาก sceneStatus, publish_status, publishStatus, status
    const rawStatus = String(data.sceneStatus || data.publish_status || data.publishStatus || data.status || "").toLowerCase().trim();
    if (rawStatus === "published" || rawStatus === "active" || rawStatus === "publish") return true;
    if (rawStatus === "draft" || rawStatus === "inactive") return false;

    // 3. ถ้าเป็นโหนดที่มีการเผยแพร่ตอน (Chapter Status)
    if (data.chapter_status === "published" || data.chapterStatus === "published") return true;

    return false;
  })();

  return (
    <div className={cardClassName} style={nodeCustomStyle}>
      {/* จุดเชื่อมเข้าโหนดด้านบน (Top), ด้านซ้าย (Left), ด้านขวา (Right) */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ background: "#2563eb", width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ background: "#2563eb", width: 8, height: 8, top: "50%" }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ background: "#2563eb", width: 8, height: 8, top: "50%" }} />
      
      {/* ป้ายแสดงสถานะ เผยแพร่ / ฉบับร่าง ที่มุมบนขวา */}
      <div className={`wst-node-card__publish-badge ${isPublished ? "wst-node-card__publish-badge--published" : "wst-node-card__publish-badge--draft"}`}>
        <span className="wst-node-card__publish-dot"></span>
        {isPublished ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
      </div>

      {/* ตอนที่ [เลขตอน] [ชื่อตอน] */}
      <div className="wst-node-card__badge">
        ตอนที่ {chapterNo} {chapterTitle}
      </div>

      {/* ฉากที่ [เลขตอน].[เลขฉาก] */}
      <div className="wst-node-card__scene-num">
        ฉากที่ {chapterNo}.{sceneNo}
      </div>

      {/* ชื่อฉาก */}
      <div className="wst-node-card__title">
        {title}
      </div>

      {/* เนื้อหาของฉาก */}
      <div className="wst-node-card__desc">
        {description}
      </div>

      {/* ปุ่มแก้ไข */}
      <button
        className="wst-node-card__edit"
        onClick={(e) => {
          e.stopPropagation();
          data.onEdit?.(
            getSceneId(data),
            data.ChapterID ?? data.chapter_id ?? data.chapterId
          );
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span>แก้ไข</span>
      </button>
      
      {/* จุดปล่อยเส้นขาออกจากโหนด (Bottom เท่านั้น) */}
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ background: "#2563eb", width: 8, height: 8 }} />
    </div>
  );
};

let cachedPathElement = null;
const getPointOnSvgPath = (pathD, ratio = 0.5) => {
  if (typeof document === "undefined" || !pathD) return null;
  try {
    if (!cachedPathElement) {
      cachedPathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    }
    cachedPathElement.setAttribute("d", pathD);
    const totalLen = cachedPathElement.getTotalLength();
    if (!totalLen || isNaN(totalLen)) return null;
    const pt = cachedPathElement.getPointAtLength(totalLen * ratio);
    return { x: pt.x, y: pt.y, totalLen };
  } catch (e) {
    return null;
  }
};

const CustomMultigraphEdge = ({
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
  let adjustedSourceY = sourceY;
  let adjustedTargetX = targetX;
  let adjustedTargetY = targetY;

  // กระจายจุดปล่อยเส้นขาออก (Source Handle) ตามขอบด้านล่างของการ์ดโหนดต้นทาง
  if (outCount > 1) {
    const maxWidth = Math.min(180, (outCount - 1) * 36);
    const step = maxWidth / (outCount - 1);
    adjustedSourceX = (sourceX - maxWidth / 2) + outIndex * step;
  }

  // กระจายจุดปักเส้นขาเข้า (Target Handle) ตามขอบของการ์ดโหนดปลายทาง (Top / Left / Right)
  if (inCount > 1) {
    const isSideTarget = targetPosition === Position.Left || targetPosition === Position.Right || targetPosition === "left" || targetPosition === "right";
    if (isSideTarget) {
      const maxHeight = Math.min(60, (inCount - 1) * 20);
      const step = maxHeight / (inCount - 1);
      adjustedTargetY = (targetY - maxHeight / 2) + inIndex * step;
    } else {
      const maxWidth = Math.min(180, (inCount - 1) * 36);
      const step = maxWidth / (inCount - 1);
      adjustedTargetX = (targetX - maxWidth / 2) + inIndex * step;
    }
  }

  // ค้นหาเส้นขนานคู่เดียวกันทั้งหมดเพื่อหาลำดับจุดเลี้ยว (พิกัด Y ของเส้นแนวนอน)
  const samePairEdges = allEdges.filter(
    (e) => String(e.source) === String(source) && String(e.target) === String(target)
  );
  const pairIndex = samePairEdges.findIndex((e) => String(e.id) === String(id));
  const pairCount = samePairEdges.length;

  // คำนวณระยะหักเลี้ยวแนวระนาบ (Y offset) แยกระดับแต่ละทางเลือกอย่างชัดเจน (32px ต่อลำดับ)
  const baseOffset = 28;
  const outStep = 32;
  const pairStep = 32;
  const edgeOffset = baseOffset + (outIndex * outStep) + ((pairIndex > 0 ? pairIndex : 0) * pairStep);

  // สร้างเส้นหักฉากมุมโค้งมน 90 องศา (SmoothStep Path)
  const [edgePath, defaultLabelX, defaultLabelY] = getSmoothStepPath({
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
    borderRadius: 14,
    offset: edgeOffset,
  });

  // คำนวณพิกัดตำแหน่ง Label Badge บนเส้นทาง Edge จริง 100% ด้วยการสุ่มตัวอย่างพิกัดบน SVG Path
  const badgeWidth = 140;
  const badgeHeight = 24;

  // คำนวณสัดส่วนตำแหน่ง (ratio) บนเส้นทาง โดยกระจายทางเลือกหลายรายการตามความยาวเส้นทาง
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

  let labelCenterX = defaultLabelX;
  let labelCenterY = defaultLabelY;
  let selectedPt = null;

  // ตรวจสอบว่าพิกัด (px, py) ตกอยู่ภายในหรือใกล้เคียงกับโหนดใดๆ ในกราฟทั้งหมดหรือไม่
  const isPointInsideAnyNode = (px, py) => {
    for (const node of allNodes) {
      const nx = node.x ?? node.position?.x ?? 0;
      const ny = node.y ?? node.position?.y ?? 0;

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
    const pt = getPointOnSvgPath(edgePath, ratio);
    if (pt) {
      if (!isPointInsideAnyNode(pt.x, pt.y)) {
        selectedPt = pt;
        break;
      }
      if (!selectedPt) selectedPt = pt;
    }
  }

  if (selectedPt) {
    labelCenterX = selectedPt.x;
    labelCenterY = selectedPt.y;
  }

  const isHighlighted = !!data?.isHighlighted;
  const hasSelection = !!data?.hasActiveSelection;

  let labelOpacity = 1;
  let labelZIndex = 100;
  let borderStyleColor = "#bfdbfe";
  let labelTextColor = "#1e3a8a";

  if (hasSelection) {
    if (isHighlighted) {
      labelOpacity = 1;
      labelZIndex = 2000;
      borderStyleColor = "#2563eb";
      labelTextColor = "#2563eb";
    } else {
      labelOpacity = 0.15;
      labelZIndex = 10;
    }
  }

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelCenterX}px, ${labelCenterY}px)`,
              pointerEvents: labelOpacity < 0.5 ? "none" : "all",
              zIndex: labelZIndex,
              opacity: labelOpacity,
              transition: "opacity 0.3s ease, z-index 0.3s ease",
            }}
          >
            <div
              title={label}
              style={{
                background: "#ffffff",
                padding: "3px 8px",
                border: `1.5px solid ${borderStyleColor}`,
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: "700",
                color: labelTextColor,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: `${badgeWidth}px`,
                boxShadow: isHighlighted 
                  ? "0 4px 12px rgba(37, 99, 235, 0.16), 0 0 0 1.5px rgba(37, 99, 235, 0.25)" 
                  : "0 2px 6px rgba(37, 99, 235, 0.08)",
                fontFamily: '"Outfit", "Sarabun", sans-serif',
                lineHeight: "1.3",
                boxSizing: "border-box",
                transition: "all 0.3s ease",
              }}
            >
              {label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// add stable nodeTypes/edgeTypes at module top-level to avoid React Flow warning #002
const nodeTypes = {
  writerNode: StoryNode,
};

const edgeTypes = {
  multigraphEdge: CustomMultigraphEdge,
};

const LegendBar = () => (
  <div className="wst-legend" role="list" aria-label="คำอธิบายสัญลักษณ์">
    {WRITER_LEGEND.map((item) => (
      <div key={item.label} className="wst-legend__item" role="listitem">
        <span className="wst-legend__dot" style={{ background: item.color }} />
        <span className="wst-legend__label">{item.label}</span>
      </div>
    ))}
  </div>
);

// Modal overlay ที่ใช้ร่วมกันสำหรับ popup ทั้งหมดในหน้านี้ (เพิ่ม/ลบฉาก, จัดการทางเลือก, ยืนยันต่างๆ)
// เดิมแต่ละ popup ก็อปวางสไตล์ overlay/กล่องซ้ำกันทั้ง 5 จุด จึงรวมมาไว้ที่เดียว
const WstModalOverlay = ({
  onClose,
  maxWidth = 440,
  borderColor = "#bfdbfe",
  shadowColor = "rgba(37, 99, 235, 0.15)",
  overlayOpacity = 0.35,
  textAlign,
  children,
}) => (
  <div
    style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: `rgba(15, 23, 42, ${overlayOpacity})`, display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 100000,
      padding: "16px", backdropFilter: "blur(4px)",
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget && onClose) onClose();
    }}
  >
    <div
      style={{
        backgroundColor: "#fff", padding: "28px", borderRadius: "24px",
        width: "100%", maxWidth, boxShadow: `0 20px 50px ${shadowColor}`,
        fontFamily: '"Outfit", "Sarabun", sans-serif', border: `1px solid ${borderColor}`,
        ...(textAlign ? { textAlign } : {}),
      }}
    >
      {children}
    </div>
  </div>
);

// Inner component เพื่อให้สามารถเรียกใช้ useReactFlow() hook ได้อย่างถูกต้อง
const StoryTreeInner = ({ novelId, onNavigate }) => {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const [treeData, setTreeData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSceneId, setSelectedSceneId] = useState(null);
  const [interactionMode, setInteractionMode] = useState("select"); // select | connect | pan | add-node
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false); // ควบคุมเปิด/ปิด Sidebar บนมือถือ/แท็บเล็ต
  const reactflowWrapperRef = useRef(null);

  // State สำหรับระบบวนค้นหาโหนดฉากที่ยังไม่ได้เชื่อมต่อ (Focus to Orphan Node)
  const [orphanIndex, setOrphanIndex] = useState(0);

  // States สำหรับ Interactive Connection System
  const [connectSource, setConnectSource] = useState(null); // ฉากต้นทาง
  const [connectTarget, setConnectTarget] = useState(null); // ฉากปลายทาง
  const [isModalOpen, setIsModalOpen] = useState(false);     // ควบคุม Popup Modal
  const [choiceText, setChoiceText] = useState("");          // ข้อความตัวเลือก
  const [toast, setToast] = useState(null);                  // Toast แจ้งเตือน

  // States สำหรับการเพิ่มฉากโดยระบุตอนที่เลือก
  const [novelChapters, setNovelChapters] = useState([]);
  const [showAddScenePopup, setShowAddScenePopup] = useState(false);
  const [pendingScenePosition, setPendingScenePosition] = useState(null); // { x, y }
  const [selectedMoveChapterId, setSelectedMoveChapterId] = useState("");

  // States สำหรับระบบการลบโหนดด้วยการคลิกยืนยัน
  const [sceneToDelete, setSceneToDelete] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // States สำหรับฉากและเส้นเชื่อม
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [showEdgeModal, setShowEdgeModal] = useState(false);
  const [editEdgeLabel, setEditEdgeLabel] = useState("");
  const [editEdgeSource, setEditEdgeSource] = useState("");
  const [editEdgeTarget, setEditEdgeTarget] = useState("");
  const [showDeleteChoiceConfirm, setShowDeleteChoiceConfirm] = useState(false);

  // States สำหรับการลากและ Reconnect เส้นเชื่อมโยง
  const [pendingEdgeUpdate, setPendingEdgeUpdate] = useState(null); // { oldEdge, newConnection }
  const [showEdgeUpdateConfirm, setShowEdgeUpdateConfirm] = useState(false);

  // Sync interactionMode with ref to prevent stale closures
  const modeRef = useRef(interactionMode);
  useEffect(() => {
    modeRef.current = interactionMode;
  }, [interactionMode]);

  // Sync connectSource with ref to prevent stale closures in mouse move
  const connectSourceRef = useRef(connectSource);
  useEffect(() => {
    connectSourceRef.current = connectSource;
  }, [connectSource]);

  // Toast handler
  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, []);

  const fetchStoryTreeAndChapters = useCallback(async () => {
    if (!novelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [treeRes, chaptersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree`, { headers, withCredentials: false }),
        axios.get(`${API_BASE_URL}/novels/${novelId}/chapters`, { headers, withCredentials: false })
      ]);
      setTreeData(treeRes.data?.data || treeRes.data || null);
      
      let chaptersData = chaptersRes.data?.data?.chapters || chaptersRes.data?.chapters || chaptersRes.data?.data || chaptersRes.data || [];
      setNovelChapters(Array.isArray(chaptersData) ? chaptersData : []);
    } catch (err) {
      console.error("Error fetching story tree and chapters:", err);
      setError("ไม่สามารถโหลดข้อมูล โครงสร้างเนื้อเรื่อง ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    fetchStoryTreeAndChapters();
  }, [fetchStoryTreeAndChapters]);

  useEffect(() => {
    const handleDataUpdate = () => {
      fetchStoryTreeAndChapters();
    };
    window.addEventListener("novel-data-updated", handleDataUpdate);
    return () => window.removeEventListener("novel-data-updated", handleDataUpdate);
  }, [fetchStoryTreeAndChapters]);

  const nodes = treeData?.Nodes ?? treeData?.nodes ?? [];
  const edges = treeData?.Edges ?? treeData?.edges ?? [];

  const uniqueNodes = useMemo(() => {
    const seen = new Set();
    return nodes.filter((scene) => {
      const id = getNodeId(scene);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [nodes]);

  const normalizedEdges = useMemo(() => {
    return edges.map((choice) => {
      const fromId = normalizeId(choice.FromID ?? choice.from_id ?? choice.from ?? choice.From);
      const toId = normalizeId(choice.ToID ?? choice.to_id ?? choice.to ?? choice.To);
      const fromSceneNumberInChapter = choice.fromSceneNumberInChapter ?? choice.FromSceneNumberInChapter ?? choice.from_scene_number_in_chapter ?? 0;
      const toSceneNumberInChapter = choice.toSceneNumberInChapter ?? choice.ToSceneNumberInChapter ?? choice.to_scene_number_in_chapter ?? 0;
      const fromChapterEpisode = choice.fromChapterEpisode ?? choice.FromChapterEpisode ?? choice.from_chapter_episode ?? 0;
      const toChapterEpisode = choice.toChapterEpisode ?? choice.ToChapterEpisode ?? choice.to_chapter_episode ?? 0;
      const fromSceneTitle = choice.fromSceneTitle || choice.FromSceneTitle || choice.from_scene_title || "ไม่ทราบ";
      const toSceneTitle = choice.toSceneTitle || choice.ToSceneTitle || choice.to_scene_title || "ไม่ทราบ";

      return {
        ...choice,
        fromId,
        toId,
        fromSceneNumberInChapter,
        toSceneNumberInChapter,
        fromChapterEpisode,
        toChapterEpisode,
        fromSceneTitle,
        toSceneTitle,
      };
    });
  }, [edges]);

  const { positionedNodes, positionedEdges, chapters, stats, detectedLoops = [] } = useMemo(() => {
    if (!uniqueNodes.length) {
      return { positionedNodes: [], positionedEdges: [], chapters: [], stats: treeData?.Stats ?? treeData?.stats ?? null, detectedLoops: [] };
    }

    // สร้าง Map ค้นหาข้อมูลภายใน useMemo นี้โดยตรงเพื่อป้องกันปัญหา TDZ (Temporal Dead Zone)
    const localMap = new Map();
    uniqueNodes.forEach((scene) => localMap.set(getNodeId(scene), scene));

    const nodeIds = uniqueNodes.map(getNodeId);
    const adjacency = {};
    const inDegree = {};
    const nodeStatuses = {};
    const nodeLevels = {};

    nodeIds.forEach((id) => {
      adjacency[id] = [];
      inDegree[id] = 0;
    });

    const findMatchingNodeId = (raw) => {
      const candidate = normalizeId(raw);
      if (!candidate) return "";
      if (adjacency[candidate] !== undefined) return candidate;
      for (const id of nodeIds) {
        const sid = normalizeId(id);
        if (sid === candidate) return sid;
        if (sid.endsWith(candidate)) return sid;
        if (sid.includes(candidate) && candidate.length > 1) return sid;
      }
      return "";
    };

    const edgeList = normalizedEdges
      .map((edge, index) => {
        const rawSource = edge.fromId;
        const rawTarget = edge.toId;
        const source = findMatchingNodeId(rawSource);
      const target = findMatchingNodeId(rawTarget);
        if (source && adjacency[source] && inDegree[target] !== undefined) {
          adjacency[source].push(target);
          inDegree[target] += 1;
        }
        return {
          id: normalizeId(edge.id ?? edge.ID ?? `edge-${source}-${target}-${index}`),
          source,
          target,
          label: edge.Label || edge.label || edge.choice_text || edge.text || "",
          data: edge,
        };
      })
      .filter((edge) => edge.source && edge.target && adjacency[edge.source] !== undefined && inDegree[edge.target] !== undefined);

    uniqueNodes.forEach((node) => {
      const id = getNodeId(node);
      const type = getNodeType(node);
      const isStartNode = type === "start" || type === "starting";

      const hasIncoming = inDegree[id] > 0;

      // หากไม่ใช่โหนดจุดเริ่มต้น และไม่มีเส้นทางเชื่อมขาเข้า (No Incoming Edge)
      // ถือว่าผู้อ่านเดินทางมาไม่ถึงฉากนี้ ให้ถูกจัดอยู่ในสถานะ "ยังไม่เชื่อมต่อ" (ORPHAN)
      if (!isStartNode && !hasIncoming) {
        nodeStatuses[id] = WRITER_NODE_STATUS.ORPHAN;
      } else {
        nodeStatuses[id] = formatNodeStatus(node);
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
        // หากโหนดลูกมีเส้นเชื่อมเข้าตั้งแต่ 3 เส้นขึ้นไป (Junction Node) 
        // ให้เลื่อนระดับความสูงลงไปอีก 1 แถวเพื่อเลี่ยงการทับซ้อนแนวนอนกับโหนดข้างเคียง
        const offset = (inDegree[childId] >= 3) ? 2 : 1;
        const nextLevel = level + offset;
        if (nodeLevels[childId] === undefined || nodeLevels[childId] > nextLevel) {
          nodeLevels[childId] = nextLevel;
          queue.push(childId);
        }
      });
    }

    // 2. จัดกลุ่มโหนดตาม Level
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

    // 3. จัดตำแหน่งระดับ 0 (จุดเริ่มต้น) เป็นค่าเริ่มต้น
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

    // 4. จัดเรียงระดับถัดๆ ไป (1, 2, 3...) อิงตาม Barycenter heuristic ของ parents
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

      // จัดเรียงตาม X ในอุดมคติเพื่อรักษาแนวเส้นทางไม่ให้ข้ามฝั่งกัน
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

    const allX = Object.values(positions).map((pos) => pos.x);
    const allY = Object.values(positions).map((pos) => pos.y);
    const minY = Math.min(...allY, 0);
    const shiftY = Math.max(CANVAS_MARGIN, CANVAS_MARGIN - minY);

    Object.keys(positions).forEach((sceneId) => {
      positions[sceneId].y += shiftY;
    });

let orphanCounter = 0;
    const positionedNodes = nodeIds.map((sceneId) => {
      const scene = localMap.get(sceneId);
      const position = positions[sceneId] || { x: CANVAS_MARGIN, y: CANVAS_MARGIN };

      const apiX = scene.node_x ?? scene.NodeX;
      const apiY = scene.node_y ?? scene.NodeY;
      const hasSavedPosition = apiX !== null && apiX !== undefined && apiY !== null && apiY !== undefined;

      const isOrphan = nodeStatuses[sceneId] === WRITER_NODE_STATUS.ORPHAN;
      let fallbackX = position.x;
      let fallbackY = position.y;
      if (!hasSavedPosition && isOrphan) {
        const col = orphanCounter % 5;
        const row = Math.floor(orphanCounter / 5);
        fallbackX = CANVAS_MARGIN + col * NODE_HORIZONTAL_GAP;
        fallbackY = CANVAS_MARGIN + row * NODE_VERTICAL_GAP;
        orphanCounter += 1;
      }

      return {
        id: sceneId,
        scene,
        x: hasSavedPosition ? apiX : (scene.x ?? fallbackX),
        y: hasSavedPosition ? apiY : (scene.y ?? fallbackY),
        status: nodeStatuses[sceneId],
      };
    });

    // 💡 ค้นหาลูป/วงวนในโครงสร้างกราฟทั้งหมดโดยใช้วิธี DFS Cycle Finder (รันก่อนประมวลผลตำแหน่งและสไตล์ Edges)
    const localDetectedLoops = [];
    const visited = {}; // 0: unvisited, 1: visiting, 2: visited
    const currentPath = [];

    const findCyclesDfs = (u) => {
      visited[u] = 1;
      currentPath.push(u);

      const neighbors = adjacency[u] || [];
      for (const v of neighbors) {
        if (visited[v] === 1) {
          // เกิดลูปย้อนกลับ! ดึงชื่อโหนดในแนวเส้นทางออกมา
          const idx = currentPath.indexOf(v);
          if (idx !== -1) {
            const loopPath = currentPath.slice(idx);
            const key = [...loopPath, v].join("->");
            if (!localDetectedLoops.some((l) => l.key === key)) {
              localDetectedLoops.push({
                nodes: [...loopPath, v],
                key,
              });
            }
          }
        } else if (!visited[v]) {
          findCyclesDfs(v);
        }
      }

      currentPath.pop();
      visited[u] = 2;
    };

    nodeIds.forEach((id) => {
      if (!visited[id]) {
        findCyclesDfs(id);
      }
    });

    // 1. นับจำนวนทางเลือกขาออก (Outgoing) และทางเลือกขาเข้า (Incoming) ของแต่ละโหนด
    const outgoingCount = {};
    const incomingCount = {};
    edgeList.forEach((edge) => {
      const src = normalizeId(edge.source);
      const tgt = normalizeId(edge.target);
      outgoingCount[src] = (outgoingCount[src] || 0) + 1;
      incomingCount[tgt] = (incomingCount[tgt] || 0) + 1;
    });

    // 2. เก็บดัชนีระบุลำดับของแต่ละเส้น
    const outgoingIndex = {};
    const incomingIndex = {};

    const positionedEdges = edgeList.map((edge) => {
      const src = normalizeId(edge.source);
      const tgt = normalizeId(edge.target);

      const outIdx = outgoingIndex[src] || 0;
      outgoingIndex[src] = outIdx + 1;

      const inIdx = incomingIndex[tgt] || 0;
      incomingIndex[tgt] = inIdx + 1;

      // คำนวณพิกัดสัมพัทธ์ระหว่างโหนดต้นทางและโหนดปลายทางเพื่อเลือกจุดเชื่อมเข้า (Top / Left / Right)
      const srcNode = positionedNodes.find((n) => normalizeId(n.id) === src);
      const tgtNode = positionedNodes.find((n) => normalizeId(n.id) === tgt);

      let targetHandle = "target-top"; // Standard default (Top)
      if (srcNode && tgtNode) {
        const dx = tgtNode.x - srcNode.x;
        const dy = tgtNode.y - srcNode.y;

        // หากโหนดปลายทางอยู่เฉียงไปทางขวามากกว่า 180px
        if (dx > 180) {
          targetHandle = "target-left"; // เข้าขอบซ้าย
        }
        // หากโหนดปลายทางอยู่เฉียงไปทางซ้ายมากกว่า 180px
        else if (dx < -180) {
          targetHandle = "target-right"; // เข้าขอบขวา
        }
        // หากโหนดปลายทางอยู่แนวระนาบเดียวกันหรืออยู่สูงกว่าโหนดต้นทาง (dy <= 40)
        else if (dy <= 40) {
          targetHandle = dx >= 0 ? "target-left" : "target-right";
        }
      }

      const inLoop = localDetectedLoops.some((loop) => {
        const path = loop.nodes;
        for (let i = 0; i < path.length - 1; i++) {
          if (normalizeId(path[i]) === src && normalizeId(path[i+1]) === tgt) return true;
        }
        return false;
      });

      return {
        ...edge,
        sourceHandle: "source-bottom",
        targetHandle: targetHandle,
        type: "multigraphEdge", // บังคับเปิดใช้งาน Custom Multigraph Edge
        data: {
          allEdges: edgeList,
          allNodes: positionedNodes,
          source: edge.source,
          target: edge.target,
          outIndex: outIdx,
          outCount: outgoingCount[src] || 1,
          inIndex: inIdx,
          inCount: incomingCount[tgt] || 1,
        },
        active: true,
        animated: inLoop || edge.animated,
        style: inLoop 
          ? { stroke: "#ef4444", strokeWidth: 3.5, strokeDasharray: "6,4" }
          : edge.style,
      };
    });

    const chapterGroups = new Map();
    const chapterOrder = [];
    positionedNodes.forEach((item) => {
      const chapter = getNodeChapter(item.scene) || "อื่นๆ";
      if (!chapterGroups.has(chapter)) {
        chapterGroups.set(chapter, []);
        chapterOrder.push(chapter);
      }
      chapterGroups.get(chapter).push(item.scene);
    });

    const chapters = chapterOrder.map((chapter) => ({ title: chapter, scenes: chapterGroups.get(chapter) }));

    return {
      positionedNodes,
      positionedEdges,
      chapters,
      stats: treeData?.Stats ?? treeData?.stats ?? null,
      detectedLoops: localDetectedLoops,
    };
  }, [nodes, edges, treeData]);

  // คำนวณ scenePositionMap เพื่อใช้ดึงเลขตอนและเลขฉาก
  const scenePositionMap = useMemo(() => {
    const map = new Map();

    chapters.forEach((chapter, chapterIndex) => {
      chapter.scenes.forEach((scene, sceneIndex) => {
        map.set(getNodeId(scene), {
          chapterNumber: chapterIndex + 1,
          sceneNumber: sceneIndex + 1,
          chapterTitle: chapter.title,
        });
      });
    });

    return map;
  }, [chapters]);

  // Convert positionedNodes/positionedEdges into React Flow node/edge shapes
  const flowNodes = useMemo(() => {
    const hasSelection = !!selectedSceneId;
    return positionedNodes.map((n) => {
      const sceneId = getNodeId(n.scene);
      const pos = scenePositionMap.get(sceneId);
      const isSelectedNode = selectedSceneId && String(n.id) === String(selectedSceneId);

      const sceneChapterId = n.scene?.ChapterID ?? n.scene?.chapter_id ?? n.scene?.chapterId;
      const matchedChapter = novelChapters.find((ch) => {
        const chId = ch.id ?? ch.ID ?? ch.chapter_id ?? ch.ChapterID;
        return String(chId) === String(sceneChapterId);
      });
      const chapterPublishStatus = matchedChapter?.status || matchedChapter?.Status || "";

      return {
        id: String(n.id),
        type: "writerNode",
        position: { x: n.x, y: n.y },
        zIndex: isSelectedNode ? 100 : 20, // การ์ดโหนดอยู่ชั้นบนสุดเสมอ (zIndex 20) ป้องกันเส้นเชื่อมทับบังเนื้อหาโหนด
        data: {
          ...n.scene,
          sceneStatus: n.scene?.status ?? n.scene?.Status ?? n.scene?.publish_status ?? n.scene?.publishStatus ?? n.scene?.is_published,
          chapter_status: chapterPublishStatus,
          chapterStatus: chapterPublishStatus,
          graphStatus: n.status,
          status: n.status,
          isSelectedNode,
          hasActiveSelection: hasSelection,
          chapterNumber: pos ? pos.chapterNumber : "?",
          sceneNumber: pos ? pos.sceneNumber : "?",
          chapterTitle: pos ? pos.chapterTitle : (getNodeChapter(n.scene) || ""),
          onEdit: (sceneId, chapterId) => {
            onNavigateRef.current?.("scene-editor", { novelId, chapterId, sceneId });
          },
        },
      };
    });
  }, [positionedNodes, novelId, scenePositionMap, selectedSceneId]);

  const flowEdges = useMemo(() => {
    const hasSelection = !!selectedSceneId;
    return positionedEdges.map((e) => {
      const isSelected = selectedEdge && String(selectedEdge.id) === String(e.id);
      const isConnectedToSelected = selectedSceneId && (String(e.source) === String(selectedSceneId) || String(e.target) === String(selectedSceneId));

      // เส้นปกติทั่วไปอยู่ชั้นล่าง (zIndex 2) อยู่ใต้การ์ดโหนดเสมอ ไม่บังข้อความในโหนด
      const edgeZIndex = isConnectedToSelected ? 15 : isSelected ? 10 : 2;

      let strokeColor = "#94a3b8";
      let strokeWidth = 2;
      let strokeOpacity = 1;

      if (hasSelection) {
        if (isConnectedToSelected) {
          strokeColor = "#2563eb"; // สีฟ้าเข้มโดดเด่นสะดุดตา
          strokeWidth = 3.5;
          strokeOpacity = 1;
        } else {
          strokeColor = "#cbd5e1"; // หรี่เส้นอื่นๆ
          strokeWidth = 1;
          strokeOpacity = 0.15;
        }
      } else if (isSelected) {
        strokeColor = "#ef4444"; // โหมดลบ
        strokeWidth = 3;
      }

      return {
        id: String(e.id || `e-${e.source}-${e.target}`),
        source: String(e.source),
        target: String(e.target),
        label: e.label || "",
        type: e.type || "smoothstep",
        zIndex: edgeZIndex,
        data: {
          ...e.data,
          isHighlighted: isConnectedToSelected,
          hasActiveSelection: hasSelection,
        },
        animated: isConnectedToSelected ? true : !isSelected && !!e.animated,
        interactionWidth: 30, // พื้นที่รับคลิกเมาส์
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeOpacity: strokeOpacity,
          cursor: "pointer",
          transition: "stroke-opacity 0.3s ease, stroke 0.3s ease, stroke-width 0.3s ease",
        },
      };
    });
  }, [positionedEdges, selectedEdge, selectedSceneId]);

  // create editable react-flow state initialized from computed flowNodes/flowEdges
  const [rfNodes, setRfNodes, onNodesChangeRF] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChangeRF] = useEdgesState([]);

  // รายการโหนดที่ยังไม่ได้เชื่อมต่อ (Orphan Nodes - ทั้งโหนดไร้เส้นเชื่อม และโหนดที่มีเฉพาะขาออกแต่ไม่มีขาเข้า)
  const orphanNodes = useMemo(() => {
    return rfNodes.filter((n) => {
      if (n.id === "cursor-node") return false;
      const type = getNodeType(n.data);
      const isStartNode = type === "start" || type === "starting";

      // นับเส้นทางเชื่อมขาเข้า (Incoming Edges)
      const hasIncoming = rfEdges.some(
        (e) => String(e.target) === String(n.id) && e.id !== "cursor-edge"
      );

      // ถือว่ายังไม่เชื่อมต่อ ถ้าไม่ใช่จุดเริ่มต้น และ ไม่มีเส้นทางขาเข้า (hasIncoming === false)
      return (!isStartNode && !hasIncoming) || n.data?.status === WRITER_NODE_STATUS.ORPHAN || n.data?.status === "orphan";
    });
  }, [rfNodes, rfEdges]);

  // ฟังก์ชันแพนกล้องซูมไปยังโหนดฉากที่ระบุ (ใช้ตอนกดเลือก "ทางเลือกก่อนหน้า/ถัดไป" ใน Sidebar)
  const focusOnScene = useCallback((sceneId) => {
    if (!sceneId) return;
    const targetNode = rfNodes.find((n) => String(n.id) === String(sceneId));

    if (targetNode) {
      setCenter(targetNode.position.x + NODE_WIDTH / 2, targetNode.position.y + NODE_HEIGHT / 2, {
        zoom: 1.15,
        duration: 700,
      });
    }

    setSelectedSceneId(String(sceneId));
  }, [rfNodes, setCenter]);

  // คำนวณตำแหน่งโหนดจาก layout อัตโนมัติ (ไม่รวมตำแหน่งลากเองจาก backend)
  const computeAutoLayoutPositions = useCallback(() => {
    if (!uniqueNodes.length) return {};

    const nodeIds = uniqueNodes.map(getNodeId);
    const adjacency = {};
    const inDegree = {};
    const nodeLevels = {};

    nodeIds.forEach((id) => {
      adjacency[id] = [];
      inDegree[id] = 0;
    });

    const findMatchingNodeId = (raw) => {
      const candidate = normalizeId(raw);
      if (!candidate) return "";
      if (adjacency[candidate] !== undefined) return candidate;
      for (const id of nodeIds) {
        const sid = normalizeId(id);
        if (sid === candidate) return sid;
        if (sid.endsWith(candidate)) return sid;
        if (sid.includes(candidate) && candidate.length > 1) return sid;
      }
      return "";
    };

    normalizedEdges.forEach((edge) => {
      const source = findMatchingNodeId(edge.fromId);
      const target = findMatchingNodeId(edge.toId);
      if (source && adjacency[source] && inDegree[target] !== undefined) {
        adjacency[source].push(target);
        inDegree[target] += 1;
      }
    });

    const queue = [];
    nodeIds.forEach((id) => {
      const scene = uniqueNodes.find((n) => getNodeId(n) === id);
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
    normalizedEdges.forEach((edge) => {
      const src = findMatchingNodeId(edge.fromId);
      const tgt = findMatchingNodeId(edge.toId);
      if (src && tgt && parentMap[tgt]) {
        parentMap[tgt].push(src);
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

    return positions;
  }, [uniqueNodes, normalizedEdges]);

  // ฟังก์ชันจัดเรียงตำแหน่งอัตโนมัติและบันทึกลง Backend ทันที
  const handleAutoLayout = useCallback(async () => {
    const computedPositions = computeAutoLayoutPositions();
    if (!Object.keys(computedPositions).length) return;

    // 1. อัปเดตตำแหน่งบน React Flow UI ทันที
    setRfNodes((currentNds) =>
      currentNds.map((node) => {
        if (node.id === "cursor-node" || node.id.startsWith("temp-new-")) return node;
        const newPos = computedPositions[node.id];
        if (!newPos) return node;
        return {
          ...node,
          position: { x: newPos.x, y: newPos.y },
          data: {
            ...node.data,
            node_x: newPos.x,
            node_y: newPos.y,
            NodeX: newPos.x,
            NodeY: newPos.y,
          },
        };
      })
    );

    // 2. ยิง API บันทึกตำแหน่งใหม่ลง Database
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    showToast("กำลังจัดเรียงและบันทึกตำแหน่งอัตโนมัติ...", "info");

    try {
      const savePromises = Object.entries(computedPositions).map(([sceneId, pos]) =>
        axios.put(
          `${API_BASE_URL}/scenes/${sceneId}/position`,
          {
            node_x: pos.x,
            node_y: pos.y,
          },
          { headers }
        )
      );

      await Promise.all(savePromises);

      showToast("จัดเรียงและบันทึกตำแหน่งเรียบร้อยแล้ว", "success");
      await fetchStoryTreeAndChapters();
    } catch (err) {
      console.error("Auto layout save error:", err);
      showToast("จัดเรียงสำเร็จ แต่เกิดข้อผิดพลาดในการบันทึกบางตำแหน่ง", "warn");
    }
  }, [computeAutoLayoutPositions, setRfNodes, showToast, fetchStoryTreeAndChapters]);

  // ฟังก์ชันวนพาผู้ใช้ซูมไปยังตำแหน่งโหนดที่ยังไม่เชื่อมต่อทีละโหนด
  const handleFocusNextOrphan = useCallback(() => {
    if (orphanNodes.length === 0) {
      showToast("🎉 ยินดีด้วย! โหนดฉากทั้งหมดถูกเชื่อมต่อเรียบร้อยแล้ว", "success");
      return;
    }

    const idx = orphanIndex % orphanNodes.length;
    const targetNode = orphanNodes[idx];

    if (targetNode) {
      // แพนกล้องพาไปตรงกลางโหนดที่ไม่เชื่อมต่ออย่างนุ่มนวล
      setCenter(targetNode.position.x + NODE_WIDTH / 2, targetNode.position.y + NODE_HEIGHT / 2, {
        zoom: 1.15,
        duration: 700,
      });

      setSelectedSceneId(targetNode.id);
      const title = targetNode.data?.title || targetNode.data?.Title || getNodeTitle(targetNode.data);
      const chNum = targetNode.data?.chapterNumber ?? "?";
      const scNum = targetNode.data?.sceneNumber ?? "?";

      showToast(
        `พาไปยังฉากยังไม่เชื่อมต่อ (${idx + 1}/${orphanNodes.length}): ตอนที่ ${chNum} ฉาก ${scNum} "${title}"`,
        "info"
      );
      
      setOrphanIndex((prev) => (prev + 1) % orphanNodes.length);
    }
  }, [orphanNodes, orphanIndex, setCenter, showToast]);

  // Central connection cleanup function to reset all connection-related state
  const clearConnectionState = useCallback(() => {
    setConnectSource(null);
    setConnectTarget(null);
    setHoverTargetInfo(null);
    setIsModalOpen(false);
    setRfNodes((nds) => nds.filter((n) => n.id !== "cursor-node"));
    setRfEdges((eds) => eds.filter((e) => e.id !== "cursor-edge"));
  }, [setRfNodes, setRfEdges]);

  // Cleanup on unmount or route change
  useEffect(() => {
    return () => {
      clearConnectionState();
    };
  }, [clearConnectionState]);

  // sync when backend positions change or selection styling updates
  useEffect(() => {
    if (!treeData) return;

    setRfNodes((currentNds) => {
      const currentTempNodes = currentNds.filter(n => n.id.startsWith("temp-new-") || n.data?.isTemp);
      const hasCursor = currentNds.some(n => n.id === "cursor-node");
      const cursorN = hasCursor && interactionMode === "connect" && connectSource ? currentNds.find(n => n.id === "cursor-node") : null;
      
      let nextNds = Array.isArray(flowNodes) ? [...flowNodes] : [];
      
      // รักษาโหนดชั่วคราวที่ยังไม่บันทึกไว้ในกราฟ
      currentTempNodes.forEach((tempNode) => {
        if (!nextNds.some(n => n.id === tempNode.id)) {
          nextNds.push(tempNode);
        }
      });
      
      if (cursorN) nextNds.push(cursorN);
      return nextNds;
    });

    setRfEdges((currentEds) => {
      const hasCursorEdge = currentEds.some(e => e.id === "cursor-edge");
      const cursorE = hasCursorEdge && interactionMode === "connect" && connectSource ? currentEds.find(e => e.id === "cursor-edge") : null;
      
      let nextEds = Array.isArray(flowEdges) ? [...flowEdges] : [];
      if (cursorE) nextEds.push(cursorE);
      return nextEds;
    });
  }, [treeData, novelId, selectedSceneId, selectedEdge, interactionMode, connectSource, flowNodes, flowEdges, setRfNodes, setRfEdges]);

  // ดักจับและยกเลิก Connect Mode เมื่อออกจากโหมด
  const changeMode = useCallback((newMode) => {
    setInteractionMode(newMode);
    
    // เคลียร์ระบบโฟกัสและไฮไลท์กลับสู่กราฟโหมดปกติเมื่อเปลี่ยนเครื่องมือ
    setSelectedSceneId(null);
    setSelectedEdge(null);
    
    // รีเซ็ตโหมดการเชื่อมด้วยกลาง
    clearConnectionState();

    // รีเซ็ตตัวแปรโหมดลบโหนด
    setSceneToDelete(null);
    setShowDeleteModal(false);
  }, [clearConnectionState]);

  // keydown event listener สำหรับคีย์บอร์ดชอร์ตคัต 'C' และ 'Escape'
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.matches("input, textarea")) return;
      
      if (e.key === "Escape") {
        if (isModalOpen) {
          clearConnectionState();
        } else if (interactionMode === "connect" && connectSource) {
          // หากผู้ใช้ลากเส้นประอยู่ และกดยกเลิกด้วย ESC -> ให้สลายเส้นประและเคลียร์ต้นทางทันที แต่ยังคงอยู่ในโหมดเชื่อมต่อ
          clearConnectionState();
        } else if (interactionMode !== "select") {
          changeMode("select");
        }
      }
      
      if (e.key === "c" || e.key === "C" || e.key === "แ" || e.key === "ฉ") {
        changeMode(interactionMode === "connect" ? "select" : "connect");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interactionMode, isModalOpen, connectSource, changeMode, clearConnectionState]);

  // ดึงแผนแมพแบบผสม (โหนดจริงจากหลังบ้าน + โหนดว่างชั่วคราว) เพื่อสนับสนุนการกดและรายละเอียด Sidebar
  const sceneMap = useMemo(() => {
    const map = new Map();
    // โหลดโหนดหลังบ้าน
    uniqueNodes.forEach((scene) => map.set(getNodeId(scene), scene));
    
    rfNodes.forEach((node) => {
      if (node.id.startsWith("temp-new-") || node.data?.isTemp) {
        map.set(node.id, {
          id: node.id,
          title: node.data?.Title || "ฉากใหม่ยังไม่มีข้อมูล",
          content: node.data?.Content || "กรุณาคลิกแก้ไขเพื่อเขียนเนื้อเรื่อง",
          type: "normal",
          status: "draft",
          x: node.position?.x ?? 0,
          y: node.position?.y ?? 0,
          isTemp: true,
          chapter_id: node.data?.chapterId,
        });
      }
    });
    return map;
  }, [uniqueNodes, rfNodes]);

  const onConnect = useCallback((params) => {
    const edge = {
      ...params,
      id: `edge-${params.source}-${params.target}-${Date.now()}`,
      animated: true,
      type: "smoothstep",
    };
    setRfEdges((eds) => addEdge(edge, eds));
  }, [setRfEdges]);

  // ตรวจสอบก่อนเชื่อมเส้นทุกครั้ง (ครอบคลุมทั้งการลากเชื่อมใหม่ผ่าน Handle, ลากย้ายปลายเส้นเดิม/Reconnect,
  // และโหมดคลิกเชื่อมแบบ custom) อนุญาตให้เชื่อม "ไปข้างหน้า" เท่านั้น มี 2 ชั้นการตรวจ:
  //   1) เทียบลำดับฉาก (เลขตอน.เลขฉาก) - จับกรณีย้อนกลับที่ยังไม่เกิด Cycle จริงในกราฟ เช่น 1.2 -> 1.1
  //   2) ไล่กราฟ (wouldCreateCycle) - จับกรณีวนลูปจริงๆ / กันไว้สำหรับโหนดใหม่ที่ยังไม่มีเลขลำดับ
  // คืนค่า reason เป็น string (null = ผ่าน) เพื่อให้ฝั่ง UI เลือกข้อความ toast ที่ตรงประเด็นได้
  const getConnectionBlockReason = useCallback((sourceId, targetId) => {
    const source = normalizeId(sourceId);
    const target = normalizeId(targetId);
    if (!source || !target) return "invalid";
    if (source === target) return "self";

    // 1. ตรวจสอบว่าโหนดต้นทางเป็นฉากจบหรือไม่
    const srcScene = sceneMap?.get(source);
    const srcType = srcScene?.type || srcScene?.Type || "";
    const isSrcEnding = srcType === "ending" || srcScene?.is_ending === true || srcScene?.IsEnding === true || srcScene?.status === "ending" || srcScene?.status === WRITER_NODE_STATUS.ENDING;
    if (isSrcEnding) {
      return "source_ending";
    }

    // 2. ตรวจสอบว่าโหนดปลายทางเป็นจุดเริ่มต้นหรือไม่ (ห้ามมีเส้นทางชี้เข้าจุดเริ่ม)
    const tgtScene = sceneMap?.get(target);
    const tgtType = tgtScene?.type || tgtScene?.Type || "";
    const isTgtStart = tgtType === "start" || tgtType === "starting" || tgtScene?.status === "start" || tgtScene?.status === WRITER_NODE_STATUS.START;
    if (isTgtStart) {
      return "target_start";
    }

    if (isTargetAncestorOfSource(source, target, rfEdges)) return "cycle";
    return null;
  }, [rfEdges, sceneMap]);

  // หมายเหตุ: ฟังก์ชันนี้ถูกเรียกบ่อยระหว่างลาก (drag) จึงจงใจไม่แสดง toast ที่นี่ (React Flow จะแสดงเส้น
  // เป็นสีแดง/สถานะ invalid ให้เองตาม CSS ของ .react-flow__connection ในไฟล์ css) ส่วนโหมดคลิกเชื่อมแบบ custom
  // (handleNodeClick) จะแสดง toast อธิบายเหตุผลให้ผู้ใช้ชัดเจนอีกชั้นหนึ่ง
  const isValidConnection = useCallback((connection) => {
    return getConnectionBlockReason(connection?.source, connection?.target) === null;
  }, [getConnectionBlockReason]);

  // แปลงรหัส reason ที่ได้จาก getConnectionBlockReason() ให้เป็นข้อความอธิบายภาษาไทย
  // ใช้ร่วมกันทั้ง toast (คลิกเชื่อมจริง) และ hover tooltip (ก่อนคลิก) เพื่อไม่ให้ข้อความเพี้ยนกัน
  const getBlockReasonMessage = useCallback((blockReason) => {
    if (!blockReason) return null;
    switch (blockReason) {
      case "source_ending":
        return "ไม่สามารถเพิ่มทางเลือกได้ เนื่องจาก 'ฉากต้นทางคือฉากจบ' (ฉากจบไม่สามารถเพิ่มทางเลือกเชื่อมไปยังฉากอื่นได้อีก)";
      case "target_start":
        return "ไม่สามารถเชื่อมต่อไปยังฉากปลายทางที่เป็น 'จุดเริ่มต้นเรื่อง' ได้ (จุดเริ่มต้นทำหน้าที่เริ่มเดินเรื่องเท่านั้น ห้ามมีเส้นทางอื่นชี้กลับมาปัก)";
      case "self":
        return "ไม่สามารถเชื่อมต่อฉากเข้าหาตัวเองได้ กรุณาเลือกฉากปลายทางอื่นที่เป็นคนละฉากกัน";
      case "cycle":
        return "ไม่สามารถเชื่อมต่อได้เนื่องจากจะทำให้เกิด ' ลูป ' ในเนื้อเรื่อง กรุณาเลือกฉากปลายทางอื่นเพื่อดำเนินเรื่องไปข้างหน้า";
      default:
        return "ไม่สามารถเชื่อมโยงฉากเข้าหากันได้เนื่องจากผิดเงื่อนไขของกราฟ";
    }
  }, []);

  // ── Highlight ทั้งกราฟระหว่าง Connect Mode ──────────────────────────────
  // เมื่อมี connectSource แล้ว ให้คำนวณสถานะของทุกโหนดในกราฟล่วงหน้าว่าเป็น
  // "valid" (เชื่อมได้) หรือ "invalid" (เชื่อมไม่ได้) โดย reuse getConnectionBlockReason()
  // เดิมทั้งหมด ไม่เขียน validation ใหม่ ผลลัพธ์เก็บเป็น map: { [nodeId]: "valid" | "invalid" }
  const connectTargetStatusMap = useMemo(() => {
    const map = {};
    if (interactionMode !== "connect" || !connectSource) return map;

    rfNodes.forEach((n) => {
      if (n.id === "cursor-node" || n.id === connectSource.id) return;
      const blockReason = getConnectionBlockReason(connectSource.id, n.id);
      map[n.id] = blockReason ? "invalid" : "valid";
    });

    return map;
  }, [interactionMode, connectSource, rfNodes, getConnectionBlockReason]);

  // State เก็บ reason ของโหนดที่กำลัง hover อยู่ระหว่าง Connect Mode (แสดงผลทันทีบน banner โดยไม่ต้องรอ click)
  const [hoverTargetInfo, setHoverTargetInfo] = useState(null); // { status: "valid" | "invalid", message } | null

  const handleNodeMouseEnter = useCallback((evt, node) => {
    if (interactionMode !== "connect" || !connectSource || node.id === connectSource.id || node.id === "cursor-node") {
      return;
    }
    const blockReason = getConnectionBlockReason(connectSource.id, node.id);
    if (!blockReason) {
      setHoverTargetInfo({ status: "valid", message: "✅ สามารถเชื่อมกับฉากนี้ได้" });
    } else {
      setHoverTargetInfo({ status: "invalid", message: `🚫 ไม่สามารถเชื่อมได้: ${getBlockReasonMessage(blockReason)}` });
    }
  }, [interactionMode, connectSource, getConnectionBlockReason, getBlockReasonMessage]);

  const handleNodeMouseLeave = useCallback(() => {
    setHoverTargetInfo(null);
  }, []);

  // ฟังก์ชันสร้างโหนดเปล่าชั่วคราวลงกราฟตามพิกัด Canvas ทันทีโดยมีข้อมูลตอนที่เลือก
  const addSceneOnCanvasLocal = useCallback((x, y, chosenChapterId) => {
    const tempId = `temp-new-${Date.now()}`;
    
    const targetCh = novelChapters.find(ch => {
      const id = ch.id ?? ch.chapter_id ?? ch.ChapterID ?? ch.chapterId;
      return String(id) === String(chosenChapterId);
    });
    
    const chNumber = targetCh?.chapterNumber ?? targetCh?.episode ?? targetCh?.order_index ?? "?";
    const chTitle = targetCh?.title ?? "ตอนไม่มีชื่อ";
    
    const newNode = {
      id: tempId,
      type: "writerNode",
      position: { x: Math.round(x), y: Math.round(y) },
      data: {
        id: tempId,
        Title: "ฉากใหม่ยังไม่มีข้อมูล",
        Content: "ดับเบิลคลิกหรือกดแก้ไขเพื่อเขียนเนื้อเรื่อง",
        status: WRITER_NODE_STATUS.ORPHAN,
        chapterNumber: String(chNumber),
        sceneNumber: "?",
        chapterTitle: chTitle,
        x: Math.round(x),
        y: Math.round(y),
        isTemp: true, // กำหนดสถานะชั่วคราว
        chapterId: chosenChapterId, // แนบ chapter_id ลงในโหนด
        onEdit: (sceneId) => {
          onNavigate?.("scene-editor", {
            novelId,
            chapterId: chosenChapterId,
            sceneId: "new",
            x: Math.round(x),
            y: Math.round(y),
          });
        },
      },
    };
    
    setRfNodes((nds) => [...nds, newNode]);
    showToast("เพิ่มโหนดว่างเปล่าแล้ว! ดับเบิลคลิกหรือกดแก้ไขเพื่อเขียนเนื้อหา", "success");
    changeMode(interactionMode); // คงเครื่องมือปัจจุบันไว้ (ไม่บังคับกลับไปโหมดเลือก) แค่ล้าง state ค้าง
    setSelectedSceneId(tempId); // ตั้งค่าโฟกัสโหนดใหม่
  }, [novelId, onNavigate, showToast, changeMode, interactionMode, setRfNodes, novelChapters]);

  // ฟังก์ชันดักคลิกบน Canvas พื้นหลัง (แสดงโมดอลเลือกตอนสังกัด)
  const handlePaneClick = useCallback((e) => {
    if (interactionMode !== "add-node") {
      // หากอยู่ในโหมดเชื่อมโยง และมีฉากต้นทางที่กำลังลากเส้นเชื่อมคาอยู่ -> ให้ยกเลิกและทำลายเส้นประทิ้งทันที
      if (interactionMode === "connect" && connectSource) {
        clearConnectionState();
        return;
      }

      // หากคลิกที่ว่างในโหมดปกติ/เลือก -> ให้ถอนโฟกัสออกจากไฮไลท์เส้นทางกลับสู่กราฟปกติ
      setSelectedSceneId(null);
      return;
    }
    
    const flowPos = screenToFlowPosition({
      x: e.clientX,
      y: e.clientY
    });
    
    setPendingScenePosition({ x: flowPos.x, y: flowPos.y });
    if (novelChapters.length > 0) {
      const firstChId = novelChapters[0]?.id ?? novelChapters[0]?.chapter_id ?? novelChapters[0]?.ChapterID ?? novelChapters[0]?.chapterId;
      setSelectedMoveChapterId(String(firstChId));
    } else {
      setSelectedMoveChapterId("");
    }
    setShowAddScenePopup(true);
  }, [interactionMode, screenToFlowPosition, novelChapters, connectSource, clearConnectionState]);

  const edgeUpdateSuccessful = useRef(true);

  const handleAddSceneBackend = async () => {
    if (!pendingScenePosition || !selectedMoveChapterId) return;
    const token = localStorage.getItem("token");
    try {
      const payload = {
        novel_id: parseInt(novelId, 10),
        chapter_id: parseInt(selectedMoveChapterId, 10),
        title: newSceneTitle.trim() || "ฉากไม่มีชื่อ",
        content: "",
        x: Math.round(pendingScenePosition.x),
        y: Math.round(pendingScenePosition.y),
        type: "normal",
        status: "draft",
        is_ending: false,
        choices: []
      };
      
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      showToast("กำลังสร้างฉากใหม่...", "info");
      const response = await axios.post(`${API_BASE_URL}/scenes`, payload, { headers });
      
      if (response.status === 200 || response.status === 201) {
        showToast("สร้างฉากใหม่เรียบร้อยแล้ว", "success");
        await fetchStoryTreeAndChapters();
        window.dispatchEvent(new Event("novel-data-updated"));
      }
    } catch (err) {
      console.error("Create scene error:", err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || "เกิดข้อผิดพลาดในการสร้างฉาก (ชื่อฉากอาจซ้ำในตอนเดียวกัน)";
      showToast(errMsg, "warn");
    } finally {
      setShowAddScenePopup(false);
      setPendingScenePosition(null);
      setNewSceneTitle("");
    }
  };

  const handleEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    
    // หากอยู่ในโหมดเชื่อมโยง (Connect) หรือโหมดเลื่อน (Pan) ให้ข้ามการจัดการเส้นเชื่อม (ให้โหมดเลือก select สามารถกดได้ปกติ)
    if (modeRef.current === "connect" || modeRef.current === "pan") {
      return;
    }

    // โหมดลบ
    if (modeRef.current === "delete") {
      setSelectedEdge(edge);
      setShowDeleteChoiceConfirm(true);
      return;
    }

    // โหมดปกติ หรือโหมดอื่นๆ
    setSelectedEdge(edge);
    setEditEdgeLabel(edge.label || "");
    setEditEdgeSource(String(edge.source));
    setEditEdgeTarget(String(edge.target));
    setShowEdgeModal(true);
  }, []);

  // ==========================================
  // React Flow Reconnect Edge (ลากย้ายเส้น)
  // ==========================================
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback((oldEdge, newConnection) => {
    edgeUpdateSuccessful.current = true;
    setPendingEdgeUpdate({ oldEdge, newConnection });
    setShowEdgeUpdateConfirm(true);
  }, []);

  const onEdgeUpdateEnd = useCallback((event, edge) => {
    if (!edgeUpdateSuccessful.current) {
      // ปล่อยเมาส์ทับโหนดอื่น แต่ onEdgeUpdate ไม่ถูกเรียก (แปลว่าไม่ผ่าน isValidConnection คือ
      // ย้อนกลับ/วนลูป หรือปลายทางไม่ถูกต้อง) -> แจ้งเตือนเหตุผลให้ชัดเจน แทนที่จะขึ้น popup ลบเส้น
      const droppedOnNode = event?.target?.closest?.(".react-flow__node");
      if (droppedOnNode) {
        showToast(
          "ไม่สามารถย้ายจุดเชื่อมต่อไปยังฉากนี้ได้ เพราะเป็นการเชื่อมย้อนกลับไปยังฉากก่อนหน้า หรือจะทำให้เกิดการวนลูปของเนื้อเรื่อง (เชื่อมได้เฉพาะไปข้างหน้าเท่านั้น)",
          "warn"
        );
        fetchStoryTreeAndChapters(); // ดึงตำแหน่งเส้นเดิมกลับมา ป้องกันเส้นค้างผิดตำแหน่งบนจอ
      } else {
        // ปล่อยเมาส์บนพื้นที่ว่าง (ลากหลุดออกจากโหนดใดๆ) -> ถือว่าผู้ใช้ต้องการลบเส้นนี้ (พฤติกรรมเดิม)
        setSelectedEdge(edge);
        setShowDeleteChoiceConfirm(true);
      }
    }
    edgeUpdateSuccessful.current = true;
  }, [showToast, fetchStoryTreeAndChapters]);

  const handleConfirmEdgeUpdate = async () => {
    if (!pendingEdgeUpdate) return;
    const { oldEdge, newConnection } = pendingEdgeUpdate;
    
    const choiceIdRaw = oldEdge.data?.choice_id ?? oldEdge.data?.id ?? oldEdge.data?.ChoiceID ?? oldEdge.data?.ID;
    const choiceIdStr = normalizeId(choiceIdRaw);
    const oldSourceId = normalizeId(oldEdge.source);
    const oldTargetId = normalizeId(oldEdge.target);
    const newSourceId = normalizeId(newConnection.source);
    const newTargetId = normalizeId(newConnection.target);
    const choiceLabel = oldEdge.label || "เลือกเส้นทางนี้";

    // อนุญาตให้มีหลายทางเลือกไปยังฉากปลายทางเดียวกันได้ แต่ต้องไม่ซ้ำทั้งต้นทาง+ปลายทาง+ชื่อทางเลือก
    // (ไม่นับเส้นเดิมที่กำลังลากย้ายอยู่ตอนนี้ ไม่งั้นจะชนกับตัวมันเอง)
    const normalizedChoiceLabel = String(choiceLabel).trim().toLowerCase();
    const isDuplicateAfterMove = normalizedEdges.some((e) => {
      if (String(e.id) === String(oldEdge.id)) return false; // ข้ามเส้นเดิมที่กำลังย้าย
      return (
        String(e.fromId) === String(newSourceId) &&
        String(e.toId) === String(newTargetId) &&
        getChoiceLabel(e).trim().toLowerCase() === normalizedChoiceLabel
      );
    });
    if (isDuplicateAfterMove) {
      showToast("มีตัวเลือกชื่อนี้ไปยังฉากเดียวกันอยู่แล้ว กรุณาแก้ไขชื่อทางเลือกให้ไม่ซ้ำก่อนย้ายเส้น", "warn");
      setShowEdgeUpdateConfirm(false);
      setPendingEdgeUpdate(null);
      fetchStoryTreeAndChapters(); // คืนตำแหน่งเส้นเดิมกลับมาบนจอ
      return;
    }

    const token = localStorage.getItem("token");
    const headers = { 
      "Content-Type": "application/json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      showToast("กำลังบันทึกการย้ายเส้น...", "info");
      
      const oldSourceRes = await axios.get(`${API_BASE_URL}/scenes/${oldSourceId}`, { headers });
      const oldSourceData = oldSourceRes.data?.data || oldSourceRes.data;
      let oldChoices = Array.isArray(oldSourceData.choices) ? oldSourceData.choices : [];

      const isSourceChanged = oldSourceId !== newSourceId;

      if (isSourceChanged) {
        // 1. ลบทางเลือกออกจากต้นทางเดิม
        const updatedOldChoices = oldChoices.filter((c) => {
          const cId = normalizeId(c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID);
          const cToScene = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
          if (choiceIdStr && cId && choiceIdStr === cId) return false;
          if (oldTargetId && cToScene && oldTargetId === cToScene) return false;
          return true;
        });

        const oldIsEnding = !!(oldSourceData.is_ending || oldSourceData.IsEnding);
        const oldType = oldSourceData.type || oldSourceData.Type || "normal";

        const oldPayload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(oldSourceData.chapter_id ?? oldSourceData.ChapterID ?? 0, 10),
          title: (oldSourceData.title || oldSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: oldSourceData.content || oldSourceData.Content || "",
          x: Math.round(oldSourceData.x ?? oldSourceData.X ?? 0),
          y: Math.round(oldSourceData.y ?? oldSourceData.Y ?? 0),
          type: oldIsEnding ? "ending" : oldType === "ending" ? "normal" : oldType,
          status: oldSourceData.status || oldSourceData.Status || "draft",
          ending_title: oldIsEnding ? (oldSourceData.ending_title || "") : "",
          ending_type: oldIsEnding ? (oldSourceData.ending_type || "") : "",
          ending_description: oldIsEnding ? (oldSourceData.ending_description || "") : "",
          is_ending: oldIsEnding,
          choices: updatedOldChoices.map((c) => ({
            ...(c.choice_id ?? c.id ? { choice_id: parseInt(c.choice_id ?? c.id, 10) } : {}),
            label: c.label || c.text || "เลือกเส้นทางนี้",
            text: c.label || c.text || "เลือกเส้นทางนี้",
            targetSubScene: String(c.targetSubScene ?? c.to_scene_id ?? ""),
            to_scene_id: parseInt(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene ?? "0", 10),
          })),
        };
        await axios.put(`${API_BASE_URL}/scenes/${oldSourceId}`, oldPayload, { headers });

        // 2. ไปเพิ่มในต้นทางใหม่พร้อมระบุปลายทางใหม่
        const newSourceRes = await axios.get(`${API_BASE_URL}/scenes/${newSourceId}`, { headers });
        const newSourceData = newSourceRes.data?.data || newSourceRes.data;
        let newChoices = Array.isArray(newSourceData.choices) ? newSourceData.choices : [];
        
        newChoices.push({
          label: choiceLabel,
          text: choiceLabel,
          to_scene_id: parseInt(newTargetId, 10),
          targetSubScene: String(newTargetId)
        });

        const newIsEnding = !!(newSourceData.is_ending || newSourceData.IsEnding);
        const newType = newSourceData.type || newSourceData.Type || "normal";

        const newPayload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(newSourceData.chapter_id ?? newSourceData.ChapterID ?? 0, 10),
          title: (newSourceData.title || newSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: newSourceData.content || newSourceData.Content || "",
          x: Math.round(newSourceData.x ?? newSourceData.X ?? 0),
          y: Math.round(newSourceData.y ?? newSourceData.Y ?? 0),
          type: newIsEnding ? "ending" : newType === "ending" ? "normal" : newType,
          status: newSourceData.status || newSourceData.Status || "draft",
          ending_title: newIsEnding ? (newSourceData.ending_title || "") : "",
          ending_type: newIsEnding ? (newSourceData.ending_type || "") : "",
          ending_description: newIsEnding ? (newSourceData.ending_description || "") : "",
          is_ending: newIsEnding,
          choices: newChoices.map((c) => ({
            ...(c.choice_id ?? c.id ? { choice_id: parseInt(c.choice_id ?? c.id, 10) } : {}),
            label: c.label || c.text || "เลือกเส้นทางนี้",
            text: c.label || c.text || "เลือกเส้นทางนี้",
            targetSubScene: String(c.targetSubScene ?? c.to_scene_id ?? ""),
            to_scene_id: parseInt(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene ?? "0", 10),
          })),
        };
        await axios.put(`${API_BASE_URL}/scenes/${newSourceId}`, newPayload, { headers });
      } else {
        // ต้นทางเดิม แต่เปลี่ยนปลายทาง
        let matched = false;
        const updatedChoices = oldChoices.map((c) => {
          const cId = normalizeId(c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID);
          const cToScene = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
          if ((choiceIdStr && cId && choiceIdStr === cId) || (!matched && oldTargetId && cToScene && oldTargetId === cToScene)) {
            matched = true;
            return {
              ...c,
              label: choiceLabel,
              text: choiceLabel,
              to_scene_id: parseInt(newTargetId, 10),
              targetSubScene: String(newTargetId)
            };
          }
          return c;
        });

        if (!matched) {
          updatedChoices.push({
            label: choiceLabel,
            text: choiceLabel,
            to_scene_id: parseInt(newTargetId, 10),
            targetSubScene: String(newTargetId)
          });
        }

        const oldIsEnding = !!(oldSourceData.is_ending || oldSourceData.IsEnding);
        const oldType = oldSourceData.type || oldSourceData.Type || "normal";

        const payload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(oldSourceData.chapter_id ?? oldSourceData.ChapterID ?? 0, 10),
          title: (oldSourceData.title || oldSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: oldSourceData.content || oldSourceData.Content || "",
          x: Math.round(oldSourceData.x ?? oldSourceData.X ?? 0),
          y: Math.round(oldSourceData.y ?? oldSourceData.Y ?? 0),
          type: oldIsEnding ? "ending" : oldType === "ending" ? "normal" : oldType,
          status: oldSourceData.status || oldSourceData.Status || "draft",
          ending_title: oldIsEnding ? (oldSourceData.ending_title || "") : "",
          ending_type: oldIsEnding ? (oldSourceData.ending_type || "") : "",
          ending_description: oldIsEnding ? (oldSourceData.ending_description || "") : "",
          is_ending: oldIsEnding,
          choices: updatedChoices.map((c) => ({
            ...(c.choice_id ?? c.id ? { choice_id: parseInt(c.choice_id ?? c.id, 10) } : {}),
            label: c.label || c.text || "เลือกเส้นทางนี้",
            text: c.label || c.text || "เลือกเส้นทางนี้",
            targetSubScene: String(c.targetSubScene ?? c.to_scene_id ?? ""),
            to_scene_id: parseInt(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene ?? "0", 10),
          })),
        };
        await axios.put(`${API_BASE_URL}/scenes/${oldSourceId}`, payload, { headers });
      }

      setRfEdges((eds) =>
        eds.map((e) => {
          if (e.id === oldEdge.id) {
            return {
              ...e,
              source: String(newSourceId),
              target: String(newTargetId),
              label: choiceLabel,
            };
          }
          return e;
        })
      );

      showToast("ย้ายจุดเชื่อมต่อสำเร็จแล้ว", "success");
      await fetchStoryTreeAndChapters();
      window.dispatchEvent(new Event("novel-data-updated"));
    } catch (err) {
      console.error("Confirm edge update error:", err);
      showToast("ไม่สามารถย้ายเส้นทางเลือกได้", "warn");
    } finally {
      setShowEdgeUpdateConfirm(false);
      setPendingEdgeUpdate(null);
    }
  };

  const handleUpdateConnection = async () => {
    if (!selectedEdge) return;

    const choiceIdRaw = selectedEdge.data?.ID ?? 
                        selectedEdge.data?.id ?? 
                        selectedEdge.data?.choice_id ?? 
                        selectedEdge.data?.ChoiceID ?? 
                        selectedEdge.data?.choiceId ?? 
                        selectedEdge.id;
                        
    const choiceIdStr = normalizeId(choiceIdRaw);
    const oldSourceId = normalizeId(selectedEdge.source);
    const oldTargetId = normalizeId(selectedEdge.target);
    const newSourceId = normalizeId(editEdgeSource);
    const newTargetId = normalizeId(editEdgeTarget);
    const newLabel = (editEdgeLabel || "").trim();

    const isSourceChanged = oldSourceId !== newSourceId;
    const isTargetOrLabelChanged = oldTargetId !== newTargetId || newLabel !== (selectedEdge.label || "");

    const token = localStorage.getItem("token");
    const headers = { 
      "Content-Type": "application/json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      showToast("กำลังบันทึกการเปลี่ยนแปลง...", "info");
      
      // ดึงรายละเอียดฉากต้นทางเดิม
      const oldSourceRes = await axios.get(`${API_BASE_URL}/scenes/${oldSourceId}`, { headers });
      const oldSourceData = oldSourceRes.data?.data || oldSourceRes.data;
      
      let oldChoices = Array.isArray(oldSourceData.choices) ? oldSourceData.choices : [];

      if (isSourceChanged) {
        // กรณีเปลี่ยนต้นทาง:
        // 1. ลบออกจากต้นทางเดิม
        const updatedOldChoices = oldChoices.filter((c) => {
          const cId = normalizeId(c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID);
          const cToScene = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
          if (choiceIdStr && cId && choiceIdStr === cId) return false;
          if (oldTargetId && cToScene && oldTargetId === cToScene) return false;
          return true;
        });

        const oldIsEnding = !!(oldSourceData.is_ending || oldSourceData.IsEnding);
        const oldType = oldSourceData.type || oldSourceData.Type || "normal";
        
        const oldPayload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(oldSourceData.chapter_id ?? oldSourceData.ChapterID ?? 0, 10),
          title: (oldSourceData.title || oldSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: oldSourceData.content || oldSourceData.Content || "",
          x: Math.round(oldSourceData.x ?? oldSourceData.X ?? 0),
          y: Math.round(oldSourceData.y ?? oldSourceData.Y ?? 0),
          type: oldIsEnding ? "ending" : oldType === "ending" ? "normal" : oldType,
          status: oldSourceData.status || oldSourceData.Status || "draft",
          ending_title: oldIsEnding ? (oldSourceData.ending_title || "") : "",
          ending_type: oldIsEnding ? (oldSourceData.ending_type || "") : "",
          ending_description: oldIsEnding ? (oldSourceData.ending_description || "") : "",
          is_ending: oldIsEnding,
          choices: updatedOldChoices.map((c) => {
            const cId = c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID;
            const targetStr = String(c.targetSubScene ?? c.to_scene_id ?? c.toSceneId ?? "");
            const toSceneIdCandidate = parseInt(targetStr, 10);
            return {
              ...(cId && !String(cId).startsWith("choice-new-") && !isNaN(Number(cId)) ? { choice_id: parseInt(String(cId), 10) } : {}),
              label: c.label || c.text || "เลือกเส้นทางนี้",
              text: c.label || c.text || "เลือกเส้นทางนี้",
              targetSubScene: targetStr,
              to_scene_id: Number.isNaN(toSceneIdCandidate) ? 0 : toSceneIdCandidate,
            };
          })
        };
        await axios.put(`${API_BASE_URL}/scenes/${oldSourceId}`, oldPayload, { headers });

        // 2. ไปเพิ่มในต้นทางใหม่
        const newSourceRes = await axios.get(`${API_BASE_URL}/scenes/${newSourceId}`, { headers });
        const newSourceData = newSourceRes.data?.data || newSourceRes.data;
        let newChoices = Array.isArray(newSourceData.choices) ? newSourceData.choices : [];
        
        newChoices.push({
          label: newLabel || "เลือกเส้นทางนี้",
          text: newLabel || "เลือกเส้นทางนี้",
          to_scene_id: parseInt(newTargetId, 10),
          targetSubScene: String(newTargetId)
        });

        const newIsEnding = !!(newSourceData.is_ending || newSourceData.IsEnding);
        const newType = newSourceData.type || newSourceData.Type || "normal";

        const newPayload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(newSourceData.chapter_id ?? newSourceData.ChapterID ?? 0, 10),
          title: (newSourceData.title || newSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: newSourceData.content || newSourceData.Content || "",
          x: Math.round(newSourceData.x ?? newSourceData.X ?? 0),
          y: Math.round(newSourceData.y ?? newSourceData.Y ?? 0),
          type: newIsEnding ? "ending" : newType === "ending" ? "normal" : newType,
          status: newSourceData.status || newSourceData.Status || "draft",
          ending_title: newIsEnding ? (newSourceData.ending_title || "") : "",
          ending_type: newIsEnding ? (newSourceData.ending_type || "") : "",
          ending_description: newIsEnding ? (newSourceData.ending_description || "") : "",
          is_ending: newIsEnding,
          choices: newChoices.map((c) => {
            const cId = c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID;
            const targetStr = String(c.targetSubScene ?? c.to_scene_id ?? c.toSceneId ?? "");
            const toSceneIdCandidate = parseInt(targetStr, 10);
            return {
              ...(cId && !String(cId).startsWith("choice-new-") && !isNaN(Number(cId)) ? { choice_id: parseInt(String(cId), 10) } : {}),
              label: c.label || c.text || "เลือกเส้นทางนี้",
              text: c.label || c.text || "เลือกเส้นทางนี้",
              targetSubScene: targetStr,
              to_scene_id: Number.isNaN(toSceneIdCandidate) ? 0 : toSceneIdCandidate,
            };
          })
        };
        await axios.put(`${API_BASE_URL}/scenes/${newSourceId}`, newPayload, { headers });
        
      } else if (isTargetOrLabelChanged) {
        // กรณีไม่เปลี่ยนต้นทาง แต่เปลี่ยนปลายทางหรือข้อความ
        let matched = false;
        const updatedChoices = oldChoices.map((c) => {
          const cId = normalizeId(c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID);
          const cToScene = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
          if ((choiceIdStr && cId && choiceIdStr === cId) || (!matched && oldTargetId && cToScene && oldTargetId === cToScene)) {
            matched = true;
            return {
              ...c,
              label: newLabel || "เลือกเส้นทางนี้",
              text: newLabel || "เลือกเส้นทางนี้",
              to_scene_id: parseInt(newTargetId, 10),
              targetSubScene: String(newTargetId)
            };
          }
          return c;
        });

        if (!matched) {
          updatedChoices.push({
            label: newLabel || "เลือกเส้นทางนี้",
            text: newLabel || "เลือกเส้นทางนี้",
            to_scene_id: parseInt(newTargetId, 10),
            targetSubScene: String(newTargetId)
          });
        }

        const oldIsEnding = !!(oldSourceData.is_ending || oldSourceData.IsEnding);
        const oldType = oldSourceData.type || oldSourceData.Type || "normal";

        const payload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(oldSourceData.chapter_id ?? oldSourceData.ChapterID ?? 0, 10),
          title: (oldSourceData.title || oldSourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: oldSourceData.content || oldSourceData.Content || "",
          x: Math.round(oldSourceData.x ?? oldSourceData.X ?? 0),
          y: Math.round(oldSourceData.y ?? oldSourceData.Y ?? 0),
          type: oldIsEnding ? "ending" : oldType === "ending" ? "normal" : oldType,
          status: oldSourceData.status || oldSourceData.Status || "draft",
          ending_title: oldIsEnding ? (oldSourceData.ending_title || "") : "",
          ending_type: oldIsEnding ? (oldSourceData.ending_type || "") : "",
          ending_description: oldIsEnding ? (oldSourceData.ending_description || "") : "",
          is_ending: oldIsEnding,
          choices: updatedChoices.map((c) => {
            const cId = c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID;
            const targetStr = String(c.targetSubScene ?? c.to_scene_id ?? c.toSceneId ?? "");
            const toSceneIdCandidate = parseInt(targetStr, 10);
            return {
              ...(cId && !String(cId).startsWith("choice-new-") && !isNaN(Number(cId)) ? { choice_id: parseInt(String(cId), 10) } : {}),
              label: c.label || c.text || "เลือกเส้นทางนี้",
              text: c.label || c.text || "เลือกเส้นทางนี้",
              targetSubScene: targetStr,
              to_scene_id: Number.isNaN(toSceneIdCandidate) ? 0 : toSceneIdCandidate,
            };
          })
        };
        await axios.put(`${API_BASE_URL}/scenes/${oldSourceId}`, payload, { headers });
      }

      // อัปเดต React Flow state ฝั่ง Frontend ทันที
      setRfEdges((eds) =>
        eds.map((e) => {
          if (e.id === selectedEdge.id) {
            return {
              ...e,
              source: String(newSourceId),
              target: String(newTargetId),
              label: newLabel || "",
            };
          }
          return e;
        })
      );

      showToast("แก้ไขเส้นทางเลือกสำเร็จแล้ว", "success");
      await fetchStoryTreeAndChapters();
      window.dispatchEvent(new Event("novel-data-updated"));
      setShowEdgeModal(false);
      setSelectedEdge(null);
      changeMode(interactionMode); // คงเครื่องมือปัจจุบันไว้ ไม่บังคับสลับกลับไปโหมดเลือก
    } catch (err) {
      console.error("Update connection error:", err);
      showToast("ไม่สามารถบันทึกการแก้ไขเส้นได้", "warn");
    }
  };

  const handleDeleteConnection = async () => {
    if (!selectedEdge) return;
    
    const selectedEdgeId = selectedEdge.id;
    const sourceId = selectedEdge.source;
    const targetId = selectedEdge.target;
    const edgeLabelText = (selectedEdge.label || selectedEdge.data?.label || selectedEdge.data?.text || "").trim();

    const token = localStorage.getItem("token");
    const headers = { 
      "Content-Type": "application/json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      showToast("กำลังลบทางเลือก...", "info");
      
      // 1. ดึงรายละเอียดฉากต้นทางเพื่อเสาะหา choice_id ที่เป็นตัวเลขจริงๆ จากฐานข้อมูล
      const sourceRes = await axios.get(`${API_BASE_URL}/scenes/${sourceId}`, { headers });
      const sourceData = sourceRes.data?.data || sourceRes.data;
      const choicesList = Array.isArray(sourceData.choices) ? sourceData.choices : [];
      
      // ค้นหา Choice ที่มีฉากปลายทางตรงกับ targetId และมีข้อความปุ่มตรงกัน
      const matchedChoice = choicesList.find((c) => {
        const cToSceneId = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
        const cText = (c.label ?? c.text ?? "").trim().toLowerCase();
        const expectedTargetId = normalizeId(targetId);
        const expectedLabel = edgeLabelText.toLowerCase();
        return cToSceneId === expectedTargetId && (cText === expectedLabel || expectedLabel === "" || cText === "");
      });

      const actualChoiceId = matchedChoice?.choice_id ?? matchedChoice?.id ?? matchedChoice?.ChoiceID ?? matchedChoice?.ID;
      let isSuccess = false;

      // 2. ลองยิง DELETE /choices/:id ของหลังบ้านโดยตรง (มีประสิทธิภาพสูงสุด ลบออกจาก DB จริง)
      if (actualChoiceId && !isNaN(Number(actualChoiceId))) {
        try {
          const res = await axios.delete(`${API_BASE_URL}/choices/${actualChoiceId}`, { headers });
          if (res.status === 200 || res.status === 204 || res.data?.status === "success") {
            isSuccess = true;
          }
        } catch (e) {
          console.warn("Direct choice DELETE endpoint failed, falling back to scene update...", e);
        }
      }

      // 3. หากไม่พบ choice_id หรือลบทางตรงไม่สำเร็จ ค่อย fallback ไปกรองและยิง PUT /scenes/:id
      if (!isSuccess) {
        const updatedChoices = choicesList.filter((c) => {
          const cId = normalizeId(c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID);
          const cToSceneId = normalizeId(c.to_scene_id ?? c.toSceneId ?? c.targetSubScene);
          const cText = (c.label ?? c.text ?? "").trim();

          if (actualChoiceId && cId && String(actualChoiceId) === cId) return false;
          if (targetId && cToSceneId && targetId === cToSceneId) {
            if (!actualChoiceId || cId === String(actualChoiceId) || !edgeLabelText || cText === edgeLabelText) {
              return false;
            }
          }
          return true;
        });

        const currentIsEnding = !!(sourceData.is_ending || sourceData.IsEnding);
        const sceneTypeVal = sourceData.type || sourceData.Type || "normal";

        const payload = {
          novel_id: parseInt(novelId, 10),
          chapter_id: parseInt(sourceData.chapter_id ?? sourceData.ChapterID ?? 0, 10),
          title: (sourceData.title || sourceData.Title || "ฉากไม่มีชื่อ").trim(),
          content: sourceData.content || sourceData.Content || "",
          x: Math.round(sourceData.x ?? sourceData.X ?? 0),
          y: Math.round(sourceData.y ?? sourceData.Y ?? 0),
          type: currentIsEnding ? "ending" : sceneTypeVal === "ending" ? "normal" : sceneTypeVal,
          status: sourceData.status || sourceData.Status || "draft",
          ending_title: currentIsEnding ? (sourceData.ending_title || "") : "",
          ending_type: currentIsEnding ? (sourceData.ending_type || "") : "",
          ending_description: currentIsEnding ? (sourceData.ending_description || "") : "",
          is_ending: currentIsEnding,
          choices: updatedChoices.map((c) => {
            const cId = c.choice_id ?? c.id ?? c.ChoiceID ?? c.ID;
            const targetStr = String(c.targetSubScene ?? c.to_scene_id ?? c.toSceneId ?? "");
            const toSceneIdCandidate = parseInt(targetStr, 10);

            return {
              ...(cId && !String(cId).startsWith("choice-new-") ? { choice_id: parseInt(String(cId), 10) } : {}),
              label: c.label || c.text || "เลือกเส้นทางนี้",
              text: c.label || c.text || "เลือกเส้นทางนี้",
              targetSubScene: targetStr,
              to_scene_id: Number.isNaN(toSceneIdCandidate) ? 0 : toSceneIdCandidate,
            };
          }),
        };

        await axios.put(`${API_BASE_URL}/scenes/${sourceId}`, payload, { headers });
      }

      // 4. อัปเดตผัง React Flow State ทันทีใน Client
      setRfEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId && e.id !== String(actualChoiceId)));

      showToast("ลบทางเลือกสำเร็จเรียบร้อยแล้ว", "success");
      await fetchStoryTreeAndChapters();
      window.dispatchEvent(new Event("novel-data-updated"));

    } catch (err) {
      console.error("Delete connection error:", err);
      showToast("เกิดข้อผิดพลาดในการลบทางเลือก", "warn");
    } finally {
      setShowDeleteChoiceConfirm(false);
      setShowEdgeModal(false);
      setSelectedEdge(null);
      changeMode(interactionMode);
    }
  };


  const handleConfirmDelete = useCallback(async () => {
    if (!sceneToDelete) return;
    const sceneId = sceneToDelete.id;
    const isTemp = sceneToDelete.data?.isTemp || String(sceneId).startsWith("temp-new-");
    
    try {
      if (isTemp) {
        // ลบจาก client-side ทันที
        setRfNodes((nds) => nds.filter((n) => n.id !== sceneId));
        setRfEdges((eds) => eds.filter((e) => e.source !== sceneId && e.target !== sceneId));
        showToast("ลบฉากชั่วคราวสำเร็จแล้ว", "success");
        window.dispatchEvent(new Event("novel-data-updated"));
      } else {
        // ยิง API ลบที่ backend
        const token = localStorage.getItem("token");
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        
        await axios.delete(`${API_BASE_URL}/scenes/${sceneId}`, { headers });
        
        // ดึงข้อมูล story-tree ใหม่
        const response = await axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree`);
        setTreeData(response.data?.data || response.data || null);
        showToast("ลบฉากเรียบร้อยแล้ว", "success");
        window.dispatchEvent(new Event("novel-data-updated"));
      }
      
      // ล้างค่าและคงเครื่องมือปัจจุบันไว้ (ไม่บังคับกลับเป็น select)
      setShowDeleteModal(false);
      setSceneToDelete(null);
      changeMode(interactionMode);
      setSelectedSceneId(null);
    } catch (err) {
      console.error("Delete scene error:", err);
      showToast("เกิดข้อผิดพลาดในการลบฉาก", "warn");
    }
  }, [sceneToDelete, novelId, showToast, changeMode, interactionMode, setRfNodes, setRfEdges]);

  const onNodesChangeWrapper = useCallback((changes) => {
    onNodesChangeRF(changes);
  }, [onNodesChangeRF]);

  // บันทึกตำแหน่ง node ลง Backend หลังจาก Writer ลาก node เสร็จ (drag stop)
  const onNodeDragStop = useCallback(async (event, node) => {
    if (!node?.id || node.id === "cursor-node" || node.id.startsWith("temp-new-")) return;

    const newX = Math.round(node.position.x);
    const newY = Math.round(node.position.y);

    // 1. อัปเดตตำแหน่งฉากใน treeData state ฝั่ง Frontend ทันที ป้องกันไม่ให้เปลี่ยนเครื่องมือแล้วตำแหน่งเด้งกลับที่เดิม
    setTreeData((prevTree) => {
      if (!prevTree) return prevTree;
      const scenesKey = prevTree.Scenes ? "Scenes" : prevTree.scenes ? "scenes" : "nodes";
      const scenes = prevTree[scenesKey] || [];
      if (!Array.isArray(scenes)) return prevTree;

      const updatedScenes = scenes.map((sc) => {
        const scId = normalizeId(sc.id ?? sc.ID ?? sc.scene_id ?? sc.SceneID);
        if (scId === normalizeId(node.id)) {
          return {
            ...sc,
            node_x: newX,
            node_y: newY,
            NodeX: newX,
            NodeY: newY,
            x: newX,
            y: newY,
          };
        }
        return sc;
      });

      return {
        ...prevTree,
        [scenesKey]: updatedScenes,
      };
    });

    // 2. ส่งข้อมูลบันทึกตำแหน่งใหม่ลง Database ฝั่ง Backend ทันที
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      await axios.put(
        `${API_BASE_URL}/scenes/${node.id}/position`,
        {
          node_x: newX,
          node_y: newY,
        },
        { headers }
      );
    } catch (err) {
      console.error("Save node position error:", err);
      showToast("บันทึกตำแหน่ง node ไม่สำเร็จ", "warn");
    }
  }, [showToast, setTreeData]);

  const onEdgesChangeWrapper = useCallback((changes) => {
    onEdgesChangeRF(changes);
  }, [onEdgesChangeRF]);

  // ดักจับการเคลื่อนที่ของเมาส์บนบอร์ดเพื่ออัปเดตเส้นประวิ่งตามเมาส์
  const handlePaneMouseMove = useCallback((e) => {
    // อ้างอิงจาก Ref เพื่อรับค่าล่าสุดใน Event loop ทันที ป้องกันเส้นค้างเมื่อออกจากโหมดหรือกดยกเลิก
    if (modeRef.current !== "connect" || !connectSourceRef.current) return;
    
    const flowPos = screenToFlowPosition({
      x: e.clientX,
      y: e.clientY
    });
    
    setRfNodes((nds) => {
      const hasCursor = nds.some(n => n.id === "cursor-node");
      if (!hasCursor) {
        const cursorNode = {
          id: "cursor-node",
          type: "default",
          position: flowPos,
          style: { opacity: 0, width: 0, height: 0, pointerEvents: "none" },
          data: {}
        };
        return [...nds, cursorNode];
      }
      return nds.map((n) => n.id === "cursor-node" ? { ...n, position: flowPos } : n);
    });
    
    setRfEdges((eds) => {
      const hasCursorEdge = eds.some(e => e.id === "cursor-edge");
      if (!hasCursorEdge) {
        const cursorEdge = {
          id: "cursor-edge",
          source: String(connectSourceRef.current.id),
          target: "cursor-node",
          type: "smoothstep",
          animated: true,
          style: { stroke: "#2563EB", strokeWidth: 2, strokeDasharray: "5,5" }
        };
        return [...eds, cursorEdge];
      }
      return eds;
    });
  }, [screenToFlowPosition, setRfNodes, setRfEdges]);

  // ดับเบิลคลิกเพื่อเปิด Scene Editor หน้าเขียนเนื้อหา
  const handleNodeDoubleClick = useCallback((evt, node) => {
    const currentMode = modeRef.current;
    if (currentMode === "connect" || currentMode === "add-node") return;
    
    const sceneId = node?.id;
    if (!sceneId || sceneId === "cursor-node") return;
    
    const isTemp = String(sceneId).startsWith("temp-new-") || node.data?.isTemp;
    if (isTemp) {
      // พาไปสร้างฉากใหม่พร้อมส่งพิกัด X, Y และ ตอนสังกัด (chapterId)
      onNavigate?.("scene-editor", {
        novelId,
        chapterId: node.data?.chapterId,
        sceneId: "new",
        x: Math.round(node.position?.x ?? 0),
        y: Math.round(node.position?.y ?? 0),
      });
      return;
    }
    
    const sceneData = sceneMap.get(sceneId);
    const chapterId = sceneData?.ChapterID ?? sceneData?.chapter_id ?? sceneData?.chapterId;
    
    if (onNavigate) {
      onNavigate("scene-editor", {
        novelId,
        chapterId,
        sceneId,
        x: Math.round(node.position?.x ?? 0),
        y: Math.round(node.position?.y ?? 0),
      });
    }
  }, [sceneMap, onNavigate, novelId]);

  // คลิกที่โหนด
  const handleNodeClick = useCallback((evt, node) => {
    if (!node || node.id === "cursor-node") return;

    const currentMode = modeRef.current;

    // โหมดลบฉาก (Delete Mode)
    if (currentMode === "delete") {
      setSceneToDelete(node);
      setShowDeleteModal(true);
      return;
    }
    
    // โหมดเชื่อมฉาก (Connect Mode)
    if (currentMode === "connect") {
      if (!connectSource) {
        // ตรวจสอบตั้งแต่ก้าวแรก: ห้ามไม่ให้เลือกโหนดที่เป็น "ฉากจบ" มาทำหน้าที่เป็นโหนดต้นทาง
        const srcType = node.data?.Type || node.data?.type || "";
        const isSrcEnding = srcType === "ending" || node.data?.is_ending === true || node.data?.IsEnding === true || node.data?.status === "ending" || node.data?.status === WRITER_NODE_STATUS.ENDING;
        
        if (isSrcEnding) {
          showToast("ไม่สามารถเพิ่มทางเลือกได้ เนื่องจาก 'ฉากต้นทางคือฉากจบ' (ฉากจบไม่สามารถเพิ่มทางเลือกเชื่อมไปยังฉากอื่นได้อีก)", "warn");
          return;
        }

        setConnectSource(node);
        const flowPos = screenToFlowPosition({
          x: evt.clientX,
          y: evt.clientY
        });
        const cursorNode = {
          id: "cursor-node",
          type: "default",
          position: flowPos,
          style: { opacity: 0, width: 0, height: 0, pointerEvents: "none" },
          data: {}
        };
        setRfNodes((nds) => [...nds.filter(n => n.id !== "cursor-node"), cursorNode]);
        
        const cursorEdge = {
          id: "cursor-edge",
          source: String(node.id),
          target: "cursor-node",
          type: "smoothstep",
          animated: true,
          style: { stroke: "#2563EB", strokeWidth: 2, strokeDasharray: "5,5" }
        };
        setRfEdges((eds) => [...eds.filter(e => e.id !== "cursor-edge"), cursorEdge]);
        return;
      }
      
      if (connectSource) {
        // คลิกเลือกโหนดเดิมซ้ำ -> ยกเลิกการเลือกฉากต้นทาง
        if (node.id === connectSource.id) {
          clearConnectionState();
          return;
        }

        // ป้องกันเชื่อมต่อผิดกฎโครงสร้างนิยายทางเลือก (เช่น เกิด Loop, ปลายทางเป็นจุดเริ่ม, ต้นทางเป็นฉากจบ)
        const blockReason = getConnectionBlockReason(connectSource.id, node.id);
        if (blockReason) {
          showToast(getBlockReasonMessage(blockReason), "warn");
          return;
        }
        
        setConnectTarget(node);
        setChoiceText("");
        setIsModalOpen(true);
      }
      return;
    }

    // โหมดเลือกปกติ (Select Mode)
    setSelectedSceneId(String(node.id));
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsMobileSidebarOpen(true);
    }
  }, [connectSource, getConnectionBlockReason, getBlockReasonMessage, screenToFlowPosition, setRfNodes, setRfEdges, showToast, setSceneToDelete, setShowDeleteModal, clearConnectionState]);

  const handleConfirmConnect = async () => {
    if (!choiceText.trim() || !connectSource || !connectTarget) return;

    try {
      const srcSceneId = connectSource.id;
      const dstSceneId = connectTarget.id;
      
      const srcIdInt = parseInt(srcSceneId, 10);
      const dstIdInt = parseInt(dstSceneId, 10);
      
      if (isNaN(srcIdInt) || isNaN(dstIdInt)) {
        showToast("กรุณากดแก้ไขและบันทึกข้อมูลของฉากใหม่ก่อนสร้างเส้นทางเชื่อมโยง", "warn");
        return;
      }

      // อนุญาตให้มีหลายทางเลือกไปยังฉากปลายทางเดียวกันได้ แต่ต้องตั้ง "ชื่อทางเลือก" ไม่ซ้ำกัน
      const trimmedChoiceText = choiceText.trim().toLowerCase();
      const isDuplicateChoiceLabel = normalizedEdges.some(
        (e) =>
          String(e.fromId) === String(srcSceneId) &&
          String(e.toId) === String(dstSceneId) &&
          getChoiceLabel(e).trim().toLowerCase() === trimmedChoiceText
      );
      if (isDuplicateChoiceLabel) {
        showToast("มีตัวเลือกชื่อนี้ไปยังฉากเดียวกันอยู่แล้ว กรุณาตั้งชื่อตัวเลือกให้แตกต่างออกไป", "warn");
        return;
      }
      
      const payload = {
        novel_id: parseInt(novelId, 10),
        from_scene_id: srcIdInt,
        to_scene_id: dstIdInt,
        label: choiceText.trim(),
        text: choiceText.trim(),
      };

      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await axios.post(`${API_BASE_URL}/choices`, payload, { 
        headers, 
        withCredentials: false 
      });

      showToast("เชื่อมทางเลือกสำเร็จแล้ว", "success");

      clearConnectionState();

      window.dispatchEvent(new Event("novel-data-updated"));
      changeMode(interactionMode);
    } catch (err) {
      console.error("Save choice edge error, starting database fallback verification...", err);
      
      try {
        const srcIdInt = parseInt(connectSource.id, 10);
        const dstIdInt = parseInt(connectTarget.id, 10);
        
        const checkRes = await axios.get(`${API_BASE_URL}/novels/${novelId}/story-tree`, { withCredentials: false });
        const freshTree = checkRes.data?.data || checkRes.data || null;
        const freshEdges = freshTree?.Edges || freshTree?.edges || [];

        const isActuallySavedInDb = freshEdges.some(
          (edge) =>
            parseInt(edge.FromID ?? edge.from_id ?? edge.from, 10) === srcIdInt &&
            parseInt(edge.ToID ?? edge.to_id ?? edge.to, 10) === dstIdInt
        );

        if (isActuallySavedInDb) {
          setTreeData(freshTree);
          showToast("เชื่อมทางเลือกสำเร็จแล้ว", "success");
          
          clearConnectionState();
          
          window.dispatchEvent(new Event("novel-data-updated"));
          changeMode(interactionMode);
          return;
        }
      } catch (fallbackErr) {
        console.error("Fallback verification failed:", fallbackErr);
      }

      clearConnectionState();
      fetchStoryTreeAndChapters();
    }
  };

  const handleCloseModal = () => {
    clearConnectionState();
  };

  const selectedScene = selectedSceneId ? sceneMap.get(selectedSceneId) : null;
  const selectedSceneEdges = selectedSceneId ? normalizedEdges.filter((e) => {
    const sourceId = e.fromId;
    const targetId = e.toId;
    return String(sourceId) === selectedSceneId || String(targetId) === selectedSceneId;
  }) : [];

  const incomingChoices = selectedSceneEdges.filter((e) => {
    return String(e.toId) === selectedSceneId;
  });

  const outgoingChoices = selectedSceneEdges.filter((e) => {
    return String(e.fromId) === selectedSceneId;
  });

  const title = treeData?.NovelTitle || treeData?.novel_title || "Story Tree";

  // ข้อความและคำแนะนำ Dynamic ปรับตามเครื่องมือที่กด เพื่อนำทางนักเขียน
  // แนบสถานะ valid/invalid target (คำนวณไว้แล้วใน connectTargetStatusMap) เข้าไปใน data ของแต่ละโหนด
  // ก่อนส่งเข้า <ReactFlow> เพื่อให้ StoryNode เลือก class/สีได้เอง โดยไม่แตะ state เดิม (rfNodes) เลย
  const displayNodes = useMemo(() => {
    if (interactionMode !== "connect" || !connectSource) return rfNodes;

    return rfNodes.map((n) => {
      if (n.id === "cursor-node") return n;
      return {
        ...n,
        data: {
          ...n.data,
          isConnectSourceNode: n.id === connectSource.id,
          connectTargetStatus: n.id === connectSource.id ? null : (connectTargetStatusMap[n.id] || null),
        },
      };
    });
  }, [rfNodes, interactionMode, connectSource, connectTargetStatusMap]);

  const getBannerInstruction = () => {
    if (interactionMode === "select") {
      return (
        <span>
          💡 <strong>โหมดเลือก:</strong> คลิกโหนดเพื่อดูรายละเอียดฉากด้านซ้าย | ดับเบิลคลิกเพื่อแก้ไขเนื้อหาฉาก
        </span>
      );
    }
    if (interactionMode === "connect") {
      if (!connectSource) {
        return (
          <span>
            🔗 <strong>โหมดเชื่อมโยง:</strong> คลิกเลือกโหนดในแผนภาพเพื่อกำหนดให้เป็น <strong>ฉากต้นทาง</strong>
          </span>
        );
      } else {
        // ระหว่าง hover โหนดปลายทาง ให้แสดงผลลัพธ์ validation ทันที แทนที่ข้อความคำแนะนำปกติ
        if (hoverTargetInfo) {
          return (
            <span style={{ color: hoverTargetInfo.status === "invalid" ? "#ef4444" : "#16a34a" }}>
              <strong>{hoverTargetInfo.message}</strong>
            </span>
          );
        }
        return (
          <span>
            🔗 <strong>โหมดเชื่อมโยง:</strong> คลิกเลือกอีกโหนดเพื่อเชื่อมไปยัง <strong>ฉากปลายทาง</strong>{" "}
            (เชื่อมได้เฉพาะ<strong>ไปข้างหน้า</strong>เท่านั้น ระบบจะกันไม่ให้ย้อนกลับหรือวนลูป · โหนดสีเขียวจาง = เชื่อมได้, สีแดงจาง = เชื่อมไม่ได้ · กด ESC เพื่อยกเลิก)
          </span>
        );
      }
    }
    if (interactionMode === "pan") {
      return (
        <span>
          🖐️ <strong>โหมดเลื่อนบอร์ด:</strong> คลิกค้างไว้แล้วลากเมาส์เพื่อแพนกราฟเลื่อนดูฉากต่างๆ ได้อย่างอิสระ
        </span>
      );
    }
    if (interactionMode === "add-node") {
      return (
        <span>
          ✚ <strong>โหมดเพิ่มฉาก:</strong> คลิกตรงพื้นที่ว่างเปล่าใดก็ได้บนบอร์ดแผนภาพเพื่อวางโหนด <strong>ฉากใหม่</strong>
        </span>
      );
    }
    if (interactionMode === "delete") {
      return (
        <span style={{ color: "#ef4444" }}>
          🗑️ <strong>โหมดลบ:</strong> คลิกเลือกโหนดฉากเพื่อลบ
        </span>
      );
    }
    return null;
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="wst-page">
        <div className="wst-loading-state">
          <p className="wst-error-text">⚠️ {error}</p>
          <button className="wst-error-button" type="button" onClick={fetchStoryTreeAndChapters}>
            ลองโหลดใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wst-page">
      {/* Toast Notification */}
      {toast && (
        <div className={`wst-toast ${toast.type}`}>
          <i className={`ti ti-${toast.type === "success" ? "check-circle" : toast.type === "warn" ? "alert-circle" : "info-circle"}`} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modal Popup กำหนดทางเลือก (ขั้นตอนที่ 3) */}
      {isModalOpen && connectSource && connectTarget && (
        <div className="wst-modal-bg open" onClick={(e) => e.target.classList.contains("wst-modal-bg") && handleCloseModal()}>
          <div className="wst-modal" role="dialog" aria-modal="true">
            <div className="wst-modal-header">
              <div>
                <div className="wst-modal-eyebrow">
                  <i className="ti ti-git-merge"></i>สร้างทางเลือกใหม่
                </div>
                <h3 className="wst-modal-title">กำหนดข้อความทางเลือก</h3>
              </div>
              <button className="wst-modal-close" onClick={handleCloseModal}>✕</button>
            </div>

            {/* Route Card ยืนยันข้อมูล */}
            <div className="wst-modal-route">
              <div className="wst-route-node">
                <span className="wst-route-node-label">ต้นทาง</span>
                <span className="wst-route-node-title">{connectSource.data?.Title || getNodeTitle(connectSource.data)}</span>
                <span className="wst-route-node-id">ฉากที่ {scenePositionMap.get(normalizeId(connectSource.id)) ? `${scenePositionMap.get(normalizeId(connectSource.id)).chapterNumber}.${scenePositionMap.get(normalizeId(connectSource.id)).sceneNumber}` : connectSource.id}</span>
              </div>
              <div className="wst-route-arrow">
                <i className="ti ti-arrow-right"></i>
              </div>
              <div className="wst-route-divider"></div>
              <div className="wst-route-node">
                <span className="wst-route-node-label">ปลายทาง</span>
                <span className="wst-route-node-title">{connectTarget.data?.Title || getNodeTitle(connectTarget.data)}</span>
                <span className="wst-route-node-id">ฉากที่ {scenePositionMap.get(normalizeId(connectTarget.id)) ? `${scenePositionMap.get(normalizeId(connectTarget.id)).chapterNumber}.${scenePositionMap.get(normalizeId(connectTarget.id)).sceneNumber}` : connectTarget.id}</span>
              </div>
            </div>

            <div className="wst-modal-body">
              <label className="wst-field-label" htmlFor="popup-choice-text">
                <i className="ti ti-cursor-text"></i>
                ข้อความที่นักอ่านกด <span className="req">*</span>
              </label>
              <input
                id="popup-choice-text"
                className="wst-field-input"
                type="text"
                value={choiceText}
                onChange={(e) => setChoiceText(e.target.value)}
                placeholder="เช่น เดินไปทางลำธาร, สำรวจรอยเท้าประหลาด..."
                maxLength={80}
                autoFocus
              />
              <p className="wst-field-hint">ข้อความสั้น กระชับ บอกว่าตัวละครจะทำอะไร (ไม่เกิน 80 ตัวอักษร)</p>
            </div>

            <div className="wst-modal-footer">
              <button className="wst-modal-btn-cancel" onClick={handleCloseModal}>ยกเลิก</button>
              <button 
                className="wst-modal-btn-confirm" 
                onClick={handleConfirmConnect}
                disabled={!choiceText.trim()}
              >
                <i className="ti ti-git-merge"></i>
                เชื่อมโหนด
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="wst-topbar">
        <div className="wst-topbar__left">
          <button 
            className="wst-topbar__back" 
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                onNavigate?.("dashboard");
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>ย้อนกลับ</span>
          </button>

          <div className="wst-topbar__divider-v" />
          <LegendBar />
        </div>
        <div className="wst-topbar__actions">
          {/* ปุ่มสลับโครงสร้าง (Structure) กับสถิติวิเคราะห์ (Analytics) */}
          <div className="wsg-toggle-wrap" style={{ marginRight: "16px" }}>
            <button className="wsg-toggle-btn active">
              โครงสร้าง
            </button>
            <button 
              className="wsg-toggle-btn"
              onClick={() => onNavigate && onNavigate("analytics")}
            >
              วิเคราะห์การเลือกของนักอ่าน
            </button>
          </div>
          <button className="wst-topbar__add" onClick={() => onNavigate && onNavigate("chapters", { novelId })}>จัดการตอน</button>
        </div>
      </header>

      {/* 📱 ปุ่มสไตล์การ์ด สำหรับเปิด/ปิด แถบสถิติบนหน้าจอเล็ก (สไตล์เดียวกับหน้าจัดการตอน) */}
      <button
        type="button"
        className="wst-mobile-sidebar-selector"
        onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
        title={isMobileSidebarOpen ? "ซ่อนแถบสถิติและข้อมูล" : "ดูแถบสถิติและข้อมูล"}
        aria-label="เปิด/ปิด แถบข้อมูลและสถิติ"
      >
        <div className="wst-mobile-sidebar-selector__left">
          <div className="wst-mobile-sidebar-selector__icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <div className="wst-mobile-sidebar-selector__text">
            <span className="wst-mobile-sidebar-selector__label">ข้อมูล & สถิติโครงสร้าง</span>
            <div className="wst-mobile-sidebar-selector__info">
              <span className="wst-mobile-sidebar-selector__stat">
                {stats?.TotalScenes ?? stats?.total_scenes ?? 0} ฉาก
              </span>
              <span className="wst-mobile-sidebar-selector__dot">•</span>
              <span className="wst-mobile-sidebar-selector__stat">
                {stats?.TotalChoicePoints ?? stats?.total_choice_points ?? 0} ทางเลือก
              </span>
              {orphanNodes.length > 0 && (
                <>
                  <span className="wst-mobile-sidebar-selector__dot">•</span>
                  <span className="wst-mobile-sidebar-selector__orphan">
                    ยังไม่เชื่อม {orphanNodes.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="wst-mobile-sidebar-selector__right">
          <span>{isMobileSidebarOpen ? "ซ่อนสถิติ" : "ดูสถิติ"}</span>
          <ChevronRight
            size={18}
            style={{
              transform: isMobileSidebarOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              color: "#64748b",
            }}
          />
        </div>
      </button>

      <div className="wst-body">
        {/* Backdrop for Mobile Sidebar Drawer */}
        {isMobileSidebarOpen && (
          <div 
            className="wst-sidebar-backdrop" 
            onClick={() => setIsMobileSidebarOpen(false)} 
          />
        )}

        {/* Sidebar ยึดฝั่งซ้ายของ Canvas (เปิดแบบ Drawer บนมือถือ/แท็บเล็ต) */}
        <aside className={`wst-sidebar ${isMobileSidebarOpen ? "wst-sidebar--open" : ""}`}>
          <div className="wst-sidebar__mobile-header">
            <span className="wst-sidebar__mobile-title">📊 สถิติ & รายละเอียดฉาก</span>
            <button 
              type="button"
              className="wst-sidebar__close-btn" 
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="ปิดแถบข้อมูล"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {/* Stats Grid */}
          <div className="wst-sidebar__stats-grid">
            <div className="wst-sidebar__stat-card">
              <div className="wst-sidebar__stat-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                <span>ฉากทั้งหมด</span>
              </div>
              <div className="wst-sidebar__stat-value">
                {stats?.TotalScenes ?? stats?.total_scenes ?? 0}
              </div>
            </div>

            <div 
              className="wst-sidebar__stat-card"
              onClick={handleFocusNextOrphan}
              title="คลิกเพื่อแพนกล้องซูมพาไปยังฉากที่ยังไม่เชื่อมต่อโหนดถัดไป"
              style={{ cursor: orphanNodes.length > 0 ? 'pointer' : 'default', transition: 'all 0.2s ease' }}
            >
              <div className="wst-sidebar__stat-header" style={{ color: "#db2777" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25a4.5 4.5 0 0 0-6.36-6.36l-1.5 1.5M13.02 16.61l-1.5 1.5a4.5 4.5 0 0 1-6.36-6.36"/><line x1="8" y1="16" x2="16" y2="8"/></svg>
                <span>ยังไม่เชื่อม</span>
              </div>
              <div className="wst-sidebar__stat-value" style={{ color: "#db2777", display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{orphanNodes.length}</span>
                {orphanNodes.length > 0 && (
                  <span style={{ fontSize: '11px', background: '#fce7f3', color: '#be185d', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>🔍 ซูมหา</span>
                )}
              </div>
            </div>

            <div className="wst-sidebar__stat-card">
              <div className="wst-sidebar__stat-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                <span>ทางเลือก</span>
              </div>
              <div className="wst-sidebar__stat-value">
                {stats?.TotalChoicePoints ?? stats?.total_choice_points ?? 0}
              </div>
            </div>

            <div className="wst-sidebar__stat-card">
              <div className="wst-sidebar__stat-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                <span>ฉากจบ</span>
              </div>
              <div className="wst-sidebar__stat-value">
                {stats?.TotalEndings ?? stats?.total_endings ?? 0}
              </div>
            </div>
          </div>

          {/* Story Health / Loop Warnings
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: '16px', border: detectedLoops.length > 0 ? '1.5px solid #fca5a5' : '1.5px solid #bbf7d0', background: detectedLoops.length > 0 ? '#fef2f2' : '#f0fdf4', transition: 'all 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '13.5px', color: detectedLoops.length > 0 ? '#b91c1c' : '#15803d' }}>
              <i className={`ti ti-${detectedLoops.length > 0 ? 'alert-triangle' : 'circle-check'}`} style={{ fontSize: '16px' }}></i>
              <span>{detectedLoops.length > 0 ? `พบจุดวนลูปเนื้อเรื่อง ${detectedLoops.length} แห่ง` : 'โครงข่ายเรื่องปกติ (ไม่มีจุดวนลูป)'}</span>
            </div>
            {detectedLoops.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                {detectedLoops.map((loop, idx) => {
                  const labelPath = loop.nodes.map(id => {
                    const pos = scenePositionMap.get(id);
                    return pos ? `${pos.chapterNumber}.${pos.sceneNumber}` : '?';
                  }).join(' ➔ ');

                  return (
                    <button
                      key={`loop-warning-${idx}`}
                      onClick={() => focusOnScene(loop.nodes[0])}
                      title="คลิกเพื่อแพนกล้องซูมพาไปยังจุดที่เกิดลูป"
                      style={{
                        textAlign: 'left', background: '#fff', border: '1px solid #fecaca',
                        borderRadius: '10px', padding: '8px 10px', fontSize: '12px',
                        color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 2px 4px rgba(239, 68, 68, 0.04)',
                        transition: 'all 0.2s ease', width: '100%'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.borderColor = '#fca5a5'}
                      onMouseOut={(e) => e.currentTarget.style.borderColor = '#fecaca'}
                    >
                      <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
                        🔄 ลูป: {labelPath}
                      </span>
                      <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '8px', fontWeight: 'bold' }}>🔍 ซูม</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div> */}

          {selectedScene && (
            <>
              <div className="wst-sidebar__divider" />
              <SceneDetailsCard
                scene={selectedScene}
                scenePositionMap={scenePositionMap}
                sceneMap={sceneMap}
                selectedSceneId={selectedSceneId}
                onEdit={(sceneId) => {
                  const sceneData = sceneMap.get(sceneId);
                  const isTemp = String(sceneId).startsWith("temp-new-");
                  const chapterId = sceneData?.ChapterID ?? sceneData?.chapter_id ?? sceneData?.chapterId;
                  
                  onNavigate?.("scene-editor", {
                    novelId,
                    chapterId,
                    sceneId: isTemp ? "new" : sceneId,
                    x: Math.round(sceneData?.x ?? 0),
                    y: Math.round(sceneData?.y ?? 0),
                  });
                }}
                incomingChoices={incomingChoices}
                outgoingChoices={outgoingChoices}
                onSelectSceneNode={focusOnScene}
              />
            </>
          )}
        </aside>

        {/* Canvas Area */}
        <div 
          className={`wst-canvas-area wst-mode-${interactionMode}`} 
          style={{ 
            cursor: interactionMode === "connect" ? "crosshair" 
                  : interactionMode === "add-node" ? "cell" 
                  : interactionMode === "pan" ? "grab"
                  : interactionMode === "delete" ? "not-allowed"
                  : "default" 
          }}
        >
          {/* แถบส่วนหัวด้านบนแบบจัดวางในแถวเดียวกัน: ซ้ายเป็นหัวข้อเรื่อง ขวาเป็นแถบเครื่องมือ */}
          <div className="wst-canvas-header-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="wst-canvas-heading">
              <h1 className="wst-canvas-title">โครงสร้างเนื้อเรื่อง</h1>
              {title && (
                <p className="wst-canvas-sub" title={`เรื่อง: ${title}`}>
                  <span className="wst-canvas-sub__label">เรื่อง:</span>{" "}
                  <span className="wst-canvas-sub__title">{title}</span>
                </p>
              )}
            </div>

            <div className="wst-canvas-toolbar">
              <button 
                title="เลือก" 
                className={`wst-toolbar-btn ${interactionMode==='select' ? 'wst-toolbar-btn--select-active':''}`} 
                onClick={() => changeMode('select')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h6v6H3V3M15 3h6v6h-6V3M3 15h6v6H3v-6M15 15h6v6h-6v-6"/></svg>
                <span>เลือก</span>
              </button>
              <button 
                title="เชื่อมทางเลือก (กด C)" 
                className={`wst-toolbar-btn ${interactionMode==='connect' ? 'wst-toolbar-btn--connect-active':''}`} 
                onClick={() => changeMode(interactionMode === 'connect' ? 'select' : 'connect')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l12 6-12 6V9z"/></svg>
                <span>เชื่อม</span>
              </button>
              <button 
                title="เลื่อน" 
                className={`wst-toolbar-btn ${interactionMode==='pan' ? 'wst-toolbar-btn--pan-active':''}`} 
                onClick={() => changeMode('pan')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9" />
                  <path d="M6 14.5v-1.5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V11" />
                </svg>
                <span>เลื่อน</span>
              </button>
              <button 
                title="คลิกที่ว่างในบอร์ดเพื่อเพิ่มฉาก" 
                className={`wst-toolbar-btn ${interactionMode==='add-node' ? 'wst-toolbar-btn--add-active':''}`}
                onClick={() => changeMode(interactionMode === 'add-node' ? 'select' : 'add-node')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                <span>เพิ่ม</span>
              </button>
              <button 
                title="คลิกเลือกโหนดฉากเพื่อลบ" 
                className={`wst-toolbar-btn ${interactionMode==='delete' ? 'wst-toolbar-btn--delete-active':''}`}
                onClick={() => changeMode(interactionMode === 'delete' ? 'select' : 'delete')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M5 6l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13"/></svg>
                <span>ลบ</span>
              </button>
              <button 
                title="จัดเรียงตำแหน่งฉากอัตโนมัติและบันทึกลงฐานข้อมูลทันที" 
                className="wst-toolbar-btn"
                onClick={handleAutoLayout}
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  borderColor: '#bfdbfe',
                  fontWeight: '700'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                <span>จัดเรียงอัตโนมัติ</span>
              </button>

              {orphanNodes.length > 0 && (
                <button 
                  title="ค้นหาและซูมพาไปยังฉากที่ยังไม่ได้เชื่อมต่อทีละโหนด" 
                  className="wst-toolbar-btn"
                  onClick={handleFocusNextOrphan}
                  style={{
                    background: '#fce7f3',
                    color: '#be185d',
                    borderColor: '#fbcfe8',
                    fontWeight: '700'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <span>หาโหนดว่าง ({orphanNodes.length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="wst-canvas-wrap">
            {/* แถบคำแนะนำการใช้เครื่องมือ */}
            <div className="wst-canvas-guidance-banner">
              {getBannerInstruction()}
            </div>

            <div className="wst-canvas-scroll">
              <div
                className="wst-reactflow-container"
                ref={reactflowWrapperRef}
                style={{ width: "100%", height: "100%", position: "relative" }}
                onMouseMove={(e) => {
                  if (interactionMode === "connect" && connectSource) {
                    handlePaneMouseMove(e);
                  }
                }}
              >

                <ReactFlow
                  nodes={displayNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  isValidConnection={isValidConnection}
                  onNodeClick={handleNodeClick}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  onNodeMouseEnter={handleNodeMouseEnter}
                  onNodeMouseLeave={handleNodeMouseLeave}
                  onEdgeClick={handleEdgeClick}
                  onPaneClick={handlePaneClick}
                  onNodesChange={onNodesChangeWrapper}
                  onEdgesChange={onEdgesChangeWrapper}
                  onNodeDragStop={onNodeDragStop}
                  onConnect={onConnect}
                  onEdgeUpdateStart={onEdgeUpdateStart}
                  onEdgeUpdate={onEdgeUpdate}
                  onEdgeUpdateEnd={onEdgeUpdateEnd}
                  edgeUpdaterRadius={12}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  preventScrolling={false}
                  panOnScroll
                  panOnDrag={interactionMode === 'pan'}
                  nodesDraggable={interactionMode !== 'pan' && interactionMode !== 'connect' && interactionMode !== 'add-node'}
                  nodesConnectable={false}
                  elementsSelectable={interactionMode === 'select' || interactionMode === 'delete'}
                  edgesFocusable={true}
                  edgesUpdatable={interactionMode === 'select'}
                  minZoom={0.3}
                  maxZoom={1.6}
                  className="wst-reactflow"
                >
                  <MiniMap
                    zoomable
                    pannable
                    nodeColor={(node) => {
                      const status = node.data?.status;
                      switch (status) {
                        case WRITER_NODE_STATUS.START:
                          return "#16A34A";
                        case WRITER_NODE_STATUS.ENDING:
                          return "#EF4444";
                        case WRITER_NODE_STATUS.ORPHAN:
                          return "#94A3B8";
                        default:
                          return "#38BDF8";
                      }
                    }}
                  />

                  <Controls showZoom showFitView showInteractive={false} />

                  <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
                </ReactFlow>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddScenePopup && (
        <WstModalOverlay
          maxWidth={440}
          borderColor="#bfdbfe"
          shadowColor="rgba(37, 99, 235, 0.15)"
          overlayOpacity={0.35}
          onClose={() => {
            setShowAddScenePopup(false);
            setPendingScenePosition(null);
            setNewSceneTitle("");
          }}
        >
            <h3 style={{ marginTop: 0, color: '#1e3a8a', fontSize: '20px', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📌 เลือกตอนและตั้งชื่อสำหรับฉากใหม่
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14.5px', marginBottom: '20px', lineHeight: '1.6' }}>
              กรุณากรอกชื่อฉากและเลือกตอนที่คุณต้องการจัดเก็บฉากใหม่นี้ ก่อนบันทึกลงบนผังโครงสร้างเรื่อง
            </p>
            
            {/* Input ชื่อฉาก */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>
                ชื่อฉาก <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="เช่น การเดินทางครั้งใหม่, เผชิญหน้ากับศัตรู..."
                value={newSceneTitle}
                onChange={(e) => setNewSceneTitle(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: '12px',
                  border: '1.5px solid #bfdbfe', fontSize: '14.5px', fontFamily: 'inherit',
                  color: '#1f2937', outline: '#3b82f6', background: '#f8fafc',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>
                ตอน
              </label>
              {novelChapters.length === 0 ? (
                <div style={{ color: '#dc2626', fontSize: '14px', background: '#fef2f2', padding: '12px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                  ⚠️ นิยายนี้ยังไม่มีตอนใดๆ เลย กรุณาไปสร้างตอนอย่างน้อยหนึ่งตอนที่หน้า "จัดการตอนนิยาย" ก่อน
                </div>
              ) : (
                <select 
                  value={selectedMoveChapterId}
                  onChange={(e) => setSelectedMoveChapterId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: '12px',
                    border: '1.5px solid #bfdbfe', fontSize: '14.5px', fontFamily: 'inherit',
                    color: '#1f2937', outline: 'none', background: '#f8fafc',
                    transition: 'all 0.2s ease', cursor: 'pointer'
                  }}
                >
                  {novelChapters.map((ch, index) => {
                    const chId = ch.id ?? ch.chapter_id ?? ch.ChapterID ?? ch.chapterId;
                    return (
                      <option key={`add-target-ch-${chId}`} value={chId}>
                        ตอนที่ {ch.chapterNumber ?? ch.order_index ?? ch.episode ?? (index + 1)} — {ch.title}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowAddScenePopup(false);
                  setPendingScenePosition(null);
                  setNewSceneTitle("");
                }}
                style={{
                  padding: '10px 20px', borderRadius: '20px', border: '1px solid #d1d5db',
                  background: '#ffffff', color: '#4b5563', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '600', transition: 'all 0.2s'
                }}
              >
                ยกเลิก
              </button>
              <button 
                disabled={novelChapters.length === 0 || !newSceneTitle.trim()}
                onClick={handleAddSceneBackend}
                style={{
                  padding: '10px 24px', borderRadius: '20px', border: 'none',
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                  color: '#ffffff', cursor: (novelChapters.length === 0 || !newSceneTitle.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: '14px', fontWeight: '700', transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)',
                  opacity: (novelChapters.length === 0 || !newSceneTitle.trim()) ? 0.5 : 1
                }}
              >
                ตกลงสร้างฉาก
              </button>
            </div>
        </WstModalOverlay>
      )}

      {showDeleteModal && sceneToDelete && (
        <WstModalOverlay
          maxWidth={460}
          borderColor="#fecaca"
          shadowColor="rgba(239, 68, 68, 0.15)"
          overlayOpacity={0.45}
          onClose={() => {
            setShowDeleteModal(false);
            setSceneToDelete(null);
            changeMode(interactionMode);
          }}
        >
            <h3 style={{ marginTop: 0, color: '#dc2626', fontSize: '20px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠️ ยืนยันการลบฉาก
            </h3>
            
            <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '16px', border: '1px solid #fee2e2', marginBottom: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
                ฉากที่เลือก:
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#1f2937', marginBottom: '12px' }}>
                {sceneToDelete.data?.Title || getNodeTitle(sceneToDelete.data)}
              </div>
              
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
                ตอนสังกัด:
              </div>
              <div style={{ fontSize: '14px', color: '#4b5563', marginBottom: '12px' }}>
                ตอนที่ {sceneToDelete.data?.chapterNumber ?? "?"} — {sceneToDelete.data?.chapterTitle || getNodeChapter(sceneToDelete.data) || "ไม่มีตอน"}
              </div>

              <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
                เนื้อเรื่องสังเขป:
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', maxHeight: '100px', overflowY: 'auto', lineHeight: '1.6', background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                {sceneToDelete.data?.Content || getNodeContent(sceneToDelete.data) || "(ไม่มีรายละเอียดเนื้อหา)"}
              </div>
            </div>

            <p style={{ color: '#4b5563', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
              คุณแน่ใจหรือไม่ว่าต้องการลบฉากนี้ออกจากระบบ? **การกระทำนี้ไม่สามารถย้อนคืนได้และเส้นเชื่อมเลือกใดๆ จากฉากนี้จะถูกลบออกด้วย**
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setSceneToDelete(null);
                  changeMode(interactionMode);
                }}
                style={{
                  padding: '10px 20px', borderRadius: '20px', border: '1px solid #d1d5db',
                  background: '#ffffff', color: '#4b5563', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '600', transition: 'all 0.2s'
                }}
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleConfirmDelete}
                style={{
                  padding: '10px 24px', borderRadius: '20px', border: 'none',
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  color: '#ffffff', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '700', transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)'
                }}
              >
                ยืนยันการลบ
              </button>
            </div>
        </WstModalOverlay>
      )}

      {/* Edge management Modals */}
      {showEdgeModal && selectedEdge && (
        <WstModalOverlay
          maxWidth={460}
          borderColor="#bfdbfe"
          shadowColor="rgba(37, 99, 235, 0.15)"
          overlayOpacity={0.35}
          onClose={() => {
            setShowEdgeModal(false);
            setSelectedEdge(null);
          }}
        >
          <h3 style={{ marginTop: 0, color: '#1e3a8a', fontSize: '20px', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔧 จัดการทางเลือก
          </h3>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
            แก้ไขรายละเอียด ปลายทาง หรือลบทางเลือกเชื่อมโยงเส้นนี้
          </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>
                ข้อความปุ่มทางเลือก
              </label>
              <input 
                type="text"
                value={editEdgeLabel}
                onChange={(e) => setEditEdgeLabel(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1.5px solid #bfdbfe', fontSize: '14px', fontFamily: 'inherit',
                  color: '#1f2937', outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>
                ฉากต้นทาง (Source)
              </label>
              <select
                value={editEdgeSource}
                onChange={(e) => setEditEdgeSource(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1.5px solid #bfdbfe', fontSize: '14px', fontFamily: 'inherit',
                  color: '#1f2937', outline: 'none', background: '#f8fafc'
                }}
              >
                {rfNodes.filter(n => n.id !== "cursor-node").map(n => {
                  const num = scenePositionMap.get(n.id) 
                    ? `${scenePositionMap.get(n.id).chapterNumber}.${scenePositionMap.get(n.id).sceneNumber}` 
                    : "";
                  return (
                    <option key={`edge-src-${n.id}`} value={n.id}>
                      ฉาก {num} — {n.data?.title || n.data?.Title || "ไม่มีชื่อ"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>
                ฉากปลายทาง (Target)
              </label>
              <select
                value={editEdgeTarget}
                onChange={(e) => setEditEdgeTarget(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1.5px solid #bfdbfe', fontSize: '14px', fontFamily: 'inherit',
                  color: '#1f2937', outline: 'none', background: '#f8fafc'
                }}
              >
                {rfNodes.filter(n => n.id !== "cursor-node").map(n => {
                  const num = scenePositionMap.get(n.id) 
                    ? `${scenePositionMap.get(n.id).chapterNumber}.${scenePositionMap.get(n.id).sceneNumber}` 
                    : "";
                  return (
                    <option key={`edge-tgt-${n.id}`} value={n.id}>
                      ฉาก {num} — {n.data?.title || n.data?.Title || "ไม่มีชื่อ"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowDeleteChoiceConfirm(true)}
                style={{
                  padding: '10px 18px', borderRadius: '20px', border: 'none',
                  background: '#fef2f2', color: '#ef4444', cursor: 'pointer',
                  fontSize: '13.5px', fontWeight: '700', transition: 'all 0.2s'
                }}
              >
                🗑️ ลบทางเลือกนี้
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => {
                    setShowEdgeModal(false);
                    setSelectedEdge(null);
                  }}
                  style={{
                    padding: '9px 16px', borderRadius: '20px', border: '1px solid #d1d5db',
                    background: '#ffffff', color: '#4b5563', cursor: 'pointer',
                    fontSize: '13.5px', fontWeight: '600'
                  }}
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleUpdateConnection}
                  style={{
                    padding: '9px 20px', borderRadius: '20px', border: 'none',
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                    color: '#ffffff', cursor: 'pointer',
                    fontSize: '13.5px', fontWeight: '700',
                    boxShadow: '0 4px 10px rgba(29, 78, 216, 0.2)'
                  }}
                >
                  บันทึก
                </button>
              </div>
            </div>
        </WstModalOverlay>
      )}

      {showDeleteChoiceConfirm && selectedEdge && (
        <WstModalOverlay
          maxWidth={440}
          borderColor="#fecaca"
          shadowColor="rgba(239, 68, 68, 0.18)"
          overlayOpacity={0.45}
          textAlign="center"
          onClose={() => {
            setShowDeleteChoiceConfirm(false);
            setSelectedEdge(null);
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>🗑️</div>
            <h3 style={{ marginTop: 0, color: '#dc2626', fontSize: '19px', fontWeight: '800', marginBottom: '12px' }}>
              ยืนยันการลบทางเลือก
            </h3>
            <p style={{ color: '#4b5563', fontSize: '14.5px', marginBottom: '20px', lineHeight: '1.6' }}>
              คุณต้องการลบทางเลือก <strong style={{ color: '#dc2626' }}>"{selectedEdge.label || "เลือกเส้นทางนี้"}"</strong> ออกจากระบบใช่หรือไม่?
            </p>
            <div style={{ background: '#fef2f2', padding: '12px 16px', borderRadius: '12px', border: '1px solid #fee2e2', marginBottom: '24px', fontSize: '13px', color: '#991b1b', textAlign: 'left' }}>
              ℹ️ เส้นเชื่อมโยงของทางเลือกนี้จะหายไปจากผังเรื่องทันที โดยฉากปลายทางจะไม่ถูกลบ
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowDeleteChoiceConfirm(false);
                  setSelectedEdge(null);
                }}
                style={{
                  padding: '10px 22px', borderRadius: '20px', border: '1px solid #d1d5db',
                  background: '#ffffff', color: '#4b5563', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '600', transition: 'all 0.2s'
                }}
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleDeleteConnection}
                style={{
                  padding: '10px 24px', borderRadius: '20px', border: 'none',
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  color: '#ffffff', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '700',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)', transition: 'all 0.2s'
                }}
              >
                ยืนยันการลบ
              </button>
            </div>
        </WstModalOverlay>
      )}

      {showEdgeUpdateConfirm && pendingEdgeUpdate && (
        <WstModalOverlay
          maxWidth={440}
          borderColor="#bfdbfe"
          shadowColor="rgba(37, 99, 235, 0.15)"
          overlayOpacity={0.45}
          onClose={() => {
            setShowEdgeUpdateConfirm(false);
            setPendingEdgeUpdate(null);
            fetchStoryTreeAndChapters();
          }}
        >
          <h3 style={{ marginTop: 0, color: '#1e3a8a', fontSize: '18px', fontWeight: '800', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ยืนยันการย้ายจุดเชื่อมต่อ
          </h3>
          <p style={{ color: '#4b5563', fontSize: '14.5px', marginBottom: '24px', lineHeight: '1.6' }}>
            ต้องการย้ายมาเชื่อมโหนดนี้ใช่ไหม?
          </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowEdgeUpdateConfirm(false);
                  setPendingEdgeUpdate(null);
                  fetchStoryTreeAndChapters();
                }}
                style={{
                  padding: '10px 20px', borderRadius: '20px', border: '1px solid #d1d5db',
                  background: '#ffffff', color: '#4b5563', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '600'
                }}
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleConfirmEdgeUpdate}
                style={{
                  padding: '10px 24px', borderRadius: '20px', border: 'none',
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)',
                  color: '#ffffff', cursor: 'pointer',
                  fontSize: '14px', fontWeight: '700',
                  boxShadow: '0 4px 12px rgba(29, 78, 216, 0.25)'
                }}
              >
                ยืนยันการย้าย
              </button>
            </div>
        </WstModalOverlay>
      )}
    </div>
  );
};

const SceneDetailsCard = ({
  scene,
  scenePositionMap,
  sceneMap,
  selectedSceneId,
  onEdit,
  incomingChoices,
  outgoingChoices,
  onSelectSceneNode
}) => {
  const sceneId = getNodeId(scene);
  const pos = scenePositionMap.get(sceneId);
  const type = getNodeType(scene);

  const getSceneNodeColorInfo = (targetSceneId) => {
    const targetScene = sceneMap?.get(String(targetSceneId));
    const type = targetScene ? getNodeType(targetScene) : "normal";
    
    const typeColor = type === "start" || type === "starting" ? "#15803D"
      : type === "ending" || type === "end" ? "#B91C1C"
        : "#38BDF8";
        
    const typeBgColor = type === "start" || type === "starting" ? "#F0FDF4"
      : type === "ending" || type === "end" ? "#FEF2F2"
        : "#ecf7fd";
        
    const typeBorderColor = type === "start" || type === "starting" ? "#DCFCE7"
      : type === "ending" || type === "end" ? "#FEE2E2"
        : "#E2E8F0";
        
    return { color: typeColor, bg: typeBgColor, border: typeBorderColor };
  };

  const formatChoiceSourceInfo = (choice) => {
    if (!choice) return "";
    const fromTitle =
      choice.fromSceneTitle ||
      choice.from_scene_title ||
      choice.FromSceneTitle ||
      "ไม่ทราบ";
    
    const sourceSceneId = normalizeId(choice.fromId ?? choice.from_id);
    const sourcePos = scenePositionMap.get(sourceSceneId);
    const sourceSceneNum = sourcePos ? `${sourcePos.chapterNumber}.${sourcePos.sceneNumber}` : "?.?";
    
    return `ฉาก ${sourceSceneNum} · ${fromTitle}`;
  };

  const typeLabel = type === "start" || type === "starting" ? "จุดเริ่มต้น"
    : type === "ending" || type === "end" ? "ฉากจบ"
      : "ฉากทั่วไป";

  const typeColor = type === "start" || type === "starting" ? "#16A34A"
    : type === "ending" || type === "end" ? "#EF4444"
      : "#38BDF8";

  const typeBgColor = type === "start" || type === "starting" ? "#DCFCE7"
    : type === "ending" || type === "end" ? "#FEE2E2"
      : "#E0F2FE";

  const typeIcon = type === "start" || type === "starting" ? "▶"
    : type === "ending" || type === "end" ? "🏆"
      : "📖";

  const sceneNumber = pos ? `${pos.chapterNumber}.${pos.sceneNumber}` : "?";
  const sceneTitle = getNodeTitle(scene);
  const chapterTitle = pos ? `ตอนที่ ${pos.chapterNumber}` : getNodeChapter(scene);

  const formatChoiceDestinationInfo = (choice) => {
    if (!choice) return "";
    const toTitle =
      choice.toSceneTitle ||
      choice.to_scene_title ||
      choice.ToSceneTitle ||
      "ไม่ทราบ";
    
    const targetSceneId = normalizeId(choice.toId ?? choice.to_scene_id);
    const targetPos = scenePositionMap.get(targetSceneId);
    const targetSceneNum = targetPos ? `${targetPos.chapterNumber}.${targetPos.sceneNumber}` : "?.?";
    
    return `ฉาก ${targetSceneNum} · ${toTitle}`;
  };

  return (
    <div className="wst-scene-details">
      {/* Header Section */}
      <div className="wst-scene-details__header">
        <h4 className="wst-scene-details__scene-number">ฉากที่ {sceneNumber}</h4>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            className={`wst-node-card__publish-badge ${
              scene.is_published === true || 
              scene.isPublished === true || 
              String(scene.status || scene.publish_status || scene.publishStatus || "").toLowerCase() === "published"
                ? "wst-node-card__publish-badge--published"
                : "wst-node-card__publish-badge--draft"
            }`}
            style={{ position: "static" }}
          >
            <span className="wst-node-card__publish-dot"></span>
            {scene.is_published === true || 
            scene.isPublished === true || 
            String(scene.status || scene.publish_status || scene.publishStatus || "").toLowerCase() === "published"
              ? "เผยแพร่แล้ว"
              : "ฉบับร่าง"}
          </span>
          <span
            className="wst-scene-details__type-badge"
            style={{
              borderColor: typeColor,
              color: typeColor,
              backgroundColor: typeBgColor
            }}
          >
            {typeIcon} {typeLabel}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="wst-scene-details__title">{sceneTitle}</h3>

      {/* Action Button */}
      <div className="wst-scene-details__actions">
        <button
          className="wst-scene-details__btn wst-scene-details__btn--edit"
          onClick={() => onEdit?.(selectedSceneId)}
          style={{ width: "100%" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          แก้ไขฉาก
        </button>
      </div>

      {/* Tags Section */}
      <div className="wst-scene-details__meta-tags">
        <div className="wst-scene-details__tag">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          {chapterTitle}
        </div>
        <div className="wst-scene-details__tag">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
          {outgoingChoices.length} ทางเลือก
        </div>
      </div>

      {/* Content Excerpt */}
      <div className="wst-scene-details__excerpt-section">
        <div className="wst-scene-details__section-header">
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            ตัวอย่างเนื้อหา
          </span>
        </div>
        <div className="wst-scene-details__excerpt-box">
          {getNodeContent(scene) || "ไม่มีเนื้อหาในฉากนี้"}
        </div>
      </div>

      {/* Incoming Choices List (ฉากก่อนหน้า) */}
      <div className="wst-scene-details__choices-section" style={{ marginBottom: "20px" }}>
        <div className="wst-scene-details__section-header">
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            ทางเลือกก่อนหน้า
          </span>
          <span className="wst-scene-details__choices-count-badge">
            {incomingChoices.length} ฉาก
          </span>
        </div>

        <div className="wst-scene-details__choices-list">
          {incomingChoices.map((choice, idx) => {
            const srcId = normalizeId(choice.fromId ?? choice.from_id);
            const info = getSceneNodeColorInfo(srcId);
            return (
              <div 
                key={`incoming-${idx}`} 
                className="wst-choice-card"
                onClick={() => onSelectSceneNode?.(srcId)}
                style={{ 
                  borderLeft: `4px solid ${info.color}`,
                  background: info.bg
                }}
              >
                <div className="wst-choice-card__left">
                  <div className="wst-choice-card__number" style={{ background: info.color, color: "#fff" }}>
                    {idx + 1}
                  </div>
                  <div className="wst-choice-card__info">
                    <span className="wst-choice-card__text" style={{ color: "#1f2937" }}>
                      {getChoiceLabel(choice)}
                    </span>
                    <span className="wst-choice-card__dest" style={{ color: "#4b5563" }}>
                      ➔ {formatChoiceSourceInfo(choice)}
                    </span>
                  </div>
                </div>
                <span className="wst-choice-card__arrow" style={{ color: info.color }}>❯</span>
              </div>
            );
          })}

          {incomingChoices.length === 0 && (
            <div className="wst-scene-details__empty-state">
              <p>ฉากนี้เป็นจุดเริ่มต้น (ไม่มีฉากก่อนหน้าเชื่อมโยงมา)</p>
            </div>
          )}
        </div>
      </div>

      {/* Outgoing Choices List (ทางเลือกถัดไป) */}
      <div className="wst-scene-details__choices-section">
        <div className="wst-scene-details__section-header">
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            ทางเลือกถัดไป
          </span>
          <span className="wst-scene-details__choices-count-badge">
            {outgoingChoices.length} ทาง
          </span>
        </div>

        <div className="wst-scene-details__choices-list">
          {outgoingChoices.map((choice, idx) => {
            const destId = normalizeId(choice.toId ?? choice.to_scene_id);
            const info = getSceneNodeColorInfo(destId);
            return (
              <div 
                key={`outgoing-${idx}`} 
                className="wst-choice-card"
                onClick={() => onSelectSceneNode?.(destId)}
                style={{ 
                  borderLeft: `4px solid ${info.color}`,
                  background: info.bg
                }}
              >
                <div className="wst-choice-card__left">
                  <div className="wst-choice-card__number" style={{ background: info.color, color: "#fff" }}>
                    {idx + 1}
                  </div>
                  <div className="wst-choice-card__info">
                    <span className="wst-choice-card__text" style={{ color: "#1f2937" }}>
                      {getChoiceLabel(choice)}
                    </span>
                    <span className="wst-choice-card__dest" style={{ color: "#4b5563" }}>
                      ➔ {formatChoiceDestinationInfo(choice)}
                    </span>
                  </div>
                </div>
                <span className="wst-choice-card__arrow" style={{ color: info.color }}>❯</span>
              </div>
            );
          })}

          {outgoingChoices.length === 0 && (
            <div className="wst-scene-details__empty-state">
              <p>ฉากนี้ยังไม่มีทางเลือกถัดไป (เป็นฉากจบตอน/ฉากจบเรื่อง)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Wrapper Component หุ้มด้วย ReactFlowProvider เพื่อแชร์ Context
const WriterStoryTreePage = (props) => {
  return (
    <ReactFlowProvider>
      <StoryTreeInner {...props} />
    </ReactFlowProvider>
  );
};

export default WriterStoryTreePage;