# Architecture Overview

The ZK-DPP Royalty Protocol is a privacy-preserving compliance verification system for Digital Product Passports (DPP), using Zero-Knowledge Proofs to verify claims without revealing underlying data.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ZK-DPP Architecture                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Supplier  │────▶│  Edge Agent  │────▶│  Commitment +   │
│  Documents  │     │  (Desktop)   │     │  Merkle Root    │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │                      │
                    ┌──────▼──────┐              │
                    │ ZK Proof    │◀─────────────┘
                    │ Generation  │
                    └──────┬──────┘
                           │
        ┌──────────────────▼──────────────────┐
        │           NATS JetStream            │
        │         (Event Bus)                 │
        └─────────┬───────────────┬───────────┘
                  │               │
    ┌─────────────▼───────┐   ┌───▼───────────────┐
    │   Verify Gateway    │   │   DPP Builder     │
    │   (Port 3001)       │   │   (Port 3002)     │
    │   - Proof verify    │   │   - Product CRUD  │
    │   - Receipt sign    │   │   - Tiered views  │
    └─────────┬───────────┘   └─────────┬─────────┘
              │                         │
              │    ┌────────────────┐   │
              └───▶│  Metering &    │◀──┘
                   │  Billing       │
                   │  (Port 3003)   │
                   │  - Usage track │
                   │  - Settlements │
                   └───────┬────────┘
                           │
                   ┌───────▼────────┐
                   │  Base L2       │
                   │  (Blockchain)  │
                   │  - Settlement  │
                   └────────────────┘
```

## Components

### Edge Agent (Desktop Application)

A Tauri-based desktop app running on supplier machines.

**Responsibilities:**
- Document ingestion and OCR
- AI-powered claim extraction (Ollama)
- Claim review and correction
- Commitment creation (Merkle tree)
- ZK proof generation (Noir prover)
- Response to verification requests

**Key Technologies:**
- Tauri (Rust + Web UI)
- SQLCipher (encrypted local storage)
- Ollama (local AI inference)
- Noir (ZK circuit execution)

### Verify Gateway (Port 3001)

HTTP service for ZK proof verification.

**Responsibilities:**
- Receive and validate ProofPackages
- Verify ZK proofs using Noir verifier (WASM)
- Issue signed verification receipts
- Publish verification events to NATS
- Expose predicate discovery API

**Key Endpoints:**
- `POST /verify` - Verify a proof
- `GET /predicates` - List available predicates
- `GET /predicates/:id` - Get predicate details

### DPP Builder (Port 3002)

HTTP service for Digital Product Passport composition.

**Responsibilities:**
- Product CRUD operations
- Supplier-product linking
- Tiered view composition (PUBLIC/LEGIT_INTEREST/AUTHORITY)
- Verified predicate aggregation

**Key Endpoints:**
- `POST /products` - Create product
- `POST /products/:id/link-supplier` - Link supplier commitment
- `GET /dpp/:sku/view/public` - Public DPP view
- `GET /dpp/:sku/view/legit-interest` - Enhanced view (requires auth)
- `GET /dpp/:sku/view/authority` - Full audit view (requires auth)

### Metering & Billing (Port 3003)

HTTP service for usage tracking and royalty settlements.

**Responsibilities:**
- Track verification events
- Aggregate usage by supplier/brand/period
- Generate settlement statements
- Submit settlements to blockchain
- Manage supplier wallets

**Key Endpoints:**
- `GET /usage` - Query usage records
- `POST /settlements` - Create settlement
- `POST /settlements/:id/submit-on-chain` - Submit to blockchain

## Data Flow

### 1. Claim Commitment Flow

```
Supplier → Edge Agent → Claims → Merkle Tree → Signed Commitment
                                                      │
                                                      ▼
                                              Store locally +
                                              Ready for proofs
```

### 2. Verification Flow

```
Verifier Request                  Edge Agent           Verify Gateway
       │                              │                      │
       ├──Predicate Request──────────▶│                      │
       │                              │                      │
       │                              ├──Generate Proof──────▶
       │                              │                      │
       │◀─────────ProofPackage────────┤                      │
       │                              │                      │
       ├────────────────────────────ProofPackage────────────▶│
       │                              │                      │
       │                              │         Verify + Sign │
       │                              │                      │
       │◀────────────────────────────Receipt──────────────────┤
       │                              │                      │
       │                              │      NATS: proofs.verified
       │                              │                      ▼
       │                              │            Metering Service
```

### 3. Settlement Flow

```
Metering Service                  Blockchain
       │                              │
       ├──Aggregate Usage──▶         │
       │                              │
       ├──Create Statement──▶        │
       │                              │
       ├──Submit On-Chain────────────▶│
       │                              │
       │               Wait Dispute   │
       │                   Window     │
       │                              │
       ├──Finalize───────────────────▶│
       │                              │
       │              Supplier Claims │
       │◀─────────────Payment─────────┤
```

## Security Model

### Authentication Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Service-to-Service | mTLS (optional) | Internal cluster |
| API Authentication | Keycloak JWT | External requests |
| Edge Agent | Local Ed25519 keys | Proof signing |
| Blockchain | Ethereum wallets | Settlement claims |

### Access Control (RBAC)

| Role | PUBLIC | LEGIT_INTEREST | AUTHORITY |
|------|--------|----------------|-----------|
| Anonymous | ✅ | ❌ | ❌ |
| Auditor | ✅ | ✅ | ❌ |
| Authority | ✅ | ✅ | ✅ |
| Supplier | ✅ | Own data | Own data |

### Privacy Guarantees

- **ZK Proofs**: Verifiers learn only pass/fail, never underlying values
- **Merkle Commitments**: Claims are committed without revealing content
- **Tiered Views**: Data exposure matches business need
- **Local Processing**: AI extraction happens on supplier's machine

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Backend Services | TypeScript + Fastify | Type safety, async performance |
| Crypto Core | Rust | Memory safety, ZK proof efficiency |
| ZK Circuits | Noir | Readable DSL, Barretenberg prover |
| Event Bus | NATS JetStream | At-least-once delivery, persistence |
| Database | PostgreSQL | ACID, JSON support, proven reliability |
| Identity | Keycloak | OIDC standard, fine-grained roles |
| Blockchain | Base L2 (Ethereum) | Low fees, EVM compatibility |
| Desktop App | Tauri | Rust backend, web frontend |

## Deployment Topologies

### Development

Single-machine Docker Compose with all services.

### Production (Kubernetes)

```
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                 │
├─────────────────────────────────────────────────────┤
│  Ingress Controller (nginx/traefik)                │
│       │                                             │
│  ┌────▼────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ Verify  │  │ DPP        │  │ Metering        │  │
│  │ Gateway │  │ Builder    │  │ Billing         │  │
│  │ (HPA)   │  │ (HPA)      │  │ (HPA)           │  │
│  └────┬────┘  └─────┬──────┘  └───────┬─────────┘  │
│       │             │                 │             │
│  ┌────▼─────────────▼─────────────────▼───────┐    │
│  │              NATS Cluster                   │    │
│  │            (JetStream enabled)              │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                               │
│  ┌──────────────────▼──────────────────────────┐    │
│  │         PostgreSQL (HA / PgBouncer)         │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Related Documentation

- [Core Concepts](./concepts.md) - DPP, predicates, commitments explained
- [Local Setup](./local-setup.md) - Full development environment
- [Configuration Reference](../deployment/configuration.md) - Environment variables
- [Security Best Practices](../deployment/security.md) - Hardening guide
