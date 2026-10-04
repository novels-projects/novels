import { useState, useEffect, useMemo, useRef } from "react";
import "./EndingUnlockedModal.css";

// นิยามโครงสร้าง 4 ประเภทฉากจบหลัก (ENDING DEFINITIONS)
export const ENDING_DEFINITIONS = {
  good: {
    key: "good",
    typeLabelEN: "GOOD ENDING",
    typeLabelTH: "จบแบบสมหวัง",
    typeLabel: "GOOD ENDING",
    emoji: "🌸",
    badgeBg: "#fce7f3",
    badgeColor: "#be185d",
    accentColor: "#db2777",
    cardBorder: "#fbcfe8",
    cardBg: "#fff5f8",
    defaultTitle: "ฉากจบความสุข",
    defaultDesc: "เรื่องราวลงเอยด้วยรอยยิ้มและความทรงจำอันแสนงดงาม",
  },
  bad: {
    key: "bad",
    typeLabelEN: "BAD ENDING",
    typeLabelTH: "จบแบบเศร้า",
    typeLabel: "BAD ENDING",
    emoji: "🥀",
    badgeBg: "#f1f5f9",
    badgeColor: "#475569",
    accentColor: "#334155",
    cardBorder: "#cbd5e1",
    cardBg: "#f8fafc",
    defaultTitle: "บทสรุปอันโศกเศร้า",
    defaultDesc: "บางเส้นทางไม่ได้มีจุดสิ้นสุดที่สวยงาม แต่มันก็เป็นส่วนหนึ่งของเรื่องราวที่สมบูรณ์",
  },
  true: {
    key: "true",
    typeLabelEN: "TRUE ENDING",
    typeLabelTH: "ฉากจบแท้จริง",
    typeLabel: "TRUE ENDING",
    emoji: "👑",
    badgeBg: "#fef3c7",
    badgeColor: "#b45309",
    accentColor: "#d97706",
    cardBorder: "#fde68a",
    cardBg: "#fffbeb",
    defaultTitle: "ความจริงแห่งโชคชะตา",
    defaultDesc: "เส้นทางที่ถูกต้องที่สุด เปิดเผยความจริงและบทสรุปที่แท้จริง",
  },
  secret: {
    key: "secret",
    typeLabelEN: "SECRET ENDING",
    typeLabelTH: "ฉากจบลับ",
    typeLabel: "SECRET ENDING",
    emoji: "🔮",
    badgeBg: "#f3e8ff",
    badgeColor: "#6d28d9",
    accentColor: "#7c3aed",
    cardBorder: "#ddd6fe",
    cardBg: "#faf5ff",
    defaultTitle: "ฉากจบลับซ่อนเร้น",
    defaultDesc: "เส้นทางลับซ่อนเร้นที่น้อยคนนักจะได้ค้นพบ",
  },
};

// เอฟเฟกต์ Confetti Particle Burst แบบระเบิดอนุภาคเฉลิมฉลอง
const triggerConfetti = () => {
  const container = document.createElement("div");
  container.className = "eum-confetti-container";
  document.body.appendChild(container);

  const colors = ["#db2777", "#d97706", "#7c3aed", "#10b981", "#3b82f6", "#f43f5e"];
  const particleCount = 45;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement("div");
    p.className = "eum-confetti-particle";
    const bg = colors[Math.floor(Math.random() * colors.length)];
    const left = 50 + (Math.random() * 60 - 30);
    const animDelay = Math.random() * 0.2;
    const animDuration = 1.2 + Math.random() * 0.8;
    const size = 6 + Math.random() * 8;

    p.style.backgroundColor = bg;
    p.style.left = `${left}%`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.animationDelay = `${animDelay}s`;
    p.style.animationDuration = `${animDuration}s`;

    container.appendChild(p);
  }

  setTimeout(() => {
    container.remove();
  }, 2200);
};

