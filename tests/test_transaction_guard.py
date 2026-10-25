"""
Comprehensive unit test suite for Transaction Guard.
Tests detection rules:
1. Duplicate transactions (same account, amount, merchant)
2. High-value transactions (amount >= 25,000)
3. High daily transaction velocity (>= 4 transactions in a calendar day)
4. Multi-rule triggers & composite risk scoring
5. Clean/normal transaction handling & boundary edge cases
"""

import unittest
import sqlite3
from typing import List, Tuple, Dict, Any


def init_db(con: sqlite3.Connection):
    cur = con.cursor()
    cur.execute("DROP TABLE IF EXISTS TRANSACTIONS;")
    cur.execute("""
    CREATE TABLE TRANSACTIONS (
        TRANSACTION_ID VARCHAR(20) PRIMARY KEY,
        ACCOUNT_ID VARCHAR(20) NOT NULL,
        AMOUNT DECIMAL(12,2) NOT NULL,
        TRANSACTION_TIME TIMESTAMP NOT NULL,
        MERCHANT VARCHAR(60) NOT NULL
    );
    """)
    con.commit()


def insert_transactions(con: sqlite3.Connection, rows: List[Tuple]):
    cur = con.cursor()
    cur.executemany("INSERT INTO TRANSACTIONS VALUES (?,?,?,?,?)", rows)
    con.commit()


