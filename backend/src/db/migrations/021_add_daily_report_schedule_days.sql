-- Add configurable schedule days for automated daily progress reports.
-- Days use Python weekday convention: 0=Monday through 6=Sunday.

ALTER TABLE daily_progress_report_config
  ADD COLUMN schedule_days JSON NULL AFTER report_time;

UPDATE daily_progress_report_config
  SET schedule_days = JSON_ARRAY(0, 1, 2, 3, 4, 5, 6)
  WHERE schedule_days IS NULL;
