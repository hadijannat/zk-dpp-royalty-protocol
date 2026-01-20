# ADR-002: Fastify as HTTP Framework

## Status

Accepted

## Context

The ZK-DPP backend services need an HTTP framework that supports:

- High-performance async request handling
- TypeScript-first development
- Schema validation and serialization
- Plugin architecture for middleware
- OpenAPI/Swagger documentation generation
- Health checks and metrics exposure

The services must handle proof verification requests with sub-second latency while maintaining type safety throughout the codebase.

## Decision

We will use **Fastify** as the HTTP framework for all TypeScript backend services.

### Configuration

```typescript
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
    },
  },
});

// Schema-based validation
app.post('/verify', {
  schema: {
    body: ProofPackageSchema,
    response: {
      200: VerificationReceiptSchema,
    },
  },
}, async (request, reply) => {
  // Handler with full type inference
});
```

## Consequences

### Positive

- **Performance**: Fastify is one of the fastest Node.js frameworks (benchmarks show 2-3x faster than Express)
- **Type safety**: First-class TypeScript support with schema inference
- **JSON Schema validation**: Built-in request/response validation with automatic type inference
- **Plugin ecosystem**: Rich ecosystem (@fastify/cors, @fastify/helmet, @fastify/rate-limit)
- **Swagger integration**: Native OpenAPI spec generation from route schemas
- **Async/await native**: No callback hell, clean async handlers

### Negative

- **Learning curve**: Different patterns than Express (decorators, plugins)
- **Less tutorials**: Fewer community resources compared to Express
- **Plugin compatibility**: Some Express middleware needs adaptation
- **Strict schema mode**: Can be verbose for simple endpoints

### Neutral

- Pino logger integration is opinionated but high-quality
- Encapsulation model requires understanding for complex apps

## Alternatives Considered

### Express

- **Pros**: Most popular, largest ecosystem, familiar to most developers
- **Cons**: Slower performance, middleware-based error handling is awkward, TypeScript support is bolted-on
- **Rejected because**: Performance matters for ZK verification endpoints, TypeScript integration is second-class

### Koa

- **Pros**: Clean async/await API, lightweight
- **Cons**: Minimal built-in features, need many middleware packages
- **Rejected because**: Requires assembling too many pieces, no built-in schema validation

### Hono

- **Pros**: Ultra-fast, TypeScript-first, works on edge runtimes
- **Cons**: Younger ecosystem, less battle-tested
- **Rejected because**: Plugin ecosystem is less mature, fewer production references

### NestJS

- **Pros**: Full-featured framework, dependency injection, decorators
- **Cons**: Heavy abstraction layer, opinionated structure, slower performance
- **Rejected because**: Overkill for our microservices, adds unnecessary complexity

## References

- [Fastify Documentation](https://fastify.dev/)
- [Fastify Benchmarks](https://fastify.dev/benchmarks/)
- [TypeBox for JSON Schema](https://github.com/sinclairzx81/typebox)
