package repository

import (
	"context"
	"database/sql"
	"time"

	"novel-be/internal/dto"
)

type DashboardRepository interface {
	GetSummary(ctx context.Context) (dto.DashboardSummary, error)
	GetTrend(ctx context.Context, months int, timezone string) (dto.DashboardTrend, error)
}

type sqlDashboardRepository struct {
	db *sql.DB
}

func NewDashboardRepository(db *sql.DB) DashboardRepository {
	return &sqlDashboardRepository{db: db}
}

func (r *sqlDashboardRepository) GetSummary(ctx context.Context) (dto.DashboardSummary, error) {
	var summary dto.DashboardSummary
	err := r.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM users),
			(
				SELECT COUNT(*)
				FROM novels n
				JOIN writers w ON w.writer_id = n.author_id
				WHERE n.is_published = TRUE
				  AND n.status NOT IN ('suspended', 'banned')
				  AND w.status = 'approved'
			),
			(SELECT COUNT(DISTINCT user_id) FROM writers WHERE status = 'approved'),
			(
				SELECT COUNT(DISTINCT w.user_id)
				FROM writers w
				JOIN audit_logs al ON al.actor_user_id = w.user_id
				WHERE al.created_at >= NOW() - INTERVAL '30 days'
				  AND w.status = 'approved'
			)`).Scan(
		&summary.TotalUsers,
		&summary.TotalNovelsPublished,
		&summary.TotalWriters,
		&summary.ActiveWriters30d,
	)
	if err != nil {
		return dto.DashboardSummary{}, err
	}

	summary.PendingWriterRequests.Count, err = countByStatus(ctx, r.db, "writers", "pending")
	if err != nil {
		return dto.DashboardSummary{}, err
	}
	summary.PendingWriterRequests.Recent, err = r.listWriterRequests(ctx)
	if err != nil {
		return dto.DashboardSummary{}, err
	}

	summary.PendingReports, err = r.getReportQueue(ctx, "pending")
	if err != nil {
		return dto.DashboardSummary{}, err
	}
	summary.AppealPending, err = r.getReportQueue(ctx, "appeal_pending")
	if err != nil {
		return dto.DashboardSummary{}, err
	}

	return summary, nil
}

func countByStatus(ctx context.Context, db *sql.DB, table, status string) (int64, error) {
	var count int64
	query := "SELECT COUNT(*) FROM " + table + " WHERE status = $1"
	err := db.QueryRowContext(ctx, query, status).Scan(&count)
	return count, err
}

func (r *sqlDashboardRepository) listWriterRequests(ctx context.Context) ([]dto.DashboardWriterRequest, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT w.user_id, u.username, w.pen_name, w.applied_at
		FROM writers w
		JOIN users u ON u.user_id = w.user_id
		WHERE w.status = 'pending'
		ORDER BY w.applied_at DESC, w.writer_id DESC
		LIMIT 3`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]dto.DashboardWriterRequest, 0, 3)
	for rows.Next() {
		var request dto.DashboardWriterRequest
		if err := rows.Scan(&request.UserID, &request.Username, &request.PenName, &request.AppliedAt); err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}
	return requests, rows.Err()
}

func (r *sqlDashboardRepository) getReportQueue(ctx context.Context, status string) (dto.DashboardReportQueue, error) {
	var queue dto.DashboardReportQueue
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reports WHERE status = $1`, status).Scan(&queue.Count); err != nil {
		return dto.DashboardReportQueue{}, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT r.report_id, r.novel_id, n.title, r.created_at
		FROM reports r
		JOIN novels n ON n.novel_id = r.novel_id
		WHERE r.status = $1
		ORDER BY r.created_at DESC, r.report_id DESC
		LIMIT 3`, status)
	if err != nil {
		return dto.DashboardReportQueue{}, err
	}
	defer rows.Close()

	queue.Recent = make([]dto.DashboardReportItem, 0, 3)
	for rows.Next() {
		var item dto.DashboardReportItem
		if err := rows.Scan(&item.ReportID, &item.NovelID, &item.NovelTitle, &item.CreatedAt); err != nil {
			return dto.DashboardReportQueue{}, err
		}
		queue.Recent = append(queue.Recent, item)
	}
	return queue, rows.Err()
}

func (r *sqlDashboardRepository) GetTrend(ctx context.Context, months int, timezone string) (dto.DashboardTrend, error) {
	rows, err := r.db.QueryContext(ctx, `
		WITH month_series AS (
			SELECT generate_series(
				date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1) - (($2 - 1) * INTERVAL '1 month'),
				date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE $1),
				INTERVAL '1 month'
			) AS month_start
		), user_counts AS (
			SELECT date_trunc('month', created_at AT TIME ZONE 'UTC' AT TIME ZONE $1) AS month_start, COUNT(*) AS total
			FROM users
			GROUP BY 1
		), novel_counts AS (
			SELECT date_trunc('month', n.created_at AT TIME ZONE 'UTC' AT TIME ZONE $1) AS month_start, COUNT(*) AS total
			FROM novels n
			JOIN writers w ON w.writer_id = n.author_id
			WHERE n.is_published = TRUE
			  AND n.status NOT IN ('suspended', 'banned')
			  AND w.status = 'approved'
			GROUP BY 1
		)
		SELECT
			m.month_start,
			COALESCE(u.total, 0),
			COALESCE(n.total, 0)
		FROM month_series m
		LEFT JOIN user_counts u ON u.month_start = m.month_start
		LEFT JOIN novel_counts n ON n.month_start = m.month_start
		ORDER BY m.month_start`, timezone, months)
	if err != nil {
		return dto.DashboardTrend{}, err
	}
	defer rows.Close()

	trend := dto.DashboardTrend{Months: make([]dto.DashboardTrendMonth, 0, months)}
	for rows.Next() {
		var month time.Time
		var item dto.DashboardTrendMonth
		if err := rows.Scan(&month, &item.NewUsers, &item.NewNovels); err != nil {
			return dto.DashboardTrend{}, err
		}
		item.Month = month.Format("2006-01")
		trend.Months = append(trend.Months, item)
	}
	return trend, rows.Err()
}
