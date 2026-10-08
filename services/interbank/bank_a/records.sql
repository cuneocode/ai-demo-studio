-- Bank A (Harbor Point Bank): synthetic settlement operations records.
-- Bank A BOUGHT the bond from Bank B and RECEIVES securities against payment (DVP).

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
  ('TRD-846', '2026-10-01', '2026-10-02', 'BUY', 'XS0000000846', 'Northwind Utilities 3.10% 2029', 2000000, 100.15, 'USD', 2003000.00, 'Bank B', 'MTBKUS33', 'SETTLED'),
  ('TRD-847', '2026-10-02', '2026-10-05', 'BUY', 'XS0000000847', 'Acme Industrial 4.25% 2031', 5000000, 99.42, 'USD', 4971000.00, 'Bank B', 'MTBKUS33', 'FAILED'),
  ('TRD-848', '2026-10-05', '2026-10-06', 'SELL', 'XS0000000848', 'Contoso Rail 5.00% 2034', 1000000, 101.03, 'USD', 1010300.00, 'Bank C', 'CBNKUS44', 'PENDING');

CREATE TABLE settlement_instructions (
  instruction_id TEXT PRIMARY KEY,
  trade_id TEXT,
  message_type TEXT,
  sent_at TEXT,
  our_safekeeping_account TEXT,
  counterparty_delivering_agent_bic TEXT,
  counterparty_safekeeping_account TEXT,
  counterparty_ssi_version_used TEXT,
  status TEXT
);

INSERT INTO settlement_instructions VALUES
  ('SI-A-846', 'TRD-846', 'MT541 receive against payment', '2026-10-01T15:20:00Z', 'HPB-CUST-22018', 'MTBKUS33', '4410-778', 'BANK-B-USD-FI-v2', 'SETTLED'),
  ('SI-A-847', 'TRD-847', 'MT541 receive against payment', '2026-10-02T16:10:00Z', 'HPB-CUST-22018', 'MTBKUS33', '4410-778', 'BANK-B-USD-FI-v2', 'UNMATCHED'),
  ('SI-A-848', 'TRD-848', 'MT543 deliver against payment', '2026-10-05T14:05:00Z', 'HPB-CUST-22018', 'CBNKUS44', '7720-115', 'BANK-C-USD-FI-v5', 'MATCHED');

CREATE TABLE counterparty_ssi (
  counterparty TEXT,
  ssi_version TEXT,
  asset_class TEXT,
  agent_bic TEXT,
  safekeeping_account TEXT,
  effective_from TEXT,
  effective_to TEXT,
  status TEXT
);

INSERT INTO counterparty_ssi VALUES
  ('Bank B', 'BANK-B-USD-FI-v1', 'USD fixed income', 'MTBKUS33', '4410-301', '2021-06-01', '2024-02-29', 'RETIRED'),
  ('Bank B', 'BANK-B-USD-FI-v2', 'USD fixed income', 'MTBKUS33', '4410-778', '2024-03-01', NULL, 'ACTIVE'),
  ('Bank C', 'BANK-C-USD-FI-v5', 'USD fixed income', 'CBNKUS44', '7720-115', '2025-01-15', NULL, 'ACTIVE');

CREATE TABLE settlement_status (
  trade_id TEXT,
  as_of TEXT,
  depository_status TEXT,
  reason_code TEXT,
  reason_text TEXT
);

INSERT INTO settlement_status VALUES
  ('TRD-847', '2026-10-05T20:00:00Z', 'UNMATCHED', 'CMIS',
   'No matching counterparty delivery instruction found for delivering agent MTBKUS33 account 4410-778.');

CREATE TABLE static_data_queue (
  item_id TEXT PRIMARY KEY,
  received_at TEXT,
  channel TEXT,
  sender_bic TEXT,
  reference TEXT,
  summary TEXT,
  status TEXT,
  assigned_team TEXT
);

INSERT INTO static_data_queue VALUES
  ('SDQ-5519', '2026-09-22T09:15:00Z', 'SWIFT MT599', 'CBNKUS44', 'C-NOTICE-0311', 'Bank C holiday calendar update for 2027.', 'COMPLETED', 'static-data-ops'),
  ('SDQ-5521', '2026-09-24T14:02:00Z', 'SWIFT MT599', 'MTBKUS33', 'SSI-CHG-2209',
   'Bank B notice: USD fixed income SSI changes to safekeeping account 4410-902 effective 2026-10-01. Account 4410-778 is closed for deliveries and receipts from that date.',
   'PENDING_REVIEW', 'static-data-ops');

CREATE TABLE cash_positions (
  account TEXT,
  currency TEXT,
  value_date TEXT,
  available_balance REAL,
  reserved_for TEXT
);

INSERT INTO cash_positions VALUES
  ('HPB-NOSTRO-USD-01', 'USD', '2026-10-05', 18250000.00, 'TRD-847 payment leg reserved and returned unused after the failed settlement'),
  ('HPB-NOSTRO-USD-01', 'USD', '2026-10-06', 18250000.00, NULL);
