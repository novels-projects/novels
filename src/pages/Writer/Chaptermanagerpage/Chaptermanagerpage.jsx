// ⚠️ รอการแก้ไขโค้ดเรื่อง Backend PUT /novels/:id ล้างสถานะการถูกระงับ (suspended) เมื่อผู้เขียนแก้ไขรูปปกหรือข้อมูลนิยาย
// src/pages/Writer/ChapterManager/ChapterManagerPage.jsx

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import "./ChapterManagerPage.css";
import { getNovelStatusInfo, registerBannedNovel, isNovelBannedInRegistry, cleanBanReason, extractBanDetails, getBannedRegistry } from "../../../utils/novelStatus";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import UnsavedChangesModal from "../../../components/UnsavedChangesModal/UnsavedChangesModal";
import { getChoiceConnectionBlockReason, getChoiceConnectionMessage } from "../../../utils/choiceValidation";
import { ShieldAlert, X, AlertCircle, Send, ChevronDown, ChevronRight, Check, Eye, GitFork, Layers, FileText, Clock, Search, AlertTriangle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || "http://localhost:9000";
const getToken = () => localStorage.getItem("token");

// 🕒 ฟังก์ชันแปลงเวลาแบบ Global ตัวเดียวใช้ทั้งไฟล์
const formatThaiDate = (dateString, includeTime = false) => {
  if (!dateString) return "ไม่ระบุ";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString.split("T")[0] || dateString;

    if (includeTime) {
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' น.';
    }

    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch (e) {
    return "ไม่ระบุ";
  }
};

const formatNovelCoverImage = (cover) => {
  if (!cover || typeof cover !== "string") return null;
  return cover.replace("http://minio:9000", IMAGE_BASE_URL);
};

const getNovelCategoryNames = (novel) => {
  const categories = novel?.categories || novel?.Categories || [];
  if (!Array.isArray(categories)) return [];
  return Array.from(new Set(
    categories
      .map((cat) => {
        if (!cat) return null;
        if (typeof cat === "string") return cat;
        return cat.name || cat.Name || cat.title || cat.label || null;
      })
      .filter(Boolean)
  ));
};

const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  showCancel = true,
  type = "danger"
}) => {
  if (!isOpen) return null;
  const isWarning = type === "warning";
  const isInfo = type === "info";

  const iconBg = isWarning ? '#fffbeb' : isInfo ? '#eff6ff' : '#fef2f2';
  const iconBorder = isWarning ? '#fde68a' : isInfo ? '#bfdbfe' : '#fca5a5';
  const iconColor = isWarning ? '#d97706' : isInfo ? '#2563eb' : '#ef4444';
  const confirmBtnBg = isWarning
    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    : isInfo
      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
      : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
  const confirmBtnShadow = isWarning
    ? '0 4px 12px rgba(217, 119, 6, 0.25)'
    : isInfo
      ? '0 4px 12px rgba(37, 99, 235, 0.25)'
      : '0 4px 12px rgba(239, 68, 68, 0.25)';

  return (
    <div className="cm-modal-overlay" onClick={onCancel} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: '20px'
    }}>
      <div className="cm-modal-box" onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: '#ffffff', borderRadius: '18px', padding: '28px 24px',
        width: '100%', maxWidth: '420px', boxShadow: '0 20px 35px rgba(0,0,0,0.15)',
        textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
        animation: 'cmDropdownFadeIn 0.2s ease-out'
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          backgroundColor: iconBg, border: `1px solid ${iconBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor
        }}>
          <AlertTriangle size={26} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a', fontFamily: "'Sarabun', sans-serif" }}>
            {title}
          </h3>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, fontFamily: "'Sarabun', sans-serif", whiteSpace: 'pre-line' }}>
            {message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '6px' }}>
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px',
                border: '1.5px solid #cbd5e1', backgroundColor: '#ffffff',
                color: '#475569', fontSize: '13.5px', fontWeight: '700',
                cursor: 'pointer', fontFamily: "'Sarabun', sans-serif",
                transition: 'all 0.15s ease'
              }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm || onCancel}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: '10px',
              border: 'none', background: confirmBtnBg,
              color: '#ffffff', fontSize: '13.5px', fontWeight: '700',
              cursor: 'pointer', fontFamily: "'Sarabun', sans-serif",
              boxShadow: confirmBtnShadow,
              transition: 'all 0.15s ease'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ข้อความ default ของแบนเนอร์แจ้งเตือนแบน
const BAN_NOTICE_DEFAULTS = {
  reason: "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง (รายละเอียด: หน้าปกละเมิดลิขสิทธิ์)",
  details: null,
};

// 🔒 ข้อความแจ้งเตือนเดียว ใช้ร่วมกันทุกจุดที่บล็อกการกระทำเมื่อนิยายถูกแบน
const BAN_ACTION_BLOCKED_MSG = "นิยายเรื่องนี้ถูกระงับการเผยแพร่ กรุณาตรวจสอบข้อหา แก้ไขเนื้อหา และส่งเรื่องขอปลดแบนให้แอดมินตรวจสอบก่อน";

// เรียกก่อนทำ action ใดๆที่มีผลต่อการเผยแพร่
const blockIfBanned = (novelOrStatusInfo) => {
  const isBanned = novelOrStatusInfo?.isBanned ?? getNovelStatusInfo(novelOrStatusInfo)?.isBanned;
  if (isBanned) {
    alert(BAN_ACTION_BLOCKED_MSG);
    return true;
  }
  return false;
};

/* 🔴 แถบแจ้งเตือนเรื่องการโดนระงับอยู่ด้านบนรายละเอียดนิยาย */
const BanWarningBanner = ({
  reason,
  details,
  hasPendingAppeal = false,
  isAppealRejected = false,
  onRequestAppeal,
}) => {
  const [showBanDetails, setShowBanDetails] = useState(false);
  const displayReason = cleanBanReason(reason || BAN_NOTICE_DEFAULTS.reason);
  const displayDetails = extractBanDetails(reason, details);

  // 1️⃣ เมื่อยื่นคำขอปลดแบนเรียบร้อยแล้ว (กำลังรอแอดมินพิจารณา) -> แสดงเฉพาะกรอบสีฟ้าเรียบหรู พร้อมปุ่มกดดูรายละเอียด
  if (hasPendingAppeal) {
    return (
      <div className="cm-ban-pending-card" style={{
        margin: "0 0 20px 0",
        padding: "16px 20px",
        backgroundColor: "#f0f9ff",
        border: "1.5px solid #bae6fd",
        borderRadius: "18px",
        color: "#0369a1",
        boxShadow: "0 4px 15px rgba(3, 105, 161, 0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily: "'Sarabun', sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "#e0f2fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Clock size={22} style={{ color: "#0284c7" }} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#0369a1" }}>
                ยื่นคำขอปลดแบนเรียบร้อยแล้ว
              </h4>
              <span style={{ fontSize: "13px", fontWeight: "500", color: "#0284c7" }}>
                อยู่ในระหว่างรอแอดมินพิจารณาตรวจสอบ
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBanDetails((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 16px",
              borderRadius: "9999px",
              border: "1.5px solid #7dd3fc",
              backgroundColor: "#ffffff",
              color: "#0284c7",
              fontSize: "12.5px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.08)",
              outline: "none"
            }}
          >
            <span>{showBanDetails ? "ซ่อนรายละเอียด" : "ดูรายละเอียดเรื่องการโดนแบน"}</span>
            <ChevronDown size={14} style={{ transform: showBanDetails ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
          </button>
        </div>

        {showBanDetails && (
          <div style={{
            marginTop: "6px",
            paddingTop: "14px",
            borderTop: "1px dashed #bae6fd",
            fontSize: "13.5px",
            color: "#1e3a8a",
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }}>
            <p style={{ margin: 0 }}><strong>สาเหตุการระงับ:</strong> <span>{displayReason}</span></p>
            {displayDetails && <p style={{ margin: 0 }}><strong>เหตุผล/รายละเอียดเพิ่มเติม:</strong> <span>{displayDetails}</span></p>}
          </div>
        )}
      </div>
    );
  }

  // 2️⃣ กรณียังไม่ได้ยื่นคำขอปลดแบน หรือคำขอเดิมถูกปฏิเสธ -> แสดงกรอบเตือนสีแดงพร้อมขั้นตอนยื่นคำขอ
  return (
    <div className="cm-ban-warning-card" role="alert">
      <div className="cm-ban-warning-card__top">
        <div className="cm-ban-warning-card__icon-box">
          <ShieldAlert size={22} className="cm-ban-warning-card__shield-icon" />
        </div>
        <div className="cm-ban-warning-card__header-info">
          <h3 className="cm-ban-warning-card__title">นิยายเรื่องนี้ถูกระงับการเผยแพร่</h3>
          <p className="cm-ban-warning-card__row">
            <strong>สาเหตุการระงับ:</strong> <span>{displayReason}</span>
          </p>
          {displayDetails && (
            <p className="cm-ban-warning-card__row cm-ban-warning-card__row--sub">
              <strong>เหตุผล/รายละเอียดเพิ่มเติม:</strong> <span>{displayDetails}</span>
            </p>
          )}
        </div>
      </div>

      {isAppealRejected && (
        <div style={{
          margin: "12px 0 16px 0",
          padding: "12px 16px",
          backgroundColor: "#fef2f2",
          border: "1.5px solid #fca5a5",
          borderRadius: "12px",
          color: "#991b1b",
          fontSize: "13px",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <AlertCircle size={16} style={{ color: "#dc2626", flexShrink: 0 }} />
          <span>คำขอปลดแบนก่อนหน้านี้ถูกปฏิเสธโดยแอดมิน กรุณาตรวจสอบเหตุผล แก้ไขเนื้อหาให้ถูกต้อง และยื่นคำขอปลดแบนอีกครั้ง</span>
        </div>
      )}

      <div className="cm-ban-warning-card__steps-box">
        <h4 className="cm-ban-warning-card__steps-title">ขั้นตอนการยื่นคำขอปลดแบน</h4>
        <div className="cm-ban-warning-card__steps-list">
          <div className="cm-ban-warning-step">
            <span className="cm-ban-warning-step__num">1</span>
            <div className="cm-ban-warning-step__content">
              <strong className="cm-ban-warning-step__title">ตรวจสอบเนื้อหาที่ถูกแจ้ง</strong>
              <span className="cm-ban-warning-step__desc">อ่านสาเหตุและรายละเอียดด้านบน</span>
            </div>
          </div>
          <div className="cm-ban-warning-step">
            <span className="cm-ban-warning-step__num">2</span>
            <div className="cm-ban-warning-step__content">
              <strong className="cm-ban-warning-step__title">แก้ไขเนื้อหาให้ถูกต้อง</strong>
              <span className="cm-ban-warning-step__desc">แก้ปก/เนื้อหาที่ละเมิดกฎ</span>
            </div>
          </div>
          <div className="cm-ban-warning-step">
            <span className="cm-ban-warning-step__num">3</span>
            <div className="cm-ban-warning-step__content">
              <strong className="cm-ban-warning-step__title">ยื่นคำขอปลดแบน</strong>
              <span className="cm-ban-warning-step__desc">กดปุ่มด้านล่างเพื่อชี้แจง</span>
            </div>
          </div>
        </div>
      </div>

      <button 
        type="button" 
        className="cm-ban-warning-card__btn" 
        onClick={onRequestAppeal}
      >
        {isAppealRejected ? "ยื่นคำขอปลดแบนอีกครั้ง" : "ยื่นคำขอปลดแบน"} <span>→</span>
      </button>
    </div>
  );
};

/* 🔴 Pop up ยื่นคำขอปลดแบน */
const AppealModal = ({ isOpen, novel, hasPendingAppeal = false, onSubmit, onCancel, isSubmitting = false }) => {
  const [reasonText, setReasonText] = useState("");

  useEffect(() => {
    if (isOpen) setReasonText("");
  }, [isOpen]);

  if (!isOpen) return null;
  const trimmedReason = reasonText.trim();
  const rawReason = novel?.ban_reason || novel?.banReason || novel?.reason || novel?.suspend_reason || novel?.suspension_reason || BAN_NOTICE_DEFAULTS.reason;
  const displayReason = cleanBanReason(rawReason);
  const displayDetails = extractBanDetails(rawReason, novel?.ban_details || novel?.banDetails || novel?.details || novel?.report_details);
  const isValidLength = trimmedReason.length >= 10;

  return (
    <div className="cm-modal-overlay" onClick={onCancel}>
      <div className="cm-appeal-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cm-appeal-modal__header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="cm-ban-warning-card__icon-box" style={{ width: 40, height: 40 }}>
              <ShieldAlert size={20} className="cm-ban-warning-card__shield-icon" />
            </div>
            <div>
              <h3 className="cm-appeal-modal__title">ยื่นคำขอปลดแบน</h3>
              <p className="cm-appeal-modal__sub">ทีมงานจะตรวจสอบและติดต่อกลับ</p>
            </div>
          </div>
          <button 
            type="button" 
            className="cm-appeal-modal__close-btn" 
            onClick={onCancel} 
            disabled={isSubmitting}
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {hasPendingAppeal && (
          <div style={{
            margin: "0 0 16px 0",
            padding: "12px 16px",
            backgroundColor: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: "10px",
            color: "#0369a1",
            fontSize: "0.85rem",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span>⏳</span>
            <span>คุณได้ยื่นคำขอปลดแบนเรื่องนี้ไว้แล้ว กำลังอยู่ในระหว่างรอแอดมินพิจารณา</span>
          </div>
        )}

        {/* Top Banned Reason Box */}
        <div className="cm-appeal-modal__reason-box">
          <span className="cm-appeal-modal__reason-label">สาเหตุการระงับ</span>
          <strong className="cm-appeal-modal__reason-val">{displayReason}</strong>
          {displayDetails && (
            <span className="cm-appeal-modal__reason-details">
              <strong>เหตุผล/รายละเอียดเพิ่มเติม:</strong> {displayDetails}
            </span>
          )}
        </div>

        {/* Textarea Form */}
        <div className="cm-appeal-modal__form">
          <label className="cm-appeal-modal__form-label">
            ชี้แจงรายละเอียดการแก้ไข / เหตุผล
          </label>
          <textarea
            className="cm-appeal-modal__textarea"
            rows={4}
            placeholder="พิมพ์ข้อความชี้แจงของคุณที่นี่..."
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            disabled={isSubmitting || hasPendingAppeal}
          />
          <div className="cm-appeal-modal__counter">
            {trimmedReason.length}/10 ตัวอักษรขั้นต่ำ
          </div>

          <div className="cm-appeal-modal__warning-note">
            <AlertCircle size={14} className="cm-appeal-modal__warning-icon" />
            <span>การรายงานเท็จหรือกลั่นแกล้งผู้อื่น อาจส่งผลให้บัญชีของคุณถูกระงับการใช้งาน</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="cm-appeal-modal__actions">
          <button
            type="button"
            className="cm-appeal-modal__cancel-btn"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className={`cm-appeal-modal__submit-btn ${(isValidLength && !hasPendingAppeal) ? "is-valid" : ""}`}
            onClick={() => onSubmit(trimmedReason)}
            disabled={isSubmitting || !isValidLength || hasPendingAppeal}
          >
            <Send size={15} />
            <span>{isSubmitting ? "กำลังส่ง..." : hasPendingAppeal ? "รอการตรวจสอบ" : "ยืนยันส่งเรื่อง"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* 🎨 Custom Pill Status Dropdown Component (ทรงแคปซูลสำหรับสถานะเผยแพร่) */
const PillStatusDropdown = ({
  value,
  onChange,
  disabled = false,
  labelPublished = "เผยแพร่แล้ว",
  labelDraft = "ฉบับร่าง",
  size = "md",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const rawVal = (value || "").toString().toLowerCase();
  const isPublished = rawVal === "published" || rawVal === "active" || rawVal === "publish";

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (newValue) => {
    if (disabled) return;
    setIsOpen(false);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const isSm = size === "sm";

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: isSm ? "5px 12px" : "7px 16px",
          borderRadius: "9999px",
          fontSize: isSm ? "12px" : "13px",
          fontWeight: "700",
          fontFamily: "'Sarabun', sans-serif",
          cursor: disabled ? "not-allowed" : "pointer",
          border: `1.5px solid ${isPublished ? "#86efac" : "#d1d5db"}`,
          backgroundColor: isPublished ? "#f0fdf4" : "#f3f4f6",
          color: isPublished ? "#16a34a" : "#4b5563",
          boxShadow: isPublished ? "0 2px 6px rgba(22, 163, 74, 0.08)" : "0 2px 6px rgba(75, 85, 99, 0.05)",
          transition: "all 0.2s ease",
          userSelect: "none",
          opacity: disabled ? 0.6 : 1,
          outline: "none",
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span 
          style={{ 
            width: "8px", 
            height: "8px", 
            borderRadius: "50%", 
            backgroundColor: isPublished ? "#22c55e" : "#9ca3af",
            display: "inline-block",
            flexShrink: 0
          }} 
        />
        <span>{isPublished ? labelPublished : labelDraft}</span>
        <ChevronDown 
          size={14} 
          style={{ 
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", 
            transition: "transform 0.2s ease",
            color: isPublished ? "#16a34a" : "#6b7280"
          }} 
        />
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          minWidth: "140px",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "6px",
          border: "1.5px solid #f1f5f9",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.05)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          animation: "cmDropdownFadeIn 0.15s ease-out",
        }}>
          {/* เผยแพร่ Option (Green) */}
          <div
            onClick={() => handleSelect("published")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderRadius: "9999px",
              fontSize: "13px",
              fontWeight: "700",
              fontFamily: "'Sarabun', sans-serif",
              color: "#16a34a",
              backgroundColor: isPublished ? "#f0fdf4" : "transparent",
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseOver={(e) => {
              if (!isPublished) e.currentTarget.style.backgroundColor = "#f0fdf4";
            }}
            onMouseOut={(e) => {
              if (!isPublished) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e" }} />
              <span>{labelPublished}</span>
            </div>
            {isPublished && <Check size={14} style={{ color: "#16a34a" }} />}
          </div>

          {/* ฉบับร่าง Option (Gray) */}
          <div
            onClick={() => handleSelect("draft")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderRadius: "9999px",
              fontSize: "13px",
              fontWeight: "700",
              fontFamily: "'Sarabun', sans-serif",
              color: "#4b5563",
              backgroundColor: !isPublished ? "#f3f4f6" : "transparent",
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseOver={(e) => {
              if (isPublished) e.currentTarget.style.backgroundColor = "#f3f4f6";
            }}
            onMouseOut={(e) => {
              if (isPublished) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#9ca3af" }} />
              <span>{labelDraft}</span>
            </div>
            {!isPublished && <Check size={14} style={{ color: "#4b5563" }} />}
          </div>
        </div>
      )}
    </div>
  );
};

const NovelBanner = ({ novel, chapters, onEdit, onToggleStatus, isUpdatingNovelStatus = false }) => {
  if (!novel) return <div className="cm-banner-loading">กำลังโหลดรายละเอียดนิยาย...</div>;

  const title = novel.title || "นิยายเรื่องนี้ยังไม่ได้ตั้งชื่อ";
  const captions = novel.captions || novel.caption || novel.introduction || "ยังไม่มีเรื่องย่อ...";
  const coverImage = formatNovelCoverImage(novel.cover_image || novel.coverImage || novel.coverUrl || novel.cover_url);
  const coverBg = novel.cover_bg || "var(--pink-100)";
  const coverEmoji = novel.cover_emoji || "📖";

  const updatedAt = novel?.updated_at || novel?.UpdatedAt || novel?.created_at || novel?.CreatedAt;

  const chapterCount = chapters?.length ?? 0;
  const categoryNames = getNovelCategoryNames(novel);
  const statusInfo = getNovelStatusInfo({ ...novel, id: novel?.id || novel?.novel_id || novel?.ID || novel?.NovelID });
  const isCompletedNovel = statusInfo.isCompleted;
  const isPublishedNovel = statusInfo.isPublished;

  const sceneCount = novel?.scene_count ?? novel?.sceneCount ?? novel?.total_scenes ?? novel?.totalScenes ?? chapters?.reduce((total, ch) => {
    const chScenes = ch.scenes || ch.Scenes || [];
    return total + chScenes.length;
  }, 0) ?? 0;

  return (
    <div className="cm-banner">
      <div className="cm-banner__inner">
        <div className="cm-banner__left flex-1">
          <div className="cm-banner__cover shrink-0" style={{ background: coverBg }}>
            {coverImage ? (
              <img
                src={coverImage}
                alt={`ปกนิยาย ${title}`}
                className="cm-banner__cover-img"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <span>{coverEmoji}</span>
            )}
          </div>

          <div className="cm-banner__info flex flex-col justify-center" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="cm-banner__title" style={{ marginTop: 0, marginBottom: '8px' }}>{title}</h2>
            <p className="cm-banner__synopsis" style={{ marginBottom: '12px' }}>{captions}</p>

            {categoryNames.length > 0 && (
              <div className="cm-banner__categories" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '0 0 14px 0' }}>
                {categoryNames.map((name, idx) => (
                  <span
                    key={`novel-category-${idx}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 14px',
                      borderRadius: '9999px',
                      backgroundColor: '#FDF3F8',
                      border: '1.5px solid #F8D6E5',
                      color: '#db2777',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      fontFamily: "'Sarabun', 'Prompt', sans-serif",
                      boxShadow: '0 2px 6px rgba(219, 39, 119, 0.04)',
                      userSelect: 'none'
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}

            <div className="cm-banner__stats flex items-center flex-wrap gap-2" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#334155', fontSize: '13.5px', fontFamily: "'Sarabun', sans-serif" }}>
                <Layers size={15} style={{ color: '#ec4899' }} /> {chapterCount} ตอน
              </span>
              <span className="cm-banner__dot" style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#334155', fontSize: '13.5px', fontFamily: "'Sarabun', sans-serif" }}>
                <FileText size={15} style={{ color: '#3b82f6' }} /> {sceneCount} ฉาก
              </span>
              <span className="cm-banner__dot" style={{ color: '#cbd5e1' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#64748b', fontSize: '13px', fontFamily: "'Sarabun', sans-serif" }}>
                <Clock size={14} style={{ color: '#94a3b8' }} /> อัปเดตล่าสุด: {formatThaiDate(updatedAt, true)}
              </span>
            </div>
          </div>
        </div>

        <div 
          className="cm-banner__right shrink-0 flex items-center gap-2" 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            flexShrink: 0,
            opacity: statusInfo.isBanned ? 0.7 : 1
          }}
        >
          <PillStatusDropdown
            value={isPublishedNovel ? "published" : "draft"}
            disabled={isUpdatingNovelStatus || statusInfo.isBanned}
            onChange={(newVal) => {
              if (statusInfo.isBanned) {
                alert(BAN_ACTION_BLOCKED_MSG);
                return;
              }
              onToggleStatus(newVal);
            }}
            labelPublished="เผยแพร่แล้ว"
            labelDraft="ฉบับร่าง"
            size="md"
          />
          <button 
            className="cm-btn cm-btn--outline cm-btn--sm" 
            onClick={onEdit}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px" }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            แก้ไข
          </button>
        </div>
      </div>

      {!isPublishedNovel && !isCompletedNovel && (
        <div className="cm-banner__draft-note w-full mt-0" style={{ width: '100%', maxWidth: '100%', margin: '0', display: 'flex', alignItems: 'center' }}>
          ✨ นิยายยังเป็นฉบับร่าง — ผู้เขียนและผู้ดูแลเท่านั้นที่เห็นเรื่องนี้ และทุกตอนจะยังไม่แสดงให้ผู้อ่านเห็น
        </div>
      )}
    </div>
  );
};

