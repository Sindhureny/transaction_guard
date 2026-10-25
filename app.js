/**
 * Transaction Guard - Real-Time In-Memory Detection Engine & Dashboard
 * Mirrors Exasol Analytic Window Functions in JavaScript.
 */

// ============================================================================
// 1. DEFAULT DATASET & ENGINE HEURISTICS
// ============================================================================

const DEFAULT_TRANSACTIONS = [
  { transaction_id: 'TXN001', account_id: 'ACC101', amount: 1200.00, transaction_time: '2026-10-25 09:00:00', merchant: 'BookStore' },
  { transaction_id: 'TXN002', account_id: 'ACC102', amount: 27000.00, transaction_time: '2026-10-25 09:15:00', merchant: 'Electronics' },
  { transaction_id: 'TXN003', account_id: 'ACC103', amount: 450.00, transaction_time: '2026-10-25 10:00:00', merchant: 'Cafe' },
  { transaction_id: 'TXN004', account_id: 'ACC103', amount: 450.00, transaction_time: '2026-10-25 10:05:00', merchant: 'Cafe' },
  { transaction_id: 'TXN005', account_id: 'ACC104', amount: 900.00, transaction_time: '2026-10-25 10:10:00', merchant: 'Pharmacy' },
  { transaction_id: 'TXN006', account_id: 'ACC104', amount: 700.00, transaction_time: '2026-10-25 10:20:00', merchant: 'Grocery' },
  { transaction_id: 'TXN007', account_id: 'ACC104', amount: 650.00, transaction_time: '2026-10-25 10:30:00', merchant: 'Fuel' },
  { transaction_id: 'TXN008', account_id: 'ACC104', amount: 800.00, transaction_time: '2026-10-25 10:40:00', merchant: 'OnlineShop' },
  { transaction_id: 'TXN009', account_id: 'ACC105', amount: 1500.00, transaction_time: '2026-10-25 11:00:00', merchant: 'Clothing' },
];

const PRESETS = {
  baseline: [...DEFAULT_TRANSACTIONS],
  high_value: [
    ...DEFAULT_TRANSACTIONS,
    { transaction_id: 'TXN010', account_id: 'ACC106', amount: 48500.00, transaction_time: '2026-10-25 12:30:00', merchant: 'DiamondJewelers' },
    { transaction_id: 'TXN011', account_id: 'ACC107', amount: 32000.00, transaction_time: '2026-10-25 13:00:00', merchant: 'LuxuryWatches' }
  ],
  duplicate_attack: [
    ...DEFAULT_TRANSACTIONS,
    { transaction_id: 'TXN012', account_id: 'ACC108', amount: 1850.00, transaction_time: '2026-10-25 14:00:00', merchant: 'CloudHosting' },
    { transaction_id: 'TXN013', account_id: 'ACC108', amount: 1850.00, transaction_time: '2026-10-25 14:02:00', merchant: 'CloudHosting' },
    { transaction_id: 'TXN014', account_id: 'ACC108', amount: 1850.00, transaction_time: '2026-10-25 14:05:00', merchant: 'CloudHosting' }
  ],
  velocity_burst: [
    ...DEFAULT_TRANSACTIONS,
    { transaction_id: 'TXN015', account_id: 'ACC109', amount: 120.00, transaction_time: '2026-10-25 15:00:00', merchant: 'Kiosk' },
    { transaction_id: 'TXN016', account_id: 'ACC109', amount: 140.00, transaction_time: '2026-10-25 15:10:00', merchant: 'MetroStation' },
    { transaction_id: 'TXN017', account_id: 'ACC109', amount: 95.00, transaction_time: '2026-10-25 15:20:00', merchant: 'CoffeeShop' },
    { transaction_id: 'TXN018', account_id: 'ACC109', amount: 110.00, transaction_time: '2026-10-25 15:30:00', merchant: 'VendingMachine' },
    { transaction_id: 'TXN019', account_id: 'ACC109', amount: 180.00, transaction_time: '2026-10-25 15:40:00', merchant: 'BookstoreExpress' }
  ],
  compound_threat: [
    ...DEFAULT_TRANSACTIONS,
    { transaction_id: 'TXN020', account_id: 'ACC110', amount: 35000.00, transaction_time: '2026-10-25 16:00:00', merchant: 'CryptoExchange' },
    { transaction_id: 'TXN021', account_id: 'ACC110', amount: 35000.00, transaction_time: '2026-10-25 16:03:00', merchant: 'CryptoExchange' }
  ],
  clean_only: [
    { transaction_id: 'TXN101', account_id: 'ACC201', amount: 45.00, transaction_time: '2026-10-25 08:30:00', merchant: 'Supermarket' },
    { transaction_id: 'TXN102', account_id: 'ACC202', amount: 120.00, transaction_time: '2026-10-25 09:15:00', merchant: 'Bakery' },
    { transaction_id: 'TXN103', account_id: 'ACC203', amount: 550.00, transaction_time: '2026-10-25 11:20:00', merchant: 'HomeDepot' },
    { transaction_id: 'TXN104', account_id: 'ACC204', amount: 89.00, transaction_time: '2026-10-25 13:45:00', merchant: 'Pharmacy' }
  ]
};

