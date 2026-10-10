import React, { useState, useRef } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../utils/cropImage.js";
import "./CoverUpload.css";

const CoverUpload = ({ value, onChange }) => {
  const [preview, setPreview] = useState(value || null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  // --- State สำหรับระบบครอบรูปภาพ ---
  const [imageToCrop, setImageToCrop] = useState(null); // เก็บ Object URL ของรูปต้นฉบับ
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false); // สถานะกำลังประมวลผลเซฟรูป

  const handleFile = (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("รองรับเฉพาะไฟล์ JPEG, PNG, และ WebP เท่านั้น");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("ขนาดไฟล์ปกต้องไม่เกิน 10MB");
      return;
    }
    
    // แทนที่จะตั้งเป็น Preview เลย ให้ส่งรูปไปที่ระบบครอบรูปก่อน
    const url = URL.createObjectURL(file);
    setImageToCrop(url);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    setPreview(null);
    onChange?.(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // เมื่อลากกรอบครอบรูปเสร็จเสร็จ
  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  // กดยืนยันการตัดรูป
  const handleSaveCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    setIsCropping(true);
    try {
      const { file, url } = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setPreview(url);
      onChange?.(file, url); // ส่งไฟล์ที่ตัดเสร็จแล้วกลับไปให้ Form ด้านนอกนำไปใช้ อัปโหลดลง MinIO ต่อ
      setImageToCrop(null); // ปิดหน้าต่างครอบรูป
    } catch (e) {
      console.error("Error cropping image:", e);
      alert("เกิดข้อผิดพลาดในการตัดรูปภาพ");
    } finally {
      setIsCropping(false);
    }
  };

  return (
    <>
      <div
        className={`cup ${isDragging ? "cup--drag" : ""} ${preview ? "cup--has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label="อัปโหลดภาพปก"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="cup__input"
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {preview ? (
          <div className="cup__preview">
            <img src={preview} alt="ภาพปก" className="cup__img" />
            <div className="cup__overlay">
              <button
                type="button"
                className="cup__change-btn"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              >
                เปลี่ยนภาพ
              </button>
              <button
                type="button"
                className="cup__remove-btn"
                onClick={handleRemove}
                aria-label="ลบภาพ"
              >
                ลบ
              </button>
            </div>
          </div>
        ) : (
          <div className="cup__placeholder">
            <div className="cup__placeholder-icon" aria-hidden="true">🖼️</div>
            <p className="cup__placeholder-text">คลิกหรือลากไฟล์มาวางที่นี่</p>
            <p className="cup__placeholder-hint">PNG, JPG, WebP (สูงสุด 10MB) · แนะนำสัดส่วนแนวตั้ง 2:3</p>
          </div>
        )}
      </div>

      {/* ── 📌 หน้าต่างกล่อง Modal สำหรับปรับขนาด/ครอบรูปภาพ ── */}
      {imageToCrop && (
        <div className="crop-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="crop-modal-container">
            <h3>📐 ปรับแต่งขนาดและครอบรูปปก</h3>
            
            <div className="crop-cropper-wrapper">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={2 / 3} // บังคับสัดส่วนปกเป็นแนวตั้ง 2:3 (ปรับเป็น 4/6 หรืออย่างอื่นได้ครับ)
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            {/* แถบควบคุมการซูม */}
            <div className="crop-controls">
              <label>🔍 ซูมภาพ:</label>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-label="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="crop-zoom-slider"
              />
            </div>

            <div className="crop-modal-actions">
              <button 
                type="button" 
                className="crop-btn-cancel" 
                onClick={() => setImageToCrop(null)}
                disabled={isCropping}
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                className="crop-btn-save" 
                onClick={handleSaveCrop}
                disabled={isCropping}
              >
                {isCropping ? "กำลังตัดรูป..." : "ใช้รูปภาพนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CoverUpload;