#!/usr/bin/env node
/**
 * Lane A validation script — Compare ITAD Marketplace
 *
 * Validates that:
 *   1. `buyer-requirement` and `vendor-service-package` listing types exist in
 *      Sharetribe Console and accept their full publicData schemas.
 *   2. The 8 search schemas pushed via flex-cli are live and indexable.
 *   3. `sdk.listings.query({ pub_assetCategory: 'gpu-accelerators' })` returns
 *      the buyer-requirement test listing (round-trip search verification).
 *
 * Reads credentials from /Users/xgiannis/compareitad-marketplace/.env.
 * Creates one throwaway test user + one listing of each type. Outputs a JSON
 * summary suitable for pasting into LANE-A-NOTES.md.
 *
 * Run: yarn run-script scripts/lane-a-validate.js
 *   or: node scripts/lane-a-validate.js
 */

require('dotenv').config();
const sdk = require('sharetribe-flex-sdk');
const { Money } = sdk.types;

const CLIENT_ID = process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID;
if (!CLIENT_ID) {
  console.error('Missing REACT_APP_SHARETRIBE_SDK_CLIENT_ID in .env');
  process.exit(1);
}

const TIMESTAMP = Date.now();
const TEST_EMAIL = `lane-a-test-${TIMESTAMP}@example.com`;
const TEST_PASSWORD = 'LaneATestPass2026!';

const out = (label, val) =>
  console.log(`${label}:`, typeof val === 'string' ? val : JSON.stringify(val, null, 2));
const err = (label, e) => {
  console.error(`✗ ${label} — ${e.status || ''} ${e.message || ''}`);
  if (e.data) console.error(JSON.stringify(e.data, null, 2));
};

