# ADR-008: Predicate Library Design

## Status

Accepted

## Context

The ZK-DPP system needs a registry of verifiable predicates that:

- Define what can be proven about claims
- Map predicates to ZK circuits
- Control access based on requester role
- Enable pricing for data monetization
- Support versioning for backward compatibility

Design considerations:
- New predicates will be added over time
- Predicates may be deprecated but not removed
- Different access tiers may have different predicate availability
- Pricing may vary by predicate complexity

## Decision

We will implement a **versioned predicate registry** as a JSON configuration with TypeScript wrapper.

### Registry Structure

```json
{
  "RECYCLED_CONTENT_GTE_V1": {
    "name": "RECYCLED_CONTENT_GTE",
    "version": "V1",
    "description": "Proves recycled content percentage >= threshold",
    "circuitPath": "recycled_content_gte_v1",
    "publicInputs": ["threshold", "commitment_root", "product_binding", "requester_binding"],
    "claimType": "recycled_content",
    "comparison": "gte",
    "unit": "percent",
    "accessGroups": ["LEGIT_INTEREST", "AUTHORITY"],
    "pricing": {
      "perVerification": 0.05,
      "currency": "EUR"
    },
    "status": "active",
    "deprecatedAt": null,
    "supersededBy": null
  }
}
```

### Predicate Categories

| Category | Predicates | Use Case |
|----------|------------|----------|
| Range | GTE, LTE, RANGE | Numeric thresholds |
| Set | IN_SET, NOT_IN | Membership/exclusion |
| Temporal | VALID, EXPIRED | Certificate validity |
| Composite | LIFECYCLE | Multi-claim aggregation |

### Naming Convention

```
{CLAIM_TYPE}_{COMPARISON}_{VERSION}

Examples:
- RECYCLED_CONTENT_GTE_V1
- CARBON_FOOTPRINT_LTE_V1
- BATTERY_CHEMISTRY_IN_SET_V1
- DUE_DILIGENCE_VALID_V1
```

## Consequences

### Positive

- **Discoverable**: Verifiers can query available predicates
- **Versionable**: V2 can coexist with V1 during migration
- **Configurable**: Pricing and access can be adjusted without code changes
- **Auditable**: Registry changes are tracked in version control
- **Type-safe**: TypeScript wrapper provides compile-time checks

### Negative

- **Synchronization**: Registry must match deployed circuits
- **Migration burden**: Deprecated predicates need handling
- **Static pricing**: Price changes require registry updates
- **No dynamic predicates**: Cannot create predicates at runtime

### Neutral

- Registry is read-only at runtime
- Adding predicates requires redeployment

## TypeScript Interface

```typescript
// packages/predicate-lib/src/types.ts

export interface PredicateDefinition {
  name: string;
  version: string;
  description: string;
  circuitPath: string;
  publicInputs: string[];
  claimType: string;
  comparison: 'gte' | 'lte' | 'range' | 'in_set' | 'not_in' | 'valid';
  unit?: string;
  accessGroups: AccessGroup[];
  pricing: {
    perVerification: number;
    currency: string;
  };
  status: 'active' | 'deprecated';
  deprecatedAt?: string;
  supersededBy?: string;
}

export type PredicateId = {
  name: string;
  version: string;
};

export type AccessGroup = 'PUBLIC' | 'LEGIT_INTEREST' | 'AUTHORITY';
```

### API

```typescript
// packages/predicate-lib/src/index.ts

export function getPredicate(id: PredicateId): PredicateDefinition | null;
export function listPredicates(filter?: { accessGroup?: AccessGroup }): PredicateDefinition[];
export function getCircuitPath(id: PredicateId): string;
export function canAccess(id: PredicateId, userGroups: AccessGroup[]): boolean;
export function getPrice(id: PredicateId): { amount: number; currency: string };
```

## Versioning Strategy

### Version Bumping Rules

| Change | Version Impact |
|--------|----------------|
| New public input | Major (V1 → V2) |
| Circuit optimization (same I/O) | Patch (V1.0 → V1.1) |
| Price change | None (config only) |
| Access group change | None (config only) |
| Bug fix in circuit | Major (V1 → V2) |

### Deprecation Process

1. Mark predicate as `deprecated` with date
2. Set `supersededBy` to new version
3. Continue supporting for 6 months
4. Remove circuit from proving system
5. Keep registry entry for historical reference

```json
{
  "RECYCLED_CONTENT_GTE_V1": {
    "status": "deprecated",
    "deprecatedAt": "2024-06-01",
    "supersededBy": "RECYCLED_CONTENT_GTE_V2"
  }
}
```

## Predicate Templates

For rapid predicate development, we provide templates:

```noir
// circuits/noir/templates/range_predicate.nr.tmpl
// Template for GTE/LTE/RANGE predicates

fn main(
    threshold: pub u64,
    commitment_root: pub [u8; 32],
    product_binding: pub [u8; 32],
    requester_binding: pub [u8; 32],
    actual_value: u64,
    // ... merkle proof inputs
) {
    // 1. Verify merkle membership
    // 2. Apply comparison: {{COMPARISON}}
}
```

Generator script:

```bash
# Generate new predicate from template
pnpm predicate:generate \
  --name ENERGY_DENSITY \
  --comparison range \
  --claim-type energy_density \
  --unit "Wh/kg"
```

## Current Predicates (12)

### MVP Predicates (4)
- RECYCLED_CONTENT_GTE_V1
- CARBON_FOOTPRINT_LTE_V1
- CERT_VALID_V1
- SUBSTANCE_NOT_IN_LIST_V1

### EU Battery Predicates (8)
- BATTERY_CAPACITY_GTE_V1
- BATTERY_CHEMISTRY_IN_SET_V1
- COBALT_ORIGIN_NOT_IN_V1
- DUE_DILIGENCE_VALID_V1
- ENERGY_DENSITY_RANGE_V1
- STATE_OF_HEALTH_GTE_V1
- RECYCLING_EFFICIENCY_GTE_V1
- CARBON_FOOTPRINT_LIFECYCLE_V1

## References

- [Predicate Registry](../../packages/predicate-lib/predicates.json)
- [Circuit Templates](../../circuits/noir/templates/)
- [Core Concepts - Predicates](../developer/concepts.md#predicates)
