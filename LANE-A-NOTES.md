# Lane A — Sharetribe Listing Types and Extended-Data Schemas

**Wave:** Wave 1, Lane A
**Date:** 2026-05-16 — 2026-05-17
**Marketplace:** `compareitad-dev` (Dev environment)
**Binding spec:** `compareitad/docs/marketplace-sprints/marketplace-rfp-architecture-spec-v1_1.md` § "Listing data model"
**Companion lanes (in parallel):** Lane B (Neon migrations), Lane C (FastAPI PaymentRail), Lane D (FastAPI CRUD)

---

## What was built

Two custom Sharetribe listing types and eight indexable search schemas, ready for Wave 2's FastAPI listing-creation flow to write against.

### Listing types (created in Sharetribe Console)

| Listing type ID | Display name | Transaction process (placeholder) | Process alias | Price required | Default fields kept |
|---|---|---|---|---|---|
| `buyer-requirement` | Buyer Requirement | `default-purchase` | `release-1` | No | title, description, images (price/delivery/pickup/shipping/payout fields unchecked) |
| `vendor-service-package` | Vendor Service Package | `default-purchase` | `release-1` | Yes | all defaults kept |

Both use `default-purchase` as a **placeholder transaction process**. Wave 3 replaces them with custom processes (`itad-rfp-completion-owner-pays` and `itad-rfp-completion-vendor-pays`) per the binding spec. The placeholder is documented as a Console quirk below.

### Search schemas pushed via `flex-cli search set`

All targeted `--scope public --schema-for listing` on the `compareitad-dev` marketplace.

| Key | Type | Listing type | Doc |
|---|---|---|---|
| `requirementType` | enum | buyer-requirement | values: asset-disposition, decommissioning, liquidation, mixed-services |
| `assetCategory` | enum | buyer-requirement | values: gpu-accelerators, servers-storage, networking, end-user-devices, mixed-it-assets, specialty |
| `totalQuantity` | long | buyer-requirement | total unit count across all make/model lines |
| `facilityLocation` | enum | buyer-requirement | values: us-northeast, us-southeast, us-midwest, us-southwest, us-west, us-multi-region |
| `serviceWindow` | enum | buyer-requirement | values: 30/60/90-days-from-acceptance, custom |
| `requiredCredentials` | multi-enum | buyer-requirement | values: NAID-AAA-physical, NAID-AAA-data, R2v3, e-Stewards, ISO-14001, SOC-2-Type-II, documented-chain-of-custody |
| `inspectionRequired` | boolean | buyer-requirement | always true in v1.0; reserved for v1.x inspection-optional flows |
| `bidDirection` | enum | vendor-service-package | values: vendor-pays-owner, owner-pays-vendor |

Verify with `flex-cli search -m compareitad-dev`.

### publicData fields NOT search-indexed (stored only)

Per the Lane A spec, these are stored on listings but not pushed as search schemas. They round-trip cleanly through `sdk.ownListings.create()`:

**buyer-requirement (7 non-indexed fields):**
`assetMakeModel`, `preferredCredentials`, `biddingMode`, `biddingDeadline`, `minimumQualifiedBids`, `anonymizedOwnerProfile`, `inspectionWindowDays`

**vendor-service-package (8 non-indexed fields):**
`materializedFromBidId`, `materializedFromRequirementId`, `pricingModel`, `paymentRail`, `servicePackage`, `proposedInspectionMethod`, `inspectionOutcome`, `serviceWindowDays`

### privateData and metadata (not configured in Lane A)

`privateData` and `metadata` fields documented in the spec are written by FastAPI in Wave 2 (privateData at listing-creation time) and by the Integration API in Wave 5 (operator metadata writes). No Console or CLI configuration required at this lane — Sharetribe accepts arbitrary fields under these scopes.

---

## Validation results

Validation ran via `scripts/lane-a-validate.js` (committed). Last run summary:

```json
{
  "timestamp": "2026-05-17T00:59:29.867Z",
  "marketplace_id": "compareitad-dev",
  "test_user": {
    "email": "lane-a-test-1778979569866@example.com",
    "id": "6a0912f2-c0d8-4867-947e-c9e17cb2fac6"
  },
  "buyer_requirement": {
    "listing_id": "6a0912f3-ae4f-4f9e-b7b1-e94077b2dd63",
    "state": "published",
    "public_data_keys": [
      "anonymizedOwnerProfile", "assetCategory", "assetMakeModel",
      "biddingDeadline", "biddingMode", "facilityLocation",
      "inspectionRequired", "inspectionWindowDays", "listingType",
      "minimumQualifiedBids", "preferredCredentials", "requiredCredentials",
      "requirementType", "serviceWindow", "totalQuantity",
      "transactionProcessAlias", "unitType"
    ]
  },
  "vendor_service_package": {
    "listing_id": "6a0912f4-2008-488e-a9a5-e467ee78b7d9",
    "state": "published",
    "public_data_keys": [
      "bidDirection", "inspectionOutcome", "listingType",
      "materializedFromBidId", "materializedFromRequirementId",
      "paymentRail", "pricingModel", "proposedInspectionMethod",
      "servicePackage", "serviceWindowDays",
      "transactionProcessAlias", "unitType"
    ]
  },
  "search_query": {
    "ran": true,
    "results_count": 4,
    "found_buyer_requirement": true,
    "poll_attempts": 2
  }
}
```

