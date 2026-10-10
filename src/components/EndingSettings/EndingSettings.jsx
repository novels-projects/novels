import React from "react";
import "./EndingSettings.css";

const TYPES = [
  {
    value: "good",
    icon: "🌸",
    labelEN: "GOOD ENDING",
    labelTH: "ฉากจบสมบูรณ์",
    label: "Good Ending",
    hint: "ฉากจบที่ตัวละครมีความสุขหรือประสบความสำเร็จ",
    badgeBg: "#fce7f3",
    badgeColor: "#be185d",
    cardBorder: "#fbcfe8",
    cardBg: "#fdf2f8",
    className: "good",
  },
  {
    value: "bad",
    icon: "🥀",
    labelEN: "BAD ENDING",
    labelTH: "ฉากจบที่หม่นหมอง",
    label: "Bad Ending",
    hint: "ฉากจบที่หม่นหมอง ตัวละครพบกับความสูญเสียหรือความล้มเหลว",
    badgeBg: "#fee2e2",
    badgeColor: "#b91c1c",
    cardBorder: "#fca5a5",
    cardBg: "#fef2f2",
    className: "bad",
  },
  {
    value: "true",
    icon: "👑",
    labelEN: "TRUE ENDING",
    labelTH: "ฉากจบแท้จริง",
    label: "True Ending",
    hint: "ฉากจบที่แท้จริง เปิดเผยปมและบทสรุปทั้งหมดของเรื่องราว",
    badgeBg: "#fef3c7",
    badgeColor: "#b45309",
    cardBorder: "#fde68a",
    cardBg: "#fffbeb",
    className: "true",
  },
  {
    value: "secret",
    icon: "🔮",
    labelEN: "SECRET ENDING",
    labelTH: "ฉากจบลับ",
    label: "Secret Ending",
    hint: "ฉากจบลับที่ซ่อนอยู่หลังตัวเลือกพิเศษ",
    badgeBg: "#f3e8ff",
    badgeColor: "#6b21a8",
    cardBorder: "#e9d5ff",
    cardBg: "#faf5ff",
    className: "secret",
  },
];

