-- ============================================================================
-- SCRIPT: 02_detection_views.sql
-- PROJECT: Transaction Guard (Exasol)
-- DESCRIPTION: Analytic views implementing multi-rule fraud detection, risk scoring,
--              account risk profiling, and executive compliance metrics.
-- ============================================================================

OPEN SCHEMA TRANSACTIONGUARD;

-- ----------------------------------------------------------------------------
-- VIEW 1: V_SUSPICIOUS_TRANSACTIONS
-- Evaluates every transaction using window functions across 3 core rules:
--   Rule 1 (Duplicate): Same account, amount, and merchant appeared > 1 time
--   Rule 2 (High Value): Amount >= 25,000.00
--   Rule 3 (Velocity): Account processed >= 4 transactions on the same calendar date
-- Produces granular flags, a composite Risk Score (0-100), and Severity Level.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS AS
WITH BASE_METRICS AS (
    SELECT
        T.TRANSACTION_ID,
        T.ACCOUNT_ID,
        T.AMOUNT,
        T.TRANSACTION_TIME,
        T.MERCHANT,
        -- Rule 1 metric: count occurrences of exact same account, amount, merchant
        COUNT(*) OVER (
            PARTITION BY T.ACCOUNT_ID, T.AMOUNT, T.MERCHANT
        ) AS DUPLICATE_COUNT,
        -- Rule 3 metric: count total transactions for this account on the same day
        COUNT(*) OVER (
            PARTITION BY T.ACCOUNT_ID, CAST(T.TRANSACTION_TIME AS DATE)
        ) AS DAILY_TRANSACTION_COUNT
    FROM TRANSACTIONGUARD.TRANSACTIONS T
),
SCORED AS (
    SELECT
        TRANSACTION_ID,
        ACCOUNT_ID,
        AMOUNT,
        TRANSACTION_TIME,
        MERCHANT,
        DUPLICATE_COUNT,
        DAILY_TRANSACTION_COUNT,
        -- Boolean indicator flags
        CASE WHEN DUPLICATE_COUNT > 1 THEN 1 ELSE 0 END AS FLAG_DUPLICATE,
        CASE WHEN AMOUNT >= 25000.00 THEN 1 ELSE 0 END AS FLAG_HIGH_AMOUNT,
        CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 1 ELSE 0 END AS FLAG_DAILY_VELOCITY,
        -- Composite Risk Score calculation (Max: 100)
        (
            (CASE WHEN DUPLICATE_COUNT > 1 THEN 35 ELSE 0 END) +
            (CASE WHEN AMOUNT >= 25000.00 THEN 40 ELSE 0 END) +
            (CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 25 ELSE 0 END)
        ) AS RISK_SCORE
    FROM BASE_METRICS
)
SELECT
    TRANSACTION_ID,
    ACCOUNT_ID,
    AMOUNT,
    TRANSACTION_TIME,
    MERCHANT,
    DUPLICATE_COUNT,
    DAILY_TRANSACTION_COUNT,
    FLAG_DUPLICATE,
    FLAG_HIGH_AMOUNT,
    FLAG_DAILY_VELOCITY,
    RISK_SCORE,
    -- Granular severity tier
    CASE
        WHEN RISK_SCORE >= 65 THEN 'CRITICAL'
        WHEN RISK_SCORE >= 35 THEN 'HIGH'
        WHEN RISK_SCORE >= 25 THEN 'MEDIUM'
        WHEN RISK_SCORE > 0   THEN 'LOW'
        ELSE 'NORMAL'
    END AS SEVERITY_LEVEL,
    -- Binary decision status for compliance queue
    CASE
        WHEN RISK_SCORE > 0 THEN 'REVIEW'
        ELSE 'NORMAL'
    END AS RISK_STATUS,
    -- Backward-compatible primary reason
    CASE
        WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction'
        WHEN AMOUNT >= 25000.00 THEN 'High transaction amount'
        WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day'
        ELSE 'No rule triggered'
    END AS PRIMARY_RISK_REASON,
    -- Comprehensive concatenated reasons (avoids hiding secondary triggers)
    TRIM(
        BOTH '; ' FROM
        CASE WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction; ' ELSE '' END ||
        CASE WHEN AMOUNT >= 25000.00 THEN 'High transaction amount; ' ELSE '' END ||
        CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day; ' ELSE '' END
    ) AS ALL_RISK_REASONS
FROM SCORED;


-- ----------------------------------------------------------------------------
-- VIEW 2: V_RISK_SUMMARY
-- Executive rollup of financial volume and transaction counts by risk status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_RISK_SUMMARY AS
SELECT
    RISK_STATUS,
    SEVERITY_LEVEL,
    COUNT(*) AS TRANSACTION_COUNT,
    SUM(AMOUNT) AS TOTAL_AMOUNT,
    ROUND(AVG(AMOUNT), 2) AS AVG_AMOUNT,
    MIN(AMOUNT) AS MIN_AMOUNT,
    MAX(AMOUNT) AS MAX_AMOUNT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY RISK_STATUS, SEVERITY_LEVEL
ORDER BY
    CASE RISK_STATUS WHEN 'REVIEW' THEN 0 ELSE 1 END,
    TOTAL_AMOUNT DESC;


-- ----------------------------------------------------------------------------
-- VIEW 3: V_ACCOUNT_RISK_PROFILE
-- Account-level fraud exposure ranking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_ACCOUNT_RISK_PROFILE AS
SELECT
    ACCOUNT_ID,
    COUNT(*) AS TOTAL_TXNS,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN 1 ELSE 0 END) AS FLAGGED_TXNS,
    SUM(AMOUNT) AS TOTAL_VOLUME,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN AMOUNT ELSE 0 END) AS VOLUME_AT_RISK,
    MAX(RISK_SCORE) AS MAX_RISK_SCORE,
    ROUND(
        (SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100,
        2
    ) AS ACCOUNT_SUSPICION_RATE_PCT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY ACCOUNT_ID
ORDER BY VOLUME_AT_RISK DESC, TOTAL_TXNS DESC;


-- ----------------------------------------------------------------------------
-- VIEW 4: V_MERCHANT_RISK_PROFILE
-- Merchant-level fraud exposure analysis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_MERCHANT_RISK_PROFILE AS
SELECT
    MERCHANT,
    COUNT(*) AS TOTAL_TRANSACTIONS,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN 1 ELSE 0 END) AS FLAGGED_TRANSACTIONS,
    SUM(AMOUNT) AS TOTAL_MERCHANT_VOLUME,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN AMOUNT ELSE 0 END) AS FLAGGED_VOLUME,
    ROUND(
        (SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100,
        2
    ) AS MERCHANT_RISK_RATE_PCT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY MERCHANT
ORDER BY FLAGGED_VOLUME DESC, TOTAL_TRANSACTIONS DESC;
