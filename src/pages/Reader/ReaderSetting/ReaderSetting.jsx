import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import getCroppedImg from "../../../utils/cropImage.js";
import "./ReaderSetting.css";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ฟังก์ชันแปลง Date เป็นแบบอ่านง่าย (เช่น "12 ม.ค. 2026")
function formatDate(dateString) {
  if (!dateString) return "ไม่ระบุ";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "ไม่ระบุ";
    return d.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (e) {
    return "ไม่ระบุ";
  }
}

// ฟังก์ชันแปลง MinIO URL
const formatMinioUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  return url.replace('http://minio:9000', 'http://localhost:9000');
};

export default function ReaderSetting() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ------------------------------------------
  // States
  // ------------------------------------------
  const [userInfo, setUserInfo] = useState({
    id: "",
    username: "",
    email: "",
    joinedAt: "",
    role: "",
    status: "",
    suspendedReason: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Profile fields editing states (เชื่อมโยง API ผู้ใช้ทั่วไป)
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // เก็บไฟล์รูปภาพและ URL Preview ก่อนกดยืนยันบันทึกการเปลี่ยนแปลง
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");

  // ป้ายบอกสถานะเปิดโหมดแก้ไขข้อมูลโปรไฟล์ (แก้ไข Username, Email, รูปโปรไฟล์)
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // ป้ายบอกสถานะเปิดโหมดแก้ไขรหัสผ่าน
  const [isEditingPassword, setIsEditingPassword] = useState(false);

  // Saving / Processing status
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Field validation and messages
  const [usernameMsg, setUsernameMsg] = useState({ type: "hint", text: "ใช้ตัวอักษร ตัวเลข และ _ ได้ ความยาว 3–50 ตัว" });
  const [emailMsg, setEmailMsg] = useState({ type: "hint", text: "" });

  // รายชื่อ Username ที่มีผู้อื่นใช้งานแล้วในระบบ (เริ่มต้นจากค่า seed มาตรฐานของระบบ)
  const [takenUsernames, setTakenUsernames] = useState([
    "admin_master",
    "dark_john",
    "alice_reader",
    "mi____kry",
    "maymay",
    "jane_writer"
  ]);

  // รายชื่ออีเมลที่มีผู้อื่นใช้งานสมัครสมาชิกแล้วในระบบ (เริ่มต้นจากค่า seed มาตรฐานของระบบ)
  const [takenEmails, setTakenEmails] = useState([
    "admin@novelverse.com",
    "john@novelverse.com",
    "alice@novelverse.com",
    "mike@novelverse.com",
    "testmay@gmail.com",
    "jane@novelverse.com"
  ]);

  // Security password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Password matching state
  const [pwMatchMsg, setPwMatchMsg] = useState({ type: "none", text: "" });

  // Notification preferences states (เชื่อมต่อ API จริง 100% ตาม Mapping ของเเต่ละ Toggle)
  const [notifChapter, setNotifChapter] = useState(true);      // novel_updates
  const [notifFollow, setNotifFollow] = useState(true);        // follows (นักเขียนที่ผู้ใช้ติดตาม เผยแพร่นิยายเรื่องใหม่)
  const [notifComment, setNotifComment] = useState(true);      // comments
  const [notifLike, setNotifLike] = useState(true);            // likes
  const [notifWriterFollow, setNotifWriterFollow] = useState(true); // follows (มีคนติดตามนักเขียน)
  const [notifSystem, setNotifSystem] = useState(true);        // in_app_notifications

  // Delete account states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deletePwMsg, setDeletePwMsg] = useState({ type: "hint", text: "กรอกรหัสผ่านเพื่อยืนยันตัวตนก่อนลบบัญชี" });

  // States สำหรับระบบครอบรูปภาพโปรไฟล์ (Cropper)
  const [avatarToCrop, setAvatarToCrop] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCroppingAvatar, setIsCroppingAvatar] = useState(false);

  // Active section for sidebar navigation highlights
  const [activeSection, setActiveSection] = useState("#profile");

  // Custom Toast State
  const [toast, setToast] = useState({ show: false, message: "", type: "info" });
  const toastTimeoutRef = useRef(null);

  // ------------------------------------------
  // Baseline States for Unsaved Changes detection
  // ------------------------------------------
  const [baseUsername, setBaseUsername] = useState("");
  const [baseEmail, setBaseEmail] = useState("");
  const [baseNotifChapter, setBaseNotifChapter] = useState(true);
  const [baseNotifFollow, setBaseNotifFollow] = useState(true);
  const [baseNotifComment, setBaseNotifComment] = useState(true);
  const [baseNotifLike, setBaseNotifLike] = useState(true);
  const [baseNotifWriterFollow, setBaseNotifWriterFollow] = useState(true);
  const [baseNotifSystem, setBaseNotifSystem] = useState(true);

  // States สำหรับกล่องแจ้งเตือน Unsved Changes ของเราเอง
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // คำนวณหาความเปลี่ยนแปลงที่ยังไม่ได้เซฟ (ดักกรณีที่อยู่ในโหมด Edit เท่านั้นสำหรับโปรไฟล์และรหัสผ่าน)
  const hasUnsavedChanges = 
    (isEditingProfile && (username !== baseUsername || email !== baseEmail || selectedAvatarFile !== null)) ||
    (isEditingPassword && (currentPassword !== "" || newPassword !== "" || confirmPassword !== "")) ||
    notifChapter !== baseNotifChapter ||
    notifComment !== baseNotifComment ||
    notifFollow !== baseNotifFollow ||
    notifLike !== baseNotifLike ||
    notifWriterFollow !== baseNotifWriterFollow ||
    notifSystem !== baseNotifSystem;

  // ------------------------------------------
  // Navigation Blocker (Native History popstate & Programmatic navigation intercept & Browser unload)
  // ------------------------------------------
  // 1. ดักการนำทางภายในแอป (เช่นการเรียกใช้ navigate() หรือเปลี่ยน URL บน React Router)
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const handleNavigationAttempt = (url) => {
      // ดักสัญญาณและจำลองฟังก์ชันที่จะรันเมื่อผู้ใช้ตอบตกลงไปต่อ
      setPendingNavigation(() => (bypassFlag = false) => {
        window.history.pushState = originalPushState;
        window.history.replaceState = originalReplaceState;
        navigate(url);
      });
      setIsUnsavedModalOpen(true);
    };

    // เขียนทับ pushState / replaceState ชั่วคราวเพื่อดักการกดเปลี่ยนหน้าใน Navbar/ปุ่มอื่นๆ
    window.history.pushState = function (state, title, url) {
      if (url && url !== window.location.pathname) {
        handleNavigationAttempt(url);
        return;
      }
      return originalPushState.apply(this, arguments);
    };

    window.history.replaceState = function (state, title, url) {
      if (url && url !== window.location.pathname) {
        handleNavigationAttempt(url);
        return;
      }
      return originalReplaceState.apply(this, arguments);
    };

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [hasUnsavedChanges, navigate]);

  // 2. ดักการกดปุ่มย้อนกลับของเบราว์เซอร์ (Back Button)
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handlePopState = (e) => {
      // แสดงป๊อปอัปดักความเปลี่ยนแปลงแทนเบราว์เซอร์
      setPendingNavigation(() => () => {
        // กดยืนยันย้อนกลับไปจริงๆ
        navigate(-1);
      });
      setIsUnsavedModalOpen(true);
      // ตรึงประวัติหน้าเดิมไว้
      window.history.pushState(null, "", window.location.pathname);
    };

    window.history.pushState(null, "", window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedChanges, navigate]);

  // 3. ป้องกันการปิด tab หรือรีเฟรชหน้าเบราว์เซอร์
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "คุณยังมีข้อมูลที่ไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ล้าง Memory URL Preview
  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  // ------------------------------------------
  // Toast Helper
  // ------------------------------------------
  const triggerToast = (message, type = "info") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast({ show: false, message: "", type: "info" });
    }, 3200);
  };

  // ------------------------------------------
  // Fetch User & Notification Settings Data
  // ------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login-register");
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    try {
      // 1. GET /api/users - โหลดข้อมูลผู้ใช้ปัจจุบัน
      const userRes = await fetch(`${API_BASE_URL}/api/users`, { headers });
      if (!userRes.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลบัญชีผู้ใช้งานได้");
      }
      const userData = await userRes.json();
      const userObj = userData?.user || {};

      setUserInfo({
        id: userObj.id || "",
        username: userObj.username || "",
        email: userObj.email || "",
        joinedAt: userObj.created_at || "",
        role: userObj.role || "",
        status: userObj.status || "",
        suspendedReason: userObj.suspended_reason || "",
      });

      setUsername(userObj.username || "");
      setEmail(userObj.email || "");
      setAvatarUrl(formatMinioUrl(userObj.pic_profile || userObj.avatar_url || ""));

      // บันทึกค่าเริ่มต้น Username & Email เพื่อเอาไว้เทียบ unsaved changes
      setBaseUsername(userObj.username || "");
      setBaseEmail(userObj.email || "");

      // ดึงรายชื่อผู้ใช้และอีเมลที่ถูกใช้งานแล้วเพิ่มเติมแบบไดนามิก
      // a) ดึงจากรายชื่อนักเขียนในนิยายทั้งหมดที่มีในระบบ
      try {
        const novelsRes = await fetch(`${API_BASE_URL}/novels`);
        if (novelsRes.ok) {
          const novelsData = await novelsRes.json();
          const list = novelsData?.data || novelsData || [];
          if (Array.isArray(list)) {
            const authorNames = list.map(n => n.author?.username).filter(Boolean);
            setTakenUsernames(prev => [...new Set([...prev, ...authorNames])]);
          }
        }
      } catch (e) {
        console.warn("ไม่สามารถโหลดรายชื่อนักเขียนเพิ่มเติมจากนิยายได้:", e);
      }

      // 2. GET /api/me/notification-settings - โหลดค่าความพึงพอใจการแจ้งเตือน
      try {
        const notifRes = await fetch(`${API_BASE_URL}/api/me/notification-settings`, { headers });
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          const settings = notifData?.data || notifData || {};
          const novelUpdatesVal = settings.novel_updates !== false;
          const commentsVal = settings.comments !== false;
          const followsVal = settings.follows !== false;
          const likesVal = settings.likes !== false;
          const systemVal = settings.in_app_notifications !== false;

          setNotifSystem(systemVal);
          setNotifChapter(novelUpdatesVal);
          setNotifComment(commentsVal);
          setNotifLike(likesVal);
          setNotifFollow(followsVal);
          setNotifWriterFollow(followsVal); // mapping follows to both

          setBaseNotifSystem(systemVal);
          setBaseNotifChapter(novelUpdatesVal);
          setBaseNotifComment(commentsVal);
          setBaseNotifLike(likesVal);
          setBaseNotifFollow(followsVal);
          setBaseNotifWriterFollow(followsVal);
        } else {
          // หากไม่มีแถวข้อมูล หรือตอบรับมีปัญหา เช่น 404 ให้ใช้ Default true ทั้งหมด
          setNotifSystem(true);
          setNotifChapter(true);
          setNotifComment(true);
          setNotifLike(true);
          setNotifFollow(true);
          setNotifWriterFollow(true);

          setBaseNotifSystem(true);
          setBaseNotifChapter(true);
          setBaseNotifComment(true);
          setBaseNotifLike(true);
          setBaseNotifFollow(true);
          setBaseNotifWriterFollow(true);
        }
      } catch (e) {
        console.warn("ไม่สามารถโหลดประวัติการแจ้งเตือนได้:", e);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลบัญชี");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ------------------------------------------
  // Keyboard Support for Modal
  // ------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsDeleteModalOpen(false);
        setDeletePassword("");
        setIsUnsavedModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ------------------------------------------
  // Sidebar Nav Highlighting & Scrolling
  // ------------------------------------------
  // ------------------------------------------
  // Sidebar Nav Highlighting & Tab selection
  // ------------------------------------------
  const handleScrollTo = (id) => {
    if (id === activeSection) return false;
    if (hasUnsavedChanges) {
      setPendingNavigation(() => () => {
        setActiveSection(id);
      });
      setIsUnsavedModalOpen(true);
      return false;
    }
    setActiveSection(id);
    return false;
  };

  // ------------------------------------------
  // Discard All Unsaved Drafts Helper
  // ------------------------------------------
  const handleDiscardAllUnsaved = () => {
    // 1. ยกเลิกการแก้ไขโปรไฟล์
    handleCancelEditProfile();

    // 2. ยกเลิกการแก้ไขรหัสผ่าน
    handleCancelEditPassword();

    // 3. รีเซ็ตการตั้งค่าการแจ้งเตือนกลับสลักเดิม
    setNotifChapter(baseNotifChapter);
    setNotifFollow(baseNotifFollow);
    setNotifComment(baseNotifComment);
    setNotifLike(baseNotifLike);
    setNotifWriterFollow(baseNotifWriterFollow);
    setNotifSystem(baseNotifSystem);

    // 4. ปิดโมดัล
    setIsUnsavedModalOpen(false);
  };

  // ------------------------------------------
  // Cancel Edit Profile / Password Handlers
  // ------------------------------------------
  const handleCancelEditProfile = () => {
    setIsEditingProfile(false);
    setUsername(baseUsername);
    setEmail(baseEmail);
    setSelectedAvatarFile(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl("");
    }
    // รีเซ็ตข้อความ Validate
    setUsernameMsg({ type: "hint", text: "ใช้ตัวอักษร ตัวเลข และ _ ได้ ความยาว 3–50 ตัว" });
    setEmailMsg({ type: "hint", text: "" });
  };

  const handleCancelEditPassword = () => {
    setIsEditingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwMatchMsg({ type: "none", text: "" });
  };

  // ------------------------------------------
  // Validation Logic
  // ------------------------------------------
  const validateUsername = (val) => {
    setUsername(val);
    if (!val) {
      setUsernameMsg({ type: "hint", text: "ใช้ตัวอักษร ตัวเลข และ _ ได้ ความยาว 3–50 ตัว" });
      return;
    }

    // หากพิมพ์ Username ที่ซ้ำกับที่ระบบระบุว่าใช้งานไม่ได้ (และไม่ใช่ชื่อเดิมของตนเอง)
    if (takenUsernames.includes(val) && val !== baseUsername) {
      setUsernameMsg({ type: "err", text: "ชื่อบัญชีนี้มีคนใช้แล้ว" });
      return;
    }

    const ok = /^[a-zA-Z0-9_]{3,50}$/.test(val);
    if (ok) {
      if (val === baseUsername) {
        setUsernameMsg({ type: "ok", text: "ชื่อผู้ใช้ปัจจุบันของคุณ" });
      } else {
        setUsernameMsg({ type: "ok", text: "รูปแบบชื่อผู้ใช้ถูกต้อง" });
      }
    } else {
      setUsernameMsg({ type: "err", text: "ใช้ได้แค่ A–Z, a–z, 0–9, _ ความยาว 3–50 ตัว" });
    }
  };

  const validateEmail = (val) => {
    setEmail(val);
    if (!val) {
      setEmailMsg({ type: "hint", text: "" });
      return;
    }

    // หากพิมพ์ Email ที่ซ้ำกับที่ระบบระบุว่าใช้งานไม่ได้ (และไม่ใช่อีเมลเดิมของตนเอง)
    if (takenEmails.includes(val) && val !== baseEmail) {
      setEmailMsg({ type: "err", text: "อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว" });
      return;
    }

    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if (ok) {
      if (val === baseEmail) {
        setEmailMsg({ type: "ok", text: "อีเมลปัจจุบันของคุณ" });
      } else {
        setEmailMsg({ type: "ok", text: "รูปแบบอีเมลถูกต้อง" });
      }
    } else {
      setEmailMsg({ type: "err", text: "รูปแบบอีเมลไม่ถูกต้อง" });
    }
  };

  // ------------------------------------------
  // Password Strength Logic
  // ------------------------------------------
  const pwRules = [
    { id: "r-len", label: "อย่างน้อย 8 ตัวอักษร", test: (v) => v.length >= 8 },
    { id: "r-upper", label: "ตัวพิมพ์ใหญ่ (A–Z)", test: (v) => /[A-Z]/.test(v) },
    { id: "r-num", label: "ตัวเลข (0–9)", test: (v) => /[0-9]/.test(v) },
  ];

  const pwLevels = [
    { label: "ปานกลาง", color: "#F59E0B", cls: "active-fair" },
    { label: "ดี", color: "#22C55E", cls: "active-good" },
    { label: "แข็งแกร่ง", color: "#15803D", cls: "active-strong" },
  ];

  const getPwStrength = () => {
    if (!newPassword) return null;
    const passed = pwRules.filter((r) => r.test(newPassword)).length;
    const level = pwLevels[Math.max(0, passed - 1)];
    return { passed, level };
  };

  const checkPwMatch = (confVal) => {
    setConfirmPassword(confVal);
    if (!confVal) {
      setPwMatchMsg({ type: "none", text: "" });
      return;
    }
    if (newPassword === confVal) {
      setPwMatchMsg({ type: "ok", text: "รหัสผ่านตรงกันเรียบร้อย" });
    } else {
      setPwMatchMsg({ type: "err", text: "รหัสผ่านไม่ตรงกัน" });
    }
  };

  // ------------------------------------------
  // User Profile Picture Selection (ดักเก็บในสเตตัสพรีวิว ไม่เปลี่ยนในแถบเมนูจนกว่าจะกดบันทึก)
  // ------------------------------------------
  const handleAvatarSelect = (e) => {
    if (!isEditingProfile) return; // ทำงานเฉพาะเมื่ออยู่ในโหมดแก้ไขเท่านั้น
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setAvatarToCrop(url);
    if (e.target) e.target.value = "";
  };

  const handleSaveAvatarCrop = async () => {
    if (!avatarToCrop || !croppedAreaPixels) return;
    setIsCroppingAvatar(true);
    try {
      const { file, url } = await getCroppedImg(avatarToCrop, croppedAreaPixels);
      setSelectedAvatarFile(file);
      setAvatarPreviewUrl(url);
      setAvatarToCrop(null); // ปิดหน้าต่างครอบรูป
    } catch (e) {
      console.error("Error cropping avatar:", e);
      triggerToast("เกิดข้อผิดพลาดในการปรับขนาดรูปภาพ", "error");
    } finally {
      setIsCroppingAvatar(false);
    }
  };

  // ------------------------------------------
  // Save Username & Email & Avatar Changes (API PATCH จริง อัปเดตเมนูเมื่อบันทึกแล้วเท่านั้น)
  // ------------------------------------------
  const handleSaveProfile = async () => {
    // 1. ตรวจสอบสถานะข้อความแจ้งเตือน (ความซ้ำ / ผิดรูปแบบ)
    if (usernameMsg.type === "err") {
      triggerToast(usernameMsg.text || "ชื่อผู้ใช้ไม่ถูกต้องหรือมีผู้ใช้งานแล้ว", "error");
      return;
    }
    if (emailMsg.type === "err") {
      triggerToast(emailMsg.text || "อีเมลไม่ถูกต้องหรือมีผู้ใช้งานแล้ว", "error");
      return;
    }

    // ตรวจสอบเงื่อนไข Username
    const userOk = /^[a-zA-Z0-9_]{3,50}$/.test(username);
    if (!userOk) {
      triggerToast("กรุณากรอกชื่อผู้ใช้ให้ถูกต้องตามรูปแบบ", "error");
      return;
    }

    // ตรวจสอบรูปแบบอีเมล
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      triggerToast("กรุณากรอกอีเมลให้ถูกต้องตามรูปแบบ", "error");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    setIsSavingProfile(true);

    try {
      let currentAvatarUrl = avatarUrl;

      // 1. อัปโหลดรูปภาพใหม่ (หากมีการคลิกเลือกรูปภาพโปรไฟล์เข้ามาใหม่)
      if (selectedAvatarFile) {
        const formData = new FormData();
        formData.append("profileImage", selectedAvatarFile, "avatar.jpg");

        const avatarRes = await fetch(`${API_BASE_URL}/api/me/profile-picture`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        if (!avatarRes.ok) {
          throw new Error("อัปโหลดรูปภาพโปรไฟล์ใหม่ล้มเหลว");
        }

        const avatarData = await avatarRes.json();
        const uploadedUrl = avatarData?.pic_profile || avatarData?.data?.pic_profile || "";
        if (uploadedUrl) {
          currentAvatarUrl = uploadedUrl;
          setAvatarUrl(uploadedUrl);
        }
      }

      let isUsernameChanged = username !== baseUsername;
      let isEmailChanged = email !== baseEmail;

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // 2. PATCH /api/me/username - เปลี่ยนชื่อผู้ใช้
      if (isUsernameChanged) {
        const userUpdateRes = await fetch(`${API_BASE_URL}/api/me/username`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ username }),
        });

        if (!userUpdateRes.ok) {
          const status = userUpdateRes.status;
          if (status === 409) {
            setTakenUsernames((prev) => {
              if (prev.includes(username)) return prev;
              return [...prev, username];
            });
            setUsernameMsg({ type: "err", text: "ชื่อบัญชีนี้มีคนใช้แล้ว" });
            throw new Error("ชื่อบัญชีนี้มีคนใช้แล้ว");
          } else if (status === 400) {
            setUsernameMsg({ type: "err", text: "ใช้ได้แค่ A–Z, a–z, 0–9, _ ความยาว 3–50 ตัว" });
            throw new Error("รูปแบบชื่อผู้ใช้ไม่ถูกต้อง");
          }
          const errorText = await userUpdateRes.text();
          throw new Error(errorText || "ไม่สามารถเปลี่ยนชื่อผู้ใช้ได้");
        }
      }

      // 3. PATCH /api/me/email - เปลี่ยนอีเมล
      if (isEmailChanged) {
        const emailUpdateRes = await fetch(`${API_BASE_URL}/api/me/email`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ email }),
        });

        if (!emailUpdateRes.ok) {
          const status = emailUpdateRes.status;
          if (status === 409) {
            setTakenEmails((prev) => {
              if (prev.includes(email)) return prev;
              return [...prev, email];
            });
            setEmailMsg({ type: "err", text: "อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว" });
            throw new Error("อีเมลนี้ถูกใช้สมัครบัญชีอื่นแล้ว");
          } else if (status === 400) {
            setEmailMsg({ type: "err", text: "รูปแบบอีเมลไม่ถูกต้องตามเกณฑ์" });
            throw new Error("รูปแบบอีเมลไม่ถูกต้องตามเกณฑ์");
          }
          const errorText = await emailUpdateRes.text();
          throw new Error(errorText || "ไม่สามารถเปลี่ยนอีเมลล็อกอินได้");
        }
      }

      // อัปเดตข้อมูลทั้งหมดลงใน localStorage และส่ง Event อัปเดตข้อมูลเมนูบาร์ Navbar ด้านบนพร้อมรูปโปรไฟล์
      const localUserStr = localStorage.getItem("user");
      if (localUserStr && (isUsernameChanged || isEmailChanged || selectedAvatarFile)) {
        const u = JSON.parse(localUserStr);
        if (isUsernameChanged) u.username = username;
        if (isEmailChanged) u.email = email;
        if (selectedAvatarFile) {
          u.pic_profile = currentAvatarUrl;
          u.avatar_url = currentAvatarUrl;
        }
        localStorage.setItem("user", JSON.stringify(u));
        window.dispatchEvent(new Event("storage"));
        window.dispatchEvent(new Event("auth-change"));
      }

      // ปิดโหมดแก้ไขและอัปเดต baseline เพื่อรีเซ็ตสถานะแจ้งเตือนการเปลี่ยนแปลง
      setTakenUsernames((prev) => prev.filter(u => u !== baseUsername && u !== username));
      setTakenEmails((prev) => prev.filter(e => e !== baseEmail && e !== email));
      setBaseUsername(username);
      setBaseEmail(email);
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      setIsEditingProfile(false);

      triggerToast("บันทึกการเปลี่ยนแปลงบัญชีเรียบร้อยแล้วค่ะ", "success");
      fetchData(); // รีเฟรชข้อมูล

    } catch (err) {
      console.error(err);
      triggerToast(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ------------------------------------------
  // Save Password Change (PATCH /api/me/password)
  // ------------------------------------------
  const handleSavePassword = async () => {
    if (!currentPassword) {
      triggerToast("กรุณากรอกรหัสผ่านปัจจุบันก่อนเปลี่ยน", "error");
      return;
    }
    if (!newPassword) {
      triggerToast("กรุณากรอกรหัสผ่านใหม่", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      triggerToast("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน", "error");
      return;
    }

    const strength = getPwStrength();
    if (strength && strength.passed < 2) {
      triggerToast("รหัสผ่านใหม่ของท่านยังอ่อนแอเกินไป กรุณาเพิ่มความปลอดภัย", "error");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    setIsSavingPassword(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/me/password`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });

      if (!res.ok) {
        const status = res.status;
        const errText = await res.text();
        if (status === 401 || errText.includes("current password is incorrect")) {
          throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
        } else if (status === 400) {
          throw new Error(errText || "ข้อมูลรหัสผ่านใหม่ไม่ถูกต้องตามเกณฑ์เงื่อนไข");
        }
        throw new Error(errText || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
      }

      localStorage.setItem("pw_len", String(newPassword.length));
      triggerToast("เปลี่ยนรหัสผ่านของคุณเรียบร้อยแล้วค่ะ", "success");
      handleCancelEditPassword(); // ปิดโหมดแก้ไขและเคลียร์ฟิลด์ทั้งหมด
    } catch (err) {
      console.error(err);
      triggerToast(err.message || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน", "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  // ------------------------------------------
  // Save Notification settings (PATCH /api/me/notification-settings)
  // ------------------------------------------
  const handleSaveNotifications = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setIsSavingNotifications(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/me/notification-settings`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          in_app_notifications: notifSystem,
          novel_updates: notifChapter,
          comments: notifComment,
          likes: notifLike,
          follows: notifFollow && notifWriterFollow // map to follows column
        })
      });

      if (!res.ok) {
        throw new Error("ไม่สามารถบันทึกการแจ้งเตือนได้");
      }

      // อัปเดต baseline เพื่อรีเซ็ตสถานะแจ้งเตือนการเปลี่ยนแปลง
      setBaseNotifSystem(notifSystem);
      setBaseNotifChapter(notifChapter);
      setBaseNotifComment(notifComment);
      setBaseNotifLike(notifLike);
      setBaseNotifFollow(notifFollow);
      setBaseNotifWriterFollow(notifWriterFollow);

      triggerToast("บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้วค่ะ", "success");
    } catch (err) {
      console.error(err);
      triggerToast(err.message || "เกิดข้อผิดพลาดในการบันทึกการแจ้งเตือน", "error");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  // ------------------------------------------
  // Save All Changes Helper (สำหรับการกดผ่านทางป๊อปอัปแจ้งเตือน Unsaved Changes)
  // ------------------------------------------
  const handleSaveAllUnsaved = async () => {
    const token = localStorage.getItem("token");
    if (!token) return false;

    const isProfileInfoChanged = isEditingProfile && (username !== baseUsername || email !== baseEmail || selectedAvatarFile !== null);
    const isPasswordChanged = isEditingPassword && (currentPassword !== "" || newPassword !== "" || confirmPassword !== "");
    const isNotifSettingChanged = 
      notifChapter !== baseNotifChapter ||
      notifComment !== baseNotifComment ||
      notifFollow !== baseNotifFollow ||
      notifLike !== baseNotifLike ||
      notifWriterFollow !== baseNotifWriterFollow ||
      notifSystem !== baseNotifSystem;

    try {
      // 1. บันทึกข้อมูลโปรไฟล์และรูปภาพ
      if (isProfileInfoChanged) {
        let currentAvatarUrl = avatarUrl;
        
        if (selectedAvatarFile) {
          const formData = new FormData();
          formData.append("profileImage", selectedAvatarFile, "avatar.jpg");

          const avatarRes = await fetch(`${API_BASE_URL}/api/me/profile-picture`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          });

          if (avatarRes.ok) {
            const avatarData = await avatarRes.json();
            currentAvatarUrl = avatarData?.pic_profile || avatarData?.data?.pic_profile || "";
            setAvatarUrl(currentAvatarUrl);
          }
        }

        const isUsernameChanged = username !== baseUsername;
        const isEmailChanged = email !== baseEmail;
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        if (isUsernameChanged) {
          const userUpdateRes = await fetch(`${API_BASE_URL}/api/me/username`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ username }),
          });
          if (!userUpdateRes.ok) {
            const status = userUpdateRes.status;
            if (status === 409) {
              setTakenUsernames((prev) => {
                if (prev.includes(username)) return prev;
                return [...prev, username];
              });
              setUsernameMsg({ type: "err", text: "ชื่อบัญชีนี้มีคนใช้แล้ว" });
              throw new Error("ชื่อบัญชีนี้มีคนใช้แล้ว");
            } else if (status === 400) {
              setUsernameMsg({ type: "err", text: "ใช้ได้แค่ A–Z, a–z, 0–9, _ ความยาว 3–50 ตัว" });
              throw new Error("รูปแบบชื่อผู้ใช้ไม่ถูกต้อง");
            }
            throw new Error("ไม่สามารถเปลี่ยนชื่อผู้ใช้ได้");
          }
        }

        if (isEmailChanged) {
          const emailUpdateRes = await fetch(`${API_BASE_URL}/api/me/email`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ email }),
          });
          if (!emailUpdateRes.ok) {
            const status = emailUpdateRes.status;
            if (status === 409) {
              setTakenEmails((prev) => {
                if (prev.includes(email)) return prev;
                return [...prev, email];
              });
              setEmailMsg({ type: "err", text: "อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว" });
              throw new Error("อีเมลนี้ถูกใช้งานแล้ว");
            } else if (status === 400) {
              setEmailMsg({ type: "err", text: "รูปแบบอีเมลไม่ถูกต้องตามเกณฑ์" });
              throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
            }
            throw new Error("ไม่สามารถเปลี่ยนอีเมลได้");
          }
        }

        const localUserStr = localStorage.getItem("user");
        if (localUserStr && (isUsernameChanged || isEmailChanged || selectedAvatarFile)) {
          const u = JSON.parse(localUserStr);
          if (isUsernameChanged) u.username = username;
          if (isEmailChanged) u.email = email;
          if (selectedAvatarFile) {
            u.pic_profile = currentAvatarUrl;
            u.avatar_url = currentAvatarUrl;
          }
          localStorage.setItem("user", JSON.stringify(u));
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new Event("auth-change"));
        }

        setTakenUsernames((prev) => prev.filter(u => u !== baseUsername && u !== username));
        setTakenEmails((prev) => prev.filter(e => e !== baseEmail && e !== email));
        setBaseUsername(username);
        setBaseEmail(email);
        setSelectedAvatarFile(null);
        setAvatarPreviewUrl("");
        setIsEditingProfile(false);
      }

      // 2. บันทึกข้อมูลการเปลี่ยนรหัสผ่าน (หากมี)
      if (isPasswordChanged) {
        const passwordRes = await fetch(`${API_BASE_URL}/api/me/password`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
          })
        });

        if (!passwordRes.ok) {
          const status = passwordRes.status;
          const errText = await passwordRes.text();
          if (status === 401 || errText.includes("current password is incorrect")) {
            throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
          }
          throw new Error("ไม่สามารถบันทึกรหัสผ่านใหม่ได้");
        }

        handleCancelEditPassword();
      }

      // 3. บันทึกการตั้งค่าการแจ้งเตือน
      if (isNotifSettingChanged) {
        await fetch(`${API_BASE_URL}/api/me/notification-settings`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            in_app_notifications: notifSystem,
            novel_updates: notifChapter,
            comments: notifComment,
            likes: notifLike,
            follows: notifFollow && notifWriterFollow
          })
        });

        setBaseNotifSystem(notifSystem);
        setBaseNotifChapter(notifChapter);
        setBaseNotifComment(notifComment);
        setBaseNotifLike(notifLike);
        setBaseNotifFollow(notifFollow);
        setBaseNotifWriterFollow(notifWriterFollow);
      }

      triggerToast("บันทึกการตั้งค่าบัญชีเรียบร้อยแล้วค่ะ", "success");
      return true;
    } catch (e) {
      console.error("การแจ้งบันทึกข้อมูลล้มเหลว:", e);
      triggerToast(e.message || "ไม่สามารถบันทึกข้อมูลความปลอดภัยหรือโปรไฟล์ได้อัตโนมัติ", "error");
      return false;
    }
  };

  // ------------------------------------------
  // Confirm Delete Account (DELETE /api/me)
  // ------------------------------------------
  const handleConfirmDeleteAccount = async () => {
    if (!deletePassword) {
      setDeletePwMsg({ type: "err", text: "กรุณากรอกรหัสผ่านเพื่อยืนยันสิทธิ์ลบบัญชี" });
      return;
    }
    
    const token = localStorage.getItem("token");
    if (!token) return;

    setIsDeletingAccount(true);
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          current_password: deletePassword
        })
      });

      if (!res.ok) {
        const status = res.status;
        const errText = await res.text();
        if (status === 401 || errText.includes("current password is incorrect")) {
          throw new Error("รหัสผ่านไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง");
        } else if (status === 409 || errText.includes("ต้องระงับบัญชีแทนการลบ")) {
          throw new Error("ไม่สามารถลบบัญชีถาวรได้เนื่องจากมีนิยายเผยแพร่อยู่ในระบบ (กรุณาจัดการระงับเรื่องหรือติดต่อนักพัฒนา)");
        }
        throw new Error(errText || "ไม่สามารถดำเนินการลบบัญชีได้");
      }

      setIsDeleteModalOpen(false);
      triggerToast("ลบบัญชีของคุณสำเร็จแล้ว กำลังนำท่านออกจากระบบ...", "success");
      setDeletePassword("");
      
      setTimeout(() => {
        localStorage.clear();
        window.location.href = "/";
      }, 2000);

    } catch (err) {
      console.error(err);
      setDeletePwMsg({ type: "err", text: err.message || "เกิดข้อผิดพลาดในการลบบัญชี" });
      triggerToast(err.message || "เกิดข้อผิดพลาดในการลบบัญชี", "error");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const letterAvatar = username ? username.charAt(0).toUpperCase() : "U";
  const strengthInfo = getPwStrength();

  if (loading) {
    return <LoadingScreen message="กำลังโหลดข้อมูลการตั้งค่าบัญชี..." />;
  }

  if (error) {
    return (
      <div className="wst-page-container">
        <div className="wst-error-card">
          <p className="wst-error-text">❌ {error}</p>
          <button className="btn btn-pink" onClick={fetchData}>
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wst-page-container">
      {/* Toast Alert */}
      <div id="wst-toast" className={`toast ${toast.show ? "show" : ""} ${toast.type}`}>
        <i className={
          toast.type === "success" ? "ti ti-check-circle" : 
          toast.type === "error" ? "ti ti-alert-circle" : "ti ti-info-circle"
        } aria-hidden="true" />
        <span id="toast-msg">{toast.message}</span>
      </div>

      {/* Hidden file input for avatar upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleAvatarSelect} 
        accept="image/*" 
        style={{ display: "none" }} 
      />

      <div className="page-wrap">
        <div className="page-header">
          <h1 className="page-title">ตั้งค่าบัญชี</h1>
          <p className="page-sub">จัดการข้อมูลบัญชี การแจ้งเตือน และความปลอดภัยบัญชีของคุณ</p>
        </div>

        <div className="layout">
          {/* 🟢 Sidebar นำทาง */}
          <nav className="side-nav" aria-label="ตั้งค่า">
            <a 
              className={`side-nav-item ${activeSection === "#profile" ? "on" : ""}`} 
              href="#profile" 
              onClick={(e) => { e.preventDefault(); handleScrollTo("#profile"); }}
            >
              <i className="ti ti-user-circle" aria-hidden="true"></i>ข้อมูลบัญชี
            </a>
            <a 
              className={`side-nav-item ${activeSection === "#security" ? "on" : ""}`} 
              href="#security" 
              onClick={(e) => { e.preventDefault(); handleScrollTo("#security"); }}
            >
              <i className="ti ti-shield-lock" aria-hidden="true"></i>ความปลอดภัย
            </a>
            <a 
              className={`side-nav-item ${activeSection === "#notifications" ? "on" : ""}`} 
              href="#notifications" 
              onClick={(e) => { e.preventDefault(); handleScrollTo("#notifications"); }}
            >
              <i className="ti ti-bell" aria-hidden="true"></i>การแจ้งเตือน
            </a>
            <div className="side-nav-sep"></div>
            <a 
              className={`side-nav-item ${activeSection === "#danger" ? "on" : ""}`} 
              href="#danger" 
              onClick={(e) => { e.preventDefault(); handleScrollTo("#danger"); }}
              style={{ color: "var(--red)" }}
            >
              <i className="ti ti-trash" style={{ color: "var(--red)" }} aria-hidden="true"></i>ลบบัญชี
            </a>
          </nav>

          {/* 🟢 Main Content */}
          <div className="wst-main-content">
            
            {/* ════ 1. PROFILE ════ */}
            {activeSection === "#profile" && (
              <section className="card" id="profile">
              <div className="card-header">
                <div className="card-icon purple"><i className="ti ti-user-circle" aria-hidden="true"></i></div>
                <div>
                  <div className="card-title">ข้อมูลบัญชี</div>
                  <div className="card-sub">ข้อมูลโปรไฟล์และรายละเอียดบัญชีของคุณ</div>
                </div>
              </div>
              
              <div className="card-body">
                {/* Avatar & Meta info */}
                <div className="profile-row">
                  <div className="avatar-wrap">
                    <div 
                      className={`avatar ${isEditingProfile ? "editable" : ""}`}
                      onClick={() => isEditingProfile && fileInputRef.current && fileInputRef.current.click()} 
                      title={isEditingProfile ? "คลิกอัปโหลดรูปโปรไฟล์" : "ข้อมูลบัญชีส่วนตัว"} 
                      role={isEditingProfile ? "button" : "img"} 
                      tabIndex={isEditingProfile ? "0" : "-1"}
                    >
                      {avatarPreviewUrl ? (
                        <img 
                          src={avatarPreviewUrl} 
                          alt={username} 
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                        />
                      ) : avatarUrl ? (
                        <img 
                          src={avatarUrl.replace("http://minio:9000", "http://localhost:9000")} 
                          alt={username} 
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                        />
                      ) : (
                        letterAvatar
                      )}
                      {isEditingProfile && (
                        <div className="avatar-overlay"><i className="ti ti-camera" aria-hidden="true"></i></div>
                      )}
                    </div>
                    {isEditingProfile && (
                      <div className="avatar-hint">กดเปลี่ยนรูป</div>
                    )}
                  </div>
                  
                  <div className="profile-meta">
                    <div className="profile-name">{username || "ผู้ใช้งาน"}</div>
                    <div className="profile-email">{userInfo.email || "ไม่มีข้อมูลอีเมล"}</div>
                    <div className="profile-date">
                      <i className="ti ti-calendar" aria-hidden="true"></i>
                      สมาชิกตั้งแต่: {formatDate(userInfo.joinedAt)}
                    </div>
                  </div>
                </div>

                {/* Username Field */}
                <div className="field">
                  <div className="label">
                    ชื่อผู้ใช้ (Username)
                  </div>
                  <div className="input-wrap">
                    <input 
                      className={`input ${!isEditingProfile ? "readonly-input" : "editable-input"} ${usernameMsg.type === "ok" ? "ok" : usernameMsg.type === "err" ? "err" : ""}`}
                      type="text" 
                      value={username}
                      onChange={(e) => validateUsername(e.target.value)}
                      placeholder="Username ของคุณ"
                      autoComplete="username"
                      maxLength={50}
                      disabled={!isEditingProfile}
                    />
                  </div>
                  {isEditingProfile && (
                    <div className={`field-msg ${usernameMsg.type}`}>
                      <i className={usernameMsg.type === "ok" ? "ti ti-circle-check" : usernameMsg.type === "err" ? "ti ti-x" : "ti ti-info-circle"} aria-hidden="true"></i>
                      {usernameMsg.text}
                    </div>
                  )}
                </div>

                {/* Email Login Field */}
                <div className="field">
                  <div className="label">
                    อีเมล (Email)
                  </div>
                  <div className="input-wrap">
                    <input 
                      className={`input ${!isEditingProfile ? "readonly-input" : "editable-input"} ${emailMsg.type === "ok" ? "ok" : emailMsg.type === "err" ? "err" : ""}`}
                      type="email" 
                      value={email}
                      onChange={(e) => validateEmail(e.target.value)}
                      placeholder="example@mail.com"
                      autoComplete="email"
                      disabled={!isEditingProfile}
                    />
                  </div>
                  {isEditingProfile && emailMsg.text && (
                    <div className={`field-msg ${emailMsg.type}`}>
                      <i className={emailMsg.type === "ok" ? "ti ti-circle-check" : "ti ti-x"} aria-hidden="true"></i>
                      {emailMsg.text}
                    </div>
                  )}
                </div>

                {/* Role (Read-only) */}
                <div className="field">
                  <div className="label">
                    บทบาท (Role)
                    {isEditingProfile && <span className="readonly-badge">(ไม่สามารถแก้ไขได้)</span>}
                  </div>
                  <div className="input-wrap">
                    <input 
                      className="input readonly-input"
                      type="text" 
                      value={
                        userInfo.role === "writer" ? "นักเขียน (Writer)" :
                        userInfo.role === "reader" ? "นักอ่าน (Reader)" :
                        userInfo.role === "admin" ? "ผู้ดูแลระบบ (Admin)" :
                        userInfo.role || "ทั่วไป"
                      }
                      disabled
                    />
                  </div>
                </div>

                {/* Status (Read-only) */}
                <div className="field">
                  <div className="label">
                    สถานะบัญชี (Status)
                    {isEditingProfile && <span className="readonly-badge">(ไม่สามารถแก้ไขได้)</span>}
                  </div>
                  <div className="input-wrap">
                    <input 
                      className="input readonly-input"
                      type="text" 
                      value={
                        userInfo.status === "active" ? "ปกติ (Active)" :
                        userInfo.status === "suspended" ? "ถูกระงับการใช้งาน (Suspended)" :
                        userInfo.status || "ปกติ"
                      }
                      disabled
                    />
                  </div>
                </div>

                {/* Suspended Reason (Read-only, แสดงเมื่อถูกระงับและมีเหตุผลประกอบ) */}
                {userInfo.suspendedReason && (
                  <div className="field">
                    <div className="label" style={{ color: "var(--red)" }}>เหตุผลที่ถูกระงับการใช้งาน (Suspended Reason)</div>
                    <div className="input-wrap">
                      <input 
                        className="input readonly-input"
                        type="text" 
                        value={userInfo.suspendedReason}
                        disabled
                        style={{ color: "var(--red)", borderColor: "var(--red-bd)", background: "var(--red-bg)" }}
                      />
                    </div>
                  </div>
                )}

                <div className="btn-row">
                  {!isEditingProfile ? (
                    <button className="btn btn-pink" onClick={() => setIsEditingProfile(true)}>
                      <i className="ti ti-edit" aria-hidden="true"></i>
                      แก้ไขข้อมูล
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-outline" onClick={handleCancelEditProfile} disabled={isSavingProfile}>ยกเลิก</button>
                      <button className="btn btn-pink" onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? (
                          <>
                            <div className="wst-loading-spinner wst-spinner-sm"></div>
                            กำลังบันทึก...
                          </>
                        ) : (
                          <>
                            <i className="ti ti-check" aria-hidden="true"></i>
                            บันทึกการเปลี่ยนแปลง
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>
            )}

            {/* ════ 2. SECURITY ════ */}
            {activeSection === "#security" && (
              <section className="card" id="security">
              <div className="card-header">
                <div className="card-icon indigo"><i className="ti ti-shield-lock" aria-hidden="true"></i></div>
                <div>
                  <div className="card-title">ความปลอดภัย </div>
                  <div className="card-sub">เปลี่ยนรหัสผ่านเพื่อความปลอดภัยของบัญชี</div>
                </div>
              </div>
              
              <div className="card-body">
                {!isEditingPassword ? (
                  <>
                    {/* แสดงข้อมูลแค่ รหัสผ่านปัจจุบัน ทำเป็นดอกจันไว้ก่อน ไม่สามารถดูได้ */}
                    <div className="field">
                      <div className="label">รหัสผ่านปัจจุบัน</div>
                      <div className="input-wrap">
                        <input 
                          className="input readonly-input" 
                          type="password" 
                          value="xxxxxxxx"
                          disabled
                        />
                      </div>
                    </div>

                    <div className="btn-row">
                      <button className="btn btn-pink" onClick={() => setIsEditingPassword(true)}>
                        <i className="ti ti-key" aria-hidden="true"></i>
                        เปลี่ยนรหัสผ่าน
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* รหัสผ่านปัจจุบัน (กรอกรหัสเดิมอีกครั้ง) */}
                    <div className="field">
                      <div className="label">กรอกรหัสผ่านปัจจุบันอีกครั้ง</div>
                      <div className="input-wrap">
                        <input 
                          className="input" 
                          type={showCurrentPw ? "text" : "password"} 
                          placeholder="กรอกรหัสผ่านเดิมเพื่อยืนยันตัวตน"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                        <span className="input-icon-right" onClick={() => setShowCurrentPw(!showCurrentPw)} title="แสดง/ซ่อน">
                          <i className={showCurrentPw ? "ti ti-eye-off" : "ti ti-eye"} aria-hidden="true"></i>
                        </span>
                      </div>
                    </div>

                    {/* รหัสผ่านใหม่ */}
                    <div className="field">
                      <div className="label">
                        รหัสผ่านใหม่
                        {strengthInfo && (
                          <span className="label-hint" style={{ fontWeight: 600, color: strengthInfo.level.color }}>
                            ระดับความปลอดภัย: {strengthInfo.level.label}
                          </span>
                        )}
                      </div>
                      <div className="input-wrap">
                        <input 
                          className="input" 
                          type={showNewPw ? "text" : "password"} 
                          placeholder="ความยาวอย่างน้อย 8 ตัวอักษร"
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); checkPwMatch(confirmPassword); }}
                          autoComplete="new-password"
                          style={{ paddingRight: "36px" }}
                        />
                        <span className="input-icon-right" onClick={() => setShowNewPw(!showNewPw)} title="แสดง/ซ่อน">
                          <i className={showNewPw ? "ti ti-eye-off" : "ti ti-eye"} aria-hidden="true"></i>
                        </span>
                      </div>

                      {/* Password strength indicators */}
                      {newPassword && strengthInfo && (
                        <div className="pw-strength">
                          <div className="pw-bars">
                            {[1, 2, 3].map((i) => (
                              <div 
                                key={i} 
                                className={`pw-bar ${i <= strengthInfo.passed ? strengthInfo.level.cls : ""}`} 
                              />
                            ))}
                          </div>
                          
                          {/* Password requirements checklist */}
                          <div className="pw-rules">
                            {pwRules.map((rule) => {
                              const ok = rule.test(newPassword);
                              return (
                                <div key={rule.id} className={`pw-rule ${ok ? "pass" : "fail"}`}>
                                  <i className={ok ? "ti ti-circle-check" : "ti ti-circle"} aria-hidden="true"></i>
                                  {rule.label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ยืนยันรหัสผ่านใหม่ */}
                    <div className="field">
                      <div className="label">ยืนยันรหัสผ่านใหม่</div>
                      <div className="input-wrap">
                        <input 
                          className={`input ${pwMatchMsg.type === "ok" ? "ok" : pwMatchMsg.type === "err" ? "err" : ""}`} 
                          type={showConfirmPw ? "text" : "password"} 
                          placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง"
                          value={confirmPassword}
                          onChange={(e) => checkPwMatch(e.target.value)}
                          autoComplete="new-password"
                          style={{ paddingRight: "36px" }}
                        />
                        <span className="input-icon-right" onClick={() => setShowConfirmPw(!showConfirmPw)} title="แสดง/ซ่อน">
                          <i className={showConfirmPw ? "ti ti-eye-off" : "ti ti-eye"} aria-hidden="true"></i>
                        </span>
                      </div>
                      {pwMatchMsg.text && (
                        <div className={`field-msg ${pwMatchMsg.type}`}>
                          <i className={pwMatchMsg.type === "ok" ? "ti ti-circle-check" : "ti ti-x"} aria-hidden="true"></i>
                          {pwMatchMsg.text}
                        </div>
                      )}
                    </div>

                    <div className="btn-row">
                      <button 
                        className="btn btn-outline" 
                        onClick={handleCancelEditPassword}
                        disabled={isSavingPassword}
                      >
                        ยกเลิก
                      </button>
                      <button className="btn btn-pink" onClick={handleSavePassword} disabled={isSavingPassword}>
                        {isSavingPassword ? (
                          <>
                            <div className="wst-loading-spinner wst-spinner-sm"></div>
                            กำลังบันทึก...
                          </>
                        ) : (
                          <>
                            <i className="ti ti-shield-check" aria-hidden="true"></i>
                            บันทึก
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </section>
            )}

            {/* ════ 3. NOTIFICATIONS ════ */}
            {activeSection === "#notifications" && (
              <section className="card" id="notifications">
              <div className="card-header">
                <div className="card-icon teal"><i className="ti ti-bell" aria-hidden="true"></i></div>
                <div>
                  <div className="card-title">การแจ้งเตือน</div>
                  <div className="card-sub">เลือกประเภทการแจ้งเตือนที่คุณต้องการรับ</div>
                </div>
              </div>
              
              <div className="card-body" style={{ paddingBottom: "18px" }}>
                {/* Toggle Rows */}
                {/* 1. novel_updates */}
                <div className="toggle-row">
                  <div className="toggle-icon"><i className="ti ti-book-2" aria-hidden="true"></i></div>
                  <div className="toggle-info">
                    <div className="toggle-label">อัปเดตนิยายในชั้นหนังสือ</div>
                    <div className="toggle-sub">แจ้งเตือนเมื่อนิยายในชั้นหนังสือของคุณมีตอนหรือฉากใหม่</div>
                  </div>
                  <label className="sw" aria-label="แจ้งเตือนนิยายอัปเดต">
                    <input 
                      type="checkbox" 
                      checked={notifChapter} 
                      onChange={(e) => setNotifChapter(e.target.checked)} 
                    />
                    <div className="sw-track"></div>
                  </label>
                </div>

                {/* 2. follows (นักเขียนที่ผู้ใช้ติดตาม เผยแพร่นิยายเรื่องใหม่) */}
                <div className="toggle-row">
                  <div className="toggle-icon"><i className="ti ti-user-plus" aria-hidden="true"></i></div>
                  <div className="toggle-info">
                    <div className="toggle-label">ผลงานใหม่จากนักเขียนที่ติดตาม</div>
                    <div className="toggle-sub">แจ้งเตือนเมื่อนักเขียนที่คุณติดตามเผยแพร่นิยายเรื่องใหม่</div>
                  </div>
                  <label className="sw" aria-label="แจ้งเตือนนักเขียนอัปเดต">
                    <input 
                      type="checkbox" 
                      checked={notifFollow} 
                      onChange={(e) => setNotifFollow(e.target.checked)} 
                    />
                    <div className="sw-track"></div>
                  </label>
                </div>

                {/* 3. comments */}
                {(userInfo.role === "writer" || userInfo.role === "admin") && (
                  <div className="toggle-row">
                    <div className="toggle-icon"><i className="ti ti-message-circle" aria-hidden="true"></i></div>
                    <div className="toggle-info">
                      <div className="toggle-label">ความคิดเห็นใหม่</div>
                      <div className="toggle-sub">แจ้งเตือนเมื่อมีผู้อื่นแสดงความคิดเห็นในนิยายของคุณ</div>
                    </div>
                    <label className="sw" aria-label="แจ้งเตือนคอมเมนต์">
                      <input 
                        type="checkbox" 
                        checked={notifComment} 
                        onChange={(e) => setNotifComment(e.target.checked)} 
                      />
                      <div className="sw-track"></div>
                    </label>
                  </div>
                )}

                {/* 4. likes */}
                {(userInfo.role === "writer" || userInfo.role === "admin") && (
                  <div className="toggle-row">
                    <div className="toggle-icon"><i className="ti ti-heart" aria-hidden="true"></i></div>
                    <div className="toggle-info">
                      <div className="toggle-label">การกดถูกใจ</div>
                      <div className="toggle-sub">แจ้งเตือนเมื่อมีผู้อ่านกดถูกใจผลงานของคุณ</div>
                    </div>
                    <label className="sw" aria-label="แจ้งเตือนไลก์">
                      <input 
                        type="checkbox" 
                        checked={notifLike} 
                        onChange={(e) => setNotifLike(e.target.checked)} 
                      />
                      <div className="sw-track"></div>
                    </label>
                  </div>
                )}

                {/* 5. follows (มีคนติดตามนักเขียน) */}
                {(userInfo.role === "writer" || userInfo.role === "admin") && (
                  <div className="toggle-row">
                    <div className="toggle-icon"><i className="ti ti-user-check" aria-hidden="true"></i></div>
                    <div className="toggle-info">
                      <div className="toggle-label">ผู้ติดตามใหม่</div>
                      <div className="toggle-sub">แจ้งเตือนเมื่อมีผู้ใช้กดติดตามบัญชีของคุณ</div>
                    </div>
                    <label className="sw" aria-label="แจ้งเตือนผู้ติดตามนักเขียน">
                      <input 
                        type="checkbox" 
                        checked={notifWriterFollow} 
                        onChange={(e) => setNotifWriterFollow(e.target.checked)} 
                      />
                      <div className="sw-track"></div>
                    </label>
                  </div>
                )}

                {/* 6. in_app_notifications */}
                <div className="toggle-row">
                  <div className="toggle-icon"><i className="ti ti-speakerphone" aria-hidden="true"></i></div>
                  <div className="toggle-info">
                    <div className="toggle-label">ข่าวสารจากระบบ</div>
                    <div className="toggle-sub">ประกาศสำคัญ อัปเดตฟีเจอร์ และข่าวสารจากทีมงาน</div>
                  </div>
                  <label className="sw" aria-label="แจ้งเตือนระบบ">
                    <input 
                      type="checkbox" 
                      checked={notifSystem} 
                      onChange={(e) => setNotifSystem(e.target.checked)} 
                    />
                    <div className="sw-track"></div>
                  </label>
                </div>

                <div className="btn-row">
                  <button className="btn btn-pink" onClick={handleSaveNotifications} disabled={isSavingNotifications}>
                    {isSavingNotifications ? (
                      <>
                        <div className="wst-loading-spinner wst-spinner-sm"></div>
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <i className="ti ti-check" aria-hidden="true"></i>
                        บันทึกการตั้งค่าการแจ้งเตือน
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
            )}

            {/* ════ 4. DANGER ZONE ════ */}
            {activeSection === "#danger" && (
              <section className="danger-card" id="danger">
              <div className="card-header">
                <div className="card-icon danger"><i className="ti ti-alert-triangle" aria-hidden="true"></i></div>
                <div>
                  <div className="card-title">ลบบัญชี ⚠️</div>
                  <div className="card-sub">เมื่อลบบัญชีแล้ว จะไม่สามารถกู้คืนข้อมูลกลับมาได้</div>
                </div>
              </div>
              
              <div className="danger-action">
                <div className="danger-action-info">
                  <div className="danger-action-label">ลบบัญชีถาวร</div>
                  <div className="danger-action-desc">
                    ข้อมูลบัญชี ประวัติการอ่าน และข้อมูลทั้งหมดของคุณจะถูกลบออกจากระบบอย่างถาวร
                  </div>
                </div>
                <button className="btn btn-red" onClick={() => setIsDeleteModalOpen(true)}>
                  <i className="ti ti-trash" aria-hidden="true"></i>ลบบัญชี
                </button>
              </div>
            </section>
            )}

          </div>
        </div>
      </div>

      {/* 🟢 DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="modal-bg open" onClick={(e) => { if (e.target.className.includes("modal-bg")) { setIsDeleteModalOpen(false); setDeletePassword(""); } }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-modal-title">
            <div className="modal-header">
              <div className="modal-header-icon"><i className="ti ti-alert-triangle" aria-hidden="true"></i></div>
              <div>
                <div className="modal-title" id="del-modal-title">ยืนยันการลบบัญชีผู้ใช้งาน</div>
                <div className="modal-sub">ท่านแน่ใจหรือไม่ว่าต้องการดำเนินการ?</div>
              </div>
            </div>
            
            <div className="modal-body">
              <div className="modal-warning">
                <i className="ti ti-info-circle" aria-hidden="true"></i>
                <div className="modal-warning-text">
                  ข้อมูลบัญชี ผลงานเขียน และประวัติการอ่านของท่านจะหายไปทั้งหมดและไม่สามารถเรียกกลับมาได้อีก 
                  <strong>การดำเนินการนี้ไม่สามารถยกเลิกภายหลังได้</strong>
                </div>
              </div>

              <div className="field" style={{ marginBottom: "18px" }}>
                <div className="label">
                  <i className="ti ti-lock" style={{ fontSize: "14px", color: "var(--muted)" }} aria-hidden="true"></i>
                  กรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน
                </div>
                <div className="input-wrap">
                  <input 
                    className={`input ${deletePwMsg.type === "err" ? "err" : ""}`}
                    id="del-pw" 
                    type={showDeletePw ? "text" : "password"} 
                    placeholder="รหัสผ่านปัจจุบันของคุณ"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeletePwMsg({ type: "hint", text: "กรอกรหัสผ่านเพื่อยืนยันตัวตนก่อนลบบัญชี" }); }}
                    autoComplete="new-password"
                  />
                  <span className="input-icon-right" onClick={() => setShowDeletePw(!showDeletePw)} title="แสดง/ซ่อน">
                    <i className={showDeletePw ? "ti ti-eye-off" : "ti ti-eye"} aria-hidden="true"></i>
                  </span>
                </div>
                <div className={`field-msg ${deletePwMsg.type}`}>
                  <i className={deletePwMsg.type === "err" ? "ti ti-x" : "ti ti-info-circle"} aria-hidden="true"></i>
                  {deletePwMsg.text}
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-gray" onClick={() => { setIsDeleteModalOpen(false); setDeletePassword(""); }} disabled={isDeletingAccount}>
                  <i className="ti ti-x" aria-hidden="true"></i>ยกเลิก
                </button>
                <button 
                  className="btn btn-red-solid" 
                  onClick={handleConfirmDeleteAccount} 
                  disabled={!deletePassword || isDeletingAccount}
                >
                  {isDeletingAccount ? (
                    <>
                      <div className="wst-loading-spinner wst-spinner-sm" style={{ borderColor: "rgba(255,255,255,0.1)", borderTopColor: "#fff" }}></div>
                      กำลังลบ...
                    </>
                  ) : (
                    <>
                      <i className="ti ti-trash" aria-hidden="true"></i>
                      ยืนยันลบบัญชีถาวร
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 UNSAVED CHANGES MODAL */}
      {isUnsavedModalOpen && (
        <div className="modal-bg open" onClick={() => { setIsUnsavedModalOpen(false); setPendingNavigation(null); }}>
          <div className="modal unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header unsaved-modal-header">
              <div className="modal-header-icon unsaved-modal-icon">
                <i className="ti ti-alert-triangle" aria-hidden="true"></i>
              </div>
              <div>
                <div className="modal-title" id="unsaved-modal-title">มีข้อมูลที่ยังไม่ได้บันทึก</div>
                <div className="modal-sub">คุณต้องการบันทึกการเปลี่ยนแปลงก่อนออกจากหน้านี้หรือไม่?</div>
              </div>
            </div>
            
            <div className="modal-body">
              <div className="modal-warning unsaved-modal-warning">
                <i className="ti ti-info-circle" aria-hidden="true"></i>
                <div className="modal-warning-text">
                  ตรวจพบการปรับปรุงข้อมูลที่ค้างอยู่ หากออกไปทันทีโดยไม่บันทึก <strong>ข้อมูลส่วนตัวหรือการตั้งค่าที่แก้ไขไว้จะสูญหายทันที</strong>
                </div>
              </div>

              <div className="modal-actions unsaved-modal-actions">
                <button 
                  className="btn btn-gray" 
                  onClick={() => {
                    setIsUnsavedModalOpen(false);
                    setPendingNavigation(null);
                  }}
                >
                  <i className="ti ti-x" aria-hidden="true"></i>ยกเลิก
                </button>
                <button 
                  className="btn btn-red-solid" 
                  onClick={() => {
                    const navCallback = pendingNavigation;
                    handleDiscardAllUnsaved();
                    setPendingNavigation(null);
                    if (navCallback) {
                      setTimeout(() => {
                        navCallback();
                      }, 0);
                    }
                  }}
                >
                  <i className="ti ti-logout" aria-hidden="true"></i>ออกโดยไม่บันทึก
                </button>
                <button 
                  className="btn btn-pink" 
                  onClick={async () => {
                    const success = await handleSaveAllUnsaved();
                    if (success) {
                      const navCallback = pendingNavigation;
                      setIsUnsavedModalOpen(false);
                      setPendingNavigation(null);
                      if (navCallback) {
                        setTimeout(() => {
                          navCallback();
                        }, 0);
                      }
                    }
                  }}
                >
                  <i className="ti ti-device-floppy" aria-hidden="true"></i>บันทึกและออกจากหน้า
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 📌 หน้าต่างกล่อง Modal สำหรับปรับขนาด/ครอบรูปโปรไฟล์ ── */}
      {avatarToCrop && (
        <div className="crop-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="crop-modal-container">
            <h3 className="crop-modal-title">📐 ปรับขนาดและครอบรูปโปรไฟล์</h3>
            
            <div className="crop-cropper-wrapper">
              <Cropper
                image={avatarToCrop}
                crop={crop}
                zoom={zoom}
                aspect={1 / 1}
                onCropChange={setCrop}
                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                onZoomChange={setZoom}
              />
            </div>

            {/* แถบควบคุมการซูม */}
            <div className="crop-controls">
              <label className="crop-zoom-label">🔍 ซูมภาพ:</label>
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
                className="btn btn-outline"
                onClick={() => setAvatarToCrop(null)}
                disabled={isCroppingAvatar}
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                className="btn btn-pink"
                onClick={handleSaveAvatarCrop}
                disabled={isCroppingAvatar}
              >
                {isCroppingAvatar ? "กำลังตัดรูป..." : "ใช้รูปภาพนี้"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
