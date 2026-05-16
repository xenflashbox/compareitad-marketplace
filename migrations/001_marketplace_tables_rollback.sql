-- Rollback for 001_marketplace_tables
-- Use only in dev environment for clean resets

DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON citad_marketplace_transactions;
DROP TRIGGER IF EXISTS trigger_inspections_updated_at ON citad_marketplace_inspections;
DROP TRIGGER IF EXISTS trigger_bids_updated_at ON citad_marketplace_bids;
DROP TRIGGER IF EXISTS trigger_requirements_updated_at ON citad_marketplace_requirements;

DROP TABLE IF EXISTS citad_marketplace_transactions;
DROP TABLE IF EXISTS citad_marketplace_inspections;
DROP TABLE IF EXISTS citad_marketplace_bids;
DROP TABLE IF EXISTS citad_marketplace_requirements;

DROP FUNCTION IF EXISTS citad_marketplace_set_updated_at();
