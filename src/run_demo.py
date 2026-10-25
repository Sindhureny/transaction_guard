"""
Transaction Guard - Live Demonstration CLI
Runs the suspicious transaction detection engine on demo data and outputs a formatted report.
"""

import sys
import os

# Set UTF-8 encoding for stdout on Windows if available
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure src can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.transaction_guard import TransactionGuardEngine


def render_banner():
    banner = """
========================================================================================
   [+] TRANSACTION GUARD - SUSPICIOUS TRANSACTION DETECTION ENGINE [+]
========================================================================================
   Platform: Exasol In-Memory Analytic Database & ANSI SQL Analytics
   Rules:
     [1] Duplicate Transaction Detection (Account + Amount + Merchant Match)
     [2] High-Value Spike Alert (Amount >= $25,000.00)
     [3] High Daily Velocity (>= 4 Transactions on Same Date)
========================================================================================
"""
    print(banner)


def render_table(scored_txns):
    header = f"{'TXN ID':<8} | {'ACC ID':<8} | {'AMOUNT ($)':<12} | {'MERCHANT':<14} | {'SCORE':<5} | {'SEVERITY':<8} | {'STATUS':<7} | {'RISK REASONS'}"
    divider = "-" * len(header)
    print(header)
    print(divider)

    for t in scored_txns:
        severity_marker = {
            'CRITICAL': '[CRIT]',
            'HIGH':     '[HIGH]',
            'MEDIUM':   '[MED] ',
            'LOW':      '[LOW] ',
            'NORMAL':   '[OK]  '
        }.get(t.severity_level, '      ')

        status_str = "REVIEW" if t.risk_status == "REVIEW" else "NORMAL"
        print(f"{t.transaction_id:<8} | {t.account_id:<8} | {t.amount:>12,.2f} | {t.merchant:<14} | {t.risk_score:>5} | {severity_marker:<8} | {status_str:<7} | {t.all_risk_reasons}")
    print(divider)


def render_summary(kpis):
    print("\n----------------------------------------------------------------------------------------")
    print(" [i] EXECUTIVE RISK & COMPLIANCE SUMMARY")
    print("----------------------------------------------------------------------------------------")
    print(f" Total Transactions Processed : {kpis['total_transactions']}")
    print(f" Total Financial Volume       : ${kpis['total_volume']:,.2f}")
    print(f" Transactions Under Review    : {kpis['review_count']} ({kpis['flagged_txn_pct']:.1f}%)")
    print(f" Financial Volume at Risk     : ${kpis['review_volume']:,.2f} ({kpis['flagged_volume_pct']:.1f}%)")
    print(f" Normal / Cleared Volume      : ${kpis['normal_volume']:,.2f} ({100 - kpis['flagged_volume_pct']:.1f}%)")
    print(" Severity Breakdown           :")
    for sev, count in kpis['severity_breakdown'].items():
        print(f"    - {sev:<8}: {count} transaction(s)")
    print("----------------------------------------------------------------------------------------\n")


def main():
    render_banner()
    engine = TransactionGuardEngine()
    print("Loading sample transactions into detection engine...")
    engine.load_default_sample_data()

    print("Executing rule evaluation & scoring algorithms...\n")
    scored = engine.analyze()
    render_table(scored)

    kpis = engine.get_summary_kpis()
    render_summary(kpis)

    engine.close()


if __name__ == '__main__':
    main()
