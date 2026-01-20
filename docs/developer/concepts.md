# Core Concepts

This guide explains the fundamental concepts behind the ZK-DPP Royalty Protocol.

## Digital Product Passport (DPP)

A **Digital Product Passport** is a structured digital record containing verified information about a product's lifecycle, composition, and compliance status.

### EU Battery Passport Context

The EU Battery Regulation (2023/1542) requires batteries sold in the EU to have a digital passport containing:

- Material composition
- Carbon footprint
- Recycled content percentages
- Supply chain due diligence
- State of health metrics

### ZK-DPP Approach

Traditional DPPs expose all data to anyone who views them. ZK-DPP enables **privacy-preserving verification**:

```
Traditional DPP:
┌────────────────────────────────────┐
│ Battery ID: BAT-001                │
│ Recycled Content: 35%  ◀── Visible │
│ Carbon Footprint: 45 kg CO2e       │
│ Chemistry: NMC                     │
└────────────────────────────────────┘

ZK-DPP:
┌────────────────────────────────────┐
│ Battery ID: BAT-001                │
│ Recycled Content: ✅ ≥25%          │
│   (Verified, value hidden)         │
│ Carbon Footprint: ✅ ≤60 kg        │
│ Chemistry: ✅ In approved set      │
└────────────────────────────────────┘
```

## Claims

A **Claim** is a structured assertion about a product attribute made by a supplier.

### Claim Structure

```json
{
  "claimId": "claim-001",
  "claimType": "recycled_content",
  "productRef": "BAT-001",
  "value": 35,
  "unit": "percent",
  "evidenceRefs": ["ev-001", "ev-002"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Claim Types

| Type | Description | Unit |
|------|-------------|------|
| `recycled_content` | Percentage of recycled materials | % |
| `carbon_footprint` | Lifecycle CO2 equivalent | kg CO2e |
| `battery_capacity` | Total energy capacity | Wh |
| `state_of_health` | Battery degradation status | % |
| `energy_density` | Energy per unit mass | Wh/kg |
| `due_diligence_cert` | Supply chain certification | ISO timestamp |

## Evidence

**Evidence** links claims to source documents, providing an audit trail.

```json
{
  "evidenceId": "ev-001",
  "documentHash": "sha256:abc123...",
  "documentType": "certificate",
  "issuer": "Bureau Veritas",
  "extractionMethod": "ai",
  "confidence": 0.95,
  "pageRef": "page 3, paragraph 2"
}
```

### Evidence Types

- **Certificates** - Third-party certifications (ISO, RMI, etc.)
- **Test Reports** - Laboratory analysis results
- **Declarations** - Supplier self-declarations
- **Invoices** - Supply chain documentation

## Commitments

A **Commitment** is a cryptographic proof that a supplier has made specific claims, without revealing their values.

### How It Works

1. **Canonicalize**: Claims are serialized in a deterministic order
2. **Hash**: Each claim is hashed (SHA-256)
3. **Merkle Tree**: Claim hashes form leaves of a Merkle tree
4. **Sign**: Supplier signs the Merkle root

```
           ┌───────────────┐
           │  Merkle Root  │ ◀── Signed by supplier
           └───────┬───────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼────┐           ┌────▼────┐
   │  Hash   │           │  Hash   │
   └────┬────┘           └────┬────┘
        │                     │
   ┌────┴────┐           ┌────┴────┐
   │         │           │         │