export default function EndingSettings({
  sceneTitle = "แสงสุดท้ายแห่งอาณาจักร",
  novelTitle = "",
  isEnding = true,
  endingTitle = "",
  endingType = "true",
  endingDescription = "",
  endingDescriptionEnabled = false,
  onToggleEnding,
  onToggleEndingDescriptionEnabled,
  onChangeEndingTitle,
  onChangeEndingType,
  onChangeEndingDescription,
  onSave,
  onClose,
}) {
  const [descriptionEnabled, setDescriptionEnabled] = React.useState(
    Boolean(endingDescriptionEnabled || endingDescription)
  );

  React.useEffect(() => {
    setDescriptionEnabled(Boolean(endingDescriptionEnabled || endingDescription));
  }, [endingDescriptionEnabled, endingDescription]);

  const handleToggleDescription = () => {
    const next = !descriptionEnabled;
    setDescriptionEnabled(next);
    onToggleEndingDescriptionEnabled?.(next);
  };

  const current = TYPES.find((t) => t.value === endingType) || TYPES[0];
  const previewTitle = endingTitle.trim() || sceneTitle;

  return (
    <div className="ending-page">
      <div className="ending-card">
        {/* 1. Header & Main Toggle */}
        <div className="ending-header">
          <div className="ending-header-text">
            <h3>🏁 ฉากจบ</h3>
            <p>บันทึกฉากนี้ลงในคลังฉากจบของนักอ่าน</p>
          </div>

          <div className="header-toggle">
            <span className="header-toggle-label">ใช้เป็นฉากจบ</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={isEnding}
                onChange={() => onToggleEnding?.(!isEnding)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {isEnding && (
          <div className="ending-settings-two-columns" style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr",
            gap: "24px",
            padding: "20px 24px",
            borderTop: "1px solid #f3f4f6"
          }}>
            
            {/* ฝั่งซ้าย (Left Column) - ตัวอย่างคลังฉากจบ (ถอดแบบจากการ์ดฝั่งนักอ่าน media_1791570384180.png) */}
            <div className="ending-settings-left-col" style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "left" }}>
              <label style={{ fontWeight: "700", color: "#374151", fontSize: "0.95rem", textAlign: "left" }}>ตัวอย่างคลังฉากจบฝั่งนักอ่าน</label>
              
              <div 
                className={`preview-card-reader-style ${current.className}`}
                style={{
                  backgroundColor: current.cardBg,
                  borderColor: current.cardBorder,
                  borderWidth: "1.5px",
                  borderStyle: "solid",
                  borderRadius: "20px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  boxShadow: "0 6px 24px rgba(15, 23, 42, 0.04)",
                  textAlign: "left"
                }}
              >
                {/* 1. Header Row: Badge (Icon + EN/TH) + Read Pill */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: current.badgeBg,
                    border: `1px solid ${current.cardBorder}`,
                    padding: "4px 14px 4px 6px",
                    borderRadius: "999px"
                  }}>
                    <div style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      backgroundColor: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px"
                    }}>
                      {current.icon}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, color: current.badgeColor, letterSpacing: "0.4px" }}>
                        {current.labelEN}
                      </span>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: current.badgeColor, opacity: 0.85 }}>
                        {current.labelTH}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: "#ffffff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "999px",
                    padding: "4px 12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#64748b"
                  }}>
                    คุณอ่านจบแล้ว
                  </div>
                </div>

                {/* 2. Content Row: Artwork Box + Title & Description */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", width: "100%" }}>
                  <div style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "16px",
                    backgroundColor: "#ffffff",
                    border: `1.5px solid ${current.cardBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "32px",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                  }}>
                    {current.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 600, marginBottom: "2px" }}>
                      เรื่อง : {novelTitle || "ชื่อเรื่องนิยาย"}
                    </div>
                    <h4 style={{
                      margin: "0 0 4px 0",
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {previewTitle}
                    </h4>
                    {descriptionEnabled && (
                      <p style={{
                        margin: "4px 0 0 0",
                        fontSize: "0.8rem",
                        color: "#475569",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden"
                      }}>
                        {endingDescription.trim() || "คุณตัดสินใจสละชีวิตทางโลกเพื่อกลายเป็นผู้พิทักษ์ความลับตลอดกาล..."}
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Callout Notice Box */}
                <div style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  border: "1px solid rgba(0,0,0,0.06)",
                  padding: "10px 14px",
                  textAlign: "left"
                }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#1e293b", marginBottom: "2px" }}>
                    คุณได้พบกับหนึ่งในบทจบของเรื่องนี้
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                    ลองย้อนกลับไปเลือกทางอื่น เพื่อค้นพบเส้นทางที่ต่างออกไป
                  </div>
                </div>
              </div>
            </div>

            {/* ฝั่งขวา (Right Column) - ตั้งค่าและรายละเอียด */}
            <div className="ending-settings-right-col" style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "left" }}>
              
              {/* เลือกประเภท ENDING */}
              <div className="ending-section-box" style={{ textAlign: "left" }}>
                <label style={{ fontWeight: "700", color: "#374151", fontSize: "0.95rem", display: "block", marginBottom: "12px", textAlign: "left" }}>ประเภทฉากจบ</label>
                <div className="type-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {TYPES.map((item) => {
                    const isActive = endingType === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`type-card ${isActive ? "active" : ""}`}
                        onClick={() => onChangeEndingType?.(item.value)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          border: isActive ? `2px solid ${item.badgeColor}` : "1.5px solid #e5e7eb",
                          backgroundColor: isActive ? item.badgeBg : "#ffffff",
                          cursor: "pointer",
                          textAlign: "left",
                          position: "relative",
                          transition: "all 0.18s ease"
                        }}
                      >
                        <div className="icon" style={{ fontSize: "1.5rem", marginBottom: 0 }}>{item.icon}</div>
                        <div>
                          <div style={{ fontWeight: "800", color: isActive ? item.badgeColor : "#1e293b", fontSize: "0.82rem" }}>{item.labelEN}</div>
                          <div style={{ fontWeight: "600", color: isActive ? item.badgeColor : "#64748b", fontSize: "0.74rem", opacity: 0.9 }}>{item.labelTH}</div>
                        </div>
                        
                        {/* ✨ เครื่องหมาย Checkmark เมื่อเลือก */}
                        {isActive && (
                          <div style={{
                            position: "absolute",
                            top: "6px",
                            right: "6px",
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            backgroundColor: item.badgeColor,
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "9px",
                            fontWeight: "700"
                          }}>
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="type-hint" style={{ marginTop: "10px", padding: "10px", background: "#f9fafb", borderRadius: "10px", color: "#6b7280", fontSize: "0.82rem", textAlign: "left" }}>
                  {current.hint}
                </div>
              </div>

              {/* ชื่อฉากจบ */}
              <div className="ending-section-box" style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
                <label style={{ fontWeight: "700", color: "#374151", fontSize: "0.95rem", textAlign: "left" }}>
                  ชื่อฉากจบ <span className="optional" style={{ marginLeft: "6px", color: "#9ca3af", fontSize: "0.8rem", fontWeight: "400" }}>(เว้นว่างเพื่อใช้ชื่อฉาก)</span>
                </label>
                <input
                  className="input"
                  value={endingTitle}
                  onChange={(e) => onChangeEndingTitle?.(e.target.value)}
                  placeholder={sceneTitle}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "0.88rem" }}
                />
              </div>

              {/* รายละเอียดฉากจบ & Toggle */}
              <div className="ending-section-box" style={{ textAlign: "left" }}>
                <div className="toggle-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", width: "100%" }}>
                  <div className="toggle-row-text" style={{ textAlign: "left" }}>
                    <label style={{ fontWeight: "700", color: "#374151", fontSize: "0.95rem", marginBottom: "4px", display: "block", textAlign: "left" }}>รายละเอียดฉากจบ</label>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "0.82rem", textAlign: "left" }}>แสดงข้อความเพิ่มเติมหลังปลดล็อก</p>
                  </div>
                  <label className="switch" style={{ marginLeft: "auto" }}>
                    <input
                      type="checkbox"
                      checked={descriptionEnabled}
                      onChange={handleToggleDescription}
                    />
                    <span className="slider" />
                  </label>
                </div>
                
                {descriptionEnabled && (
                  <textarea
                    className="input"
                    style={{ minHeight: "100px", resize: "vertical", width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "0.88rem", marginTop: "8px" }}
                    value={endingDescription}
                    onChange={(e) => onChangeEndingDescription?.(e.target.value)}
                    placeholder="เขียนคำอธิบายเพิ่มเติมที่นี่..."
                  />
                )}
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}