**What the validation script does:**

1. Signs up a fresh test user (`lane-a-test-<timestamp>@example.com`) via Marketplace SDK
2. Authenticates as that user
3. Creates one `buyer-requirement` listing with full 14-field publicData (asset-disposition, gpu-accelerators, etc.)
4. Creates one `vendor-service-package` listing with full 9-field publicData (vendor-pays-owner, lump-sum, stripe-connect, etc.) and price = $1,500,000 USD
5. Queries `sdk.listings.query({ pub_assetCategory: 'gpu-accelerators' })` with poll-and-backoff up to 30s
6. Confirms the just-created buyer-requirement listing appears in the search results

**Re-run with:** `node scripts/lane-a-validate.js`

---

## Console quirks and platform gotchas hit

### 1. `default-purchase` placeholder forced on `buyer-requirement`
Sharetribe Console requires every listing type to have a transaction process attached. `buyer-requirement` is a structured RFP post that is never directly purchased — vendors bid on it off-Sharetribe via FastAPI/Neon — so no real process applies. We attached `default-purchase` as a placeholder. **Wave 3 must replace this with a no-op process** (or move buyer-requirement to a process explicitly designed for inquiry-style listings). Until then, the placeholder is benign: no transitions ever fire on these listings.

### 2. Listing-type Unit Type options lack an "inquiry" equivalent
Console offered four transaction-process types: `calendar booking`, `purchase`, `free messaging`, `price negotiation`. None are "inquiry" or "no-op". `purchase` was selected on architect direction. "Free messaging" might fit `buyer-requirement` better conceptually but the lane spec was explicit on `default-purchase`.

### 3. Default listing fields had to be unchecked on `buyer-requirement`
Console pre-checks 8 default fields (title, description, price, delivery, pickup, shipping, images, payout details). For `buyer-requirement` we unchecked price, delivery, pickup, shipping, and payout details to minimize attack surface on a non-transactable listing. Title, description, and images stayed checked. Console accepted the save without complaining about missing price.

### 4. `ownListings.create()` returns sparse data by default
Sharetribe's `POST /v1/api/own_listings/create` returns only `{ id, type }` unless `expand: true` is passed as a query parameter. The first iteration of the validation script accessed `r.data.data.attributes.state` and threw a TypeError. Fix: pass `{ expand: true }` as the second arg to every `create()` / `publishDraft()` call. Documented in script comments.

### 5. Search index has ~6–9s propagation delay after publish
A just-published listing does NOT immediately appear in `sdk.listings.query()` results. The validation script polls every 3s for up to 30s; in practice the new listing surfaced on the second poll (~6s after publish). FastAPI handlers in Wave 2 that publish a listing and then immediately query for it should expect this lag — handle with poll-and-backoff or by using `ownListings.show()` for own-user verification (which is consistent immediately).

### 6. Console listing fields skipped per Lane A spec
The Lane A spec says to skip "Add listing fields" in Console — publicData fields are enforced by FastAPI at listing-creation time in Wave 2. Console did not require any custom fields for either listing type. The validation script confirms all 14 (buyer-requirement) and 9 (vendor-service-package) publicData fields are accepted and round-tripped by the Marketplace SDK without Console-side field definitions.

### 7. `flex-cli` does NOT support `assets pull/push` in v1.15.0
The `sharetribe/reference/CLI.md` skill doc mentions `flex-cli assets pull` and `flex-cli assets push` for managing no-code configurations as code. **These commands do not exist in flex-cli v1.15.0** — `flex-cli help` only lists `events`, `login`, `logout`, `notifications`, `process`, `search`, and `stripe` subcommands. Listing types and Console-managed assets must be created/edited via Console UI. The skill doc should be updated.

### 8. Search command syntax: `--asset` vs `--schema-for`
The Lane A spec used `flex-cli search set --asset listing ...`. The actual flex-cli v1.15.0 syntax is `--schema-for listing` (which defaults to `listing` if omitted). All 8 schemas were pushed successfully with the corrected syntax.

---

## Test artifacts left in the Dev marketplace

During iterative validation, the script created several test listings before the final clean run. As of 2026-05-17 00:59 UTC, the Dev marketplace contains approximately 4 published test listings with `pub_assetCategory=gpu-accelerators`, owned by various `lane-a-test-*@example.com` test users.

These are harmless test data in Dev. They can be closed by their owners via `sdk.ownListings.close()`, but each was created by a unique throwaway user the Marketplace SDK cannot impersonate. **Lane C (FastAPI scaffolding) will gain Integration API access** and should add a `cleanup-lane-a-test-listings.js` operator script in Wave 2 to close all listings matching the test-user-email pattern.

