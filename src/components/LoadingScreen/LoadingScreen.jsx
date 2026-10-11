import React, { useState, useEffect } from "react";
import "./LoadingScreen.css";

const LoadingScreen = ({
    message = "กำลังโหลดข้อมูล...",
    compact = false,
    fullScreen = false,
    onRetry = null,
    timeoutMs = 6000
}) => {
    const [isLongLoading, setIsLongLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLongLoading(true);
        }, timeoutMs);

        return () => clearTimeout(timer);
    }, [timeoutMs]);

    return (
        <div
            className={`loading-screen${compact ? " loading-screen--compact" : ""}${fullScreen ? " loading-screen--fullscreen" : ""}`}
            role="status"
            aria-live="polite"
        >
            <div className="loading-screen__spinner" aria-hidden="true" />
            <h3 className="loading-screen__message">{message}</h3>
            {isLongLoading && (
                <div className="loading-screen__slow-hint">
                    <p className="loading-screen__slow-text">
                        กำลังเชื่อมต่อเซิร์ฟเวอร์ อาจใช้เวลาสักครู่...
                    </p>
                    {onRetry && (
                        <button
                            type="button"
                            className="loading-screen__retry-btn"
                            onClick={onRetry}
                        >
                            🔄 โหลดใหม่อีกครั้ง
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default LoadingScreen;