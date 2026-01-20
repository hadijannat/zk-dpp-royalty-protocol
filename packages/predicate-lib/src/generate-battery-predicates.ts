#!/usr/bin/env node
/**
 * Generate EU Battery Passport Predicates
 *
 * This script generates all 8 EU Battery Regulation predicates using the template system.
 * Run with: npx tsx src/generate-battery-predicates.ts
 */

import { generatePredicates, type PredicateConfig } from './generator.js';

const batteryPredicates: PredicateConfig[] = [
  // 1. BATTERY_CAPACITY_GTE_V1
  {
    template: 'range',
    name: 'BATTERY_CAPACITY_GTE',
    version: 'V1',
    description: 'Proves battery capacity (Wh) is greater than or equal to declared minimum',
    claimType: 'battery_capacity',
    unit: 'Wh',
    valueType: 'u64',
    comparison: 'gte',
    thresholdDescription: 'minimum battery capacity required (Wh)',
    rangeValidation: `    // Battery capacity range: 0 < capacity <= 1,000,000 Wh (1 MWh max)
    assert(actual_value > 0, "Capacity must be positive");
    assert(actual_value <= 1000000, "Capacity exceeds 1 MWh maximum");`,
    failMessage: 'Battery capacity below threshold',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.05, currency: 'EUR' },
    testVectors: {
      validValue: 75000,
      validThreshold: 50000,
      invalidValue: 45000,
      invalidThreshold: 50000,
      exactValue: 50000,
    },
  },

  // 2. BATTERY_CHEMISTRY_IN_SET_V1
  {
    template: 'set_membership',
    name: 'BATTERY_CHEMISTRY_IN_SET',
    version: 'V1',
    description: 'Proves battery chemistry is one of the allowed types (LFP, NMC, NCA, LTO, Na-ion)',
    claimType: 'battery_chemistry',
    membershipType: 'membership',
    setDescription: 'allowed battery chemistry types',
    setElementDescription: 'chemistry type hashes',
    maxSetSize: 16,
    domainSeparator: '[0x42, 0x43, 0x48, 0x4D]', // "BCHM"
    failMessage: 'Battery chemistry not in allowed set',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.05, currency: 'EUR' },
    testVectors: {
      setElements: '[[0x4C, 0x46, 0x50, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0x4E, 0x4D, 0x43, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32]]',
      setSize: 2,
      validValue: '[0x4C, 0x46, 0x50, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]', // LFP
      invalidValue: '[0x4C, 0x43, 0x4F, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]', // LCO (not allowed)
      membershipTestDesc: 'is in allowed set',
    },
  },

  // 3. COBALT_ORIGIN_NOT_IN_V1
  {
    template: 'set_membership',
    name: 'COBALT_ORIGIN_NOT_IN',
    version: 'V1',
    description: 'Proves cobalt origin is NOT from conflict regions (OECD Due Diligence compliance)',
    claimType: 'cobalt_origin_country',
    membershipType: 'non_membership',
    setDescription: 'blocked conflict regions',
    setElementDescription: 'ISO 3166-1 alpha-3 country code hashes',
    maxSetSize: 32,
    domainSeparator: '[0x43, 0x4F, 0x42, 0x4C]', // "COBL"
    failMessage: 'Cobalt origin is from blocked conflict region',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.08, currency: 'EUR' },
    testVectors: {
      setElements: '[[0x43, 0x4F, 0x44, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32], [0; 32]]',
      setSize: 1,
      validValue: '[0x41, 0x55, 0x53, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]', // AUS
      invalidValue: '[0x43, 0x4F, 0x44, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]', // COD (blocked)
      membershipTestDesc: 'is NOT in blocked set',
    },
  },

  // 4. DUE_DILIGENCE_VALID_V1
  {
    template: 'timestamp',
    name: 'DUE_DILIGENCE_VALID',
    version: 'V1',
    description: 'Proves supply chain due diligence certification is valid (not expired)',
    claimType: 'due_diligence_cert',
    credentialType: 'Due diligence certification',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.03, currency: 'EUR' },
  },

  // 5. ENERGY_DENSITY_RANGE_V1
  {
    template: 'dual_range',
    name: 'ENERGY_DENSITY_RANGE',
    version: 'V1',
    description: 'Proves battery energy density (Wh/kg) is within declared range',
    claimType: 'energy_density',
    unit: 'Wh/kg',
    valueType: 'u32',
    rangeValidation: `    // Energy density physical limits: 50-500 Wh/kg (current technology)
    assert(actual_value >= 50, "Energy density below physical minimum");
    assert(actual_value <= 500, "Energy density above physical maximum");`,
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.05, currency: 'EUR' },
    testVectors: {
      minThreshold: 200,
      maxThreshold: 300,
      validValue: 250,
      belowMinValue: 180,
      aboveMaxValue: 350,
    },
  },

  // 6. STATE_OF_HEALTH_GTE_V1
  {
    template: 'range',
    name: 'STATE_OF_HEALTH_GTE',
    version: 'V1',
    description: 'Proves battery state of health (SOH) percentage is at or above threshold',
    claimType: 'state_of_health',
    unit: 'percent',
    valueType: 'u32',
    comparison: 'gte',
    thresholdDescription: 'minimum SOH percentage (0-100)',
    rangeValidation: `    // SOH is a percentage: 0-100
    assert(actual_value <= 100, "SOH exceeds 100%");`,
    failMessage: 'State of health below threshold',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.05, currency: 'EUR' },
    testVectors: {
      validValue: 85,
      validThreshold: 80,
      invalidValue: 65,
      invalidThreshold: 80,
      exactValue: 80,
    },
  },

  // 7. RECYCLING_EFFICIENCY_GTE_V1
  {
    template: 'range',
    name: 'RECYCLING_EFFICIENCY_GTE',
    version: 'V1',
    description: 'Proves recycling process efficiency meets EU Battery Regulation thresholds (65% by 2025, 70% by 2030)',
    claimType: 'recycling_efficiency',
    unit: 'percent',
    valueType: 'u32',
    comparison: 'gte',
    thresholdDescription: 'minimum recycling efficiency percentage',
    rangeValidation: `    // Recycling efficiency is a percentage: 0-100
    assert(actual_value <= 100, "Efficiency exceeds 100%");`,
    failMessage: 'Recycling efficiency below threshold',
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.05, currency: 'EUR' },
    testVectors: {
      validValue: 72,
      validThreshold: 65,
      invalidValue: 60,
      invalidThreshold: 65,
      exactValue: 70,
    },
  },

  // 8. CARBON_FOOTPRINT_LIFECYCLE_V1
  {
    template: 'lifecycle',
    name: 'CARBON_FOOTPRINT_LIFECYCLE',
    version: 'V1',
    description: 'Proves total lifecycle carbon footprint across all stages is within threshold',
    claimType: 'carbon_footprint_lifecycle',
    metric: 'carbon footprint',
    unit: 'kg CO2e/kWh',
    numStages: 5,
    stageNames: 'raw materials, manufacturing, transport, use phase, end-of-life',
    stageValidation: `    // Each stage must be non-negative (already enforced by u64)
    // Maximum single stage: 1,000,000 kg CO2e/kWh (sanity check)
    for i in 0..NUM_STAGES {
        assert(stage_values[i] <= 1000000, "Single stage exceeds maximum");
    }`,
    accessGroups: ['LEGIT_INTEREST', 'AUTHORITY'],
    pricing: { perVerification: 0.10, currency: 'EUR' },
    testVectors: {
      threshold: 50,
      validStages: '[8, 8, 8, 8, 8]', // Total: 40 < 50
      invalidStages: '[15, 15, 15, 15, 15]', // Total: 75 > 50
      claimTypeHashes: '[[0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32], [0x11; 32]]',
      unitHashes: '[[0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32], [0x20; 32]]',
    },
  },
];

console.log('Generating EU Battery Passport Predicates...\n');
generatePredicates(batteryPredicates);
console.log('\nDone! Generated 8 predicates.');