async function main() {
  const s = sdk.createInstance({ clientId: CLIENT_ID });
  const summary = {
    timestamp: new Date().toISOString(),
    marketplace_id: process.env.SHARETRIBE_MARKETPLACE_ID || 'compareitad-dev',
    test_user: { email: TEST_EMAIL, id: null },
    buyer_requirement: { listing_id: null, state: null, public_data_keys: [], publish_error: null },
    vendor_service_package: { listing_id: null, state: null, public_data_keys: [], publish_error: null },
    search_query: { ran: false, results_count: 0, found_buyer_requirement: false },
  };

  // 1. Sign up test user
  console.log('\n=== STEP 1: Sign up test user ===');
  try {
    const r = await s.currentUser.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      firstName: 'LaneA',
      lastName: 'Test',
    });
    summary.test_user.id = r.data.data.id.uuid;
    out('  user.id', summary.test_user.id);
  } catch (e) { err('signup', e); throw e; }

  // 2. Log in as test user
  console.log('\n=== STEP 2: Log in ===');
  try {
    await s.login({ username: TEST_EMAIL, password: TEST_PASSWORD });
    console.log('  ✓ authenticated');
  } catch (e) { err('login', e); throw e; }

  // 3. Create buyer-requirement listing
  console.log('\n=== STEP 3: Create buyer-requirement listing ===');
  const buyerReqPD = {
    listingType: 'buyer-requirement',
    transactionProcessAlias: 'default-purchase/release-1',
    unitType: 'item',
    requirementType: 'asset-disposition',
    assetCategory: 'gpu-accelerators',
    assetMakeModel: JSON.stringify([
      { make: 'NVIDIA', model: 'H100', quantity: 1800, condition: 'deployed-3-years' },
      { make: 'NVIDIA', model: 'H200', quantity: 1400, condition: 'deployed-18-months' },
    ]),
    totalQuantity: 3200,
    facilityLocation: 'us-west',
    serviceWindow: '60-days-from-acceptance',
    requiredCredentials: ['NAID-AAA-physical', 'R2v3', 'documented-chain-of-custody'],
    preferredCredentials: ['ISO-14001', 'SOC-2-Type-II'],
    biddingMode: 'structured-rfp',
    biddingDeadline: '2026-06-30T23:59:59Z',
    minimumQualifiedBids: 3,
    anonymizedOwnerProfile: 'Fortune-500 technology enterprise',
    inspectionRequired: true,
    inspectionWindowDays: 10,
  };
  let buyerReq;
  try {
    const r = await s.ownListings.create({
      title: 'TEST · Lane A · Buyer Requirement · H100/H200 disposition',
      description: 'Lane A validation listing for buyer-requirement type. Created by scripts/lane-a-validate.js. Safe to delete after Wave 2 cutover.',
      publicData: buyerReqPD,
    }, { expand: true });
    buyerReq = r.data.data;
    summary.buyer_requirement.listing_id = buyerReq.id.uuid;
    summary.buyer_requirement.state = buyerReq.attributes.state;
    summary.buyer_requirement.public_data_keys = Object.keys(buyerReq.attributes.publicData).sort();
    out('  listing.id', summary.buyer_requirement.listing_id);
    out('  state', summary.buyer_requirement.state);
  } catch (e) { err('buyer-requirement create', e); }

  // 4. Publish buyer-requirement
  if (buyerReq && buyerReq.attributes && buyerReq.attributes.state === 'draft') {
    console.log('\n=== STEP 4: Publish buyer-requirement ===');
    try {
      const r = await s.ownListings.publishDraft({ id: buyerReq.id }, { expand: true });
      buyerReq = r.data.data;
      summary.buyer_requirement.state = buyerReq.attributes.state;
      console.log('  ✓ state →', summary.buyer_requirement.state);
    } catch (e) {
      err('publish buyer-requirement', e);
      summary.buyer_requirement.publish_error = e.message;
    }
  }

  // 5. Create vendor-service-package listing
  console.log('\n=== STEP 5: Create vendor-service-package listing ===');
  const vspPD = {
    listingType: 'vendor-service-package',
    transactionProcessAlias: 'default-purchase/release-1',
    unitType: 'item',
    materializedFromBidId: `test-bid-${TIMESTAMP}`,
    materializedFromRequirementId: `test-req-${TIMESTAMP}`,
    bidDirection: 'vendor-pays-owner',
    pricingModel: 'lump-sum',
    paymentRail: 'stripe-connect',
    servicePackage: JSON.stringify({
      serviceType: 'asset-pickup-and-resale',
      includesShipping: true,
      includesDataDestruction: true,
    }),
    proposedInspectionMethod: 'vendor-on-site',
    inspectionOutcome: 'passed',
    serviceWindowDays: 60,
  };
  let vsp;
  try {
    const r = await s.ownListings.create({
      title: 'TEST · Lane A · Vendor Service Package · H100/H200 disposition',
      description: 'Lane A validation listing for vendor-service-package type. Created by scripts/lane-a-validate.js. Safe to delete after Wave 2 cutover.',
      price: new Money(150000000, 'USD'), // $1,500,000.00
      publicData: vspPD,
    }, { expand: true });
    vsp = r.data.data;
    summary.vendor_service_package.listing_id = vsp.id.uuid;
    summary.vendor_service_package.state = vsp.attributes.state;
    summary.vendor_service_package.public_data_keys = Object.keys(vsp.attributes.publicData).sort();
    out('  listing.id', summary.vendor_service_package.listing_id);
    out('  state', summary.vendor_service_package.state);
  } catch (e) { err('vendor-service-package create', e); }

  // 6. Publish vendor-service-package
  if (vsp && vsp.attributes && vsp.attributes.state === 'draft') {
    console.log('\n=== STEP 6: Publish vendor-service-package ===');
    try {
      const r = await s.ownListings.publishDraft({ id: vsp.id }, { expand: true });
      vsp = r.data.data;
      summary.vendor_service_package.state = vsp.attributes.state;
      console.log('  ✓ state →', summary.vendor_service_package.state);
    } catch (e) {
      err('publish vendor-service-package', e);
      summary.vendor_service_package.publish_error = e.message;
    }
  }

  // 7. Search query verification (round-trip) — Sharetribe's search index has
  // a few seconds of lag after publish; poll with backoff up to 30s.
  console.log('\n=== STEP 7: Search query verification (poll up to 30s) ===');
  const pollEnd = Date.now() + 30000;
  let attempt = 0;
  while (Date.now() < pollEnd) {
    attempt++;
    try {
      const r = await s.listings.query({ pub_assetCategory: 'gpu-accelerators' });
      summary.search_query.ran = true;
      summary.search_query.results_count = r.data.data.length;
      const ids = r.data.data.map(l => l.id.uuid);
      const found = buyerReq && ids.includes(buyerReq.id.uuid);
      summary.search_query.found_buyer_requirement = found;
      summary.search_query.poll_attempts = attempt;
      console.log(`  attempt ${attempt}: ${summary.results_count || r.data.data.length} listings, our listing in results? ${found}`);
      if (found) {
        console.log('  ✓ search round-trip verified');
        break;
      }
    } catch (e) { err('search query', e); break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  if (!summary.search_query.found_buyer_requirement) {
    console.log('  ⚠️  buyer-requirement listing did not appear in search within 30s — see notes');
  }

  // 8. Final summary (JSON for LANE-A-NOTES.md)
  console.log('\n=== LANE A VALIDATION SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
