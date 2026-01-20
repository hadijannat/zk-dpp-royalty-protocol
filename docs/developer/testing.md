# Testing Guide

Comprehensive guide for testing the ZK-DPP Royalty Protocol.

## Test Strategy

The project uses a multi-layer testing approach:

```
┌─────────────────────────────────────────────────┐
│               E2E Tests (Playwright)            │
│        Full user flows, Edge Agent UI           │
├─────────────────────────────────────────────────┤
│           Integration Tests (Vitest)            │
│      Service interactions, NATS events          │
├─────────────────────────────────────────────────┤
│              Unit Tests (Vitest/Cargo)          │
│     Functions, components, business logic       │
├─────────────────────────────────────────────────┤
│            Circuit Tests (Noir)                 │
│         ZK proof correctness, edge cases        │
├─────────────────────────────────────────────────┤
│           Contract Tests (Foundry)              │
│        Smart contract logic, gas costs          │
└─────────────────────────────────────────────────┘
```

## Running Tests

### All Tests

```bash
# Run all tests across the monorepo
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### By Package/Service

```bash
# Verify Gateway tests
pnpm --filter @zkdpp/verify-gateway test

# DPP Builder tests
pnpm --filter @zkdpp/dpp-builder test

# Metering & Billing tests
pnpm --filter @zkdpp/metering-billing test

# Schemas package tests
pnpm --filter @zkdpp/schemas test

# Predicate library tests
pnpm --filter @zkdpp/predicate-lib test
```

### Rust Crate Tests

```bash
# All Rust tests
cargo test

# Specific crate
cargo test -p commitments
cargo test -p crypto
cargo test -p zkp-core

# With output
cargo test -- --nocapture
```

### Circuit Tests

```bash
# All circuit tests
pnpm circuits:test

# Specific predicate
cd circuits/noir/predicates/recycled_content_gte_v1
nargo test

# With verbose output
nargo test --show-output
```

### Contract Tests

```bash
cd contracts

# All contract tests
forge test

# Verbose output
forge test -vvv

# Specific test
forge test --match-test test_submitStatement_success

# Gas report
forge test --gas-report
```

## Unit Tests

### TypeScript (Vitest)

Location: `services/*/src/**/*.test.ts` or `packages/*/src/**/*.test.ts`

Example unit test:

```typescript
// services/verify-gateway/src/services/verifier.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verifyProof } from './verifier';

describe('verifyProof', () => {
  it('should return true for valid proof', async () => {
    const mockProof = {
      predicateId: { name: 'RECYCLED_CONTENT_GTE', version: 'V1' },
      proof: 'valid-proof-bytes',
      publicInputs: {
        threshold: 25,
        commitmentRoot: '0x...',
      },
    };

    const result = await verifyProof(mockProof);
    expect(result.valid).toBe(true);
  });

  it('should return false for tampered proof', async () => {
    const tamperedProof = {
      // ... tampered data
    };

    const result = await verifyProof(tamperedProof);
    expect(result.valid).toBe(false);
  });
});
```

### Rust (Cargo)

Location: `crates/*/src/*.rs` (inline) or `crates/*/tests/*.rs`

Example unit test:

```rust
// crates/commitments/src/lib.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_claim() {
        let claim = r#"{"type":"recycled_content","value":35}"#;
        let hash = hash_claim(claim);

        assert_eq!(hash.len(), 32);
        // Hash should be deterministic
        assert_eq!(hash_claim(claim), hash);
    }

    #[test]
    fn test_merkle_proof_verification() {
        let leaves = vec![
            [0u8; 32],
            [1u8; 32],
            [2u8; 32],
            [3u8; 32],
        ];

        let tree = build_merkle_tree(&leaves);
        let proof = get_merkle_proof(&tree, 0);

        assert!(verify_merkle_proof(&leaves[0], &proof, &tree.root));
    }
}
```

## Integration Tests

### Service Integration

Location: `services/*/src/**/*.integration.test.ts`

```typescript
// services/verify-gateway/src/routes/verify.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index';
import { setupTestDb, teardownTestDb } from '../test/helpers';

