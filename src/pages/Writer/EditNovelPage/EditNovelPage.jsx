// ⚠️ รอการแก้ไขโค้ดเรื่อง Backend PUT /novels/:id ล้างสถานะการถูกระงับ (suspended) เมื่อผู้เขียนแก้ไขรูปปกหรือข้อมูลนิยาย

import React, { useState, useEffect } from "react";
import ReactQuill from "react-quill-new";
import "quill/dist/quill.snow.css";
import "./EditNovelPage.css";
import MultiSelect from "../../../components/MultiSelect/MultiSelect";
import CoverUpload from "../../../components/CoverUpload/CoverUpload";
import Toggle from "../../../components/Toggle/Toggle";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import { useNavigate, useParams } from "react-router-dom";
import { getNovelStatusInfo, registerBannedNovel, isNovelBannedInRegistry } from "../../../utils/novelStatus";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const FALLBACK_CATEGORIES = [
    "แฟนตาซี",
    "โรแมนซ์",
    "ผจญภัย",
    "ลึกลับ",
    "สยองขวัญ",
    "ดราม่า",
    "ตลก",
    "ชีวิต",
    "ไซไฟ",
    "ประวัติศาสตร์",
];

const getStatusFlags = ({ status, is_published, is_completed, isPublished, isCompleted }) => {
    const statusInfo = getNovelStatusInfo({
        status,
        is_published,
        is_completed,
        isPublished,
        isCompleted,
    });
    return { isCompleted: statusInfo.isCompleted, isPublished: statusInfo.isPublished };
};

const getStatusFromFlags = ({ isCompleted, isPublished }) => {
    return getNovelStatusInfo({ is_completed: isCompleted, is_published: isPublished }).mode;
};

const getStatusLabel = ({ isCompleted, isPublished }) => {
    return getNovelStatusInfo({ is_completed: isCompleted, is_published: isPublished }).label;
};

const validate = (form) => {
    const errors = {};
    if (!form.title.trim()) {
        errors.title = "กรุณากรอกชื่อเรื่อง";
    }
    if (!form.tagline.trim()) {
        errors.tagline = "กรุณากรอกคำโปรย";
    }
    if (form.tagline.length > 200) {
        errors.tagline = "คำโปรยต้องไม่เกิน 200 ตัวอักษร";
    }
    if (form.categories.length === 0) {
        errors.categories = "กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด";
    }

    const plainDescription = form.description ? form.description.replace(/<(.|\n)*?>/g, "").trim() : "";
    if (!plainDescription) {
        errors.description = "กรุณากรอกแนะนำเรื่อง";
    }

    return errors;
};

