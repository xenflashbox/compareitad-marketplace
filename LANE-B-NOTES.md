# Lane B — Neon Database Migrations

**Wave 1, Lane B of the Compare ITAD marketplace sprint.**
Executed: 2026-05-16
Branch: `feat/wave1-lane-b-neon-migrations`

## Scope delivered

Four marketplace tables created on the shared Compare ITAD Neon database, namespaced `citad_marketplace_*`, with all indexes, foreign keys, CHECK constraints, and `updated_at` triggers per the binding spec.

- `citad_marketplace_requirements` — buyer RFP posts
- `citad_marketplace_bids` — vendor bids on requirements
- `citad_marketplace_inspections` — physical inspection records
- `citad_marketplace_transactions` — completed deals linking Sharetribe tx + commission + sub-agent payouts

## Database connection

- Host: `ep-delicate-violet-ad43jbhz-pooler.c-2.us-east-1.aws.neon.tech` (pooled endpoint)
- Database: `neondb`
- User: `neondb_owner`
- Schema: `public`
- PostgreSQL: 17.8
- Connection string source: `/Users/xgiannis/compareitad/.env.local` (`DATABASE_URL`)

The shared Compare ITAD Neon project is co-located with the hubsite's operational tables (per the architecture skill: directory leads, search analytics, marketplace transactions, etc. all live here, namespaced).

## Migration files

- `migrations/001_marketplace_tables.sql` — forward migration (idempotent for `pgcrypto` extension only; the four `CREATE TABLE` statements will error if applied twice)
- `migrations/001_marketplace_tables_rollback.sql` — reverse migration for dev resets

Both files are checked into the marketplace repo.

## Verification output

**Tables (4 / 4 expected):**
```
citad_marketplace_bids
citad_marketplace_inspections
citad_marketplace_requirements
citad_marketplace_transactions
```

**Indexes (8 / 8 expected):**
```
idx_bids_requirement
idx_bids_vendor
idx_inspections_bid
idx_requirements_sharetribe_id
idx_requirements_status
idx_transactions_requirement
idx_transactions_sharetribe_id
idx_transactions_status
```

**Triggers (4 / 4 expected):**
```
trigger_bids_updated_at         on citad_marketplace_bids
trigger_inspections_updated_at  on citad_marketplace_inspections
trigger_requirements_updated_at on citad_marketplace_requirements
trigger_transactions_updated_at on citad_marketplace_transactions
```

**Foreign keys (4):**
```
citad_marketplace_bids.requirement_id          -> citad_marketplace_requirements.id
citad_marketplace_inspections.bid_id           -> citad_marketplace_bids.id
citad_marketplace_transactions.bid_id          -> citad_marketplace_bids.id
citad_marketplace_transactions.requirement_id  -> citad_marketplace_requirements.id
```

**Helper function:** `citad_marketplace_set_updated_at()`

## Smoke test

Executed against the live tables — all assertions passed, all test data rolled back.

| Check | Result |
|---|---|
| INSERT requirement with `status='open-for-bids'` | PASS |
| INSERT bid with FK to requirement + JSONB columns | PASS |
| JOIN round-trip retrieves listing_id, amount_cents, status | PASS |
| JSONB extraction: `service_package->>'data_destruction'` | PASS (`NAID-AAA-physical`) |
| JSONB array: `credentials_snapshot->'certifications'` | PASS (`['NAID-AAA', 'R2v3']`) |
| CHECK constraint rejects `status='invalid-status'` | PASS (CheckViolation) |
| FK constraint rejects bad `bid_id` on inspections | PASS (ForeignKeyViolation) |
| ROLLBACK clears test data — 0 rows remaining | PASS |
| `updated_at` trigger advances across two separate transactions | PASS (created_at preserved, updated_at advanced ~2s) |

**Note on transaction semantics:** Postgres `NOW()` is transaction-scoped, so within a single transaction `updated_at` will equal `created_at` even after an UPDATE. This is correct behavior for the spec. In production, INSERT and UPDATE always happen in distinct transactions, where the trigger fires correctly (verified). If a future requirement needs wall-clock-monotonic `updated_at` within batched operations, swap `NOW()` to `clock_timestamp()` in the trigger — no migration scope here.

## Open questions / flags for architect

1. **No `citad.env` file exists** at the path the spec suggested. The `DATABASE_URL` lives in `/Users/xgiannis/compareitad/.env.local` (the hubsite project's env file). Lanes C and D (FastAPI) will need their own copy of this connection string in their service env when they spin up — either a dedicated `citad.env` should be canonized, or FastAPI should pull from the same shared `.env.local` via path reference. Flagging so Lane C/D agents are not blocked.

2. **The shared Neon project had zero `citad_*` tables when this migration ran** — my four `citad_marketplace_*` tables are the first tables provisioned on this Neon project under the `citad_` prefix. The hubsite's operational tables (leads, search analytics, etc.) per the architecture skill don't yet live here. Not a blocker; just noting state of the database for the next agent.

3. **No schema migration tool is wired up** to the marketplace repo. This first migration ran via a one-off Python script using `psycopg2-binary` in a venv (`.lane-b-venv/`, gitignored). Wave 2 or later should standardize a migration runner (e.g., `alembic`, `dbmate`, or a Node-side `node-pg-migrate`) so subsequent migrations have version tracking. For Wave 1 the one-off SQL approach is acceptable.

4. **Tooling installed for this lane:** `psycopg2-binary 2.9.12` in `.lane-b-venv/` (added to `.gitignore`). Future lanes may want a shared `requirements.txt` or `pyproject.toml` if Python tooling persists.

## Timing

- Connection verified + tables created: ~5 min
- Migration files written + executed: ~3 min
- Verification + smoke test: ~10 min
- Documentation + commit: ~5 min
- **Total: ~25 min**

## Rollback

To drop all Lane B tables in dev:

```bash
cd /Users/xgiannis/compareitad-marketplace
.lane-b-venv/bin/python -c "
import os, psycopg2
url=os.environ['DATABASE_URL']
conn=psycopg2.connect(url); cur=conn.cursor()
with open('migrations/001_marketplace_tables_rollback.sql') as f: cur.execute(f.read())
conn.commit(); cur.close(); conn.close(); print('rolled back')
"
```
