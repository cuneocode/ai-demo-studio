import type { Step, Tour } from "../types";
import { advisoryTour } from "./advisory.ts";
import { fraudTour } from "./fraud.ts";
import { kycTour } from "./kyc.ts";
import { sarTour } from "./sar.ts";

export const LIFECYCLE_TOUR_ID = "lifecycle";

function pick(tour: Tour, id: string, moment: string, patch: Partial<Step> = {}): Step {
  const step = tour.steps.find((item) => item.id === id);
  if (!step) throw new Error(`Lifecycle story: ${tour.id} has no step ${id}`);
  return { ...step, ...patch, story: ["kyc.label", "kyc.workbench", "fraud.scenario", "fraud.run", "fraud.verdicts", "fraud.decide", "sar.inbox", "sar.run", "sar.narrative", "sar.investigator", "advisory.household", "advisory.run", "advisory.brief", "advisory.submit", "advisory.approve"].includes(id), case: tour.useCaseId, moment, needs: undefined, resumeFrom: undefined };
}

const KYC = "Moment 1 of 4 · KYC";
const FRAUD = "Moment 2 of 4 · Fraud";
const SAR = "Moment 3 of 4 · SAR";
const ADVISORY = "Moment 4 of 4 · Advisory";

/** Chuck Robbins across four teams, with live execution and explicit recorded fallbacks. */
export const lifecycleTour: Tour = {
  id: LIFECYCLE_TOUR_ID,
  useCaseId: "kyc-processing",
  title: "Chuck Robbins lifecycle story",
  story: true,
  recording: "cpp-orbit-escalate-live",
  steps: [
    pick(kycTour, "kyc.label", KYC),
    pick(kycTour, "kyc.queue", KYC),
    pick(kycTour, "kyc.workbench", KYC, {
      body: "Chuck’s public role is real; this banking profile is hypothetical. KYC is illustrative and sends no data onward. Next, run live card-fraud triage to see how the bank protects a customer.",
    }),
    pick(fraudTour, "fraud.problem", FRAUD),
    pick(fraudTour, "fraud.scenario", FRAUD),
    pick(fraudTour, "fraud.run", FRAUD),
    pick(fraudTour, "fraud.verdicts", FRAUD),
    pick(fraudTour, "fraud.network", FRAUD),
    pick(fraudTour, "fraud.decide", FRAUD),
    {
      id: "lifecycle.escalate", story: true, kind: "act", case: "fraud-modeling", moment: FRAUD, targets: ["fraud.escalate"],
      showIf: { anchor: "fraud.escalate" },
      waitFor: { anchor: "sar.band" },
      waitingText: "Choose Escalate to SAR to hand the case over.",
      title: "Hand off to investigations",
      body: "Escalate to SAR hands the case to the financial-crimes team. Only \"card compromised and reissued\" is shared with Chuck's advisor.",
    },
    { id: "lifecycle.subject", story: true, kind: "observe", case: "sar-support", moment: SAR, targets: ["sar.band"],
      title: "A different account holder",
      body: "Chuck is the hypothetical victim. The investigation concerns Kendall Reyes’s separate account. Other compromised cards funded it; the attempted transfer from Chuck’s blocked card was declined." },
    pick(sarTour, "sar.problem", SAR),
    {
      ...pick(sarTour, "sar.inbox", SAR),
      kind: "auto",
      targets: ["sar.inbox"],
      action: { type: "click", anchor: "sar.inbox.open" },
      body: "Opening the locally saved referral selects Kendall’s case. The live investigation uses this session’s referral. A recorded fallback uses its original fixed context.",
    },
    pick(sarTour, "sar.pick", SAR, { showIf: { anchor: "sar.inbox", present: false } }),
    pick(sarTour, "sar.run", SAR),
    pick(sarTour, "sar.typologies", SAR, {
      body: "Money-mule indicators fire from the transactions as deterministic rules with thresholds and evidence. Nine funding cards link back to the Orbit Digital Goods compromise.",
    }),
    pick(sarTour, "sar.narrative", SAR),
    pick(sarTour, "sar.investigator", SAR),
    {
      id: "lifecycle.sar-close", story: true, kind: "observe", case: "sar-support", moment: SAR, targets: ["sar.audit"],
      title: "No tipping off",
      body: "This demo keeps investigation details within the financial-crimes workflow. The advisor receives only the card-replacement service event, with no SAR narrative or allegation about Chuck.",
    },
    pick(advisoryTour, "advisory.household", ADVISORY),
    pick(advisoryTour, "advisory.context", ADVISORY, {
      body: "The context panel shows this session’s reissued-card service event. Live preparation uses that context; a recorded fallback keeps its original fixed context.",
    }),
    pick(advisoryTour, "advisory.run", ADVISORY),
    pick(advisoryTour, "advisory.notes", ADVISORY),
    pick(advisoryTour, "advisory.brief", ADVISORY),
    pick(advisoryTour, "advisory.submit", ADVISORY),
    pick(advisoryTour, "advisory.approve", ADVISORY),
    {
      id: "lifecycle.recap", story: true, kind: "observe", case: "client-advisory", moment: "Close", targets: [],
      title: "Four teams, one foundation",
      body: "KYC is illustrative. Fraud, investigation, and advisor preparation run live when available, with labelled fallbacks chosen explicitly. Review each result’s provenance and approvals. Production placement on Cisco AI POD remains proposed.",
      ciscoFit: [
        {
          product: "Cisco AI Defense",
          how: "Inspect actual model traffic in live runs; recordings show historical inspections and code-written samples make no model call.",
          status: "running",
          requires: { any: [{ status: { service: "fraud", aiDefense: "on" } }, { status: { service: "sar", aiDefense: "on" } }] },
          otherwise: "AI Defense isn't active on these services now; what it found is shown from the recordings.",
        },
        {
          product: "Splunk Agent Control",
          how: "Live workflows evaluate approval policies. Recorded decisions are historical; code-written advisor samples cannot be approved.",
          status: "running",
          requires: { all: [{ status: { service: "fraud", agentControl: "enforcing" } }, { status: { service: "sar", agentControl: "enforcing" } }] },
          otherwise: "Hosted Agent Control isn't enforcing everywhere now; the same rules run as labelled local checks.",
        },
        {
          product: "Splunk Agent Observability",
          how: "Each live run is one agent trace with tool and model spans. Replays send no new traces.",
          status: "running",
          requires: { any: [{ status: { service: "fraud", tracing: "configured" } }, { status: { service: "sar", tracing: "configured" } }] },
          otherwise: "Agent tracing isn't configured on these services now.",
        },
        {
          product: "Cisco AI infrastructure",
          how: "Proposed: Cisco AI POD or UCS with NVIDIA GPUs for scoring and private inference.",
          status: "proposed",
        },
      ],
    },
  ],
};