const ChoiceRow = ({ choice, choiceIndex, sceneOptions = [], currentChapterId, fromSceneId: propFromSceneId, onUpdate, onCreate, onCreateScene, onDeleteScene, onOpenScene, onDelete, openConfirmDialog }) => {
  const choiceId = choice?.id ?? choice?.ID ?? choice?.choice_id ?? choice?.ChoiceID;
  const choiceText = choice?.label ?? choice?.Label ?? choice?.text ?? choice?.Text ?? "";
  const choiceTargetSceneId = choice?.to_scene_id ?? choice?.ToSceneID ?? choice?.target_scene_id ?? choice?.TargetSceneID ?? "";
  const fromSceneId = propFromSceneId || choice?.from_scene_id || choice?.fromSceneID;
  const isNew = choice?.temp === true || String(choiceId).startsWith("temp-");

  const [text, setText] = useState(choiceText || "");
  const [subScene, setSubScene] = useState(choiceTargetSceneId);

  // 📝 อาเรย์รวมฉากทั้งหมดพร้อมคำนวณลำดับจริง (เช่น 1.2)
  const allScenes = (sceneOptions || []).flatMap((ch, chIdx) => {
    const chTitle = ch.episode ?? ch.Episode ?? ch.title ?? ch.Title ?? `ตอนที่ ${chIdx + 1}`;
    const chId = ch.id ?? ch.ID ?? ch.chapter_id ?? ch.ChapterID;
    const chScenes = (ch.scenes ?? ch.Scenes) || [];
    const chEpisodeNum = ch.episode ?? (chIdx + 1);
    
    return chScenes.map((s, scIdx) => ({
      value: s.id ?? s.ID ?? s.scene_id ?? s.SceneID,
      label: (s.title ?? s.Title) || "(ฉากไม่มีชื่อ)",
      chapterLabel: chTitle,
      chapterId: chId,
      type: s.type ?? s.Type,
      displayNum: `${chEpisodeNum}.${scIdx + 1}`
    }));
  });

  const targetScene = allScenes.find((scene) => String(scene.value) === String(choiceTargetSceneId));

  // Initialize States
  const [scope, setScope] = useState(() => (targetScene ? (String(targetScene.chapterId) === String(currentChapterId) ? "same" : "other") : "same"));
  const [selectedChapterId, setSelectedChapterId] = useState(() => targetScene?.chapterId || currentChapterId);
  const [connectionMode, setConnectionMode] = useState("existing");
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [newSceneChapterId, setNewSceneChapterId] = useState(currentChapterId || "");

  const [isEditing, setIsEditing] = useState(isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdScene, setCreatedScene] = useState(null);

  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const chapterOptions = (sceneOptions || []).map((ch, idx) => {
    const displayNum = ch.episode ?? (idx + 1);
    return {
      value: ch.id ?? ch.ID ?? ch.chapter_id ?? ch.ChapterID,
      label: `ตอนที่ ${displayNum} — ${ch.title ?? ch.Title ?? "(ยังไม่มีชื่อบท)"}`,
    };
  });

  // 🔍 กรองฉากปลายทางตาม Scope และ Chapter ที่เลือก
  const activeChapterId = scope === "same" ? currentChapterId : selectedChapterId;
  
  const availableTargetScenes = allScenes.filter((scene) => {
    // ต้องตรงกับ Chapter ที่เลือก
    if (String(scene.chapterId) !== String(activeChapterId)) return false;
    // ห้ามเลือกฉากตัวเอง
    if (String(scene.value) === String(fromSceneId)) return false;
    const sourceIndex = allScenes.findIndex((item) => String(item.value) === String(fromSceneId));
    const targetIndex = allScenes.findIndex((item) => String(item.value) === String(scene.value));
    if (sourceIndex !== -1 && targetIndex <= sourceIndex) return false;
    return true;
  });

  const selectedTargetScene = allScenes.find((scene) => String(scene.value) === String(subScene));
  const sourceIndex = allScenes.findIndex((scene) => String(scene.value) === String(fromSceneId));
  const targetIndex = allScenes.findIndex((scene) => String(scene.value) === String(subScene));
  const connectionBlockReason = Boolean(subScene)
    ? getChoiceConnectionBlockReason(fromSceneId, subScene, sceneOptions, isNew ? null : choiceId)
    : "invalid";
  const normalizedConnectionBlockReason = connectionBlockReason || (
    sourceIndex !== -1 && targetIndex !== -1 && targetIndex <= sourceIndex ? "backward" : null
  );
  const handleSaveChoice = async () => {
    if (!text || text.trim() === "") {
      setFormError("กรุณากรอกข้อความบนปุ่มทางเลือกก่อน");
      return;
    }

    if (!subScene || subScene === "") {
      setFormError("กรุณาเลือกฉากปลายทางที่ต้องการเชื่อมโยง");
      return;
    }

    // 🛑 ตรวจสอบห้ามเชื่อมโยงเข้าหาตัวเอง
    if (normalizedConnectionBlockReason) {
      setFormError(`ไม่สามารถบันทึกได้: ${getChoiceConnectionMessage(normalizedConnectionBlockReason)}`);
      return;
    }

    setFormError("");
    const payload = {
      from_scene_id: parseInt(fromSceneId || currentChapterId, 10),
      to_scene_id: parseInt(subScene, 10) || 0,
      label: text.trim(),
    };

    setIsSaving(true);
    try {
      let saved = false;
      if (isNew) {
        saved = await onCreate?.(payload);
      } else {
        saved = await onUpdate(choiceId, payload);
      }

      if (saved) {
        setCreatedScene(null);
        setShowSuccess(true);
        timeoutRef.current = setTimeout(() => {
          setShowSuccess(false);
          setIsEditing(false);
        }, 1200);
      } else {
        setFormError("บันทึกไม่สำเร็จ: ไม่สามารถเชื่อมโยงทางเลือกได้");
      }
    } catch (err) {
      console.error("บันทึกตัวเลือกล้มเหลว:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAndConnectScene = async () => {
    if (!text || text.trim() === "") {
      setFormError("กรุณากรอกข้อความบนปุ่มทางเลือกก่อน");
      return;
    }
    if (!newSceneTitle.trim()) {
      setFormError("กรุณากรอกชื่อฉากใหม่ก่อน");
      return;
    }
    if (!newSceneChapterId) {
      setFormError("กรุณาเลือกตอนสำหรับฉากใหม่ก่อน");
      return;
    }
    const currentChapterIndex = chapterOptions.findIndex((chapter) => String(chapter.value) === String(currentChapterId));
    const targetChapterIndex = chapterOptions.findIndex((chapter) => String(chapter.value) === String(newSceneChapterId));
    if (currentChapterIndex !== -1 && targetChapterIndex !== -1 && targetChapterIndex < currentChapterIndex) {
      setFormError("ไม่สามารถสร้างฉากใหม่ในตอนก่อนหน้าได้ เพราะจะเป็นการเชื่อมย้อนกลับ");
      return;
    }

    setIsSaving(true);
    let createdSceneId = null;
    try {
      createdSceneId = await onCreateScene?.({
        title: newSceneTitle.trim(),
        chapterId: newSceneChapterId,
      });
      if (!createdSceneId) {
        throw new Error("ระบบไม่ได้รับรหัสฉากใหม่จากหลังบ้าน");
      }

      const payload = {
        from_scene_id: parseInt(fromSceneId || currentChapterId, 10),
        to_scene_id: parseInt(createdSceneId, 10),
        label: text.trim(),
      };
      const saved = isNew ? await onCreate?.(payload) : await onUpdate(choiceId, payload);
      if (!saved) {
        await onDeleteScene?.(createdSceneId);
        createdSceneId = null;
        throw new Error("บันทึกทางเลือกไม่สำเร็จ ระบบลบฉากใหม่ที่สร้างไว้แล้ว");
      }

      setNewSceneTitle("");
      setCreatedScene({ id: createdSceneId, chapterId: newSceneChapterId });
      setShowSuccess(true);
      timeoutRef.current = setTimeout(() => {
        setShowSuccess(false);
        setIsEditing(false);
      }, 1200);
    } catch (err) {
      console.error("สร้างฉากและเชื่อมทางเลือกล้มเหลว:", err);
      if (createdSceneId) {
        try {
          await onDeleteScene?.(createdSceneId);
        } catch (rollbackError) {
          console.error("ลบฉากใหม่ที่สร้างค้างไว้ไม่สำเร็จ:", rollbackError);
        }
      }
      setFormError(`ไม่สามารถสร้างฉากและเชื่อมทางเลือกได้: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const cardRef = useRef(null);
  const isNewlyCreated = isNew || choice.temp || String(choice.id).startsWith("temp-");

  useEffect(() => {
    if (isNewlyCreated && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isNewlyCreated]);

  if (isCancelled) return null;

  if (!isEditing) {
    const selectedTargetScene = allScenes.find((scene) => String(scene.value) === String(subScene));
    return (
      <div 
        ref={cardRef}
        className={isNewlyCreated ? "cm-choice--newly-added" : ""}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '14px 18px',
          backgroundColor: '#ffffff',
          border: isNewlyCreated ? '2px solid #db2777' : '1.5px solid #f1f5f9',
          borderRadius: '16px',
          marginBottom: '10px',
          gap: '8px',
          boxShadow: isNewlyCreated ? '0 0 0 3px rgba(219, 39, 119, 0.2)' : '0 2px 5px rgba(0,0,0,0.01)',
          transition: 'all 0.2s ease'
        }}
      >
        {isNewlyCreated && (
          <div className="cm-choice__new-badge">
            ✨ ทางเลือกใหม่ที่เพิ่มเข้ามา
          </div>
        )}

        {showSuccess && (
          <div className="cm-choice-success-toast">
            <Check size={16} />
            <span>บันทึกทางเลือกสำเร็จ!</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
            {/* หมายเลขตัวเลือกวงกลมสีชมพูหวาน */}
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#fdf2f8',
              color: '#db2777',
              border: '1.5px solid #fbcfe8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: '800',
              flexShrink: 0
            }}>
              {choiceIndex}
            </div>

            {/* คอลัมน์ข้อความและปลายทาง */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px', textAlign: 'left' }}>
              <span style={{ fontSize: '14.5px', fontWeight: text ? '700' : '400', color: text ? '#1e293b' : '#94a3b8', fontStyle: text ? 'normal' : 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {text || "กรอกข้อความทางเลือก..."}
              </span>
              <span style={{ fontSize: '12.5px', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ➔ ไปที่ <span style={{ color: '#db2777', fontWeight: '700' }}>{selectedTargetScene ? `${selectedTargetScene.displayNum} ${selectedTargetScene.label}` : "ยังไม่กำหนดฉากปลายทาง"}</span>
              </span>
            </div>
          </div>

          {/* ปุ่ม Edit/Delete ขวา */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button 
              onClick={() => setIsEditing(true)}
              style={{
                border: 'none',
                background: '#eff6ff',
                color: '#2563eb',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
              title="แก้ไขตัวเลือก"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button
              onClick={() => openConfirmDialog?.({
                title: "ยืนยันการลบตัวเลือก",
                message: `คุณต้องการลบตัวเลือก "${text || 'ไม่มีข้อความ'}" ใช่หรือไม่?`,
                confirmLabel: "ลบเลย",
                action: async () => {
                  if (choiceId) {
                    await onDelete?.(choiceId, isNew);
                  }
                }
              })}
              style={{
                border: 'none',
                background: '#fef2f2',
                color: '#ef4444',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
              title="ลบตัวเลือก"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        {createdScene && (
          <div className="cm-choice-created-feedback">
            สร้างฉากและเชื่อมทางเลือกสำเร็จ
            <button type="button" onClick={() => onOpenScene?.(createdScene.id, createdScene.chapterId)} className="cm-choice-created-feedback__button">
              ไปเขียนเนื้อหา
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cm-choice" style={{ border: '1.5px solid #f1f5f9', padding: '20px', borderRadius: '16px', backgroundColor: '#ffffff', marginBottom: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.01)' }}>
      <div className="cm-choice__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: 0 }}>
        
        {/* ข้อความตัวเลือก */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>ข้อความตัวเลือก</label>
          <input 
            className="cm-input" 
            value={text} 
            onChange={(e) => { setText(e.target.value); setFormError(""); }} 
            placeholder="กรอกข้อความทางเลือก..." 
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', fontFamily: "'Sarabun', sans-serif", outline: 'none' }}
          />
        </div>

        {/* เชื่อมไปยังฉากปลายทาง */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
          <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>เชื่อมไปยังฉากปลายทาง</label>

          <div className="cm-choice-connection-modes">
            <div
              onClick={() => { setConnectionMode("existing"); setFormError(""); }}
              className={`cm-choice-connection-mode ${connectionMode === "existing" ? "is-active" : ""}`}
            >
              <div className="cm-choice-connection-icon">
                🔗
              </div>
              <div className="cm-choice-connection-copy">
                <span>เลือกฉากที่มี</span>
                <small>เชื่อมกับฉากที่สร้างแล้ว</small>
              </div>
            </div>

            <div
              onClick={() => { setConnectionMode("new"); setFormError(""); }}
              className={`cm-choice-connection-mode ${connectionMode === "new" ? "is-active" : ""}`}
            >
              <div className="cm-choice-connection-icon">
                📝
              </div>
              <div className="cm-choice-connection-copy">
                <span>สร้างฉากใหม่</span>
                <small>สร้างและเชื่อมอัตโนมัติ</small>
              </div>
            </div>
          </div>
          
              {connectionMode === "existing" ? <>
          {/* ปุ่มวิทยุเลือกประเภทปลายทางเหมือนหน้าเขียนเนื้อหา */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}>
              <input
                type="radio"
                name={`scope-${choiceId}`}
                value="same"
                checked={scope === "same"}
                onChange={() => {
                  setScope("same");
                  setSubScene(""); 
                  setSelectedChapterId(currentChapterId);
                }}
                style={{ accentColor: '#db2777' }}
              />
              ฉากในตอนเดียวกัน
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}>
              <input
                type="radio"
                name={`scope-${choiceId}`}
                value="other"
                checked={scope === "other"}
                onChange={() => {
                  setScope("other");
                  setSubScene(""); 
                  const firstOtherCh = chapterOptions.find((ch) => String(ch.value) !== String(currentChapterId));
                  if (firstOtherCh) setSelectedChapterId(firstOtherCh.value);
                }}
                style={{ accentColor: '#db2777' }}
              />
              ฉากในตอนอื่น
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {/* เลือกตอนปลายทาง (สำหรับกรณีข้ามตอน) */}
            {scope === "other" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>เลือกตอนปลายทาง</span>
                <select 
                  className="cm-select" 
                  value={selectedChapterId || ""} 
                  onChange={(e) => {
                    setSelectedChapterId(e.target.value);
                    setSubScene(""); 
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', fontFamily: "'Sarabun', sans-serif", outline: 'none' }}
                >
                  <option value="">-- เลือกตอน --</option>
                  {chapterOptions.filter((ch) => String(ch.value) !== String(currentChapterId)).map((ch) => (
                    <option key={`target-chapter-opt-${ch.value}`} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* เลือกฉากปลายทาง */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>เลือกฉากปลายทาง</span>
              <select 
                className="cm-select" 
                value={subScene || ""} 
                onChange={(e) => { setSubScene(e.target.value); setFormError(""); }}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13.5px', fontFamily: "'Sarabun', sans-serif", outline: 'none' }}
              >
                <option value="">{availableTargetScenes.length > 0 ? "-- กรุณาเลือกฉากปลายทาง --" : "-- ไม่มีฉากที่สามารถโยงได้ --"}</option>
                {availableTargetScenes.map((s) => (
                  <option key={`target-scene-opt-${s.value}`} value={s.value}>ฉากที่ {s.displayNum} — {s.label}</option>
                ))}
              </select>
              {subScene && (
                <div
                  role="status"
                  className={`cm-choice-validation ${normalizedConnectionBlockReason ? "is-invalid" : "is-valid"}`}
                >
                  {normalizedConnectionBlockReason
                    ? getChoiceConnectionMessage(normalizedConnectionBlockReason)
                    : 'เส้นทางนี้เชื่อมต่อได้ ไม่พบลูปในโครงสร้างเรื่อง'}
                </div>
              )}
            </div>
          </div>
          </> : (
            <div className="cm-choice-new-scene-form">
              <label className="cm-choice-new-scene-form__label">
                ชื่อฉากใหม่
                <input className="cm-input cm-choice-new-scene-form__input" value={newSceneTitle} onChange={(e) => { setNewSceneTitle(e.target.value); setFormError(""); }} placeholder="เช่น การพบกับชายปริศนา" />
              </label>
              <label className="cm-choice-new-scene-form__label">
                สร้างฉากใหม่ในตอน
                <select className="cm-select cm-choice-new-scene-form__input" value={newSceneChapterId} onChange={(e) => setNewSceneChapterId(e.target.value)}>
                  <option value="">เลือกตอนที่ต้องการให้ฉากอยู่</option>
                  {chapterOptions.map((chapter) => <option key={chapter.value} value={chapter.value}>{chapter.label}</option>)}
                </select>
              </label>
            </div>
          )}
          {formError && <div role="alert" className="cm-choice-form-error">{formError}</div>}
        </div>

        {/* ปุ่มควบคุม */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px dashed #e5e7eb', paddingTop: '16px', marginTop: '8px' }}>
          <button
            className="cm-btn cm-btn--outline cm-btn--sm"
            type="button"
            onClick={() => {
              if (isNew) {
                setIsCancelled(true);
                if (choiceId) onDelete?.(choiceId, true);
              } else {
                setIsEditing(false);
              }
            }}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#64748b', cursor: 'pointer', fontWeight: '700', transition: 'all 0.15s ease' }}
          >
            ยกเลิก
          </button>
          {connectionMode === "existing" ? (
            <button
              className="cm-btn cm-btn--sm"
              onClick={handleSaveChoice}
              disabled={isSaving || showSuccess || Boolean(normalizedConnectionBlockReason)}
              style={{ 
                padding: '8px 16px', 
                fontSize: '13px', 
                borderRadius: '8px', 
                border: 'none', 
                background: showSuccess ? "#10b981" : "linear-gradient(90deg, #db2777, #ec4899)", 
                color: '#ffffff', 
                cursor: 'pointer', 
                fontWeight: '700', 
                boxShadow: showSuccess ? 'none' : '0 4px 10px rgba(219, 39, 119, 0.18)', 
                transition: "all 0.3s ease" 
              }}
            >
              {isSaving ? "กำลังบันทึก..." : showSuccess ? "บันทึกสำเร็จ!" : "บันทึกทางเลือก"}
            </button>
          ) : (
            <button
              className="cm-btn cm-btn--sm"
              onClick={handleCreateAndConnectScene}
              disabled={isSaving || showSuccess}
              style={{ 
                padding: '8px 16px', 
                fontSize: '13px', 
                borderRadius: '8px', 
                border: 'none', 
                background: showSuccess ? "#10b981" : "linear-gradient(90deg, #db2777, #ec4899)", 
                color: '#ffffff', 
                cursor: 'pointer', 
                fontWeight: '700', 
                boxShadow: showSuccess ? 'none' : '0 4px 10px rgba(219, 39, 119, 0.18)', 
                transition: "all 0.3s ease" 
              }}
            >
              {isSaving ? "กำลังสร้างฉากและเชื่อม..." : showSuccess ? "บันทึกสำเร็จ!" : "สร้างฉากและเชื่อมทางเลือก"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const SceneCard = ({
  scene,
  novelId,
  chapterId,
  chapterNumber,
  sceneIndex,
  onWrite,
  fetchScenes,
  allChapters,
  openConfirmDialog,
  isNovelBanned = false
}) => {
  const sceneId = scene?.scene_id ?? scene?.id ?? scene?.ID ?? scene?.SceneID;
  const sceneTitle = scene?.title ?? scene?.Title ?? `ฉากย่อยที่ ${sceneIndex}`;
  const sceneContent = scene?.content ?? scene?.Content ?? "";
  const sceneChoices = (scene?.choices ?? scene?.Choices) || [];

  const sceneType = (scene?.type || scene?.Type || "").toString().toLowerCase();
  const isStartScene = sceneType === "start" || scene?.is_start_scene || scene?.isStart;
  const sceneStatus = (scene?.status || scene?.Status || (scene?.isPublished || scene?.is_published ? "published" : "draft") || "draft").toString().toLowerCase();
  const isPublishedScene = sceneStatus === "published";
  const isEnding = sceneType === "ending" || Boolean(scene?.ending_title || scene?.EndingTitle || scene?.endingTitle);
  const endingTitle = (scene?.ending_title ?? scene?.EndingTitle ?? scene?.endingTitle ?? "").trim();
  const endingType = (scene?.ending_type ?? scene?.EndingType ?? scene?.endingType ?? "").trim();
  const isChapterOneScene = Number(chapterNumber) === 1;

  const stripHtmlTags = (html) => {
    if (!html) return "";
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const text = doc.body.textContent || doc.body.innerText || "";
      // กำจัดช่องว่างขาวเว้นวรรคที่ซ้ำซ้อน
      return text.replace(/\s+/g, " ").trim();
    } catch (e) {
      // Fallback decode ในกรณีพิเศษ
      return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
    }
  };

  const cleanTextPreview = stripHtmlTags(sceneContent);
  const [isBodyOpen, setIsBodyOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [newChoices, setNewChoices] = useState([]);
  const [isUpdatingSceneStatus, setIsUpdatingSceneStatus] = useState(false);

  useEffect(() => {
    setNewChoices([]);
  }, [sceneId]);

  const allSceneChoices = [...sceneChoices, ...newChoices];
  const choiceCount = allSceneChoices.length;

  const formatEndingText = () => {
    const typeSuffix = endingType ? `(${endingType})` : "";
    if (!endingTitle) {
      return `ฉากจบ ${typeSuffix}`.trim();
    } else {
      return `ฉากจบ : ${endingTitle} ${typeSuffix}`.trim();
    }
  };

  const handleAddChoice = () => {
    if (!sceneId) return;
    const uniqueTempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setNewChoices((prev) => [...prev, {
      id: uniqueTempId,
      temp: true,
      from_scene_id: sceneId,
      label: "",
      to_scene_id: "",
    }]);
    setIsBodyOpen(true);
  };

  const handleCreateSceneFromChoice = async ({ title, chapterId: targetChapterId }) => {
    if (isNovelBanned) {
      throw new Error("นิยายถูกระงับ ไม่สามารถเพิ่มฉากได้");
    }

    const authToken = getToken();
    if (!authToken) throw new Error("กรุณาเข้าสู่ระบบก่อนเพิ่มฉาก");

    const res = await fetch(`${API_BASE}/scenes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        novel_id: parseInt(novelId, 10),
        chapter_id: parseInt(targetChapterId, 10),
        title: title.trim(),
        content: "",
        x: 0,
        y: 0,
        type: "normal",
        status: "draft",
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || errorData?.message || "สร้างฉากใหม่ไม่สำเร็จ");
    }

    const data = await res.json().catch(() => null) || {};
    const createdSceneId = data.scene_id ?? data.id ?? data.data?.scene_id ?? data.data?.id;
    if (!createdSceneId) throw new Error("ระบบไม่ได้รับรหัสฉากใหม่จากหลังบ้าน");

    await fetchScenes();
    window.dispatchEvent(new Event("novel-data-updated"));
    return createdSceneId;
  };

  const handleApplyChoice = async (choiceId, updatedData) => {
    if (!choiceId) return false;
    try {
      const authToken = getToken();
      const res = await fetch(`${API_BASE}/choices/${choiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) { await fetchScenes(); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  const handleDeleteChoice = async (choiceId, isNew) => {
    if (isNew || String(choiceId).startsWith("temp-")) {
      setNewChoices((prev) => prev.filter((c) => String(c.id) !== String(choiceId)));
      return;
    }

    try {
      const authToken = getToken();
      const res = await fetch(`${API_BASE}/choices/${choiceId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) fetchScenes();
    } catch (err) { console.error(err); }
  };

  const handleDeleteScene = async (targetId) => {
    if (!targetId) return;
    try {
      const authToken = getToken();
      const res = await fetch(`${API_BASE}/scenes/${targetId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });

      if (res.ok) {
        await fetchScenes();
        return;
      }

      const errorText = await res.text().catch(() => "");
      let displayMessage = "ไม่สามารถลบฉากนี้ได้ กรุณาลองซ้ำอีกครั้ง";

      if (res.status === 404 || errorText.toLowerCase().includes("404 page not found")) {
        displayMessage = "ไม่พบข้อมูลฉากนี้ในระบบ (อาจถูกลบไปแล้ว)";
      } else {
        try {
          const errorJson = JSON.parse(errorText);
          const rawMsg = errorJson?.error?.message || errorJson?.message || "";

          if (rawMsg === "Cannot delete scene with incoming choices" || errorText.includes("Cannot delete scene with incoming choices")) {
            displayMessage = "ไม่สามารถลบฉากนี้ได้ เนื่องจากมีตัวเลือกจากฉากอื่นเชื่อมโยงมายังฉากนี้ กรุณาลบหรือแก้ไขตัวเลือกดังกล่าวก่อนเพื่อดำเนินการต่อ";
          } else if (rawMsg === "Start scene cannot be deleted" || errorText.includes("Start scene cannot be deleted")) {
            displayMessage = "ไม่สามารถลบฉากเริ่มต้นได้ เนื่องจากนิยายจำเป็นต้องมีฉากเริ่มต้นเสมอ\n(หากต้องการลบ กรุณาตั้งฉากอื่นเป็นจุดเริ่มต้นก่อน)";
          } else if (rawMsg) {
            displayMessage = `เกิดข้อผิดพลาด: ${rawMsg}`;
          }
        } catch (e) {
          if (errorText.includes("Cannot delete scene with incoming choices")) {
            displayMessage = "ไม่สามารถลบฉากนี้ได้ เนื่องจากมีตัวเลือกจากฉากอื่นเชื่อมโยงมายังฉากนี้ กรุณาลบหรือแก้ไขตัวเลือกดังกล่าวก่อนเพื่อดำเนินการต่อ";
          } else if (errorText.includes("Start scene cannot be deleted")) {
            displayMessage = "ไม่สามารถลบฉากเริ่มต้นได้ เนื่องจากนิยายจำเป็นต้องมีฉากเริ่มต้นเสมอ\n(หากต้องการลบ กรุณาตั้งฉากอื่นเป็นจุดเริ่มต้นก่อน)";
          } else if (errorText) {
            displayMessage = errorText;
          }
        }
      }

      openConfirmDialog?.({
        title: "ไม่สามารถลบฉากได้",
        message: displayMessage,
        confirmLabel: "รับทราบ",
        showCancel: false,
        type: "warning",
      });
    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการลบฉาก:", err);
      openConfirmDialog?.({
        title: "เกิดข้อผิดพลาด",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง",
        confirmLabel: "รับทราบ",
        showCancel: false,
        type: "warning",
      });
    }
  };

  const handleToggleSceneStatus = async (e) => {
    const nextStatus = e.target.value;
    if (nextStatus === sceneStatus) return;
    if (isNovelBanned) { alert(BAN_ACTION_BLOCKED_MSG); return; } // ⛔ ห้ามเผยแพร่ฉาก ถ้านิยายถูกแบน
    setIsUpdatingSceneStatus(true);

    try {
      const payload = {
        title: sceneTitle,
        content: sceneContent,
        type: isEnding ? "ending" : (sceneType || "normal"),
        status: nextStatus,
        is_ending: isEnding,
        ending_title: endingTitle,
        ending_type: endingType,
        ending_description: scene?.ending_description ?? scene?.endingDescription ?? scene?.EndingDescription ?? "",
      };

      const authToken = getToken();
      const res = await fetch(`${API_BASE}/scenes/${sceneId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("เปลี่ยนสถานะฉากไม่สำเร็จ");
      }
      await fetchScenes();
    } catch (err) {
      console.error(err);
      alert("เปลี่ยนสถานะฉากไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsUpdatingSceneStatus(false);
    }
  };

  return (
    <div className="cm-scene" id={`scene-card-${sceneId}`} style={{
      marginBottom: '14px',
      border: '1.5px solid #f1f5f9',
      borderRadius: '16px',
      backgroundColor: '#ffffff',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.012)',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'visible',
      zIndex: isMenuOpen ? 50 : 1
    }}>
      <div className="cm-scene__header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        boxSizing: 'border-box',
        gap: '16px'
      }}>
        {/* ส่วนข้อมูลหลักด้านซ้าย */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          {/* ▶/▼ ปุ่ม dropdown หน้าฉากเพื่อสลับสถานะแสดงทางเลือก */}
          <button
            onClick={() => setIsBodyOpen(!isBodyOpen)}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '6px 4px',
              color: isBodyOpen ? '#db2777' : '#94a3b8',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s',
              transform: isBodyOpen ? 'rotate(90deg)' : 'none',
              outline: 'none',
              userSelect: 'none'
            }}
            title={isBodyOpen ? "ซ่อนตัวเลือกตัดสินใจ" : "แสดงตัวเลือกตัดสินใจ"}
          >
            ▶
          </button>

          {/* ป้ายแสดงเลขบทฉากย่อย คืนค่าใช้สีชมพูจาง/ชมพูสดแบบเดิม */}
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            backgroundColor: '#fdf2f8',
            color: '#db2777',
            border: '1.5px solid #fbcfe8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: '900',
            flexShrink: 0
          }}>
            {chapterNumber}.{sceneIndex}
          </div>

          {/* รายละเอียดข้อความด้านข้างป้ายตัวเลข */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left', gap: '2px' }}>
            <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: '800', color: '#1e293b' }}>
              {sceneTitle}
            </h4>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: 'fit-content',
              marginTop: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: '#fdf2f8',
              border: '1px solid #fbcfe8',
              color: '#be185d',
              fontSize: '11.5px',
              fontWeight: '800'
            }}>
              ทางเลือก {choiceCount} ทาง
            </span>
            
            {/* ป้ายบอกประเภทฉากย่อย */}
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>ประเภทฉาก :</span>
              {isStartScene ? (
                <span style={{ color: '#137333', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  ▷ ฉากเริ่มต้น
                </span>
              ) : isEnding ? (
                <span style={{ color: '#db2777', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  🚩 {formatEndingText()}
                </span>
              ) : (
                <span style={{ color: '#0369a1', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  📄 ฉากทั่วไป
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ส่วนปุ่มและคอนโทรลด้านขวา */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Dropdown เปลี่ยนสถานะการเผยแพร่ */}
          <PillStatusDropdown
            value={sceneStatus}
            disabled={isUpdatingSceneStatus || isNovelBanned}
            onChange={(newVal) => {
              if (isNovelBanned) {
                alert(BAN_ACTION_BLOCKED_MSG);
                return;
              }
              handleToggleSceneStatus({ target: { value: newVal } });
            }}
            labelPublished="เผยแพร่แล้ว"
            labelDraft="ฉบับร่าง"
            size="sm"
          />

          {/* ปุ่มเมนูย่อย จุดสามจุด */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '50%',
                backgroundColor: isMenuOpen ? '#f1f5f9' : '#fff',
                transition: 'background 0.2s',
                outline: 'none'
              }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              ⋮
            </button>

            {isMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998, backgroundColor: 'transparent' }}
                  onClick={() => setIsMenuOpen(false)}
                />
                <div style={{
                  position: 'absolute',
                  top: '42px',
                  right: '0px',
                  width: '160px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #f1f5f9',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
                  zIndex: 999,
                  padding: '6px 0',
                  overflow: 'hidden'
                }}>
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#1e293b', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => { setIsMenuOpen(false); onWrite(chapterId, sceneId); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    เขียนเนื้อหา
                  </button>

                  {/* เพิ่มทางเลือก */}
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#1e293b', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleAddChoice();
                    }}
                  >
                    <GitFork size={14} style={{ color: "#64748b" }} />
                    เพิ่มทางเลือก
                  </button>

                  {isChapterOneScene && !isStartScene && (
                    <>
                      <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                      <button
                        style={{ 
                          width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                          padding: '10px 16px', fontSize: '13.5px', color: '#2563eb', cursor: 'pointer', 
                          fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                          fontFamily: "'Sarabun', sans-serif"
                        }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#eff6ff'}
                        onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                        onClick={async () => {
                          setIsMenuOpen(false);
                          try {
                            const authToken = getToken();
                            const res = await fetch(`${API_BASE}/scenes/${sceneId}`, {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authToken}`
                              },
                              body: JSON.stringify({
                                title: sceneTitle,
                                content: sceneContent,
                                type: 'start',
                                status: sceneStatus,
                                is_ending: false,
                                ending_title: endingTitle,
                                ending_type: endingType,
                                ending_description: scene?.ending_description ?? scene?.endingDescription ?? scene?.EndingDescription ?? ''
                              })
                            });
                            if (!res.ok) {
                              const errorText = await res.text().catch(() => 'ไม่สามารถตั้งฉากเริ่มต้นได้');
                              alert(errorText || 'ไม่สามารถตั้งฉากเริ่มต้นได้');
                              return;
                            }
                            await fetchScenes();
                          } catch (err) {
                            console.error(err);
                            alert('ไม่สามารถตั้งฉากเริ่มต้นได้ กรุณาลองใหม่');
                          }
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                        ตั้งเป็นฉากเริ่มต้น
                      </button>
                    </>
                  )}
                  
                  <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                  
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#ef4444', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#fef2f2'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (isStartScene) {
                        openConfirmDialog?.({
                          title: "ไม่สามารถลบฉากเริ่มต้นได้",
                          message: `ฉาก "${sceneTitle}" เป็น "ฉากเริ่มต้น" ของเรื่องราวในนิยาย\n\nระบบจำเป็นต้องมีจุดเริ่มต้นเรื่องเสมอ จึงไม่อนุญาตให้ลบฉากนี้ออก (หากต้องการลบ กรุณาตั้งฉากอื่นเป็นฉากเริ่มต้นก่อน)`,
                          confirmLabel: "รับทราบ",
                          showCancel: false,
                          type: "warning",
                        });
                        return;
                      }

                      openConfirmDialog?.({
                        title: "ยืนยันการลบฉาก",
                        message: `คุณแน่ใจหรือไม่ที่จะลบฉาก "${sceneTitle}"? เนื้อหาและตัวเลือกทั้งหมดที่เชื่อมมายังฉากนี้จะถูกลบออกถาวร`,
                        confirmLabel: "ลบเลย",
                        action: async () => {
                          await handleDeleteScene(sceneId);
                        }
                      });
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    ลบฉาก
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ข้อความ Preview เนื้อหาของฉาก + ปุ่มเขียนเนื้อหาเด่นสะดุดตา */}
      <div style={{ padding: '0 20px 16px 20px', borderTop: '1px dashed #f1f5f9', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        {/* Preview ข้อความเนื้อเรื่องย่อ */}
        <p style={{ 
          margin: 0, 
          fontSize: '13.5px', 
          color: cleanTextPreview ? '#64748b' : '#d97706', 
          fontWeight: cleanTextPreview ? 'normal' : '700',
          whiteSpace: 'normal', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          display: '-webkit-box', 
          WebkitLineClamp: 1, 
          WebkitBoxOrient: 'vertical', 
          lineHeight: '1.5', 
          textAlign: 'left', 
          flex: 1 
        }}>
          {cleanTextPreview ? cleanTextPreview.substring(0, 180) + "..." : "⚠️ ฉากนี้ยังไม่มีเนื้อหา กดปุ่ม 'เขียนเนื้อหา' เพื่อเริ่มเขียนฉากนี้"}
        </p>

        {/* ✏️ ปุ่มเขียนเนื้อหาดีไซน์มินิมอลสีน้ำเงินอ่อน สบายตาและเข้ากับระบบ */}
        <button
          onClick={() => onWrite(chapterId, sceneId)}
          style={{
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            border: '1.5px solid #bfdbfe',
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '800',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontFamily: "'Sarabun', sans-serif",
            transition: 'all 0.2s ease',
            outline: 'none',
            flexShrink: 0
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#dbeafe';
            e.currentTarget.style.borderColor = '#93c5fd';
            e.currentTarget.style.color = '#1d4ed8';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
            e.currentTarget.style.borderColor = '#bfdbfe';
            e.currentTarget.style.color = '#2563eb';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          เขียนเนื้อหา
        </button>
      </div>

      {isBodyOpen && (
        <div className="cm-scene__choices" style={{ padding: '24px', backgroundColor: isEnding ? '#fffdf5' : '#fafaf9', borderTop: '1px solid #f1f5f9', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          {/* แสดงจำนวนซ้ำในรายละเอียดเพื่อให้ตรงกับรายการทางเลือกที่เปิดอยู่ */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#475569',
              marginBottom: '16px',
              userSelect: 'none'
            }}
          >
            <span>ทางเลือกในฉากนี้</span>
            <span style={{
              backgroundColor: '#fdf2f8',
              color: '#db2777',
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: '800',
              border: '1px solid #fbcfe8'
            }}>
              {choiceCount} ทาง
            </span>
          </div>
          {allSceneChoices.map((choice, i) => (
            <ChoiceRow
              key={`choice-row-${choice.id ?? choice.ID ?? choice.choice_id ?? choice.ChoiceID ?? i}`}
              choice={choice}
              choiceIndex={i + 1}
              sceneOptions={allChapters}
              currentChapterId={chapterId}
              fromSceneId={sceneId}
              onUpdate={handleApplyChoice}
              onCreateScene={handleCreateSceneFromChoice}
              onDeleteScene={handleDeleteScene}
              onOpenScene={onWrite}
              onCreate={async (choiceData) => {
                try {
                  const choiceToken = getToken();
                  const res = await fetch(`${API_BASE}/choices`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${choiceToken}` },
                    body: JSON.stringify(choiceData)
                  });

                  if (res.ok) {
                    setNewChoices((prev) => prev.filter((c) => c.id !== choice.id));
                    await fetchScenes();
                    return true;
                  }
                  return false;
                } catch (err) { console.error(err); return false; }
              }}
              onDelete={handleDeleteChoice}
              openConfirmDialog={openConfirmDialog}
            />
          ))}

          <button
            style={{
              marginTop: "12px",
              border: '1px dashed #f472b6',
              color: '#db2777',
              backgroundColor: '#fdf2f8',
              padding: '10px 20px',
              borderRadius: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#fbcfe8'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#fdf2f8'}
            onClick={handleAddChoice}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            เพิ่มทางเลือกใหม่
          </button>
        </div>
      )}

    </div>
  );
};