Not blocking. Documented for the next agent.

---

## Open questions for the architect (none blocking Wave 2 start)

1. **No-op transaction process for `buyer-requirement`.** Wave 3 needs to author this. Should it be a one-state process with no transitions, or a "structured-rfp-routing" process with an explicit `withdrawn` terminal state for cleanup? The latter gives a slightly cleaner audit trail and lets us use Sharetribe events to trigger requirement-status updates in Neon. Recommend the latter.

2. **`listingType`, `transactionProcessAlias`, `unitType` in publicData.** The Sharetribe Web Template puts these three fields in publicData on every listing (they appear in the validation output's `public_data_keys` lists). These are also configured on the listing-type itself in Console. The publicData copies are what listing-creation flows reference for transaction setup. **Confirm with the architect:** when FastAPI creates listings in Wave 2, should it pass these three fields explicitly in publicData (current Web Template behavior) or rely on Console listing-type config alone? Affects Wave 2 listing-creation contract.

3. **Cleanup posture for test/zombie listings.** Should Wave 2 ship an operator endpoint (`POST /admin/marketplace/cleanup-test-listings`) early so Lane B/C/D agents have a hygiene tool? Or is leaving Dev marketplace dirty acceptable until Wave 5 transaction execution surfaces the issue?

---

## Lane A Checkpoint status (per kickoff format)

```
Lane A Checkpoint:
- buyer-requirement listing type created: yes
  - Console listing type ID: buyer-requirement
  - Transaction process placeholder: default-purchase (release-1 alias)
- vendor-service-package listing type created: yes
  - Console listing type ID: vendor-service-package
  - Transaction process placeholder: default-purchase (release-1 alias)
- Search schemas pushed:
  - buyer-requirement: 7 of 7 (requirementType, assetCategory, totalQuantity,
    facilityLocation, serviceWindow, requiredCredentials, inspectionRequired)
  - vendor-service-package: 1 of 1 (bidDirection)
- Test listings created and round-tripped: yes — all 14 + 9 publicData fields preserved
- Search query verification (pub_assetCategory): returns test listing
  (after ~6–9s index propagation; poll-and-backoff implemented in validate script)
- LANE-A-NOTES.md committed: see commit SHA below after `git push`
- Open questions for architect: 3 (none blocking — see "Open questions" section above)
- Time elapsed: ~3 hours (including infrastructure setup that bled in from session one)
```

---

## Architect resolutions (added 2026-05-17)

Three Lane A open questions were resolved by the architect at Lane A close-out. All three are now closed; recording for archaeology.

### Q1 — No-op transaction process for `buyer-requirement` in Wave 3 → `structured-rfp-routing`

Architect agreed with Lane A's recommendation. Wave 3 will author a custom **`structured-rfp-routing`** transaction process with explicit states: `published → bids-open → bid-selected → withdrawn OR materialized`. A zero-state process would forfeit Sharetribe-side event audit on the requirement's lifecycle, which we want for analytics. The explicit-state process gives us a free event stream even though the actual transaction-of-record lives on the `vendor-service-package` listing. **Spec'd in the Wave 3 kickoff — not Wave 2 work.**

### Q2 — FastAPI publicData contract → set `listingType`, `transactionProcessAlias`, `unitType` explicitly

Architect ruled: **set them explicitly in the FastAPI service-layer code**. Don't rely on Console listing-type config alone.

Reasoning: the Sharetribe Web Template sets these because it does listing creation on behalf of an end user where the context is implicit. Compare ITAD's FastAPI service does listing creation on behalf of an **operator-mediated** workflow where being explicit about which listing type and which process alias is being created is the right discipline — "the difference between trust Console config and make the contract explicit in code." If Console config drifts (someone changes the default transaction process, renames a listing type), service-layer code should still create the listing we intended.

**Baked into the Wave 2 Lane A prompt.** Service-layer `create_listing()` will accept `listing_type` as a required parameter, look up `transactionProcessAlias` from a code-side constants table, and contract-test for missing inputs.

### Q3 — Cleanup endpoint posture → no dedicated endpoint, use the script

Architect ruled **no dedicated `/admin/marketplace/cleanup-test-listings` endpoint** — it's YAGNI.

The cleanup script Lane A already wrote (`scripts/lane-a-validate.js`) is idempotent and re-runnable; that's good enough for Dev environment cleanup during the build phase. ~4 zombie test listings in Dev are invisible to anyone not specifically querying Dev.

**Wave 2+ commitment:** all future test-fixture listings across all lanes use the title prefix convention `TEST · Lane X · <description>` (matching the Lane A pattern), so the cleanup script keeps working without modification across waves.

---

## File index

- `scripts/lane-a-validate.js` — validation script, idempotent, re-runnable
- `LANE-A-NOTES.md` (this file)
- `.env` (gitignored) — `SHARETRIBE_API_KEY`, `SHARETRIBE_MARKETPLACE_ID=compareitad-dev`, SDK creds

No secrets committed.
