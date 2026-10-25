-- ============================================================================
-- SCRIPT: 04_analytical_queries.sql
-- PROJECT: Transaction Guard (Exasol)
-- DESCRIPTION: Analyst verification queries for investigation and reporting
-- ============================================================================

OPEN SCHEMA TRANSACTIONGUARD;

-- ----------------------------------------------------------------------------
-- QUERY 1: Priority Investigation Queue (Review Flagged Transactions)
-- Returns all transactions requiring manual or automated fraud review,
-- ordered by Risk Score (highest first) and Amount.
-- ----------------------------------------------------------------------------
SELECT
    TRANSACTION_ID,
    ACCOUNT_ID,
    AMOUNT,
    TRANSACTION_TIME,
    MERCHANT,
    RISK_SCORE,
    SEVERITY_LEVEL,
    ALL_RISK_REASONS
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
WHERE RISK_STATUS = 'REVIEW'
ORDER BY RISK_SCORE DESC, AMOUNT DESC;


-- ----------------------------------------------------------------------------
-- QUERY 2: Executive Compliance Summary
-- High-level overview of total transactions, dollar amounts, and review rates.
-- ----------------------------------------------------------------------------
SELECT * 
FROM TRANSACTIONGUARD.V_RISK_SUMMARY;


-- ----------------------------------------------------------------------------
-- QUERY 3: High-Risk Accounts Profile
-- Identifies accounts with the greatest suspicious transaction volume.
-- ----------------------------------------------------------------------------
SELECT *
FROM TRANSACTIONGUARD.V_ACCOUNT_RISK_PROFILE
WHERE FLAGGED_TXNS > 0;


-- ----------------------------------------------------------------------------
-- QUERY 4: Merchant Anomaly Analysis
-- Identifies merchants receiving high volumes of flagged transactions.
-- ----------------------------------------------------------------------------
SELECT *
FROM TRANSACTIONGUARD.V_MERCHANT_RISK_PROFILE
WHERE FLAGGED_TRANSACTIONS > 0;


-- ----------------------------------------------------------------------------
-- QUERY 5: Duplicate Transactions Drill-Down
-- Isolates exact duplicates for dispute resolution and chargeback defense.
-- ----------------------------------------------------------------------------
SELECT
    TRANSACTION_ID,
    ACCOUNT_ID,
    AMOUNT,
    MERCHANT,
    TRANSACTION_TIME,
    DUPLICATE_COUNT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
WHERE FLAG_DUPLICATE = 1
ORDER BY ACCOUNT_ID, MERCHANT, TRANSACTION_TIME;
