import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, BookOpen, Bell, ChevronDown, ChevronRight, BookImage } from "lucide-react";
import FollowButton from "../FollowButton/FollowButton";
import "./WriterCard.css";

const STATUS_CFG = {
  ongoing:  { label: "กำลังเขียน", color: "#059669", bg: "#ECFDF5" },
  finished: { label: "จบแล้ว",    color: "#6B7280", bg: "#F3F4F6" },
  banned:   { label: "ถูกระงับ",   color: "#DC2626", bg: "#FEE2E2" },
};

function Avatar({ writer, size = 52 }) {
  const avatarSrc = writer.avatar || writer.avatar_url || writer.avatarUrl || writer.pic_profile || null;
  const initial = (writer.name || "N").charAt(0).toUpperCase();

  return (
    <div 
      className="avatar"
      style={{
        width: size, 
        height: size, 
        borderRadius: "50%",
        flexShrink: 0,
        background: avatarSrc ? "#fce7f3" : `linear-gradient(135deg, ${writer.color || "#db2777"}, ${writer.color || "#db2777"}88)`,
        fontSize: size * 0.4, 
        boxShadow: `0 2px 10px ${writer.color || "#db2777"}30`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1.5px solid #fbcfe8",
      }}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={writer.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      ) : (
        <span style={{ color: "#ffffff", fontWeight: 700 }}>{initial}</span>
      )}
    </div>
  );
}

export default function WriterCard({ writer, onUnfollow, isFollowing = false }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [isFollowed, setIsFollowed] = useState(isFollowing);

  const latestUpdate = useMemo(() => {
    if (!writer.latestUpdate) return null;
    return {
      ...writer.latestUpdate,
      title: writer.latestUpdate.title || "อัปเดตล่าสุด",
      time: writer.latestUpdate.time || null,
    };
  }, [writer.latestUpdate]);

  const handleOpenNovel = (novelId) => {
    if (!novelId) return;
    navigate(`/novel/${novelId}`);
  };

  return (
    <div className="card">
      <div className="cardTop">
        <div className="metaRow">
          <div className="avatarWrapper" style={{ cursor: "pointer" }} onClick={() => navigate(`/writer/profile/${writer.id}`)}>
            <Avatar writer={writer} size={52} />
          </div>

          <div className="infoCol">
            <div className="infoHead">
              <div>
                <div className="writerNameWrapper" style={{ cursor: "pointer" }} onClick={() => navigate(`/writer/profile/${writer.id}`)}>
                  <span className="writerName">{writer.name}</span>
                  {/* เงื่อนไขการขึ้น Badge อัปเดตใหม่ */}
                  {writer.hasUnreadUpdate && (
                    <span className="badgeUnread">● อัปเดตใหม่</span>
                  )}
                </div>
                {writer.bio && <div className="writerBio">{writer.bio}</div>}
              </div>
            </div>

            <div className="countRow">
              <div className="countItem">
                <Users size={13} />
                <span>
                  <strong>{writer.followers.toLocaleString()}</strong> ผู้ติดตาม
                </span>
              </div>
              <div className="countItem">
                <BookOpen size={13} />
                <span>
                  <strong>{writer.novelCount?.toLocaleString?.() ?? writer.novels.length}</strong> เรื่อง
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ส่วนอัปเดตล่าสุด: ปรับเป็น 2 บรรทัดย่อยอ่านง่ายขึ้น */}
        {latestUpdate && (
          <div className="updatePill">
            <div className="updateMain">
              <div className="updateTag"><Bell size={11} /> อัปเดตล่าสุด</div>
              <div className="updateTitle">{latestUpdate.title}</div>
              <div className="updateDetailBlock">
                <div>{latestUpdate.detail}</div>
                <div className="updateTimeLine">{latestUpdate.time}</div>
              </div>
            </div>
          </div>
        )}

        {/* ขยายรายการนิยาย: เพิ่มรูปปก ชื่อ สถานะ ลูกศร (ลบจำนวน Ending ออกแล้ว) */}
        <div className="accordionWrapper">
          <button
            onClick={() => setExpanded(p => !p)}
            className="accordionToggle"
          >
            <span className="accordionLabel">
              <BookOpen size={13} /> นิยายทั้งหมด ({writer.novelCount?.toLocaleString?.() ?? writer.novels.length} เรื่อง)
            </span>
            <span className={`accordionArrow ${expanded ? "accordionArrowExpanded" : ""}`}>
              <ChevronDown size={14} />
            </span>
          </button>

          {expanded && (
            <div className="novelList">
              {writer.novels.map(n => {
                const s = STATUS_CFG[n.status] || STATUS_CFG.ongoing;
                return (
                  <div
                    key={n.id}
                    className="novelCard"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenNovel(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenNovel(n.id);
                      }
                    }}
                  >
                    {n.cover ? (
                      <img
                        src={n.cover}
                        alt={n.title}
                        className="novelCover"
                      />
                    ) : (
                      <div className="novelCover novelCoverPlaceholder">
                        <BookImage size={16} />
                      </div>
                    )}
                    <div className="novelInfo">
                      <div className="novelTitle">{n.title}</div>
                    </div>
                    <div className="statusWrapper">
                      <span 
                        className="statusBadge"
                        style={{ color: s.color, background: s.bg }}
                      >
                        {s.label}
                      </span>
                      <ChevronRight size={14} className="chevronRight" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* โซนปุ่มกด: ดูผลงาน + ติดตาม/เลิกติดตาม */}
      <div className="cardActions">
        <button
          type="button"
          className="btnWorks"
          onClick={() => navigate(`/writer/profile/${writer.id}`)}
        >
          ดูผลงาน →
        </button>

        {/* ปุ่มติดตาม/เลิกติดตาม ใช้ FollowButton Component */}
        <FollowButton
          writerId={writer.id}
          writerName={writer.name}
          avatarUrl={writer.avatar}
          novels={writer.novels}
          isFollowing={isFollowed}
          onFollowChange={(newFollowStatus) => {
            setIsFollowed(newFollowStatus);
            if (!newFollowStatus && onUnfollow) {
              onUnfollow(writer.id);
            }
          }}
          size="medium"
        />
      </div>
    </div>
  );
}