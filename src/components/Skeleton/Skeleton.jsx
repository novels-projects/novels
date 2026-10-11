import React, { useEffect, useState } from "react";
import "./Skeleton.css";

// ============================================================
// Base Skeleton Primitive
// ============================================================
export const Skeleton = ({
  variant = "rectangular", // text, title, rectangular, circular, button
  width,
  height,
  borderRadius,
  className = "",
  style = {},
  dark = false,
  ariaLabel = "กำลังโหลด...",
  ...props
}) => {
  const inlineStyles = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(borderRadius !== undefined ? { borderRadius } : {}),
    ...style,
  };

  return (
    <div
      className={`skeleton skeleton--${variant} ${dark ? "skeleton--dark" : ""} ${className}`.trim()}
      style={inlineStyles}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      {...props}
    />
  );
};

// ============================================================
// Top Navigation Progress Bar
// ============================================================
export const TopProgressBar = ({ active = false }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer;
    if (active) {
      setVisible(true);
    } else {
      timer = setTimeout(() => setVisible(false), 300);
    }
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible && !active) return null;

  return (
    <div className="top-progress-bar-container" aria-hidden="true">
      <div
        className="top-progress-bar top-progress-bar--indeterminate"
        style={{ opacity: active ? 1 : 0 }}
      />
    </div>
  );
};

// ============================================================
// Button Inline Spinner
// ============================================================
export const ButtonSpinner = ({ className = "" }) => (
  <span className={`button-spinner ${className}`.trim()} aria-hidden="true" />
);

// ============================================================
// Refreshing Indicator (Soft background update banner)
// ============================================================
export const RefreshingIndicator = ({ text = "กำลังอัปเดตข้อมูลล่าสุด..." }) => (
  <div className="refreshing-indicator" role="status" aria-live="polite">
    <ButtonSpinner />
    <span>{text}</span>
  </div>
);

// ============================================================
// Novel Card Skeleton
// ============================================================
export const NovelCardSkeleton = ({ dark = false }) => {
  return (
    <div className="novel-card-skeleton" aria-label="กำลังโหลดนิยาย...">
      <Skeleton
        variant="rectangular"
        className="novel-card-skeleton__cover"
        dark={dark}
      />
      <div className="novel-card-skeleton__body">
        <Skeleton variant="title" width="85%" height={18} dark={dark} />
        <Skeleton variant="text" width="50%" height={12} dark={dark} />
        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
          <Skeleton variant="rectangular" width="45px" height="18px" borderRadius="12px" dark={dark} />
          <Skeleton variant="rectangular" width="55px" height="18px" borderRadius="12px" dark={dark} />
        </div>
      </div>
    </div>
  );
};

export const NovelCardGridSkeleton = ({ count = 8, dark = false }) => {
  return (
    <div className="novel-card-skeleton-grid" role="status" aria-live="polite" aria-label="กำลังโหลดรายการนิยาย">
      {Array.from({ length: count }).map((_, idx) => (
        <NovelCardSkeleton key={idx} dark={dark} />
      ))}
    </div>
  );
};

