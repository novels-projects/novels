import React, { useState, useEffect, useRef, useCallback } from "react";
import { GitFork, ArrowLeft } from "lucide-react";
import "./EndingCollection.css";

const endingTypeMeta = {
  good:    { label: "Good Ending",   icon: "🌸", className: "good" },
  bad:     { label: "Bad Ending",    icon: "🥀", className: "bad" },
  true:    { label: "True Ending",   icon: "👑", className: "true" },
  secret:  { label: "Secret Ending", icon: "🔮", className: "secret" },
  unknown: { label: "Ending",        icon: "📖", className: "unknown" },
};

export default function EndingCollection({ isOpen, endings, onClose, onViewStoryMap }) {
  const [filter, setFilter]   = useState("all");
  const [selected, setSelected] = useState(null);

  const modalRef      = useRef(null);
  const closeButtonRef = useRef(null);
  const detailRef     = useRef(null);

  const endingsList    = Array.isArray(endings) ? endings : [];
  const unlockedEndings = endingsList.filter((item) => item?.is_unlocked);
  const totalEndings    = endingsList.length; // รวมทั้งที่ยังไม่ unlock

  // Dynamic filter buttons — แสดงเฉพาะ type ที่มีข้อมูลจริงใน unlocked list
  const currentFilters = (() => {
    const base = [{ value: "all", label: "ทั้งหมด" }];
    const hasType = (t) => unlockedEndings.some((i) => (i?.ending_type || i?.type) === t);
    if (hasType("good"))   base.push({ value: "good",   label: "Good Ending" });
    if (hasType("bad"))    base.push({ value: "bad",    label: "Bad Ending" });
    if (hasType("true"))   base.push({ value: "true",   label: "True Ending" });
    if (hasType("secret")) base.push({ value: "secret", label: "Secret Ending" });
    return base;
  })();

  const visibleEndings = unlockedEndings.filter((item) =>
    filter === "all" ? true : (item?.ending_type || item?.type) === filter
  );

  // Reset state เมื่อปิด modal
  useEffect(() => {
    if (!isOpen) {
      setFilter("all");
      setSelected(null);
    }
  }, [isOpen]);

  // Focus ปุ่มปิดทันทีที่ modal เปิด (focus management)
  useEffect(() => {
    if (isOpen && !selected) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen, selected]);

  // Focus ภายใน detail popup เมื่อเปิด
  useEffect(() => {
    if (selected) {
      detailRef.current?.querySelector("button")?.focus();
    }
  }, [selected]);

  // Escape key: ปิด detail popup ก่อน ถ้าไม่มีให้ปิด modal หลัก
  const handleKeyDown = useCallback((e) => {
    if (e.key !== "Escape") return;
    if (selected) {
      setSelected(null);
    } else {
      onClose?.();
    }
  }, [selected, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="ending-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      aria-hidden={!isOpen}
    >
      <div
        className="ending-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ending-modal-title"
        ref={modalRef}
      >
        {/* ── ปุ่มปิด ── */}
        <button
          className="ending-modal__close"
          type="button"
          onClick={onClose}
          aria-label="ปิดคลังฉากจบ"
          ref={closeButtonRef}
        >
          ×
        </button>

        {/* ── Header ── */}
        <header className="ending-modal__header">
          <p className="ending-modal__subtitle">คลังฉากจบ</p>
          <h2 id="ending-modal-title">รวมฉากจบที่ค้นพบแล้ว</h2>
          <div className="ending-modal__header-meta">
            <p className="ending-modal__description">
              ดูเฉพาะฉากจบที่คุณค้นพบแล้วเท่านั้น
            </p>
            {/* Badge จำนวนที่ค้นพบ */}
            <span className="ending-modal__count-badge" aria-label={`ค้นพบแล้ว ${unlockedEndings.length} จาก ${totalEndings} ฉากจบ`}>
              🏆 {unlockedEndings.length}
              {totalEndings > 0 && <span className="ending-modal__count-total"> / {totalEndings}</span>}
            </span>
          </div>
        </header>

        {/* ── Filter Buttons ── */}
        <div className="ending-filter-buttons" role="tablist" aria-label="กรองประเภทฉากจบ">
          {currentFilters.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              className={`ending-filter-button ${filter === option.value ? "ending-filter-button--active" : ""}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              {option.value !== "all" && (
                <span className="ending-filter-button__count">
                  {unlockedEndings.filter((i) => (i?.ending_type || i?.type) === option.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Grid ── */}
        <div className="ending-grid" role="list" aria-label="รายการฉากจบที่ค้นพบ">
          {visibleEndings.length === 0 ? (
            <div className="ending-empty" role="status">
              <span className="ending-empty__icon">🔍</span>
              <p>ยังไม่มีฉากจบที่ค้นพบในหมวดนี้</p>
            </div>
          ) : (
            visibleEndings.map((ending) => {
              const key     = ending.scene_id || ending.id;
              const typeKey = ending.ending_type || ending.type || "unknown";
              const meta    = endingTypeMeta[typeKey] || endingTypeMeta.unknown;
              const title   = ending.ending_title || ending.title || "ฉากจบไม่ได้ตั้งชื่อ";
              const hasDesc = ending.ending_description || ending.endingDescription || ending.description;

              return (
                <button
                  key={key}
                  type="button"
                  role="listitem"
                  className={`ending-card ${meta.className}`}
                  onClick={() => setSelected(ending)}
                  aria-label={`${meta.label}: ${title}`}
                >
                  <div className="ending-card__icon" aria-hidden="true">{meta.icon}</div>
                  <div className="ending-card__label">{meta.label}</div>
                  <h4 className="ending-card__title">{title}</h4>
                  {hasDesc && (
                    <p className="ending-card__meta">{hasDesc}</p>
                  )}
                  <span className="ending-card__cta">ดูรายละเอียด →</span>
                </button>
              );
            })
          )}
        </div>

        {/* ── Detail Popup ── */}
        {selected && (() => {
          const typeKey = selected.ending_type || selected.type || "unknown";
          const meta    = endingTypeMeta[typeKey] || endingTypeMeta.unknown;
          const unlockedAt = (() => {
            const raw = selected.unlocked_at || selected.unlockedAt || selected.reached_at;
            if (!raw) return "ไม่ระบุ";
            const d = new Date(raw);
            return isNaN(d.getTime()) ? raw : d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
          })();

          return (
            <div
              className="ending-detail-popup"
              onClick={() => setSelected(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ending-detail-title"
              ref={detailRef}
            >
              <div
                className={`ending-detail-popup__content ending-detail-popup__content--${meta.className}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="ending-detail-popup__header">
                  <div className="ending-detail-popup__icon" aria-hidden="true">{meta.icon}</div>
                  <span className={`ending-detail-popup__type ending-detail-popup__type--${meta.className}`}>
                    {meta.label}
                  </span>
                  <h3 className="ending-detail-popup__title" id="ending-detail-title">
                    {selected.ending_title || selected.title}
                  </h3>
                  {(selected.ending_description || selected.endingDescription || selected.description) && (
                    <p className="ending-detail-popup__desc">
                      {selected.ending_description || selected.endingDescription || selected.description}
                    </p>
                  )}
                </div>

                <div className="ending-detail-popup__body">
                  <div className="ending-detail-popup__meta-row">
                    <span>ค้นพบเมื่อ</span>
                    <strong>{unlockedAt}</strong>
                  </div>

                  <div className="ending-detail-popup__actions">
                    <button
                      type="button"
                      className="ending-detail-popup__button ending-detail-popup__button--primary"
                      onClick={() => onViewStoryMap?.(selected.scene_id || selected.id)}
                    >
                      <GitFork size={16} style={{ marginRight: 6 }} />
                      แผนผังการอ่าน
                    </button>
                    <button
                      type="button"
                      className="ending-detail-popup__button ending-detail-popup__button--secondary"
                      onClick={() => setSelected(null)}
                    >
                      <ArrowLeft size={16} style={{ marginRight: 6 }} />
                      กลับคลัง
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
