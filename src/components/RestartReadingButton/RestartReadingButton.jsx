import React from "react";
import { RotateCcw } from "lucide-react";

const RestartReadingButton = ({ onRestart, disabled = false, className = "" }) => {
  return (
    <button
      type="button"
      className={`rp__ending-btn rp__ending-btn--secondary ${className}`}
      onClick={onRestart}
      disabled={disabled}
      aria-label="เริ่มอ่านใหม่"
    >
      <RotateCcw size={15} />
      <span>เริ่มอ่านใหม่</span>
    </button>
  );
};

export default RestartReadingButton;