describe('POST /verify', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await setupTestDb();
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDb();
  });

  it('should verify valid proof and issue receipt', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        predicateId: { name: 'RECYCLED_CONTENT_GTE', version: 'V1' },
        proof: 'base64-encoded-valid-proof',
        publicInputs: {
          threshold: 25,
          commitmentRoot: '0x...',
          productBinding: '0x...',
          requesterBinding: '0x...',
        },
        timestamp: new Date().toISOString(),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.result).toBe(true);
    expect(body.receiptId).toBeDefined();
    expect(body.gatewaySignature).toBeDefined();
  });

  it('should reject invalid proof', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: {
        predicateId: { name: 'RECYCLED_CONTENT_GTE', version: 'V1' },
        proof: 'invalid-proof',
        // ...
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

### NATS Event Tests

```typescript
// services/metering-billing/src/consumers/verification.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect } from 'nats';
import { setupConsumer, handleVerificationEvent } from './verification';

describe('Verification Event Consumer', () => {
  let nc: NatsConnection;

  beforeAll(async () => {
    nc = await connect({ servers: 'nats://localhost:4222' });
  });

  afterAll(async () => {
    await nc.close();
  });

  it('should record usage when verification event received', async () => {
    // Publish test event
    nc.publish('proofs.verified', JSON.stringify({
      receiptId: 'test-receipt-001',
      supplierId: 'supplier-1',
      brandId: 'brand-A',
      predicateId: { name: 'RECYCLED_CONTENT_GTE', version: 'V1' },
      verifiedAt: new Date().toISOString(),
    }));

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify usage was recorded
    const usage = await db.query(
      'SELECT * FROM metering.usage_records WHERE receipt_id = $1',
      ['test-receipt-001']
    );

    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0].supplier_id).toBe('supplier-1');
  });
});
```

## Circuit Tests

Location: `circuits/noir/predicates/*/src/main.nr`

```noir
// circuits/noir/predicates/recycled_content_gte_v1/src/main.nr

#[test]
fn test_valid_proof() {
    // Threshold: 25%
    // Actual: 35%
    // Should pass

    let threshold = 25;
    let actual_value = 35;
    let commitment_root = [/* valid root */];
    let claim_hash = [/* valid hash */];
    let merkle_path = [/* valid path */];
    let merkle_indices = [/* valid indices */];

    main(
        threshold,
        commitment_root,
        [0; 32], // product_binding
        [0; 32], // requester_binding
        actual_value,
        [0; 32], // claim_type_hash
        [0; 32], // unit_hash
        claim_hash,
        merkle_path,
        merkle_indices,
        8
    );
    // No assertion failure = test passes
}

#[test(should_fail)]
fn test_invalid_below_threshold() {
    // Threshold: 25%
    // Actual: 15%
    // Should fail

    let threshold = 25;
    let actual_value = 15; // Below threshold

    main(
        threshold,
        [0; 32],
        [0; 32],
        [0; 32],
        actual_value,
        [0; 32],
        [0; 32],
        [0; 32],
        [[0; 32]; 8],
        [0; 8],
        8
    );
}
```

## Contract Tests

Location: `contracts/test/*.t.sol`

```solidity
// contracts/test/RoyaltySettlement.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RoyaltySettlement.sol";

contract RoyaltySettlementTest is Test {
    RoyaltySettlement settlement;
    address owner;
    address supplier;

    function setUp() public {
        owner = address(this);
        supplier = makeAddr("supplier");
        settlement = new RoyaltySettlement();
    }

    function test_submitStatement_success() public {
        bytes32 statementId = keccak256("statement-001");
        bytes32 statementHash = keccak256("data");
        uint256 amount = 1000e6; // 1000 USDC

        settlement.submitStatement(statementId, supplier, amount, statementHash);

        (
            bytes32 hash,
            address addr,
            uint256 total,
            ,
            ,
            RoyaltySettlement.StatementStatus status
        ) = settlement.statements(statementId);

        assertEq(hash, statementHash);
        assertEq(addr, supplier);
        assertEq(total, amount);
        assertEq(uint256(status), uint256(RoyaltySettlement.StatementStatus.Submitted));
    }

    function test_submitStatement_revert_duplicate() public {
        bytes32 statementId = keccak256("statement-001");

        settlement.submitStatement(statementId, supplier, 1000e6, keccak256("data"));

        vm.expectRevert("Statement already exists");
        settlement.submitStatement(statementId, supplier, 1000e6, keccak256("data"));
    }

    function test_finalizeStatement_success() public {
        bytes32 statementId = keccak256("statement-001");
        settlement.submitStatement(statementId, supplier, 1000e6, keccak256("data"));

        // Fast forward past dispute window
        vm.warp(block.timestamp + 25 hours);

        settlement.finalizeStatement(statementId);

        (, , , , , RoyaltySettlement.StatementStatus status) = settlement.statements(statementId);
        assertEq(uint256(status), uint256(RoyaltySettlement.StatementStatus.Finalized));
    }
}
```

## Test Fixtures

### Database Fixtures

Location: `services/*/src/test/fixtures/`

```typescript
// services/dpp-builder/src/test/fixtures/products.ts
export const testProducts = [
  {
    sku: 'TEST-BAT-001',
    name: 'Test Battery Pack',
    description: 'A test battery for unit tests',
    metadata: { capacity: '100kWh' },
  },
  {
    sku: 'TEST-BAT-002',
    name: 'Another Test Battery',
    description: 'Another test battery',
    metadata: { capacity: '75kWh' },
  },
];

export async function seedProducts(db: Pool) {
  for (const product of testProducts) {
    await db.query(
      'INSERT INTO dpp.products (sku, name, description, metadata) VALUES ($1, $2, $3, $4)',
      [product.sku, product.name, product.description, product.metadata]
    );
  }
}
```

### Circuit Test Vectors

Location: `circuits/noir/predicates/*/test_vectors/`

```json
// circuits/noir/predicates/recycled_content_gte_v1/test_vectors/valid.json
{
  "description": "Valid proof: actual 35% >= threshold 25%",
  "inputs": {
    "threshold": 25,
    "actual_value": 35,
    "commitment_root": "0x...",
    "claim_hash": "0x...",
    "merkle_path": ["0x...", "0x..."],
    "merkle_indices": [0, 1, 0, 1, 0, 0, 0, 0]
  },
  "expected": "pass"
}
```

## Coverage

### TypeScript Coverage

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

### Rust Coverage

```bash
# Install llvm-cov
cargo install cargo-llvm-cov

# Generate coverage
cargo llvm-cov --html

# View report
open target/llvm-cov/html/index.html
```

### Circuit Coverage

Circuit tests don't have traditional coverage, but ensure you test:

- Valid inputs (happy path)
- Invalid inputs (should fail)
- Edge cases (boundary values)
- Merkle proof variations

## Continuous Integration

Tests run automatically on:

- Every push to `main`
- Every pull request
- Nightly builds (full integration suite)

See `.github/workflows/test.yml` for CI configuration.

## Best Practices

### Writing Good Tests

1. **Arrange-Act-Assert**: Structure tests clearly
2. **One assertion per test**: Test one thing at a time
3. **Descriptive names**: `test_verifyProof_returnsTrue_whenProofValid`
4. **Independent tests**: No test should depend on another
5. **Fast tests**: Unit tests should run in milliseconds

### Test Organization

```
src/
├── services/
│   ├── verifier.ts
│   ├── verifier.test.ts        # Unit tests (same directory)
│   └── verifier.integration.test.ts
├── routes/
│   ├── verify.ts
│   └── verify.test.ts
└── test/
    ├── fixtures/               # Shared test data
    ├── helpers/                # Test utilities
    └── setup.ts                # Global test setup
```

### Mocking

```typescript
import { vi } from 'vitest';

// Mock external service
vi.mock('../services/nats', () => ({
  publish: vi.fn(),
  subscribe: vi.fn(),
}));

// Mock database
vi.mock('../db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));
```

## Related Documentation

- [Local Setup](./local-setup.md) - Development environment
- [Architecture](./architecture.md) - System design
- [CI/CD Pipeline](.github/workflows/test.yml) - Automated testing
