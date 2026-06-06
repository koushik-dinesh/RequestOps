ALTER TABLE requests
  ADD COLUMN roi_type ENUM('TIME_SAVINGS', 'COST_SAVINGS') NULL;

ALTER TABLE requests
  ADD COLUMN roi_hours_saved_per_employee_per_month DECIMAL(10,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_employees_benefited INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_monthly_cost_savings_inr DECIMAL(14,2) NULL;
