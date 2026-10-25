-- ============================================================================
-- PROJECT: TRANSACTION GUARD (Exasol Database)
-- DESCRIPTION: Suspicious-Transaction Detection Engine for Financial Analytics
-- AUTHOR: Sindhureny
--
-- RULES IMPLEMENTED:
--   1) Duplicate Transaction: Same account, amount, and merchant appears > 1 time
--   2) High-Value Anomaly: Amount >= 25,000.00
--   3) High Daily Velocity: Account has >= 4 transactions on the same calendar date
--
-- FEATURES:
--   - Idempotent execution (safe to re-run multiple times)
--   - Individual boolean rule flags
--   - Weighted composite Risk Score (0 - 100)
--   - Severity tiers: CRITICAL, HIGH, MEDIUM, LOW, NORMAL
--   - Multi-reason concatenation (avoids masking secondary risk triggers)
--   - Modular analytical views for BI tools & compliance reporting
-- ============================================================================

-- ============================================================================
-- SECTION 1: SCHEMA & TABLE CREATION
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS TRANSACTIONGUARD;
OPEN SCHEMA TRANSACTIONGUARD;

CREATE TABLE IF NOT EXISTS TRANSACTIONGUARD.TRANSACTIONS (
    TRANSACTION_ID    VARCHAR(20)   NOT NULL,
    ACCOUNT_ID        VARCHAR(20)   NOT NULL,
    AMOUNT            DECIMAL(12,2) NOT NULL,
    TRANSACTION_TIME  TIMESTAMP     NOT NULL,
    MERCHANT          VARCHAR(60)   NOT NULL,
    CONSTRAINT PK_TRANSACTIONS PRIMARY KEY (TRANSACTION_ID)
);

-- ============================================================================
-- SECTION 2: SEED SAMPLE DATA (IDEMPOTENT)
-- ============================================================================
-- Clear table before insert so re-running the script never corrupts test results
TRUNCATE TABLE TRANSACTIONGUARD.TRANSACTIONS;

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

-- ============================================================================
-- SECTION 3: REUSABLE ANALYTIC VIEWS
-- ============================================================================

-- View 1: Core suspicious transaction detector with scoring and flags
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS AS
WITH BASE_METRICS AS (
    SELECT
        T.TRANSACTION_ID,
        T.ACCOUNT_ID,
        T.AMOUNT,
        T.TRANSACTION_TIME,
        T.MERCHANT,
        COUNT(*) OVER (
            PARTITION BY T.ACCOUNT_ID, T.AMOUNT, T.MERCHANT
        ) AS DUPLICATE_COUNT,
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
        CASE WHEN DUPLICATE_COUNT > 1 THEN 1 ELSE 0 END AS FLAG_DUPLICATE,
        CASE WHEN AMOUNT >= 25000.00 THEN 1 ELSE 0 END AS FLAG_HIGH_AMOUNT,
        CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 1 ELSE 0 END AS FLAG_DAILY_VELOCITY,
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
    CASE
        WHEN RISK_SCORE >= 65 THEN 'CRITICAL'
        WHEN RISK_SCORE >= 35 THEN 'HIGH'
        WHEN RISK_SCORE >= 25 THEN 'MEDIUM'
        WHEN RISK_SCORE > 0   THEN 'LOW'
        ELSE 'NORMAL'
    END AS SEVERITY_LEVEL,
    CASE
        WHEN RISK_SCORE > 0 THEN 'REVIEW'
        ELSE 'NORMAL'
    END AS RISK_STATUS,
    CASE
        WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction'
        WHEN AMOUNT >= 25000.00 THEN 'High transaction amount'
        WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day'
        ELSE 'No rule triggered'
    END AS PRIMARY_RISK_REASON,
    TRIM(
        BOTH '; ' FROM
        CASE WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction; ' ELSE '' END ||
        CASE WHEN AMOUNT >= 25000.00 THEN 'High transaction amount; ' ELSE '' END ||
        CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day; ' ELSE '' END
    ) AS ALL_RISK_REASONS
FROM SCORED;

-- View 2: Executive summary by risk status and severity
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_RISK_SUMMARY AS
SELECT
    RISK_STATUS,
    SEVERITY_LEVEL,
    COUNT(*) AS TRANSACTION_COUNT,
    SUM(AMOUNT) AS TOTAL_AMOUNT,
    ROUND(AVG(AMOUNT), 2) AS AVG_AMOUNT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY RISK_STATUS, SEVERITY_LEVEL
ORDER BY CASE RISK_STATUS WHEN 'REVIEW' THEN 0 ELSE 1 END, TOTAL_AMOUNT DESC;

-- View 3: Account risk profile
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_ACCOUNT_RISK_PROFILE AS
SELECT
    ACCOUNT_ID,
    COUNT(*) AS TOTAL_TXNS,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN 1 ELSE 0 END) AS FLAGGED_TXNS,
    SUM(AMOUNT) AS TOTAL_VOLUME,
    SUM(CASE WHEN RISK_STATUS = 'REVIEW' THEN AMOUNT ELSE 0 END) AS VOLUME_AT_RISK,
    MAX(RISK_SCORE) AS MAX_RISK_SCORE
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY ACCOUNT_ID
ORDER BY VOLUME_AT_RISK DESC, TOTAL_TXNS DESC;

-- ============================================================================
-- SECTION 4: MAIN PROJECT QUERY (REVIEW QUEUE)
-- Displays every transaction with its risk classification, score, and reasons
-- ============================================================================
SELECT
    TRANSACTION_ID,
    ACCOUNT_ID,
    AMOUNT,
    TRANSACTION_TIME,
    MERCHANT,
    RISK_SCORE,
    SEVERITY_LEVEL,
    PRIMARY_RISK_REASON AS RISK_REASON,
    ALL_RISK_REASONS,
    RISK_STATUS
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
ORDER BY
    CASE WHEN RISK_STATUS = 'REVIEW' THEN 0 ELSE 1 END,
    RISK_SCORE DESC,
    AMOUNT DESC;

-- ============================================================================
-- SECTION 5: SUMMARY REPORT QUERY
-- Run separately after the main query to get high-level compliance KPIs
-- ============================================================================
SELECT
    RISK_STATUS,
    COUNT(*) AS TRANSACTION_COUNT,
    SUM(AMOUNT) AS TOTAL_AMOUNT,
    ROUND((COUNT(*) * 100.0) / (SELECT COUNT(*) FROM TRANSACTIONGUARD.TRANSACTIONS), 1) AS PCT_TRANSACTIONS,
    ROUND((SUM(AMOUNT) * 100.0) / (SELECT SUM(AMOUNT) FROM TRANSACTIONGUARD.TRANSACTIONS), 1) AS PCT_VOLUME
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY RISK_STATUS
ORDER BY RISK_STATUS;
