package repository

import (
	"database/sql"

	"novel-be/internal/models"
)

// AnalyticsRepository กำหนด interface สำหรับ Analytics queries
type AnalyticsRepository interface {
	// GetNovelOverview คืน stats สรุปภาพรวมนิยาย สำหรับ Writer Dashboard
	GetNovelOverview(novelID int) (*models.NovelOverviewStats, error)
	// GetSceneAnalytics คืน stats สรุปเฉพาะฉากของนิยายที่ระบุ
	GetSceneAnalytics(novelID, sceneID int) (*models.SceneAnalyticsStats, error)
	// GetSceneChoiceAnalytics คืน stats สรุปสถิติ Choices ของฉากที่ระบุ
	GetSceneChoiceAnalytics(novelID, sceneID int) (*models.SceneChoiceAnalyticsStats, error)
	// GetAllScenesAnalytics คืน stats สรุปของทุกฉากในนิยาย
	GetAllScenesAnalytics(novelID int) ([]models.AllScenesAnalyticsStats, error)
	GetEdgeAnalytics(novelID int) ([]models.EdgeAnalyticsStats, error)
}

type postgresAnalyticsRepository struct {
	db *sql.DB
}

// NewAnalyticsRepository สร้าง AnalyticsRepository ที่ใช้ PostgreSQL
func NewAnalyticsRepository(db *sql.DB) AnalyticsRepository {
	return &postgresAnalyticsRepository{db: db}
}

// readerReachableScenesCTE สร้างชุด Scene ที่ Reader เดินทางถึงได้จาก Start Scene จริง
// ใช้ publication chain และข้อจำกัด Source/Target เดียวกับ Reading Flow;
// ไม่ใช้ Publish Validator และไม่ใช้ fallback ที่เลือก Scene แรกเมื่อไม่มี Start
func readerReachableScenesCTE(novelIDParam string) string {
	return `
	WITH RECURSIVE reader_start AS (
		SELECT s.scene_id
		FROM scenes s
		WHERE s.novel_id = ` + novelIDParam + `
		  AND s.type = 'start'
		LIMIT 1
	),
	reachable_scene_ids(scene_id) AS (
		SELECT s.scene_id
		FROM reader_start start_scene
		JOIN scenes s ON s.scene_id = start_scene.scene_id
		JOIN chapters ch ON ch.chapter_id = s.chapter_id
		JOIN novels n ON n.novel_id = s.novel_id
		WHERE s.status = 'published'
		  AND ch.status = 'published'
		  AND ch.novel_id = s.novel_id
		  AND n.is_published = TRUE
		  AND n.status NOT IN ('suspended', 'banned')

		UNION

		SELECT target.scene_id
		FROM reachable_scene_ids reachable
		JOIN scenes source ON source.scene_id = reachable.scene_id
		JOIN chapters source_ch ON source_ch.chapter_id = source.chapter_id
		JOIN novels n ON n.novel_id = source.novel_id
		JOIN choices c ON c.from_scene_id = source.scene_id
		JOIN scenes target ON target.scene_id = c.to_scene_id
			AND target.novel_id = source.novel_id
		JOIN chapters target_ch ON target_ch.chapter_id = target.chapter_id
		WHERE source.novel_id = ` + novelIDParam + `
		  AND source.status = 'published'
		  AND source_ch.status = 'published'
		  AND source_ch.novel_id = source.novel_id
		  AND target.status = 'published'
		  AND target_ch.status = 'published'
		  AND target_ch.novel_id = source.novel_id
		  AND n.is_published = TRUE
		  AND n.status NOT IN ('suspended', 'banned')
		  AND source.type <> 'ending'
		  AND target.type <> 'start'
		  AND source.scene_id <> target.scene_id
	)
	`
}