const ChapterPanel = ({
  chapter,
  novel,
  onWrite,
  fetchScenes,
  allChapters,
  onAddScene,
  onDeleteChapter,
  openConfirmDialog
}) => {
  // 🔒 ล็อคเครื่องมือเผยแพร่ทั้งหมดของตอนนี้ ถ้านิยายเรื่องนี้โดนแบนอยู่
  const isNovelBanned = getNovelStatusInfo(novel).isBanned;
  const [isOpen, setIsOpen] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [inputTitle, setInputTitle] = useState(chapter?.title ?? "");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);

  const chapterId = chapter?.id ?? chapter?.chapter_id ?? chapter?.ChapterID;
  const chapterTitle = chapter?.title ?? "บทที่ไม่มีชื่อ";
  const chapterNumber = chapter?.episode ?? "?";

  useEffect(() => {
    setInputTitle(chapter?.title ?? "");
    setIsEditingTitle(false);
  }, [chapterId, chapter?.title]);
  useEffect(() => {
    const target = sessionStorage.getItem("focusSceneTarget");
    if (!target || !isOpen) return;

    // หน่วงเวลาเล็กน้อย รอให้ API ดึงข้อมูลฉากใหม่มาวาดบนจอให้เสร็จก่อน
    const timer = setTimeout(() => {
      let element = null;

      // กรณีที่ 1: เพิ่งกดสร้างฉากใหม่ -> ให้เลื่อนไปหาฉากอันล่างสุดของตอนนี้
      if (target.startsWith("new_in_")) {
        const targetChId = target.replace("new_in_", "");
        if (String(targetChId) === String(chapterId)) {
          const scenes = chapter?.scenes || [];
          if (scenes.length > 0) {
            const lastScene = scenes[scenes.length - 1];
            const lastSceneId = lastScene?.scene_id ?? lastScene?.id ?? lastScene?.ID ?? lastScene?.SceneID;
            element = document.getElementById(`scene-card-${lastSceneId}`);
          }
        }
      }
      // กรณีที่ 2: เพิ่งกลับมาจากการแก้ไขฉาก -> เลื่อนไปหาฉากนั้นเลย
      else {
        element = document.getElementById(`scene-card-${target}`);
      }

      // ถ้าเจอเป้าหมาย ให้เลื่อนจอ + ทำไฮไลต์กรอบกระพริบให้ผู้ใช้สังเกตง่ายๆ
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // ไฮไลต์เรืองแสงสีชมพูแป๊บนึง
        const originalBoxShadow = element.style.boxShadow;
        element.style.transition = 'box-shadow 0.4s ease-out';
        element.style.boxShadow = '0 0 0 3px #db2777, 0 0 15px rgba(219, 39, 119, 0.4)';

        setTimeout(() => {
          element.style.boxShadow = originalBoxShadow || '0 8px 20px rgba(0, 0, 0, 0.04)';
        }, 2000);

        // เลื่อนเสร็จแล้วล้างความจำทิ้ง จะได้ไม่เลื่อนซ้ำเวลา Refresh หน้าเว็บ
        sessionStorage.removeItem("focusSceneTarget");
      }
    }, 600); // 600ms ให้จังหวะ UI โหลดนิ่งสนิท

    return () => clearTimeout(timer);
  }, [chapter?.scenes, chapterId, isOpen]);

  const handleSaveTitle = async () => {
    if (!inputTitle.trim()) return alert("กรุณากรอกชื่อตอน");
    setIsSavingTitle(true);
    try {
      const authToken = getToken();
      const res = await fetch(`${API_BASE}/chapters/${chapterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          episode: Number(chapterNumber),
          title: inputTitle.trim(),
          status: chapter?.status || "draft"
        })
      });
      if (res.ok) {
        setIsEditingTitle(false);
        await fetchScenes();
      } else {
        alert("แก้ไขชื่อตอนไม่สำเร็จ");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleToggleStatus = async () => {
    if (blockIfBanned(novel)) return; // ⛔ ห้ามเปลี่ยนสถานะเผยแพร่ของตอน ถ้านิยายถูกแบน
    const currentStatus = (chapter?.status || chapter?.Status || "draft").toString().toLowerCase();
    const isPublishedChapter = currentStatus === "published" || currentStatus === "active";
    const nextStatus = isPublishedChapter ? "draft" : "published";

    setIsUpdatingStatus(true);
    try {
      const authToken = getToken();
      const chapterRes = await fetch(`${API_BASE}/chapters/${chapterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          episode: Number(chapterNumber),
          title: chapterTitle,
          status: nextStatus
        })
      });

      if (!chapterRes.ok) {
        throw new Error("เปลี่ยนสถานะตอนไม่สำเร็จ");
      }

      const sceneUpdates = (chapter?.scenes || []).map(async (scene) => {
        const sceneId = scene?.scene_id ?? scene?.id ?? scene?.ID ?? scene?.SceneID;
        if (!sceneId) return null;

        const sceneType = (scene?.type || scene?.Type || "normal").toString().toLowerCase();
        const nextSceneStatus = nextStatus;
        const isEnding = sceneType === "ending" || Boolean(scene?.ending_title || scene?.EndingTitle || scene?.endingTitle);

        const payload = {
          title: scene?.title ?? scene?.Title ?? "",
          content: scene?.content ?? scene?.Content ?? "",
          type: isEnding ? "ending" : (sceneType || "normal"),
          status: nextSceneStatus,
          is_ending: isEnding,
          ending_title: scene?.ending_title ?? scene?.EndingTitle ?? scene?.endingTitle ?? "",
          ending_type: scene?.ending_type ?? scene?.EndingType ?? scene?.endingType ?? "",
          ending_description: scene?.ending_description ?? scene?.endingDescription ?? scene?.EndingDescription ?? "",
        };

        const sceneRes = await fetch(`${API_BASE}/scenes/${sceneId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (!sceneRes.ok) {
          const errText = await sceneRes.text().catch(() => "");
          throw new Error(errText || `อัปเดตฉาก ${sceneId} ไม่สำเร็จ`);
        }

        return sceneId;
      });

      await Promise.all(sceneUpdates);
      await fetchScenes();
    } catch (err) {
      console.error(err);
      alert(err.message || "เปลี่ยนสถานะตอนไม่สำเร็จ");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleUpdateChapterStatus = async (nextStatus) => {
    if (blockIfBanned(novel)) return;
    const currentStatus = (chapter?.status || chapter?.Status || "draft").toString().toLowerCase();
    const targetStatus = nextStatus === "published" ? "published" : "draft";

    if (currentStatus === targetStatus) return;

    setIsUpdatingStatus(true);
    try {
      const authToken = getToken();
      const chapterRes = await fetch(`${API_BASE}/chapters/${chapterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          episode: Number(chapterNumber),
          title: chapterTitle,
          status: targetStatus
        })
      });

      if (!chapterRes.ok) {
        throw new Error("เปลี่ยนสถานะตอนไม่สำเร็จ");
      }

      const sceneUpdates = (chapter?.scenes || []).map(async (scene) => {
        const sceneId = scene?.scene_id ?? scene?.id ?? scene?.ID ?? scene?.SceneID;
        if (!sceneId) return null;

        const sceneType = (scene?.type || scene?.Type || "normal").toString().toLowerCase();
        const nextSceneStatus = targetStatus;
        const isEnding = sceneType === "ending" || Boolean(scene?.ending_title || scene?.EndingTitle || scene?.endingTitle);

        const payload = {
          title: scene?.title ?? scene?.Title ?? "",
          content: scene?.content ?? scene?.Content ?? "",
          type: isEnding ? "ending" : (sceneType || "normal"),
          status: nextSceneStatus,
          is_ending: isEnding,
          ending_title: scene?.ending_title ?? scene?.EndingTitle ?? scene?.endingTitle ?? "",
          ending_type: scene?.ending_type ?? scene?.EndingType ?? scene?.endingType ?? "",
          ending_description: scene?.ending_description ?? scene?.endingDescription ?? scene?.EndingDescription ?? "",
        };

        const sceneRes = await fetch(`${API_BASE}/scenes/${sceneId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (!sceneRes.ok) {
          const errText = await sceneRes.text().catch(() => "");
          throw new Error(errText || `อัปเดตฉาก ${sceneId} ไม่สำเร็จ`);
        }

        return sceneId;
      });

      await Promise.all(sceneUpdates);
      await fetchScenes();
    } catch (err) {
      console.error(err);
      alert(err.message || "เปลี่ยนสถานะตอนไม่สำเร็จ");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePublishAllScenes = async () => {
    const scenesList = chapter?.scenes || [];
    const draftScenes = scenesList.filter(s => {
      const status = (s.status || "draft").toString().toLowerCase();
      return status !== "published" && status !== "active";
    });

    if (draftScenes.length === 0) {
      alert("ฉากย่อยทั้งหมดในตอนนี้เผยแพร่เรียบร้อยแล้วค่ะ!");
      return;
    }

    const confirmMsg = `ต้องการเผยแพร่ฉากย่อยฉบับร่างที่เหลืออีก ${draftScenes.length} ฉากทั้งหมดในตอนนี้หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    setIsPublishingAll(true);
    const authToken = getToken();

    try {
      // วนลูปอัปเดตฉากทีละฉากผ่าน API
      for (const sc of draftScenes) {
        const scId = sc.scene_id ?? sc.id ?? sc.ID ?? sc.SceneID;
        if (!scId) continue;
        
        const getRes = await fetch(`${API_BASE}/scenes/${scId}`, {
          headers: { "Authorization": `Bearer ${authToken}` }
        });
        let currentData = {};
        if (getRes.ok) {
          currentData = await getRes.json();
        }

        await fetch(`${API_BASE}/scenes/${scId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
          },
          body: JSON.stringify({
            ...currentData,
            status: "published"
          })
        });
      }

      if (fetchScenes) await fetchScenes();
      alert("เผยแพร่ฉากย่อยทั้งหมดเรียบร้อยแล้วค่ะ! 🎉");
    } catch (err) {
      console.error("Failed to publish all scenes:", err);
      alert("เกิดข้อผิดพลาดในการเผยแพร่ฉากย่อยทั้งหมด");
    } finally {
      setIsPublishingAll(false);
    }
  };

  const getChapterLastUpdatedAt = (chapterData) => {
    const chapterTime = chapterData?.updated_at || chapterData?.UpdatedAt || chapterData?.updatedAt || chapterData?.created_at || chapterData?.CreatedAt;
    const sceneTimes = (chapterData?.scenes || chapterData?.Scenes || [])
      .map((scene) => scene?.updated_at || scene?.UpdatedAt || scene?.updatedAt)
      .map((time) => {
        const date = new Date(time);
        return isNaN(date.getTime()) ? null : date.getTime();
      })
      .filter((timestamp) => timestamp !== null);

    const chapterTimestamp = (() => {
      const date = new Date(chapterTime);
      return isNaN(date.getTime()) ? null : date.getTime();
    })();

    const latestTimestamp = [chapterTimestamp, ...sceneTimes].filter((ts) => ts !== null);
    if (!latestTimestamp.length) return chapterTime || "-";
    return new Date(Math.max(...latestTimestamp)).toISOString();
  };

  // 🔍 ตรวจสอบความผิดพลาดของสถานะ (UX Check)
  const isChapterDraft = (chapter?.status || "draft").toString().toLowerCase() === "draft";
  const hasPublishedScenes = (chapter?.scenes || []).some(s => (s.status || "draft").toString().toLowerCase() === "published");
  const isStatusConflict = isChapterDraft && hasPublishedScenes;

  return (
    <div className="cm-chapter-panel" style={{
      backgroundColor: '#ffffff', borderRadius: '20px', border: isStatusConflict ? '2px solid #ef4444' : '1.5px solid #fbcfe8',
      padding: '24px', marginBottom: '28px', boxShadow: isStatusConflict ? '0 4px 20px rgba(239, 68, 68, 0.15)' : '0 4px 15px rgba(219, 39, 119, 0.03)',
      position: 'relative', fontFamily: '"Sarabun", sans-serif', transition: 'all 0.3s ease'
    }}>

      {/* ⚠️ ป้ายเตือนกรณีลืมกดเผยแพร่ตอนหลัก */}
      {isStatusConflict && (
        <div style={{
          backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px',
          padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: '16px', flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <p style={{ margin: 0, fontSize: '14px', color: '#991b1b', fontWeight: '700', lineHeight: 1.5 }}>
              นักอ่านจะไม่เห็นเนื้อหา! เนื่องจาก <span style={{ textDecoration: 'underline' }}>ตอนหลักยังเป็นฉบับร่าง</span> แต่คุณมีบางฉากย่อยเปิดเผยแพร่ไว้ด้านล่างแล้ว
            </p>
          </div>
          <button
            onClick={handleToggleStatus}
            disabled={isUpdatingStatus || isNovelBanned}
            title={isNovelBanned ? BAN_ACTION_BLOCKED_MSG : undefined}
            style={{
              backgroundColor: '#ef4444', color: '#ffffff', border: 'none', padding: '8px 16px',
              borderRadius: '20px', fontSize: '13px', fontWeight: '800', cursor: isNovelBanned ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)', transition: 'all 0.2s',
              opacity: isNovelBanned ? 0.55 : 1
            }}
          >
            {isUpdatingStatus ? "⏳ กำลังเปลี่ยน..." : isNovelBanned ? "🔒 ถูกระงับการเผยแพร่" : "🚀 เผยแพร่ตอนนี้เลย"}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, minWidth: '300px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
            }}
            aria-label="ย่อ/ขยายตอน"
          >
            <ChevronDown
              size={18}
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                color: '#64748b'
              }}
            />
          </button>

          <div style={{
            width: '64px', height: '64px', backgroundColor: '#fdf2f8', color: '#db2777',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '800', flexShrink: 0
          }}>
            {chapterNumber !== "?" ? String(chapterNumber).padStart(2, '0') : "?"}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            {isEditingTitle ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  placeholder="กรอกชื่อตอน..."
                  style={{
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1.5px solid #db2777', fontSize: '14.5px',
                    fontFamily: "'Sarabun', sans-serif", fontWeight: '700',
                    color: '#0f172a', backgroundColor: '#fdf9fb',
                    outline: 'none', flex: 1, minWidth: '220px', maxWidth: '340px'
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle}
                  style={{
                    backgroundColor: '#db2777', color: '#ffffff',
                    border: 'none', padding: '8px 16px', borderRadius: '10px',
                    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                    fontFamily: "'Sarabun', sans-serif", boxShadow: '0 2px 8px rgba(219, 39, 119, 0.2)'
                  }}
                >
                  {isSavingTitle ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsEditingTitle(false); setInputTitle(chapterTitle); }}
                  style={{
                    backgroundColor: '#f1f5f9', color: '#64748b',
                    border: '1px solid #cbd5e1', padding: '8px 14px',
                    borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', fontFamily: "'Sarabun', sans-serif"
                  }}
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                    ตอนที่ {chapterNumber} : {chapterTitle}
                  </h3>
                </div>
                {/* แสดงจำนวนฉากเผยแพร่แล้ว ใต้ชื่อตอนย่อย */}
                <div style={{ fontSize: '13.5px', color: '#64748b', fontWeight: '600', marginTop: '4px' }}>
                  ฉากเผยแพร่แล้ว {chapter?.scenes?.filter(s => (s.status || "draft").toString().toLowerCase() === "published" || (s.status || "draft").toString().toLowerCase() === "active").length || 0}/{chapter?.scenes?.length || 0}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ขวาสุด: แถวปุ่มปฏิบัติการที่มี Dropdown และปุ่มเมนูย่อย จุดสามจุด */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', flexWrap: 'wrap', position: 'relative' }}>
            {/* 1. Dropdown เปลี่ยนสถานะเผยแพร่/ฉบับร่าง */}
            <PillStatusDropdown
              value={isChapterDraft ? "draft" : "published"}
              disabled={isUpdatingStatus || isNovelBanned}
              onChange={(newVal) => {
                if (isNovelBanned) {
                  alert(BAN_ACTION_BLOCKED_MSG);
                  return;
                }
                handleUpdateChapterStatus(newVal);
              }}
              labelPublished="เผยแพร่"
              labelDraft="ฉบับร่าง"
              size="sm"
            />

            {/* 2. ปุ่มจุดสามจุด (⋮) ของการ์ดตอน */}
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '50%',
                backgroundColor: isChapterMenuOpen ? '#f1f5f9' : '#fff',
                transition: 'background 0.2s',
                outline: 'none'
              }}
              onClick={() => setIsChapterMenuOpen(!isChapterMenuOpen)}
            >
              ⋮
            </button>

            {isChapterMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998, backgroundColor: 'transparent' }}
                  onClick={() => setIsChapterMenuOpen(false)}
                />
                <div style={{
                  position: 'absolute',
                  top: '38px',
                  right: '0px',
                  width: '180px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #f1f5f9',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
                  zIndex: 999,
                  padding: '6px 0',
                  overflow: 'hidden'
                }}>
                  {/* 2.1 แก้ไขชื่อตอน */}
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#1e293b', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => { setIsChapterMenuOpen(false); setIsEditingTitle(true); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    แก้ไขชื่อตอน
                  </button>

                  {/* 2.2 เผยแพร่ฉากทั้งหมด */}
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#15803d', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#eff6ff'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => { setIsChapterMenuOpen(false); handlePublishAllScenes(); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    เผยแพร่ฉากทั้งหมด
                  </button>

                  <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />

                  {/* 2.3 ลบตอนนี้ */}
                  <button
                    style={{ 
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', 
                      padding: '10px 16px', fontSize: '13.5px', color: '#ef4444', cursor: 'pointer', 
                      fontWeight: '600', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                      fontFamily: "'Sarabun', sans-serif"
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#fef2f2'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                    onClick={() => { setIsChapterMenuOpen(false); onDeleteChapter && onDeleteChapter(chapterId); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    ลบตอนนี้
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* ข้อมูลวันเวลาอัปเดตล่าสุด */}
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>
            อัปเดตล่าสุด {formatThaiDate(getChapterLastUpdatedAt(chapter), true)}
          </span>
        </div>
      </div>

      {/* แถบหัวข้อฉากในตอนนี้และปุ่มเพิ่มฉากมินิมอลตามรูปภาพ */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 16px 0', width: '100%' }}>
        <span style={{ fontSize: '14.5px', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap', marginRight: '16px' }}>
          ฉากในตอนนี้ ({chapter?.scenes?.length || 0})
        </span>
        
        <div style={{ flexGrow: 1, height: '1.5px', backgroundColor: '#f1f5f9' }} />
        
        <button
          onClick={() => onAddScene && onAddScene(chapterId)}
          disabled={isNovelBanned}
          title={isNovelBanned ? BAN_ACTION_BLOCKED_MSG : undefined}
          style={{
            backgroundColor: '#ec4899',
            color: '#ffffff',
            border: 'none',
            padding: '8px 20px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '700',
            cursor: isNovelBanned ? 'not-allowed' : 'pointer',
            marginLeft: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
          onMouseOver={(e) => { if(!isNovelBanned) e.currentTarget.style.backgroundColor = '#db2777'; }}
          onMouseOut={(e) => { if(!isNovelBanned) e.currentTarget.style.backgroundColor = '#ec4899'; }}
        >
          <span style={{ fontSize: '16px', fontWeight: '800' }}>+</span> เพิ่มฉาก
        </button>
      </div>

      {isOpen && (
        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px dashed #e2e8f0' }}>
          {(chapter?.scenes || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#94a3b8', fontWeight: '500' }}>
                ยังไม่มีฉากในตอนนี้ กด '+ เพิ่มฉาก' เพื่อเริ่มต้นเขียนเนื้อเรื่อง 📖
              </p>
            </div>
          ) : (
            (chapter?.scenes || []).map((scene, index) => (
              <SceneCard
                key={scene?.scene_id || scene?.id || index}
                scene={scene}
                novelId={novel?.novel_id ?? novel?.id ?? novel?.ID}
                chapterId={chapterId}
                chapterNumber={chapterNumber}
                sceneIndex={index + 1}
                onWrite={onWrite}
                fetchScenes={fetchScenes}
                allChapters={allChapters}
                openConfirmDialog={openConfirmDialog}
                isNovelBanned={isNovelBanned}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

const ChapterManagerPage = ({ onNavigate, novelId }) => {
  const { novelId: routeNovelId } = useParams();
  const rawId = routeNovelId || novelId;

  const cleanIntId = parseInt(rawId, 10);
  const currentNovelId = (!isNaN(cleanIntId) && cleanIntId > 0) ? cleanIntId : null;

  const [novel, setNovel] = useState(null);
  const [isUpdatingNovelStatus, setIsUpdatingNovelStatus] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [activeChapterId, setActiveChapterId] = useState(() => {
    return sessionStorage.getItem(`activeChapter_${currentNovelId}`) || null;
  });

  // บันทึกค่า activeChapterId ทันทีที่มีการสลับตอน
  useEffect(() => {
    if (activeChapterId && currentNovelId) {
      sessionStorage.setItem(`activeChapter_${currentNovelId}`, activeChapterId);
    }
  }, [activeChapterId, currentNovelId]);
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const [isSubmittingChapter, setIsSubmittingChapter] = useState(false);
  const [isSuccessCreatingChapter, setIsSuccessCreatingChapter] = useState(false);
  const [draftChapterTitle, setDraftChapterTitle] = useState("");
  const [draftChapterStatus, setDraftChapterStatus] = useState("draft");
  const [isCreatingScene, setIsCreatingScene] = useState(false);
  const [createSceneChapterId, setCreateSceneChapterId] = useState(null);
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [isSubmittingScene, setIsSubmittingScene] = useState(false);
  const [isSuccessCreatingScene, setIsSuccessCreatingScene] = useState(false);
  const [createSceneError, setCreateSceneError] = useState("");
  const [lockedChapterIds, setLockedChapterIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedChapters, setExpandedChapters] = useState({});
  const [activeSceneId, setActiveSceneId] = useState(null);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [hasPendingAppeal, setHasPendingAppeal] = useState(false);
  const [isAppealRejected, setIsAppealRejected] = useState(false);
  const bypassBlockerRef = useRef(false);

  const isFormDirty = React.useMemo(() => {
    return (
      (isCreatingChapter && draftChapterTitle.trim() !== "") ||
      (isCreatingScene && newSceneTitle.trim() !== "")
    );
  }, [isCreatingChapter, draftChapterTitle, isCreatingScene, newSceneTitle]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => {
      if (bypassBlockerRef.current) return false;
      return isFormDirty && currentLocation.pathname !== nextLocation.pathname;
    }
  );

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!bypassBlockerRef.current && isFormDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFormDirty]);

  // Auto-expand the active chapter on load or switch
  useEffect(() => {
    if (activeChapterId) {
      setExpandedChapters(prev => ({ ...prev, [String(activeChapterId)]: true }));
    }
  }, [activeChapterId]);

  const handleSceneClick = (chId, scId) => {
    const scKey = String(scId);
    setActiveSceneId(scKey);
    const isCurrent = String(activeChapterId) === String(chId);
    if (!isCurrent) {
      setActiveChapterId(chId);
      sessionStorage.setItem("focusSceneTarget", scKey);
    } else {
      const element = document.getElementById(`scene-card-${scId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalBoxShadow = element.style.boxShadow;
        element.style.transition = 'box-shadow 0.4s ease-out';
        element.style.boxShadow = '0 0 0 3px #db2777, 0 0 15px rgba(219, 39, 119, 0.4)';
        setTimeout(() => {
          element.style.boxShadow = originalBoxShadow || '0 8px 20px rgba(0, 0, 0, 0.04)';
        }, 2000);
      }
    }
  };

  const fetchNovelAndChapters = async (isSilent = false) => {
    if (!currentNovelId) {
      if (!isSilent) setLoading(false);
      return;
    }

    // ถ้าเป็นการโหลดแบบเงียบ (Silent) จะไม่รัน setLoading(true) ทำให้หน้าเว็บไม่กระตุกหรือพับกล่องลง
    if (!isSilent) setLoading(true);
    const authToken = getToken();

    try {
      const resNovel = await fetch(`${API_BASE}/novels/${currentNovelId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        }
      });
      if (resNovel.ok) {
        const result = await resNovel.json();
        const actualNovelData = result.novel || result.data?.novel || result.data || result;
        const normalized = actualNovelData || {};
        normalized.status = (normalized.status || normalized.Status || "").toString().toLowerCase();
        normalized.is_published = normalized.is_published ?? normalized.isPublished ?? false;
        normalized.is_completed = normalized.is_completed ?? normalized.isCompleted ?? false;
        const statusInfo = getNovelStatusInfo({ ...normalized, id: currentNovelId });
        if (statusInfo.isBanned) {
          registerBannedNovel(currentNovelId, normalized);
        }
        const regInfo = statusInfo.registryData;
        const isRejected = normalized.appeal_status === "rejected" || normalized.appeal_status === "appeal_rejected" || regInfo?.appeal_status === "rejected";
        if (isRejected) {
          setHasPendingAppeal(false);
          setIsAppealRejected(true);
        } else if (normalized.appeal_status === "appeal_pending" || normalized.has_pending_appeal || normalized.appeal_pending || regInfo?.appeal_status === "appeal_pending") {
          setHasPendingAppeal(true);
          setIsAppealRejected(false);
        } else {
          setHasPendingAppeal(false);
          setIsAppealRejected(false);
        }
        setNovel(normalized);
        try {
          const selObj = {
            id: currentNovelId,
            novel_id: currentNovelId,
            title: normalized.title || normalized.Title || "ไม่ทราบชื่อเรื่อง",
            cover_image: normalized.cover_image || normalized.coverImage || null,
          };
          localStorage.setItem("selectedNovel", JSON.stringify(selObj));
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new Event("novel-selected"));
        } catch (e) {}
      }
    } catch (err) {
      console.error("โหลดข้อมูลนิยายล้มเหลว:", err);
    }

    try {
      const resChapters = await fetch(`${API_BASE}/novels/${currentNovelId}/chapters`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json"
        }
      });
      if (resChapters.ok) {
        const result = await resChapters.json();
        let actualChapters = [];

        if (result && result.data !== undefined) {
          if (Array.isArray(result.data)) {
            actualChapters = result.data;
          } else if (result.data && Array.isArray(result.data.chapters)) {
            actualChapters = result.data.chapters;
          }
        } else if (Array.isArray(result)) {
          actualChapters = result;
        } else if (result && Array.isArray(result.chapters)) {
          actualChapters = result.chapters;
        }

        if (Array.isArray(actualChapters)) {
          setChapters(actualChapters);
          if (actualChapters.length > 0) {
            setActiveChapterId((prev) => {
              // 1. ดึงค่าตอนล่าสุดที่เคยเลือกไว้จาก Session Storage มาเช็กด้วย
              const savedId = sessionStorage.getItem(`activeChapter_${currentNovelId}`);
              const targetId = prev || savedId;

              const firstId = actualChapters[0].id ?? actualChapters[0].ID ?? actualChapters[0].chapter_id ?? actualChapters[0].ChapterID;

              // 2. ถ้าไม่มีค่า prev หรือค่าใน session เลย ให้แสดงตอนที่ 1
              if (!targetId) return firstId;

              // 3. ตรวจสอบว่าตอนที่เลือกล่าสุด ยังมีอยู่ในฐานข้อมูลไหม (กันกรณีลบตอนไปแล้ว)
              const isValueExist = actualChapters.some(c => String(c.id ?? c.ID ?? c.chapter_id ?? c.ChapterID) === String(targetId));
              return isValueExist ? targetId : firstId;
            });
          }
        }
      }
    } catch (err) {
      console.error("โหลดรายชื่อตอนล้มเหลว:", err);
    } finally {
      // ถ้าเป็นการโหลดแบบเงียบ ก็ไม่ต้องไปสั่งปิด loading เพื่อไม่ให้มันเด้งกวนใจ
      if (!isSilent) setLoading(false);
    }
  };

  const computeLockedChapters = (allChapters) => {
    const lockSet = new Set();
    const sceneToChapter = new Map();
    const targetSceneIds = new Set();

    allChapters.forEach((chapter) => {
      const scenes = Array.isArray(chapter.scenes) ? chapter.scenes : [];
      scenes.forEach((scene) => {
        const sceneId = scene?.scene_id ?? scene?.id ?? scene?.ID ?? scene?.SceneID;
        if (sceneId) {
          const chapterKey = String(chapter.id ?? chapter.ID ?? chapter.chapter_id ?? chapter.ChapterID ?? "");
          sceneToChapter.set(String(sceneId), chapterKey);
        }
      });
    });

    allChapters.forEach((chapter) => {
      const chapterKey = String(chapter.id ?? chapter.ID ?? chapter.chapter_id ?? chapter.ChapterID ?? "");
      const scenes = Array.isArray(chapter.scenes) ? chapter.scenes : [];
      scenes.forEach((scene) => {
        const choices = Array.isArray(scene.choices) ? scene.choices : Array.isArray(scene.Choices) ? scene.Choices : [];
        if (choices.length > 0 && chapterKey) {
          lockSet.add(chapterKey);
        }
        choices.forEach((choice) => {
          const toSceneId = choice?.to_scene_id ?? choice?.ToSceneID ?? choice?.toSceneId ?? choice?.toSceneID ?? choice?.targetSubScene ?? "";
          if (toSceneId !== undefined && toSceneId !== null && String(toSceneId).trim() !== "") {
            targetSceneIds.add(String(toSceneId));
          }
        });
      });
    });

    targetSceneIds.forEach((sceneId) => {
      const chapterKey = sceneToChapter.get(sceneId);
      if (chapterKey) {
        lockSet.add(chapterKey);
      }
    });

    return lockSet;
  };

  useEffect(() => {
    if (Array.isArray(chapters)) {
      setLockedChapterIds(computeLockedChapters(chapters));
    }
  }, [chapters]);

  useEffect(() => {
    if (currentNovelId) {
      fetchNovelAndChapters();
    }
  }, [currentNovelId]);

  const openCreateChapterForm = () => {
    setDraftChapterTitle("");
    setDraftChapterStatus("draft");
    setIsCreatingChapter(true);
  };

  const cancelCreateChapter = () => {
    setIsCreatingChapter(false);
    setDraftChapterTitle("");
    setDraftChapterStatus("draft");
  };

  const handleAddChapter = async () => {
    if (!currentNovelId) return;
    const statusInfo = getNovelStatusInfo(novel);
    if (statusInfo.isBanned) {
      alert('นิยายถูกระงับ ไม่สามารถเพิ่มตอนได้');
      return;
    }
    setIsSubmittingChapter(true);
    try {
      const episodeNumber = (chapters?.length || 0) + 1;
      const title = draftChapterTitle?.trim() || `ตอนที่ ${episodeNumber}`;
      const payload = {
        novel_id: Number(currentNovelId),
        episode: episodeNumber,
        title,
        status: draftChapterStatus || "draft"
      };

      const authToken = getToken();
      if (!authToken) {
        alert("กรุณาเข้าสู่ระบบก่อนสร้างตอน");
        return;
      }
      const res = await fetch(`${API_BASE}/chapters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsSuccessCreatingChapter(true);
        const data = await res.json().catch(() => null) || {};
        const createdChapterId = data.chapter_id ?? data.chapter?.id ?? data.chapter?.ID ?? data.chapter?.chapter_id ?? data.data?.chapter_id;
        
        await fetchNovelAndChapters(true);
        if (createdChapterId) {
          setActiveChapterId(createdChapterId);
        }

        setIsSuccessCreatingChapter(false);
        setIsCreatingChapter(false);
        setDraftChapterTitle("");
        setDraftChapterStatus("draft");
      } else {
        const errorText = await res.text();
        console.error("สร้างตอนใหม่ล้มเหลว:", res.status, errorText);
        alert("สร้างตอนใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err) {
      console.error(err);
      alert("เชื่อมต่อ Backend ไม่สำเร็จ");
    } finally {
      setIsSubmittingChapter(false);
    }
  };

  const reorderChaptersOnServer = async (orderedIds = []) => {
    if (!currentNovelId || !Array.isArray(orderedIds)) return;
    const authToken = getToken();
    if (!authToken) return;
    try {
      await fetch(`${API_BASE}/novels/${currentNovelId}/chapters/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ order: orderedIds }),
      });
    } catch (err) {
      console.error('Reorder chapters error', err);
    }
  };

  const handleAddScene = (chapterId) => {
    if (!chapterId) return;
    if (getNovelStatusInfo(novel).isBanned) {
      alert('นิยายถูกระงับ ไม่สามารถเพิ่มฉากได้');
      return;
    }
    setCreateSceneChapterId(chapterId);
    setNewSceneTitle("");
    setCreateSceneError("");
    setIsCreatingScene(true);
    setIsSubmittingScene(false);
    setIsSuccessCreatingScene(false);
  };

  const handleConfirmCreateScene = async () => {
    if (!newSceneTitle.trim()) {
      setCreateSceneError("กรุณากรอกชื่อฉากก่อน");
      return;
    }

    const sceneTitleVal = newSceneTitle.trim();
    const targetChapterId = createSceneChapterId;

    setIsSubmittingScene(true);
    setCreateSceneError("");

    try {
      const authToken = getToken();
      if (!authToken) {
        throw new Error("กรุณาเข้าสู่ระบบก่อนเพิ่มฉาก");
      }

      const payload = {
        novel_id: parseInt(currentNovelId, 10),
        chapter_id: parseInt(targetChapterId, 10),
        title: sceneTitleVal,
        content: "",
        x: 0,
        y: 0,
        type: "normal",
        status: "draft"
      };

      const res = await fetch(`${API_BASE}/scenes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || "สร้างฉากใหม่ไม่สำเร็จ");
      }

      const resData = await res.json();
      const createdSceneId = resData?.scene_id ?? resData?.id ?? resData?.data?.scene_id ?? resData?.data?.id;

      if (!createdSceneId) {
        throw new Error("ระบบไม่ได้รับรหัสฉากใหม่จากหลังบ้าน");
      }

      // ปลดล็อค blocker ทันที เพื่อไม่ให้ useBlocker กักการเปลี่ยนเส้นทางไปยังหน้าเขียนเนื้อหา
      bypassBlockerRef.current = true;
      setIsCreatingScene(false);
      setNewSceneTitle("");
      setCreateSceneChapterId(null);
      setIsSuccessCreatingScene(false);
      setCreateSceneError("");

      window.dispatchEvent(new Event("novel-data-updated"));

      const novelTitleVal = novel?.title || novel?.novelTitle || novel?.name || "";
      const chapterObj = (chapters || []).find(c => String(c.id ?? c.chapter_id ?? c.ChapterID ?? c.chapterId) === String(targetChapterId));
      const chapterTitleVal = chapterObj?.title || chapterObj?.Title || chapterObj?.chapterTitle || "";

      sessionStorage.setItem("focusSceneTarget", createdSceneId);
      sessionStorage.setItem("toastMessage", `สร้างฉาก "${sceneTitleVal}" สำเร็จ`);

      // พาไปยังหน้าเขียนเนื้อหาทันที
      if (typeof onNavigate === "function") {
        onNavigate("scene-editor", {
          novelId: currentNovelId,
          chapterId: targetChapterId,
          sceneId: createdSceneId,
          novelTitle: novelTitleVal,
          chapterTitle: chapterTitleVal,
          title: sceneTitleVal
        });
      } else {
        navigate(`/writer/${currentNovelId}/scene/${createdSceneId}?chapterId=${targetChapterId}&title=${encodeURIComponent(sceneTitleVal)}`);
      }
    } catch (err) {
      console.error(err);
      setCreateSceneError(err.message || "เกิดข้อผิดพลาดในการสร้างฉาก");
    } finally {
      setIsSubmittingScene(false);
    }
  };

  const closeConfirmDialog = () => setConfirmDialog(null);

  const executeConfirmAction = async () => {
    if (!confirmDialog?.action) {
      closeConfirmDialog();
      return;
    }
    try {
      await confirmDialog.action();
    } catch (err) {
      console.error("Confirm action failed:", err);
    } finally {
      closeConfirmDialog();
    }
  };

  const openConfirmDialog = ({
    title,
    message,
    action,
    confirmLabel = "ยืนยัน",
    cancelLabel = "ยกเลิก",
    showCancel = true,
    type = "danger"
  }) => {
    setConfirmDialog({ title, message, action, confirmLabel, cancelLabel, showCancel, type });
  };

  const handleToggleNovelStatus = async (targetStatus) => {
    if (!currentNovelId || !novel) return;
    const currentStatusInfo = getNovelStatusInfo(novel);
    if (currentStatusInfo.isBanned) {
      alert(BAN_ACTION_BLOCKED_MSG);
      return;
    }
    const nextStatus = targetStatus || (currentStatusInfo.isPublished ? "draft" : "published");
    const isTargetPublished = nextStatus === "published";
    if (isTargetPublished === currentStatusInfo.isPublished) return;

    setIsUpdatingNovelStatus(true);
    try {
      const payload = {
        status: nextStatus,
        is_published: isTargetPublished,
        is_completed: currentStatusInfo.isCompleted,
      };

      const authToken = getToken();
      if (!authToken) return;
      const res = await fetch(`${API_BASE}/novels/${currentNovelId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("อัปเดตสถานะนิยายไม่สำเร็จ");
      await fetchNovelAndChapters(true);
    } catch (err) {
      console.error(err);
      alert("อัปเดตสถานะนิยายไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsUpdatingNovelStatus(false);
    }
  };

  const handleOpenAppealModal = () => setIsAppealModalOpen(true);

  const handleCloseAppealModal = () => {
    if (isSubmittingAppeal) return; // กันปิด modal ระหว่างกำลังส่งอยู่
    setIsAppealModalOpen(false);
  };

  const handleSubmitAppeal = async (reasonText) => {
    if (!currentNovelId || !reasonText.trim()) return;
    setIsSubmittingAppeal(true);
    const authToken = getToken();
    try {
      let appealSuccess = false;

      // 1. ลองส่งคำขอผ่าน API ปลดแบนโดยตรงก่อน (/api/writer/novels/appeal)
      const res = await fetch(`${API_BASE}/api/writer/novels/appeal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ novel_id: currentNovelId, reason: reasonText.trim() })
      });

      if (res.ok) {
        appealSuccess = true;
      } else {
        const errData = await res.json().catch(() => ({}));
        const rawErr = errData.error || errData.message || "";
        const errMsg = typeof rawErr === "object" ? (rawErr?.message || JSON.stringify(rawErr)) : String(rawErr);

        if (errMsg.includes("appeal already pending")) {
          setHasPendingAppeal(true);
          registerBannedNovel(currentNovelId, { appeal_status: "appeal_pending" });
          setIsAppealModalOpen(false);
          alert("คุณได้ยื่นคำขอปลดแบนนิยายเรื่องนี้ไว้แล้ว และกำลังอยู่ในระหว่างรอแอดมินพิจารณาตรวจสอบ");
          return;
        }

        // 🟢 กรณี Backend แจ้งว่าไม่พบสถานะถูกระงับใน DB (เนื่องจากการแก้ไขรูปปกทำให้ DB status reset เป็น draft)
        // ให้ทำการส่งคำขอปลดแบนผ่าน /api/reports เป็น Fallback เพื่อไม่ให้ระบบบล็อกนักเขียน
        if (errMsg.includes("unauthorized or novel is not currently banned") || res.status === 400 || res.status === 500) {
          try {
            const fallbackRes = await fetch(`${API_BASE}/api/reports`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
              },
              body: JSON.stringify({
                novel_id: currentNovelId,
                reason: "[คำขอปลดแบน]: " + reasonText.trim()
              })
            });
            if (fallbackRes.ok) {
              appealSuccess = true;
            }
          } catch (fbErr) {
            console.warn("Fallback appeal via /api/reports error:", fbErr);
          }
        }

        if (!appealSuccess) {
          if (errMsg.includes("unauthorized")) {
            throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
          }
          throw new Error(errMsg || `ส่งคำขอไม่สำเร็จ (status ${res.status})`);
        }
      }

      setHasPendingAppeal(true);
      registerBannedNovel(currentNovelId, { appeal_status: "appeal_pending" });
      setIsAppealModalOpen(false);
      alert("ส่งเรื่องขอปลดแบนเรียบร้อยแล้ว ระบบกำลังส่งเรื่องให้แอดมินพิจารณา");
    } catch (err) {
      console.error("ส่งเรื่องขอปลดแบนล้มเหลว:", err);
      alert(err.message || "เกิดข้อผิดพลาด ไม่สามารถส่งเรื่องขอปลดแบนได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  const handleOpenPreview = () => {
    const idToOpen = currentNovelId || (novel && (novel.id || novel.novel_id || novel.novelId));
    if (!idToOpen) {
      alert("ไม่พบรหัสนิยายสำหรับพรีวิว");
      return;
    }
    const previewUrl = `/novel/${idToOpen}?preview=true`;
    sessionStorage.setItem("previewReturnUrl", window.location.pathname + window.location.search);
    try {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.location.href = previewUrl;
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    if (!chapterId) return;
    if (getNovelStatusInfo(novel).isBanned) {
      alert('นิยายถูกระงับ ไม่สามารถลบตอนได้');
      return;
    }
    openConfirmDialog({
      title: "ยืนยันการลบตอน",
      message: "การกระทำนี้จะลบฉากทั้งหมดในตอนนี้ด้วย",
      confirmLabel: "ลบเลย",
      action: async () => {
        try {
          const authToken = getToken();
          if (!authToken) return;
          const res = await fetch(`${API_BASE}/chapters/${chapterId}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${authToken}`
            }
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            if (res.status === 404 || errText.toLowerCase().includes("404 page not found")) {
              alert("ไม่พบข้อมูลตอนนี้ในระบบ (อาจถูกลบไปแล้ว)");
            } else {
              alert("ไม่สามารถลบตอนได้ กรุณาลองใหม่");
            }
            return;
          }
          if (String(activeChapterId) === String(chapterId)) {
            setActiveChapterId(null);
          }
          await fetchNovelAndChapters(true);
        } catch (err) {
          console.error("เกิดข้อผิดพลาดในการลบตอน:", err);
        }
      }
    });
  };

  const activeChapter = chapters.find((c) => {
    const id = c.id ?? c.ID ?? c.chapter_id ?? c.ChapterID;
    return String(id) === String(activeChapterId);
  });
  const filteredChapters = chapters.filter((ch, index) => {
    const title = (ch.title ?? ch.Title ?? "").toLowerCase();
    const search = searchTerm.toLowerCase().trim();

    if (!search) return true;

    const displayIndex = String(index + 1);
    const displayIndexZero = displayIndex.padStart(2, '0');

    // 1. ตรวจสอบกรณีตรงกับลำดับตอนด้วยตัวเลขล้วน (เช่น "2" หรือ "02")
    const isNumeric = /^\d+$/.test(search);
    if (isNumeric) {
      if (displayIndex === search || displayIndexZero === search) {
        return true;
      }
    }

    // 2. ตรวจสอบกรณีตรงกับเลขตอนพ่วงฉากย่อย (เช่น "1.1" หรือ "1.")
    const isDecimalPattern = /^\d+\.\d*$/.test(search);
    if (isDecimalPattern) {
      const scenes = ch.scenes || ch.Scenes || [];
      const isDecimalMatch = scenes.some((s, scIdx) => {
        const scDisplayNum = `${index + 1}.${scIdx + 1}`;
        return scDisplayNum === search || scDisplayNum.startsWith(search);
      });
      if (isDecimalMatch) return true;
    }

    // 3. ค้นหาแบบข้อความทั่วไป (ชื่อตอน หรือ ชื่อฉากย่อย)
    const isChapterMatch = title.includes(search);
    if (isChapterMatch) return true;

    const scenes = ch.scenes || ch.Scenes || [];
    const hasMatchingScene = scenes.some((s) => {
      const scTitle = (s.title ?? s.Title ?? s.label ?? s.Label ?? "").toLowerCase();
      return scTitle.includes(search);
    });

    return hasMatchingScene;
  });
  if (loading) {
    return <LoadingScreen message="กำลังโหลดข้อมูลหน้าจัดการตอน..." />;
  }

  return (
    <div className="cm-layout">
      {/* Overlay Backdrop เมื่อเปิด Sidebar ในหน้าจอเล็ก */}
      {isSidebarOpen && (
        <div 
          className="cm-sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ☰ แถบรายชื่อตอนและฉากย่อย (Sidebar) ย้ายมาด้านซ้ายมือตามความต้องการผู้แต่ง */}
      <aside className={`cm-sidebar ${isSidebarOpen ? "open" : ""}`} style={{ borderRight: "1px solid #e2e8f0" }}>
        <div className="cm-sidebar__header" style={{ padding: "24px 20px 12px 20px", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
            ตอนทั้งหมด ({chapters.length})
          </span>
          <button 
            type="button"
            className="cm-sidebar-close-btn"
            onClick={() => setIsSidebarOpen(false)}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#64748b",
              padding: "4px 8px",
              display: "none"
            }}
          >
            ✕
          </button>
        </div>

        {/* ➕ ปุ่มสร้างตอนใหม่เด่นชัด ย้ายขึ้นไปอยู่ส่วนบนถัดจากหัวข้อหลัก */}
        <div style={{ padding: "0 16px 12px 16px" }}>
          <button 
            className="cm-sidebar__add" 
            onClick={openCreateChapterForm} 
            disabled={getNovelStatusInfo(novel).isBanned}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
              margin: 0,
              padding: "10px 14px",
              borderRadius: "15px",
              border: "none",
              background: "#ec4899",
              fontFamily: "'Sarabun', sans-serif",
              fontSize: "14px",
              fontWeight: "700",
              color: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "#db2777"}
            onMouseOut={(e) => e.currentTarget.style.background = "#ec4899"}
          >
            <span style={{ fontSize: "16px" }}>+</span> สร้างตอนใหม่
          </button>
        </div>

        {/* 🔍 ช่องพิมพ์ค้นหาชื่อตอน หรือชื่อฉาก */}
        <div style={{ padding: "0 16px 16px 16px" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="ค้นหาตอน..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: "18px",
                border: "1px solid #f1f5f9",
                background: "#f8fafc",
                fontSize: "13.5px",
                color: "#1e293b",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "'Sarabun', sans-serif"
              }}
            />
            <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          </div>
        </div>

        <div className="cm-sidebar__list" style={{ padding: "0 16px 20px" }}>
          {filteredChapters.map((ch, index) => {
            const chId = ch.id ?? ch.ID ?? ch.chapter_id ?? ch.ChapterID ?? index;
            const chKey = String(chId);
            const chTitle = ch.title ?? ch.Title ?? `ตอนที่ ${index + 1}`;
            const scenes = ch.scenes || ch.Scenes || [];
            
            const isCurrentActive = String(activeChapterId) === chKey;
            const hasScenes = scenes.length > 0;
            const isExpanded = !!expandedChapters[chKey] && hasScenes;

            // ค้นหาลำดับดัชนีที่แท้จริงของตอนย่อยจากรายการตอนทั้งหมด (chapters)
            const realChapterIndex = chapters.findIndex(c => {
              const cid1 = c.id ?? c.ID ?? c.chapter_id ?? c.ChapterID;
              const cid2 = ch.id ?? ch.ID ?? ch.chapter_id ?? ch.ChapterID;
              return String(cid1) === String(cid2);
            });
            const actualChapterNum = realChapterIndex !== -1 ? realChapterIndex + 1 : index + 1;
            const displayIndex = String(actualChapterNum).padStart(2, '0');

            const chStatus = (ch.status || ch.Status || "draft").toString().toLowerCase();
            const isChapterPublished = chStatus === "published" || chStatus === "active";

            return (
              <div 
                key={`ch-sidebar-wrap-${chKey}-${index}`}
                style={{ 
                  marginBottom: "12px", 
                  borderRadius: "16px", 
                  border: isCurrentActive ? "1.5px solid #ec4899" : "1.5px solid #f1f5f9",
                  background: isCurrentActive ? "#fffdfd" : "#ffffff",
                  boxShadow: isCurrentActive ? "0 4px 12px rgba(236, 72, 153, 0.05)" : "0 2px 6px rgba(0, 0, 0, 0.015)",
                  transition: "all 0.2s ease",
                  padding: "0"
                }}
              >
                {/* Chapter Card Row */}
                <div
                  className={`cm-sidebar__item ${isCurrentActive ? "cm-sidebar__item--active" : ""}`}
                  onClick={() => {
                    setActiveChapterId(chId);
                    setIsSidebarOpen(false);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "6px",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    cursor: "pointer",
                    userSelect: "none",
                    textAlign: "left",
                    border: "none",
                    background: "transparent"
                  }}
                >
                  {/* แถวบน: ตัวเลขสีชมพูหนาคู่กับชื่อตอนย่อย และปุ่ม Toggle Dropdown ด้านขวา */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                    <span 
                      style={{ 
                        fontSize: "18px", 
                        fontWeight: "800", 
                        color: isCurrentActive ? "#db2777" : "#cbd5e1",
                        lineHeight: "1.2"
                      }}
                    >
                      {displayIndex}
                    </span>
                    <span 
                      style={{ 
                        fontSize: "14px", 
                        fontWeight: "700", 
                        color: isCurrentActive ? "#db2777" : "#1e293b",
                        lineHeight: "1.3",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flexGrow: 1
                      }}
                      title={chTitle}
                    >
                      {chTitle}
                    </span>
                    {hasScenes && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedChapters(prev => ({ ...prev, [chKey]: !prev[chKey] }));
                        }}
                        style={{
                          border: "none",
                          background: isCurrentActive ? "#fce7f3" : "#f1f5f9",
                          color: isCurrentActive ? "#db2777" : "#64748b",
                          borderRadius: "50%",
                          width: "28px",
                          height: "28px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          marginLeft: "auto",
                          padding: 0
                        }}
                        aria-label="แสดงรายการฉากย่อย"
                      >
                        <span style={{ fontSize: "11px", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", display: "inline-block" }}>
                          ▼
                        </span>
                      </button>
                    )}
                  </div>
 
                  {/* แถวล่าง: สถานะตอน และ จำนวนฉากย่อย */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px", width: "100%", paddingLeft: "26px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: "700",
                        background: isChapterPublished ? "#e6f4ea" : "#fffbeb",
                        color: isChapterPublished ? "#137333" : "#d97706",
                        border: isChapterPublished ? "1px solid #a3e635" : "1px solid #fef08a"
                      }}
                    >
                      {isChapterPublished ? "เผยแพร่" : "ร่าง"}
                    </span>
 
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#64748b", fontWeight: "500" }}>
                      <FileText size={13} style={{ color: "#9CA3AF" }} /> {scenes.length} ฉาก
                    </span>
                  </div>
                </div>
 
                {/* Accordion List ฉากย่อย (สามารถคลิกเพื่อเลื่อนหน้าจอตรงกลางไปยังตำแหน่งฉากนั้นได้) */}
                {isExpanded && (
                  <div 
                    className="cm-sidebar__scenes-list"
                    style={{
                      paddingLeft: "8px",
                      paddingRight: "8px",
                      paddingBottom: "12px",
                      borderLeft: "1.5px solid #fbcfe8",
                      marginLeft: "40px",
                      marginTop: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, paddingLeft: "8px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      รายการฉากในตอนนี้
                    </div>
                    {scenes.length > 0 ? (
                      scenes.map((sc, scIdx) => {
                        const scId = sc.id ?? sc.ID ?? sc.scene_id ?? sc.SceneID;
                        const scKey = String(scId);
                        const scDisplayNum = `${actualChapterNum}.${scIdx + 1}`;
                        const scTitle = sc.label || sc.title || sc.sceneTitle || "ฉากไม่มีชื่อ";
                        const isSceneMatch = searchTerm && scTitle.toLowerCase().includes(searchTerm.toLowerCase());
                        const isSceneActive = String(activeSceneId) === scKey;
                        
                        return (
                          <button
                            key={`sc-item-${scId || scIdx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSceneClick(chId, scId);
                              setIsSidebarOpen(false);
                            }}
                            style={{
                              fontSize: "12.5px",
                              color: isSceneActive ? "#db2777" : (isSceneMatch ? "#db2777" : "#64748b"),
                              fontWeight: (isSceneActive || isSceneMatch) ? "700" : "500",
                              padding: "6px 8px",
                              textAlign: "left",
                              background: isSceneActive ? "#fce7f3" : "transparent",
                              border: "none",
                              borderRadius: "8px",
                              width: "100%",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              transition: "all 0.2s ease"
                            }}
                            onMouseOver={(e) => { if (!isSceneActive) e.currentTarget.style.background = "#fff1f2"; }}
                            onMouseOut={(e) => { if (!isSceneActive) e.currentTarget.style.background = "transparent"; }}
                            title={scTitle}
                          >
                            <FileText size={13} style={{ color: isSceneActive ? "#db2777" : "#9CA3AF", flexShrink: 0 }} />
                            <span style={{ color: isSceneActive ? "#db2777" : "#f472b6", fontWeight: "700", minWidth: "18px" }}>
                              {scDisplayNum}
                            </span>
                            <span style={{
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              flex: 1
                            }}>
                              {scTitle}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8", padding: "2px 8px", fontStyle: "italic", textAlign: "left" }}>
                        • ไม่มีฉากในตอนนี้
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* 📄 เนื้อหาการแสดงผลตอนย่อยหลัก (Main Content) */}
      <div className="cm-main">
        <div className="cm-topbar">
          <div className="cm-topbar__left">
            <div className="cm-topbar__titles">
              <h1 className="cm-topbar__title">จัดการตอนนิยาย</h1>
              <p className="cm-topbar__sub">จัดการรายการตอนและรายละเอียดฉากของคุณ</p>
            </div>
          </div>
          <div className="cm-topbar__right">
            <button
              type="button"
              className="cm-topbar__btn cm-topbar__btn--preview"
              onClick={handleOpenPreview}
            >
              <Eye size={16} style={{ color: "#ffffff" }} />
              <span>ทดลองอ่าน</span>
            </button>

            <button
              type="button"
              className="cm-topbar__btn cm-topbar__btn--storytree"
              onClick={() => onNavigate("story-tree", { novelId: currentNovelId })}
            >
              <GitFork size={16} style={{ color: "#ec4899" }} />
              <span>โครงสร้างเนื้อเรื่อง</span>
            </button>
          </div>
        </div>

        {(() => {
          const statusInfo = getNovelStatusInfo({ ...novel, id: currentNovelId });
          if (!statusInfo.isBanned) return null;
          const regData = statusInfo.registryData || {};
          const isAppPending = hasPendingAppeal || novel?.appeal_status === "appeal_pending" || novel?.has_pending_appeal || (regData.appeal_status === "appeal_pending");
          const isAppRejected = (!isAppPending) && (isAppealRejected || novel?.appeal_status === "rejected" || regData.appeal_status === "rejected");
          return (
            <BanWarningBanner
              reason={novel?.ban_reason || novel?.banReason || novel?.reason || novel?.suspend_reason || novel?.suspension_reason || regData.reason}
              details={novel?.ban_details || novel?.banDetails || novel?.details || novel?.report_details || regData.details}
              hasPendingAppeal={isAppPending}
              isAppealRejected={isAppRejected}
              onRequestAppeal={handleOpenAppealModal}
            />
          );
        })()}

        <NovelBanner
          novel={novel}
          chapters={chapters}
          onEdit={() => onNavigate("create-novel", { novelId: currentNovelId })}
          onToggleStatus={handleToggleNovelStatus}
          isUpdatingNovelStatus={isUpdatingNovelStatus}
        />

        {/* 📱 ปุ่มเปิดรายการตอนทั้งหมด เมื่อหน้าจอมีขนาดเล็กลง (รูปที่ 1) */}
        {(() => {
          const activeIndex = chapters.findIndex(c => {
            const cid = c.id ?? c.ID ?? c.chapter_id ?? c.ChapterID;
            return String(cid) === String(activeChapterId);
          });
          const activeEpNum = activeIndex !== -1 ? activeIndex + 1 : (chapters.length > 0 ? 1 : 1);
          const activeChObj = activeChapter || (chapters.length > 0 ? chapters[0] : null);
          const activeChTitle = activeChObj?.title || activeChObj?.Title || "จุดเริ่มต้น";
          const activeScenesCount = activeChObj?.scenes?.length || activeChObj?.Scenes?.length || 0;

          return (
            <div
              className="cm-mobile-chapter-selector"
              onClick={() => setIsSidebarOpen(true)}
            >
              <div className="cm-mobile-chapter-selector__left">
                <div className="cm-mobile-chapter-selector__icon-box">
                  <Layers size={22} style={{ color: "#db2777" }} />
                </div>
                <div className="cm-mobile-chapter-selector__text">
                  <span className="cm-mobile-chapter-selector__label">ตอนที่กำลังเปิด</span>
                  <div className="cm-mobile-chapter-selector__info">
                    <span className="cm-mobile-chapter-selector__ep">
                      ตอน {String(activeEpNum).padStart(2, '0')}
                    </span>
                    <span className="cm-mobile-chapter-selector__title">
                      {activeChTitle}
                    </span>
                    <span className="cm-mobile-chapter-selector__stats">
                      · {activeScenesCount} ฉาก
                    </span>
                  </div>
                </div>
              </div>
              <div className="cm-mobile-chapter-selector__right">
                <span>รายการตอนทั้งหมด</span>
                <ChevronRight size={18} style={{ color: "#64748b" }} />
              </div>
            </div>
          );
        })()}

        {/* 🌟 เช็กกรณีนิยายเรื่องนี้ยังไม่มีตอนแรก (`chapters.length === 0`) */}
        {chapters.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 24px',
            marginTop: '20px',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '2.5px dashed #fbcfe8',
            textAlign: 'center',
            boxShadow: '0 4px 15px rgba(219, 39, 119, 0.02)'
          }}>
            <div style={{
              fontSize: '54px',
              marginBottom: '16px',
              animation: 'bounce 2s infinite',
              display: 'inline-block'
            }}>📝</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
              เริ่มต้นสร้างนิยายของคุณ !
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#64748b', maxWidth: '380px', lineHeight: '1.6' }}>
              เพิ่ม "ตอน" เพื่อจัดหมวดหมู่เรื่องราว จากนั้นสร้าง "ฉาก" ย่อยด้านในตอนเพื่อเริ่มเขียนเนื้อหาและเชื่อมตัวเลือกไปยังฉากต่อไป 
            </p>
            <button
              onClick={openCreateChapterForm}
              disabled={getNovelStatusInfo(novel).isBanned}
              style={{
                background: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '24px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(219, 39, 119, 0.3)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              ✨ สร้างตอนแรกที่นี่เลย
            </button>
          </div>
        ) : activeChapter ? (
          <ChapterPanel
            chapter={activeChapter}
            novel={novel}
            allChapters={chapters}
            fetchScenes={() => fetchNovelAndChapters(true)}
            onAddScene={handleAddScene}
            onDeleteChapter={handleDeleteChapter}
            openConfirmDialog={openConfirmDialog}
            onWrite={(chId, scId) => {
              bypassBlockerRef.current = true;
              sessionStorage.setItem("focusSceneTarget", scId);
              onNavigate("scene-editor", { novelId: currentNovelId, chapterId: chId, sceneId: scId });
            }} />
        ) : (
          <div className="cm-empty-state">
            📭 ยังไม่มีการเลือกตอนเพื่อดูฉากย่อย กรุณาเลือกดูรายชื่อตอนจากเมนูด้านซ้ายมือค่ะ
          </div>
        )}
      </div>

      {/* 📝 ป๊อปอัปกรอกข้อมูลสร้างตอนใหม่ เด้งขึ้นกลางจออย่างหรูหรา (Popup Modal) */}
      {isCreatingChapter && (
        <div className="se-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="se-modal-content" style={{ maxWidth: "420px", padding: "28px" }}>
            <div className="se-modal-icon" style={{ background: "#fce7f3", color: "#db2777" }}>📝</div>
            <h3 className="se-modal-title" style={{ fontFamily: "'Sarabun', sans-serif" }}>สร้างตอนใหม่</h3>
            <p className="se-modal-desc" style={{ fontFamily: "'Sarabun', sans-serif" }}>กรอกชื่อตอนนิยายที่ต้องการสร้างเพื่อเริ่มต้นเขียนฉากย่อย</p>
            
            <div style={{ width: "100%", margin: "16px 0 20px 0", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>ชื่อตอน</label>
              <input
                type="text"
                className="cm-input"
                value={draftChapterTitle}
                onChange={(e) => setDraftChapterTitle(e.target.value)}
                placeholder="เช่น ป่าต้องห้าม, การพบเจอ..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
                autoFocus
              />
              
              <label style={{ display: "block", marginTop: "12px", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>สถานะตอนแรกเริ่ม</label>
              <select
                className="cm-select"
                value={draftChapterStatus}
                onChange={(e) => setDraftChapterStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  background: "#ffffff"
                }}
              >
                <option value="draft">ฉบับร่าง (Draft)</option>
                <option value="published">เผยแพร่เลย (Published)</option>
              </select>
            </div>

            <div className="se-modal-actions" style={{ display: "flex", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className="se-modal-btn se-modal-btn--cancel"
                onClick={cancelCreateChapter}
                style={{ flex: 1 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="se-modal-btn"
                onClick={handleAddChapter}
                disabled={isSubmittingChapter || isSuccessCreatingChapter}
                style={{
                  flex: 1,
                  background: isSuccessCreatingChapter
                    ? "#10b981"
                    : "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.2s ease"
                }}
              >
                {isSubmittingChapter ? (
                  <>
                    <div style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "cm-spin 0.8s linear infinite"
                    }} />
                    <span>กำลังสร้างตอน</span>
                  </>
                ) : isSuccessCreatingChapter ? (
                  <span>✓ สร้างตอนสำเร็จ</span>
                ) : (
                  "สร้างตอน"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 ป๊อปอัปกรอกข้อมูลสร้างฉากใหม่ เด้งขึ้นกลางจออย่างหรูหรา (Popup Modal) */}
      {isCreatingScene && (
        <div className="se-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="se-modal-content" style={{ maxWidth: "420px", padding: "28px" }}>
            <div className="se-modal-icon" style={{ background: "#fce7f3", color: "#db2777" }}>🎬</div>
            <h3 className="se-modal-title" style={{ fontFamily: "'Sarabun', sans-serif" }}>สร้างฉากใหม่</h3>
            <p className="se-modal-desc" style={{ fontFamily: "'Sarabun', sans-serif" }}>กรุณากรอกชื่อฉากที่ต้องการสร้างเพื่อเริ่มต้นเขียนเนื้อเรื่อง</p>
            
            <div style={{ width: "100%", margin: "16px 0 20px 0", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>ชื่อฉาก</label>
              <input
                type="text"
                className="cm-input"
                value={newSceneTitle}
                onChange={(e) => { setNewSceneTitle(e.target.value); setCreateSceneError(""); }}
                placeholder="เช่น การพบกับชายปริศนา"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
                autoFocus
              />
              {createSceneError && (
                <div style={{ color: "#ef4444", fontSize: "12.5px", fontWeight: "700", marginTop: "8px" }}>
                  {createSceneError}
                </div>
              )}
            </div>

            <div className="se-modal-actions" style={{ display: "flex", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className="se-modal-btn se-modal-btn--cancel"
                onClick={() => {
                  setIsCreatingScene(false);
                  setNewSceneTitle("");
                  setCreateSceneError("");
                  setCreateSceneChapterId(null);
                }}
                style={{ flex: 1 }}
                disabled={isSubmittingScene || isSuccessCreatingScene}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="se-modal-btn"
                onClick={handleConfirmCreateScene}
                disabled={isSubmittingScene || isSuccessCreatingScene}
                style={{
                  flex: 1,
                  background: isSuccessCreatingScene
                    ? "#10b981"
                    : "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                {isSubmittingScene ? (
                  <>
                    <div style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "cm-spin 0.8s linear infinite"
                    }} />
                    <span>กำลังสร้างฉาก...</span>
                  </>
                ) : isSuccessCreatingScene ? (
                  <span>✓ สร้างฉากสำเร็จ</span>
                ) : (
                  "สร้างฉาก"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmModal
          isOpen={Boolean(confirmDialog)}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel || "ตกลง"}
          cancelLabel={confirmDialog.cancelLabel || "ยกเลิก"}
          showCancel={confirmDialog.showCancel !== false}
          type={confirmDialog.type || "danger"}
          onConfirm={executeConfirmAction}
          onCancel={closeConfirmDialog}
        />
      )}

      <AppealModal
        isOpen={isAppealModalOpen}
        isSubmitting={isSubmittingAppeal}
        hasPendingAppeal={hasPendingAppeal || novel?.appeal_status === "appeal_pending" || novel?.has_pending_appeal}
        novel={novel}
        onSubmit={handleSubmitAppeal}
        onCancel={handleCloseAppealModal}
      />

      <UnsavedChangesModal
        isOpen={blocker?.state === "blocked"}
        onStay={() => blocker?.reset()}
        onLeave={() => blocker?.proceed()}
      />
    </div>
  );
};

export default ChapterManagerPage;