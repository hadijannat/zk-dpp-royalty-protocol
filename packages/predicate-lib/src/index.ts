import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Access groups for data visibility tiers
export type AccessGroup = 'PUBLIC' | 'LEGIT_INTEREST' | 'AUTHORITY';

// Comparison operators supported by predicates
export type ComparisonType =
  | 'gte'
  | 'lte'
  | 'eq'
  | 'range'
  | 'timestamp_before_expiry'
  | 'set_membership'
  | 'set_non_membership'
  | 'lifecycle_aggregate';

// Pricing configuration for a predicate
export interface PredicatePricing {
  perVerification: number;
  currency: 'EUR' | 'USD';
}

// Full predicate definition
export interface PredicateDefinition {
  name: string;
  version: string;
  description: string;
  circuitPath: string;
  publicInputs: string[];
  accessGroups: AccessGroup[];
  pricing: PredicatePricing;
  claimType: string;
  comparison: ComparisonType;
}

// Predicate identifier
export interface PredicateId {
  name: string;
  version: string;
}

// Registry type
export type PredicateRegistry = Record<string, PredicateDefinition>;

// Load the predicate registry
function loadRegistry(): PredicateRegistry {
  const path = join(__dirname, '..', 'predicates.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Cached registry
let cachedRegistry: PredicateRegistry | null = null;

/**
 * Gets the predicate registry, loading it if necessary.
 */
export function getRegistry(): PredicateRegistry {
  if (!cachedRegistry) {
    cachedRegistry = loadRegistry();
  }
  return cachedRegistry;
}

/**
 * Converts a PredicateId to its canonical string form.
 */
export function canonicalId(id: PredicateId): string {
  return `${id.name}_${id.version}`;
}

/**
 * Parses a canonical predicate string into a PredicateId.
 */
export function parseId(canonical: string): PredicateId {
  const lastUnderscore = canonical.lastIndexOf('_');
  if (lastUnderscore === -1) {
    throw new Error(`Invalid predicate ID: ${canonical}`);
  }
  return {
    name: canonical.substring(0, lastUnderscore),
    version: canonical.substring(lastUnderscore + 1),
  };
}

/**
 * Gets a predicate definition by its canonical ID.
 */
export function getPredicate(id: string | PredicateId): PredicateDefinition | undefined {
  const registry = getRegistry();
  const key = typeof id === 'string' ? id : canonicalId(id);
  return registry[key];
}

/**
 * Lists all available predicates.
 */
export function listPredicates(): PredicateDefinition[] {
  return Object.values(getRegistry());
}

/**
 * Lists predicates accessible to a given access group.
 */
export function listPredicatesForAccessGroup(group: AccessGroup): PredicateDefinition[] {
  return listPredicates().filter(p => p.accessGroups.includes(group));
}

/**
 * Gets the circuit path for a predicate.
 */
export function getCircuitPath(id: string | PredicateId): string | undefined {
  return getPredicate(id)?.circuitPath;
}

/**
 * Checks if a requester with given access group can use a predicate.
 */
export function canAccessPredicate(predicateId: string | PredicateId, requesterGroup: AccessGroup): boolean {
  const predicate = getPredicate(predicateId);
  if (!predicate) return false;
  return predicate.accessGroups.includes(requesterGroup);
}

/**
 * Gets the price for verifying a predicate.
 */
export function getVerificationPrice(id: string | PredicateId): PredicatePricing | undefined {
  return getPredicate(id)?.pricing;
}

// Export all predicate IDs as constants
export const PREDICATES = {
  // Original MVP predicates
  RECYCLED_CONTENT_GTE_V1: 'RECYCLED_CONTENT_GTE_V1',
  CARBON_FOOTPRINT_LTE_V1: 'CARBON_FOOTPRINT_LTE_V1',
  CERT_VALID_V1: 'CERT_VALID_V1',
  SUBSTANCE_NOT_IN_LIST_V1: 'SUBSTANCE_NOT_IN_LIST_V1',
  // EU Battery Passport predicates (Phase 8)
  BATTERY_CAPACITY_GTE_V1: 'BATTERY_CAPACITY_GTE_V1',
  BATTERY_CHEMISTRY_IN_SET_V1: 'BATTERY_CHEMISTRY_IN_SET_V1',
  COBALT_ORIGIN_NOT_IN_V1: 'COBALT_ORIGIN_NOT_IN_V1',
  DUE_DILIGENCE_VALID_V1: 'DUE_DILIGENCE_VALID_V1',
  ENERGY_DENSITY_RANGE_V1: 'ENERGY_DENSITY_RANGE_V1',
  STATE_OF_HEALTH_GTE_V1: 'STATE_OF_HEALTH_GTE_V1',
  RECYCLING_EFFICIENCY_GTE_V1: 'RECYCLING_EFFICIENCY_GTE_V1',
  CARBON_FOOTPRINT_LIFECYCLE_V1: 'CARBON_FOOTPRINT_LIFECYCLE_V1',
} as const;

// Aliases for backward compatibility
export const getPredicateById = getPredicate;
export const getAllPredicates = (): (PredicateDefinition & { id: string })[] => {
  const registry = getRegistry();
  return Object.entries(registry).map(([id, def]) => ({ ...def, id }));
};

// Export generator for creating new predicates
export * from './generator.js';
