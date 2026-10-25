-- ============================================================================
-- SCRIPT: 01_schema_and_tables.sql
-- PROJECT: Transaction Guard (Exasol)
-- DESCRIPTION: Schema definition and table creation with primary key constraint
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS TRANSACTIONGUARD;

-- Open schema context
OPEN SCHEMA TRANSACTIONGUARD;

-- Core transactions table
-- Idempotent creation: replaces table if structure needs refresh
CREATE TABLE IF NOT EXISTS TRANSACTIONGUARD.TRANSACTIONS (
    TRANSACTION_ID    VARCHAR(20)   NOT NULL,
    ACCOUNT_ID        VARCHAR(20)   NOT NULL,
    AMOUNT            DECIMAL(12,2) NOT NULL,
    TRANSACTION_TIME  TIMESTAMP     NOT NULL,
    MERCHANT          VARCHAR(60)   NOT NULL,
    CONSTRAINT PK_TRANSACTIONS PRIMARY KEY (TRANSACTION_ID)
);

COMMENT ON TABLE TRANSACTIONGUARD.TRANSACTIONS IS 'Central ledger of raw financial transactions ingested for fraud analysis';
COMMENT ON COLUMN TRANSACTIONGUARD.TRANSACTIONS.TRANSACTION_ID IS 'Unique identifier for the financial transaction';
COMMENT ON COLUMN TRANSACTIONGUARD.TRANSACTIONS.ACCOUNT_ID IS 'Customer or account identifier';
COMMENT ON COLUMN TRANSACTIONGUARD.TRANSACTIONS.AMOUNT IS 'Transaction amount in local currency (DECIMAL 12,2)';
COMMENT ON COLUMN TRANSACTIONGUARD.TRANSACTIONS.TRANSACTION_TIME IS 'Timestamp when transaction occurred';
COMMENT ON COLUMN TRANSACTIONGUARD.TRANSACTIONS.MERCHANT IS 'Name of merchant or terminal where transaction was processed';
