# Kubernetes Deployment Guide

This guide covers deploying the ZK-DPP Royalty Protocol on Kubernetes using Helm charts.

## Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured for your cluster
- Helm 3.12+
- Ingress controller (nginx-ingress or similar)
- cert-manager (optional, for TLS)

## Quick Start

```bash
# Add Helm repo (when published)
helm repo add zkdpp https://charts.zkdpp.io
helm repo update

# Install with default values
helm install zkdpp zkdpp/zkdpp -n zkdpp --create-namespace

# Or install from local charts
helm install zkdpp ./infra/helm/zkdpp -n zkdpp --create-namespace
```

## Architecture

```
                    ┌─────────────┐
                    │   Ingress   │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
     ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
     │  verify-  │   │   dpp-    │   │ metering- │
     │  gateway  │   │  builder  │   │  billing  │
     └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
        │ PostgreSQL│ │  NATS   │ │ Keycloak  │
        └───────────┘ └─────────┘ └───────────┘
```

## Namespace Setup

```bash
# Create namespace with labels
kubectl create namespace zkdpp
kubectl label namespace zkdpp app.kubernetes.io/name=zkdpp
```

## Installing Dependencies

### PostgreSQL (using Bitnami chart)

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami

helm install zkdpp-postgres bitnami/postgresql \
  --namespace zkdpp \
  --set auth.database=zkdpp \
  --set auth.username=zkdpp \
  --set auth.existingSecret=zkdpp-postgres-secret \
  --set primary.persistence.size=10Gi
```

Create the secret first:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: zkdpp-postgres-secret
  namespace: zkdpp
type: Opaque
stringData:
  postgres-password: "your-secure-password"
  password: "your-secure-password"
```

### NATS (using official chart)

```bash
helm repo add nats https://nats-io.github.io/k8s/helm/charts/

helm install zkdpp-nats nats/nats \
  --namespace zkdpp \
  --set nats.jetstream.enabled=true \
  --set nats.jetstream.memStorage.size=256Mi \
  --set nats.jetstream.fileStorage.size=1Gi
```

### Keycloak (using Bitnami chart)

```bash
helm install zkdpp-keycloak bitnami/keycloak \
  --namespace zkdpp \
  --set postgresql.enabled=false \
  --set externalDatabase.host=zkdpp-postgres-postgresql \
  --set externalDatabase.database=zkdpp \
  --set externalDatabase.user=zkdpp \
  --set externalDatabase.existingSecret=zkdpp-postgres-secret \
  --set externalDatabase.existingSecretPasswordKey=password
```

## ZK-DPP Services Deployment

### Using Helm

```bash
helm install zkdpp ./infra/helm/zkdpp \
  --namespace zkdpp \
  --values infra/helm/zkdpp/values-production.yaml
```

### values-production.yaml Example

```yaml
global:
  imageRegistry: ghcr.io/hadijannat
  imagePullSecrets:
    - name: ghcr-secret

verifyGateway:
  replicaCount: 2
  image:
    repository: zkdpp-verify-gateway
    tag: v0.1.0
  resources:
    limits:
      memory: 512Mi
      cpu: 500m
    requests:
      memory: 256Mi
      cpu: 100m
  env:
    NATS_URL: nats://zkdpp-nats:4222
    KEYCLOAK_URL: http://zkdpp-keycloak:80

dppBuilder:
  replicaCount: 2
  image:
    repository: zkdpp-dpp-builder
    tag: v0.1.0
  resources:
    limits:
      memory: 512Mi
      cpu: 500m
    requests:
      memory: 256Mi
      cpu: 100m
  env:
    DATABASE_URL: postgresql://zkdpp:$(DB_PASSWORD)@zkdpp-postgres-postgresql:5432/zkdpp
    NATS_URL: nats://zkdpp-nats:4222

meteringBilling:
  replicaCount: 2
  image:
    repository: zkdpp-metering-billing
    tag: v0.1.0
  resources:
    limits:
      memory: 512Mi
      cpu: 500m
    requests:
      memory: 256Mi
      cpu: 100m
  env:
    DATABASE_URL: postgresql://zkdpp:$(DB_PASSWORD)@zkdpp-postgres-postgresql:5432/zkdpp
    NATS_URL: nats://zkdpp-nats:4222

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: api.zkdpp.io
      paths:
        - path: /verify
          pathType: Prefix
          service: verify-gateway
        - path: /predicates
          pathType: Prefix
          service: verify-gateway
        - path: /products
          pathType: Prefix
          service: dpp-builder
        - path: /dpp
          pathType: Prefix
          service: dpp-builder
        - path: /usage
          pathType: Prefix
          service: metering-billing
        - path: /settlements
          pathType: Prefix
          service: metering-billing
  tls:
    - secretName: zkdpp-tls
      hosts:
        - api.zkdpp.io
```

