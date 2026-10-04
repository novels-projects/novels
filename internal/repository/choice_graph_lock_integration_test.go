package repository

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPostgresNovelGraphMutationSerializesSameNovel(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()

	repo := NewSceneRepository(db)
	const novelID = 2147483000
	start := make(chan struct{})
	ready := make(chan struct{}, 2)
	results := make(chan error, 2)
	var active atomic.Int32
	var maximumActive atomic.Int32
	var workers sync.WaitGroup

	for range 2 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			ready <- struct{}{}
			<-start
			results <- repo.WithNovelGraphMutation(novelID, func(ChoiceMutationRepository) error {
				current := active.Add(1)
				for previous := maximumActive.Load(); current > previous; previous = maximumActive.Load() {
					if maximumActive.CompareAndSwap(previous, current) {
						break
					}
				}
				time.Sleep(25 * time.Millisecond)
				active.Add(-1)
				return nil
			})
		}()
	}

	<-ready
	<-ready
	close(start)
	workers.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatalf("WithNovelGraphMutation returned an error: %v", err)
		}
	}

	if got := maximumActive.Load(); got != 1 {
		t.Fatalf("expected database graph lock to allow one mutation at a time, got max concurrency %d", got)
	}
}
