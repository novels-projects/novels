package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"sort"
	"strings"
	"testing"

	"novel-be/internal/dto"
)

func TestReportResolutionSuspendsOnlyPublishedNovel(t *testing.T) {
	if !shouldSuspendNovelForReport("published", true) {
		t.Fatal("expected published novel to be suspended on first resolved report")
	}
	if shouldSuspendNovelForReport("suspended", false) {
		t.Fatal("did not expect already suspended novel to be suspended again")
	}
	if !canResolvePendingReport("suspended", false) {
		t.Fatal("expected pending report on suspended novel to remain resolvable")
	}
	if canResolvePendingReport("draft", false) {
		t.Fatal("did not expect pending report on draft novel to be approved")
	}
}

func TestMultipleReportsOnSameNovelRemainResolvableAfterSuspension(t *testing.T) {
	// Report A resolves first from a published novel; that transition is allowed.
	if !shouldSuspendNovelForReport("published", true) {
		t.Fatal("expected first report on published novel to trigger suspension")
	}

	// After suspension, a later pending report B should not be blocked by the novel being suspended.
	if shouldSuspendNovelForReport("suspended", false) {
		t.Fatal("did not expect second report to suspend an already suspended novel again")
	}
	if !canResolvePendingReport("suspended", false) {
		t.Fatal("expected remaining pending report on the same novel to stay resolvable after suspension")
	}
}

func TestReportStatusTransitionsNotifyReporterAndNovelAuthorOnce(t *testing.T) {
	tests := []struct {
		name             string
		reporterID       int
		authorID         int
		reportStatus     string
		novelStatus      string
		novelIsPublished bool
		nextReportStatus string
		nextNovelStatus  string
		nextIsPublished  bool
		wantRecipients   []int
	}{
		{
			name:             "resolved published novel",
			reporterID:       11,
			authorID:         22,
			reportStatus:     "pending",
			novelStatus:      "published",
			novelIsPublished: true,
			nextReportStatus: "resolved",
			nextNovelStatus:  "suspended",
			wantRecipients:   []int{11, 22},
		},
		{
			name:             "resolved already suspended novel",
			reporterID:       11,
			authorID:         22,
			reportStatus:     "pending",
			novelStatus:      "suspended",
			novelIsPublished: false,
			nextReportStatus: "resolved",
			nextNovelStatus:  "suspended",
			wantRecipients:   []int{11, 22},
		},
		{
			name:             "rejected report",
			reporterID:       11,
			authorID:         22,
			reportStatus:     "pending",
			novelStatus:      "published",
			novelIsPublished: true,
			nextReportStatus: "rejected",
			nextNovelStatus:  "published",
			nextIsPublished:  true,
			wantRecipients:   []int{11, 22},
		},
		{
			name:             "reporter is also novel author",
			reporterID:       11,
			authorID:         11,
			reportStatus:     "pending",
			novelStatus:      "published",
			novelIsPublished: true,
			nextReportStatus: "rejected",
			nextNovelStatus:  "published",
			nextIsPublished:  true,
			wantRecipients:   []int{11},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state := &reportTransitionTestState{
				reporterID:       tt.reporterID,
				authorID:         tt.authorID,
				novelID:          7,
				reportStatus:     tt.reportStatus,
				reportType:       "report",
				novelStatus:      tt.novelStatus,
				novelIsPublished: tt.novelIsPublished,
				novelTitle:       "Test Novel",
			}
			db := sql.OpenDB(reportTransitionConnector{state: state})
			defer db.Close()

			err := NewReportRepository(db).UpdateReportStatus(context.Background(), 3, dto.UpdateReportStatusRequest{
				Status: tt.nextReportStatus,
				Reason: "reviewed",
			})
			if err != nil {
				t.Fatalf("UpdateReportStatus() error = %v", err)
			}
			if !state.commitCalled {
				t.Fatal("transaction was not committed")
			}
			if state.reportStatus != tt.nextReportStatus {
				t.Errorf("report status = %q, want %q", state.reportStatus, tt.nextReportStatus)
			}
			if state.novelStatus != tt.nextNovelStatus {
				t.Errorf("novel status = %q, want %q", state.novelStatus, tt.nextNovelStatus)
			}
			if state.novelIsPublished != tt.nextIsPublished {
				t.Errorf("novel is_published = %v, want %v", state.novelIsPublished, tt.nextIsPublished)
			}

			gotRecipients := append([]int(nil), state.notificationRecipients...)
			sort.Ints(gotRecipients)
			if len(gotRecipients) != len(tt.wantRecipients) {
				t.Fatalf("notification recipients = %v, want %v", gotRecipients, tt.wantRecipients)
			}
			for i, want := range tt.wantRecipients {
				if gotRecipients[i] != want {
					t.Errorf("notification recipients = %v, want %v", gotRecipients, tt.wantRecipients)
					break
				}
			}
		})
	}
}

