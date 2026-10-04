import React, { useState } from "react";
import { Flag, X, Check, Loader2, AlertTriangle } from "lucide-react";
import "./ReaderReportButton.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const REASONS = [
  { id: "cover_scary", label: "หน้าปกน่ากลัว / ไม่เหมาะสม" },
  { id: "inappropriate", label: "เนื้อหารุนแรง / ลามกเกินไป" },
  { id: "spam", label: "สแปมหรือโฆษณาแอบแฝง" },
  { id: "copyright", label: "ละเมิดลิขสิทธิ์ / นำผลงานผู้อื่นมาลง" },
  { id: "other", label: "อื่นๆ (โปรดระบุข้างล่าง)" },
];

export default function ReaderReportButton({
  novelId,
  novelTitle = "นิยายเรื่องนี้",
  isOpen,
  onClose,
  showRibbon = true,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen !== undefined ? isOpen : internalOpen;

  const setOpen = (val) => {
    if (isOpen !== undefined) {
      if (!val && onClose) onClose();
    } else {
      setInternalOpen(val);
    }
  };

  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const resetAndClose = () => {
    setOpen(false);
    if (onClose) onClose();
    setTimeout(() => {
      setReason("");
      setDescription("");
      setStatus("idle");
      setErrorMsg("");
    }, 300);
  };

  const handleSubmit = async () => {
    if (!reason || !novelId) return;

    // 🟢 1. ดึง Token และเช็กว่าล็อกอินหรือยัง
    const token = localStorage.getItem("token");
    if (!token) {
      alert("กรุณาเข้าสู่ระบบก่อนทำการแจ้งรายงานค่ะ");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    // 🟢 2. รวมข้อมูลเหตุผลและรายละเอียดเพิ่มเติมส่งให้ Backend DTO (novel_id, reason)
    const selectedReasonObj = REASONS.find((r) => r.id === reason);
    const selectedLabel = selectedReasonObj ? selectedReasonObj.label : reason;
    const finalReasonText = description.trim()
      ? `${selectedLabel} (รายละเอียด: ${description.trim()})`
      : selectedLabel;

    const payload = {
      novel_id: Number(novelId),
      reason: finalReasonText,
    };

    try {
      // 🟢 3. ยิง API POST /api/reports
      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || "ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง");
      }

      setStatus("done");
    } catch (err) {
      console.error("POST /api/reports failed:", err);
      setErrorMsg(err.message);
      setStatus("idle");
    }
  };

  return (
    <>
      {/* Ribbon ปุ่มลอยข้างจอ */}
      {showRibbon && (
        <button
          className="report-ribbon-btn"
          onClick={() => setOpen(true)}
          aria-label="รายงานนิยาย"
        >
          <Flag size={18} strokeWidth={2.5} />
          <span className="report-ribbon-text">รายงาน</span>
        </button>
      )}

      {/* Pop-up Modal */}
      {open && (
        <div
          className="report-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && resetAndClose()}
        >
          <div className="report-modal-card">
            {/* Header */}
            <div className="report-modal-header">
              <div className="report-header-left">
                <div className="report-header-icon-box">
                  <Flag size={20} strokeWidth={2.2} />
                </div>
                <div className="report-header-text">
                  <div className="report-modal-subtitle">รายงานเนื้อหา</div>
                  <h3 className="report-modal-title">{novelTitle}</h3>
                </div>
              </div>
              <button
                type="button"
                className="report-close-btn"
                onClick={resetAndClose}
                aria-label="ปิด"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            {status === "done" ? (
              <div className="report-success-box">
                <div className="report-success-icon">
                  <Check size={28} strokeWidth={3} />
                </div>
                <h3 style={{ margin: 0, color: "#0f172a", fontWeight: 800 }}>
                  ส่งรายงานเรียบร้อยแล้ว
                </h3>
                <p style={{ color: "#64748b", fontSize: "14px", marginTop: "8px", lineHeight: 1.5 }}>
                  ทีมงานจะรีบทำการตรวจสอบข้อมูลโดยเร็วที่สุดครับ
                </p>
                <button className="btn-submit" style={{ marginTop: "18px", width: "100%" }} onClick={resetAndClose}>
                  ตกลง
                </button>
              </div>
            ) : (
              <div className="report-modal-body">
                {errorMsg && (
                  <div className="report-error-msg">
                    <AlertTriangle size={15} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <label className="report-section-label">เลือกสาเหตุที่ต้องการรายงาน</label>
                <div className="report-options-list">
                  {REASONS.map((r) => {
                    const isSelected = reason === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`report-option-item ${isSelected ? "selected" : ""}`}
                        onClick={() => setReason(r.id)}
                      >
                        <div className="report-radio-circle">
                          {isSelected && <span className="report-radio-dot" />}
                        </div>
                        <span className="report-option-text">{r.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="report-textarea-group">
                  <label className="report-section-label">รายละเอียดเพิ่มเติม (ระบุตอนที่พบปัญหา)</label>
                  <textarea
                    className="report-textarea"
                    rows={3}
                    placeholder="โปรดระบุรายละเอียด เช่น พบเนื้อหาไม่เหมาะสมในตอนที่ 3, ก๊อปปี้มาจากเรื่อง..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="report-warning-notice">
                  <AlertTriangle size={15} className="report-warning-icon" />
                  <span>การรายงานเท็จหรือกลั่นแกล้งผู้อื่น อาจส่งผลให้บัญชีของคุณถูกระงับการใช้งาน</span>
                </div>

                <div className="report-modal-actions">
                  <button type="button" className="btn-cancel" onClick={resetAndClose}>
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    disabled={
                      !reason ||
                      (reason === "other" && description.trim().length < 3) ||
                      status === "sending"
                    }
                    onClick={handleSubmit}
                  >
                    {status === "sending" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "ส่งรายงาน"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}