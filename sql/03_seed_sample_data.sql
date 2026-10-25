-- ============================================================================
-- SCRIPT: 03_seed_sample_data.sql
-- PROJECT: Transaction Guard (Exasol)
-- DESCRIPTION: Idempotent seed data loading standard demo transactions.
--              Safe to run repeatedly without creating accidental duplicates.
-- ============================================================================

OPEN SCHEMA TRANSACTIONGUARD;

-- Clear previous data to ensure test runs remain clean and deterministic
TRUNCATE TABLE TRANSACTIONGUARD.TRANSACTIONS;

-- Ingest standard sample transactions
INSERT INTO TRANSACTIONGUARD.TRANSACTIONS 
    (TRANSACTION_ID, ACCOUNT_ID, AMOUNT, TRANSACTION_TIME, MERCHANT)
VALUES
    ('TXN001', 'ACC101', 1200.00, TIMESTAMP '2026-10-25 09:00:00', 'BookStore'),
    ('TXN002', 'ACC102', 27000.00, TIMESTAMP '2026-10-25 09:15:00', 'Electronics'),
    ('TXN003', 'ACC103', 450.00, TIMESTAMP '2026-10-25 10:00:00', 'Cafe'),
    ('TXN004', 'ACC103', 450.00, TIMESTAMP '2026-10-25 10:05:00', 'Cafe'),
    ('TXN005', 'ACC104', 900.00, TIMESTAMP '2026-10-25 10:10:00', 'Pharmacy'),
    ('TXN006', 'ACC104', 700.00, TIMESTAMP '2026-10-25 10:20:00', 'Grocery'),
    ('TXN007', 'ACC104', 650.00, TIMESTAMP '2026-10-25 10:30:00', 'Fuel'),
    ('TXN008', 'ACC104', 800.00, TIMESTAMP '2026-10-25 10:40:00', 'OnlineShop'),
    ('TXN009', 'ACC105', 1500.00, TIMESTAMP '2026-10-25 11:00:00', 'Clothing');

COMMIT;