func TestReportStatusTransitionRollsBackOnNotificationFailure(t *testing.T) {
	tests := []struct {
		name             string
		novelStatus      string
		novelIsPublished bool
	}{
		{name: "novel status changes", novelStatus: "published", novelIsPublished: true},
		{name: "novel status does not change", novelStatus: "suspended", novelIsPublished: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state := &reportTransitionTestState{
				reporterID:               11,
				authorID:                 22,
				novelID:                  7,
				reportStatus:             "pending",
				reportType:               "report",
				novelStatus:              tt.novelStatus,
				novelIsPublished:         tt.novelIsPublished,
				novelTitle:               "Test Novel",
				notificationRecipients:   []int{33},
				failNotificationInsertAt: 2,
			}
			originalRecipients := append([]int(nil), state.notificationRecipients...)
			db := sql.OpenDB(reportTransitionConnector{state: state})
			defer db.Close()

			err := NewReportRepository(db).UpdateReportStatus(context.Background(), 3, dto.UpdateReportStatusRequest{
				Status: "resolved",
				Reason: "reviewed",
			})
			if err == nil || !strings.Contains(err.Error(), "injected notification insert failure") {
				t.Fatalf("UpdateReportStatus() error = %v, want injected notification insert failure", err)
			}
			if !state.rollbackCalled {
				t.Fatal("transaction rollback was not called after notification insert failed")
			}
			if state.commitCalled {
				t.Fatal("transaction committed after notification insert failed")
			}
			if state.reportStatus != "pending" {
				t.Errorf("report status after rollback = %q, want pending", state.reportStatus)
			}
			if state.novelStatus != tt.novelStatus {
				t.Errorf("novel status after rollback = %q, want original %q", state.novelStatus, tt.novelStatus)
			}
			if state.novelIsPublished != tt.novelIsPublished {
				t.Errorf("novel is_published after rollback = %v, want original %v", state.novelIsPublished, tt.novelIsPublished)
			}
			if len(state.notificationRecipients) != len(originalRecipients) || state.notificationRecipients[0] != originalRecipients[0] {
				t.Errorf("notification recipients after rollback = %v, want original %v", state.notificationRecipients, originalRecipients)
			}
		})
	}
}

type reportTransitionTestState struct {
	reporterID               int
	authorID                 int
	novelID                  int
	reportStatus             string
	reportType               string
	novelStatus              string
	novelIsPublished         bool
	novelTitle               string
	notificationRecipients   []int
	failNotificationInsertAt int
	rollbackCalled           bool
	commitCalled             bool
}

type reportTransitionConnector struct {
	state *reportTransitionTestState
}

func (c reportTransitionConnector) Connect(context.Context) (driver.Conn, error) {
	return &reportTransitionConn{state: c.state}, nil
}

func (c reportTransitionConnector) Driver() driver.Driver {
	return reportTransitionDriver{}
}

type reportTransitionDriver struct{}

func (reportTransitionDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("report transition test driver requires its connector")
}

