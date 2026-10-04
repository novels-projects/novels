// src/components/ReadingBreadcrumb/ReadingBreadcrumb.jsx
import React from "react";
import { GitFork, ArrowLeft, ChevronRight } from "lucide-react";
import "./ReadingBreadcrumb.css";

/**
 * ReadingBreadcrumb — แถบ breadcrumb + Story Map button + Theme Settings บนหน้าอ่านนิยาย
 */
const ReadingBreadcrumb = ({ novelTitle, chapterTitle, onBack, onStoryMap, settingsComponent }) => (
  <div className="rbreadcrumb">
    <div className="rbreadcrumb__left">
      <button className="rbreadcrumb__back" onClick={onBack} aria-label="กลับ">
        <ArrowLeft size={15} />
        <span>กลับ</span>
      </button>
    </div>
    <div className="rbreadcrumb__path" aria-label="เส้นทาง">
      <span className="rbreadcrumb__novel">{novelTitle}</span>
      <ChevronRight size={13} className="rbreadcrumb__sep" />
      <span className="rbreadcrumb__chapter">{chapterTitle}</span>
    </div>
    <div className="rbreadcrumb__actions">
      <button className="rbreadcrumb__map" onClick={onStoryMap} aria-label="แผนผังการอ่าน">
        <GitFork size={15} />
        <span>แผนผังการอ่าน</span>
      </button>
      {settingsComponent}
    </div>
  </div>
);

export default ReadingBreadcrumb;