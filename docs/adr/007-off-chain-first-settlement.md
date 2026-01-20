# ADR-007: Off-Chain-First Settlement Model

## Status

Accepted

## Context

The ZK-DPP royalty system needs to track verification usage and compensate suppliers. Two primary approaches exist:

1. **On-chain-first**: Every verification triggers a blockchain transaction
2. **Off-chain-first**: Aggregate off-chain, settle on-chain periodically

Considerations:
- Verification frequency: Thousands per day per supplier
- Transaction costs: Even at $0.001/tx, high frequency adds up
- Latency requirements: Verification must complete in <1 second
- Audit requirements: Full traceability of all verifications
- Dispute resolution: Ability to contest incorrect settlements

## Decision

We will implement an **off-chain-first settlement model** where:

1. Verification events are recorded in PostgreSQL (immediate)
2. Usage is aggregated monthly by supplier/brand/predicate
3. Settlement statements are generated off-chain
4. Statements are submitted to blockchain for finalization
5. Payments are released after dispute window

### Settlement Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Off-Chain-First Settlement                  │
└─────────────────────────────────────────────────────────────────┘

Day 1-30: Verification Events
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Verify #1  │    │  Verify #2  │    │ Verify #N   │
│  $0.05      │───▶│  $0.05      │───▶│  ...        │
└─────────────┘    └─────────────┘    └─────────────┘
       │                 │                   │
       ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (metering.usage_records)          │
└─────────────────────────────────────────────────────────────────┘

Day 31: Settlement Generation
┌─────────────────────────────────────────────────────────────────┐
│  Statement ID: stmt-2024-01-supplier1                           │
│  Supplier: supplier-1                                           │
│  Period: 2024-01-01 to 2024-01-31                              │
│  Total Verifications: 12,345                                    │
│  Total Amount: €617.25                                          │
│  Hash: 0x...                                                    │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Blockchain (Base L2)                         │
│  submitStatement(statementId, supplier, amount, hash)           │
└─────────────────────────────────────────────────────────────────┘
       │
       │ 24-hour dispute window
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  finalizeStatement(statementId)                                 │
│  → Supplier can claimPayment()                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- **Cost efficient**: One blockchain transaction per settlement period vs. per verification
- **Low latency**: Verification doesn't wait for blockchain confirmation
- **Audit trail**: Full off-chain records for detailed analysis
- **Dispute mechanism**: 24-hour window catches errors before payment
- **Flexible aggregation**: Can adjust billing periods without contract changes
- **Graceful degradation**: System works even if blockchain is unavailable

### Negative

- **Trust assumption**: Suppliers trust the protocol to accurately aggregate
- **Delayed payment**: Monthly instead of real-time
- **Dispute complexity**: Need off-chain evidence to support disputes
- **Reconciliation burden**: Must match off-chain and on-chain records

### Neutral

- Blockchain serves as commitment layer, not execution layer
- Statement hash provides cryptographic binding to off-chain data

## Dispute Mechanism

### Dispute Grounds

1. **Undercounting**: Supplier believes verifications were missed
2. **Rate dispute**: Incorrect pricing applied
3. **Attribution error**: Verifications assigned to wrong supplier

### Dispute Process

```typescript
// Supplier reviews statement before finalization
const statement = await getStatement(statementId);
const myRecords = await getMyUsageRecords(statement.periodStart, statement.periodEnd);

// If discrepancy found
if (myRecords.total !== statement.totalVerifications) {
  await submitDispute(statementId, {
    reason: 'UNDERCOUNTING',
    claimedTotal: myRecords.total,
    evidence: myRecords.records,
  });
}
```

### Resolution

- Protocol reviews dispute evidence
- If valid: Statement is corrected and resubmitted
- If invalid: Dispute rejected, finalization proceeds

## Database Schema

```sql
-- metering.usage_records (high-volume, append-only)
CREATE TABLE metering.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id VARCHAR(100) NOT NULL,
  supplier_id VARCHAR(100) NOT NULL,
  brand_id VARCHAR(100) NOT NULL,
  predicate_id VARCHAR(100) NOT NULL,
  price_per_verification DECIMAL(10, 4) NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- metering.settlement_statements (monthly aggregates)
CREATE TABLE metering.settlement_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id VARCHAR(100) UNIQUE NOT NULL,
  supplier_id VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_verifications INTEGER NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  statement_hash VARCHAR(66) NOT NULL,
  status VARCHAR(20) DEFAULT 'DRAFT',
  blockchain_status VARCHAR(20),
  tx_hash VARCHAR(66),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Alternatives Considered

### On-Chain-First (Every Verification)

- **Pros**: Immediate settlement, no trust assumptions
- **Cons**: ~$0.001 × 10,000 verifications = $10/day gas costs, latency issues
- **Rejected because**: Cost prohibitive at scale, adds latency to verification

### Payment Channels (State Channels)

- **Pros**: Near-instant, low-cost updates
- **Cons**: Complex setup, channel management, capital lockup
- **Rejected because**: Complexity not justified, standard L2 is sufficient

### Pure Off-Chain (No Blockchain)

- **Pros**: Simplest implementation, zero blockchain costs
- **Cons**: No trustless finality, disputes are he-said/she-said
- **Rejected because**: Need cryptographic commitment for enterprise trust

### Rolling Micro-Settlements (Daily)

- **Pros**: Faster payment to suppliers
- **Cons**: 30× more blockchain transactions
- **Rejected because**: Monthly provides good balance of cost vs. payment speed

## References

- [RoyaltySettlement Contract](../../contracts/src/RoyaltySettlement.sol)
- [Metering Service](../../services/metering-billing/)
- [ADR-003: Base L2 for Settlement](./003-base-l2-for-settlement.md)
