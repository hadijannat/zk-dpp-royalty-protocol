/**
 * Predicate Generator
 *
 * Generates Noir circuits from templates with variable substitution.
 * Supports multiple predicate types: range, set_membership, timestamp, dual_range, lifecycle.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AccessGroup, ComparisonType, PredicatePricing, PredicateDefinition } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Template types supported by the generator
export type TemplateType = 'range' | 'set_membership' | 'timestamp' | 'dual_range' | 'lifecycle';

// Comparison operator for range predicates
export type RangeComparison = 'gte' | 'lte';

// Base configuration shared by all predicates
export interface BasePredicateConfig {
  name: string;
  version: string;
  description: string;
  claimType: string;
  accessGroups: AccessGroup[];
  pricing: PredicatePricing;
}

// Range predicate configuration (GTE, LTE)
export interface RangePredicateConfig extends BasePredicateConfig {
  template: 'range';
  comparison: RangeComparison;
  unit: string;
  valueType: 'u32' | 'u64';
  thresholdDescription: string;
  rangeValidation: string;
  failMessage: string;
  testVectors: {
    validValue: number;
    validThreshold: number;
    invalidValue: number;
    invalidThreshold: number;
    exactValue: number;
  };
}

// Set membership predicate configuration
export interface SetMembershipConfig extends BasePredicateConfig {
  template: 'set_membership';
  membershipType: 'membership' | 'non_membership';
  setDescription: string;
  setElementDescription: string;
  maxSetSize: number;
  domainSeparator: string; // e.g., "[0x42, 0x41, 0x54, 0x43]" for "BATC"
  failMessage: string;
  testVectors: {
    setElements: string; // Noir array literal
    setSize: number;
    validValue: string;   // Noir array literal for valid test
    invalidValue: string; // Noir array literal for invalid test
    membershipTestDesc: string;
  };
}

// Timestamp/validity predicate configuration
export interface TimestampPredicateConfig extends BasePredicateConfig {
  template: 'timestamp';
  credentialType: string;
}

// Dual range predicate configuration (min AND max threshold)
export interface DualRangeConfig extends BasePredicateConfig {
  template: 'dual_range';
  unit: string;
  valueType: 'u32' | 'u64';
  rangeValidation: string;
  testVectors: {
    minThreshold: number;
    maxThreshold: number;
    validValue: number;
    belowMinValue: number;
    aboveMaxValue: number;
  };
}

// Lifecycle aggregation predicate configuration
export interface LifecycleConfig extends BasePredicateConfig {
  template: 'lifecycle';
  metric: string;
  unit: string;
  numStages: number;
  stageNames: string;
  stageValidation: string;
  testVectors: {
    threshold: number;
    validStages: string;   // Noir array literal
    invalidStages: string; // Noir array literal
    claimTypeHashes: string;
    unitHashes: string;
  };
}

// Union of all config types
export type PredicateConfig =
  | RangePredicateConfig
  | SetMembershipConfig
  | TimestampPredicateConfig
  | DualRangeConfig
  | LifecycleConfig;

// Paths
const TEMPLATES_DIR = join(__dirname, '..', '..', '..', 'circuits', 'noir', 'templates');
const CIRCUITS_DIR = join(__dirname, '..', '..', '..', 'circuits', 'noir', 'predicates');
const REGISTRY_PATH = join(__dirname, '..', 'predicates.json');

/**
 * Reads a template file and returns its contents.
 */
function readTemplate(templateName: string): string {
  const templatePath = join(TEMPLATES_DIR, templateName);
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return readFileSync(templatePath, 'utf-8');
}

/**
 * Applies variable substitution to a template string.
 */
