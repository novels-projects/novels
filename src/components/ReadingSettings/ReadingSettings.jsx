import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import "./ReadingSettings.css";

const fontOptions = [
  { value: "Sarabun", label: "Sarabun", family: "'Sarabun', sans-serif" },
  { value: "Open Sans", label: "Open Sans", family: "'Open Sans', sans-serif" },
  { value: "Prompt", label: "Prompt", family: "'Prompt', sans-serif" },
  { value: "Kanit", label: "Kanit", family: "'Kanit', sans-serif" },
];

const themeOptions = [
  { value: "light", label: "สว่าง", bg: "#ffffff", border: "#e5e7eb", text: "#111" },
  { value: "cream", label: "ครีม", bg: "#fce6d1", border: "#f5c0b4", text: "#1f2937" },
  { value: "slate", label: "เทา", bg: "#334155", border: "#94a3b8", text: "#f8fafc" },
  { value: "dark", label: "มืด", bg: "#0f172a", border: "#475569", text: "#f8fafc" },
];

const ReadingSettings = ({
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onDecreaseFont,
  onIncreaseFont,
  theme,
  onThemeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="reading-settings-wrapper" ref={panelRef}>
      <button
        type="button"
        className="reading-settings__toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="เปิดเมนูเลือกธีมและการตั้งค่าการอ่าน"
      >
        <span className="reading-settings__icon-aa" aria-hidden="true">Aa</span>
        <span>ธีม</span>
      </button>

      {isOpen && (
        <div className="reading-settings__panel" role="dialog" aria-label="การตั้งค่าอ่านนิยาย">
          <div className="reading-settings__row">
            <div className="reading-settings__label">ฟอนต์</div>
            <div className="reading-settings__control">
              <select
                className="reading-settings__select"
                value={fontFamily}
                onChange={(e) => onFontFamilyChange(e.target.value)}
                aria-label="เลือกฟอนต์อ่าน"
              >
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="reading-settings__row">
            <div className="reading-settings__label">ขนาดตัวอักษร</div>
            <div className="reading-settings__font-size-controls">
              <button
                type="button"
                className="reading-settings__font-size-btn"
                onClick={onDecreaseFont}
                aria-label="ลดขนาดตัวอักษร"
              >
                Aa-
              </button>
              <span className="reading-settings__font-size-value">{fontSize}px</span>
              <button
                type="button"
                className="reading-settings__font-size-btn"
                onClick={onIncreaseFont}
                aria-label="เพิ่มขนาดตัวอักษร"
              >
                Aa+
              </button>
            </div>
          </div>

          <div className="reading-settings__row reading-settings__theme-row">
            <div className="reading-settings__label">ธีมสี</div>
            <div className="reading-settings__theme-list" role="radiogroup" aria-label="เลือกธีมสีอ่าน">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`reading-settings__theme-item ${theme === option.value ? "reading-settings__theme-item--active" : ""}`}
                  onClick={() => onThemeChange(option.value)}
                  style={{
                    background: option.bg,
                    borderColor: option.border,
                    color: option.text,
                  }}
                  aria-label={`เลือกธีม ${option.label}`}
                  aria-pressed={theme === option.value}
                >
                  <span className="reading-settings__theme-item-content">
                    <span className="reading-settings__theme-item-swatch">A</span>
                    <span className="reading-settings__theme-item-label">{option.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadingSettings;
