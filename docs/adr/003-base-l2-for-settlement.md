# ADR-003: Base L2 for Settlement Layer

## Status

Accepted

## Context

The ZK-DPP royalty settlement system requires a blockchain layer for:

- Immutable settlement statement records
- Trustless payment distribution
- Dispute resolution with time-locked finalization
- Transparent audit trail

Requirements:
- Low transaction costs (settlements are frequent, low-value)
- EVM compatibility (mature tooling, developer familiarity)
- Sufficient decentralization for regulatory acceptance
- Good bridge infrastructure for USDC/stablecoins

## Decision

We will use **Base** (Coinbase's L2) as the primary settlement blockchain.

### Key Characteristics

| Property | Value |
|----------|-------|
| Type | Optimistic Rollup (OP Stack) |
| Settlement | Ethereum L1 |
| Block Time | ~2 seconds |
| Avg. Transaction Cost | ~$0.001-0.01 |
| Native Token | ETH |
| EVM Compatibility | 100% |

### Contract Deployment

```solidity
// Deploy to Base Sepolia (testnet) then Base Mainnet
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

## Consequences

### Positive

- **Extremely low fees**: Settlements cost ~$0.001-0.01 vs $5-50 on L1
- **Fast finality**: 2-second blocks for good UX
- **Coinbase backing**: Enterprise-grade infrastructure, regulatory clarity
- **EVM tooling**: Full compatibility with Foundry, Hardhat, ethers.js
- **USDC native**: Circle's official USDC deployment on Base
- **Growing ecosystem**: Significant DeFi and enterprise adoption

### Negative

- **Centralized sequencer**: Currently Coinbase-operated (planned decentralization)
- **7-day withdrawal window**: Standard optimistic rollup challenge period
- **Younger chain**: Less battle-tested than Ethereum L1 or Polygon
- **Bridge risk**: Cross-chain bridges introduce additional trust assumptions

### Neutral

- Uses ETH for gas (need to bridge or purchase)
- Sequencer can theoretically censor transactions (mitigated by L1 escape hatch)

## Alternatives Considered

### Ethereum Mainnet

- **Pros**: Maximum security and decentralization
- **Cons**: $5-50 per transaction, 15-second blocks
- **Rejected because**: Transaction costs prohibitive for frequent micro-settlements

### Polygon PoS

- **Pros**: Low fees, fast blocks, large ecosystem
- **Cons**: Different security model (external validator set), recent rebranding to AggLayer
- **Rejected because**: Base has clearer regulatory positioning (Coinbase backing)

### Arbitrum One

- **Pros**: Largest L2 by TVL, proven at scale
- **Cons**: Slightly higher fees than Base, ARB token complexity
- **Rejected because**: Base has better enterprise support and USDC integration

### Optimism

- **Pros**: Original OP Stack, RetroPGF ecosystem
- **Cons**: Higher fees than Base, less enterprise focus
- **Rejected because**: Base uses the same stack with lower fees

### zkSync Era

- **Pros**: ZK rollup (faster finality), native account abstraction
- **Cons**: ZK-specific quirks, less EVM compatibility
- **Rejected because**: Tooling compatibility issues, less mature ecosystem

## Implementation Notes

### Chain Configuration

```typescript
// packages/contracts/src/chains.ts
export const BASE_SEPOLIA = {
  chainId: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  blockExplorer: 'https://sepolia.basescan.org',
};

export const BASE_MAINNET = {
  chainId: 8453,
  name: 'Base',
  rpcUrl: 'https://mainnet.base.org',
  blockExplorer: 'https://basescan.org',
};
```

### USDC Addresses

| Network | USDC Address |
|---------|--------------|
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | Test USDC deployed by us |

## References

- [Base Documentation](https://docs.base.org/)
- [OP Stack](https://stack.optimism.io/)
- [Base Bridge](https://bridge.base.org/)
- [Circle USDC on Base](https://www.circle.com/en/usdc-multichain/base)