function applySubstitutions(template: string, substitutions: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(substitutions)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Generates the assertion code for range predicates.
 */
function generateRangeAssertion(comparison: RangeComparison, failMessage: string): string {
  if (comparison === 'gte') {
    return `assert(actual_value >= threshold, "${failMessage}");`;
  } else {
    return `assert(actual_value <= threshold, "${failMessage}");`;
  }
}

/**
 * Generates the predicate assertion description.
 */
function generatePredicateAssertion(comparison: RangeComparison): string {
  return comparison === 'gte' ? 'actual_value >= threshold' : 'actual_value <= threshold';
}

/**
 * Generates membership check code for set predicates.
 */
function generateMembershipCheck(membershipType: 'membership' | 'non_membership', failMessage: string): string {
  if (membershipType === 'membership') {
    return `    let mut found = false;
    for i in 0..MAX_SET_SIZE {
        if (i as u32) < set_size {
            if bytes_equal(actual_value, set_elements[i]) {
                found = true;
            }
        }
    }
    assert(found, "${failMessage}");`;
  } else {
    return `    let mut found = false;
    for i in 0..MAX_SET_SIZE {
        if (i as u32) < set_size {
            if bytes_equal(actual_value, set_elements[i]) {
                found = true;
            }
        }
    }
    assert(!found, "${failMessage}");`;
  }
}

/**
 * Generates a range predicate circuit from template.
 */
function generateRangePredicate(config: RangePredicateConfig): string {
  const template = readTemplate('range_predicate.nr.tmpl');
  const circuitName = `${config.name}_${config.version}`.toLowerCase();

  const substitutions: Record<string, string> = {
    PREDICATE_NAME: config.name,
    VERSION: config.version,
    DESCRIPTION: config.description,
    THRESHOLD_DESCRIPTION: config.thresholdDescription,
    CLAIM_TYPE: config.claimType,
    UNIT: config.unit,
    VALUE_TYPE: config.valueType,
    PREDICATE_ASSERTION: generatePredicateAssertion(config.comparison),
    ASSERTION_CODE: generateRangeAssertion(config.comparison, config.failMessage),
    RANGE_VALIDATION: config.rangeValidation,
    FAIL_MESSAGE: config.failMessage,
    TEST_VALID_VALUE: config.testVectors.validValue.toString(),
    TEST_VALID_THRESHOLD: config.testVectors.validThreshold.toString(),
    TEST_INVALID_VALUE: config.testVectors.invalidValue.toString(),
    TEST_INVALID_THRESHOLD: config.testVectors.invalidThreshold.toString(),
    TEST_EXACT_VALUE: config.testVectors.exactValue.toString(),
  };

  return applySubstitutions(template, substitutions);
}

/**
 * Generates a set membership predicate circuit from template.
 */
function generateSetMembershipPredicate(config: SetMembershipConfig): string {
  const template = readTemplate('set_membership.nr.tmpl');

  const substitutions: Record<string, string> = {
    PREDICATE_NAME: config.name,
    VERSION: config.version,
    DESCRIPTION: config.description,
    SET_DESCRIPTION: config.setDescription,
    SET_ELEMENT_DESCRIPTION: config.setElementDescription,
    CLAIM_TYPE: config.claimType,
    MAX_SET_SIZE: config.maxSetSize.toString(),
    DOMAIN_SEPARATOR: config.domainSeparator,
    MEMBERSHIP_TYPE: config.membershipType,
    MEMBERSHIP_CHECK_CODE: generateMembershipCheck(config.membershipType, config.failMessage),
    FAIL_MESSAGE: config.failMessage,
    TEST_SET_ELEMENTS: config.testVectors.setElements,
    TEST_SET_SIZE: config.testVectors.setSize.toString(),
    TEST_VALID_VALUE: config.testVectors.validValue,
    TEST_INVALID_VALUE: config.testVectors.invalidValue,
    MEMBERSHIP_TEST_DESCRIPTION: config.testVectors.membershipTestDesc,
  };

  return applySubstitutions(template, substitutions);
}

/**
 * Generates a timestamp validity predicate circuit from template.
 */
function generateTimestampPredicate(config: TimestampPredicateConfig): string {
  const template = readTemplate('timestamp_validity.nr.tmpl');

  const substitutions: Record<string, string> = {
    PREDICATE_NAME: config.name,
    VERSION: config.version,
    DESCRIPTION: config.description,
    CLAIM_TYPE: config.claimType,
    CREDENTIAL_TYPE: config.credentialType,
  };

  return applySubstitutions(template, substitutions);
}

/**
 * Generates a dual range predicate circuit from template.
 */
function generateDualRangePredicate(config: DualRangeConfig): string {
  const template = readTemplate('dual_range.nr.tmpl');

  const substitutions: Record<string, string> = {
    PREDICATE_NAME: config.name,
    VERSION: config.version,
    DESCRIPTION: config.description,
    CLAIM_TYPE: config.claimType,
    UNIT: config.unit,
    VALUE_TYPE: config.valueType,
    RANGE_VALIDATION: config.rangeValidation,
    TEST_MIN_THRESHOLD: config.testVectors.minThreshold.toString(),
    TEST_MAX_THRESHOLD: config.testVectors.maxThreshold.toString(),
    TEST_VALID_VALUE: config.testVectors.validValue.toString(),
    TEST_BELOW_MIN: config.testVectors.belowMinValue.toString(),
    TEST_ABOVE_MAX: config.testVectors.aboveMaxValue.toString(),
  };

  return applySubstitutions(template, substitutions);
}

/**
 * Generates a lifecycle aggregation predicate circuit from template.
 */
function generateLifecyclePredicate(config: LifecycleConfig): string {
  const template = readTemplate('lifecycle_aggregation.nr.tmpl');

  const substitutions: Record<string, string> = {
    PREDICATE_NAME: config.name,
    VERSION: config.version,
    DESCRIPTION: config.description,
    METRIC: config.metric,
    UNIT: config.unit,
    NUM_STAGES: config.numStages.toString(),
    STAGE_NAMES: config.stageNames,
    STAGE_VALIDATION: config.stageValidation,
    TEST_THRESHOLD: config.testVectors.threshold.toString(),
    TEST_VALID_STAGES: config.testVectors.validStages,
    TEST_INVALID_STAGES: config.testVectors.invalidStages,
    TEST_CLAIM_TYPE_HASHES: config.testVectors.claimTypeHashes,
    TEST_UNIT_HASHES: config.testVectors.unitHashes,
  };

  return applySubstitutions(template, substitutions);
}

/**
 * Generates the Nargo.toml file for a circuit.
 */
function generateNargoToml(circuitName: string): string {
  const template = readTemplate('Nargo.toml.tmpl');
  return applySubstitutions(template, { CIRCUIT_NAME: circuitName });
}

/**
 * Creates the circuit directory and writes files.
 */
function writeCircuitFiles(circuitName: string, mainNr: string, nargoToml: string): void {
  const circuitDir = join(CIRCUITS_DIR, circuitName);
  const srcDir = join(circuitDir, 'src');

  // Create directories
  if (!existsSync(circuitDir)) {
    mkdirSync(circuitDir, { recursive: true });
  }
  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
  }

  // Write files
  writeFileSync(join(srcDir, 'main.nr'), mainNr);
  writeFileSync(join(circuitDir, 'Nargo.toml'), nargoToml);

  console.log(`Generated circuit: ${circuitDir}`);
}