// SQL code snippets for explorer
const SQL_SNIPPETS = {
  v_suspicious: `-- VIEW 1: Core Detection Engine & Analytic Window Heuristics
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS AS
WITH BASE_METRICS AS (
    SELECT
        T.TRANSACTION_ID,
        T.ACCOUNT_ID,
        T.AMOUNT,
        T.TRANSACTION_TIME,
        T.MERCHANT,
        -- Window Function 1: Duplicate transaction counter within partition
        COUNT(*) OVER (
            PARTITION BY T.ACCOUNT_ID, T.AMOUNT, T.MERCHANT
        ) AS DUPLICATE_COUNT,
        -- Window Function 2: Daily transaction velocity counter
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
FROM SCORED;`,

  v_summary: `-- VIEW 2: Executive Summary by Risk Status & Severity
CREATE OR REPLACE VIEW TRANSACTIONGUARD.V_RISK_SUMMARY AS
SELECT
    RISK_STATUS,
    SEVERITY_LEVEL,
    COUNT(*) AS TRANSACTION_COUNT,
    SUM(AMOUNT) AS TOTAL_AMOUNT,
    ROUND(AVG(AMOUNT), 2) AS AVG_AMOUNT
FROM TRANSACTIONGUARD.V_SUSPICIOUS_TRANSACTIONS
GROUP BY RISK_STATUS, SEVERITY_LEVEL
ORDER BY CASE RISK_STATUS WHEN 'REVIEW' THEN 0 ELSE 1 END, TOTAL_AMOUNT DESC;`,

  v_account: `-- VIEW 3: Account Exposure Profile (Flagged Accounts)
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
ORDER BY VOLUME_AT_RISK DESC, TOTAL_TXNS DESC;`,

  v_query: `-- MAIN REVIEW QUEUE QUERY
-- Priority Compliance Review Queue sorted by highest risk first
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
    AMOUNT DESC;`,

  full_script: `-- TRANSACTION GUARD MASTER SCRIPT
-- Tested on Exasol In-Memory OLAP Database & Standard ANSI SQL
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

-- Idempotent Demo Seed Data
TRUNCATE TABLE TRANSACTIONGUARD.TRANSACTIONS;
INSERT INTO TRANSACTIONGUARD.TRANSACTIONS VALUES
    ('TXN001', 'ACC101', 1200.00, TIMESTAMP '2026-10-25 09:00:00', 'BookStore'),
    ('TXN002', 'ACC102', 27000.00, TIMESTAMP '2026-10-25 09:15:00', 'Electronics'),
    ('TXN003', 'ACC103', 450.00, TIMESTAMP '2026-10-25 10:00:00', 'Cafe'),
    ('TXN004', 'ACC103', 450.00, TIMESTAMP '2026-10-25 10:05:00', 'Cafe'),
    ('TXN005', 'ACC104', 900.00, TIMESTAMP '2026-10-25 10:10:00', 'Pharmacy'),
    ('TXN006', 'ACC104', 700.00, TIMESTAMP '2026-10-25 10:20:00', 'Grocery'),
    ('TXN007', 'ACC104', 650.00, TIMESTAMP '2026-10-25 10:30:00', 'Fuel'),
    ('TXN008', 'ACC104', 800.00, TIMESTAMP '2026-10-25 10:40:00', 'OnlineShop'),
    ('TXN009', 'ACC105', 1500.00, TIMESTAMP '2026-10-25 11:00:00', 'Clothing');
COMMIT;`
};

