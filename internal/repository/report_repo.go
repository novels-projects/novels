package repository

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"novel-be/internal/dto"
	"novel-be/internal/models"
)

type ReportRepository interface {
	CreateReport(ctx context.Context, report models.Report) error
	GetReports(ctx context.Context, statusFilter string, reportType, search string, page, limit int) ([]dto.ReportResponse, int, error)
	GetStatus(ctx context.Context, reportID int) (string, error)
	GetReportDetail(ctx context.Context, reportID int) (status string, reportType string, novelID int, novelTitle string, authorID int, novelStatus string, novelIsPublished bool, err error)
	UpdateReportStatus(ctx context.Context, reportID int, req dto.UpdateReportStatusRequest) error
	CreateAppeal(ctx context.Context, authorUserID int, appeal dto.CreateAppealRequest) error
	HasPendingAppeal(ctx context.Context, authorUserID, novelID int) (bool, error)
}

func (r *sqlReportRepository) GetStatus(ctx context.Context, reportID int) (string, error) {
	var status string
	err := r.db.QueryRowContext(ctx, `SELECT status FROM reports WHERE report_id = $1`, reportID).Scan(&status)
	return status, err
}

// GetReportDetail returns status, novel_id, and novel_title for a given reportID.
// Used by the admin handler to build report audit metadata without an extra novelService dependency.
func (r *sqlReportRepository) GetReportDetail(ctx context.Context, reportID int) (string, string, int, string, int, string, bool, error) {
	var status string
	var reportType string
	var novelID int
	var novelTitle string
	var authorID int
	var novelStatus string
	var novelIsPublished bool
	query := `
		SELECT r.status, r.report_type, r.novel_id, n.title, n.author_id, n.status, n.is_published
		FROM reports r
		JOIN novels n ON n.novel_id = r.novel_id
		WHERE r.report_id = $1
	`
	err := r.db.QueryRowContext(ctx, query, reportID).Scan(&status, &reportType, &novelID, &novelTitle, &authorID, &novelStatus, &novelIsPublished)
	return status, reportType, novelID, novelTitle, authorID, novelStatus, novelIsPublished, err
}

type sqlReportRepository struct {
	db *sql.DB
}

func shouldSuspendNovelForReport(novelStatus string, novelIsPublished bool) bool {
	return novelStatus == "published" && novelIsPublished
}

func canResolvePendingReport(novelStatus string, novelIsPublished bool) bool {
	return shouldSuspendNovelForReport(novelStatus, novelIsPublished) ||
		(novelStatus == "suspended" && !novelIsPublished)
}

type reportNotification struct {
	userID  int
	message string
}

