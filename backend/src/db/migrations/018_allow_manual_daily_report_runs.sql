-- Allow manual test runs to be saved as separate report history entries.

SET @drop_report_date_unique = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'daily_progress_reports'
        AND INDEX_NAME = 'uq_daily_reports_report_date'
    ),
    'ALTER TABLE daily_progress_reports DROP INDEX uq_daily_reports_report_date',
    'SELECT ''daily report date unique index is already absent'''
  )
);

PREPARE stmt FROM @drop_report_date_unique;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_report_date_index = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'daily_progress_reports'
        AND INDEX_NAME = 'idx_daily_reports_report_date'
    ),
    'ALTER TABLE daily_progress_reports ADD INDEX idx_daily_reports_report_date (report_date)',
    'SELECT ''daily report date index already exists'''
  )
);

PREPARE stmt FROM @add_report_date_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
