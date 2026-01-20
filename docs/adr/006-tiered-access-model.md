# ADR-006: Tiered Access Model for DPP Views

## Status

Accepted

## Context

Digital Product Passports contain sensitive supply chain data. Different stakeholders have different legitimate needs for information:

- **Consumers**: Basic compliance status (is it compliant?)
- **Business partners**: Verified predicate results for due diligence
- **Regulators**: Full audit capability including raw values

A one-size-fits-all approach either:
- Exposes too much data (privacy violation)
- Hides too much data (regulatory non-compliance)

We need a graduated disclosure model that matches data exposure to business need.

## Decision

We will implement a **three-tier access model** for DPP views:

### Tier Definitions

| Tier | Access | Data Exposed |
|------|--------|--------------|
| PUBLIC | Anonymous | Product metadata, compliance checkmarks |
| LEGIT_INTEREST | Auditors, partners | Verified predicate results (pass/fail) |
| AUTHORITY | Regulators | Full raw values, audit trail |

### Implementation

```typescript
// GET /dpp/:sku/view/public
// No authentication required
{
  "sku": "BAT-001",
  "name": "EV Battery Pack",
  "compliance": {
    "recycledContent": "✅",
    "carbonFootprint": "✅",
    "dueDiligence": "✅"
  }
}

// GET /dpp/:sku/view/legit-interest
// Requires: auditor or authority role
{
  "sku": "BAT-001",
  "name": "EV Battery Pack",
  "verifiedPredicates": [
    {
      "predicate": "RECYCLED_CONTENT_GTE_V1",
      "result": true,
      "threshold": 25,
      "verifiedAt": "2024-01-15T10:30:00Z",
      "receiptId": "rec-001"
    }
  ]
}

// GET /dpp/:sku/view/authority
// Requires: authority role
{
  "sku": "BAT-001",
  "name": "EV Battery Pack",
  "claims": [
    {
      "type": "recycled_content",
      "value": 35,
      "unit": "percent",
      "evidence": ["ev-001", "ev-002"]
    }
  ],
  "auditTrail": [...]
}
```

## Consequences

### Positive

- **Privacy by design**: Data exposure matches legitimate need
- **Regulatory compliance**: Authorities get full access when required
- **Zero-Knowledge compatible**: ZK proofs enable pass/fail without values
- **Audit-friendly**: Clear access boundaries for compliance demonstration
- **Flexible**: New tiers can be added without restructuring

### Negative

- **Implementation complexity**: Three separate view compositions
- **Authorization overhead**: Every request must check roles
- **Testing burden**: Must test all three paths
- **Documentation requirement**: Users must understand tier model

### Neutral

- Tier boundaries may need adjustment as regulations evolve
- Some edge cases (e.g., supplier viewing their own data) need special handling

## Rationale for Tier Boundaries

### PUBLIC Tier

**Includes:**
- Product identification (SKU, name, description)
- Binary compliance status (✅/❌)
- Verification timestamps

**Excludes:**
- Any numeric values
- Evidence references
- Supplier identity

**Rationale:** Consumers need to know "is this product compliant?" without exposing commercially sensitive data.

### LEGIT_INTEREST Tier

**Includes (in addition to PUBLIC):**
- Predicate names and versions
- Threshold values (public inputs)
- Verification receipt IDs
- Evidence document types (not content)

**Excludes:**
- Actual claim values
- Full evidence content
- Supplier operational details

**Rationale:** Business partners (auditors, downstream manufacturers) need to verify compliance claims for their own due diligence, but don't need exact values.

### AUTHORITY Tier

**Includes (in addition to LEGIT_INTEREST):**
- Raw claim values
- Full evidence documents
- Complete audit trail
- Supplier identity and contact

**Rationale:** Regulatory authorities have legal mandate for full access during investigations.

## Access Control Implementation

```typescript
// services/dpp-builder/src/routes/dpp.ts

// PUBLIC - no auth required
app.get('/dpp/:sku/view/public', async (request, reply) => {
  return buildPublicView(request.params.sku);
});

// LEGIT_INTEREST - requires authenticated user with role
app.get('/dpp/:sku/view/legit-interest', {
  preHandler: [authPreHandler, requireRoles('auditor', 'authority')],
}, async (request, reply) => {
  return buildLegitInterestView(request.params.sku);
});

// AUTHORITY - requires highest privilege
app.get('/dpp/:sku/view/authority', {
  preHandler: [authPreHandler, requireRoles('authority')],
}, async (request, reply) => {
  // Log access for audit
  await logAuthorityAccess(request.user, request.params.sku);
  return buildAuthorityView(request.params.sku);
});
```

## References

- EU Battery Regulation Article 77 (Information access requirements)
- GDPR Article 5 (Data minimization principle)
- [Core Concepts - Tiered Access](../developer/concepts.md#tiered-access-model)