// ============================================================================
// 2. DETECTION ENGINE (ANALYTIC WINDOW FUNCTIONS IN JAVASCRIPT)
// ============================================================================

class TransactionGuardEngine {
  constructor(txns = []) {
    this.rawTransactions = JSON.parse(JSON.stringify(txns));
    this.scoredTransactions = [];
  }

  setTransactions(txns) {
    this.rawTransactions = JSON.parse(JSON.stringify(txns));
    return this.evaluate();
  }

  addTransaction(txn) {
    this.rawTransactions.push(txn);
    return this.evaluate();
  }

  evaluate() {
    const HIGH_AMOUNT_THRESHOLD = 25000.00;
    const DAILY_VELOCITY_THRESHOLD = 4;
    const WEIGHT_HIGH_AMOUNT = 40;
    const WEIGHT_DUPLICATE = 35;
    const WEIGHT_DAILY_VELOCITY = 25;

    // Window Partition 1: COUNT(*) OVER (PARTITION BY ACCOUNT_ID, AMOUNT, MERCHANT)
    const duplicateCounts = {};
    // Window Partition 2: COUNT(*) OVER (PARTITION BY ACCOUNT_ID, DATE(TRANSACTION_TIME))
    const velocityCounts = {};

    this.rawTransactions.forEach(t => {
      const amtFixed = Number(t.amount).toFixed(2);
      const dupKey = `${t.account_id}__${amtFixed}__${t.merchant.toLowerCase()}`;
      duplicateCounts[dupKey] = (duplicateCounts[dupKey] || 0) + 1;

      const datePart = t.transaction_time.split(' ')[0] || t.transaction_time.split('T')[0];
      const velKey = `${t.account_id}__${datePart}`;
      velocityCounts[velKey] = (velocityCounts[velKey] || 0) + 1;
    });

    this.scoredTransactions = this.rawTransactions.map(t => {
      const amountNum = parseFloat(t.amount);
      const amtFixed = amountNum.toFixed(2);
      const dupKey = `${t.account_id}__${amtFixed}__${t.merchant.toLowerCase()}`;
      const datePart = t.transaction_time.split(' ')[0] || t.transaction_time.split('T')[0];
      const velKey = `${t.account_id}__${datePart}`;

      const duplicateCount = duplicateCounts[dupKey] || 1;
      const dailyVelocityCount = velocityCounts[velKey] || 1;

      const flagDuplicate = duplicateCount > 1;
      const flagHighAmount = amountNum >= HIGH_AMOUNT_THRESHOLD;
      const flagDailyVelocity = dailyVelocityCount >= DAILY_VELOCITY_THRESHOLD;

      const riskScore =
        (flagDuplicate ? WEIGHT_DUPLICATE : 0) +
        (flagHighAmount ? WEIGHT_HIGH_AMOUNT : 0) +
        (flagDailyVelocity ? WEIGHT_DAILY_VELOCITY : 0);

      let severityLevel = 'NORMAL';
      if (riskScore >= 65) severityLevel = 'CRITICAL';
      else if (riskScore >= 35) severityLevel = 'HIGH';
      else if (riskScore >= 25) severityLevel = 'MEDIUM';
      else if (riskScore > 0) severityLevel = 'LOW';

      const riskStatus = riskScore > 0 ? 'REVIEW' : 'NORMAL';

      let primaryReason = 'No rule triggered';
      if (flagDuplicate) primaryReason = 'Possible duplicate transaction';
      else if (flagHighAmount) primaryReason = 'High transaction amount';
      else if (flagDailyVelocity) primaryReason = 'Many transactions in one day';

      const reasons = [];
      if (flagDuplicate) reasons.push('Possible duplicate transaction');
      if (flagHighAmount) reasons.push('High transaction amount');
      if (flagDailyVelocity) reasons.push('Many transactions in one day');

      const allReasons = reasons.length > 0 ? reasons.join('; ') : 'No rule triggered';

      return {
        ...t,
        amount: amountNum,
        duplicate_count: duplicateCount,
        daily_transaction_count: dailyVelocityCount,
        flag_duplicate: flagDuplicate,
        flag_high_amount: flagHighAmount,
        flag_daily_velocity: flagDailyVelocity,
        risk_score: riskScore,
        severity_level: severityLevel,
        risk_status: riskStatus,
        primary_risk_reason: primaryReason,
        all_risk_reasons: allReasons,
        reasons_list: reasons
      };
    });

    // Sort order: REVIEW first, then highest RISK_SCORE desc, then AMOUNT desc
    this.scoredTransactions.sort((a, b) => {
      const aReview = a.risk_status === 'REVIEW' ? 0 : 1;
      const bReview = b.risk_status === 'REVIEW' ? 0 : 1;
      if (aReview !== bReview) return aReview - bReview;
      if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
      return b.amount - a.amount;
    });

    return this.scoredTransactions;
  }

