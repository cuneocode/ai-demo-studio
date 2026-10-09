# General alert handling

Synthetic playbook for the studio demo. Not a bank's procedure.

## Signals
- Amount well above the card's typical spend, a first purchase at a merchant, or card-not-present channel.

## Response
- Low risk: no action; keep monitoring.
- Elevated risk: verify with the customer before the payment settles.
- High risk: contact the customer, then block and reissue if they do not recognise the purchase.

## Customer contact
- Use the standard verification script. Never ask for the full card number or SSN.
