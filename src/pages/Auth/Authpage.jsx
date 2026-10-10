// src/pages/Auth/AuthPage.jsx
//
// ══════════════════════════════════════════════════════════
//  หน้าเข้าสู่ระบบ / สมัครสมาชิก (แก้ไขระบบ Validation และย้าย Event ไปยังปุ่มกด)
// ══════════════════════════════════════════════════════════

import React, { useState, useEffect } from "react";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../utils/cropImage.js";
import "./AuthPage.css";

// ══════════════════════════════════════════════════════════
//  Icons (inline SVG components)
// ══════════════════════════════════════════════════════════
const IconUser = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="7" r="3.5" stroke="var(--pink-500)" strokeWidth="1.6"/>
    <path d="M3 18c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="var(--pink-500)" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2" y="4" width="16" height="12" rx="2" stroke="var(--pink-500)" strokeWidth="1.6" fill="none"/>
    <path d="M2 7l8 5 8-5" stroke="var(--pink-500)" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const IconEyeOpen = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
  </svg>
);

const IconEyeClosed = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 3l14 14M8.5 8.68A2.5 2.5 0 0012.5 12M1 10s3.5-6 9-6c1.39 0 2.7.3 3.87.83M19 10s-1.35 2.31-3.87 4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6.5 5.5C3.5 6.9 1 10 1 10s3.5 6 9 6c2.1 0 4-.7 5.5-1.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ══════════════════════════════════════════════════════════
//  Icons for Password strength rules
// ══════════════════════════════════════════════════════════
const IconCircleCheck = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="10" cy="10" r="8" stroke="#16A34A" strokeWidth="2" fill="none" />
    <path d="M6 10l3 3 5-6" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCircle = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="10" cy="10" r="8" stroke="#94A3B8" strokeWidth="2" fill="none" />
  </svg>
);