/**
 * Updates the predicate registry with a new predicate.
 */
function updateRegistry(config: PredicateConfig): void {
  const registryPath = REGISTRY_PATH;
  let registry: Record<string, PredicateDefinition> = {};

  if (existsSync(registryPath)) {
    registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  }

  const canonicalId = `${config.name}_${config.version}`;
  const circuitPath = `${config.name.toLowerCase()}_${config.version.toLowerCase()}`;

  // Determine comparison type based on template
  let comparison: ComparisonType;
  switch (config.template) {
    case 'range':
      comparison = config.comparison;
      break;
    case 'set_membership':
      comparison = config.membershipType === 'membership' ? 'set_membership' as ComparisonType : 'set_non_membership';
      break;
    case 'timestamp':
      comparison = 'timestamp_before_expiry';
      break;
    case 'dual_range':
      comparison = 'range' as ComparisonType;
      break;
    case 'lifecycle':
      comparison = 'lifecycle_aggregate';
      break;
  }

  // Determine public inputs based on template
  let publicInputs: string[];
  switch (config.template) {
    case 'range':
      publicInputs = ['threshold', 'commitment_root', 'product_binding', 'requester_binding'];
      break;
    case 'set_membership':
      publicInputs = ['set_hash', 'commitment_root', 'product_binding', 'requester_binding'];
      break;
    case 'timestamp':
      publicInputs = ['current_timestamp', 'commitment_root', 'product_binding', 'requester_binding'];
      break;
    case 'dual_range':
      publicInputs = ['min_threshold', 'max_threshold', 'commitment_root', 'product_binding', 'requester_binding'];
      break;
    case 'lifecycle':
      publicInputs = ['threshold', 'commitment_root', 'product_binding', 'requester_binding'];
      break;
  }

  const definition: PredicateDefinition = {
    name: config.name,
    version: config.version,
    description: config.description,
    circuitPath,
    publicInputs,
    accessGroups: config.accessGroups,
    pricing: config.pricing,
    claimType: config.claimType,
    comparison,
  };

  registry[canonicalId] = definition;

  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  console.log(`Updated registry: ${canonicalId}`);
}

/**
 * Main generator function - generates a predicate from configuration.
 */
export function generatePredicate(config: PredicateConfig): void {
  const circuitName = `${config.name.toLowerCase()}_${config.version.toLowerCase()}`;

  let mainNr: string;
  switch (config.template) {
    case 'range':
      mainNr = generateRangePredicate(config);
      break;
    case 'set_membership':
      mainNr = generateSetMembershipPredicate(config);
      break;
    case 'timestamp':
      mainNr = generateTimestampPredicate(config);
      break;
    case 'dual_range':
      mainNr = generateDualRangePredicate(config);
      break;
    case 'lifecycle':
      mainNr = generateLifecyclePredicate(config);
      break;
  }

  const nargoToml = generateNargoToml(circuitName);

  writeCircuitFiles(circuitName, mainNr, nargoToml);
  updateRegistry(config);
}

/**
 * Batch generate multiple predicates.
 */
export function generatePredicates(configs: PredicateConfig[]): void {
  for (const config of configs) {
    generatePredicate(config);
  }
}

// Export types for external use
export type {
  AccessGroup,
  ComparisonType,
  PredicatePricing,
  PredicateDefinition,
};
