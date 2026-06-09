-- Add business-impact ROI inputs used for calculated ROI reporting.

ALTER TABLE requests
  ADD COLUMN roi_users_impacted INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_time_saved_per_task DECIMAL(10,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_time_saved_unit ENUM('MINUTES', 'HOURS') NULL;

ALTER TABLE requests
  ADD COLUMN roi_occurrences_per_month INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_estimated_hourly_cost_inr DECIMAL(14,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_estimated_revenue_impact_inr DECIMAL(14,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_business_impact_category ENUM(
    'PRODUCTIVITY_IMPROVEMENT',
    'COST_REDUCTION',
    'REVENUE_INCREASE',
    'PROCESS_AUTOMATION',
    'COMPLIANCE',
    'QUALITY_IMPROVEMENT',
    'CUSTOMER_SATISFACTION'
  ) NULL;
