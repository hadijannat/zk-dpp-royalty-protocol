# ADR-001: Noir for Zero-Knowledge Proofs

## Status

Accepted

## Context

The ZK-DPP system requires Zero-Knowledge Proof (ZKP) capabilities to enable privacy-preserving compliance verification. Suppliers need to prove predicates about their data (e.g., "recycled content ≥ 25%") without revealing the actual values.

Key requirements:
- **Readable circuit development**: Non-cryptographers should be able to write and audit circuits
- **Efficient proving**: Proofs should generate in seconds, not minutes
- **Small proof size**: Proofs must be transmittable over HTTP
- **Permissive licensing**: MIT/Apache license for commercial use
- **Active development**: Ongoing maintenance and community support

## Decision

We will use **Noir** by Aztec as our ZKP domain-specific language and proving system.

### Key Features

- **Rust-like syntax**: Familiar to most developers
- **Barretenberg backend**: Efficient PLONK-based proving system
- **WASM compilation**: Verifier runs in browser and Node.js
- **Built-in stdlib**: SHA-256, Merkle trees, field operations
- **Permissive license**: MIT/Apache 2.0

### Circuit Structure

```noir
fn main(
    // Public inputs (visible to verifier)
    threshold: pub u32,
    commitment_root: pub [u8; 32],

    // Private inputs (known only to prover)
    actual_value: u32,
    merkle_path: [[u8; 32]; 8],
    merkle_indices: [u1; 8]
) {
    // Verify Merkle membership
    assert(verify_merkle(...));

    // Verify predicate
    assert(actual_value >= threshold);
}
```

## Consequences

### Positive

- **Developer productivity**: Noir's Rust-like syntax is approachable
- **Fast proving**: ~2-5 seconds for typical predicates on modern hardware
- **Small proofs**: ~1-2 KB per proof
- **Active ecosystem**: Regular updates, growing library of examples
- **No trusted setup**: Noir uses a universal reference string (URS)

### Negative

- **Younger ecosystem**: Fewer production deployments than Circom/snarkjs
- **Limited debugging**: Error messages can be cryptic
- **Memory constraints**: Complex circuits require careful optimization
- **Verifier size**: WASM verifier is ~2MB (can be lazy-loaded)

### Neutral

- Noir is still evolving; breaking changes are possible in minor versions
- Team needs to learn Noir-specific patterns and best practices

## Alternatives Considered

### Circom + snarkjs

- **Pros**: Most mature ZK toolchain, large community
- **Cons**: Verbose syntax, JavaScript prover is slow, Groth16 requires per-circuit trusted setup
- **Rejected because**: Developer experience is poor, trusted setup adds operational burden

### RISC Zero

- **Pros**: Write circuits in standard Rust, no ZK-specific syntax
- **Cons**: Slower proving times, larger proofs, higher memory usage
- **Rejected because**: Performance characteristics don't match our latency requirements

### Halo2

- **Pros**: Proven at scale (Zcash), no trusted setup
- **Cons**: Very steep learning curve, verbose circuit definitions
- **Rejected because**: Development velocity would be significantly impacted

### o1js (Mina)

- **Pros**: TypeScript-native, good DX
- **Cons**: Tied to Mina blockchain, limited standalone use
- **Rejected because**: We need blockchain-agnostic verification

## References

- [Noir Documentation](https://noir-lang.org/docs)
- [Barretenberg Proving System](https://github.com/AztecProtocol/barretenberg)
- [ZK-DPP Predicate Library](../../packages/predicate-lib/)
