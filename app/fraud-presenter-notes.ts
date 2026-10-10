/** Presenter-only talk track per fraud scenario (services/fraud/data/scenarios.json ids). Never rendered to the audience. */
export const fraudPresenterHints: Record<string, string> = {
  "cpp-orbit": "The aha: a clean customer at a compromised merchant. Rules approve; the graph model sees the merchant's recent fraud and flags it. Show network. Standalone: block and reissue, then offer the bulk reissue. In the lifecycle story: Escalate to investigations; the card is still blocked and reissued, and Escalate to SAR hands the case to the SAR team.",
  "card-testing": "Small, fast, card-not-present attempts. Rules and the graph agree here; the point is speed and a clean audit trail.",
  "ato-illustrative": "Illustrative account takeover: new device and address change before a high-value order. Say Illustrative out loud.",
  "clean-grocery": "The control case. A low score and a quick false-positive close keep the queue honest.",
  "attack-dispute-injection": "The dispute note carries an instruction to close the case. AI Defense blocks it and the agent never sees it.",
  "attack-note-pii": "Type a full card number into the analyst note. AI Defense flags the PAN; the fraud.note_pii policy blocks the save and offers a masked note.",
};
