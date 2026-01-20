-- Migration: Add blockchain support to metering schema
-- This adds fields for tracking on-chain settlement status

-- Add blockchain fields to settlement_statements
ALTER TABLE metering.settlement_statements
ADD COLUMN IF NOT EXISTS supplier_wallet VARCHAR(42),
ADD COLUMN IF NOT EXISTS blockchain_status VARCHAR(20) DEFAULT 'NOT_SUBMITTED',
ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS block_number BIGINT,
ADD COLUMN IF NOT EXISTS chain_submitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS chain_finalized_at TIMESTAMP WITH TIME ZONE;

-- Add constraint for valid blockchain statuses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'valid_blockchain_status'
    ) THEN
        ALTER TABLE metering.settlement_statements
        ADD CONSTRAINT valid_blockchain_status
        CHECK (blockchain_status IN (
            'NOT_SUBMITTED',
            'PENDING',
            'SUBMITTED',
            'FINALIZED',
            'DISPUTED',
            'PAID',
            'FAILED'
        ));
    END IF;
END $$;

-- Create supplier_wallets table for storing wallet registrations
CREATE TABLE IF NOT EXISTS metering.supplier_wallets (
    supplier_id VARCHAR(100) PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster lookups by blockchain status
CREATE INDEX IF NOT EXISTS idx_settlement_blockchain_status
ON metering.settlement_statements (blockchain_status);

-- Add index for faster lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_supplier_wallets_address
ON metering.supplier_wallets (wallet_address);

-- Add trigger to update updated_at on supplier_wallets
CREATE OR REPLACE FUNCTION metering.update_supplier_wallets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supplier_wallets_updated_at ON metering.supplier_wallets;
CREATE TRIGGER supplier_wallets_updated_at
    BEFORE UPDATE ON metering.supplier_wallets
    FOR EACH ROW
    EXECUTE FUNCTION metering.update_supplier_wallets_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON metering.supplier_wallets TO zkdpp;

COMMENT ON COLUMN metering.settlement_statements.supplier_wallet IS 'Ethereum wallet address for the supplier';
COMMENT ON COLUMN metering.settlement_statements.blockchain_status IS 'Status of on-chain settlement: NOT_SUBMITTED, PENDING, SUBMITTED, FINALIZED, DISPUTED, PAID, FAILED';
COMMENT ON COLUMN metering.settlement_statements.tx_hash IS 'Transaction hash of the on-chain submission';
COMMENT ON COLUMN metering.settlement_statements.block_number IS 'Block number where the transaction was included';
COMMENT ON COLUMN metering.settlement_statements.chain_submitted_at IS 'Timestamp when statement was submitted to blockchain';
COMMENT ON COLUMN metering.settlement_statements.chain_finalized_at IS 'Timestamp when statement was finalized on blockchain';

COMMENT ON TABLE metering.supplier_wallets IS 'Maps supplier IDs to their Ethereum wallet addresses for royalty payments';