def analyze_transactions(con: sqlite3.Connection) -> List[Dict[str, Any]]:
    query = """
    WITH BASE AS (
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
                PARTITION BY T.ACCOUNT_ID, DATE(T.TRANSACTION_TIME)
            ) AS DAILY_TRANSACTION_COUNT
        FROM TRANSACTIONS T
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
            (CASE WHEN DUPLICATE_COUNT > 1 THEN 1 ELSE 0 END) AS FLAG_DUPLICATE,
            (CASE WHEN AMOUNT >= 25000.00 THEN 1 ELSE 0 END) AS FLAG_HIGH_AMOUNT,
            (CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 1 ELSE 0 END) AS FLAG_DAILY_VELOCITY,
            (
                (CASE WHEN DUPLICATE_COUNT > 1 THEN 35 ELSE 0 END) +
                (CASE WHEN AMOUNT >= 25000.00 THEN 40 ELSE 0 END) +
                (CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 25 ELSE 0 END)
            ) AS RISK_SCORE
        FROM BASE
    )
    SELECT
        TRANSACTION_ID,
        ACCOUNT_ID,
        AMOUNT,
        TRANSACTION_TIME,
        MERCHANT,
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
        -- Primary legacy reason for backward compatibility
        CASE
            WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction'
            WHEN AMOUNT >= 25000 THEN 'High transaction amount'
            WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day'
            ELSE 'No rule triggered'
        END AS PRIMARY_RISK_REASON,
        -- Concatenated all reasons
        TRIM(
            CASE WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction; ' ELSE '' END ||
            CASE WHEN AMOUNT >= 25000 THEN 'High transaction amount; ' ELSE '' END ||
            CASE WHEN DAILY_TRANSACTION_COUNT >= 4 THEN 'Many transactions in one day; ' ELSE '' END,
            '; '
        ) AS ALL_RISK_REASONS
    FROM SCORED
    ORDER BY
        CASE WHEN RISK_SCORE > 0 THEN 0 ELSE 1 END,
        RISK_SCORE DESC,
        AMOUNT DESC;
    """
    cur = con.cursor()
    cur.execute(query)
    columns = [col[0] for col in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


class TestTransactionGuard(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        init_db(self.con)

    def tearDown(self):
        self.con.close()

    def test_original_dataset_results(self):
        """Test with the original sample dataset from transaction_guard_exasol.sql."""
        data = [
            ('TXN001', 'ACC101', 1200.00, '2026-10-25 09:00:00', 'BookStore'),
            ('TXN002', 'ACC102', 27000.00, '2026-10-25 09:15:00', 'Electronics'),
            ('TXN003', 'ACC103', 450.00, '2026-10-25 10:00:00', 'Cafe'),
            ('TXN004', 'ACC103', 450.00, '2026-10-25 10:05:00', 'Cafe'),
            ('TXN005', 'ACC104', 900.00, '2026-10-25 10:10:00', 'Pharmacy'),
            ('TXN006', 'ACC104', 700.00, '2026-10-25 10:20:00', 'Grocery'),
            ('TXN007', 'ACC104', 650.00, '2026-10-25 10:30:00', 'Fuel'),
            ('TXN008', 'ACC104', 800.00, '2026-10-25 10:40:00', 'OnlineShop'),
            ('TXN009', 'ACC105', 1500.00, '2026-10-25 11:00:00', 'Clothing')
        ]
        insert_transactions(self.con, data)
        results = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}

        # TXN001 & TXN009 should be NORMAL
        self.assertEqual(results['TXN001']['RISK_STATUS'], 'NORMAL')
        self.assertEqual(results['TXN001']['RISK_SCORE'], 0)
        self.assertEqual(results['TXN009']['RISK_STATUS'], 'NORMAL')
        self.assertEqual(results['TXN009']['RISK_SCORE'], 0)

        # TXN002: High amount (27,000 >= 25,000)
        self.assertEqual(results['TXN002']['RISK_STATUS'], 'REVIEW')
        self.assertEqual(results['TXN002']['FLAG_HIGH_AMOUNT'], 1)
        self.assertEqual(results['TXN002']['FLAG_DUPLICATE'], 0)
        self.assertEqual(results['TXN002']['FLAG_DAILY_VELOCITY'], 0)
        self.assertEqual(results['TXN002']['PRIMARY_RISK_REASON'], 'High transaction amount')

        # TXN003 & TXN004: Duplicate transactions (same account, amount, merchant)
        self.assertEqual(results['TXN003']['RISK_STATUS'], 'REVIEW')
        self.assertEqual(results['TXN003']['FLAG_DUPLICATE'], 1)
        self.assertEqual(results['TXN004']['FLAG_DUPLICATE'], 1)
        self.assertEqual(results['TXN003']['PRIMARY_RISK_REASON'], 'Possible duplicate transaction')

        # ACC104 (TXN005, TXN006, TXN007, TXN008): 4 transactions on same day
        for tid in ['TXN005', 'TXN006', 'TXN007', 'TXN008']:
            self.assertEqual(results[tid]['RISK_STATUS'], 'REVIEW')
            self.assertEqual(results[tid]['FLAG_DAILY_VELOCITY'], 1)
            self.assertEqual(results[tid]['PRIMARY_RISK_REASON'], 'Many transactions in one day')

    def test_amount_threshold_boundary(self):
        """Test boundary at exactly 25000 and 24999.99."""
        data = [
            ('TXN_BELOW', 'ACC201', 24999.99, '2026-10-25 12:00:00', 'StoreA'),
            ('TXN_EXACT', 'ACC202', 25000.00, '2026-10-25 12:00:00', 'StoreB'),
            ('TXN_ABOVE', 'ACC203', 25000.01, '2026-10-25 12:00:00', 'StoreC'),
        ]
        insert_transactions(self.con, data)
        results = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}

        self.assertEqual(results['TXN_BELOW']['FLAG_HIGH_AMOUNT'], 0)
        self.assertEqual(results['TXN_BELOW']['RISK_STATUS'], 'NORMAL')

        self.assertEqual(results['TXN_EXACT']['FLAG_HIGH_AMOUNT'], 1)
        self.assertEqual(results['TXN_EXACT']['RISK_STATUS'], 'REVIEW')

        self.assertEqual(results['TXN_ABOVE']['FLAG_HIGH_AMOUNT'], 1)
        self.assertEqual(results['TXN_ABOVE']['RISK_STATUS'], 'REVIEW')

    def test_duplicate_not_triggered_for_different_merchant_or_account(self):
        """Test that same amount at different merchants or different accounts is not flagged as duplicate."""
        data = [
            ('T1', 'ACC301', 500.00, '2026-10-25 10:00:00', 'MerchantA'),
            ('T2', 'ACC301', 500.00, '2026-10-25 11:00:00', 'MerchantB'),  # different merchant
            ('T3', 'ACC302', 500.00, '2026-10-25 10:00:00', 'MerchantA'),  # different account
        ]
        insert_transactions(self.con, data)
        results = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}

        for tid in ['T1', 'T2', 'T3']:
            self.assertEqual(results[tid]['FLAG_DUPLICATE'], 0)
            self.assertEqual(results[tid]['RISK_STATUS'], 'NORMAL')

    def test_multi_rule_trigger(self):
        """Test that a transaction triggering BOTH duplicate and high amount is properly scored and reasons combined."""
        data = [
            ('MULTI_1', 'ACC401', 30000.00, '2026-10-25 14:00:00', 'LuxuryJeweler'),
            ('MULTI_2', 'ACC401', 30000.00, '2026-10-25 14:05:00', 'LuxuryJeweler'),
        ]
        insert_transactions(self.con, data)
        results = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}

        res = results['MULTI_1']
        self.assertEqual(res['FLAG_DUPLICATE'], 1)
        self.assertEqual(res['FLAG_HIGH_AMOUNT'], 1)
        # Score = 35 + 40 = 75 => CRITICAL
        self.assertEqual(res['RISK_SCORE'], 75)
        self.assertEqual(res['SEVERITY_LEVEL'], 'CRITICAL')
        self.assertIn('Possible duplicate transaction', res['ALL_RISK_REASONS'])
        self.assertIn('High transaction amount', res['ALL_RISK_REASONS'])

    def test_daily_velocity_threshold(self):
        """Test that 3 transactions in a day is NORMAL, but 4 triggers velocity."""
        data_3 = [
            ('V1', 'ACC501', 100.00, '2026-10-25 08:00:00', 'Shop1'),
            ('V2', 'ACC501', 200.00, '2026-10-25 09:00:00', 'Shop2'),
            ('V3', 'ACC501', 300.00, '2026-10-25 10:00:00', 'Shop3'),
        ]
        insert_transactions(self.con, data_3)
        res_3 = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}
        self.assertEqual(res_3['V1']['FLAG_DAILY_VELOCITY'], 0)
        self.assertEqual(res_3['V1']['RISK_STATUS'], 'NORMAL')

        # Add a 4th transaction on same day
        insert_transactions(self.con, [('V4', 'ACC501', 400.00, '2026-10-25 11:00:00', 'Shop4')])
        res_4 = {r['TRANSACTION_ID']: r for r in analyze_transactions(self.con)}
        self.assertEqual(res_4['V1']['FLAG_DAILY_VELOCITY'], 1)
        self.assertEqual(res_4['V4']['FLAG_DAILY_VELOCITY'], 1)
        self.assertEqual(res_4['V1']['RISK_STATUS'], 'REVIEW')


if __name__ == '__main__':
    unittest.main()