// GetSceneChoiceAnalytics ดึงสถิติ Choices ของ sceneID เฉพาะกรณีที่ฉากนั้นอยู่ใน novelID
// คืน (nil, nil) หากฉากไม่อยู่ใน novel หรือไม่มีอยู่จริง
func (r *postgresAnalyticsRepository) GetSceneChoiceAnalytics(novelID, sceneID int) (*models.SceneChoiceAnalyticsStats, error) {
	// ─── 1. Verify scene exists & belongs to novel ───────────────────────────
	var exists bool
	checkQuery := readerReachableScenesCTE("$2") + `
		SELECT EXISTS (
			SELECT 1
			FROM scenes s
			JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
			WHERE s.scene_id = $1
			  AND s.novel_id = $2
		)
	`
	if err := r.db.QueryRow(checkQuery, sceneID, novelID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, nil // scene not found in this novel
	}

	stats := &models.SceneChoiceAnalyticsStats{
		SceneID: sceneID,
		Choices: []models.ChoiceStat{},
	}

	// ─── 2. Query all choices for this scene + selection_count ───────────────
	// JOIN scenes s_to เพื่อดึง target_scene_title
	// LEFT JOIN user_choice_history uch เพื่อดึง COUNT(uch.id)
	choiceQuery := readerReachableScenesCTE("$2") + `
		SELECT
			c.choice_id,
			c.label,
			c.to_scene_id,
			COALESCE(s_to.title, '') AS target_scene_title,
			COUNT(uch.id)           AS selection_count
		FROM choices c
		JOIN scenes s_from ON s_from.scene_id = c.from_scene_id
		JOIN chapters ch_from ON ch_from.chapter_id = s_from.chapter_id
		JOIN novels n ON n.novel_id = s_from.novel_id
		JOIN scenes s_to ON s_to.scene_id = c.to_scene_id AND s_to.novel_id = s_from.novel_id
		JOIN chapters ch_to ON ch_to.chapter_id = s_to.chapter_id
		JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s_from.scene_id
		JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = s_to.scene_id
		LEFT JOIN user_choice_history uch ON uch.choice_id = c.choice_id
		WHERE c.from_scene_id = $1
		  AND s_from.novel_id = $2
		  AND s_from.type <> 'ending'
		  AND s_to.type <> 'start'
		  AND s_from.scene_id <> s_to.scene_id
		GROUP BY c.choice_id, c.label, c.to_scene_id, s_to.title
		ORDER BY c.choice_id ASC
	`

	rows, err := r.db.Query(choiceQuery, sceneID, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var totalSelections int64
	var topChoice *models.TopChoiceStat

	for rows.Next() {
		var cs models.ChoiceStat
		var toSceneID sql.NullInt64
		if err := rows.Scan(&cs.ChoiceID, &cs.Label, &toSceneID, &cs.TargetSceneTitle, &cs.SelectionCount); err != nil {
			return nil, err
		}
		if toSceneID.Valid {
			v := int(toSceneID.Int64)
			cs.ToSceneID = &v
		}
		totalSelections += cs.SelectionCount
		if cs.SelectionCount > 0 && (topChoice == nil || cs.SelectionCount > topChoice.SelectionCount) {
			topChoice = &models.TopChoiceStat{
				ChoiceID:       cs.ChoiceID,
				Label:          cs.Label,
				SelectionCount: cs.SelectionCount,
			}
		}
		stats.Choices = append(stats.Choices, cs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if totalSelections > 0 {
		for i := range stats.Choices {
			stats.Choices[i].Percentage = roundFloat2(
				float64(stats.Choices[i].SelectionCount) * 100.0 / float64(totalSelections),
			)
		}
		if topChoice != nil {
			topChoice.Percentage = roundFloat2(
				float64(topChoice.SelectionCount) * 100.0 / float64(totalSelections),
			)
		}
	}
	stats.TopChoice = topChoice

	return stats, nil
}

// GetSceneAnalytics ดึงข้อมูลสถิติของฉาก sceneID เฉพาะกรณีที่ฉากนั้นอยู่ใน novelID
// คืน (nil, nil) หากฉากไม่อยู่ใน novel หรือไม่มีอยู่จริง
func (r *postgresAnalyticsRepository) GetSceneAnalytics(novelID, sceneID int) (*models.SceneAnalyticsStats, error) {
	// ─── 1. Verify scene ownership and query basic scene stats ────────────────
	// ตรวจสอบว่า scene_id สังกัด novel_id จริง และดึง visit_count & unique_readers
	var stats models.SceneAnalyticsStats
	var rawVisitCount sql.NullInt64
	var rawUniqueReaders sql.NullInt64
	var sceneType string

	sceneQuery := readerReachableScenesCTE("$2") + `
		SELECT
			s.scene_id,
			s.title,
			s.type,
			SUM(ush.visit_count)        AS visit_count,
			COUNT(DISTINCT ush.user_id) AS unique_readers
		FROM scenes s
		LEFT JOIN user_scene_history ush ON ush.scene_id = s.scene_id
		JOIN chapters ch ON ch.chapter_id = s.chapter_id
		JOIN novels n ON n.novel_id = s.novel_id
		JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
		WHERE s.scene_id = $1
		  AND s.novel_id = $2
		GROUP BY s.scene_id, s.title, s.type
	`

	err := r.db.QueryRow(sceneQuery, sceneID, novelID).Scan(
		&stats.SceneID,
		&stats.Title,
		&sceneType,
		&rawVisitCount,
		&rawUniqueReaders,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // scene not found in this novel
		}
		return nil, err
	}

	if rawVisitCount.Valid {
		stats.VisitCount = rawVisitCount.Int64
	}
	if rawUniqueReaders.Valid {
		stats.UniqueReaders = rawUniqueReaders.Int64
	}

	// ─── 2. Calculate repeat_visit_count ─────────────────────────────────────
	if stats.VisitCount > stats.UniqueReaders {
		stats.RepeatVisitCount = stats.VisitCount - stats.UniqueReaders
	} else {
		stats.RepeatVisitCount = 0
	}

	// ─── 3. Query Previous Scenes ─────────────────────────────────────────────
	// หา choices ที่ชี้เข้ามายังฉากนี้ (to_scene_id = sceneID)
	// นับจำนวนครั้งที่ผู้ใช้เลือกทางเลือกนี้จริงจาก user_choice_history
	prevQuery := readerReachableScenesCTE("$2") + `
		SELECT
			s_from.scene_id,
			s_from.title,
			COUNT(uch.user_id) AS transition_count
		FROM choices c
		JOIN scenes s_from ON s_from.scene_id = c.from_scene_id
		JOIN chapters ch_from ON ch_from.chapter_id = s_from.chapter_id
		JOIN novels n ON n.novel_id = s_from.novel_id
		JOIN scenes s_to ON s_to.scene_id = c.to_scene_id AND s_to.novel_id = s_from.novel_id
		JOIN chapters ch_to ON ch_to.chapter_id = s_to.chapter_id
		JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s_from.scene_id
		JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = s_to.scene_id
		LEFT JOIN user_choice_history uch ON uch.choice_id = c.choice_id
		WHERE c.to_scene_id = $1
		  AND s_from.novel_id = $2
		  AND s_from.type <> 'ending'
		  AND s_to.type <> 'start'
		  AND s_from.scene_id <> s_to.scene_id
		GROUP BY s_from.scene_id, s_from.title
		ORDER BY transition_count DESC, s_from.scene_id ASC
	`

	prevRows, err := r.db.Query(prevQuery, sceneID, novelID)
	if err != nil {
		return nil, err
	}
	defer prevRows.Close()

	var totalPrevTransitions int64
	stats.PreviousScenes = []models.PreviousSceneStat{}

	for prevRows.Next() {
		var ps models.PreviousSceneStat
		if err := prevRows.Scan(&ps.SceneID, &ps.Title, &ps.TransitionCount); err != nil {
			return nil, err
		}
		totalPrevTransitions += ps.TransitionCount
		stats.PreviousScenes = append(stats.PreviousScenes, ps)
	}
	if err := prevRows.Err(); err != nil {
		return nil, err
	}

	if totalPrevTransitions > 0 {
		for i := range stats.PreviousScenes {
			stats.PreviousScenes[i].Percentage = roundFloat2(float64(stats.PreviousScenes[i].TransitionCount) * 100.0 / float64(totalPrevTransitions))
		}
	}

	// ─── 4. Query Next Scenes ────────────────────────────────────────────────
	// หา choices ที่ออกจากฉากนี้ (from_scene_id = sceneID)
	// นับจำนวนครั้งที่ผู้ใช้เลือกทางเลือกนี้จริงจาก user_choice_history
	nextQuery := readerReachableScenesCTE("$2") + `
		SELECT
			s_to.scene_id,
			s_to.title,
			c.label,
			COUNT(uch.user_id) AS transition_count
		FROM choices c
		JOIN scenes s_from ON s_from.scene_id = c.from_scene_id
		JOIN chapters ch_from ON ch_from.chapter_id = s_from.chapter_id
		JOIN novels n ON n.novel_id = s_from.novel_id
		JOIN scenes s_to ON s_to.scene_id = c.to_scene_id
		JOIN chapters ch_to ON ch_to.chapter_id = s_to.chapter_id
		JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s_from.scene_id
		JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = s_to.scene_id
		LEFT JOIN user_choice_history uch ON uch.choice_id = c.choice_id
		WHERE c.from_scene_id = $1
		  AND s_from.novel_id = $2
		  AND s_to.novel_id = s_from.novel_id
		  AND s_from.type <> 'ending'
		  AND s_to.type <> 'start'
		  AND s_from.scene_id <> s_to.scene_id
		GROUP BY s_to.scene_id, s_to.title, c.label, c.choice_id
		ORDER BY transition_count DESC, c.choice_id ASC
	`

	nextRows, err := r.db.Query(nextQuery, sceneID, novelID)
	if err != nil {
		return nil, err
	}
	defer nextRows.Close()

	var totalNextTransitions int64
	stats.NextScenes = []models.NextSceneStat{}

	for nextRows.Next() {
		var ns models.NextSceneStat
		if err := nextRows.Scan(&ns.SceneID, &ns.Title, &ns.ChoiceLabel, &ns.TransitionCount); err != nil {
			return nil, err
		}
		totalNextTransitions += ns.TransitionCount
		stats.NextScenes = append(stats.NextScenes, ns)
	}
	if err := nextRows.Err(); err != nil {
		return nil, err
	}

	if totalNextTransitions > 0 {
		for i := range stats.NextScenes {
			stats.NextScenes[i].Percentage = roundFloat2(float64(stats.NextScenes[i].TransitionCount) * 100.0 / float64(totalNextTransitions))
		}
	}

	// ─── 5. Calculate Drop-off Rate (Approximate) ────────────────────────────
	// ถ้าเป็น ending scene → dropOffRate = 0 (ไม่มี outgoing choices)
	// ถ้าไม่ใช่ ending scene:
	//   continued_users = distinct user_id ที่เลือก choice ออกจากฉากนี้
	//   drop_off_rate   = (unique_readers - continued_users) / unique_readers * 100
	if sceneType == "ending" || stats.UniqueReaders == 0 {
		stats.DropOffRate = 0.0
	} else {
		var continuedUsers int64
		contQuery := readerReachableScenesCTE("$2") + `
			SELECT COUNT(DISTINCT uch.user_id)
			FROM user_choice_history uch
			JOIN choices c ON c.choice_id = uch.choice_id
			JOIN scenes s ON s.scene_id = c.from_scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN scenes target ON target.scene_id = c.to_scene_id AND target.novel_id = s.novel_id
			JOIN chapters target_ch ON target_ch.chapter_id = target.chapter_id
			JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s.scene_id
			JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = target.scene_id
			WHERE c.from_scene_id = $1
			  AND s.novel_id = $2
			  AND s.type <> 'ending'
			  AND target.type <> 'start'
			  AND s.scene_id <> target.scene_id
		`
		if err := r.db.QueryRow(contQuery, sceneID, novelID).Scan(&continuedUsers); err != nil {
			return nil, err
		}

		if stats.UniqueReaders > continuedUsers {
			stats.DropOffRate = roundFloat2(float64(stats.UniqueReaders-continuedUsers) * 100.0 / float64(stats.UniqueReaders))
		} else {
			stats.DropOffRate = 0.0
		}
	}

	return &stats, nil
}

// GetNovelOverview รวบรวม metrics ทั้งหมดสำหรับ Novel Overview
// โดยแยก query แต่ละ metric เพื่อให้อ่านง่าย ดู Plan ได้ชัด และทดสอบได้ทีละส่วน
func (r *postgresAnalyticsRepository) GetNovelOverview(novelID int) (*models.NovelOverviewStats, error) {
	stats := &models.NovelOverviewStats{}

	// ─── 1. total_views + unique_readers + completed_readers ──────────────────
	// รวม 3 metric ไว้ใน query เดียวเพื่อลด round-trips
	//
	// - total_views   : novels.views (counter ที่ increment ทุกครั้งที่เปิดอ่าน)
	//
	// - unique_readers: COUNT(DISTINCT) จาก user_scene_history JOIN scenes
	//   ใช้ user_scene_history แทน reading_progress เพราะ:
	//   reading_progress ถูก DELETE ตอน Restart (ResetReadingProgress)
	//   แต่ user_scene_history เป็น cumulative analytics ที่ไม่ถูกลบ
	//   → นับ Reader ที่เคย Restart แล้วยังไม่กลับมาอ่านต่อได้ถูกต้อง
	//
	// - completed_readers: COUNT(DISTINCT) จาก user_endings JOIN scenes
	//   user_endings ไม่ถูกลบตอน Restart → สะสมถูกต้อง
	summaryQuery := readerReachableScenesCTE("$1") + `
		SELECT
			n.views                                               AS total_views,
			COUNT(DISTINCT ush_agg.user_id)                       AS unique_readers,
			COUNT(DISTINCT ue_agg.user_id)                        AS completed_readers
		FROM novels n
		LEFT JOIN (
			SELECT DISTINCT ush.user_id
			FROM user_scene_history ush
			JOIN scenes s ON s.scene_id = ush.scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
			WHERE s.novel_id = $1
		) ush_agg ON true
		LEFT JOIN (
			SELECT DISTINCT ue.user_id
			FROM user_endings ue
			JOIN scenes s ON s.scene_id = ue.scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
			WHERE s.novel_id = $1
			  AND LOWER(s.type) IN ('ending', 'end')
		) ue_agg ON true
		WHERE n.novel_id = $1
		GROUP BY n.novel_id, n.views
	`

	row := r.db.QueryRow(summaryQuery, novelID)
	if err := row.Scan(&stats.TotalViews, &stats.UniqueReaders, &stats.CompletedReaders); err != nil {
		return nil, err
	}

	// ─── 2. completion_rate ───────────────────────────────────────────────────
	// คำนวณในระดับ Go เพื่อหลีกเลี่ยง divide-by-zero และง่ายต่อการ test
	if stats.UniqueReaders > 0 {
		stats.CompletionRate = roundFloat2(float64(stats.CompletedReaders) * 100.0 / float64(stats.UniqueReaders))
	}

	// ─── 3. ending_stats ──────────────────────────────────────────────────────
	// ดึงฉากจบทั้งหมดของนิยายเรื่องนี้ (รวมถึงฉากที่ยังไม่มีผู้อ่านปลดล็อก เพื่อให้นักเขียนเห็นสถิติครบทุกฉากจบ)
	// ดึงทั้ง scene_id, ending_title, ending_type, และจำนวน distinct readers ที่ปลดล็อก
	endingQuery := readerReachableScenesCTE("$1") + `
		SELECT
			s.scene_id,
			COALESCE(NULLIF(s.ending_title, ''), s.title)     AS ending_title,
			COALESCE(NULLIF(s.ending_type, ''), 'Ending')      AS ending_type,
			COUNT(DISTINCT ue.user_id)                         AS cnt
		FROM scenes s
		LEFT JOIN user_endings ue ON ue.scene_id = s.scene_id
		JOIN chapters ch ON ch.chapter_id = s.chapter_id
		JOIN novels n ON n.novel_id = s.novel_id
		JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
		WHERE s.novel_id = $1
		  AND LOWER(s.type) IN ('ending', 'end')
		GROUP BY s.scene_id, s.ending_title, s.title, s.ending_type
		ORDER BY cnt DESC, s.scene_id ASC
	`

	endingRows, err := r.db.Query(endingQuery, novelID)
	if err != nil {
		return nil, err
	}
	defer endingRows.Close()

	for endingRows.Next() {
		var es models.EndingStat
		if err := endingRows.Scan(&es.SceneID, &es.EndingTitle, &es.EndingType, &es.Count); err != nil {
			return nil, err
		}
		if stats.UniqueReaders > 0 {
			es.Percentage = roundFloat2(float64(es.Count) * 100.0 / float64(stats.UniqueReaders))
		}
		stats.EndingStats = append(stats.EndingStats, es)
	}
	if err := endingRows.Err(); err != nil {
		return nil, err
	}

	// ─── 4. top_drop_off_scenes ───────────────────────────────────────────────
	// Approximate drop-off: ฉากที่ผู้อ่านเข้าไปแต่ไม่ได้เลือก Choice ออก
	//
	// visited_users   = COUNT(DISTINCT user_id ใน user_scene_history)
	// continued_users = COUNT(DISTINCT user_id ที่เคยเลือก choice จากฉากนี้
	//                         ใน user_choice_history JOIN choices)
	// drop_off_rate   = (visited_users - continued_users) / visited_users × 100
	//
	// ข้อจำกัด:
	//   - Ending scenes ถูกกรองออก (type = 'ending' / 'end') เพราะไม่มี outgoing choice
	//   - ผู้ที่ยังอ่านอยู่แต่ยังไม่เลือก จะถูกนับว่า drop-off ด้วย (limitation)
	//   - ไม่ใช่ exact session drop-off
	dropOffQuery := readerReachableScenesCTE("$1") + `
		, scene_visit AS (
			SELECT
				s.scene_id,
				s.title,
				SUM(ush.visit_count)            AS total_visit_count,
				COUNT(DISTINCT ush.user_id)     AS visited_users
			FROM user_scene_history ush
			JOIN scenes s ON s.scene_id = ush.scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
			WHERE s.novel_id = $1
			  AND LOWER(s.type) NOT IN ('ending', 'end')
			GROUP BY s.scene_id, s.title
		),
		scene_continued AS (
			SELECT
				c.from_scene_id                 AS scene_id,
				COUNT(DISTINCT uch.user_id)     AS continued_users
			FROM user_choice_history uch
			JOIN choices c ON c.choice_id = uch.choice_id
			JOIN scenes s ON s.scene_id = c.from_scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN scenes target ON target.scene_id = c.to_scene_id AND target.novel_id = s.novel_id
			JOIN chapters target_ch ON target_ch.chapter_id = target.chapter_id
			JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s.scene_id
			JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = target.scene_id
			WHERE s.novel_id = $1
			  AND s.type <> 'ending'
			  AND target.type <> 'start'
			  AND s.scene_id <> target.scene_id
			GROUP BY c.from_scene_id
		)
		SELECT
			sv.scene_id,
			sv.title,
			sv.total_visit_count                                            AS visit_count,
			sv.visited_users                                                AS unique_readers,
			ROUND(
				(sv.visited_users - COALESCE(sc.continued_users, 0))::numeric
				* 100.0
				/ NULLIF(sv.visited_users, 0),
				2
			)                                                               AS drop_off_rate
		FROM scene_visit sv
		LEFT JOIN scene_continued sc ON sc.scene_id = sv.scene_id
		WHERE sv.visited_users > 0
		ORDER BY drop_off_rate DESC, sv.visited_users DESC
		LIMIT 10
	`

	dropRows, err := r.db.Query(dropOffQuery, novelID)
	if err != nil {
		return nil, err
	}
	defer dropRows.Close()

	for dropRows.Next() {
		var d models.DropOffScene
		if err := dropRows.Scan(&d.SceneID, &d.Title, &d.VisitCount, &d.UniqueReaders, &d.DropOffRate); err != nil {
			return nil, err
		}
		stats.TopDropOffScenes = append(stats.TopDropOffScenes, d)
	}
	if err := dropRows.Err(); err != nil {
		return nil, err
	}

	return stats, nil
}

// roundFloat2 ปัดทศนิยม 2 ตำแหน่ง
func roundFloat2(v float64) float64 {
	return float64(int64(v*100+0.5)) / 100
}

func (r *postgresAnalyticsRepository) GetAllScenesAnalytics(novelID int) ([]models.AllScenesAnalyticsStats, error) {
	query := readerReachableScenesCTE("$1") + `
		, scene_visit AS (
			SELECT s.scene_id, s.title, s.type,
				SUM(ush.visit_count) AS total_visit_count,
				COUNT(DISTINCT ush.user_id) AS visited_users
			FROM scenes s
			LEFT JOIN user_scene_history ush ON ush.scene_id = s.scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN reachable_scene_ids reachable ON reachable.scene_id = s.scene_id
			WHERE s.novel_id = $1
			GROUP BY s.scene_id, s.title, s.type
		),
		scene_continued AS (
			SELECT c.from_scene_id AS scene_id,
				COUNT(DISTINCT uch.user_id) AS continued_users
			FROM user_choice_history uch
			JOIN choices c ON c.choice_id = uch.choice_id
			JOIN scenes s ON s.scene_id = c.from_scene_id
			JOIN chapters ch ON ch.chapter_id = s.chapter_id
			JOIN novels n ON n.novel_id = s.novel_id
			JOIN scenes target ON target.scene_id = c.to_scene_id AND target.novel_id = s.novel_id
			JOIN chapters target_ch ON target_ch.chapter_id = target.chapter_id
			JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s.scene_id
			JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = target.scene_id
			WHERE s.novel_id = $1
			  AND s.type <> 'ending'
			  AND target.type <> 'start'
			  AND s.scene_id <> target.scene_id
			GROUP BY c.from_scene_id
		)
		SELECT sv.scene_id, sv.title,
			COALESCE(sv.total_visit_count, 0) AS visit_count,
			COALESCE(sv.visited_users, 0) AS unique_readers,
			CASE WHEN LOWER(sv.type) IN ('ending', 'end') OR sv.visited_users = 0 THEN 0
				ELSE ROUND((sv.visited_users - COALESCE(sc.continued_users, 0))::numeric * 100.0 / NULLIF(sv.visited_users, 0), 2)
			END AS drop_off_rate
		FROM scene_visit sv
		LEFT JOIN scene_continued sc ON sc.scene_id = sv.scene_id
		ORDER BY sv.scene_id ASC
	`
	rows, err := r.db.Query(query, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.AllScenesAnalyticsStats
	for rows.Next() {
		var s models.AllScenesAnalyticsStats
		var dropOffRate sql.NullFloat64
		if err := rows.Scan(&s.SceneID, &s.Title, &s.VisitCount, &s.UniqueReaders, &dropOffRate); err != nil {
			return nil, err
		}
		if dropOffRate.Valid {
			s.DropOffRate = dropOffRate.Float64
		}
		results = append(results, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

func (r *postgresAnalyticsRepository) GetEdgeAnalytics(novelID int) ([]models.EdgeAnalyticsStats, error) {
	query := readerReachableScenesCTE("$1") + `
		, edge_counts AS (
			SELECT c.from_scene_id, c.to_scene_id, c.choice_id, c.label,
				COALESCE(s_to.title, '') AS target_scene_title,
				COUNT(uch.id) AS selection_count
			FROM choices c
			JOIN scenes s_from ON s_from.scene_id = c.from_scene_id AND s_from.novel_id = $1
			JOIN chapters ch_from ON ch_from.chapter_id = s_from.chapter_id
			JOIN novels n ON n.novel_id = s_from.novel_id
			JOIN scenes s_to ON s_to.scene_id = c.to_scene_id AND s_to.novel_id = s_from.novel_id
			JOIN chapters ch_to ON ch_to.chapter_id = s_to.chapter_id
			JOIN reachable_scene_ids source_reachable ON source_reachable.scene_id = s_from.scene_id
			JOIN reachable_scene_ids target_reachable ON target_reachable.scene_id = s_to.scene_id
			LEFT JOIN user_choice_history uch ON uch.choice_id = c.choice_id
			WHERE s_from.type <> 'ending'
			  AND s_to.type <> 'start'
			  AND s_from.scene_id <> s_to.scene_id
			GROUP BY c.from_scene_id, c.to_scene_id, c.choice_id, c.label, s_to.title
		)
		SELECT from_scene_id, to_scene_id, choice_id, label, target_scene_title,
			selection_count,
			CASE WHEN SUM(selection_count) OVER (PARTITION BY from_scene_id) = 0 THEN 0
				ELSE ROUND(selection_count::numeric * 100.0 / SUM(selection_count) OVER (PARTITION BY from_scene_id), 2)
			END AS percentage
		FROM edge_counts
		ORDER BY from_scene_id, choice_id`

	rows, err := r.db.Query(query, novelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []models.EdgeAnalyticsStats{}
	for rows.Next() {
		var edge models.EdgeAnalyticsStats
		if err := rows.Scan(&edge.FromSceneID, &edge.ToSceneID, &edge.ChoiceID, &edge.ChoiceLabel, &edge.TargetTitle, &edge.SelectionCount, &edge.Percentage); err != nil {
			return nil, err
		}
		results = append(results, edge)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