  getKPIs() {
    const totalTxns = this.scoredTransactions.length;
    const totalVolume = this.scoredTransactions.reduce((acc, t) => acc + t.amount, 0);

    const reviewTxns = this.scoredTransactions.filter(t => t.risk_status === 'REVIEW');
    const normalTxns = this.scoredTransactions.filter(t => t.risk_status === 'NORMAL');

    const reviewVolume = reviewTxns.reduce((acc, t) => acc + t.amount, 0);
    const normalVolume = normalTxns.reduce((acc, t) => acc + t.amount, 0);

    const flaggedTxnPct = totalTxns > 0 ? (reviewTxns.length / totalTxns * 100) : 0;
    const flaggedVolPct = totalVolume > 0 ? (reviewVolume / totalVolume * 100) : 0;
    const normalVolPct = totalVolume > 0 ? (normalVolume / totalVolume * 100) : 0;

    const severityBreakdown = {
      CRITICAL: this.scoredTransactions.filter(t => t.severity_level === 'CRITICAL').length,
      HIGH: this.scoredTransactions.filter(t => t.severity_level === 'HIGH').length,
      MEDIUM: this.scoredTransactions.filter(t => t.severity_level === 'MEDIUM').length,
      LOW: this.scoredTransactions.filter(t => t.severity_level === 'LOW').length,
      NORMAL: this.scoredTransactions.filter(t => t.severity_level === 'NORMAL').length
    };

    return {
      totalTxns,
      totalVolume,
      reviewCount: reviewTxns.length,
      reviewVolume,
      normalCount: normalTxns.length,
      normalVolume,
      flaggedTxnPct,
      flaggedVolPct,
      normalVolPct,
      severityBreakdown
    };
  }
}

// ============================================================================
// 3. UI STATE & INTERACTION CONTROLLER
// ============================================================================

const engine = new TransactionGuardEngine(DEFAULT_TRANSACTIONS);
engine.evaluate();

let currentFilterSeverity = 'ALL';
let currentFilterRule = 'ALL';
let currentSearchQuery = '';

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function renderKPIs() {
  const kpis = engine.getKPIs();
  document.getElementById('kpiTotalTxns').textContent = kpis.totalTxns;
  document.getElementById('kpiTotalVolume').textContent = formatCurrency(kpis.totalVolume);
  document.getElementById('kpiFlaggedTxns').textContent = `${kpis.reviewCount} (${kpis.flaggedTxnPct.toFixed(1)}%)`;
  document.getElementById('kpiFlaggedVol').textContent = `${formatCurrency(kpis.reviewVolume)} (${kpis.flaggedVolPct.toFixed(1)}%)`;
  document.getElementById('kpiNormalVol').textContent = `${formatCurrency(kpis.normalVolume)} (${kpis.normalVolPct.toFixed(1)}%)`;

  const critCount = kpis.severityBreakdown.CRITICAL;
  const highCount = kpis.severityBreakdown.HIGH;
  const medCount = kpis.severityBreakdown.MEDIUM;
  document.getElementById('kpiActiveTriggers').textContent = `${critCount + highCount + medCount} Anomalies`;
}

