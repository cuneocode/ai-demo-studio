-- Bank B (Meridian Trust): synthetic settlement operations records.
-- Bank B SOLD the bond to Bank A and DELIVERS securities against payment (DVP).

CREATE TABLE trades (
  trade_id TEXT PRIMARY KEY,
  trade_date TEXT,
  intended_settlement_date TEXT,
  side TEXT,
  isin TEXT,
  security TEXT,
  nominal INTEGER,
  price REAL,
  currency TEXT,
  settlement_amount REAL,
  counterparty TEXT,
  counterparty_bic TEXT,
  status TEXT
);

INSERT INTO trades VALUES
  ('TRD-846', '2026-10-01', '2026-10-02', 'SELL', 'XS0000000846', 'Northwind Utilities 3.10% 2029', 2000000, 100.15, 'USD', 2003000.00, 'Bank A', 'HPBKUS33', 'SETTLED'),
  ('TRD-847', '2026-10-02', '2026-10-05', 'SELL', 'XS0000000847', 'Acme Industrial 4.25% 2031', 5000000, 99.42, 'USD', 4971000.00, 'Bank A', 'HPBKUS33', 'FAILED');

CREATE TABLE settlement_instructions (
  instruction_id TEXT PRIMARY KEY,
  trade_id TEXT,
  message_type TEXT,
  sent_at TEXT,
  our_ssi_version TEXT,
  our_safekeeping_account TEXT,
  counterparty_receiving_agent_bic TEXT,
  counterparty_safekeeping_account TEXT,
  status TEXT
);

INSERT INTO settlement_instructions VALUES
  ('SI-B-846', 'TRD-846', 'MT543 deliver against payment', '2026-10-01T14:55:00Z', 'BANK-B-USD-FI-v2', '4410-778', 'HPBKUS33', 'HPB-CUST-22018', 'SETTLED'),
  ('SI-B-847', 'TRD-847', 'MT543 deliver against payment', '2026-10-02T15:40:00Z', 'BANK-B-USD-FI-v3', '4410-902', 'HPBKUS33', 'HPB-CUST-22018', 'UNMATCHED');

CREATE TABLE own_ssi (
  ssi_version TEXT,
  asset_class TEXT,
  agent_bic TEXT,
  safekeeping_account TEXT,
  effective_from TEXT,
  effective_to TEXT,
  status TEXT
);

INSERT INTO own_ssi VALUES
  ('BANK-B-USD-FI-v2', 'USD fixed income', 'MTBKUS33', '4410-778', '2024-03-01', '2026-09-30', 'RETIRED'),
  ('BANK-B-USD-FI-v3', 'USD fixed income', 'MTBKUS33', '4410-902', '2026-10-01', NULL, 'ACTIVE');

CREATE TABLE outbound_notices (
  reference TEXT PRIMARY KEY,
  sent_at TEXT,
  channel TEXT,
  recipient TEXT,
  recipient_bic TEXT,
  summary TEXT,
  acknowledgement TEXT
);

INSERT INTO outbound_notices VALUES
  ('SSI-CHG-2209', '2026-09-24T14:00:00Z', 'SWIFT MT599', 'Bank A', 'HPBKUS33',
   'USD fixed income SSI changes to safekeeping account 4410-902 effective 2026-10-01; 4410-778 closed.', 'NOT_RECEIVED'),
  ('SSI-CHG-2210', '2026-09-24T14:00:00Z', 'SWIFT MT599', 'Bank C', 'CBNKUS44',
   'USD fixed income SSI changes to safekeeping account 4410-902 effective 2026-10-01; 4410-778 closed.', 'ACKNOWLEDGED 2026-09-25');

CREATE TABLE settlement_status (
  trade_id TEXT,
  as_of TEXT,
  depository_status TEXT,
  reason_code TEXT,
  reason_text TEXT
);

INSERT INTO settlement_status VALUES
  ('TRD-847', '2026-10-05T20:00:00Z', 'UNMATCHED', 'CMIS',
   'No matching counterparty receipt instruction found for our delivery from account 4410-902 to HPBKUS33 HPB-CUST-22018.');

CREATE TABLE securities_positions (
  safekeeping_account TEXT,
  isin TEXT,
  as_of TEXT,
  nominal_available INTEGER,
  earmarked_for TEXT
);

INSERT INTO securities_positions VALUES
  ('4410-902', 'XS0000000847', '2026-10-05', 5000000, 'TRD-847 delivery'),
  ('4410-778', 'XS0000000847', '2026-10-05', 0, 'Account closed 2026-09-30');

CREATE TABLE fail_penalties (
  trade_id TEXT,
  first_fail_date TEXT,
  estimated_daily_penalty_usd REAL,
  basis TEXT
);

INSERT INTO fail_penalties VALUES
  ('TRD-847', '2026-10-05', 248.55, 'Synthetic estimate: 0.5 bp of settlement amount per business day of fail');
