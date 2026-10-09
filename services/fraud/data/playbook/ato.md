# Account takeover (ATO)

Synthetic playbook for the studio demo. Not a bank's procedure.

## Signals
- Account changes in quick succession: new device, contact or address change, card reissue request.
- A high-value card-not-present purchase shortly after the changes.
- These are account events. A payment graph model does not see them; rules and device intelligence do.

## Response
- Freeze card-not-present spending and the pending reissue.
- Reverse the address change until the customer is verified on a number already on file.
- Escalate to investigations if the customer confirms they did not make the changes.

## Customer contact
- Call the phone number on file before the change, not the new one.
