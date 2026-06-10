-- Create daily progress report configuration, history, and delivery audit tables.

CREATE TABLE IF NOT EXISTS daily_progress_report_config (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  report_time TIME NOT NULL DEFAULT '19:00:00',
  recipient_user_ids JSON NULL,
  stale_threshold_days INT UNSIGNED NOT NULL DEFAULT 3,
  overdue_threshold_days INT UNSIGNED NOT NULL DEFAULT 7,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_daily_report_config_singleton CHECK (id = 1),
  CONSTRAINT fk_daily_report_config_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_progress_reports (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  report_date DATE NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by_user_id BIGINT UNSIGNED NULL,
  generation_source ENUM('SCHEDULED', 'MANUAL', 'RESEND') NOT NULL DEFAULT 'SCHEDULED',
  report_status ENUM('GENERATED', 'SENT', 'PARTIAL_FAILURE', 'FAILED') NOT NULL DEFAULT 'GENERATED',
  summary_json JSON NOT NULL,
  report_payload JSON NOT NULL,
  html_body LONGTEXT NOT NULL,
  recipients_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_reports_generated_by FOREIGN KEY (generated_by_user_id) REFERENCES users(id),
  INDEX idx_daily_reports_report_date (report_date),
  INDEX idx_daily_reports_generated_at (generated_at),
  INDEX idx_daily_reports_status (report_status)
);

CREATE TABLE IF NOT EXISTS daily_progress_report_deliveries (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NULL,
  recipient_name VARCHAR(150) NULL,
  recipient_email VARCHAR(255) NOT NULL,
  delivery_status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_report_deliveries_report FOREIGN KEY (report_id) REFERENCES daily_progress_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_report_deliveries_user FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  INDEX idx_daily_report_deliveries_report (report_id),
  INDEX idx_daily_report_deliveries_status (delivery_status),
  INDEX idx_daily_report_deliveries_email (recipient_email)
);
