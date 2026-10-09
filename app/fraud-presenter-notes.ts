/** Presenter-only talk track per fraud case (services/fraud/data/cases.json ids). Never rendered to the audience. */
export const fraudPresenterHints: Record<string, string> = {
  "txn-clean-pos": "A clean local purchase. The merchant's network should read as protective.",
  "txn-compromised-merchant": "The graph story: a clean customer at a common point of purchase. Rules would approve; the merchant's network drives the score.",
  "txn-mule-ach": "Mule-style velocity. Amount and the account's network should dominate.",
  "txn-cnp-review": "Elevated but not decisive: the suggested action is to verify with the customer.",
  "txn-subscription": "Recurring legitimate pattern. Channel and merchant history should protect.",
};