// ══════════════════════════════════════════════════════════
//  Sub: Password input with toggle
// ══════════════════════════════════════════════════════════
const PasswordInput = ({ id, value, onChange, placeholder, error, maxLength = 100 }) => {
  const [show, setShow] = useState(false);
  return (
    <div className={`auth-input-wrap ${error ? "auth-input-wrap--error" : ""}`}>
      <input
        id={id}
        type={show ? "text" : "password"}
        className="auth-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={id === "confirm-password" ? "new-password" : "current-password"}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <button
        type="button"
        className="auth-input__eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        aria-pressed={show}
      >
        {show ? <IconEyeOpen /> : <IconEyeClosed />}
      </button>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
//  Sub: Left decorative panel
// ══════════════════════════════════════════════════════════
const DecorPanel = () => (
  <div className="auth-decor" aria-hidden="true">
    <div className="auth-decor__cards">
      <div className="auth-decor__card auth-decor__card--back2" />
      <div className="auth-decor__card auth-decor__card--back1" />
      <div className="auth-decor__card auth-decor__card--main">
        <div className="auth-decor__logo-art">
          <div className="auth-decor__hat">🎩</div>
          <div className="auth-decor__book-text">
            <span className="auth-decor__story">STORY</span>
            <span className="auth-decor__diamond">✦</span>
            <span className="auth-decor__verse">VERSE</span>
          </div>
        </div>
      </div>
    </div>

    <div className="auth-decor__brand">
      <span className="auth-decor__brand-story">Story </span>
      <span className="auth-decor__brand-verse">Verse</span>
    </div>

    <p className="auth-decor__tagline">
      แพลตฟอร์มนิยายทางเลือกรูปแบบใหม่ ที่ให้คุณเป็นผู้กำหนดเส้นทาง
      เลือกปลดล็อก และค้นพบตอนจบที่แตกต่าง
    </p>

    <div className="auth-decor__pills">
      <div className="auth-decor__pill">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.4 3.9H13l-3.4 2.4 1.3 3.9L7 9l-3.9 2.2 1.3-3.9L1 5l4.6-.1z" fill="currentColor"/>
        </svg>
        นิยายทางเลือก
      </div>
      <div className="auth-decor__pill">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="3.5" cy="7" r="1.5" fill="currentColor" opacity=".7"/>
          <circle cx="10.5" cy="3" r="1.5" fill="currentColor" opacity=".7"/>
          <circle cx="10.5" cy="11" r="1.5" fill="currentColor" opacity=".7"/>
          <path d="M5 6.3L9 3.7M5 7.7L9 10.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        โครงสร้างเนื้อเรื่อง
      </div>
      <div className="auth-decor__pill">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 3h10v8H2z" stroke="currentColor" strokeWidth="1.3" fill="none" rx="1"/>
          <path d="M4 6h6M4 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        หลายตอนจบ
      </div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════
//  Sub: Login form
// ══════════════════════════════════════════════════════════
const LoginForm = ({ onSwitchToRegister }) => {
  const [email,     setEmail]     = useState(() => localStorage.getItem("remembered_login_email") || "");
  const [password,  setPassword]  = useState("");
  const [remember,  setRemember]  = useState(() => Boolean(localStorage.getItem("remembered_login_email")));
  const [errors,    setErrors]    = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!email.trim())    e.email    = "กรุณากรอกอีเมล";
    if (!password.trim()) e.password = "กรุณากรอกรหัสผ่าน";
    return e;
  };

  const handleSubmit = async (ev) => {
    if (ev) ev.preventDefault();
    if (isLoading) return;

    const e = validate();
    if (Object.keys(e).length) { 
      setErrors(e); 
      return; 
    }

    setIsLoading(true);
    setErrors({});
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const raw = await res.text().catch(() => "");
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (err) {
        data = { message: raw };
      }

      if (!res.ok) {
        const message = data?.error?.message || data?.message || (typeof data?.error === "string" ? data.error : null);
        setErrors({ general: message || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบอีเมลและรหัสผ่าน' });
        setIsLoading(false);
        return;
      }
      if (remember) {
        localStorage.setItem("remembered_login_email", email.trim());
      } else {
        localStorage.removeItem("remembered_login_email");
      }
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('pw_len', password.length);
      }

      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      setIsLoading(false);
      window.location.href = '/';
    } catch (err) {
      console.error("❌ Catch Error in Login Process:", err);
      setErrors({ general: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่อของคุณ' });
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-form__heading">
        <p className="auth-form__welcome">ยินดีต้อนรับ</p>
        <h2 className="auth-form__title">เข้าสู่ระบบได้ที่นี่</h2>
      </div>

      {errors.general && (
        <div className="auth-form__error-banner" role="alert">⚠️ {errors.general}</div>
      )}

      <div className="auth-field">
        <div className="auth-field__label-row">
          <IconMail />
          <label className="auth-label" htmlFor="login-email">อีเมล</label>
        </div>
        <div className={`auth-input-wrap ${errors.email ? "auth-input-wrap--error" : ""}`}>
          <input
            id="login-email"
            type="email"
            className="auth-input"
            placeholder="you@example.com"
            maxLength={100}
            value={email}
            onChange={(e) => { setEmail(e.target.value); if(errors.email) setErrors((p) => ({ ...p, email: "" })); }}
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
        </div>
        {errors.email && <p className="auth-field__error" role="alert">{errors.email}</p>}
      </div>

      <div className="auth-field">
        <div className="auth-field__label-row">
          <label className="auth-label" htmlFor="login-password">รหัสผ่าน</label>
        </div>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if(errors.password) setErrors((p) => ({ ...p, password: "" })); }}
          placeholder="กรอกรหัสผ่านของคุณ"
          maxLength={100}
          error={errors.password}
        />
        {errors.password && <p className="auth-field__error" role="alert">{errors.password}</p>}
      </div>

      <div className="auth-form__row">
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="auth-checkbox__input"
          />
          <span className="auth-checkbox__box" />
          <span className="auth-checkbox__label">จดจำฉัน</span>
        </label>
        <button type="button" className="auth-form__forgot">ลืมรหัสผ่าน</button>
      </div>

      <button
        type="submit"
        className="auth-submit"
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? <span className="auth-submit__spinner" /> : "เข้าสู่ระบบ"}
      </button>

      <p className="auth-form__switch">
        ยังไม่มีบัญชีใช่ไหม?{" "}
        <button type="button" className="auth-form__switch-link" onClick={onSwitchToRegister}>
          สมัครสมาชิก
        </button>
      </p>
    </form>
  );
};

// ══════════════════════════════════════════════════════════
//  Sub: Register form
// ══════════════════════════════════════════════════════════
const RegisterForm = ({ onSwitchToLogin }) => {
  const [username,       setUsername]       = useState("");
  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [confirm,        setConfirm]        = useState("");
  const [remember,       setRemember]       = useState(false);
  const [profilePreview, setProfilePreview] = useState(null);
  const [profileFile,    setProfileFile]    = useState(null);
  const [errors,         setErrors]         = useState({});
  const [isLoading,      setIsLoading]      = useState(false);

  // States สำหรับ Cropper (ครอบตัดรูปโปรไฟล์)
  const [imageToCrop,        setImageToCrop]        = useState(null);
  const [crop,               setCrop]               = useState({ x: 0, y: 0 });
  const [zoom,               setZoom]               = useState(1);
  const [croppedAreaPixels,  setCroppedAreaPixels]  = useState(null);
  const [isCropping,         setIsCropping]         = useState(false);

  // Field validation and messages
  const [usernameMsg, setUsernameMsg] = useState({ type: "hint", text: "ใช้ได้เฉพาะ A–Z, a–z, 0–9 และ _ ความยาว 3–50 ตัวอักษร" });
  const [emailMsg, setEmailMsg] = useState({ type: "hint", text: "" });
  const [pwMatchMsg, setPwMatchMsg] = useState({ type: "none", text: "" });

  const takenUsernames = [
    "admin_master",
    "dark_john",
    "alice_reader",
    "mi____kry",
    "maymay",
    "jane_writer"
  ];

  const takenEmails = [
    "admin@novelverse.com",
    "john@novelverse.com",
    "alice@novelverse.com",
    "mike@novelverse.com",
    "testmay@gmail.com",
    "jane@novelverse.com"
  ];

  const pwRules = [
    { id: "r-len", label: "อย่างน้อย 8 ตัวอักษร", required: true, test: (v) => v.length >= 8 },
    { id: "r-upper", label: "ตัวพิมพ์ใหญ่ (A–Z)", required: true, test: (v) => /[A-Z]/.test(v) },
    { id: "r-num", label: "ตัวเลข (0–9)", required: true, test: (v) => /[0-9]/.test(v) },
  ];

  const pwLevels = [
    { label: "อ่อนแอ", color: "#EF4444", cls: "active-weak" },
    { label: "พอใช้", color: "#F59E0B", cls: "active-fair" },
    { label: "แข็งแกร่ง", color: "#16A34A", cls: "active-strong" },
  ];

  const getPwStrength = () => {
    if (!password) return null;
    const passed = pwRules.filter((r) => r.test(password)).length;
    const level = pwLevels[Math.max(0, passed - 1)];
    return { passed, level };
  };

  const handleUsernameChange = (val) => {
    setUsername(val);
    clearFieldError("username");
    
    if (!val) {
      setUsernameMsg({ type: "hint", text: "ใช้ได้เฉพาะ A–Z, a–z, 0–9 และ _ ความยาว 3–50 ตัวอักษร" });
      return;
    }

    if (val.length > 50) {
      setUsernameMsg({ type: "err", text: "ความยาวชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร" });
      return;
    }

    if (val.length < 3) {
      setUsernameMsg({ type: "err", text: "ความยาวชื่อผู้ใช้ต้องอย่างน้อย 3 ตัวอักษร" });
      return;
    }

    if (takenUsernames.includes(val)) {
      setUsernameMsg({ type: "err", text: "ชื่อบัญชีนี้มีคนใช้แล้ว" });
      return;
    }

    const ok = /^[a-zA-Z0-9_]{3,50}$/.test(val);
    if (ok) {
      setUsernameMsg({ type: "ok", text: "รูปแบบชื่อผู้ใช้ถูกต้อง" });
    } else {
      setUsernameMsg({ type: "err", text: "ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ ตัวเลข และ _ ความยาว 3–50 ตัวอักษร" });
    }
  };

  const handleEmailChange = (val) => {
    setEmail(val);
    clearFieldError("email");

    if (!val) {
      setEmailMsg({ type: "hint", text: "" });
      return;
    }

    if (val.length > 100) {
      setEmailMsg({ type: "err", text: "อีเมลต้องมีความยาวไม่เกิน 100 ตัวอักษร" });
      return;
    }

    if (takenEmails.includes(val)) {
      setEmailMsg({ type: "err", text: "อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว" });
      return;
    }

    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if (ok) {
      setEmailMsg({ type: "ok", text: "รูปแบบอีเมลถูกต้อง" });
    } else {
      setEmailMsg({ type: "err", text: "รูปแบบอีเมลไม่ถูกต้อง" });
    }
  };

  const handlePasswordChange = (val) => {
    setPassword(val);
    clearFieldError("password");
    
    if (confirm) {
      if (val === confirm) {
        setPwMatchMsg({ type: "ok", text: "รหัสผ่านตรงกันเรียบร้อย" });
      } else {
        setPwMatchMsg({ type: "err", text: "รหัสผ่านไม่ตรงกัน" });
      }
    }
  };

  const handleConfirmChange = (val) => {
    setConfirm(val);
    clearFieldError("confirm");
    if (!val) {
      setPwMatchMsg({ type: "none", text: "" });
      return;
    }
    if (password === val) {
      setPwMatchMsg({ type: "ok", text: "รหัสผ่านตรงกันเรียบร้อย" });
    } else {
      setPwMatchMsg({ type: "err", text: "รหัสผ่านไม่ตรงกัน" });
    }
  };

  const formatRegisterError = (msg) => {
    if (msg && typeof msg === "object") {
      msg = msg.message || msg.error || "";
    }
    if (!msg) return 'เกิดข้อผิดพลาดในการสมัครสมาชิก กรุณาลองใหม่อีกครั้ง';
    const lower = msg.toLowerCase();
    if (lower.includes("username already") || lower.includes("ชื่อผู้ใช้ซ้ำ") || lower.includes("username taken")) {
      return "ชื่อผู้ใช้ซ้ำกับในระบบ: กรุณาแก้ไขช่อง 'ชื่อผู้ใช้' เป็นชื่ออื่นที่ยังไม่มีการใช้งาน";
    }
    if (lower.includes("email already") || lower.includes("อีเมลซ้ำ") || lower.includes("email taken")) {
      return "อีเมลนี้ถูกใช้งานแล้ว: กรุณาแก้ไขช่อง 'อีเมล' หรือใช้หน้า 'เข้าสู่ระบบ' ด้วยบัญชีนี้";
    }
    if (lower.includes("password") && (lower.includes("weak") || lower.includes("short"))) {
      return "รหัสผ่านไม่ปลอดภัย: กรุณากรอกรหัสผ่านที่มีความยาว 8 ตัวขึ้นไป และมีตัวพิมพ์ใหญ่กับตัวเลข";
    }
    return `ข้อผิดพลาดจากเซิร์ฟเวอร์: ${msg} (กรุณาตรวจสอบและแก้ไขข้อมูลที่กรอกให้ถูกต้อง)`;
  };

  const handleProfileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("ขนาดไฟล์ต้องน้อยกว่า 5MB");
      return;
    }

    try {
      const imageUrl = URL.createObjectURL(file);
      setImageToCrop(imageUrl);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    } catch (err) {
      console.error("❌ Error creating object URL:", err);
      alert("เกิดข้อผิดพลาดในการโหลดรูป");
    }

    // Reset input file value so re-selecting same file works
    e.target.value = "";
  };

  const handleSaveCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    setIsCropping(true);
    try {
      const { file: croppedFile, url: croppedUrl } = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setProfileFile(croppedFile);
      if (profilePreview) {
        URL.revokeObjectURL(profilePreview);
      }
      setProfilePreview(croppedUrl);
      setImageToCrop(null);
    } catch (e) {
      console.error("Error cropping image:", e);
      alert("เกิดข้อผิดพลาดในการครอบตัดรูปภาพ");
    } finally {
      setIsCropping(false);
    }
  };

  useEffect(() => {
    return () => {
      if (profilePreview) {
        URL.revokeObjectURL(profilePreview);
      }
      if (imageToCrop) {
        URL.revokeObjectURL(imageToCrop);
      }
    };
  }, [profilePreview, imageToCrop]);

  const validate = () => {
    const e = {};
    if (!username.trim()) {
      e.username = "กรุณากรอกชื่อผู้ใช้";
    } else if (username.length < 3 || username.length > 50) {
      e.username = "ชื่อผู้ใช้ต้องมีความยาวระหว่าง 3–50 ตัวอักษร";
    } else if (usernameMsg.type === "err") {
      e.username = usernameMsg.text;
    }

    if (!email.trim()) {
      e.email = "กรุณากรอกอีเมล";
    } else if (emailMsg.type === "err") {
      e.email = emailMsg.text;
    }

    if (!password.trim()) {
      e.password = "กรุณากรอกรหัสผ่าน";
    } else {
      const isLenOk = password.length >= 8;
      const isUpperOk = /[A-Z]/.test(password);
      const isNumOk = /[0-9]/.test(password);

      if (!isLenOk || !isUpperOk || !isNumOk) {
        e.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ตัวพิมพ์ใหญ่ (A–Z) และตัวเลข (0–9)";
      }
    }

    if (!confirm.trim()) {
      e.confirm = "กรุณายืนยันรหัสผ่าน";
    } else if (confirm !== password) {
      e.confirm = "รหัสผ่านไม่ตรงกัน";
    }
    return e;
  };

  const clearFieldError = (field) => {
    if (errors[field]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[field];
        return n;
      });
    }
  };

  const handleSubmit = async (ev) => {
    if (ev) ev.preventDefault();
    if (isLoading) return; // ป้องกันการส่งซ้ำระหว่าง request
    
    const e = validate();
    if (Object.keys(e).length) { 
      setErrors(e); 
      return; 
    }

    setIsLoading(true);
    setErrors({});

    try {
      const formData = new FormData();
      formData.append('username', username.trim());
      formData.append('email', email.trim());
      formData.append('password', password);
      
      if (profileFile) {
        formData.append('profileImage', profileFile);
      }

      const res = await fetch('/api/register', {
        method: 'POST',
        body: formData, 
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMessage = data?.error?.message || data?.message || data?.error;
        setErrors({ general: formatRegisterError(errorMessage) });
        setIsLoading(false);
        return;
      }
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('pw_len', password.length);
      }

      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      setIsLoading(false);
      window.location.href = '/';
    } catch (err) {
      console.error("💥 CRITICAL CATCH: Register process threw an exception:", err);
      setErrors({ general: `ไม่สามารถติดต่อเซิร์ฟเวอร์ได้: ${err.message}` });
      setIsLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-form__heading">
        <h2 className="auth-form__title auth-form__title--center">สมัครสมาชิกได้ที่นี่</h2>
      </div>

      {errors.general && (
        <div className="auth-form__error-banner" role="alert">⚠️ {errors.general}</div>
      )}

      {/* รูปโปรไฟล์ */}
      <div className="auth-field auth-field--profile">
        <label className="auth-profile-label">รูปโปรไฟล์</label>
        
        <label htmlFor="profile-upload" className="auth-profile-circle">
          <input
            id="profile-upload"
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/webp"
            className="auth-profile-input"
            onChange={handleProfileChange}
            aria-label="อัพโหลดรูปโปรไฟล์"
          />

          {profilePreview ? (
            <img
              src={profilePreview}
              alt="Profile Preview"
              className="auth-profile-image"
            />
          ) : (
            <div className="auth-profile-placeholder">
              <span className="auth-profile-icon">📷</span>
              <span className="auth-profile-text">เพิ่มรูป</span>
            </div>
          )}
        </label>

        <p className="auth-profile-hint">JPG, PNG (สูงสุด 5MB)</p>
      </div>

      {/* Username */}
      <div className="auth-field">
        <div className="auth-field__label-row">
          <IconUser />
          <label className="auth-label" htmlFor="reg-username">ชื่อผู้ใช้</label>
        </div>
        <div className={`auth-input-wrap ${errors.username ? "auth-input-wrap--error" : ""}`}>
          <input
            id="reg-username"
            type="text"
            className="auth-input"
            placeholder="ตั้งชื่อผู้ใช้ของคุณ"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            autoComplete="username"
            aria-invalid={!!errors.username}
          />
        </div>
        {errors.username && <p className="auth-field__error" role="alert">{errors.username}</p>}
        <div className={`field-msg ${usernameMsg.type}`}>
          {usernameMsg.text}
        </div>
      </div>

      {/* Email */}
      <div className="auth-field">
        <div className="auth-field__label-row">
          <IconMail />
          <label className="auth-label" htmlFor="reg-email">อีเมล</label>
        </div>
        <div className={`auth-input-wrap ${errors.email ? "auth-input-wrap--error" : ""}`}>
          <input
            id="reg-email"
            type="email"
            className="auth-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
        </div>
        {errors.email && <p className="auth-field__error" role="alert">{errors.email}</p>}
        {email && (
          <div className={`field-msg ${emailMsg.type}`}>
            {emailMsg.text}
          </div>
        )}
      </div>

      {/* Password */}
      <div className="auth-field">
        <div className="auth-field__label-row">
          <label className="auth-label" htmlFor="reg-password">รหัสผ่าน</label>
        </div>
        <PasswordInput
          id="reg-password"
          value={password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          placeholder="ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร"
          error={errors.password}
        />
        {errors.password && <p className="auth-field__error" role="alert">{errors.password}</p>}
        
        {/* Password strength indicators */}
        {password && (
          <div className="pw-strength">
            <div className="pw-bars">
              {[1, 2, 3].map((i) => {
                const strengthInfo = getPwStrength();
                return (
                  <div 
                    key={i} 
                    className={`pw-bar ${strengthInfo && i <= strengthInfo.passed ? strengthInfo.level.cls : ""}`} 
                  />
                );
              })}
            </div>
            
            {/* Password requirements checklist */}
            <div className="pw-rules">
              {pwRules.map((rule) => {
                const ok = rule.test(password);
                return (
                  <div key={rule.id} className={`pw-rule ${ok ? "pass" : "fail"}`}>
                    {ok ? <IconCircleCheck /> : <IconCircle />}
                    <span>{rule.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div className="auth-field">
        <div className="auth-field__label-row">
          <label className="auth-label" htmlFor="confirm-password">ยืนยันรหัสผ่าน</label>
        </div>
        <PasswordInput
          id="confirm-password"
          value={confirm}
          onChange={(e) => handleConfirmChange(e.target.value)}
          placeholder="กรอกรหัสผ่านอีกครั้ง"
          error={errors.confirm}
        />
        {errors.confirm && <p className="auth-field__error" role="alert">{errors.confirm}</p>}
        {confirm && (
          <div className={`field-msg ${pwMatchMsg.type}`}>
            {pwMatchMsg.text}
          </div>
        )}
      </div>

      {/* Remember */}
      <div className="auth-form__row auth-form__row--single">
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="auth-checkbox__input"
          />
          <span className="auth-checkbox__box" />
          <span className="auth-checkbox__label">จดจำฉัน</span>
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="auth-submit"
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? <span className="auth-submit__spinner" /> : "สมัครสมาชิก"}
      </button>

      {/* Switch */}
      <p className="auth-form__switch">
        มีบัญชีอยู่แล้วใช่ไหม?{" "}
        <button type="button" className="auth-form__switch-link" onClick={onSwitchToLogin}>
          เข้าสู่ระบบ
        </button>
      </p>

      {/* Crop Modal */}
      {imageToCrop && (
        <div className="crop-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="crop-modal-container">
            <div className="crop-modal-header">
              <h3>ครอบตัดรูปโปรไฟล์</h3>
              <button type="button" className="crop-modal-close" onClick={() => setImageToCrop(null)}>✕</button>
            </div>

            <div className="crop-cropper-wrapper">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
              />
            </div>

            <div className="crop-controls">
              <span className="crop-control-label">🔍 ขยาย:</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
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
                {isCropping ? "กำลังครอบตัด..." : "ใช้รูปภาพนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

// ══════════════════════════════════════════════════════════
//  Main: AuthPage
// ══════════════════════════════════════════════════════════
const AuthPage = ({ initialTab = "login" }) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="auth-page">
      <div className="auth-tabs" role="tablist" aria-label="เลือกโหมด">
        <button
          className={`auth-tab ${activeTab === "login" ? "auth-tab--active" : ""}`}
          role="tab"
          aria-selected={activeTab === "login"}
          onClick={() => setActiveTab("login")}
        >
          เข้าสู่ระบบ
        </button>
        <button
          className={`auth-tab ${activeTab === "register" ? "auth-tab--active" : ""}`}
          role="tab"
          aria-selected={activeTab === "register"}
          onClick={() => setActiveTab("register")}
        >
          สมัครสมาชิก
        </button>
      </div>

      <div className="auth-layout">
        <DecorPanel />
        <div className="auth-card-wrap">
          <div className="auth-card" role="tabpanel">
            {activeTab === "login" ? (
              <LoginForm onSwitchToRegister={() => setActiveTab("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setActiveTab("login")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

