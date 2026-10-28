export const lifecycleStory = {
  id: "lifecycle",
  title: "Client lifecycle",
  demos: ["kyc-processing", "fraud-modeling", "sar-support", "client-advisory"],
  steps: [
    { title: "KYC review", label: "Know the client · illustrative prototype", iconKey: "Fingerprint", color: "blue" },
    { title: "Fraud monitoring", label: "Catch the fraud", iconKey: "ReceiptText", color: "violet" },
    { title: "SAR investigation", label: "Investigate & report", iconKey: "FileSearch", color: "mint" },
    { title: "Advisor meeting prep", label: "Serve with context", iconKey: "WalletCards", color: "amber" },
  ],
  handoffs: [
    { from: "fraud-modeling", to: "sar-support", kind: "fraud-case" },
    { from: "fraud-modeling", to: "client-advisory", kind: "service-event" },
    { from: "company-briefing", to: "client-advisory", kind: "company-profile" },
  ],
};