type reportTransitionConn struct {
	state *reportTransitionTestState
	tx    *reportTransitionTx
}

func (c *reportTransitionConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepared statements are not supported")
}

func (*reportTransitionConn) Close() error { return nil }

func (c *reportTransitionConn) Begin() (driver.Tx, error) {
	return c.beginTx(), nil
}

func (c *reportTransitionConn) BeginTx(context.Context, driver.TxOptions) (driver.Tx, error) {
	return c.beginTx(), nil
}

func (c *reportTransitionConn) beginTx() *reportTransitionTx {
	working := *c.state
	working.notificationRecipients = append([]int(nil), c.state.notificationRecipients...)
	c.tx = &reportTransitionTx{conn: c, working: &working}
	return c.tx
}

func (c *reportTransitionConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if c.tx == nil {
		return nil, errors.New("report transition test query requires a transaction")
	}
	state := c.tx.working
	switch {
	case strings.Contains(query, "SELECT r.user_id, r.novel_id"):
		return &reportTransitionRows{
			columns: []string{"user_id", "novel_id", "status", "report_type", "novel_status", "is_published"},
			values: []driver.Value{
				int64(state.reporterID),
				int64(state.novelID),
				state.reportStatus,
				state.reportType,
				state.novelStatus,
				state.novelIsPublished,
			},
		}, nil
	case strings.Contains(query, "SELECT w.user_id, n.title"):
		return &reportTransitionRows{
			columns: []string{"user_id", "title"},
			values:  []driver.Value{int64(state.authorID), state.novelTitle},
		}, nil
	default:
		return nil, errors.New("unexpected query in report transition test: " + query)
	}
}

func (c *reportTransitionConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if c.tx == nil {
		return nil, errors.New("report transition test exec requires a transaction")
	}
	state := c.tx.working
	switch {
	case strings.Contains(query, "UPDATE reports SET status"):
		state.reportStatus = args[0].Value.(string)
	case strings.Contains(query, "UPDATE novels SET status = 'suspended'"):
		state.novelStatus = "suspended"
		state.novelIsPublished = false
	case strings.Contains(query, "UPDATE novels SET status = 'draft'"):
		state.novelStatus = "draft"
		state.novelIsPublished = false
	case strings.Contains(query, "INSERT INTO notifications"):
		c.tx.notificationInsertCount++
		if state.failNotificationInsertAt > 0 && c.tx.notificationInsertCount == state.failNotificationInsertAt {
			return nil, errors.New("injected notification insert failure")
		}
		state.notificationRecipients = append(state.notificationRecipients, int(args[0].Value.(int64)))
	default:
		return nil, errors.New("unexpected exec in report transition test: " + query)
	}
	return driver.RowsAffected(1), nil
}

type reportTransitionTx struct {
	conn                    *reportTransitionConn
	working                 *reportTransitionTestState
	notificationInsertCount int
	done                    bool
}

func (tx *reportTransitionTx) Commit() error {
	if tx.done {
		return sql.ErrTxDone
	}
	tx.conn.state.reportStatus = tx.working.reportStatus
	tx.conn.state.novelStatus = tx.working.novelStatus
	tx.conn.state.novelIsPublished = tx.working.novelIsPublished
	tx.conn.state.notificationRecipients = append([]int(nil), tx.working.notificationRecipients...)
	tx.conn.state.commitCalled = true
	tx.done = true
	return nil
}

func (tx *reportTransitionTx) Rollback() error {
	if tx.done {
		return sql.ErrTxDone
	}
	tx.conn.state.rollbackCalled = true
	tx.done = true
	return nil
}

type reportTransitionRows struct {
	columns []string
	values  []driver.Value
	read    bool
}

func (r *reportTransitionRows) Columns() []string { return r.columns }
func (*reportTransitionRows) Close() error        { return nil }

func (r *reportTransitionRows) Next(dest []driver.Value) error {
	if r.read {
		return io.EOF
	}
	copy(dest, r.values)
	r.read = true
	return nil
}
