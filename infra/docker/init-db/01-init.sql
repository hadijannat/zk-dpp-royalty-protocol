-- ZK-DPP Database Initialization
-- This script runs when the PostgreSQL container is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for each service
CREATE SCHEMA IF NOT EXISTS verify_gateway;
CREATE SCHEMA IF NOT EXISTS dpp_builder;
CREATE SCHEMA IF NOT EXISTS metering;
CREATE SCHEMA IF NOT EXISTS identity_audit;

-- Grant permissions (the services will use the zkdpp user)
GRANT ALL ON SCHEMA verify_gateway TO zkdpp;
GRANT ALL ON SCHEMA dpp_builder TO zkdpp;
GRANT ALL ON SCHEMA metering TO zkdpp;
GRANT ALL ON SCHEMA identity_audit TO zkdpp;

-- =============================================================================
-- Verification Gateway tables
-- =============================================================================

CREATE TABLE verify_gateway.verification_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    predicate_id VARCHAR(100) NOT NULL,
    commitment_root VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(100) NOT NULL,
    requester_id VARCHAR(100) NOT NULL,
    product_binding VARCHAR(64) NOT NULL,
    nonce VARCHAR(64) NOT NULL UNIQUE,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    receipt_signature TEXT
);

CREATE INDEX idx_verification_events_supplier ON verify_gateway.verification_events(supplier_id);
CREATE INDEX idx_verification_events_requester ON verify_gateway.verification_events(requester_id);
CREATE INDEX idx_verification_events_verified_at ON verify_gateway.verification_events(verified_at);

-- =============================================================================
-- DPP Builder tables
-- =============================================================================

CREATE TABLE dpp_builder.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE dpp_builder.product_supplier_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES dpp_builder.products(id) ON DELETE CASCADE,
    supplier_id VARCHAR(100) NOT NULL,
    commitment_root VARCHAR(64) NOT NULL,
    supplier_public_key TEXT NOT NULL,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT true
);

CREATE TABLE dpp_builder.verified_predicates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES dpp_builder.products(id) ON DELETE CASCADE,
    supplier_id VARCHAR(100) NOT NULL,
    predicate_id VARCHAR(100) NOT NULL,
    receipt_id VARCHAR(100) NOT NULL,
    result BOOLEAN NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_products_sku ON dpp_builder.products(sku);
CREATE INDEX idx_products_category ON dpp_builder.products(category);
CREATE INDEX idx_product_supplier_links_product ON dpp_builder.product_supplier_links(product_id);
CREATE INDEX idx_product_supplier_links_supplier ON dpp_builder.product_supplier_links(supplier_id);
CREATE INDEX idx_verified_predicates_product ON dpp_builder.verified_predicates(product_id);
CREATE INDEX idx_verified_predicates_predicate ON dpp_builder.verified_predicates(predicate_id);

-- =============================================================================
-- Metering tables
-- =============================================================================

CREATE TABLE metering.verification_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(100) NOT NULL UNIQUE,
    supplier_id VARCHAR(100) NOT NULL,
    brand_id VARCHAR(100),
    predicate_id VARCHAR(100) NOT NULL,
    receipt_id VARCHAR(100) NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
    price_per_verification DECIMAL(10,4) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE metering.settlement_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id VARCHAR(100) NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_verifications INTEGER NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    breakdown JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finalized_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_verification_usage_supplier ON metering.verification_usage(supplier_id);
CREATE INDEX idx_verification_usage_brand ON metering.verification_usage(brand_id);
CREATE INDEX idx_verification_usage_verified_at ON metering.verification_usage(verified_at);
CREATE INDEX idx_verification_usage_predicate ON metering.verification_usage(predicate_id);
CREATE INDEX idx_settlement_statements_supplier ON metering.settlement_statements(supplier_id);
CREATE INDEX idx_settlement_statements_period ON metering.settlement_statements(period_start, period_end);

-- Monthly aggregation view for reporting
CREATE VIEW metering.monthly_usage AS
SELECT
    supplier_id,
    brand_id,
    predicate_id,
    DATE_TRUNC('month', verified_at) AS month,
    COUNT(*) AS verification_count,
    SUM(price_per_verification) AS total_amount,
    currency
FROM metering.verification_usage
GROUP BY supplier_id, brand_id, predicate_id, DATE_TRUNC('month', verified_at), currency;

-- =============================================================================
-- Identity Audit tables
-- =============================================================================

CREATE TABLE identity_audit.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id VARCHAR(100) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON identity_audit.audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON identity_audit.audit_log(action);
CREATE INDEX idx_audit_log_resource ON identity_audit.audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created_at ON identity_audit.audit_log(created_at);

-- =============================================================================
-- Grant table permissions
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA verify_gateway TO zkdpp;
GRANT ALL ON ALL TABLES IN SCHEMA dpp_builder TO zkdpp;
GRANT ALL ON ALL TABLES IN SCHEMA metering TO zkdpp;
GRANT ALL ON ALL TABLES IN SCHEMA identity_audit TO zkdpp;

GRANT ALL ON ALL SEQUENCES IN SCHEMA verify_gateway TO zkdpp;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dpp_builder TO zkdpp;
GRANT ALL ON ALL SEQUENCES IN SCHEMA metering TO zkdpp;
GRANT ALL ON ALL SEQUENCES IN SCHEMA identity_audit TO zkdpp;