function renderTable() {
  const tbody = document.getElementById('ledgerTableBody');
  tbody.innerHTML = '';

  const filtered = engine.scoredTransactions.filter(t => {
    // Severity filter
    if (currentFilterSeverity !== 'ALL') {
      if (currentFilterSeverity === 'REVIEW' && t.risk_status !== 'REVIEW') return false;
      if (currentFilterSeverity !== 'REVIEW' && t.severity_level !== currentFilterSeverity) return false;
    }

    // Rule filter
    if (currentFilterRule === 'DUP' && !t.flag_duplicate) return false;
    if (currentFilterRule === 'HIGH' && !t.flag_high_amount) return false;
    if (currentFilterRule === 'VEL' && !t.flag_daily_velocity) return false;
    if (currentFilterRule === 'CLEAN' && t.risk_status !== 'NORMAL') return false;

    // Search query
    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      const match =
        t.transaction_id.toLowerCase().includes(q) ||
        t.account_id.toLowerCase().includes(q) ||
        t.merchant.toLowerCase().includes(q) ||
        t.all_risk_reasons.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  document.getElementById('tableCountDisplay').textContent = `Showing ${filtered.length} of ${engine.scoredTransactions.length} transactions`;

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="9" style="text-align:center; padding: 40px; color: var(--text-dim);">No transactions match the selected filters.</td>`;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(t => {
    const tr = document.createElement('tr');
    if (t.severity_level === 'CRITICAL') tr.classList.add('row-critical');
    if (t.severity_level === 'HIGH') tr.classList.add('row-high');

    // Severity color
    let barColor = 'var(--norm-color)';
    if (t.severity_level === 'CRITICAL') barColor = 'var(--crit-color)';
    else if (t.severity_level === 'HIGH') barColor = 'var(--high-color)';
    else if (t.severity_level === 'MEDIUM') barColor = 'var(--med-color)';

    // Rule pills
    let rulePills = '';
    if (t.flag_duplicate) rulePills += `<span class="rule-pill highlight">Duplicate (${t.duplicate_count})</span>`;
    if (t.flag_high_amount) rulePills += `<span class="rule-pill highlight">High Value</span>`;
    if (t.flag_daily_velocity) rulePills += `<span class="rule-pill highlight">Daily Velocity (${t.daily_transaction_count})</span>`;
    if (!rulePills) rulePills = `<span class="rule-pill">Normal Processed</span>`;

    tr.innerHTML = `
      <td class="mono-cell">${t.transaction_id}</td>
      <td style="font-weight: 500;">${t.account_id}</td>
      <td style="color: var(--text-muted); font-size: 0.8rem;">${t.transaction_time}</td>
      <td><strong>${t.merchant}</strong></td>
      <td class="amount-cell">${formatCurrency(t.amount)}</td>
      <td>
        <div class="score-cell">
          <span class="score-num" style="color: ${barColor}">${t.risk_score}</span>
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width: ${t.risk_score}%; background: ${barColor};"></div>
          </div>
        </div>
      </td>
      <td><span class="badge-severity ${t.severity_level.toLowerCase()}">${t.severity_level}</span></td>
      <td>
        <span class="badge-status ${t.risk_status.toLowerCase()}">${t.risk_status}</span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="openInspector('${t.transaction_id}')">
          🔍 Inspect
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderProfiles() {
  // Account Profile
  const accountMap = {};
  engine.scoredTransactions.forEach(t => {
    if (!accountMap[t.account_id]) {
      accountMap[t.account_id] = { total: 0, flagged: 0, volume: 0, riskVol: 0, maxScore: 0 };
    }
    const acc = accountMap[t.account_id];
    acc.total += 1;
    acc.volume += t.amount;
    if (t.risk_status === 'REVIEW') {
      acc.flagged += 1;
      acc.riskVol += t.amount;
    }
    if (t.risk_score > acc.maxScore) acc.maxScore = t.risk_score;
  });

  const accountRows = Object.keys(accountMap).map(id => ({ id, ...accountMap[id] }));
  accountRows.sort((a, b) => b.riskVol - a.riskVol || b.total - a.total);

  const accBody = document.getElementById('accountProfileBody');
  accBody.innerHTML = '';
  accountRows.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono-cell"><strong>${a.id}</strong></td>
      <td>${a.total}</td>
      <td><span class="${a.flagged > 0 ? 'rule-pill highlight' : 'rule-pill'}">${a.flagged}</span></td>
      <td>${formatCurrency(a.volume)}</td>
      <td style="font-weight: 600; color: ${a.riskVol > 0 ? 'var(--crit-color)' : 'var(--norm-color)'}">
        ${formatCurrency(a.riskVol)}
      </td>
      <td><span class="score-num" style="color: ${a.maxScore >= 65 ? 'var(--crit-color)' : a.maxScore >= 35 ? 'var(--high-color)' : a.maxScore >= 25 ? 'var(--med-color)' : 'var(--norm-color)'}">${a.maxScore}</span></td>
    `;
    accBody.appendChild(tr);
  });

  // Merchant Profile
  const merchantMap = {};
  engine.scoredTransactions.forEach(t => {
    if (!merchantMap[t.merchant]) {
      merchantMap[t.merchant] = { count: 0, flagged: 0, volume: 0, dupes: 0 };
    }
    const m = merchantMap[t.merchant];
    m.count += 1;
    m.volume += t.amount;
    if (t.risk_status === 'REVIEW') m.flagged += 1;
    if (t.flag_duplicate) m.dupes += 1;
  });

  const merchantRows = Object.keys(merchantMap).map(m => ({ name: m, ...merchantMap[m] }));
  merchantRows.sort((a, b) => b.flagged - a.flagged || b.volume - a.volume);

  const merchBody = document.getElementById('merchantProfileBody');
  merchBody.innerHTML = '';
  merchantRows.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${m.name}</strong></td>
      <td>${m.count}</td>
      <td><span class="${m.flagged > 0 ? 'rule-pill highlight' : 'rule-pill'}">${m.flagged}</span></td>
      <td>${m.dupes > 0 ? `<span class="rule-pill highlight">${m.dupes}</span>` : '0'}</td>
      <td>${formatCurrency(m.volume)}</td>
    `;
    merchBody.appendChild(tr);
  });
}

function updateAllViews() {
  renderKPIs();
  renderTable();
  renderProfiles();
}

// ============================================================================
// 4. INSPECTION MODAL DIALOG
// ============================================================================

window.openInspector = function(txnId) {
  const txn = engine.scoredTransactions.find(t => t.transaction_id === txnId);
  if (!txn) return;

  const modal = document.getElementById('inspectorModal');
  document.getElementById('modalTxnId').textContent = `${txn.transaction_id} — Detailed Analytics`;

  const body = document.getElementById('modalDetailsBody');
  body.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 14px 18px; border-radius: var(--radius-sm);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Target Account</div>
        <div style="font-family: var(--font-mono); font-size: 1.1rem; color: #38bdf8; font-weight: 700;">${txn.account_id}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Amount</div>
        <div style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${formatCurrency(txn.amount)}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Risk Score</div>
        <div style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 800; color: ${txn.risk_score >= 65 ? 'var(--crit-color)' : txn.risk_score >= 35 ? 'var(--high-color)' : txn.risk_score >= 25 ? 'var(--med-color)' : 'var(--norm-color)'};">${txn.risk_score} / 100</div>
      </div>
    </div>

    <div>
      <div style="font-size: 0.8rem; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; color: var(--text-muted);">Analytic Window Function Evaluations:</div>
      <div class="heuristic-breakdown">
        <div class="heuristic-item">
          <div class="heuristic-name">
            <span>${txn.flag_duplicate ? '🚨' : '✅'}</span>
            <div>
              <strong>RULE_01: Duplicate Charge Detection</strong><br/>
              <span style="font-size: 0.72rem; color: var(--text-dim);">COUNT(*) OVER (PARTITION BY Account, Amount, Merchant)</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="heuristic-points" style="color: ${txn.flag_duplicate ? 'var(--high-color)' : 'var(--text-dim)'};">${txn.flag_duplicate ? '+35 pts' : '0 pts'}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${txn.duplicate_count} matches</div>
          </div>
        </div>

        <div class="heuristic-item">
          <div class="heuristic-name">
            <span>${txn.flag_high_amount ? '🚨' : '✅'}</span>
            <div>
              <strong>RULE_02: High-Value Anomaly Spike</strong><br/>
              <span style="font-size: 0.72rem; color: var(--text-dim);">Predicate: Amount >= $25,000.00</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="heuristic-points" style="color: ${txn.flag_high_amount ? 'var(--crit-color)' : 'var(--text-dim)'};">${txn.flag_high_amount ? '+40 pts' : '0 pts'}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${txn.amount >= 25000 ? 'Threshold breached' : 'Below threshold'}</div>
          </div>
        </div>

        <div class="heuristic-item">
          <div class="heuristic-name">
            <span>${txn.flag_daily_velocity ? '🚨' : '✅'}</span>
            <div>
              <strong>RULE_03: Daily Transaction Velocity</strong><br/>
              <span style="font-size: 0.72rem; color: var(--text-dim);">COUNT(*) OVER (PARTITION BY Account, Date) >= 4</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="heuristic-points" style="color: ${txn.flag_daily_velocity ? 'var(--med-color)' : 'var(--text-dim)'};">${txn.flag_daily_velocity ? '+25 pts' : '0 pts'}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${txn.daily_transaction_count} txns today</div>
          </div>
        </div>
      </div>
    </div>

    <div style="background: rgba(15, 23, 42, 0.7); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
      <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Compliance Adjudication Summary</div>
      <div style="font-size: 0.85rem; color: #e2e8f0; margin-top: 4px;">
        <strong>Severity:</strong> <span class="badge-severity ${txn.severity_level.toLowerCase()}">${txn.severity_level}</span> &nbsp;|&nbsp;
        <strong>Status:</strong> <span class="badge-status ${txn.risk_status.toLowerCase()}">${txn.risk_status}</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;">
        <strong>Triggered Reasons:</strong> ${txn.all_risk_reasons}
      </div>
    </div>
  `;

  modal.showModal();
};

window.closeInspector = function() {
  document.getElementById('inspectorModal').close();
};

// ============================================================================
// 5. SIMULATOR & PRESET MANAGEMENT
// ============================================================================

function evaluateSimulatorForm() {
  const acc = document.getElementById('simAccount').value.trim() || 'ACC_TEST';
  const amt = parseFloat(document.getElementById('simAmount').value) || 0;
  const merch = document.getElementById('simMerchant').value.trim() || 'GenericMerchant';
  const dt = document.getElementById('simDateTime').value.replace('T', ' ') || '2026-10-25 12:00:00';

  // Temporary test engine with current ledger + new candidate transaction
  const candidate = {
    transaction_id: 'CANDIDATE_' + Math.floor(Math.random() * 900 + 100),
    account_id: acc,
    amount: amt,
    merchant: merch,
    transaction_time: dt
  };

  const testList = [...engine.rawTransactions, candidate];
  const testEngine = new TransactionGuardEngine(testList);
  const scored = testEngine.evaluate();
  const res = scored.find(t => t.transaction_id === candidate.transaction_id);

  // Update Simulator preview card
  const scoreEl = document.getElementById('simScoreVal');
  scoreEl.textContent = res.risk_score;
  scoreEl.style.color = res.risk_score >= 65 ? 'var(--crit-color)' : res.risk_score >= 35 ? 'var(--high-color)' : res.risk_score >= 25 ? 'var(--med-color)' : 'var(--norm-color)';

  const sevEl = document.getElementById('simSeverityBadge');
  sevEl.className = `badge-severity ${res.severity_level.toLowerCase()}`;
  sevEl.textContent = res.severity_level;

  const statEl = document.getElementById('simStatusBadge');
  statEl.className = `badge-status ${res.risk_status.toLowerCase()}`;
  statEl.textContent = res.risk_status;

  document.getElementById('simDupMatch').textContent = `${res.duplicate_count} in partition (${res.flag_duplicate ? '+35 pts' : '0 pts'})`;
  document.getElementById('simHighMatch').textContent = `${res.amount >= 25000 ? 'Triggered (+40 pts)' : 'Under threshold'}`;
  document.getElementById('simVelMatch').textContent = `${res.daily_transaction_count} txns today (${res.flag_daily_velocity ? '+25 pts' : '0 pts'})`;
  document.getElementById('simReasonDisplay').textContent = res.all_risk_reasons;

  return candidate;
}

// Add transaction to active ledger
window.addSimulatedTransaction = function() {
  const candidate = evaluateSimulatorForm();
  candidate.transaction_id = 'TXN' + String(engine.rawTransactions.length + 1).padStart(3, '0');
  engine.addTransaction(candidate);
  updateAllViews();
  showToast(`Transaction ${candidate.transaction_id} added to in-memory ledger!`);
};

// Preset Scenario Loader
window.loadPreset = function(presetKey) {
  if (PRESETS[presetKey]) {
    engine.setTransactions(PRESETS[presetKey]);
    updateAllViews();
    showToast(`Loaded scenario: ${presetKey.toUpperCase().replace('_', ' ')}`);
  }
};

window.resetBaseline = function() {
  engine.setTransactions(DEFAULT_TRANSACTIONS);
  updateAllViews();
  showToast('Reset to default benchmark dataset.');
};

// ============================================================================
// 6. SQL EXPLORER & COPY ACTIONS
// ============================================================================

window.selectSqlTab = function(key, btn) {
  document.querySelectorAll('.sql-nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const codeEl = document.getElementById('sqlCodeDisplay');
  codeEl.textContent = SQL_SNIPPETS[key] || '';
  document.getElementById('sqlSnippetTitle').textContent = key.toUpperCase() + ' (EXASOL ANSI SQL)';
};

window.copyActiveSql = function() {
  const code = document.getElementById('sqlCodeDisplay').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('SQL script copied to clipboard!');
  });
};

// ============================================================================
// 7. EXPORT COMPLIANCE AUDIT
// ============================================================================

window.exportReviewQueueCSV = function() {
  const rows = engine.scoredTransactions.filter(t => t.risk_status === 'REVIEW');
  const headers = ['TRANSACTION_ID', 'ACCOUNT_ID', 'AMOUNT', 'TRANSACTION_TIME', 'MERCHANT', 'RISK_SCORE', 'SEVERITY_LEVEL', 'ALL_RISK_REASONS'];
  const csvContent = [
    headers.join(','),
    ...rows.map(r => [
      r.transaction_id,
      r.account_id,
      r.amount.toFixed(2),
      `"${r.transaction_time}"`,
      `"${r.merchant}"`,
      r.risk_score,
      r.severity_level,
      `"${r.all_risk_reasons}"`
    ].join(','))
  ].join('\n');

  downloadFile('transaction_guard_review_queue.csv', 'text/csv', csvContent);
  showToast('Exported review queue CSV.');
};

window.exportAuditJSON = function() {
  const jsonContent = JSON.stringify({
    timestamp: new Date().toISOString(),
    kpis: engine.getKPIs(),
    transactions: engine.scoredTransactions
  }, null, 2);

  downloadFile('transaction_guard_audit_log.json', 'application/json', jsonContent);
  showToast('Exported full audit log JSON.');
};

function downloadFile(filename, type, data) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Toast notification helper
function showToast(message) {
  const toast = document.getElementById('toastNotice');
  toast.querySelector('.toast-msg').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================================================
// 8. EVENT LISTENERS & INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Navigation tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add('active');
    });
  });

  // Table Filters
  document.getElementById('filterSeverity').addEventListener('change', (e) => {
    currentFilterSeverity = e.target.value;
    renderTable();
  });

  document.getElementById('filterRule').addEventListener('change', (e) => {
    currentFilterRule = e.target.value;
    renderTable();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderTable();
  });

  // Simulator live input listener
  ['simAccount', 'simAmount', 'simMerchant', 'simDateTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', evaluateSimulatorForm);
  });

  // Initial render
  updateAllViews();
  evaluateSimulatorForm();

  // Set default SQL snippet
  const defaultSqlBtn = document.querySelector('.sql-nav-item');
  if (defaultSqlBtn) selectSqlTab('v_suspicious', defaultSqlBtn);
});