const EditNovelPage = ({ onNavigate }) => {
    const navigate = useNavigate();
    const { novelId } = useParams();
    const token = localStorage.getItem("token");

    const [form, setForm] = useState({
        title: "",
        tagline: "",
        categories: [],
        description: "",
        coverFile: null,
        coverPreview: null,
        isPublished: false,
        isCompleted: false,
        statusMode: "draft",
    });
    const [originalStatus, setOriginalStatus] = useState("draft");
    const [isBannedNovel, setIsBannedNovel] = useState(false);
    const [bannedRawStatus, setBannedRawStatus] = useState("");

    const [errors, setErrors] = useState({});
    const [submissionError, setSubmissionError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesLoaded, setCategoriesLoaded] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);

    useEffect(() => {
        const loadCategories = async () => {
            setCategoriesLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/categories`);
                if (!response.ok) throw new Error("failed to fetch categories");
                const result = await response.json();
                const categoriesData = Array.isArray(result)
                    ? result
                    : Array.isArray(result?.data)
                        ? result.data
                        : [];
                if (categoriesData.length === 0) throw new Error("categories response invalid");
                // dedupe by name to avoid duplicate keys in UI
                const mapped = categoriesData.map((category) => ({
                    id: category.category_id || category.id,
                    name: category.name,
                }));
                const seen = new Set();
                const deduped = [];
                for (const c of mapped) {
                    if (!c.name) continue;
                    if (seen.has(c.name)) continue;
                    seen.add(c.name);
                    deduped.push(c);
                }
                setCategories(deduped);
                setCategoriesLoaded(true);
            } catch (err) {
                console.error("Category load error:", err);
                setCategories(FALLBACK_CATEGORIES.map((name, index) => ({ id: index + 1, name })));
            } finally {
                setCategoriesLoading(false);
            }
        };
        loadCategories();
    }, []);

    useEffect(() => {
        const loadNovel = async () => {
            console.log("EditNovelPage: mounted, novelId=", novelId);
            if (!novelId) {
                console.warn("EditNovelPage: no novelId in route params", { novelId });
                return;
            }
            setIsLoading(true);

            // Try a couple of fallback strategies in case the path id isn't numeric
            const candidates = [novelId];
            const digits = (novelId || "").match(/\d+/)?.[0];
            if (digits && digits !== novelId) candidates.push(digits);

            let lastErr = null;

            console.log("EditNovelPage: candidates=", candidates);
            for (const idCandidate of candidates) {
                try {
                    console.log("EditNovelPage: attempting fetch for id", idCandidate);
                    console.debug("EditNovelPage: attempting novel fetch", { idCandidate });
                    const response = await fetch(`${API_BASE_URL}/novels/${idCandidate}`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    console.log("EditNovelPage: fetch response status", { idCandidate, status: response.status });
                    if (!response.ok) {
                        lastErr = new Error(`novel fetch failed (${response.status})`);
                        console.error("EditNovelPage: fetch returned non-ok", { idCandidate, status: response.status });
                        // try next candidate
                        continue;
                    }
                    const result = await response.json();
                    console.log("EditNovelPage: raw API result", result);
                    let novelData = result.data || result.novel || result;
                    // Some API responses wrap the actual novel under `data.novel` or `novel`
                    if (novelData && typeof novelData === "object" && novelData.novel && typeof novelData.novel === "object") {
                        console.log("EditNovelPage: unwrapping nested novel from novelData.novel");
                        novelData = novelData.novel;
                    }
                    console.log("EditNovelPage: resolved novelData", novelData);

                    const categoryNames = Array.isArray(novelData.categories)
                        ? Array.from(new Set(novelData.categories.map((category) => {
                            if (!category) return null;
                            if (typeof category === "string") return category;
                            return category.name || category.title || category.label || null;
                        }).filter(Boolean)))
                        : [];

                    const rawCover = novelData.cover_image || novelData.coverImage || novelData.cover_url || novelData.coverUrl || novelData.cover || null;
                    const coverPreview = rawCover ? String(rawCover).replace("http://minio:9000", "http://localhost:9000") : null;

                    const statusStr = String(novelData.status || novelData.Status || "").toLowerCase().trim();
                    const statusInfo = getNovelStatusInfo({
                        id: novelData.id || idCandidate || novelId,
                        status: statusStr,
                        is_banned: novelData.is_banned,
                        isBanned: novelData.isBanned,
                        banned: novelData.banned,
                        is_published: novelData.is_published,
                        is_completed: novelData.is_completed,
                        isPublished: novelData.isPublished,
                        isCompleted: novelData.isCompleted,
                    });

                    setIsBannedNovel(statusInfo.isBanned);
                    setBannedRawStatus(statusStr || "suspended");

                    const { isCompleted, isPublished } = getStatusFlags({
                        status: statusStr,
                        is_published: novelData.is_published,
                        is_completed: novelData.is_completed,
                        isPublished: novelData.isPublished,
                        isCompleted: novelData.isCompleted,
                    });

                    setForm({
                        title: novelData.title || "",
                        tagline: novelData.captions || novelData.tagline || "",
                        categories: categoryNames,
                        description: novelData.introduction || novelData.description || "",
                        coverFile: null,
                        coverPreview,
                        isPublished,
                        isCompleted,
                        statusMode: getStatusFromFlags({ isCompleted, isPublished }),
                    });
                    console.debug("EditNovelPage: populating form with fetched novel data", {
                        title: novelData.title,
                        tagline: novelData.captions || novelData.tagline,
                        statusStr,
                        isPublished,
                        isCompleted,
                    });
                    setOriginalStatus(getStatusFromFlags({ isCompleted, isPublished }));
                    lastErr = null;
                    break; // success
                } catch (err) {
                    console.error("Load novel attempt failed for id", idCandidate, err);
                    lastErr = err;
                }
            }

            if (lastErr) {
                setSubmissionError("ไม่สามารถโหลดข้อมูลนิยายได้ — ตรวจสอบ novelId หรือเซิร์ฟเวอร์");
            }

            setIsLoading(false);
        };
        loadNovel();
    }, [novelId]);

    // Ensure options are unique strings to avoid duplicate React keys
    const categoryOptions = Array.from(new Set(categories.map((cat) => cat.name)));

    const updateFormStatus = (nextCompleted, nextPublished) => {
        setForm((prev) => {
            const nextMode = nextCompleted
                ? (nextPublished ? "completed-published" : "completed-draft")
                : (nextPublished ? "published" : "draft");
            return {
                ...prev,
                isCompleted: nextCompleted,
                isPublished: nextPublished,
                statusMode: nextMode,
            };
        });
    };

    const setField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (errors[key]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    };

    const handleSubmit = async () => {
        const newErrors = validate(form);
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const wasPublished = getNovelStatusInfo({ status: originalStatus }).isPublished;
        if (form.isPublished && !wasPublished) {
            const confirmPublish = window.confirm(
                "คุณกำลังเปลี่ยนสถานะนิยายเป็นเผยแพร่\n\nเมื่อตีพิมพ์แล้วนักอ่านจะมองเห็นเรื่องนี้\n\nต้องการดำเนินการต่อหรือไม่?"
            );
            if (!confirmPublish) {
                setIsSubmitting(false);
                return;
            }
        }

        setIsSubmitting(true);
        setSubmissionError(null);

        try {
            let coverImageUrl = null;

            if (form.coverFile) {
                const imageFormData = new FormData();
                imageFormData.append("image", form.coverFile, "cover_novel.jpg");

                const uploadRes = await fetch(`${API_BASE_URL}/upload/image`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                    },
                    body: imageFormData,
                });

                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    coverImageUrl = uploadData.data?.full_url || 
                                    uploadData.full_url || 
                                    uploadData.data?.url || 
                                    uploadData.url || 
                                    uploadData.data?.path || 
                                    uploadData.path || 
                                    uploadData.url_path || "";
                    console.log("EditNovelPage: cover upload result", uploadData, "using url", coverImageUrl);
                } else {
                    console.error("EditNovelPage: cover upload failed", uploadRes.status);
                }
            }

            const selectedCategoryIds = categories
                .filter((cat) => form.categories.includes(cat.name))
                .map((cat) => cat.id);

            const calculatedStatus = getStatusFromFlags({
                isCompleted: form.isCompleted,
                isPublished: form.isPublished,
            });

            // 🔒 หากนิยายโดนระงับ (Banned / Suspended) ให้คงค่าสถานะแบนเดิมไว้เสมอ ไม่ล้างเป็น draft/published
            const isBanned = isBannedNovel || isNovelBannedInRegistry(novelId);
            const finalStatus = isBanned
                ? (bannedRawStatus || "suspended")
                : calculatedStatus;

            const novelPayload = {
                title: form.title,
                captions: form.tagline,
                introduction: form.description,
                status: finalStatus,
                is_published: isBanned ? false : form.isPublished,
                is_completed: form.isCompleted,
                cover_image: coverImageUrl || form.coverPreview || "",
            };
            if (categoriesLoaded) {
                novelPayload.category_ids = selectedCategoryIds;
            }

            if (isBanned) {
                registerBannedNovel(novelId, novelPayload);
            }

            console.debug("EditNovelPage: PUT payload", novelPayload);
            const response = await fetch(`${API_BASE_URL}/novels/${novelId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify(novelPayload),
            });

            // Attempt to parse JSON body for both success and error to avoid silent success
            const respBody = await response.json().catch(() => null);
            console.debug("EditNovelPage: PUT response", { status: response.status, body: respBody });

            if (!response.ok) {
                // ดึง issues และ error จาก backend (รองรับทั้ง top-level และ respBody.data)
                const issuesList = Array.isArray(respBody?.issues) 
                    ? respBody.issues 
                    : Array.isArray(respBody?.data?.issues) 
                        ? respBody.data.issues 
                        : [];
                const blockingIssue = issuesList.find((i) => i.Severity === "blocking" || i.severity === "blocking");
                let errorMessage;
                if (blockingIssue?.Code === "COMPLETED_WITHOUT_ENDING" || blockingIssue?.code === "COMPLETED_WITHOUT_ENDING") {
                    errorMessage = "ไม่สามารถตั้งนิยายเป็นจบได้ กรุณาเพิ่มฉากจบก่อน";
                } else if (blockingIssue) {
                    errorMessage = blockingIssue.Message || blockingIssue.message || respBody?.error || respBody?.data?.error || "บันทึกไม่สำเร็จ";
                } else {
                    errorMessage = respBody?.error || respBody?.data?.error || respBody?.message || "บันทึกไม่สำเร็จ";
                }
                throw new Error(errorMessage);
            }

            // Verify server acknowledged update
            if (respBody && respBody.message) {
                alert("✅ " + respBody.message);
            } else {
                alert("✅ อัปเดตข้อมูลนิยายสำเร็จ!");
            }

            // Verify persisted values by re-fetching the novel before navigating
            try {
                const verifyRes = await fetch(`${API_BASE_URL}/novels/${novelId}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });
                if (verifyRes.ok) {
                    const verifyData = await verifyRes.json().catch(() => null);
                    const novelFresh = verifyData?.data?.novel || verifyData?.data || verifyData?.novel || verifyData || {};
                    const freshStatus = getNovelStatusInfo({
                        id: novelId,
                        status: novelFresh.status || novelFresh.Status,
                        is_banned: novelFresh.is_banned,
                        isBanned: novelFresh.isBanned,
                        banned: novelFresh.banned,
                        is_published: novelFresh.is_published,
                        is_completed: novelFresh.is_completed,
                        isPublished: novelFresh.isPublished,
                        isCompleted: novelFresh.isCompleted,
                    });
                    const freshPublished = freshStatus.isPublished;
                    const freshCompleted = freshStatus.isCompleted;
                    const freshTitle = novelFresh.title || "";
                    if (!isBannedNovel && (freshPublished !== form.isPublished || freshCompleted !== form.isCompleted || freshTitle !== form.title)) {
                        const msg = "อัปเดตสำเร็จแต่ค่าที่กลับมาไม่ตรงกับที่คาดไว้ (ยังไม่ได้บันทึก)";
                        console.error("EditNovelPage: verification mismatch", { novelFresh, expected: novelPayload });
                        setSubmissionError(msg);
                        return;
                    }
                }
            } catch (err) {
                console.warn("EditNovelPage: verification fetch failed", err);
            }

            navigate(`/writer/${novelId}/chapters`);
        } catch (error) {
            console.error("Submit error:", error);
            setSubmissionError("❌ เกิดข้อผิดพลาด: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTogglePublish = (nextPublished) => {
        updateFormStatus(form.isCompleted, nextPublished);
    };

    const handleToggleCompleted = (nextCompleted) => {
        // Completed can be toggled locally; backend will validate on submit
        setSubmissionError(null);
        updateFormStatus(nextCompleted, form.isPublished);
    };

    const handleCancel = () => {
        setShowCancelModal(true);
    };

    const handleConfirmCancel = () => {
        setShowCancelModal(false);
        navigate(`/writer/${novelId}/chapters`);
    };

    const taglineLen = form.tagline.length;

    if (isLoading) {
        return <LoadingScreen message="กำลังโหลดข้อมูลนิยาย..." />;
    }

    return (
        <div className="cnp">
            <div className="cnp__header">
                <h1 className="cnp__title">แก้ไขข้อมูลนิยาย</h1>
                <p className="cnp__sub">ปรับปรุงข้อมูลเบื้องต้นของนิยายของคุณ</p>
            </div>

            <div className="cnp__form-wrap">
                <div className="cnp__card">
                    {submissionError && (
                        <div className="cnp__error-banner" role="alert" style={{ marginBottom: "16px" }}>
                            {submissionError}
                        </div>
                    )}

                    <div className="cnp__section-header">
                        <h2 className="cnp__section-title">รายละเอียดนิยาย</h2>
                        <p className="cnp__section-sub">ข้อมูลเหล่านี้จะแสดงให้นักอ่านเห็นในหน้ารายละเอียดนิยาย</p>
                    </div>

                    <div className="cnp__columns">
                        <div className="cnp__left">
                            <div className="cnp__field" id="field-title">
                                <label className="cnp__label" htmlFor="inp-title">
                                    ชื่อเรื่อง <span className="cnp__required">*</span>
                                </label>
                                <input
                                    id="inp-title"
                                    type="text"
                                    className={`cnp__input ${errors.title ? "cnp__input--error" : ""}`}
                                    placeholder="ตั้งชื่อเรื่องของคุณ...."
                                    value={form.title}
                                    onChange={(e) => setField("title", e.target.value)}
                                    maxLength={100}
                                    aria-required="true"
                                />
                                {errors.title && <p className="cnp__error" role="alert">{errors.title}</p>}
                            </div>

                            <div className="cnp__field" id="field-tagline">
                                <label className="cnp__label" htmlFor="inp-tagline">
                                    คำโปรย <span className="cnp__required">*</span>
                                </label>
                                <textarea
                                    id="inp-tagline"
                                    className={`cnp__textarea cnp__textarea--sm ${errors.tagline ? "cnp__input--error" : ""}`}
                                    placeholder="บอกเล่าเรื่องราวของคุณสั้นๆ"
                                    value={form.tagline}
                                    onChange={(e) => setField("tagline", e.target.value)}
                                    maxLength={200}
                                    aria-required="true"
                                />
                                <div className="cnp__char-row">
                                    <p className={`cnp__char-count ${taglineLen > 180 ? "cnp__char-count--warn" : ""}`}>
                                        {taglineLen} / 200 ตัวอักษร
                                    </p>
                                    {errors.tagline && <p className="cnp__error" role="alert">{errors.tagline}</p>}
                                </div>
                            </div>

                            <div className="cnp__field" id="field-categories">
                                <label className="cnp__label">
                                    หมวดหมู่ <span className="cnp__required">*</span>
                                </label>
                                <MultiSelect
                                    options={categoryOptions}
                                    value={form.categories}
                                    onChange={(val) => setField("categories", val)}
                                    placeholder={categoriesLoading ? "กำลังโหลดหมวดหมู่..." : "เลือกหมวดหมู่..."}
                                    max={5}
                                />
                                {errors.categories && <p className="cnp__error" role="alert">{errors.categories}</p>}
                            </div>

                            <div className="cnp__field" id="field-description">
                                <label className="cnp__label" htmlFor="inp-description">
                                    แนะนำเรื่อง <span className="cnp__required">*</span>
                                </label>
                                <div className={`cnp__quill-wrap ${errors.description ? "cnp__quill-wrap--error" : ""}`}>
                                    <ReactQuill
                                        theme="snow"
                                        value={form.description}
                                        onChange={(value) => setField("description", value)}
                                        placeholder="แนะนำเรื่องราวเกี่ยวกับนิยายของคุณ...."
                                        className="cnp__quill"
                                    />
                                </div>
                                {errors.description && <p className="cnp__error" role="alert">{errors.description}</p>}
                            </div>
                        </div>

                        <div className="cnp__right">
                            <div className="cnp__cover-wrap">
                                <CoverUpload
                                    value={form.coverPreview}
                                    onChange={(file, preview) => {
                                        setField("coverFile", file);
                                        setField("coverPreview", preview);
                                    }}
                                />
                            </div>

                            <div className="cnp__settings">
                                <h3 className="cnp__settings-title">การตั้งค่าเบื้องต้น</h3>

                                <div className="cnp__setting-row">
                                    <span className="cnp__setting-label">สถานะเรื่อง</span>
                                    <div className="cnp__setting-control">
                                        <Toggle
                                            id="toggle-published"
                                            checked={form.isPublished}
                                            onChange={(val) => handleTogglePublish(val)}
                                        />
                                        <span className={`cnp__setting-status ${form.isPublished ? "cnp__setting-status--on" : ""}`}>
                                            {form.isPublished ? "เผยแพร่" : "ฉบับร่าง"}
                                        </span>
                                    </div>
                                </div>

                                <div className="cnp__setting-row">
                                    <span className="cnp__setting-label">สถานะจบ</span>
                                    <div className="cnp__setting-control">
                                        <Toggle
                                            id="toggle-completed"
                                            checked={form.isCompleted}
                                            onChange={(val) => handleToggleCompleted(val)}
                                        />
                                        <span className={`cnp__setting-status ${form.isCompleted ? "cnp__setting-status--on" : ""}`}>
                                            {form.isCompleted ? "จบแล้ว" : "ยังไม่จบ"}
                                        </span>
                                    </div>
                                </div>

                                <div className="cnp__setting-row" style={{ marginTop: 8 }}>
                                    <span className="cnp__setting-label">สถานะปัจจุบัน</span>
                                    <span className="cnp__setting-status cnp__setting-status--on" style={{ marginLeft: 8 }}>
                                        {getStatusLabel({ isCompleted: form.isCompleted, isPublished: form.isPublished })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="cnp__footer">
                        <button
                            type="button"
                            className="cnp__btn cnp__btn--cancel"
                            onClick={handleCancel}
                            disabled={isSubmitting}
                        >
                            ยกเลิก
                        </button>

                        <button
                            type="button"
                            className="cnp__btn cnp__btn--submit"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            aria-busy={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="cnp__spinner" aria-hidden="true" />
                                    กำลังอัปเดต...
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                        <path d="M2 7l4 4 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    อัปเดตข้อมูลนิยาย
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {showCancelModal && (
                <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>คุณต้องการละทิ้งการแก้ไขนิยายหรือไม่?</h2>
                        <p style={{ color: "#999", fontSize: "14px" }}>ระบบจะไม่บันทึกข้อมูลล่าสุดที่คุณแก้ไข</p>
                        
                        <div className="modal-buttons">
                            <button
                                className="btn btn--outline"
                                onClick={() => setShowCancelModal(false)}
                            >
                                แก้ไขต่อ
                            </button>
                            <button
                                className="btn btn--danger"
                                onClick={handleConfirmCancel}
                            >
                                ออกโดยไม่บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditNovelPage;