export default function EndingUnlockedModal({
  isOpen,
  currentScene,
  allNovelEndings = [],
  novelId,
  onClose,
  onViewStoryTree,
  onRestartReading,
}) {
  const [isNewUnlock, setIsNewUnlock] = useState(false);
  const [storageTick, setStorageTick] = useState(0);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    closeButtonRef.current?.focus();
    const handleModalKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleModalKeyDown);
    return () => document.removeEventListener("keydown", handleModalKeyDown);
  }, [isOpen, onClose]);

  // ดึงประเภทฉากจบปัจจุบัน (good | bad | true | secret) โดยไม่สับสนกับ type = "ending"
  const rawType = (() => {
    if (!currentScene) return "true";
    const candidate = (
      currentScene.ending_type ||
      currentScene.endingType ||
      currentScene.ending_category ||
      currentScene.endingCategory ||
      ""
    ).toString().toLowerCase();

    if (["good", "bad", "true", "secret"].includes(candidate)) {
      return candidate;
    }
    return "true";
  })();

  const currentTheme = ENDING_DEFINITIONS[rawType] || ENDING_DEFINITIONS.true;

  // ตรวจสอบ Tracking ว่าฉากจบนี้เคยปลดล็อกไปแล้วหรือยัง + สะสมรายละเอียดฉากจบที่เคยเจอ
  useEffect(() => {
    if (!isOpen || !novelId || !currentScene) return;

    const sceneId = currentScene.scene_id || currentScene.id;
    const historyKey = `unlocked_endings_history_${novelId}`;
    const detailsKey = `unlocked_ending_details_${novelId}`;

    try {
      const savedHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");
      const savedDetails = JSON.parse(localStorage.getItem(detailsKey) || "{}");

      const alreadyFound = savedHistory.includes(String(sceneId));

      if (!alreadyFound) {
        // ค้นพบใหม่ครั้งแรก!
        setIsNewUnlock(true);
        savedHistory.push(String(sceneId));
        localStorage.setItem(historyKey, JSON.stringify(savedHistory));
        // จุดพลุ Confetti
        triggerConfetti();
      } else {
        setIsNewUnlock(false);
      }

      // บันทึกสะสมรายละเอียดฉากจบประจำประเภท (good, bad, true, secret) ไว้ใน Local Storage เสมอ
      if (rawType) {
        const title =
          currentScene.ending_title ||
          currentScene.endingTitle ||
          currentScene.title ||
          currentScene.scene_title ||
          currentTheme.defaultTitle;

        savedDetails[rawType] = {
          type: rawType,
          scene_id: sceneId,
          title: title,
          description: currentScene.ending_description || currentScene.endingDescription || "",
        };
        localStorage.setItem(detailsKey, JSON.stringify(savedDetails));
      }
      setStorageTick((t) => t + 1);
    } catch {
      console.warn("Failed tracking ending history");
      setIsNewUnlock(false);
    }
  }, [isOpen, novelId, currentScene, rawType, currentTheme]);

  // ประมวลผล 4 slots หลักใน Grid คลังฉากจบ (ซิงค์ประวัติจากทั้ง API และ Local Details)
  const endingSlots = useMemo(() => {
    const slots = ["good", "bad", "true", "secret"];
    const allEndingsArr = Array.isArray(allNovelEndings) ? allNovelEndings : [];

    let savedDetails = {};
    let savedHistory = [];
    try {
      savedDetails = JSON.parse(localStorage.getItem(`unlocked_ending_details_${novelId}`) || "{}");
      savedHistory = JSON.parse(localStorage.getItem(`unlocked_endings_history_${novelId}`) || "[]");
    } catch (e) {
      // ignore
    }

    return slots.map((typeKey) => {
      const def = ENDING_DEFINITIONS[typeKey];

      // ค้นหาว่านิยายเรื่องนี้มีฉากจบประเภทนี้ใน API หลังบ้านไหม
      const matchingEnding = allEndingsArr.find((item) => {
        const itemType = (
          item?.ending_type ||
          item?.endingType ||
          item?.type ||
          item?.scene?.ending_type ||
          item?.scene?.type ||
          ""
        ).toLowerCase();
        return itemType === typeKey;
      });

      // ดึงรายละเอียดจาก Local History ที่บันทึกค้างไว้
      const localDetail = savedDetails[typeKey];

      // ตรวจสอบสถานะการปลดล็อก (จาก API หรือจาก Local History หรือเป็นฉากปัจจุบัน)
      const isUnlockedInApi =
        matchingEnding?.is_unlocked === true ||
        matchingEnding?.isUnlocked === true ||
        Boolean(matchingEnding?.user_id) ||
        (matchingEnding && savedHistory.includes(String(matchingEnding.scene_id || matchingEnding.id || matchingEnding.scene?.id)));

      const isUnlockedInHistory = Boolean(localDetail);
      const isCurrentActive = rawType === typeKey;

      const isUnlocked = isUnlockedInApi || isUnlockedInHistory || isCurrentActive;

      // ค้นหาชื่อฉากจบที่จะนำมาแสดง
      const resolvedTitle =
        matchingEnding?.ending_title ||
        matchingEnding?.title ||
        matchingEnding?.scene?.ending_title ||
        matchingEnding?.scene?.title ||
        localDetail?.title ||
        (isCurrentActive
          ? currentScene?.ending_title || currentScene?.title || def.defaultTitle
          : def.defaultTitle);

      return {
        key: typeKey,
        def,
        isUnlocked,
        isNew: isCurrentActive && isNewUnlock,
        title: resolvedTitle,
      };
    });
  }, [allNovelEndings, rawType, currentScene, isNewUnlock, novelId, storageTick]);

  // คำนวณจำนวนฉากจบที่ปลดล็อกแล้ว
  const unlockedCount = endingSlots.filter((s) => s.isUnlocked).length;
  const totalSlots = 4;
  const progressPercent = Math.round((unlockedCount / totalSlots) * 100);

  if (!isOpen) return null;

  const currentTitle =
    currentScene?.ending_title ||
    currentScene?.endingTitle ||
    currentScene?.title ||
    currentTheme.defaultTitle;

  const currentDesc =
    currentScene?.ending_description ||
    currentScene?.endingDescription ||
    currentTheme.defaultDesc;

  return (
    <div className="eum-overlay" role="dialog" aria-modal="true" aria-labelledby="ending-modal-title" onClick={(e) => e.target.classList.contains("eum-overlay") && onClose()}>
      <div className="eum-card">
        {/* ปุ่ม ✕ ปิดมุมขวาบน */}
        <button type="button" className="eum-close-btn" ref={closeButtonRef} onClick={onClose} aria-label="ปิด">
          ✕
        </button>

        {/* Top Eyebrow Badge */}
        <div className="eum-eyebrow">
          {isNewUnlock ? "✨ ค้นพบฉากจบใหม่!" : "🏆 ฉากจบที่ค้นพบ"}
        </div>

        {/* Main Achievement Header */}
        <div className="eum-hero">
          <div className="eum-hero-emoji">{currentTheme.emoji}</div>
          <div className="eum-hero-type" style={{ color: currentTheme.accentColor }}>
            {currentTheme.typeLabel}
          </div>
          <h2 id="ending-modal-title" className="eum-hero-title">{currentTitle}</h2>
          {currentDesc && <p className="eum-hero-desc">{currentDesc}</p>}
        </div>

        <div className="eum-divider" />

        {/* Collection Section */}
        <div className="eum-collection-section">
          <h3 className="eum-collection-title">คลังฉากจบของคุณ</h3>

          {/* 4 Slots Grid */}
          <div className="eum-grid">
            {endingSlots.map((slot) => {
              if (slot.isUnlocked) {
                return (
                  <div
                    key={slot.key}
                    className={`eum-slot eum-slot--unlocked eum-slot--${slot.key}`}
                    style={{
                      borderColor: slot.def.cardBorder,
                      backgroundColor: slot.def.cardBg,
                    }}
                    title={slot.title}
                  >
                    <div className="eum-slot-left">
                      <span className="eum-slot-emoji">{slot.def.emoji}</span>
                      <div className="eum-slot-info">
                        <span className="eum-slot-type" style={{ color: slot.def.accentColor }}>
                          {slot.def.typeLabel}
                        </span>
                        <span className="eum-slot-title" title={slot.title}>{slot.title}</span>
                      </div>
                    </div>

                    {slot.isNew && (
                      <span className="eum-badge-new">ใหม่</span>
                    )}
                  </div>
                );
              }

              // Locked Slot
              return (
                <div key={slot.key} className="eum-slot eum-slot--locked" title={slot.def.typeLabel}>
                  <div className="eum-slot-left">
                    <span className="eum-slot-emoji eum-slot-emoji--locked">🔒</span>
                    <div className="eum-slot-info">
                      <span className="eum-slot-type eum-slot-type--locked">
                        {slot.def.typeLabel}
                      </span>
                      <span className="eum-slot-title eum-slot-title--locked">???</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="eum-progress-group">
            <div className="eum-progress-label">
              <span>ค้นพบแล้ว</span>
              <span className="eum-progress-val">{unlockedCount}/{totalSlots} ฉากจบ</span>
            </div>
            <div className="eum-progress-track">
              <div
                className="eum-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="eum-actions">
          <button
            type="button"
            className="eum-btn eum-btn--primary"
            onClick={() => {
              onClose();
              onViewStoryTree && onViewStoryTree();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            ดูแผนผังการอ่าน
          </button>

          <button
            type="button"
            className="eum-btn eum-btn--secondary"
            onClick={() => {
              onClose();
              onRestartReading && onRestartReading();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            อ่านเส้นทางอื่น
          </button>

          <button type="button" className="eum-btn-text" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
