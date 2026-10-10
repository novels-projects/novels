// src/pages/Writer/SceneEditorPage/SceneEditorPage.jsx
// ══════════════════════════════════════════════════════════════
//  หน้าเขียน/แก้ไขฉากนิยาย (Scene Editor) — ฝั่งนักเขียน 
//  [ ปรับแต่งเชื่อมต่อ Go หลังบ้าน ผ่าน /scenes/:id และ /story-tree ]
// ══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "quill/dist/quill.snow.css";
import "./SceneEditorPage.css";
import Toggle from "../../../components/Toggle/Toggle";
import EndingSettings from "../../../components/EndingSettings/EndingSettings";
import LoadingScreen from "../../../components/LoadingScreen/LoadingScreen";
import { Search, Menu } from "lucide-react";
import { getChoiceConnectionBlockReason, getChoiceConnectionMessage } from "../../../utils/choiceValidation";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// ─────────────────────────────────────────────
// หมายเหตุ: การตั้งค่า toolbar/formats ของ Quill จริงอยู่ที่ `quillModules`
// (useMemo ด้านล่าง) — ของเดิมที่เคยประกาศซ้ำไว้ตรงนี้ไม่เคยถูกใช้งาน จึงลบออก
// ─────────────────────────────────────────────
// Choice Card Component (อัปเดตลอจิกแบบเดียวกับหน้า Chapter Manager)
// ─────────────────────────────────────────────
const ChoiceCard = ({
  choice,
  index,
  allTargetOptions,
  currentChapterId,
  currentSceneId, // 🆕 เพิ่ม Props นี้เข้ามาเพื่อคำนวณตำแหน่งฉากปัจจุบัน
  sourceSceneTitle,
  onUpdate,
  onSave,
  onDelete,
  novelId,
  token,
  onNavigate,
  navigate,
  onDeleteScene,
}) => {
  // 🔢 เรียงตอนตามลำดับ episode/order_index และเรียงฉากตามลำดับในตอน
  // ก่อนจะแบนราบเป็น allScenes เดียว เพื่อให้ index ที่ใช้ตัดสิน Forward-Only
  // สะท้อนลำดับการอ่านจริง ไม่ใช่ลำดับที่ API เผอิญคืนมา
  const sortedChaptersForFlow = [...(Array.isArray(allTargetOptions) ? allTargetOptions : [])].sort((a, b) => {
    const aOrder = a.episode ?? a.order_index ?? a.chapterNumber ?? 0;
    const bOrder = b.episode ?? b.order_index ?? b.chapterNumber ?? 0;
    return aOrder - bOrder;
  });

  const allScenes = sortedChaptersForFlow.flatMap((ch, chIdx) => {
    const scenes = [...(Array.isArray(ch.scenes) ? ch.scenes : [])].sort((a, b) => {
      const aOrder = a.order_index ?? a.orderIndex ?? a.sceneNumber ?? 0;
      const bOrder = b.order_index ?? b.orderIndex ?? b.sceneNumber ?? 0;
      return aOrder - bOrder;
    });
    const chapterTitle = ch.title || ch.chapterTitle || "";
    const chapterId = ch.id || ch.chapter_id || ch.ChapterID || ch.chapter_id || "";
    const displayNum = ch.chapterNumber ?? ch.order_index ?? ch.episode ?? (chIdx + 1);

    return scenes.map((s, sIdx) => ({
      value: `${chapterId}||${s.id ?? s.scene_id ?? s.SceneID}`,
      label: `ฉากที่ ${displayNum}.${sIdx + 1} — ${s.title || s.label || s.sceneTitle || "ฉากไม่มีชื่อ"}`,
      chapterTitle,
      chapterId,
      sceneId: s.id ?? s.scene_id ?? s.SceneID,
      sceneLabel: s.title || s.label || s.sceneTitle || "ฉากไม่มีชื่อ",
      content: s.content || "",
    }));
  });

  const findSceneByValue = (value) => allScenes.find((scene) => String(scene.value) === String(value));

  const normalizeChoiceTarget = (target) => {
    if (!target) return "";
    if (typeof target === "string" && target.includes("||")) return target;
    const targetId = String(target);
    const found = allScenes.find((scene) =>
      String(scene.value) === targetId || String(scene.value).endsWith(`||${targetId}`)
    );
    return found ? found.value : "";
  };

  const initialTargetSubScene = normalizeChoiceTarget(
    choice.targetSubScene ?? choice.to_scene_id ?? choice.toSceneID ?? choice.toSceneId ?? ""
  );
  const resolvedScene = findSceneByValue(initialTargetSubScene);
  const initialScope = resolvedScene
    ? String(resolvedScene.chapterId) === String(currentChapterId)
      ? "same"
      : "other"
    : "same";
  const initialChapterId = resolvedScene?.chapterId ?? currentChapterId;

  const [text, setText] = useState(choice.text ?? choice.label ?? choice.Label ?? "");
  const [targetType, setTargetType] = useState(choice.targetType || initialScope);
  const [targetLabel, setTargetLabel] = useState(
    resolvedScene?.label ||
    choice.targetLabel ||
    (resolvedScene ? `${resolvedScene.chapterTitle} › ${resolvedScene.sceneLabel}` : "เลือกฉากปลายทาง...")
  );
  const [subScene, setSubScene] = useState(initialTargetSubScene);
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);

  // States สำหรับโหมดเชื่อมฉากที่มีอยู่ หรือ สร้างฉากใหม่
  const [connectionMode, setConnectionMode] = useState("existing");
  const [newSceneTitle, setNewSceneTitle] = useState(
    choice.newSceneTitle || ""
  );
  const [newSceneChapterId, setNewSceneChapterId] = useState(currentChapterId || "");
  const [isCreatingNewScene, setIsCreatingNewScene] = useState(false);
  const [createdSceneId, setCreatedSceneId] = useState(null);
  const [isSavingChoice, setIsSavingChoice] = useState(false);

  // State ควบคุมโหมดการแก้ไข
  const [isEditing, setIsEditing] = useState(
    !choice.text || String(choice.id).startsWith("choice-new-")
  );

  useEffect(() => {
    setText(choice.text ?? choice.label ?? choice.Label ?? "");
  }, [choice.text, choice.label]);

  useEffect(() => {
    if (!subScene && initialTargetSubScene) {
      const scene = findSceneByValue(initialTargetSubScene);
      if (scene) {
        setSubScene(initialTargetSubScene);
        setTargetLabel(scene.label);
        setSelectedChapterId(scene.chapterId);
        setTargetType(String(scene.chapterId) === String(currentChapterId) ? "same" : "other");
      }
    }
  }, [allScenes.length, initialTargetSubScene, currentChapterId]);

  // 🔍 หาตำแหน่ง Index ของฉากต้นทางปัจจุบันในไทม์ไลน์ใหญ่
  const fromSceneIndex = allScenes.findIndex(s => String(s.sceneId) === String(currentSceneId));

  const sameChapterScenes = allScenes.filter((scene) => String(scene.chapterId) === String(currentChapterId));
  // 🛡️ กรอง "ตอนอื่น" ใน dropdown ด้วยกฎ Forward-Only เช่นกัน: ตอนที่ไม่มีฉากใดอยู่ข้างหน้า
  // ฉากปัจจุบันเลยจะไม่ถูกนำมาแสดงเป็นทางเลือกตั้งแต่แรก (เดิมกรองแค่ตอนเลือก "ฉาก" ปลายทาง
  // แต่ตัว "ตอน" เองไม่ได้กรอง ทำให้ตอนก่อนหน้าที่เชื่อมย้อนกลับไม่ได้ยังโผล่ในลิสต์)
  const otherChapterOptions = Array.from(
    new Map(
      allScenes
        .filter((scene, idx) => String(scene.chapterId) !== String(currentChapterId) && idx > fromSceneIndex)
        .map((scene) => [String(scene.chapterId), { chapterId: scene.chapterId, chapterTitle: scene.chapterTitle }])
    )
  ).map(([, value]) => value);

  const effectiveChapterId =
    targetType === "same"
      ? currentChapterId
      : selectedChapterId;
  const targetScenes = allScenes.filter((scene) => String(scene.chapterId) === String(effectiveChapterId));
  const sceneOptions = targetType === "same" ? sameChapterScenes : targetScenes;

  // 🛡️ กรองฉากปลายทางใน Dropdown: แสดงเฉพาะฉากที่มีตำแหน่ง "มากกว่า" ฉากปัจจุบันเท่านั้น (Forward-Only)
  const forwardOnlySceneOptions = sceneOptions.filter(scene => {
    const sceneIndexInAll = allScenes.findIndex(s => String(s.sceneId) === String(scene.sceneId));
    return sceneIndexInAll > fromSceneIndex; // ต้องอยู่ข้างหน้าเท่านั้น
  });

  const handleScopeChange = (scopeValue) => {
    setTargetType(scopeValue);
    if (scopeValue === "same") {
      setSelectedChapterId(currentChapterId);
      // สำหรับตอนเดียวกัน ให้เลือกฉากแรกที่สามารถโยงได้ตามกฎ Forward-Only
      const validScenes = sameChapterScenes.filter(
        (s) => allScenes.findIndex((all) => String(all.sceneId) === String(s.sceneId)) > fromSceneIndex
      );
      if (validScenes.length > 0) {
        setSubScene(validScenes[0].value);
        setTargetLabel(validScenes[0].label);
      } else {
        setSubScene("");
        setTargetLabel("กรุณาเลือกฉากปลายทาง");
      }
    } else {
      // สำหรับตอนอื่น ให้เริ่มด้วยค่าว่างเพื่อให้แสดง "กรุณาเลือกตอนปลายทาง"
      setSelectedChapterId("");
      setSubScene("");
      setTargetLabel("กรุณาเลือกฉากปลายทาง");
    }
  };

  const handleChapterChange = (chapterId) => {
    setSelectedChapterId(chapterId);
    // เมื่อเปลี่ยนตอน ให้ล้างค่าฉากเก่าเพื่อให้ผู้ใช้เลือกใหม่จากข้อความเริ่มต้น "กรุณาเลือกฉากปลายทาง"
    setSubScene("");
    setTargetLabel("กรุณาเลือกฉากปลายทาง");
  };

  const handleSubSceneChange = (val) => {
    setSubScene(val);
    const found = findSceneByValue(val);
    if (found) setTargetLabel(found.label || found.chapterTitle);
  };

  const [formError, setFormError] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleSaveEdit = async () => {
    // 🛑 ตรวจสอบการกรอกข้อความ
    if (!text || text.trim() === "") {
      setFormError("กรุณากรอกข้อความบนปุ่มทางเลือกก่อน");
      return;
    }

    // 🛑 ตรวจสอบการเลือกปลายทาง
    if (!subScene || subScene === "") {
      setFormError("กรุณาเลือกฉากปลายทางที่ต้องการเชื่อมโยง");
      return;
    }

    const targetScene = findSceneByValue(subScene);
    const targetSceneId = targetScene ? targetScene.sceneId : "";
    const targetSceneIndex = allScenes.findIndex(s => String(s.sceneId) === String(targetSceneId));

    if (fromSceneIndex === -1 || targetSceneIndex === -1) {
      setFormError("❌ ไม่พบข้อมูลตำแหน่งของฉากในระบบ กรุณาตรวจสอบอีกครั้ง");
      return;
    }

    const targetBlockReason = getChoiceConnectionBlockReason(currentSceneId, targetSceneId, allTargetOptions, choice.id);
    const isBackward = targetSceneIndex <= fromSceneIndex;
    if (targetBlockReason || isBackward) {
      const reason = targetBlockReason || "backward";
      setFormError(`❌ ไม่สามารถบันทึกได้: ${getChoiceConnectionMessage(reason)}`);
      return;
    }

    setFormError("");

    const updatedChoice = {
      ...choice,
      text,
      targetType,
      targetSubScene: subScene,
      targetLabel,
    };
    onUpdate?.(updatedChoice);
    setIsSavingChoice(true);
    try {
      const saved = await onSave?.(updatedChoice);
      if (saved === false) {
        setFormError("บันทึกทางเลือกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setIsEditing(false);
    } finally {
      setIsSavingChoice(false);
    }
  };

  const handleCreateAndConnect = async () => {
    if (!currentSceneId) {
      setFormError("ไม่พบรหัสฉากต้นทาง");
      return;
    }
    if (!text || text.trim() === "") {
      setFormError("กรุณากรอกข้อความบนปุ่มทางเลือกก่อน");
      return;
    }
    if (!newSceneTitle || newSceneTitle.trim() === "") {
      setFormError("กรุณากรอกชื่อฉากใหม่ที่ต้องการสร้าง");
      return;
    }
    if (!newSceneChapterId || newSceneChapterId === "") {
      setFormError("กรุณาเลือกตอนสำหรับฉากใหม่");
      return;
    }
    const currentChapterIndex = sortedChaptersForFlow.findIndex((chapter) => String(chapter.id || chapter.chapter_id || chapter.ChapterID) === String(currentChapterId));
    const targetChapterIndex = sortedChaptersForFlow.findIndex((chapter) => String(chapter.id || chapter.chapter_id || chapter.ChapterID) === String(newSceneChapterId));
    if (currentChapterIndex !== -1 && targetChapterIndex !== -1 && targetChapterIndex < currentChapterIndex) {
      setFormError("ไม่สามารถสร้างฉากใหม่ในตอนก่อนหน้าได้ เพราะจะเป็นการเชื่อมย้อนกลับ");
      return;
    }

    setIsCreatingNewScene(true);
    setFormError("");

    let createdSceneId = null;
    let createdTargetSceneId = null;
    try {
      const payload = {
        novel_id: parseInt(novelId, 10),
        chapter_id: parseInt(newSceneChapterId, 10),
        title: newSceneTitle.trim(),
        content: "",
        x: 150, 
        y: 150,
        type: "normal",
        status: "draft",
        choices: []
      };

      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // ฉากใหม่ต้องถูกสร้างก่อน target เพื่อให้ฉากแรกของนิยายได้รับสถานะ start
      // และไม่ทำให้ target ถูกเลือกเป็น start แทนโดยอัตโนมัติ
      if (String(currentSceneId) === "new") {
        const sourceTitle = sourceSceneTitle?.trim() || `ฉากใหม่ ${Date.now()}`;
        const sourceResponse = await fetch(`${API_BASE_URL}/scenes`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            novel_id: parseInt(novelId, 10),
            chapter_id: parseInt(currentChapterId, 10),
            title: sourceTitle,
            content: "",
            type: "normal",
            status: "draft",
            choices: [],
          }),
        });
        if (!sourceResponse.ok) {
          const errorData = await sourceResponse.json().catch(() => null);
          throw new Error(errorData?.error || errorData?.message || "สร้างฉากต้นทางไม่สำเร็จ");
        }

        const sourceData = await sourceResponse.json();
        const sourceSceneId = sourceData?.data?.scene_id || sourceData?.scene_id || sourceData?.data?.id || sourceData?.id;
        if (!sourceSceneId) throw new Error("ระบบไม่ได้รับรหัสฉากต้นทาง");
        createdSceneId = sourceSceneId;

        const targetResponse = await fetch(`${API_BASE_URL}/scenes`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (!targetResponse.ok) {
          const errorData = await targetResponse.json().catch(() => null);
          throw new Error(errorData?.error || errorData?.message || "สร้างฉากปลายทางไม่สำเร็จ");
        }

        const targetData = await targetResponse.json();
        const targetSceneId = targetData?.data?.scene_id || targetData?.scene_id || targetData?.data?.id || targetData?.id;
        if (!targetSceneId) throw new Error("ระบบไม่ได้รับรหัสฉากปลายทาง");
        createdTargetSceneId = targetSceneId;

        const updateResponse = await fetch(`${API_BASE_URL}/scenes/${sourceSceneId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            title: sourceTitle,
            content: "",
            status: "draft",
            choices: [{
              label: text.trim(),
              text: text.trim(),
              to_scene_id: Number(targetSceneId),
              targetSubScene: `${newSceneChapterId}||${targetSceneId}`,
            }],
          }),
        });
        if (!updateResponse.ok) {
          const errorData = await updateResponse.json().catch(() => null);
          throw new Error(errorData?.error || errorData?.message || "บันทึกทางเลือกไม่สำเร็จ");
        }

        setCreatedSceneId(targetSceneId);
        setSubScene(`${newSceneChapterId}||${targetSceneId}`);
        setTargetLabel(`ฉากที่เพิ่งสร้าง : ${newSceneTitle.trim()}`);
        onUpdate?.({
          ...choice,
          text: text.trim(),
          targetType: String(newSceneChapterId) === String(currentChapterId) ? "same" : "other",
          targetSubScene: `${newSceneChapterId}||${targetSceneId}`,
          targetLabel: `ฉากที่เพิ่งสร้าง : ${newSceneTitle.trim()}`,
        });
        window.dispatchEvent(new Event("novel-data-updated"));
        setIsEditing(false);
        setNewSceneTitle("");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/scenes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errMsg = (typeof errData?.error === "object" ? errData.error?.message : errData?.error) || errData?.message;
        throw new Error(errMsg || "สร้างฉากใหม่ไม่สำเร็จ");
      }

      const resData = await res.json();
      const savedSceneId = resData?.data?.scene_id || resData?.scene_id || resData?.data?.id || resData?.id;
      createdSceneId = savedSceneId;

      if (!savedSceneId) {
        throw new Error("ระบบไม่ได้รับรหัสฉากจากหลังบ้าน");
      }

      const targetSubSceneValue = `${newSceneChapterId}||${savedSceneId}`;
      const resolvedLabelText = `ฉากที่เพิ่งสร้าง : ${newSceneTitle.trim()}`;

      setSubScene(targetSubSceneValue);
      setTargetLabel(resolvedLabelText);

      const updatedChoice = {
        ...choice,
        text: text.trim(),
        targetType: String(newSceneChapterId) === String(currentChapterId) ? "same" : "other",
        targetSubScene: targetSubSceneValue,
        targetLabel: resolvedLabelText
      };

      onUpdate?.(updatedChoice);
      const saved = await onSave?.(updatedChoice);
      if (saved === false) {
        await onDeleteScene?.(savedSceneId);
        createdSceneId = null;
        throw new Error("บันทึกทางเลือกไม่สำเร็จ ระบบลบฉากใหม่ที่สร้างไว้แล้ว");
      }
      setCreatedSceneId(savedSceneId);

      window.dispatchEvent(new Event("novel-data-updated"));

      setIsEditing(false);
      setNewSceneTitle("");
    } catch (err) {
      console.error(err);
      if (createdSceneId) {
        try {
          await onDeleteScene?.(createdSceneId);
        } catch (rollbackError) {
          console.error("ลบฉากใหม่ที่สร้างค้างไว้ไม่สำเร็จ:", rollbackError);
        }
      }
      if (createdTargetSceneId) {
        try {
          await onDeleteScene?.(createdTargetSceneId);
        } catch (rollbackError) {
          console.error("ลบฉากปลายทางที่สร้างค้างไว้ไม่สำเร็จ:", rollbackError);
        }
      }
      setFormError(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsCreatingNewScene(false);
    }
  };

  const performDiscardEdit = () => {
    if (choice.id && String(choice.id).startsWith("choice-new-")) {
      onDelete(choice.id);
    } else {
      setText(choice.text ?? choice.label ?? choice.Label ?? "");
      setTargetType(initialScope);
      setSubScene(initialTargetSubScene);
      setTargetLabel(
        choice.targetLabel ||
        resolvedScene?.label ||
        resolvedScene?.sceneLabel ||
        (resolvedScene ? `${resolvedScene.chapterTitle} › ${resolvedScene.sceneLabel}` : "เลือกฉากปลายทาง...")
      );
      setSelectedChapterId(initialChapterId);
      setFormError("");
      setIsEditing(false);
    }
    setShowDiscardConfirm(false);
  };

  const handleCancelEdit = () => {
    const originalText = (choice.text ?? choice.label ?? choice.Label ?? "").trim();
    const hasUnsavedChanges =
      text.trim() !== originalText ||
      targetType !== initialScope ||
      String(subScene) !== String(initialTargetSubScene);

    // ⚠️ ถ้ามีข้อความ/การตั้งค่าที่พิมพ์ไว้แล้วยังไม่ได้กดยืนยัน ให้ถามก่อนทิ้งข้อมูล
    if (hasUnsavedChanges && text.trim() !== "") {
      setShowDiscardConfirm(true);
    } else {
      performDiscardEdit();
    }
  };

  const COLORS = ["#db2777", "#f59e0b", "#14b8a6", "#8b5cf6", "#ec4899"];
  const accentColor = COLORS[index % COLORS.length];

  return (
    <>
    <div className="se-choice" style={{ "--choice-accent": accentColor }}>
      <div
        className="se-choice__num"
        style={{
          background: accentColor,
          color: "#ffffff",
        }}
      >
        {index + 1}
      </div>

      <div className="se-choice__body">
        {!isEditing ? (
          <div className="se-choice__view" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px dashed #f1f5f9", paddingBottom: "8px", marginBottom: "2px" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: "800", color: accentColor }}>
                ทางเลือกที่ {index + 1}
              </span>
              
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="se-choice__btn-action se-choice__btn-action--edit"
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.78rem",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#475569",
                    cursor: "pointer",
                    fontWeight: "700",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    transition: "all 0.15s ease"
                  }}
                >
                  แก้ไข
                </button>

                <button
                  type="button"
                  className="se-choice__btn-action se-choice__btn-action--del"
                  onClick={() => onDelete(choice.id)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.78rem",
                    borderRadius: "6px",
                    border: "1px solid #fca5a5",
                    background: "#fff5f5",
                    color: "#e11d48",
                    cursor: "pointer",
                    fontWeight: "700",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    transition: "all 0.15s ease"
                  }}
                >
                  ลบ
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", textAlign: "left" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#9ca3af", whiteSpace: "nowrap" }}>
                ข้อความที่ผู้อ่านเห็น:
              </span>
              <span style={{ fontSize: "0.95rem", fontWeight: "700", color: "#1f2937", wordBreak: "break-word" }}>
                {text || <span style={{ color: "#d1d5db", fontStyle: "italic", fontWeight: "400" }}>ยังไม่ได้ระบุข้อความ...</span>}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", textAlign: "left" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#9ca3af", whiteSpace: "nowrap" }}>
                เชื่อมไป:
              </span>
              <span style={{ fontSize: "0.88rem", fontWeight: "700", color: "#4b5563" }}>
                {subScene ? (
                  targetLabel
                ) : (
                  <span style={{ color: "#f97316", fontStyle: "italic" }}>⚠️ ยังไม่ได้เลือกฉากปลายทาง</span>
                )}
              </span>
            </div>

            {/* ปุ่มลัด "ไปเขียนเนื้อหาฉากนี้" (แสดงเฉพาะเมื่อยังไม่มีเนื้อหา) */}
            {(() => {
              const targetSceneObj = findSceneByValue(subScene);
              const isTargetSceneEmpty = targetSceneObj ? (!targetSceneObj.content || targetSceneObj.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim() === "") : false;
              if (subScene && targetSceneObj && isTargetSceneEmpty) {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      const parts = String(subScene).split("||");
                      const targetChId = parts[0];
                      const targetScId = parts[parts.length - 1];
                      if (targetChId && targetScId) {
                        if (typeof onNavigate === "function") {
                          onNavigate("scene-editor", { novelId, chapterId: targetChId, sceneId: targetScId });
                        } else if (navigate) {
                          navigate(`/writer/${novelId}/scene/${targetScId}?chapterId=${targetChId}`);
                        }
                      }
                    }}
                    style={{
                      marginTop: "8px",
                      padding: "8px 14px",
                      fontSize: "0.8rem",
                      borderRadius: "8px",
                      border: "none",
                      background: "linear-gradient(135deg, var(--pink-500), #ec4899)",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontWeight: "700",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      alignSelf: "flex-start",
                      boxShadow: "0 4px 10px rgba(219, 39, 119, 0.15)",
                      transition: "all 0.15s ease"
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
                  >
                    ไปเขียนเนื้อหาฉากนี้
                  </button>
                );
              }
              return null;
            })()}

            {createdSceneId && (
              <div className="se-choice__created-feedback">
                สร้างฉากและเชื่อมทางเลือกสำเร็จ
              </div>
            )}

          </div>
        ) : (
          <div className="se-choice__config" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            <div className="se-choice__config-col" style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
              <div className="se-choice__config-label" style={{ fontSize: "0.88rem", fontWeight: "700", color: "#475569" }}>ข้อความทางเลือก</div>
              <input
                className="se-input"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                placeholder="กรอกข้อความทางเลือก..."
                style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
            </div>

            <div className="se-choice__config-col se-choice__connection-field" style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left" }}>
              <div className="se-choice__config-label" style={{ fontSize: "0.88rem", fontWeight: "700", color: "#475569" }}>เชื่อมไปยังฉากปลายทาง</div>
              
              {/* แถบสลับแบบกล่องสองบล็อก (Grid Layout) สวยงามตามรูป */}
              <div className="se-choice__connection-modes">
                {/* บล็อก 1: เลือกฉากที่มี */}
                <div
                  onClick={() => {
                    setConnectionMode("existing");
                    setFormError("");
                  }}
                  className={`se-choice__connection-mode ${connectionMode === "existing" ? "is-active" : ""}`}
                >
                  <div className="se-choice__connection-icon">
                    🔗
                  </div>
                  <div className="se-choice__connection-copy">
                    <span>เลือกฉากที่มี</span>
                    <small>เชื่อมกับฉากที่สร้างแล้ว</small>
                  </div>
                </div>

                {/* บล็อก 2: สร้างฉากใหม่ */}
                <div
                  onClick={() => {
                    setConnectionMode("new");
                    setFormError("");
                  }}
                  className={`se-choice__connection-mode ${connectionMode === "new" ? "is-active" : ""}`}
                >
                  <div className="se-choice__connection-icon">
                    📝
                  </div>
                  <div className="se-choice__connection-copy">
                    <span>สร้างฉากใหม่</span>
                    <small>สร้างและเชื่อมอัตโนมัติ</small>
                  </div>
                </div>
              </div>

              {connectionMode === "existing" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                  <div className="se-choice__radios" style={{ display: "flex", gap: "16px", marginBottom: "4px" }}>
                    <label className="se-radio" style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "600", color: "#475569" }}>
                      <input
                        type="radio"
                        name={`tt-${choice.id}`}
                        value="same"
                        checked={targetType === "same"}
                        onChange={() => handleScopeChange("same")}
                        style={{ accentColor: "#db2777" }}
                      />
                      <span className="se-radio__dot" />
                      ฉากในตอนเดียวกัน
                    </label>

                    <label className="se-radio" style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.85rem", fontWeight: "600", color: "#475569" }}>
                      <input
                        type="radio"
                        name={`tt-${choice.id}`}
                        value="other"
                        checked={targetType === "other"}
                        onChange={() => handleScopeChange("other")}
                        style={{ accentColor: "#db2777" }}
                      />
                      <span className="se-radio__dot" />
                      ฉากในตอนอื่น
                    </label>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                    {targetType === "other" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", textAlign: "left" }}>เลือกตอนปลายทาง</div>
                        <select
                          className="se-select"
                          value={selectedChapterId}
                          onChange={(e) => handleChapterChange(e.target.value)}
                        >
                          <option value="">กรุณาเลือกตอนปลายทาง</option>
                          {otherChapterOptions.map((ch, idx) => {
                            const foundCh = allTargetOptions.find(c => String(c.id ?? c.chapter_id ?? c.ChapterID) === String(ch.chapterId));
                            const chIndex = allTargetOptions.findIndex(c => String(c.id ?? c.chapter_id ?? c.ChapterID) === String(ch.chapterId));
                            const displayNum = foundCh 
                              ? (foundCh.chapterNumber ?? foundCh.order_index ?? (chIndex !== -1 ? chIndex + 1 : idx + 1)) 
                              : (idx + 1);
                            return (
                              <option key={ch.chapterId} value={ch.chapterId}>
                                ตอนที่ {displayNum} — {ch.chapterTitle || "ไม่มีชื่อตอน"}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    {(targetType === "same" || (targetType === "other" && effectiveChapterId)) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", textAlign: "left" }}>เลือกฉากปลายทาง</div>
                        <select
                          className="se-select"
                          value={subScene}
                          onChange={(e) => handleSubSceneChange(e.target.value)}
                          disabled={forwardOnlySceneOptions.length === 0}
                        >
                          <option value="">
                            {forwardOnlySceneOptions.length > 0
                              ? "กรุณาเลือกฉากปลายทาง"
                              : "-- ไม่มีฉากที่สามารถเลือกโยงได้ --"}
                          </option>
                          {forwardOnlySceneOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", textAlign: "left" }}>ตั้งชื่อฉากใหม่</div>
                    <input
                      className="se-input"
                      value={newSceneTitle}
                      onChange={(e) => setNewSceneTitle(e.target.value)}
                      placeholder="เช่น ตัดสินใจเผชิญหน้ากับศัตรู"
                      style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: "700", color: "#64748b", textAlign: "left" }}>สร้างในตอนที่ ...</div>
                    <select
                      className="se-select"
                      value={newSceneChapterId}
                      onChange={(e) => setNewSceneChapterId(e.target.value)}
                    >
                      <option value="">เลือกตอนที่ต้องการให้ฉากอยู่</option>
                      {(allTargetOptions || []).map((ch, idx) => {
                        const displayNum = ch.episode ?? ch.order_index ?? (idx + 1);
                        return (
                          <option key={ch.id ?? ch.chapter_id ?? ch.ChapterID} value={ch.id ?? ch.chapter_id ?? ch.ChapterID}>
                            ตอนที่ {displayNum} — {ch.title || "ไม่มีชื่อตอน"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {formError && <div className="se-choice__error">{formError}</div>}

            <div className="se-choice__actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "16px", borderTop: "1px dashed #e5e7eb", paddingTop: "14px", width: "100%" }}>
              <button 
                type="button" 
                className="se-choice__btn-action se-choice__btn-action--cancel" 
                onClick={handleCancelEdit}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.88rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "transparent",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontWeight: "700",
                  transition: "all 0.15s ease",
                  marginRight: "8px"
                }}
              >
                ยกเลิก
              </button>
              
              {connectionMode === "existing" ? (
                <button
                  type="button"
                  className="se-choice__btn-action se-choice__btn-action--save"
                  onClick={handleSaveEdit}
                  disabled={forwardOnlySceneOptions.length === 0 || isSavingChoice}
                  aria-busy={isSavingChoice}
                  title={forwardOnlySceneOptions.length === 0 ? "ไม่มีฉากที่ปลอดภัยให้เลือกโยง จึงยังยืนยันไม่ได้" : undefined}
                  style={{
                    padding: "10px 20px",
                    fontSize: "0.88rem",
                    borderRadius: "10px",
                    border: "none",
                    background: forwardOnlySceneOptions.length === 0 ? "#cbd5e1" : "linear-gradient(90deg, #db2777, #ec4899)",
                    color: forwardOnlySceneOptions.length === 0 ? "#94a3b8" : "#ffffff",
                    cursor: forwardOnlySceneOptions.length === 0 ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    boxShadow: forwardOnlySceneOptions.length === 0 ? "none" : "0 4px 10px rgba(219, 39, 119, 0.18)",
                    transition: "all 0.15s ease"
                  }}
                >
                  {isSavingChoice ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              ) : (
                <button
                  type="button"
                  className="se-choice__btn-action se-choice__btn-action--save"
                  onClick={handleCreateAndConnect}
                  disabled={isCreatingNewScene}
                  style={{
                    padding: "10px 20px",
                    fontSize: "0.88rem",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(90deg, #db2777, #ec4899)",
                    color: "#ffffff",
                    cursor: isCreatingNewScene ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    boxShadow: "0 4px 10px rgba(219, 39, 119, 0.18)",
                    transition: "all 0.15s ease",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  {isCreatingNewScene ? (
                    "⏳ กำลังสร้างและเชื่อม..."
                  ) : (
                    <>
                      <span>📄</span> สร้างและเชื่อม
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    {showDiscardConfirm && (
      <ConfirmModal
        icon="⚠️"
        title="ยกเลิกการแก้ไขทางเลือกนี้?"
        description="ข้อความและการตั้งค่าที่พิมพ์ไว้จะหายไปทันที เนื่องจากยังไม่ได้กดยืนยันการแก้ไข"
        cancelText="กลับไปแก้ไขต่อ"
        confirmText="ทิ้งข้อมูลและยกเลิก"
        variant="danger"
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={performDiscardEdit}
      />
    )}
    </>
  );
};

// ─────────────────────────────────────────────
// Scene Tree Sidebar Component
// ─────────────────────────────────────────────
const SceneTreeSidebar = ({
  chapters,
  currentSceneId,
  currentChapterId,
  currentChapterTitle,
  currentSceneLabel,
  onSelectScene,
  onAddScene,
  onAddChapter,
  isPublished,
  isEnding,
  setIsEnding,
  onToggleEnding,
  onOpenEndingSettings,
  isNewScene,
  sceneTitle,
  sceneType,
  expandedChapters: externalExpandedChapters,
  setExpandedChapters: externalSetExpandedChapters,
}) => {
  const [internalExpandedChapters, setInternalExpandedChapters] = useState([]);
  const expandedChapters = externalExpandedChapters !== undefined ? externalExpandedChapters : internalExpandedChapters;
  const setExpandedChapters = externalSetExpandedChapters !== undefined ? externalSetExpandedChapters : setInternalExpandedChapters;
  const [searchQuery, setSearchQuery] = useState("");
  const [sceneFilter, setSceneFilter] = useState("all");

  useEffect(() => {
    if (chapters && chapters.length > 0) {
      const activeChs = chapters
        .filter((c) => (c.scenes || []).some((s) => String(s.id ?? s.scene_id ?? s.SceneID) === String(currentSceneId)))
        .map((c) => c.id ?? c.chapter_id ?? c.ChapterID);

      if (isNewScene && currentChapterId) {
        activeChs.push(currentChapterId);
      }

      if (activeChs.length > 0) {
        setExpandedChapters((prev) => Array.from(new Set([...prev, ...activeChs])));
      }
    }
  }, [chapters, currentSceneId, isNewScene, currentChapterId]);

  useEffect(() => {
    if (isNewScene && chapters && chapters.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById("virtual-new-scene-row");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isNewScene, chapters]);

  const toggleChapter = (chId) => {
    setExpandedChapters((prev) =>
      prev.includes(chId) ? prev.filter((id) => id !== chId) : [...prev, chId]
    );
  };

  const getScenePublishState = (scene, chapter) => {
    const statusVal = scene.status || scene.Status;
    if (statusVal) {
      const lowerStatus = statusVal.toString().toLowerCase();
      if (lowerStatus === "published" || lowerStatus === "live") return "published";
      if (lowerStatus === "draft") return "draft";
    }

    if (scene.is_published === true || scene.isPublished === true ||
      scene.is_published === "true" || scene.isPublished === "true") {
      return "published";
    }

    if (chapter) {
      const chStatus = (chapter.status || chapter.Status || "draft").toString().toLowerCase();
      if (chStatus === "published" || chStatus === "active") {
        return "published";
      }
    }

    return "draft";
  };

  const getSceneStatus = (scene, allChapters) => {
    const sceneType = scene.type || scene.scene_type || "normal";
    if (sceneType === "ending") return "ending";
    if (sceneType === "start" || sceneType === "starting") return "start";

    const hasConnection = scene.has_connection !== false && scene.hasConnection !== false;
    if (!hasConnection) return "orphan";

    return "normal";
  };

  const safeChapters = Array.isArray(chapters) ? chapters : [];

  const filteredChapters = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return safeChapters
      .map((ch, chapterIndex) => {
        const chapterTitle = ch.title || ch.chapterTitle || "";
        const chapterMatches = query ? chapterTitle.toLowerCase().includes(query) : true;

        const scenes = (ch.scenes || []).filter((scene) => {
          const title = (scene.title || scene.scene_title || scene.sceneTitle || scene.label || "").toLowerCase();
          const contentMatch = query ? (title.includes(query) || chapterTitle.toLowerCase().includes(query)) : true;

          const publishState = getScenePublishState(scene, ch);
          const filterMatch =
            sceneFilter === "all" ||
            (sceneFilter === "published" && publishState === "published") ||
            (sceneFilter === "draft" && publishState === "draft");

          return contentMatch && filterMatch;
        });

        // หากไม่มีคำค้นหา และเลือกประเภทตัวกรองทั้งหมด -> ให้แสดงตอนทั้งหมดเสมอ แม้ไม่มีฉากย่อยก็ตาม
        if (!query && sceneFilter === "all") {
          return { ...ch, scenes: ch.scenes || [] };
        }

        // หากมีคำค้นหา และชื่อตอนตรงกับคำค้นหา
        if (query && chapterTitle.toLowerCase().includes(query)) {
          return { ...ch, scenes };
        }

        // หากมีฉากย่อยที่ตรงกับฟิลเตอร์/คำค้นหา
        if (scenes.length > 0) {
          return { ...ch, scenes };
        }

        return null;
      })
      .filter(Boolean);
  }, [safeChapters, searchQuery, sceneFilter]);

  useEffect(() => {
    if (searchQuery.trim() && filteredChapters.length > 0) {
      const keys = filteredChapters.map((ch) => ch.id ?? ch.chapter_id ?? ch.ChapterID);
      setExpandedChapters((prev) => {
        const nextKeys = keys.filter((k) => k !== undefined && k !== null);
        return Array.from(new Set([...prev, ...nextKeys]));
      });
    }
  }, [filteredChapters, searchQuery]);

  return (
    <div className="se-tree" style={{ padding: "20px", display: "flex", flexDirection: "column", overflowY: "auto", flex: 1, height: "100%" }}>
      <div className="se-tree__header" style={{ marginBottom: "8px" }}>สถานะและประเภท</div>
      <div className="se-tree__toggles" style={{ marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* แสดงผลสถานะการเผยแพร่แบบ Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--gray-800)' }}>สถานะเผยแพร่</span>
          <span style={{
            fontSize: '0.78rem',
            fontWeight: '700',
            padding: '3px 8px',
            borderRadius: '999px',
            color: isPublished ? '#166534' : '#475569',
            background: isPublished ? '#d1fae5' : '#f1f5f9',
            border: `1px solid ${isPublished ? '#a7f3d0' : '#cbd5e1'}`
          }}>
            {isPublished ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
          </span>
        </div>

        {/* แสดงประเภทของฉาก */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--gray-800)' }}>ประเภทของฉาก</span>
          {(() => {
            const currentSceneObj = safeChapters
              .flatMap((ch) => ch.scenes || [])
              .find((s) => String(s.id ?? s.scene_id ?? s.SceneID) === String(currentSceneId));
            const resolvedSceneType = isEnding 
              ? "ending" 
              : (currentSceneObj?.type === "start" || currentSceneObj?.type === "starting" ? "start" : "normal");

            if (resolvedSceneType === "start" || resolvedSceneType === "starting") {
              return (
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  color: '#059669',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid #a7f3d0'
                }}>
                  ฉากเริ่มต้น
                </span>
              );
            } else if (resolvedSceneType === "ending" || isEnding) {
              return (
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  color: '#db2777',
                  background: 'rgba(219, 39, 119, 0.1)',
                  border: '1px solid #fbcfe8'
                }}>
                  ฉากจบ
                </span>
              );
            } else {
              return (
                <span style={{
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  color: '#2563eb',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid #bfdbfe'
                }}>
                  ฉากทั่วไป
                </span>
              );
            }
          })()}
        </div>
      </div>

      <div className="se-tree__header" style={{ paddingTop: "0px", marginTop: "0px", borderBottom: "none", paddingBottom: "4px", marginBottom: "6px" }}>รายการตอนและฉาก</div>

      {/* ช่องค้นหาตอนและฉาก */}
      <div className="se-search-container" style={{ marginBottom: "12px", position: "relative" }}>
        <input
          type="text"
          className="se-input"
          placeholder="ค้นหาตอน หรือฉาก..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px 10px 38px",
            fontSize: "0.85rem",
            borderRadius: "10px",
            border: "1.5px solid #e2e8f0",
            boxSizing: "border-box",
            backgroundColor: "#f8fafc",
            outline: "none",
            color: "#1e293b",
            transition: "all 0.2s"
          }}
        />
        <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
      </div>

      {/* แถบฟิลเตอร์ 3 ปุ่มเรียงกันในแถวเดียว แยกเป็นกล่องแคปซูลอิสระจากกัน (ไม่ Wrap ตกบรรทัด) */}
      <div className="se-tree__filters" style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: "6px",
        backgroundColor: "transparent",
        padding: "0",
        borderRadius: "0",
        marginBottom: "16px"
      }}>
        <button
          type="button"
          className={`se-tree__filter-btn ${sceneFilter === "all" ? "active" : ""}`}
          onClick={() => setSceneFilter("all")}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "6px 2px",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: sceneFilter === "all" ? "1px solid #fbcfe8" : "1px solid #e2e8f0",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            backgroundColor: sceneFilter === "all" ? "#fff0f5" : "#ffffff",
            color: sceneFilter === "all" ? "#db2777" : "#475569",
            fontWeight: "700",
            whiteSpace: "nowrap"
          }}
        >
          ทั้งหมด
        </button>
        <button
          type="button"
          className={`se-tree__filter-btn ${sceneFilter === "published" ? "active" : ""}`}
          onClick={() => setSceneFilter("published")}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "6px 2px",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: sceneFilter === "published" ? "1px solid #fbcfe8" : "1px solid #e2e8f0",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            backgroundColor: sceneFilter === "published" ? "#fff0f5" : "#ffffff",
            color: sceneFilter === "published" ? "#db2777" : "#475569",
            fontWeight: "700",
            whiteSpace: "nowrap"
          }}
        >
          เผยแพร่
        </button>
        <button
          type="button"
          className={`se-tree__filter-btn ${sceneFilter === "draft" ? "active" : ""}`}
          onClick={() => setSceneFilter("draft")}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "6px 2px",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: sceneFilter === "draft" ? "1px solid #fbcfe8" : "1px solid #e2e8f0",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
            backgroundColor: sceneFilter === "draft" ? "#fff0f5" : "#ffffff",
            color: sceneFilter === "draft" ? "#db2777" : "#475569",
            fontWeight: "700",
            whiteSpace: "nowrap"
          }}
        >
          ฉบับร่าง
        </button>
      </div>

      <div className="se-tree__list" style={{ paddingRight: "4px" }}>
        {filteredChapters.map((ch, chapterIndex) => {
          const chapterKey = ch.id ?? ch.chapter_id ?? ch.ChapterID ?? chapterIndex;
          const isExpanded = expandedChapters.includes(chapterKey);
          let chapterScenes = Array.isArray(ch.scenes) ? [...ch.scenes] : [];
          const isNewSceneForThisChapter = isNewScene && String(chapterKey) === String(currentChapterId);
          if (isNewSceneForThisChapter) {
            chapterScenes.push({
              id: "new",
              scene_id: "new",
              title: sceneTitle || "กำลังสร้างฉากใหม่",
              label: sceneTitle || "กำลังสร้างฉากใหม่",
              status: "draft",
              type: isEnding ? "ending" : (sceneType || "normal"),
              is_published: false,
              isVirtual: true
            });
          }

          const chDisplayNum =
            ch.chapterNumber ??
            ch.order_index ??
            (chapterIndex + 1);

          return (
            <div key={chapterKey} className="se-tree__chapter" >
              <button
                className="se-tree__ch-row"
                onClick={() => toggleChapter(chapterKey)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{
                    transform: isExpanded ? "rotate(90deg)" : "none",
                    transition: "transform .18s",
                    flexShrink: 0,
                  }}
                >
                  <path d="M4 3l4 3-4 3V3z" fill="currentColor" />
                </svg>

                <span className="se-tree__ch-label">
                  ตอนที่ {chDisplayNum} — {ch.title}
                </span>

              </button>

              {isExpanded && (
                <div className="se-tree__scenes">
                  {chapterScenes.map((scene, sceneIndex) => {
                    const sceneKey = scene.id ?? scene.scene_id ?? scene.SceneID ?? sceneIndex;
                    const sceneIdValue = scene.id ?? scene.scene_id ?? scene.SceneID;
                    const chapterIdValue = ch.id ?? ch.chapter_id ?? ch.ChapterID;
                    const isCurrent = String(sceneIdValue) === String(currentSceneId);

                    const scDisplayNum = sceneIndex + 1;
                    const sceneStatus = isCurrent
                      ? (isEnding ? "ending" : ((scene.type === "start" || scene.type === "starting" || scene.scene_type === "start" || scene.scene_type === "starting") ? "start" : "normal"))
                      : getSceneStatus(scene, safeChapters);
                    const publishState = getScenePublishState(scene, ch);

                    let playIcon = null;
                    if (sceneStatus === "start") {
                      playIcon = (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          height: "16px",
                          borderRadius: "4px",
                          backgroundColor: "#e8f5e9", // สีเขียวพาสเทลจาง
                          color: "#16A34A", // สีเขียว
                          fontSize: "0.55rem",
                          marginRight: "6px",
                          flexShrink: 0
                        }}>
                          ▶
                        </span>
                      );
                    } else if (sceneStatus === "ending") {
                      playIcon = (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          height: "16px",
                          borderRadius: "4px",
                          backgroundColor: "#fce4ec", // สีชมพูพาสเทลจาง
                          color: "#db2777", // สีชมพูเข้ม
                          fontSize: "0.55rem",
                          marginRight: "6px",
                          flexShrink: 0
                        }}>
                          ▶
                        </span>
                      );
                    }

                    const dotColor = publishState === "published" ? "#22c55e" : "#cbd5e1";
                    const tooltipMsg = publishState === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง";

                    return (
                      <div key={sceneKey} className="se-tree__scene-wrapper" id={String(sceneIdValue) === "new" ? "virtual-new-scene-row" : undefined}>
                        <button
                          className={`se-tree__scene-row ${isCurrent ? "se-tree__scene-row--active" : ""}`}
                          onClick={() => onSelectScene(chapterIdValue, sceneIdValue)}
                          style={{ display: "flex", alignItems: "center", width: "100%" }}
                        >
                          {playIcon}
                          <span className="se-tree__scene-text" style={{ flex: 1, textAlign: "left" }}>
                            ฉากที่ {chDisplayNum}.{scDisplayNum} — {scene.label || scene.title || scene.sceneTitle || "ฉากไม่มีชื่อ"}
                          </span>
                          <span
                            className="se-tree__scene-status"
                            style={{
                              color: dotColor,
                              fontSize: "0.7rem",
                              marginLeft: "4px",
                              flexShrink: 0,
                              lineHeight: 1
                            }}
                            title={tooltipMsg}
                          >
                            ●
                          </span>
                        </button>
                      </div>
                    );
                  })}

                  <button
                    className="se-tree__add-scene"
                    onClick={() => onAddScene(ch.id ?? ch.chapter_id ?? ch.ChapterID)}
                  >
                    + เพิ่มฉาก
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="se-tree__add-ch" onClick={onAddChapter} style={{ marginTop: "16px" }}>
        เพิ่มตอนใหม่
      </button>

      {/* สัญลักษณ์ประเภทฉาก & สถานะเผยแพร่ */}
      <div className="se-tree__legend" style={{
        marginTop: "20px",
        padding: "16px",
        borderRadius: "12px",
        backgroundColor: "#f8fafc",
        border: "1px solid #e2e8f0",
        fontSize: "0.82rem",
        color: "#475569",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: "12px"
      }}>
        <div style={{ fontWeight: "800", color: "#1f2937", marginBottom: "2px", fontSize: "0.85rem" }}>สัญลักษณ์ประเภทฉาก</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            backgroundColor: "#e8f5e9",
            color: "#16A34A",
            fontSize: "0.6rem",
            flexShrink: 0
          }}>
            ▶
          </span>
          <span style={{ fontWeight: "600", color: "#334155" }}>ฉากเริ่มต้น</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "6px",
            backgroundColor: "#fce4ec",
            color: "#db2777",
            fontSize: "0.6rem",
            flexShrink: 0
          }}>
            ▶
          </span>
          <span style={{ fontWeight: "600", color: "#334155" }}>ฉากจบ</span>
        </div>
        
        <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "4px", paddingTop: "8px", display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#22c55e", fontSize: "0.9rem" }}>●</span> เผยแพร่แล้ว
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>●</span> ฉบับร่าง
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Confirm Modal (ใช้ร่วมกันสำหรับ dialog แจ้งเตือน/ยืนยันแบบกึ่งกลางจอ
// เช่น ยืนยันการลบทางเลือก, เตือนยังไม่ได้บันทึก, ยืนยันการเผยแพร่)
// ─────────────────────────────────────────────
const ConfirmModal = ({
  icon = "⚠️",
  title,
  description,
  cancelText = "ยกเลิก",
  confirmText,
  onCancel,
  onConfirm,
  variant = "default", // "default" | "danger" | "publish"
}) => {
  const iconVariantClass =
    variant === "danger" ? " se-modal-icon--danger" : variant === "publish" ? " se-modal-icon--publish" : "";
  const confirmVariantClass =
    variant === "danger" ? " se-modal-btn--danger" : variant === "publish" ? " se-modal-btn--publish" : " se-modal-btn--save";

  return (
    <div className="se-modal-overlay">
      <div className="se-modal-content">
        <div className={`se-modal-icon${iconVariantClass}`}>{icon}</div>
        {title && <h3 className="se-modal-title">{title}</h3>}
        {description && <p className="se-modal-desc">{description}</p>}
        <div className="se-modal-actions">
          <button type="button" className="se-modal-btn se-modal-btn--cancel" onClick={onCancel}>
            {cancelText}
          </button>
          {confirmText && (
            <button type="button" className={`se-modal-btn${confirmVariantClass}`} onClick={onConfirm}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
const SceneEditorPage = ({
  novelId,
  chapterId,
  sceneId,
  onNavigate,
  initialSceneTitle,
  initialNovelTitle,
  initialChapterTitle,
  x,
  y,
}) => {
  const navigate = useNavigate();
  const [novelTitle, setNovelTitle] = useState(initialNovelTitle || "");
  const [chapterTitle, setChapterTitle] = useState(initialChapterTitle || "");
  const [sceneLabel, setSceneLabel] = useState("");

  const [sceneTitle, setSceneTitle] = useState("");
  const [content, setContent] = useState("");
  const [sceneType, setSceneType] = useState("normal");
  const [isPublished, setIsPublished] = useState(false);

  // สังเกตตอนปัจจุบันของฉาก (มีประโยชน์มากเมื่อสร้างฉากใหม่ชั่วคราวและยังไม่มีตอนผูกไว้)
  const [currentSelectedChapterId, setCurrentSelectedChapterId] = useState(chapterId);

  // States สำหรับเก็บค่าพิกัด เพื่อป้องกันตำแหน่งกราฟเคลื่อนหายเวลาบันทึก
  const [coordinateX, setCoordinateX] = useState(x ?? 0);
  const [coordinateY, setCoordinateY] = useState(y ?? 0);
  useEffect(() => {
    const editorEl = document.querySelector('.se-quill');
    if (!editorEl) return;

    const handleImageClick = (e) => {
      // ถ้าตัวที่คลิกเป็นรูปภาพ (IMG) และอยู่ในกลุ่มของ Quill Editor
      if (e.target.tagName === 'IMG' && e.target.closest('.ql-editor')) {
        const img = e.target;

        // สั่งให้ Browser ทำการลากคลุม (Select) รูปภาพนี้ให้ทันทีแบบอัตโนมัติ
        const range = document.createRange();
        range.selectNode(img);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };
    document.addEventListener('click', handleImageClick);

    // คืนค่าทำความสะอาดเมื่อปิดหน้าจอ
    return () => {
      document.removeEventListener('click', handleImageClick);
    };
  }, []);
  const charCount = useMemo(() => {
    const textOnly = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return textOnly.length;
  }, [content]);
  const [isEnding, setIsEnding] = useState(false);
  const [endingTitle, setEndingTitle] = useState("");
  const [endingType, setEndingType] = useState("true");
  const [endingDescription, setEndingDescription] = useState("");
  const [nextSceneTarget, setNextSceneTarget] = useState(null);
  const [endingDescriptionEnabled, setEndingDescriptionEnabled] = useState(false);
  const [showEndingSettingsDialog, setShowEndingSettingsDialog] = useState(false);
  const [choices, setChoices] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [expandedChapters, setExpandedChapters] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isUnsaved]);
  const [lastSaved, setLastSaved] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // States สำหรับ dialog เพิ่มตอน/ฉากใหม่
  const [showAddChapterDialog, setShowAddChapterDialog] = useState(false);
  const [isTreeSidebarOpen, setIsTreeSidebarOpen] = useState(false);
  const [showAddSceneDialog, setShowAddSceneDialog] = useState(false);
  const [isCreatingStandaloneScene, setIsCreatingStandaloneScene] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [selectedChapterForNewScene, setSelectedChapterForNewScene] = useState(null);

  const [draftChapterStatus, setDraftChapterStatus] = useState("draft");
  const [isSubmittingChapter, setIsSubmittingChapter] = useState(false);
  const [isSuccessCreatingChapter, setIsSuccessCreatingChapter] = useState(false);
  const [createChapterError, setCreateChapterError] = useState("");

  const [isSubmittingScene, setIsSubmittingScene] = useState(false);
  const [isSuccessCreatingScene, setIsSuccessCreatingScene] = useState(false);
  const [createSceneError, setCreateSceneError] = useState("");

  const token = localStorage.getItem("token");
  const quillRef = useRef(null);
  const saveDraftTimer = useRef(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [choiceToDelete, setChoiceToDelete] = useState(null);

  const isNewScene = String(sceneId) === "new";

  const sceneDraftKey = useMemo(
    () => `scene-editor-draft:${novelId}:${chapterId}:${sceneId}`,
    [novelId, chapterId, sceneId]
  );

  const restoreDraft = useCallback(() => {
    if (!sceneDraftKey) return;
    try {
      const rawDraft = localStorage.getItem(sceneDraftKey);
      if (!rawDraft) return;
      const savedDraft = JSON.parse(rawDraft);
      if (!savedDraft || typeof savedDraft !== "object") return;

      // เพิ่มการเช็กเผื่อเวลาที่ข้อมูลหลังบ้านเพิ่งโหลดเสร็จ จะได้ไม่โดนทับ
      if (savedDraft.sceneTitle !== undefined) setSceneTitle(savedDraft.sceneTitle);
      if (savedDraft.sceneLabel !== undefined) setSceneLabel(savedDraft.sceneLabel);
      if (savedDraft.content !== undefined) setContent(savedDraft.content);
      if (savedDraft.sceneType) setSceneType(savedDraft.sceneType);

      setEndingTitle(savedDraft.endingTitle || "");
      setEndingType(savedDraft.endingType || "true");
      setEndingDescription(savedDraft.endingDescription || "");
      setEndingDescriptionEnabled(
        savedDraft.endingDescriptionEnabled !== undefined
          ? savedDraft.endingDescriptionEnabled
          : Boolean(savedDraft.endingDescription || savedDraft.ending_description)
      );
      // 🛡️ ไม่เอา choices จาก draft มาทับ choices จริงจาก Backend เพื่อความเรียลไทม์เสมอ
      if (savedDraft.draftSavedAt) {
        const savedTime = new Date(savedDraft.draftSavedAt);
        if (!Number.isNaN(savedTime.getTime())) {
          setDraftSavedAt(savedTime);
        }
      }
    } catch (err) {
      console.warn("Unable to restore scene draft:", err);
    }
  }, [sceneDraftKey]);

  const clearDraft = useCallback(() => {
    if (!sceneDraftKey) return;
    localStorage.removeItem(sceneDraftKey);
    setDraftSavedAt(null);
  }, [sceneDraftKey]);

  const saveDraftToStorage = useCallback(() => {
    if (!sceneDraftKey) return;

    const draftPayload = {
      sceneTitle,
      sceneLabel,
      content,
      sceneType,
      endingTitle,
      endingType,
      endingDescription,
      endingDescriptionEnabled,
      choices,
      draftSavedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(sceneDraftKey, JSON.stringify(draftPayload));
      setDraftSavedAt(new Date());
    } catch (err) {
      console.warn("Unable to save scene draft:", err);
    }
  }, [sceneDraftKey, sceneTitle, sceneLabel, content, sceneType, endingTitle, endingType, endingDescription, endingDescriptionEnabled, choices]);

  const normalizeMinioUrl = useCallback((url) => {
    if (!url) return url;
    return url.replace("http://minio:9000", "http://localhost:9000");
  }, []);

  const handleQuillImageUpload = useCallback(() => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setImageUploadError("");
      setIsImageUploading(true);

      try {
        const formData = new FormData();
        formData.append("image", file);

        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const uploadRes = await fetch(`${API_BASE_URL}/upload/image`, {
          method: "POST",
          body: formData,
          headers,
        });

        if (!uploadRes.ok) {
          const errJson = await uploadRes.json().catch(() => null);
          throw new Error(errJson?.error || errJson?.message || "ไม่สามารถอัปโหลดรูปภาพได้");
        }

        const uploadData = await uploadRes.json();
        const imageUrl = normalizeMinioUrl(uploadData?.data?.full_url || uploadData?.full_url);
        const editor = quillRef.current?.getEditor?.();
        const range = editor?.getSelection?.() || { index: (content?.length || 0) };

        if (editor) {
          editor.insertEmbed(range.index ?? 0, "image", imageUrl);
          editor.setSelection((range.index ?? 0) + 1);
          // immediately sync editor HTML into state so autosave captures image
          try {
            const newHtml = editor.root?.innerHTML;
            if (typeof newHtml === "string") setContent(newHtml);
          } catch (e) {
            // ignore
          }
          // try to persist draft immediately
          try { saveDraftToStorage(); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        console.error("Scene editor image upload error:", err);
        setImageUploadError(err?.message || "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
      } finally {
        setIsImageUploading(false);
      }
    };
  }, [content, normalizeMinioUrl, token, saveDraftToStorage]);

  const quillModules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ header: '1' }, { header: '2' }, { font: [] }],
          [{ size: [] }],
          ['bold', 'italic', 'underline', 'strike', 'blockquote'],
          // แนะนำเพิ่ม [{ align: [] }] เข้ามาเพื่อให้คนเขียนจัดรูปให้อยู่กึ่งกลาง ชิดซ้าย หรือชิดขวาได้แบบ ReadAWrite
          [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }, { align: [] }],
          ['link', 'image', 'video'],
          ['clean'],
        ],
        handlers: {
          image: handleQuillImageUpload,
        },
      },
      // ✂️ ลบ imageResize: {} ตรงนี้ออกไปแล้ว
    };
  }, [handleQuillImageUpload]);

  const fetchSceneData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // ดึงข้อมูลรายชื่อตอนทั้งหมดก่อนเพื่อประมวลผล
      const chaptersRes = await fetch(`${API_BASE_URL}/novels/${novelId}/chapters`, {
        headers,
      });
      let chaptersData = [];
      if (chaptersRes.ok) {
        const chaptersResult = await chaptersRes.json();
        chaptersData =
          chaptersResult?.data?.chapters ||
          chaptersResult?.chapters ||
          chaptersResult?.data ||
          chaptersResult ||
          [];
        setChapters(Array.isArray(chaptersData) ? chaptersData : []);
      }

      // ดึงข้อมูลนิยายเพื่อแสดงชื่อเรื่องที่ header เมื่อสร้างฉากใหม่
      try {
        const novelRes = await fetch(`${API_BASE_URL}/novels/${novelId}`, { headers });
        if (novelRes.ok) {
          const novelResult = await novelRes.json().catch(() => null);
          const novelData = novelResult?.novel || novelResult?.data?.novel || novelResult?.data || novelResult || {};
          setNovelTitle(
            novelData.title ||
            novelData.novel_title ||
            novelData.name ||
            novelData.novelTitle ||
            "ไม่ระบุชื่อนิยาย"
          );
        }
      } catch (e) {
        // ignore
      }

      if (!isNewScene) {
        const sceneRes = await fetch(`${API_BASE_URL}/scenes/${sceneId}`, {
          headers,
        });
        if (!sceneRes.ok) throw new Error("ไม่สามารถดึงข้อมูลรายละเอียดฉากได้");
        const sceneResult = await sceneRes.json();
        const sceneData = sceneResult?.data || sceneResult;

        // ─── ✨ 1. ตรวจสอบข้อมูลฉบับร่างใน localStorage ✨ ───
        let draftData = null;
        try {
          const rawDraft = localStorage.getItem(sceneDraftKey);
          if (rawDraft) {
            draftData = JSON.parse(rawDraft);
          }
        } catch (e) {
          console.warn("Error parsing draft during fetch:", e);
        }

        setNovelTitle(sceneData.novelTitle || sceneData.novel_title || "ไม่ระบุชื่อนิยาย");
        setChapterTitle(sceneData.chapterTitle || sceneData.chapter_title || "ไม่ระบุชื่อตอน");

        // ─── ✨ 2. ผสานค่าระหว่าง Draft กับ Backend ✨ ───
        const resolvedSceneTitle = draftData?.sceneTitle !== undefined ? draftData.sceneTitle : (sceneData.sceneTitle || sceneData.scene_title || sceneData.title || "");
        setSceneTitle(resolvedSceneTitle);

        setSceneLabel(
          draftData?.sceneLabel !== undefined
            ? draftData.sceneLabel
            : (sceneData.sceneLabel || sceneData.scene_label || sceneData.sceneTitle || sceneData.scene_title || sceneData.title || `ฉาก ${sceneData.scene_id || sceneData.id}`)
        );

        setContent(draftData?.content !== undefined ? draftData.content : (sceneData.content || ""));

        const resolvedSceneType = draftData?.sceneType !== undefined ? draftData.sceneType : (sceneData.type || sceneData.scene_type || "normal");
        setSceneType(resolvedSceneType);

        // ข้อมูลของส่วนฉากจบ (Ending Settings)
        const isBackendEnding = sceneData.type === "ending" || sceneData.isEnding === true || sceneData.is_ending === true || sceneData.isEnding === "true" || sceneData.is_ending === "true";
        const resolvedIsEnding = draftData?.isEnding !== undefined 
          ? !!draftData.isEnding 
          : (draftData?.sceneType === "ending" ? true : isBackendEnding);
        setIsEnding(resolvedIsEnding);
        setEndingTitle(draftData?.endingTitle !== undefined ? draftData.endingTitle : (sceneData.endingTitle || sceneData.ending_title || ""));
        setEndingType(draftData?.endingType !== undefined ? draftData.endingType : (sceneData.endingType || sceneData.ending_type || "true"));
        setEndingDescription(draftData?.endingDescription !== undefined ? draftData.endingDescription : (sceneData.endingDescription || sceneData.ending_description || ""));
        setEndingDescriptionEnabled(
          draftData?.endingDescriptionEnabled !== undefined
            ? draftData.endingDescriptionEnabled
            : Boolean(sceneData.endingDescription || sceneData.ending_description)
        );

        // ค้นหาตอนที่แท้จริงจากโครงสร้างของตอนและฉากย่อย
        let foundChapterId = null;
        if (Array.isArray(chaptersData)) {
          for (const ch of chaptersData) {
            const scenesList = Array.isArray(ch.scenes) ? ch.scenes : [];
            const hasScene = scenesList.some(s =>
              String(s.scene_id ?? s.sceneId ?? s.id ?? s.ID) === String(sceneId)
            );
            if (hasScene) {
              foundChapterId = ch.chapter_id ?? ch.chapterId ?? ch.id ?? ch.ID;
              break;
            }
          }
        }

        const resolvedChId = foundChapterId ?? sceneData.ChapterID ?? sceneData.chapter_id ?? sceneData.chapterId ?? chapterId;
        const parentChapter = chaptersData.find(ch =>
          String(ch.id ?? ch.chapter_id ?? ch.ChapterID ?? ch.chapterId) === String(resolvedChId)
        );
        const parentStatus = parentChapter ? (parentChapter.status || parentChapter.Status || "draft").toString().toLowerCase() : "draft";

        const statusStr = (sceneData.status || sceneData.Status || parentStatus).toString().toLowerCase();
        const isPub = statusStr === "published" ||
          sceneData.isPublished === true ||
          sceneData.is_published === true ||
          sceneData.isPublished === "true" ||
          sceneData.is_published === "true";
        setIsPublished(isPub);

        // ดึงพิกัดเพื่อนำมาสืบทอด
        setCoordinateX(sceneData.x ?? sceneData.X ?? x ?? 0);
        setCoordinateY(sceneData.y ?? sceneData.Y ?? y ?? 0);

        if (resolvedChId) {
          setCurrentSelectedChapterId(String(resolvedChId));
        } else {
          setCurrentSelectedChapterId(chapterId);
        }

        // ข้อมูลของ Choices ทางเลือกท้ายตอน (ใช้ข้อมูลล่าสุดจาก Backend เสมอเพื่อความเรียลไทม์)
        const backendChoices = (Array.isArray(sceneData.choices) ? sceneData.choices : []).map((choice) => ({
          ...choice,
          id: choice.id ?? choice.choice_id ?? choice.choiceId ?? `choice-${choice.choice_id || choice.id || Date.now()}`,
          text: choice.text ?? choice.label ?? choice.Label ?? "",
          targetSubScene: choice.targetSubScene ?? choice.to_scene_id ?? choice.toSceneID ?? choice.toSceneId ?? "",
        }));

        setChoices(backendChoices);

        if (draftData?.draftSavedAt) {
          setDraftSavedAt(new Date(draftData.draftSavedAt));
        }
      } else {
        // กรณีเป็นฉากใหม่ชั่วคราวที่คลิกวางจาก Canvas
        const defaultNewSceneTitle = initialSceneTitle?.trim() || "";
        setSceneTitle(defaultNewSceneTitle);
        setSceneLabel(defaultNewSceneTitle || "กำลังสร้างฉากใหม่");
        setContent("");
        setSceneType("normal");
        setIsPublished(false);
        setIsEnding(false);
        setEndingTitle("");
        setEndingType("true");
        setEndingDescription("");
        setEndingDescriptionEnabled(false);
        setChoices([]);

        // รับและตั้งค่าพิกัดชั่วคราว
        setCoordinateX(x ?? 0);
        setCoordinateY(y ?? 0);

        // เลือกตอนเป็น chapterId ที่ระบุมาจากบอร์ดโครงสร้างเนื้อเรื่องเป็นอันดับแรก
        const activeChId = chapterId && chapterId !== "new" ? chapterId : (chaptersData[0]?.id ?? chaptersData[0]?.chapter_id ?? chaptersData[0]?.ChapterID ?? chaptersData[0]?.chapterId);
        if (activeChId) {
          setCurrentSelectedChapterId(String(activeChId));
          const foundChapter = chaptersData.find((c) => String(c.id ?? c.chapter_id ?? c.ChapterID ?? c.chapterId) === String(activeChId));
          if (foundChapter) {
            setChapterTitle(foundChapter.title || foundChapter.Title || `ตอนที่ ${foundChapter.episode ?? "?"}`);
          }
        }
      }
    } catch (err) {
      console.error("Fetch Scene Data Error:", err);
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setIsLoading(false);
      setIsUnsaved(false);
    }
  }, [novelId, sceneId, token, isNewScene, initialSceneTitle, x, y, chapterId, sceneDraftKey]);
  useEffect(() => {
    fetchSceneData();
  }, [fetchSceneData]);

  useEffect(() => {
    const handleDataUpdate = () => {
      fetchSceneData();
    };
    window.addEventListener("novel-data-updated", handleDataUpdate);
    return () => window.removeEventListener("novel-data-updated", handleDataUpdate);
  }, [fetchSceneData]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        restoreDraft();
      }, 50); // ดีเลย์ 50ms รอให้ State ของ API นิ่งก่อนแล้วดึงตััวดราฟต์มาทับ
      return () => clearTimeout(timer);
    }
  }, [isLoading, restoreDraft]);

  // Autosave: debounce and trigger when any editable field changes
  useEffect(() => {
    if (!sceneDraftKey) return;
    const timer = setTimeout(() => {
      try {
        saveDraftToStorage();
      } catch (err) {
        console.warn("Autosave failed:", err);
      }
    }, 500);

    return () => clearTimeout(timer);
    // include all editable fields so any change triggers autosave
  }, [
    sceneDraftKey,
    sceneTitle,
    sceneLabel,
    content,
    sceneType,
    endingTitle,
    endingType,
    endingDescription,
    endingDescriptionEnabled,
    JSON.stringify(choices || []),
  ]);

  // Persist draft on unload to avoid losing edits on refresh/close
  useEffect(() => {
    const handler = (e) => {
      try { saveDraftToStorage(); } catch (err) { /* ignore */ }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveDraftToStorage]);

  const handleSave = async (overridePublishStatus = null, returnToManager = false, overrideChoices = null, overrideIsEnding = null, showToast = false) => {
    const resolvedSceneTitle = sceneTitle.trim() || (isNewScene ? `ฉากใหม่ ${Date.now()}` : "");
    if (!resolvedSceneTitle) {
      setErrorMsg("ยังไม่ได้กรอกชื่อฉาก ไม่สามารถกดบันทึกเพื่อสร้างฉากได้");
      setIsSaving(false);
      return;
    }

    const editorContainer = document.querySelector('.se-editor');
    const savedScrollTop = editorContainer ? editorContainer.scrollTop : 0;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const currentPublishState = overridePublishStatus !== null ? overridePublishStatus : isPublished;
      const currentIsEnding = overrideIsEnding !== null ? overrideIsEnding : isEnding;
      const currentChoices = Array.isArray(overrideChoices) ? overrideChoices : choices;

      let targetChapterId = (chapterId && chapterId !== "new") ? chapterId : currentSelectedChapterId;
      if ((!targetChapterId || targetChapterId === "new" || isNaN(parseInt(targetChapterId, 10))) && !isNewScene) {
        let foundChapterId = null;
        if (Array.isArray(chapters)) {
          for (const ch of chapters) {
            const scenesList = Array.isArray(ch.scenes) ? ch.scenes : [];
            const hasScene = scenesList.some(s =>
              String(s.scene_id ?? s.sceneId ?? s.id ?? s.ID) === String(sceneId)
            );
            if (hasScene) {
              foundChapterId = ch.chapter_id ?? ch.chapterId ?? ch.id ?? ch.ID;
              break;
            }
          }
        }
        if (foundChapterId) {
          targetChapterId = String(foundChapterId);
        }
      }

      if (!targetChapterId || targetChapterId === "new" || isNaN(parseInt(targetChapterId, 10))) {
        throw new Error("ไม่พบตอนสำหรับฉากนี้ กรุณากลับไปเพิ่มจากหน้าโครงสร้างเนื้อเรื่องใหม่");
      }

      // บันทึกข้อมูลตัวฉากหลัก พร้อมพิกัด X, Y
      const payload = {
        novel_id: parseInt(novelId, 10),
        chapter_id: parseInt(targetChapterId, 10),
        title: resolvedSceneTitle,
        content: content,
        x: Math.round(coordinateX),
        y: Math.round(coordinateY),
        type: currentIsEnding
          ? "ending"
          : sceneType === "ending"
            ? "normal"
            : sceneType || "normal",
        status: currentPublishState ? "published" : "draft",
        ending_title: currentIsEnding ? endingTitle : "",
        ending_type: currentIsEnding ? endingType : "",
        ending_description: currentIsEnding && endingDescriptionEnabled ? endingDescription : "",
        is_ending: currentIsEnding,
        choices: currentChoices.map((c) => {
          const targetStr = String(c.targetSubScene ?? c.to_scene_id ?? c.toSceneID ?? c.toSceneId ?? "");
          const targetParts = targetStr.includes("||") ? targetStr.split("||") : [targetStr];
          const toSceneIdCandidate = parseInt(targetParts[targetParts.length - 1], 10);

          return {
            ...(c.id && !String(c.id).startsWith("choice-new-") ? { choice_id: parseInt(String(c.id), 10) } : {}),
            label: c.text || c.label || c.Label || "เลือกเส้นทางนี้",
            text: c.text || c.label || c.Label || "เลือกเส้นทางนี้",
            targetSubScene: targetStr,
            to_scene_id: Number.isNaN(toSceneIdCandidate) ? 0 : toSceneIdCandidate,
          };
        }),
      };

      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const requestUrl = isNewScene ? `${API_BASE_URL}/scenes` : `${API_BASE_URL}/scenes/${sceneId}`;
      const method = isNewScene ? "POST" : "PUT";

      const response = await fetch(requestUrl, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errMsg = (typeof errData?.error === "object" ? errData.error?.message : errData?.error) || errData?.message;
        throw new Error(errMsg || "ไม่สามารถบันทึกข้อมูลฉากได้");
      }

      clearDraft();
      setLastSaved(new Date());
      setIsUnsaved(false);

      if (isNewScene) {
        const savedData = await response.json().catch(() => null);
        const savedSceneId = savedData?.data?.scene_id || savedData?.scene_id || savedData?.data?.id || savedData?.id;

        if (savedSceneId) {
          setIsSaving(false);
          if (showToast) {
            try { sessionStorage.setItem("toastMessage", "บันทึกฉากเรียบร้อยแล้ว"); } catch (e) { /* ignore */ }
          }
          // Replace the current history entry so that pressing Back
          // doesn't return to the temporary `scene=new` route.
          const chapterQuery = targetChapterId ? `?chapterId=${encodeURIComponent(targetChapterId)}` : "";
          try {
            navigate(`/writer/${novelId}/scene/${savedSceneId}${chapterQuery}`, { replace: true });
          } catch (e) {
            // fallback to onNavigate if navigate isn't available
            if (typeof onNavigate === "function") {
              onNavigate("scene-editor", { novelId, chapterId: targetChapterId, sceneId: savedSceneId });
            }
          }
          return true;
        }
      }

      await fetchSceneData(true);
      if (editorContainer) {
        editorContainer.scrollTop = savedScrollTop;
      }
      setTimeout(() => {
        const el = document.querySelector('.se-editor');
        if (el) el.scrollTop = savedScrollTop;
      }, 50);

      window.dispatchEvent(new Event("novel-data-updated"));

      if (showToast) {
        setToastMessage("บันทึกฉากเรียบร้อยแล้ว");
        setTimeout(() => setToastMessage(null), 2500);
      }
      return true;
    } catch (err) {
      console.error("Save scene error:", err);
      setErrorMsg(err.message || "ไม่สามารถบันทึกข้อมูลฉากได้");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!sceneTitle.trim()) {
      setErrorMsg("ยังไม่มีชื่อฉาก ไม่สามารถกดเผยแพร่ได้");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const targetChapterId = (chapterId && chapterId !== "new") ? chapterId : currentSelectedChapterId;
      if (!targetChapterId || targetChapterId === "new" || isNaN(parseInt(targetChapterId, 10))) {
        throw new Error("ไม่พบตอนสำหรับฉากนี้");
      }

      // 1. เผยแพร่ตัวฉากหลัก
      await handleSave(true, false);

      // 2. เผยแพร่ตัวตอนเพื่อให้คนอ่านมองเห็นด้วย
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const chRes = await fetch(`${API_BASE_URL}/chapters/${targetChapterId}`, { headers });
      if (chRes.ok) {
        const chResult = await chRes.json();
        const chData = chResult?.data || chResult;

        const payload = {
          novel_id: parseInt(novelId, 10),
          episode: chData.episode || 1,
          title: chData.title || "ตอนไม่มีชื่อ",
          status: "published" // อัปเดตตอนเป็นสถานะเผยแพร่
        };

        const putRes = await fetch(`${API_BASE_URL}/chapters/${targetChapterId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload)
        });

        if (!putRes.ok) {
          console.warn("ไม่สามารถเปลี่ยนสถานะของตอนเป็นเผยแพร่ได้");
        }
      }

      setToastMessage("เผยแพร่ตอนและฉากย่อยเรียบร้อยแล้ว");
      setTimeout(() => setToastMessage(null), 2500);
      await fetchSceneData();
    } catch (err) {
      console.error("Publish error:", err);
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการเผยแพร่");
      setIsPublished(false); // Rollback UI if failed
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnding = async (value) => {
    if (value) {
      if (choices.length > 0) {
        setErrorMsg(
          "ไม่สามารถตั้งเป็นฉากจบได้ เนื่องจากฉากนี้มีทางเลือกไปยังฉากอื่นอยู่ **(กรุณาลบทางเลือกในฉากนี้ออกก่อน)**"
        );
        setTimeout(() => setErrorMsg(null), 8000);
        return;
      }

      if (sceneType === "start") {
        setErrorMsg("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ **กรุณาเลือกฉากอื่นเป็นฉากจบ**");
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }

      setIsEnding(true);
      setShowEndingSettingsDialog(true);
      return;
    }

    await handleSave(null, false, null, false);
  };

  const handleOpenEndingSettings = () => {
    if (choices.length > 0) {
      setErrorMsg(
        "ไม่สามารถตั้งเป็นฉากจบได้ เนื่องจากฉากนี้มีทางเลือกไปยังฉากอื่นอยู่ **(กรุณาลบทางเลือกในฉากนี้ออกก่อน)**"
      );
      setTimeout(() => setErrorMsg(null), 8000);
      return;
    }

    if (sceneType === "start") {
      setErrorMsg("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ **กรุณาเลือกฉากอื่นเป็นฉากจบ**");
      setTimeout(() => setErrorMsg(null), 5000);
      return;
    }

    setShowEndingSettingsDialog(true);
  };

  const saveEndingSettings = async () => {
    if (sceneType === "start") {
      setErrorMsg("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ กรุณาเลือกฉากอื่นเป็นฉากจบ");
      setTimeout(() => setErrorMsg(null), 5000);
      return;
    }

    setIsEnding(true);
    await handleSave(null, false, null, true);
    setShowEndingSettingsDialog(false);
  };

  const addChoice = () => {
    const newChoice = {
      id: `choice-new-${Date.now()}`,
      text: "",
      targetType: "same",
      targetSubScene: "",
      newSceneTitle: "",
    };
    setChoices((prev) => [...prev, newChoice]);
  };

  const updateChoice = (updated) => {
    setChoices((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const saveChoiceImmediately = async (updated) => {
    const nextChoices = choices.map((c) => (c.id === updated.id ? updated : c));
    if (!nextChoices.some((c) => c.id === updated.id)) {
      nextChoices.push(updated);
    }
    return handleSave(null, false, nextChoices);
  };

  const deleteCreatedScene = async (createdSceneId) => {
    if (!createdSceneId) return;
    const response = await fetch(`${API_BASE_URL}/scenes/${createdSceneId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error("ไม่สามารถลบฉากใหม่ที่สร้างค้างไว้ได้ กรุณาตรวจสอบฉากนี้อีกครั้ง");
    }
  };

  const deleteChoice = (choiceId) => {
    if (String(choiceId).startsWith("choice-new-")) {
      setChoices((prev) => prev.filter((c) => c.id !== choiceId));
    } else {
      setChoiceToDelete(choiceId);
    }
  };

  const confirmDeleteChoice = () => {
    if (choiceToDelete) {
      const nextChoices = choices.filter((c) => c.id !== choiceToDelete);
      setChoices(nextChoices);
      setChoiceToDelete(null);
      handleSave(null, false, nextChoices);
    }
  };

  const handleAddScene = async (chId) => {
    if (!chId) return;
    setSelectedChapterForNewScene(chId);
    setNewSceneTitle("");
    setCreateSceneError("");
    setIsSuccessCreatingScene(false);
    setIsSubmittingScene(false);
    setShowAddSceneDialog(true);
  };

  const handleConfirmAddScene = async () => {
    if (!novelId || !selectedChapterForNewScene) {
      setCreateSceneError("ไม่พบข้อมูลสำหรับสร้างฉาก");
      return;
    }

    if (!token) {
      setCreateSceneError("กรุณาเข้าสู่ระบบก่อนเพิ่มฉาก");
      return;
    }

    const resolvedNewSceneTitle = newSceneTitle.trim() || "ฉากใหม่";
    setIsSubmittingScene(true);
    setCreateSceneError("");

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        novel_id: parseInt(novelId, 10),
        chapter_id: parseInt(selectedChapterForNewScene, 10),
        title: resolvedNewSceneTitle,
        content: "",
        x: 0,
        y: 0,
        type: "normal",
        status: "draft",
      };

      const res = await fetch(`${API_BASE_URL}/scenes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        console.error("สร้างฉากใหม่ล้มเหลว:", res.status, txt);
        setCreateSceneError("ไม่สามารถสร้างฉากใหม่ได้ กรุณาลองใหม่");
        setIsSubmittingScene(false);
        return;
      }

      const data = await res.json().catch(() => null) || {};
      const createdSceneId = data.scene_id ?? data.id ?? data.data?.scene_id ?? data.data?.id;

      sessionStorage.setItem("toastMessage", `สร้างฉาก \"${resolvedNewSceneTitle}\" สำเร็จ`);
      sessionStorage.setItem("focusSceneTitle", "true");

      setIsSuccessCreatingScene(true);
      setTimeout(async () => {
        setIsSuccessCreatingScene(false);
        setIsSubmittingScene(false);
        setShowAddSceneDialog(false);
        setSelectedChapterForNewScene(null);
        setNewSceneTitle("");

        await fetchSceneData(true);
        window.dispatchEvent(new Event("novel-data-updated"));

        if (createdSceneId) {
          if (typeof onNavigate === "function") {
            onNavigate("scene-editor", { novelId, chapterId: selectedChapterForNewScene, sceneId: createdSceneId });
          } else {
            window.location.href = `/scene-editor/${novelId}/${selectedChapterForNewScene}/${createdSceneId}`;
          }
        }
      }, 600);
    } catch (err) {
      console.error("Add scene error:", err);
      setCreateSceneError("เกิดข้อผิดพลาดขณะเพิ่มฉาก");
      setIsSubmittingScene(false);
    }
  };

  const handleAddChapter = () => {
    setNewChapterTitle("");
    setDraftChapterStatus("draft");
    setCreateChapterError("");
    setIsSuccessCreatingChapter(false);
    setIsSubmittingChapter(false);
    setShowAddChapterDialog(true);
  };

  const handleConfirmAddChapter = async () => {
    if (!newChapterTitle.trim()) {
      setCreateChapterError("กรุณากรอกชื่อตอน");
      return;
    }

    setIsSubmittingChapter(true);
    setCreateChapterError("");

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const nextEpisode = (Array.isArray(chapters) ? chapters.length : 0) + 1;

      const response = await fetch(`${API_BASE_URL}/chapters`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          novel_id: parseInt(novelId, 10),
          title: newChapterTitle.trim(),
          episode: nextEpisode,
          status: draftChapterStatus || "draft",
        }),
      });

      if (!response.ok) throw new Error("ไม่สามารถสร้างตอนใหม่ได้");

      const payload = await response.json().catch(() => null) || {};
      const createdData = payload?.data || payload?.chapter || payload || {};
      const createdChapterId = createdData.id || createdData.chapter_id || createdData.ChapterID || payload.chapter_id || Date.now();

      const newChapterObj = {
        id: createdChapterId,
        chapter_id: createdChapterId,
        ChapterID: createdChapterId,
        title: createdData.title || newChapterTitle.trim(),
        Title: createdData.title || newChapterTitle.trim(),
        episode: createdData.episode || nextEpisode,
        Episode: createdData.episode || nextEpisode,
        scenes: []
      };

      setChapters((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        const exists = prevArr.some(c => String(c.id ?? c.chapter_id ?? c.ChapterID) === String(createdChapterId));
        if (exists) return prevArr;
        return [...prevArr, newChapterObj];
      });

      setExpandedChapters((prev) => Array.from(new Set([...(Array.isArray(prev) ? prev : []), createdChapterId])));

      setIsSuccessCreatingChapter(true);
      setTimeout(async () => {
        setIsSuccessCreatingChapter(false);
        setIsSubmittingChapter(false);
        setShowAddChapterDialog(false);
        setNewChapterTitle("");

        await fetchSceneData(true);
        window.dispatchEvent(new Event("novel-data-updated"));
      }, 600);

    } catch (err) {
      console.error("เกิดข้อผิดพลาดในการสร้างตอน:", err);
      setCreateChapterError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setIsSubmittingChapter(false);
    }
  };
  const savedTime = lastSaved || draftSavedAt;
  const savedText = savedTime
    ? `บันทึกล่าสุด ${savedTime.getHours().toString().padStart(2, "0")}:${savedTime.getMinutes().toString().padStart(2, "0")} น.`
    : null;

  const safeChapters = Array.isArray(chapters) ? chapters : [];

  let effectiveChapterId = isNewScene ? currentSelectedChapterId : chapterId;

  if (!effectiveChapterId && sceneId && safeChapters.length > 0) {
    const sceneIdStr = String(sceneId);
    for (const ch of safeChapters) {
      const foundScene = (ch.scenes || []).find(
        (s) => String(s.id ?? s.scene_id ?? s.SceneID) === sceneIdStr
      );
      if (foundScene) {
        effectiveChapterId = ch.id ?? ch.chapter_id ?? ch.ChapterID;
        break;
      }
    }
  }

  const currentChIndex = safeChapters.findIndex(
    (c) => String(c.id ?? c.chapter_id ?? c.ChapterID ?? "") === String(effectiveChapterId ?? "")
  );

  const currentChDisplayNumber =
    currentChIndex !== -1
      ? (
        safeChapters[currentChIndex].chapterNumber ??
        safeChapters[currentChIndex].order_index ??
        (currentChIndex + 1)
      )
      : null;

  const currentChapterScenes =
    currentChIndex !== -1 && safeChapters[currentChIndex]
      ? (
        Array.isArray(safeChapters[currentChIndex].scenes)
          ? safeChapters[currentChIndex].scenes
          : []
      )
      : [];

  const currentScIndex = currentChapterScenes.findIndex(
    (s) => String(s.id ?? s.scene_id ?? s.SceneID ?? "") === String(sceneId ?? "")
  );

  let currentScDisplayNumber =
    currentScIndex !== -1
      ? (currentScIndex + 1)
      : null;

  // If creating a new scene, show it as the next scene number in the chapter
  if (isNewScene) {
    currentScDisplayNumber = (currentChapterScenes?.length || 0) + 1;
  }

  const handleOpenPreview = (e) => {
    if (e) e.preventDefault();

    if (isUnsaved) {
      setPendingAction("preview");
      return;
    }

    if (!novelId || !sceneId) return;
    sessionStorage.setItem("previewReturnUrl", window.location.pathname + window.location.search);
    window.open(`/reading/${novelId}/${sceneId}?preview=true`, "_blank", "noopener,noreferrer");
  };

  const handleBack = () => {
    if (isUnsaved || isNewScene) {
      setPendingAction("back");
      return;
    }

    sessionStorage.removeItem("focusSceneTarget");
    if (typeof onNavigate === "function") {
      onNavigate("chapters", { novelId });
    } else {
      navigate(`/writer/${novelId}/chapters`);
    }
  };
  const handleDiscardPendingAction = (action) => {
    if (action === "back" || action === "change-scene") {
      if (saveDraftTimer.current) {
        clearTimeout(saveDraftTimer.current);
      }
      clearDraft();
      setIsUnsaved(false);
      sessionStorage.removeItem("focusSceneTarget");
    }

    setPendingAction(null);

    if (action === "back") {
      sessionStorage.removeItem("focusSceneTarget");
      if (typeof onNavigate === "function") {
        onNavigate("chapters", { novelId });
      } else {
        navigate(`/writer/${novelId}/chapters`);
      }
    } else if (action === "change-scene") {
      if (nextSceneTarget) {
        onNavigate("scene-editor", { 
          novelId, 
          chapterId: nextSceneTarget.chapterId, 
          sceneId: nextSceneTarget.sceneId 
        });
        setNextSceneTarget(null);
      }
    }
  };
  const handleConfirmPendingAction = async (action) => {
    if (!action) return;

    await handleSave(null, false);
    setPendingAction(null);

    if (action === "preview") {
      if (!novelId || !sceneId) return;
      sessionStorage.setItem("previewReturnUrl", window.location.pathname + window.location.search);
      window.open(`/reading/${novelId}/${sceneId}?preview=true`, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "back") {
      sessionStorage.removeItem("focusSceneTarget");
      if (typeof onNavigate === "function") {
        onNavigate("chapters", { novelId });
      } else {
        navigate(`/writer/${novelId}/chapters`);
      }
    } else if (action === "change-scene") {
      if (nextSceneTarget) {
        onNavigate("scene-editor", { 
          novelId, 
          chapterId: nextSceneTarget.chapterId, 
          sceneId: nextSceneTarget.sceneId 
        });
        setNextSceneTarget(null);
      }
    }
  };
  const isEmptyNovel = !isLoading && (
    sceneId === "empty" ||
    (sceneId !== "new" && (
      chapters.length === 0 ||
      chapters.every(ch => !ch.scenes || ch.scenes.length === 0)
    ))
  );

  // focus scene title when requested (e.g., after creating new chapter+scene)
  useEffect(() => {
    // เช็กว่าโหลดเสร็จแล้วค่อยทำงาน (กันบัค DOM ยังไม่สร้าง)
    if (!isLoading) {
      try {
        if (sessionStorage.getItem("focusSceneTitle") === "true") {
          // หน่วงเวลา 100ms ให้ Input ปรากฏบนหน้าจอก่อน
          setTimeout(() => {
            const el = document.getElementById("scene-title");
            if (el) {
              el.focus();
              if (typeof el.select === "function") el.select();
            }
          }, 100);
          sessionStorage.removeItem("focusSceneTitle");
        }

        const pendingToast = sessionStorage.getItem("toastMessage");
        if (pendingToast) {
          setToastMessage(pendingToast);
          setTimeout(() => setToastMessage(null), 2000);
          sessionStorage.removeItem("toastMessage");
        }
      } catch (err) {
        // ignore
      }
    }
  }, [sceneId, isLoading]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isEmptyNovel) {
    const searchParams = new URLSearchParams(window.location.search);
    const reasonParam = searchParams.get("reason");
    const isNoChapters = reasonParam === "no-chapters" || chapters.length === 0;

    const titleText = isNoChapters ? "ยังไม่มีตอน" : "ยังไม่มีฉาก";
    const descText = isNoChapters
      ? "คุณจำเป็นต้องสร้างตอน (Chapter) ในหน้าจัดการตอนก่อน ถึงจะสามารถเพิ่มฉากและเขียนเนื้อหาได้ค่ะ"
      : "คุณจำเป็นต้องเพิ่มฉาก (Scene) ในหน้าจัดการตอนก่อน ถึงจะสามารถเริ่มเขียนเนื้อหาได้ค่ะ";
    const targetUrlParams = isNoChapters ? { novelId } : { novelId, highlightEmpty: "true" };

    return (
      <div className="se-page" style={{ background: "var(--gray-50)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header className="se-header">
          {toastMessage && (
            <div className="se-toast">
              ✓ {toastMessage}
            </div>
          )}
          <div className="se-header__left">
            <button
              className="se-header__back"
              onClick={handleBack}
              aria-label="ย้อนกลับ"
            >
              ย้อนกลับ
            </button>
            <nav className="se-header__breadcrumb" aria-label="breadcrumb">
              <span className="se-header__bc-novel">เรื่อง: {novelTitle || "นิยายของคุณ"}</span>
            </nav>
          </div>
        </header>

        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "60px 20px", flex: 1, minHeight: "70vh", textAlign: "center"
        }}>
          <div style={{
            background: "var(--white)", padding: "40px", borderRadius: "24px",
            boxShadow: "var(--shadow-md)", maxWidth: "500px", width: "100%",
            border: "1px solid var(--pink-100)", display: "flex", flexDirection: "column",
            alignItems: "center", gap: "20px"
          }}>
            <span style={{ fontSize: "64px" }}>{isNoChapters ? "📑" : "🎬"}</span>
            <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--ink)", margin: 0 }}>
              {titleText}
            </h2>
            <p style={{ fontSize: "14.5px", color: "var(--gray-600)", lineHeight: "1.6", margin: 0 }}>
              {descText}
            </p>

            <div style={{ display: "flex", gap: "12px", width: "100%", marginTop: "10px" }}>
              <button
                onClick={() => onNavigate("dashboard")}
                style={{
                  flex: 1, background: "var(--gray-100)", color: "var(--gray-600)",
                  border: "none", padding: "12px", borderRadius: "12px",
                  fontWeight: "700", cursor: "pointer", fontSize: "14px"
                }}
              >
                🏠 กลับ Dashboard
              </button>
              <button
                onClick={() => onNavigate("chapters", targetUrlParams)}
                style={{
                  flex: 1, background: "var(--pink-500)", color: "var(--white)",
                  border: "none", padding: "12px", borderRadius: "12px",
                  fontWeight: "700", cursor: "pointer", fontSize: "14px",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                📑 ไปหน้าจัดการตอน
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="se-page">
      {/* Header */}
      <header className="se-header">
        {toastMessage && (
          <div className="se-toast">
            ✓ {toastMessage}
          </div>
        )}
        <div className="se-header__left">
          <button
            className="se-header__back"
            onClick={handleBack}
            aria-label="ย้อนกลับ"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="se-header__sidebar-toggle cm-sidebar-toggle-btn"
            onClick={() => setIsTreeSidebarOpen(!isTreeSidebarOpen)}
            title="รายการตอนและฉาก"
          >
            <Menu size={16} />
            <span>รายการตอนและฉาก</span>
          </button>

          <nav className="se-header__breadcrumb" aria-label="breadcrumb">
            <span className="se-header__bc-novel">
              เรื่อง: {novelTitle}
            </span>

            <span className="se-header__bc-sep">›</span>

            <span className="se-header__bc-chapter">
              {currentChDisplayNumber !== null && currentChDisplayNumber !== ""
                ? `ตอนที่ ${currentChDisplayNumber}`
                : "ตอน: ?"}{" "}
              {chapterTitle}
            </span>

            <span className="se-header__bc-sep">›</span>

            <span className="se-header__bc-scene">
              {currentChDisplayNumber !== null && currentChDisplayNumber !== "" && currentScDisplayNumber !== null && currentScDisplayNumber !== ""
                ? `ฉากที่ ${currentChDisplayNumber}.${currentScDisplayNumber}`
                : "ฉาก: ?"}{" "}
              {isNewScene ? (sceneTitle || "กำลังสร้างฉากใหม่") : sceneLabel}
            </span>
          </nav>
        </div>

        <div className="se-header__right">
          {isSaving && <span className="se-header__saving">กำลังบันทึก...</span>}
          {!isSaving && savedText && <span className="se-header__saved">✓ {savedText}</span>}

          <button
            className="se-header__btn se-header__btn--save"
            onClick={() => handleSave(null, false, null, null, true)}
            disabled={isSaving}
          >
            {isNewScene ? "สร้างฉาก" : "บันทึก"}
          </button>

          <button
            className="se-header__btn se-header__btn--publish"
            onClick={() => {
              if (!sceneTitle.trim()) {
                setErrorMsg("ยังไม่มีชื่อฉาก ไม่สามารถกดเผยแพร่ได้");
                return;
              }
              setShowPublishConfirm(true);
            }}
            disabled={isSaving}
          >
            เผยแพร่เลย
          </button>
        </div>
      </header>

      {errorMsg && (
        <div className="se-error-banner">
          <div className="se-error-banner__icon">⚠️</div>
          <div className="se-error-banner__content">
            {typeof errorMsg === "string" && errorMsg.includes("**") ? (
              errorMsg.split("**").map((part, idx) =>
                idx % 2 === 1 ? <strong key={idx}>{part}</strong> : part
              )
            ) : (
              errorMsg
            )}
          </div>
          <button
            type="button"
            className="se-error-banner__close"
            onClick={() => setErrorMsg(null)}
            aria-label="ปิดข้อความแจ้งเตือน"
            title="ปิดข้อความแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      <div className="se-body">
        {/* Sidebar Wrapper */}
        <div className={`se-sidebar-wrapper ${isTreeSidebarOpen ? "open" : ""}`}>
          <button 
            type="button" 
            className="se-sidebar-wrapper-close" 
            onClick={() => setIsTreeSidebarOpen(false)}
            style={{ display: "none" }}
          >
            ✕
          </button>
          <SceneTreeSidebar
            chapters={chapters}
            expandedChapters={expandedChapters}
            setExpandedChapters={setExpandedChapters}
            currentSceneId={sceneId}
            currentChapterId={effectiveChapterId}
            currentChapterTitle={chapterTitle}
            currentSceneLabel={sceneLabel}
            onSelectScene={(chId, sId) => {
              setIsTreeSidebarOpen(false);
              if (String(sId) === String(sceneId)) return;
              if (isUnsaved) {
                setNextSceneTarget({ chapterId: chId, sceneId: sId });
                setPendingAction("change-scene");
                return;
              }
              onNavigate("scene-editor", { novelId, chapterId: chId, sceneId: sId });
            }}
            onAddScene={(chId) => {
              setIsTreeSidebarOpen(false);
              handleAddScene(chId);
            }}
            onAddChapter={() => {
              setIsTreeSidebarOpen(false);
              handleAddChapter();
            }}
            isPublished={isPublished}
            isEnding={isEnding}
            setIsEnding={setIsEnding}
            onToggleEnding={handleToggleEnding}
            onOpenEndingSettings={handleOpenEndingSettings}
            isNewScene={isNewScene}
            sceneTitle={sceneTitle}
            sceneType={sceneType}
          />
        </div>
        <main className="se-editor">
          <div className="se-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <div className="se-section__heading" style={{ marginBottom: 0 }}>เนื้อหาฉาก</div>
              <button
                className="se-header__btn se-header__btn--preview se-header__btn--preview-inline"
                type="button"
                onClick={handleOpenPreview}
                style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "12px", height: "auto", margin: 0 }}
              >
                ▶ ทดลองอ่าน
              </button>
            </div>

            {/* ช่องกรอกชื่อฉาก */}
            <div className="se-field">
              <label className="se-label" htmlFor="scene-title">ชื่อฉาก</label>
              <input
                id="scene-title"
                className="se-input se-input--title"
                value={sceneTitle}
                onChange={(e) => {
                  setSceneTitle(e.target.value);
                  setIsUnsaved(true);
                }}
                placeholder="เช่น การพบกับชายปริศนา"
              />
            </div>

            {/* พื้นที่เนื้อเรื่อง (React Quill) */}
            <div className="se-field">
              <label className="se-label">เนื้อเรื่อง</label>
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={content}
                onChange={(value) => {
                  if (value !== content) {
                    setContent(value);
                    setIsUnsaved(true);
                  }
                }}
                modules={quillModules}
                placeholder="เริ่มเขียนเนื้อหาฉากของคุณ..."
                className="se-quill"
              />
              <div className="se-field__hint" style={{ marginTop: "8px", color: "var(--gray-600)" }}>
                จำนวนตัวอักษร: {charCount}
              </div>
              {isImageUploading && (
                <div className="se-field__hint" style={{ color: "#2563eb", marginTop: "8px" }}>
                  กำลังอัปโหลดรูปภาพไปยัง MinIO...
                </div>
              )}
              {imageUploadError && (
                <div className="se-field__error" style={{ color: "#dc2626", marginTop: "8px" }}>
                  {imageUploadError}
                </div>
              )}
            </div>
          </div>

          {/* โซน Choices & ฉากจบย้ายมาฝังแบบ Inline */}
          <div className="se-section se-section--choices">
            {/* 🏁 ฉากนี้จะ... โซนสลับปุ่มเลือกโหมดฉากจบ vs ช้อยส์ทางเลือก */}
            <div className="se-ending-toggle-section" style={{ margin: "0 0 24px 0", border: "1px solid #cbd5e1", borderRadius: "16px" }}>
              <div className="se-ending-toggle-title" style={{ fontSize: "0.95rem", fontWeight: "800", color: "#1f2937", marginBottom: "16px" }}>
                ฉากนี้จะ...
              </div>
              <div className="se-ending-toggle-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {/* ปุ่ม 1: มีทางเลือกต่อไป */}
                <button
                  type="button"
                  className={`se-ending-toggle-btn ${!isEnding ? "active" : ""}`}
                  onClick={() => {
                    if (isEnding) {
                      setIsEnding(false);
                      setIsUnsaved(true);
                    }
                  }}
                >
                  <div className="checkmark-badge">✓</div>
                  <div className="se-ending-toggle-icon" style={{ fontSize: "1.4rem", marginBottom: "6px" }}>🔀</div>
                  <div className="se-ending-toggle-text-main">มีทางเลือกต่อไป</div>
                  <div className="se-ending-toggle-text-sub">ผู้อ่านเลือกเส้นทางถัดไปได้</div>
                </button>

                {/* ปุ่ม 2: ฉากจบของเรื่อง */}
                <button
                  type="button"
                  className={`se-ending-toggle-btn ${isEnding ? "active" : ""}`}
                  onClick={() => {
                    if (!isEnding) {
                      if (choices.length > 0) {
                        setErrorMsg(
                          "ไม่สามารถตั้งเป็นฉากจบได้ เนื่องจากฉากนี้มีทางเลือกไปยังฉากอื่นอยู่ **(กรุณาลบทางเลือกในฉากนี้ออกก่อน)**"
                        );
                        setTimeout(() => setErrorMsg(null), 6000);
                        return;
                      }
                      if (sceneType === "start") {
                        setErrorMsg("ไม่สามารถตั้งค่าฉากเริ่มต้นให้เป็นฉากจบได้ **กรุณาเลือกฉากอื่นเป็นฉากจบ**");
                        setTimeout(() => setErrorMsg(null), 5000);
                        return;
                      }
                      setIsEnding(true);
                      setIsUnsaved(true);
                    }
                  }}
                >
                  <div className="checkmark-badge">✓</div>
                  <div className="se-ending-toggle-icon" style={{ fontSize: "1.4rem", marginBottom: "6px" }}>🏁</div>
                  <div className="se-ending-toggle-text-main">ฉากจบของเรื่อง</div>
                  <div className="se-ending-toggle-text-sub">เส้นทางสิ้นสุดที่ฉากนี้</div>
                </button>
              </div>
            </div>

            {/* ส่วนของ ฉากจบ (ถ้าเป็น Ending) */}
            {isEnding ? (
              <div className="se-inline-ending-wrapper" style={{ border: "1.5px solid #cbd5e1", padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff" }}>
                <EndingSettings
                  sceneTitle={sceneTitle || sceneLabel}
                  novelTitle={novelTitle}
                  isEnding={isEnding}
                  endingTitle={endingTitle}
                  endingType={endingType}
                  endingDescription={endingDescription}
                  endingDescriptionEnabled={endingDescriptionEnabled}
                  onToggleEnding={(val) => {
                    setIsEnding(val);
                    setIsUnsaved(true);
                  }}
                  onToggleEndingDescriptionEnabled={(val) => {
                    setEndingDescriptionEnabled(val);
                    setIsUnsaved(true);
                  }}
                  onChangeEndingTitle={(val) => {
                    setEndingTitle(val);
                    setIsUnsaved(true);
                  }}
                  onChangeEndingType={(val) => {
                    setEndingType(val);
                    setIsUnsaved(true);
                  }}
                  onChangeEndingDescription={(val) => {
                    setEndingDescription(val);
                    setIsUnsaved(true);
                  }}
                  onSave={() => {
                    setToastMessage("อัปเดตการตั้งค่าฉากจบชั่วคราวแล้ว (กดบันทึกขวาบนเพื่อบันทึกจริง)");
                    setTimeout(() => setToastMessage(null), 2500);
                  }}
                  onClose={() => {
                    setIsEnding(false);
                    setIsUnsaved(true);
                  }}
                />
              </div>
            ) : (
              /* ส่วนของ ทางเลือกปกติ (ถ้าไม่ใช่ฉากจบ) */
              <>
                <div className="se-section__heading-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div className="se-section__heading" style={{ margin: 0, fontSize: "0.95rem", fontWeight: "800" }}>
                    ทางเลือกท้ายฉาก <span style={{ color: "#94a3b8", fontSize: "0.85rem", marginLeft: "6px", fontWeight: "600" }}>| {choices.length} ทางเลือก</span>
                  </div>
                  <button className="se-btn se-btn--add-choice" onClick={addChoice}>
                    ✚ เพิ่มทางเลือกใหม่
                  </button>
                </div>

                <div className="se-choices-list">
                  {choices.map((choice, i) => (
                    <ChoiceCard
                      key={choice.id || choice._tempId || i}
                      choice={choice}
                      index={i}
                      allTargetOptions={chapters}
                      currentChapterId={effectiveChapterId}
                      currentSceneId={sceneId}
                      onUpdate={updateChoice}
                      onSave={saveChoiceImmediately}
                      onDelete={deleteChoice}
                      novelId={novelId}
                      token={token}
                      onNavigate={onNavigate}
                      navigate={navigate}
                      onDeleteScene={deleteCreatedScene}
                      sourceSceneTitle={sceneTitle}
                    />
                  ))}

                  {choices.length === 0 && (
                    <div className="se-choices-empty">
                      <p>⚠️ ยังไม่มีทางเลือกถัดไป</p>
                      <p>ฉากนี้ยังไม่ได้เชื่อมโยงไปฉากอื่น เนื้อเรื่องจะหยุดค้างอยู่ที่ฉากนี้ กรุณาเพิ่มทางเลือกเพื่อเชื่อมไปยังฉากถัดไป</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* 📖 ป๊อปอัปกรอกข้อมูลสร้างตอนใหม่ (Popup Modal เหมือนหน้าจัดการตอน) */}
      {showAddChapterDialog && (
        <div className="se-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="se-modal-content" style={{ maxWidth: "420px", padding: "28px" }}>
            <div className="se-modal-icon" style={{ background: "#fce7f3", color: "#db2777" }}>📖</div>
            <h3 className="se-modal-title" style={{ fontFamily: "'Sarabun', sans-serif" }}>สร้างตอนใหม่</h3>
            <p className="se-modal-desc" style={{ fontFamily: "'Sarabun', sans-serif" }}>กรุณากรอกชื่อตอนที่ต้องการเพิ่มในนิยายเรื่องนี้</p>
            
            <div style={{ width: "100%", margin: "16px 0 20px 0", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>ชื่อตอน</label>
              <input
                type="text"
                className="cm-input"
                value={newChapterTitle}
                onChange={(e) => { setNewChapterTitle(e.target.value); setCreateChapterError(""); }}
                onKeyPress={(e) => e.key === "Enter" && handleConfirmAddChapter()}
                placeholder="เช่น ตอนที่ 1 : การเริ่มต้นเดินทาง"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
                autoFocus
              />
              
              <label style={{ display: "block", marginTop: "12px", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>สถานะตอนแรกเริ่ม</label>
              <select
                className="cm-select"
                value={draftChapterStatus}
                onChange={(e) => setDraftChapterStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  background: "#ffffff"
                }}
              >
                <option value="draft">ฉบับร่าง (Draft)</option>
                <option value="published">เผยแพร่เลย (Published)</option>
              </select>

              {createChapterError && (
                <div style={{ color: "#ef4444", fontSize: "12.5px", fontWeight: "700", marginTop: "8px" }}>
                  {createChapterError}
                </div>
              )}
            </div>

            <div className="se-modal-actions" style={{ display: "flex", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className="se-modal-btn se-modal-btn--cancel"
                onClick={() => setShowAddChapterDialog(false)}
                style={{ flex: 1 }}
                disabled={isSubmittingChapter || isSuccessCreatingChapter}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="se-modal-btn"
                onClick={handleConfirmAddChapter}
                disabled={isSubmittingChapter || isSuccessCreatingChapter}
                style={{
                  flex: 1,
                  background: isSuccessCreatingChapter
                    ? "#10b981"
                    : "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                {isSubmittingChapter ? (
                  <>
                    <div style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "cm-spin 0.8s linear infinite"
                    }} />
                    <span>กำลังสร้างตอน</span>
                  </>
                ) : isSuccessCreatingChapter ? (
                  <span>✓ สร้างตอนสำเร็จ</span>
                ) : (
                  "สร้างตอน"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 ป๊อปอัปกรอกข้อมูลสร้างฉากใหม่ (Popup Modal เหมือนหน้าจัดการตอน) */}
      {showAddSceneDialog && (
        <div className="se-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="se-modal-content" style={{ maxWidth: "420px", padding: "28px" }}>
            <div className="se-modal-icon" style={{ background: "#fce7f3", color: "#db2777" }}>🎬</div>
            <h3 className="se-modal-title" style={{ fontFamily: "'Sarabun', sans-serif" }}>สร้างฉากใหม่</h3>
            <p className="se-modal-desc" style={{ fontFamily: "'Sarabun', sans-serif" }}>กรุณากรอกชื่อฉากที่ต้องการสร้างเพื่อเริ่มต้นเขียนเนื้อเรื่อง</p>
            
            <div style={{ width: "100%", margin: "16px 0 20px 0", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "700", color: "#475569" }}>ชื่อฉาก</label>
              <input
                type="text"
                className="cm-input"
                value={newSceneTitle}
                onChange={(e) => { setNewSceneTitle(e.target.value); setCreateSceneError(""); }}
                onKeyPress={(e) => e.key === "Enter" && handleConfirmAddScene()}
                placeholder="เช่น การพบกับชายปริศนา"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1.5px solid #cbd5e1",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
                autoFocus
              />
              {createSceneError && (
                <div style={{ color: "#ef4444", fontSize: "12.5px", fontWeight: "700", marginTop: "8px" }}>
                  {createSceneError}
                </div>
              )}
            </div>

            <div className="se-modal-actions" style={{ display: "flex", gap: "10px", width: "100%" }}>
              <button
                type="button"
                className="se-modal-btn se-modal-btn--cancel"
                onClick={() => setShowAddSceneDialog(false)}
                style={{ flex: 1 }}
                disabled={isSubmittingScene || isSuccessCreatingScene}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="se-modal-btn"
                onClick={handleConfirmAddScene}
                disabled={isSubmittingScene || isSuccessCreatingScene}
                style={{
                  flex: 1,
                  background: isSuccessCreatingScene
                    ? "#10b981"
                    : "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                {isSubmittingScene ? (
                  <>
                    <div style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#ffffff",
                      borderRadius: "50%",
                      animation: "cm-spin 0.8s linear infinite"
                    }} />
                    <span>กำลังสร้างฉาก...</span>
                  </>
                ) : isSuccessCreatingScene ? (
                  <span>✓ สร้างฉากสำเร็จ</span>
                ) : (
                  "สร้างฉาก"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dialog ยืนยันการลบทางเลือก */}
      {choiceToDelete && (
        <ConfirmModal
          variant="danger"
          title="ยืนยันการลบทางเลือก?"
          description="คุณแน่ใจหรือไม่ที่จะลบทางเลือกนี้? การดำเนินการนี้จะลบเส้นทางการเชื่อมโยงของฉากปลายทางออกและไม่สามารถกู้คืนได้"
          cancelText="ยกเลิก"
          confirmText="ลบทางเลือก"
          onCancel={() => setChoiceToDelete(null)}
          onConfirm={confirmDeleteChoice}
        />
      )}

      {/* 🛑 Dialog แจ้งเตือนเมื่อลืมบันทึก */}
      {pendingAction && (
        isNewScene && !sceneTitle.trim() ? (
          <ConfirmModal
            title="ยังไม่ได้กรอกชื่อฉาก"
            description="ยังไม่ได้กรอกชื่อฉากทำให้ข้อมูลยังไม่ได้บันทึก ฉากนี้จะยังไม่ถูกสร้าง"
            cancelText="จะไม่สร้างฉาก"
            confirmText="กรอกข้อมูลสร้างต่อ"
            onCancel={() => handleDiscardPendingAction(pendingAction)}
            onConfirm={() => setPendingAction(null)}
          />
        ) : (
          <ConfirmModal
            title="มีเนื้อหาที่ยังไม่ได้บันทึก"
            description={
              pendingAction === "preview"
                ? "กรุณาบันทึกข้อมูลก่อนเข้าสู่โหมดทดลองอ่านเพื่อป้องกันการสูญหาย"
                : pendingAction === "change-scene"
                ? "กรุณาบันทึกข้อมูลก่อนสลับไปยังฉากอื่นเพื่อป้องกันการสูญหาย"
                : "กรุณาบันทึกข้อมูลก่อนออกจากหน้านี้เพื่อป้องกันการสูญหาย"
            }
            cancelText={
              pendingAction === "back" || pendingAction === "change-scene"
                ? "ออกโดยไม่บันทึก"
                : "ยกเลิก"
            }
            confirmText="✓ บันทึก"
            onCancel={() => handleDiscardPendingAction(pendingAction)}
            onConfirm={() => handleConfirmPendingAction(pendingAction)}
          />
        )
      )}

      {/* Dialog ยืนยันก่อนเผยแพร่ */}
      {showPublishConfirm && (
        <ConfirmModal
          variant="publish"
          icon="🚀"
          title="ยืนยันการเผยแพร่?"
          description="ระบบจะเผยแพร่ทั้งฉากนี้และตอนทั้งตอนให้ผู้อ่านมองเห็นทันที คุณสามารถกลับมาแก้ไขหรือเปลี่ยนสถานะได้ภายหลัง"
          cancelText="ยกเลิก"
          confirmText="เผยแพร่"
          onCancel={() => setShowPublishConfirm(false)}
          onConfirm={() => {
            setShowPublishConfirm(false);
            handlePublish();
          }}
        />
      )}
    </div>
  );
};

export default SceneEditorPage;