import React from "react";
import { AlertTriangle } from "lucide-react";
import "./UnsavedChangesModal.css";

const UnsavedChangesModal = ({ isOpen, onStay, onLeave }) => {
  if (!isOpen) return null;

  return (
    <div className="usm__overlay">
      <div className="usm__card" role="dialog" aria-modal="true" aria-labelledby="usm-title">
        <div className="usm__icon-wrap">
          <AlertTriangle className="usm__icon" size={28} />
        </div>
        <h3 id="usm-title" className="usm__title">
          มีข้อมูลที่ยังไม่ได้บันทึก
        </h3>
        <p className="usm__desc">
          คุณมีข้อมูลที่แก้ไขไว้แต่ยังไม่ได้บันทึก หากออกจากหน้านี้ ข้อมูลที่แก้ไขอาจสูญหาย
        </p>
        <div className="usm__actions">
          <button type="button" className="usm__btn usm__btn--stay" onClick={onStay}>
            อยู่หน้านี้ต่อ
          </button>
          <button type="button" className="usm__btn usm__btn--leave" onClick={onLeave}>
            ออกจากหน้านี้
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsavedChangesModal;