func insertReportNotifications(ctx context.Context, tx *sql.Tx, novelID int, notifications ...reportNotification) error {
	notifiedUsers := make(map[int]struct{}, len(notifications))
	for _, notification := range notifications {
		if _, exists := notifiedUsers[notification.userID]; exists {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read, created_at)
			 VALUES ($1, 'system', $2, 'novel', $3, false, NOW())`,
			notification.userID, novelID, notification.message,
		); err != nil {
			return err
		}
		notifiedUsers[notification.userID] = struct{}{}
	}
	return nil
}

func NewReportRepository(db *sql.DB) ReportRepository {
	return &sqlReportRepository{db: db}
}

// 📌 1. ฟังก์ชันสร้าง Report ลง Database (ฝั่งคนอ่าน)
func (r *sqlReportRepository) CreateReport(ctx context.Context, report models.Report) error {
	query := `
		INSERT INTO reports (user_id, novel_id, reason, report_type, status, created_at)
		VALUES ($1, $2, $3, 'report', 'pending', NOW())
	`
	_, err := r.db.ExecContext(ctx, query, report.UserID, report.NovelID, report.Reason)
	return err
}

// buildReportListQuery builds the dynamic WHERE clause for admin report listing.
// statusFilter values: all, pending, resolved, rejected, appeal_pending
// reportType values: all, report, appeal
func buildReportListQuery(statusFilter, reportType, search string) (string, []interface{}) {
	whereClauses := []string{}
	args := []interface{}{}

	statusFilter = strings.TrimSpace(strings.ToLower(statusFilter))
	reportType = strings.TrimSpace(strings.ToLower(reportType))
	search = strings.TrimSpace(search)

	if statusFilter != "" && statusFilter != "all" {
		whereClauses = append(whereClauses, "r.status = $"+strconv.Itoa(len(args)+1))
		args = append(args, statusFilter)
	}

	if reportType != "" && reportType != "all" {
		if reportType == "appeal" {
			whereClauses = append(whereClauses, "r.report_type = 'appeal'")
		} else if reportType == "report" {
			whereClauses = append(whereClauses, "r.report_type = 'report'")
		}
	}

	if search != "" {
		placeholder := strconv.Itoa(len(args) + 1)
		whereClauses = append(whereClauses, "(n.title ILIKE $"+placeholder+" OR u.username ILIKE $"+placeholder+" OR r.reason ILIKE $"+placeholder+")")
		args = append(args, "%"+search+"%")
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = "WHERE " + strings.Join(whereClauses, " AND ")
	}

	return whereClause, args
}

// 📌 2. ฟังก์ชันดึงรายการ Report สำหรับแอดมินแบบ dynamic filter
func (r *sqlReportRepository) GetReports(ctx context.Context, statusFilter string, reportType, search string, page, limit int) ([]dto.ReportResponse, int, error) {
	offset := (page - 1) * limit
	whereClause, args := buildReportListQuery(statusFilter, reportType, search)

	countQuery := `
		SELECT COUNT(*)
		FROM reports r
		LEFT JOIN users u ON r.user_id = u.user_id
		LEFT JOIN novels n ON r.novel_id = n.novel_id
		` + whereClause
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT 
			r.report_id, 
			r.user_id, 
			u.username, 
			r.novel_id, 
			n.title AS novel_title, 
			r.reason, 
			r.report_type,
			r.status, 
			r.created_at,
			n.cover_image,
			n.introduction,
			w.pen_name,
			w.user_id AS author_user_id
		FROM reports r
		LEFT JOIN users u ON r.user_id = u.user_id
		LEFT JOIN novels n ON r.novel_id = n.novel_id
		LEFT JOIN writers w ON n.author_id = w.writer_id
		` + whereClause + `
		ORDER BY r.created_at DESC, r.report_id DESC
		LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2) + `
	`

	queryArgs := append(append([]interface{}{}, args...), limit, offset)
	rows, err := r.db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reports []dto.ReportResponse
	for rows.Next() {
		var resp dto.ReportResponse
		var coverImage, introduction, penName sql.NullString
		var authorUserID sql.NullInt32

		err := rows.Scan(
			&resp.ReportID,
			&resp.UserID,
			&resp.Username,
			&resp.NovelID,
			&resp.NovelTitle,
			&resp.Reason,
			&resp.ReportType,
			&resp.Status,
			&resp.CreatedAt,
			&coverImage,
			&introduction,
			&penName,
			&authorUserID,
		)
		if err != nil {
			return nil, 0, err
		}

		if coverImage.Valid {
			resp.NovelCover = coverImage.String
		}
		if introduction.Valid {
			resp.NovelSynopsis = introduction.String
		}
		if penName.Valid {
			resp.AuthorPenName = penName.String
		}
		if authorUserID.Valid {
			resp.AuthorUserID = int(authorUserID.Int32)
		}

		reports = append(reports, resp)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, err
	}

	return reports, total, nil
}

// 📌 3. ฟังก์ชันอัปเดตสถานะ Report, แบนนิยาย และแจ้งเตือน (ฝั่งแอดมินกดจัดการ)
func (r *sqlReportRepository) UpdateReportStatus(ctx context.Context, reportID int, req dto.UpdateReportStatusRequest) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 🟢 1. แก้ไข SQL: ดึง status เดิมของรายงานตัวนี้มาด้วย (เพื่อเช็คว่าเป็น pending หรือ appeal_pending)
	var reporterID, novelID int
	var currentReportStatus, reportType, novelStatus string
	var novelIsPublished bool
	err = tx.QueryRowContext(ctx, `
		SELECT r.user_id, r.novel_id, r.status, r.report_type, n.status, n.is_published
		FROM reports r
		JOIN novels n ON n.novel_id = r.novel_id
		WHERE r.report_id = $1`, reportID).Scan(&reporterID, &novelID, &currentReportStatus, &reportType, &novelStatus, &novelIsPublished)
	if err != nil {
		return err
	}
	if (reportType == "report" && currentReportStatus != "pending") || (reportType == "appeal" && currentReportStatus != "appeal_pending") {
		return errors.New("invalid report transition")
	}

	// 2. ดึง user_id ของนักเขียน และชื่อเรื่อง (title)
	var writerUserID int
	var novelTitle string
	queryAuthor := `
		SELECT w.user_id, n.title 
		FROM novels n
		JOIN writers w ON n.author_id = w.writer_id
		WHERE n.novel_id = $1
	`
	err = tx.QueryRowContext(ctx, queryAuthor, novelID).Scan(&writerUserID, &novelTitle)
	if err != nil {
		return err
	}

	// 3. อัปเดตสถานะรายงานตัวนี้ในตาราง reports
	_, err = tx.ExecContext(ctx, `UPDATE reports SET status = $1 WHERE report_id = $2`, req.Status, reportID)
	if err != nil {
		return err
	}

	// ==========================================
	// 🟢 กรณีแอดมินกดอนุมัติ (Resolved)
	// ==========================================
	if req.Status == "resolved" {

		// 🟢 กรณีที่ 1: เป็นคำขอปลดแบน (appeal_pending) -> แอดมินอนุมัติให้ปลดแบน
		if currentReportStatus == "appeal_pending" {
			if novelStatus != "suspended" || novelIsPublished {
				return errors.New("appeal requires suspended novel")
			}
			// ปลดแบนนิยาย (เปลี่ยน status กลับเป็น active หรือ draft ตามต้องการ)
			_, err = tx.ExecContext(ctx,
				`UPDATE novels SET status = 'draft', is_published = false, updated_at = NOW() WHERE novel_id = $1`,
				novelID,
			)
			if err != nil {
				return err
			}

			// แจ้งเตือนหานักเขียนว่าได้รับการปลดแบนแล้ว
			writerMsg := "คำขอปลดแบนสำหรับนิยายเรื่อง '" + novelTitle + "' ของคุณได้รับการอนุมัติเรียบร้อยแล้ว เหตุผล: " + strings.TrimSpace(req.Reason)
			if err := insertReportNotifications(ctx, tx, novelID, reportNotification{userID: writerUserID, message: writerMsg}); err != nil {
				return err
			}
		} else if currentReportStatus == "pending" {
			if !canResolvePendingReport(novelStatus, novelIsPublished) {
				return errors.New("report approval requires published or suspended novel")
			}
			if !shouldSuspendNovelForReport(novelStatus, novelIsPublished) {
				writerMsg := "นิยายเรื่อง '" + novelTitle + "' ที่มีรายงานได้รับการตรวจสอบแล้ว เหตุผล: " + strings.TrimSpace(req.Reason)
				reporterMsg := "การรายงานนิยายเรื่อง '" + novelTitle + "' ของคุณได้รับการดำเนินการแล้ว เหตุผล: " + strings.TrimSpace(req.Reason)
				if err := insertReportNotifications(ctx, tx, novelID,
					reportNotification{userID: writerUserID, message: writerMsg},
					reportNotification{userID: reporterID, message: reporterMsg},
				); err != nil {
					return err
				}
				return tx.Commit()
			}
			_, err = tx.ExecContext(ctx,
				`UPDATE novels SET status = 'suspended', is_published = false, updated_at = NOW() WHERE novel_id = $1`,
				novelID,
			)
			if err != nil {
				return err
			}

			writerMsg := "นิยายเรื่อง '" + novelTitle + "' ของคุณถูกระงับการเผยแพร่ เหตุผล: " + strings.TrimSpace(req.Reason)
			reporterMsg := "การรายงานนิยายเรื่อง '" + novelTitle + "' ของคุณได้รับการดำเนินการแล้ว เหตุผล: " + strings.TrimSpace(req.Reason)
			if err := insertReportNotifications(ctx, tx, novelID,
				reportNotification{userID: writerUserID, message: writerMsg},
				reportNotification{userID: reporterID, message: reporterMsg},
			); err != nil {
				return err
			}
		}
		// pending → resolved เปลี่ยนเฉพาะสถานะ report; การ suspend ทำผ่าน admin novel moderation เท่านั้น
	}

	// ==========================================
	// 🔴 กรณีแอดมินปฏิเสธ (Rejected)
	// ==========================================
	if req.Status == "rejected" {
		if currentReportStatus == "appeal_pending" {
			// นักเขียนขอปลดแบน แต่แอดมินปฏิเสธ (ไม่ยอมปลดแบนให้)
			writerMsg := "คำขอปลดแบนสำหรับนิยายเรื่อง '" + novelTitle + "' ถูกปฏิเสธ เหตุผล: " + strings.TrimSpace(req.Reason)
			if err := insertReportNotifications(ctx, tx, novelID, reportNotification{userID: writerUserID, message: writerMsg}); err != nil {
				return err
			}
		} else {
			// คนอ่านรายงานเข้ามา แต่แอดมินตรวจแล้วไม่ผิด
			reporterMsg := "การรายงานนิยายเรื่อง '" + novelTitle + "' ของคุณถูกปฏิเสธ เหตุผล: " + strings.TrimSpace(req.Reason)
			writerMsg := "นิยายเรื่อง '" + novelTitle + "' ที่มีรายงานได้รับการตรวจสอบแล้ว และรายงานถูกปฏิเสธ เหตุผล: " + strings.TrimSpace(req.Reason)
			if err := insertReportNotifications(ctx, tx, novelID,
				reportNotification{userID: reporterID, message: reporterMsg},
				reportNotification{userID: writerUserID, message: writerMsg},
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

// 📌 4. ฟังก์ชันสำหรับนักเขียนยื่นขอปลดแบน
func (r *sqlReportRepository) HasPendingAppeal(ctx context.Context, authorUserID, novelID int) (bool, error) {
	var exists bool
	query := `
		SELECT EXISTS (
			SELECT 1
			FROM reports
			WHERE user_id = $1
			  AND novel_id = $2
			  AND report_type = 'appeal'
			  AND status = 'appeal_pending'
		)`
	err := r.db.QueryRowContext(ctx, query, authorUserID, novelID).Scan(&exists)
	return exists, err
}

func (r *sqlReportRepository) CreateAppeal(ctx context.Context, authorUserID int, appeal dto.CreateAppealRequest) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var novelTitle string
	queryCheck := `
		SELECT n.title 
		FROM novels n
		JOIN writers w ON n.author_id = w.writer_id
		WHERE n.novel_id = $1 AND w.user_id = $2 AND n.status = 'suspended'
	`
	err = tx.QueryRowContext(ctx, queryCheck, appeal.NovelID, authorUserID).Scan(&novelTitle)
	if err != nil {
		return errors.New("unauthorized or novel is not currently banned")
	}

	var hasPending bool
	err = tx.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM reports
			WHERE user_id = $1 AND novel_id = $2 AND report_type = 'appeal' AND status = 'appeal_pending'
		)
	`, authorUserID, appeal.NovelID).Scan(&hasPending)
	if err != nil {
		return err
	}
	if hasPending {
		return errors.New("appeal already pending for this novel")
	}

	appealReason := "[ขอปลดแบน]: " + appeal.Reason
	queryInsert := `
		INSERT INTO reports (user_id, novel_id, reason, report_type, status, created_at)
		VALUES ($1, $2, $3, 'appeal', 'appeal_pending', NOW())
	`
	_, err = tx.ExecContext(ctx, queryInsert, authorUserID, appeal.NovelID, appealReason)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO notifications (user_id, type, reference_id, reference_type, message, is_read, created_at)
		 SELECT user_id, 'system', $1, 'novel', $2, false, NOW()
		 FROM users WHERE role = 'admin'`,
		appeal.NovelID, "มีคำขอปลดแบนใหม่สำหรับนิยายเรื่อง '"+novelTitle+"' เหตุผลจากนักเขียน: "+strings.TrimSpace(appeal.Reason),
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}
