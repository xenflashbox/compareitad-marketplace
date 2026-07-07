-- Compare ITAD Marketplace Wave 1 — Lane B
-- Migration: 001_marketplace_tables
-- Created: 2026-05
-- Reference: marketplace-rfp-architecture-spec-v1_1.md

-- Enable UUID generation if not already enabled (Neon supports this by default but be explicit)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Requirements: the demand-side RFP posts
-- ============================================================================

CREATE TABLE citad_marketplace_requirements (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sharetribe_listing_id         TEXT NOT NULL UNIQUE,
    asset_owner_user_id           TEXT NOT NULL,
    sub_agent_referral_id         TEXT,
    brokerage_registration_id     TEXT,
    status                        TEXT NOT NULL CHECK (status IN
                                    ('draft', 'pending-operator-review',
                                     'open-for-bids', 'bids-under-evaluation',
                                     'bid-selected-pending-inspection',
                                     'inspection-in-progress',
                                     'inspection-passed',
                                     'inspection-failed-renegotiating',
                                     'transaction-initiated',
                                     'completed', 'withdrawn', 'expired')),
    bidding_deadline              TIMESTAMPTZ NOT NULL,
    minimum_qualified_bids        INTEGER NOT NULL DEFAULT 3,
    selected_bid_id               UUID,
    inspection_window_days        INTEGER NOT NULL DEFAULT 10,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Bids: vendor responses to requirements
-- ============================================================================

CREATE TABLE citad_marketplace_bids (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id                UUID NOT NULL REFERENCES citad_marketplace_requirements(id),
    vendor_sharetribe_user_id     TEXT NOT NULL,
    vendor_payload_id             TEXT NOT NULL,
    submitted_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status                        TEXT NOT NULL CHECK (status IN
                                    ('draft', 'submitted', 'under-review',
                                     'revision-requested', 'rejected',
                                     'selected-pending-inspection',
                                     'inspection-passed-firm',
                                     'inspection-failed-withdrawn',
                                     'inspection-failed-renegotiated',
                                     'withdrawn')),

    bid_direction                 TEXT NOT NULL CHECK (bid_direction IN
                                    ('vendor-pays-owner', 'owner-pays-vendor')),
    bid_amount_cents              BIGINT NOT NULL,
    bid_currency                  CHAR(3) NOT NULL DEFAULT 'USD',
    pricing_model                 TEXT NOT NULL CHECK (pricing_model IN
                                    ('lump-sum', 'per-unit', 'per-pound',
                                     'revenue-share', 'hybrid')),
    pricing_detail                JSONB,

    proposed_timeline_days        INTEGER NOT NULL,
    proposed_inspection_method    TEXT NOT NULL CHECK (proposed_inspection_method IN
                                    ('vendor-on-site', 'third-party-on-site',
                                     'remote-video', 'sample-and-extrapolate')),
    service_package               JSONB NOT NULL,

    credentials_snapshot          JSONB NOT NULL,
    chain_of_custody_summary      TEXT,
    references_provided           JSONB,

    payment_rail_preference       TEXT,
    payment_rail_alternatives     JSONB,

    operator_review_notes         TEXT,
    operator_reviewed_by          TEXT,
    operator_reviewed_at          TIMESTAMPTZ,

    inspection_report_id          UUID,

    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Inspections: physical asset verification records
-- ============================================================================

CREATE TABLE citad_marketplace_inspections (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id                        UUID NOT NULL REFERENCES citad_marketplace_bids(id),
    inspection_method             TEXT NOT NULL,
    scheduled_at                  TIMESTAMPTZ,
    completed_at                  TIMESTAMPTZ,
    inspector_identity            TEXT NOT NULL,
    inspector_credentials         JSONB,
    findings_summary              TEXT,
    findings_detail               JSONB,
    discrepancies_found           BOOLEAN NOT NULL DEFAULT FALSE,
    discrepancy_severity          TEXT CHECK (discrepancy_severity IN
                                    ('none', 'minor-cosmetic',
                                     'material-renegotiable', 'material-disqualifying')),
    photographic_evidence_refs    JSONB,
    inspection_certificate_ref    TEXT,
    outcome                       TEXT NOT NULL CHECK (outcome IN
                                    ('pending', 'passed', 'passed-with-conditions',
                                     'failed-renegotiated', 'failed-withdrawn')),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Transactions: completed deals linking Sharetribe + commission + payouts
-- ============================================================================

CREATE TABLE citad_marketplace_transactions (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id                UUID NOT NULL REFERENCES citad_marketplace_requirements(id),
    bid_id                        UUID NOT NULL REFERENCES citad_marketplace_bids(id),
    sharetribe_transaction_id     TEXT NOT NULL UNIQUE,
    sharetribe_listing_id         TEXT NOT NULL,
    payment_rail                  TEXT NOT NULL,
    payment_rail_escrow_ref       TEXT,
    transaction_amount_cents      BIGINT NOT NULL,
    transaction_currency          CHAR(3) NOT NULL DEFAULT 'USD',
    commission_amount_cents       BIGINT,
    commission_captured_at        TIMESTAMPTZ,
    sub_agent_referral_id         TEXT,
    sub_agent_payout_amount_cents BIGINT,
    sub_agent_payout_queued_at    TIMESTAMPTZ,
    sub_agent_payout_statement_id TEXT,
    status                        TEXT NOT NULL CHECK (status IN
                                    ('initiated', 'funds-in-escrow',
                                     'service-in-progress', 'service-completed',
                                     'accepted', 'disputed', 'refunded-partial',
                                     'refunded-full', 'cancelled')),
    accepted_at                   TIMESTAMPTZ,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_bids_requirement ON citad_marketplace_bids(requirement_id, status);
CREATE INDEX idx_bids_vendor ON citad_marketplace_bids(vendor_sharetribe_user_id);
CREATE INDEX idx_inspections_bid ON citad_marketplace_inspections(bid_id);
CREATE INDEX idx_transactions_requirement ON citad_marketplace_transactions(requirement_id);
CREATE INDEX idx_transactions_sharetribe_id ON citad_marketplace_transactions(sharetribe_transaction_id);
CREATE INDEX idx_transactions_status ON citad_marketplace_transactions(status);
CREATE INDEX idx_requirements_status ON citad_marketplace_requirements(status);
CREATE INDEX idx_requirements_sharetribe_id ON citad_marketplace_requirements(sharetribe_listing_id);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION citad_marketplace_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_requirements_updated_at
    BEFORE UPDATE ON citad_marketplace_requirements
    FOR EACH ROW EXECUTE FUNCTION citad_marketplace_set_updated_at();

CREATE TRIGGER trigger_bids_updated_at
    BEFORE UPDATE ON citad_marketplace_bids
    FOR EACH ROW EXECUTE FUNCTION citad_marketplace_set_updated_at();

CREATE TRIGGER trigger_inspections_updated_at
    BEFORE UPDATE ON citad_marketplace_inspections
    FOR EACH ROW EXECUTE FUNCTION citad_marketplace_set_updated_at();

CREATE TRIGGER trigger_transactions_updated_at
    BEFORE UPDATE ON citad_marketplace_transactions
    FOR EACH ROW EXECUTE FUNCTION citad_marketplace_set_updated_at();