## Secrets Management

### Create secrets

```bash
# Database password
kubectl create secret generic zkdpp-db-secret \
  --namespace zkdpp \
  --from-literal=password=your-secure-password

# Gateway signing key
kubectl create secret generic zkdpp-gateway-secret \
  --namespace zkdpp \
  --from-literal=signing-key=your-ed25519-private-key

# Blockchain credentials (optional)
kubectl create secret generic zkdpp-blockchain-secret \
  --namespace zkdpp \
  --from-literal=private-key=0x... \
  --from-literal=rpc-url=https://...
```

### Using External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: zkdpp-secrets
  namespace: zkdpp
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: zkdpp-secrets
  data:
    - secretKey: db-password
      remoteRef:
        key: zkdpp/production
        property: db_password
```

## Service Mesh (Istio)

For production, consider using Istio for mTLS and observability:

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: zkdpp-mtls
  namespace: zkdpp
spec:
  mtls:
    mode: STRICT
```

## Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: verify-gateway-hpa
  namespace: zkdpp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: verify-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Pod Disruption Budgets

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: verify-gateway-pdb
  namespace: zkdpp
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: verify-gateway
```

## Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: zkdpp-default-deny
  namespace: zkdpp
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-services
  namespace: zkdpp
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/part-of: zkdpp
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: zkdpp
  egress:
    - to:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: zkdpp
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app.kubernetes.io/name: nats
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              app.kubernetes.io/name: postgresql
```

## Monitoring

### Prometheus ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: zkdpp-services
  namespace: zkdpp
spec:
  selector:
    matchLabels:
      app.kubernetes.io/part-of: zkdpp
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Grafana Dashboard

Import the ZK-DPP dashboard from `infra/grafana/dashboard.json`.

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n zkdpp
kubectl describe pod <pod-name> -n zkdpp
```

### View logs

```bash
kubectl logs -f deployment/verify-gateway -n zkdpp
kubectl logs -f deployment/dpp-builder -n zkdpp
kubectl logs -f deployment/metering-billing -n zkdpp
```

### Check service connectivity

```bash
# Port-forward for local testing
kubectl port-forward svc/verify-gateway 3001:3001 -n zkdpp

# Test from within cluster
kubectl run -it --rm debug --image=curlimages/curl -- sh
curl http://verify-gateway.zkdpp:3001/health
```

### Database connectivity

```bash
kubectl run -it --rm psql --image=postgres:16-alpine -- \
  psql "postgresql://zkdpp:password@zkdpp-postgres-postgresql:5432/zkdpp"
```

## Upgrade Procedure

1. Update Helm values or image tags
2. Perform a dry-run to validate changes
3. Apply the upgrade with `--atomic` for automatic rollback

```bash
# Dry run
helm upgrade zkdpp ./infra/helm/zkdpp \
  --namespace zkdpp \
  --dry-run

# Upgrade with rollback protection
helm upgrade zkdpp ./infra/helm/zkdpp \
  --namespace zkdpp \
  --atomic \
  --timeout 10m
```

## Rollback

```bash
# View history
helm history zkdpp -n zkdpp

# Rollback to previous
helm rollback zkdpp -n zkdpp

# Rollback to specific revision
helm rollback zkdpp 2 -n zkdpp
```
