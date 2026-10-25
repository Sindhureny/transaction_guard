"""
Transaction Guard: Suspicious Transaction Detection Engine
Core detection engine supporting both Exasol database execution and local SQLite simulation.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional
import sqlite3


@dataclass
class Transaction:
    transaction_id: str
    account_id: str
    amount: float
    transaction_time: str
    merchant: str


@dataclass
class ScoredTransaction:
    transaction_id: str
    account_id: str
    amount: float
    transaction_time: str
    merchant: str
    duplicate_count: int
    daily_transaction_count: int
    flag_duplicate: bool
    flag_high_amount: bool
    flag_daily_velocity: bool
    risk_score: int
    severity_level: str
    risk_status: str
    primary_risk_reason: str
    all_risk_reasons: str


class TransactionGuardEngine:
    """Detection engine for suspicious financial transactions."""

    HIGH_AMOUNT_THRESHOLD = 25000.00
    DAILY_VELOCITY_THRESHOLD = 4

    # Rule weights for composite scoring (sum to 100 max)
    WEIGHT_HIGH_AMOUNT = 40
    WEIGHT_DUPLICATE = 35
    WEIGHT_DAILY_VELOCITY = 25

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self.con = sqlite3.connect(self.db_path)
        self._init_schema()

    def _init_schema(self):
        cur = self.con.cursor()
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
        self.con.commit()

    def clear(self):
        """Clear all transactions from the table."""
        cur = self.con.cursor()
        cur.execute("DELETE FROM TRANSACTIONS;")
        self.con.commit()

    def load_transactions(self, transactions: List[Transaction]):
        """Load a batch of transactions into the engine."""
        cur = self.con.cursor()
        rows = [
            (t.transaction_id, t.account_id, t.amount, t.transaction_time, t.merchant)
            for t in transactions
        ]
        cur.executemany("INSERT OR REPLACE INTO TRANSACTIONS VALUES (?,?,?,?,?)", rows)
        self.con.commit()

    def load_default_sample_data(self):
        """Loads the standardized demo dataset."""
        sample_txns = [
            Transaction('TXN001', 'ACC101', 1200.00, '2026-10-25 09:00:00', 'BookStore'),
            Transaction('TXN002', 'ACC102', 27000.00, '2026-10-25 09:15:00', 'Electronics'),
            Transaction('TXN003', 'ACC103', 450.00, '2026-10-25 10:00:00', 'Cafe'),
            Transaction('TXN004', 'ACC103', 450.00, '2026-10-25 10:05:00', 'Cafe'),
            Transaction('TXN005', 'ACC104', 900.00, '2026-10-25 10:10:00', 'Pharmacy'),
            Transaction('TXN006', 'ACC104', 700.00, '2026-10-25 10:20:00', 'Grocery'),
            Transaction('TXN007', 'ACC104', 650.00, '2026-10-25 10:30:00', 'Fuel'),
            Transaction('TXN008', 'ACC104', 800.00, '2026-10-25 10:40:00', 'OnlineShop'),
            Transaction('TXN009', 'ACC105', 1500.00, '2026-10-25 11:00:00', 'Clothing'),
        ]
        self.load_transactions(sample_txns)

    def analyze(self) -> List[ScoredTransaction]:
        """Runs the detection algorithm and returns scored transactions."""
        query = f"""
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
                (CASE WHEN AMOUNT >= {self.HIGH_AMOUNT_THRESHOLD} THEN 1 ELSE 0 END) AS FLAG_HIGH_AMOUNT,
                (CASE WHEN DAILY_TRANSACTION_COUNT >= {self.DAILY_VELOCITY_THRESHOLD} THEN 1 ELSE 0 END) AS FLAG_DAILY_VELOCITY,
                (
                    (CASE WHEN DUPLICATE_COUNT > 1 THEN {self.WEIGHT_DUPLICATE} ELSE 0 END) +
                    (CASE WHEN AMOUNT >= {self.HIGH_AMOUNT_THRESHOLD} THEN {self.WEIGHT_HIGH_AMOUNT} ELSE 0 END) +
                    (CASE WHEN DAILY_TRANSACTION_COUNT >= {self.DAILY_VELOCITY_THRESHOLD} THEN {self.WEIGHT_DAILY_VELOCITY} ELSE 0 END)
                ) AS RISK_SCORE
            FROM BASE
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
                WHEN AMOUNT >= {self.HIGH_AMOUNT_THRESHOLD} THEN 'High transaction amount'
                WHEN DAILY_TRANSACTION_COUNT >= {self.DAILY_VELOCITY_THRESHOLD} THEN 'Many transactions in one day'
                ELSE 'No rule triggered'
            END AS PRIMARY_RISK_REASON,
            TRIM(
                CASE WHEN DUPLICATE_COUNT > 1 THEN 'Possible duplicate transaction; ' ELSE '' END ||
                CASE WHEN AMOUNT >= {self.HIGH_AMOUNT_THRESHOLD} THEN 'High transaction amount; ' ELSE '' END ||
                CASE WHEN DAILY_TRANSACTION_COUNT >= {self.DAILY_VELOCITY_THRESHOLD} THEN 'Many transactions in one day; ' ELSE '' END,
                '; '
            ) AS ALL_RISK_REASONS
        FROM SCORED
        ORDER BY
            CASE WHEN RISK_SCORE > 0 THEN 0 ELSE 1 END,
            RISK_SCORE DESC,
            AMOUNT DESC;
        """
        cur = self.con.cursor()
        cur.execute(query)
        rows = cur.fetchall()

        results = []
        for r in rows:
            results.append(ScoredTransaction(
                transaction_id=r[0],
                account_id=r[1],
                amount=float(r[2]),
                transaction_time=str(r[3]),
                merchant=r[4],
                duplicate_count=int(r[5]),
                daily_transaction_count=int(r[6]),
                flag_duplicate=bool(r[7]),
                flag_high_amount=bool(r[8]),
                flag_daily_velocity=bool(r[9]),
                risk_score=int(r[10]),
                severity_level=r[11],
                risk_status=r[12],
                primary_risk_reason=r[13],
                all_risk_reasons=r[14] if r[14] else "No rule triggered"
            ))
        return results

    def get_summary_kpis(self) -> Dict[str, Any]:
        """Calculates executive fraud KPIs."""
        scored = self.analyze()
        total_txns = len(scored)
        total_amount = sum(s.amount for s in scored)

        review_txns = [s for s in scored if s.risk_status == 'REVIEW']
        normal_txns = [s for s in scored if s.risk_status == 'NORMAL']

        review_count = len(review_txns)
        normal_count = len(normal_txns)

        review_amount = sum(s.amount for s in review_txns)
        normal_amount = sum(s.amount for s in normal_txns)

        fraud_rate_txns = (review_count / total_txns * 100.0) if total_txns > 0 else 0.0
        fraud_rate_amount = (review_amount / total_amount * 100.0) if total_amount > 0 else 0.0

        return {
            "total_transactions": total_txns,
            "total_volume": total_amount,
            "review_count": review_count,
            "review_volume": review_amount,
            "normal_count": normal_count,
            "normal_volume": normal_amount,
            "flagged_txn_pct": fraud_rate_txns,
            "flagged_volume_pct": fraud_rate_amount,
            "severity_breakdown": {
                "CRITICAL": len([s for s in scored if s.severity_level == 'CRITICAL']),
                "HIGH": len([s for s in scored if s.severity_level == 'HIGH']),
                "MEDIUM": len([s for s in scored if s.severity_level == 'MEDIUM']),
                "LOW": len([s for s in scored if s.severity_level == 'LOW']),
                "NORMAL": len([s for s in scored if s.severity_level == 'NORMAL']),
            }
        }

    def close(self):
        self.con.close()
