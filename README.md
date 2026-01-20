# ZK-DPP Royalty Protocol

[![CI](https://github.com/hadijannat/zk-dpp-royalty-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/hadijannat/zk-dpp-royalty-protocol/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hadijannat/zk-dpp-royalty-protocol)](https://github.com/hadijannat/zk-dpp-royalty-protocol/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue)](LICENSE)

A compliance-grade, privacy-preserving toolchain for Digital Product Passports (DPP) that enables selective disclosure via ZK predicates and usage-based data royalties.

## What’s in this repo

- **Edge Agent** (Tauri) for local extraction, claim review, commitments, and proof generation
- **Verification Gateway** for proof verification and receipt issuance
- **DPP Builder** for access-group views and publishing
- **Metering & Billing** for usage-based settlement
- **Predicate Circuits** (Noir) for standardized compliance proofs

## Quickstart

### Prerequisites

- Node.js >= 20
- pnpm >= 8
- Rust (stable)
- Noir toolchain (`nargo`)

### Install

```bash
pnpm install
```

### Rust build

```bash
pnpm rust:build
```

### Noir circuits test

```bash
# ensure nargo is on PATH
pnpm circuits:test
```

If `nargo` is not installed:

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
```

## Repo structure (high level)

- `apps/` – Edge agent and frontends
- `services/` – Backend services
- `crates/` – Rust libraries (commitments, crypto, policy)
- `circuits/` – Noir predicate circuits
- `packages/` – Shared schemas and SDKs

## License

Dual-licensed under **Apache-2.0 OR MIT**.

See `LICENSE`, `LICENSE-APACHE`, and `LICENSE-MIT`.