// ============================================================
// Novel Detail Hero Skeleton
// ============================================================
export const NovelDetailSkeleton = () => {
  return (
    <div className="novel-detail-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดรายละเอียดนิยาย">
      {/* Top Breadcrumb */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <Skeleton width="60px" height="14px" />
        <Skeleton width="12px" height="14px" />
        <Skeleton width="100px" height="14px" />
      </div>

      {/* Hero Card */}
      <div className="novel-detail-skeleton__hero">
        <div className="novel-detail-skeleton__cover-wrap">
          <Skeleton variant="rectangular" className="novel-detail-skeleton__cover" />
        </div>
        <div className="novel-detail-skeleton__info">
          <Skeleton variant="title" width="70%" height="28px" />
          <Skeleton width="35%" height="16px" />
          
          <div className="novel-detail-skeleton__stats">
            <Skeleton width="70px" height="24px" borderRadius="12px" />
            <Skeleton width="70px" height="24px" borderRadius="12px" />
            <Skeleton width="70px" height="24px" borderRadius="12px" />
          </div>

          <div style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
            <Skeleton width="60px" height="22px" borderRadius="12px" />
            <Skeleton width="60px" height="22px" borderRadius="12px" />
          </div>

          {/* Synopsis */}
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <Skeleton width="100%" height="14px" />
            <Skeleton width="95%" height="14px" />
            <Skeleton width="80%" height="14px" />
          </div>

          {/* Action Buttons */}
          <div className="novel-detail-skeleton__actions">
            <Skeleton variant="button" width="130px" height="42px" />
            <Skeleton variant="button" width="110px" height="42px" />
            <Skeleton variant="button" width="140px" height="42px" />
          </div>
        </div>
      </div>

      {/* Chapters / Content Preview Section */}
      <div style={{ background: "var(--white, #fff)", borderRadius: "20px", padding: "24px", border: "1px solid var(--gray-100, #f0eef4)" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", borderBottom: "1px solid var(--gray-100, #f0eef4)", paddingBottom: "12px" }}>
          <Skeleton width="80px" height="24px" />
          <Skeleton width="80px" height="24px" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Skeleton width="100%" height="48px" borderRadius="10px" />
          <Skeleton width="100%" height="48px" borderRadius="10px" />
          <Skeleton width="100%" height="48px" borderRadius="10px" />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Reading Page Skeleton
// ============================================================
export const ReadingPageSkeleton = () => {
  return (
    <div className="reading-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดเนื้อหาการอ่าน">
      <div className="reading-skeleton__header">
        <Skeleton width="140px" height="20px" />
        <div style={{ display: "flex", gap: "10px" }}>
          <Skeleton width="36px" height="36px" variant="circular" />
          <Skeleton width="36px" height="36px" variant="circular" />
        </div>
      </div>

      <div className="reading-skeleton__content">
        <Skeleton variant="title" width="60%" height="26px" style={{ alignSelf: "center", marginBottom: "16px" }} />
        
        <Skeleton width="100%" height="16px" />
        <Skeleton width="96%" height="16px" />
        <Skeleton width="92%" height="16px" />
        
        <div style={{ height: "12px" }} />
        
        <Skeleton width="100%" height="16px" />
        <Skeleton width="98%" height="16px" />
        <Skeleton width="88%" height="16px" />
        
        <div style={{ height: "12px" }} />
        
        <Skeleton width="95%" height="16px" />
        <Skeleton width="90%" height="16px" />
        <Skeleton width="60%" height="16px" />

        {/* Choice buttons skeleton */}
        <div className="reading-skeleton__choices">
          <Skeleton variant="button" width="100%" height="48px" borderRadius="14px" />
          <Skeleton variant="button" width="100%" height="48px" borderRadius="14px" />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Notification Skeleton
// ============================================================
export const NotificationItemSkeleton = () => {
  return (
    <div className="notification-skeleton-item" role="status" aria-label="กำลังโหลดการแจ้งเตือน">
      <Skeleton variant="circular" width="46px" height="46px" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
        <Skeleton width="40%" height="16px" />
        <Skeleton width="80%" height="13px" />
        <Skeleton width="25%" height="11px" />
      </div>
      <Skeleton width="12px" height="12px" variant="circular" />
    </div>
  );
};

export const NotificationListSkeleton = ({ count = 5 }) => {
  return (
    <div className="notification-skeleton-list" role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, idx) => (
        <NotificationItemSkeleton key={idx} />
      ))}
    </div>
  );
};

// ============================================================
// Writer Dashboard Skeleton
// ============================================================
export const WriterDashboardSkeleton = () => {
  return (
    <div className="writer-dashboard-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดแดชบอร์ดนักเขียน">
      {/* 4 Stat Cards */}
      <div className="writer-dashboard-skeleton__stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="writer-dashboard-skeleton__stat-card">
            <Skeleton variant="circular" width="48px" height="48px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <Skeleton width="50%" height="13px" />
              <Skeleton width="40%" height="22px" />
            </div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width="180px" height="24px" />
        <Skeleton variant="button" width="140px" height="38px" />
      </div>

      {/* Novel List Table */}
      <div className="writer-dashboard-skeleton__list">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="writer-dashboard-skeleton__row">
            <Skeleton variant="rectangular" width="50px" height="70px" borderRadius="8px" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <Skeleton width="45%" height="18px" />
              <Skeleton width="30%" height="13px" />
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <Skeleton width="60px" height="18px" borderRadius="10px" />
                <Skeleton width="60px" height="18px" borderRadius="10px" />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Skeleton variant="button" width="80px" height="34px" />
              <Skeleton variant="button" width="80px" height="34px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Chapter Manager Skeleton
// ============================================================
export const ChapterManagerSkeleton = () => {
  return (
    <div className="chapter-manager-skeleton" role="status" aria-live="polite" aria-label="กำลังโหลดหน้าจัดการตอน">
      <div className="chapter-manager-skeleton__banner">
        <Skeleton variant="rectangular" width="90px" height="120px" borderRadius="12px" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
          <Skeleton width="40%" height="24px" />
          <Skeleton width="60%" height="14px" />
          <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
            <Skeleton variant="button" width="110px" height="36px" />
            <Skeleton variant="button" width="110px" height="36px" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width="150px" height="22px" />
        <Skeleton variant="button" width="130px" height="38px" />
      </div>

      <div className="chapter-manager-skeleton__chapters">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="chapter-manager-skeleton__chapter-card">
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <Skeleton width="20px" height="20px" borderRadius="4px" />
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Skeleton width="180px" height="16px" />
                <Skeleton width="100px" height="12px" />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Skeleton width="70px" height="28px" borderRadius="8px" />
              <Skeleton width="70px" height="28px" borderRadius="8px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Tree Canvas Skeleton (Story Tree & Visualizer)
// ============================================================
export const TreeCanvasSkeleton = ({ title = "กำลังจัดเตรียมแผนผังเนื้อเรื่อง..." }) => {
  return (
    <div className="tree-canvas-skeleton" role="status" aria-live="polite" aria-label={title}>
      <div style={{ position: "absolute", top: "16px", left: "20px" }}>
        <Skeleton width="180px" height="20px" />
      </div>
      <div className="tree-canvas-skeleton__nodes">
        {/* Root Node */}
        <Skeleton variant="rectangular" width="180px" height="60px" borderRadius="14px" />
        
        {/* Child Nodes */}
        <div className="tree-canvas-skeleton__branches">
          <Skeleton variant="rectangular" width="140px" height="50px" borderRadius="12px" />
          <Skeleton variant="rectangular" width="140px" height="50px" borderRadius="12px" />
        </div>

        {/* Leaf Nodes */}
        <div className="tree-canvas-skeleton__subbranches">
          <Skeleton variant="rectangular" width="110px" height="44px" borderRadius="10px" />
          <Skeleton variant="rectangular" width="110px" height="44px" borderRadius="10px" />
          <Skeleton variant="rectangular" width="110px" height="44px" borderRadius="10px" />
        </div>
      </div>
      <p style={{ marginTop: "24px", color: "var(--gray-600, #6B6578)", fontSize: "14px", fontWeight: "500" }}>
        {title}
      </p>
    </div>
  );
};

// ============================================================
// Statistics Graph Skeleton
// ============================================================
export const StatisticsGraphSkeleton = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", padding: "20px" }} role="status" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width="220px" height="26px" />
        <div style={{ display: "flex", gap: "10px" }}>
          <Skeleton variant="button" width="100px" height="36px" />
          <Skeleton variant="button" width="100px" height="36px" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px", minHeight: "560px" }}>
        <TreeCanvasSkeleton title="กำลังประมวลผลสถิติเส้นทาง..." />
        <div style={{ background: "var(--white, #fff)", borderRadius: "20px", border: "1px solid var(--gray-100, #f0eef4)", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <Skeleton width="140px" height="20px" />
          <Skeleton width="100%" height="80px" borderRadius="12px" />
          <Skeleton width="100%" height="80px" borderRadius="12px" />
          <Skeleton width="100%" height="80px" borderRadius="12px" />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Generic Table Rows Skeleton
// ============================================================
export const TableRowsSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }} role="status" aria-live="polite">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div
          key={rIdx}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: "16px",
            padding: "16px",
            background: "var(--white, #fff)",
            borderRadius: "12px",
            border: "1px solid var(--gray-100, #f0eef4)",
            alignItems: "center"
          }}
        >
          {Array.from({ length: cols }).map((_, cIdx) => (
            <Skeleton key={cIdx} height="16px" width={cIdx === 0 ? "70%" : "50%"} />
          ))}
        </div>
      ))}
    </div>
  );
};

// ============================================================
// Data Load Error / Retry Box
// ============================================================
export const DataLoadError = ({
  title = "ไม่สามารถโหลดข้อมูลได้",
  message = "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้งค่ะ",
  onRetry = null,
  onBack = null,
  backText = "กลับหน้าหลัก",
}) => {
  return (
    <div className="data-load-error" role="alert">
      <div className="data-load-error__icon" aria-hidden="true">⚠️</div>
      <h4 className="data-load-error__title">{title}</h4>
      <p className="data-load-error__message">{message}</p>
      <div className="data-load-error__actions">
        {onRetry && (
          <button type="button" className="data-load-error__retry-btn" onClick={onRetry}>
            🔄 ลองใหม่อีกครั้ง
          </button>
        )}
        {onBack && (
          <button type="button" className="data-load-error__back-btn" onClick={onBack}>
            {backText}
          </button>
        )}
      </div>
    </div>
  );
};