┌──▼──┐  ┌──▼──┐     ┌──▼──┐  ┌──▼──┐
│Claim│  │Claim│     │Claim│  │Claim│
│  1  │  │  2  │     │  3  │  │  4  │
└─────┘  └─────┘     └─────┘  └─────┘
```

### Commitment Properties

- **Binding**: Supplier cannot change claims after commitment
- **Hiding**: Values are not revealed by the commitment
- **Selective Disclosure**: Individual claims can be proven without revealing others

## Predicates

A **Predicate** is a verifiable condition about a claim value.

### Predicate Types

| Type | Example | ZK Proof Shows |
|------|---------|----------------|
| `GTE` (≥) | Recycled content ≥ 25% | Pass/fail only |
| `LTE` (≤) | Carbon footprint ≤ 60 | Pass/fail only |
| `RANGE` | Energy density 200-400 Wh/kg | Pass/fail only |
| `IN_SET` | Chemistry ∈ {LFP, NMC, NCA} | Pass/fail only |
| `NOT_IN` | Origin ∉ {conflict regions} | Pass/fail only |
| `VALID` | Certificate not expired | Pass/fail only |

### Predicate Registry

Predicates are versioned and registered:

```json
{
  "RECYCLED_CONTENT_GTE_V1": {
    "name": "RECYCLED_CONTENT_GTE",
    "version": "V1",
    "description": "Proves recycled content >= threshold",
    "circuitPath": "recycled_content_gte_v1",
    "accessGroups": ["LEGIT_INTEREST", "AUTHORITY"],
    "pricing": {
      "perVerification": 0.05,
      "currency": "EUR"
    }
  }
}
```

## Zero-Knowledge Proofs

A **ZK Proof** proves a statement is true without revealing the underlying data.

### What the Proof Proves

```
Statement: "Recycled content >= 25%"

Prover knows (private):
- actual_value = 35

Verifier learns:
- Statement is TRUE
- Proof is mathematically sound
- Nothing about actual_value
```

### Proof Package

When a proof is generated, it's bundled into a ProofPackage:

```json
{
  "predicateId": {
    "name": "RECYCLED_CONTENT_GTE",
    "version": "V1"
  },
  "proof": "base64-encoded-proof...",
  "publicInputs": {
    "threshold": 25,
    "commitmentRoot": "0x...",
    "productBinding": "0x...",
    "requesterBinding": "0x..."
  },
  "signature": "supplier-signature...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Bindings

- **Product Binding**: Links proof to specific product
- **Requester Binding**: Links proof to specific verifier
- **Timestamp**: Prevents replay attacks

## Verification Receipt

When a proof is verified, the gateway issues a **Verification Receipt**:

```json
{
  "receiptId": "rec-001",
  "predicateId": {
    "name": "RECYCLED_CONTENT_GTE",
    "version": "V1"
  },
  "result": true,
  "productRef": "BAT-001",
  "verifiedAt": "2024-01-15T10:31:00Z",
  "gatewaySignature": "0x...",
  "expiresAt": "2024-01-16T10:31:00Z"
}
```

## Tiered Access Model

DPP views are tiered based on business need:

### PUBLIC View

Available to anyone, no authentication required.

**Contains:**
- Product name and description
- SKU and basic metadata
- Compliance status indicators (checkmarks)

### LEGIT_INTEREST View

For parties with legitimate interest (auditors, business partners).

**Contains:**
- Everything in PUBLIC
- Verified predicate results (pass/fail)
- Verification timestamps
- Evidence references (not content)

### AUTHORITY View

For regulatory authorities and auditors with full access.

**Contains:**
- Everything in LEGIT_INTEREST
- Raw claim values
- Full evidence content
- Complete audit trail
- Supplier identity

## Royalty Model

Suppliers are compensated for data used in verifications.

### Usage Metering

Each verification is recorded:

```
┌─────────────┬──────────────┬──────────────┬─────────┐
│ Supplier ID │ Brand ID     │ Predicate    │ Count   │
├─────────────┼──────────────┼──────────────┼─────────┤
│ supplier-1  │ brand-A      │ RECYCLED_GTE │ 1,234   │
│ supplier-1  │ brand-B      │ CARBON_LTE   │ 567     │
│ supplier-2  │ brand-A      │ CERT_VALID   │ 890     │
└─────────────┴──────────────┴──────────────┴─────────┘
```

### Settlement Flow

1. **Aggregate**: Monthly usage aggregation
2. **Statement**: Generate settlement statement
3. **On-Chain**: Submit to blockchain (optional)
4. **Dispute Window**: 24-hour dispute period
5. **Finalize**: Release payment to supplier

## Related Documentation

- [Architecture Overview](./architecture.md) - System design
- [Predicate Library](../../packages/predicate-lib/predicates.json) - Available predicates
- [API Reference](../api/openapi.yaml) - Full API spec
