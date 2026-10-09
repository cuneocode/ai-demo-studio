# Common point of purchase (CPP)

Synthetic playbook for the studio demo. Not a bank's procedure.

## Signals
- Several cards with no shared history transacted at one merchant, then later reported fraud.
- The scored card's own history is clean; the risk comes from the merchant's neighborhood.
- A merchant dispute ratio near or above card-network monitoring levels (around 0.9–1%) is a supporting signal, not proof.

## Response
- Contact the customer to confirm the purchase before the payment settles.
- If the customer does not recognise it: block the card and reissue with a new number.
- Flag the merchant for CPP review so the fraud strategy team can assess the other cards seen there.
- Proactive reissue of other exposed cards needs an analyst decision; it affects customers who have not reported anything.

## Customer contact
- Verify identity through the bank's standard channel. Never ask for the full card number or SSN.
- Explain that the bank noticed unusual activity at a merchant, not that the customer did anything wrong.
