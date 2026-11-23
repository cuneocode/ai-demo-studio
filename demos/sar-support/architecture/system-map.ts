import { box, chip, type ZoomMap } from "../../../app/map/system-map.ts";

export const sar: ZoomMap = {
  summary: "The investigation agent gathers evidence, drafts a cited narrative, and submits it for investigator and QA review.",
    implemented: true,
    note: "Synthetic cases, deterministic typology rules, a Deep Agent on the Studio model chain, a citation verifier, and hosted Agent Control on the approval path. A hosted model runs only with AI Defense forced to enforce. Nothing is filed: e-filing is simulated.",
    cores: [
      box("evidence", "Case file", "Synthetic fixtures", "KYC, transactions, counterparties, alerts, and documents. Stable evidence ids; SSN and DOB never reach the model.", "store"),
      box("workload", "Investigation service", "FastAPI /runs · port 8015", "Runs the agent, the typology rules, the citation verifier, the investigator and QA steps, and the simulated e-filing."),
      box("model", "Studio model chain", "Sparky vLLM → OpenAI API", "Sparky first. The case file is client PII, so the hosted fallback is used only with AI Defense forced to enforce; otherwise the call is refused and the recorded run or the sample narrative is offered.", "ai"),
      box("defense", "Cisco AI Defense", "Untrusted text and model hops", "Inspects memos and documents segment by segment before the agent reads them, and every model hop. Flagged text is withheld.", "cisco"),
      box("observe", "Splunk Agent Observability", "Agent Control and traces", "Hosted controls gate release, contact, and filing. Galileo SDK traces; OTLP export only when configured.", "cisco"),
    ],
    coreEdges: [
      { from: "evidence", to: "workload", label: "case tools" },
      { from: "workload", to: "defense", label: "inspect untrusted text", kind: "control" },
      { from: "workload", to: "model", label: "agent steps + draft" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "verdict booleans + trace", kind: "control" },
    ],
    interiors: {
      evidence: {
        title: "Synthetic case file",
        note: "Four scenarios: money mule linked to the card-fraud ring, structuring, explained activity, and an injection attack. Obviously fake PII. No live core banking.",
        entities: [
          box("kyc", "KYC and accounts", "Minimized", "SSN, date of birth, and street address stay out of every model prompt.", "store"),
          box("activity", "Transactions", "Counterparties + aggregates", "Inbound and outbound totals, channels, and windows are computed before the agent reads them.", "store"),
          box("untrusted", "Untrusted text", "Memos and documents", "Customer-supplied text can carry instructions. It is inspected segment by segment and never followed.", "store"),
          box("media", "Adverse media", "One allowlisted source", "A fictional newswire. No web search. Every search, including zero hits, is a citable record.", "store"),
          box("handoff", "Fraud referral", "From card fraud triage", "An escalated fraud case seeds the investigation and its evidence (lifecycle handoff).", "store"),
        ],
        edges: [],
        stubs: [box("workload", "Investigation service", "Case tools", "Evidence ids such as KYC-1, TXN-05, AGG-IN, IND-MM-01.")],
      },
      workload: {
        title: "Investigation service",
        note: "The model drafts. Code computes the typologies, verifies every sentence, and enforces the approvals.",
        entities: [
          box("agent", "Investigation Deep Agent", "Case tools", "Calls the KYC, activity, counterparty, prior-alert, document, typology, and adverse-media tools, then drafts a FinCEN-style narrative with a filing recommendation.", "ai"),
          box("rules", "Typology rules", "Deterministic", "Money mule, structuring, and funnel-account indicators. Not an LLM.", "service"),
          box("verify", "Citation verifier", "Cite or drop", "Every amount, date, count, and masked account in a sentence must appear in its cited evidence. Failing agent sentences are dropped and listed.", "service"),
          box("review", "Investigator and QA", "Human decisions", "The investigator edits and decides file or no SAR with a rationale. A different reviewer approves or returns the case.", "human"),
          box("efile", "Simulated e-filing", "Nothing is sent", "A simulated BSA E-Filing confirmation number. Not a FinCEN submission.", "service"),
        ],
        edges: [
          { from: "agent", to: "verify", label: "draft" },
          { from: "rules", to: "verify", label: "indicators" },
          { from: "verify", to: "review", label: "cited narrative" },
          { from: "review", to: "efile", label: "approved file", kind: "control" },
        ],
        stubs: [box("model", "Studio model chain", "Agent steps", "Sparky first; hosted only under enforced AI Defense.", "ai", { from: "agent" })],
      },
      model: {
        title: "Studio model chain",
        note: "Sparky vLLM first; the OpenAI API only with AI Defense forced to enforce on that request. Without AI Defense the hop is refused.",
        entities: [
          box("chain", "First healthy backend", "From Studio settings", "No endpoint is hardcoded in the service. The badge shows which backend answered.", "ai"),
          box("refuse", "Refused hop", "No AI Defense", "The case file does not leave for a hosted model. The demo offers the recorded run or the sample narrative.", "failure"),
        ],
        edges: [{ from: "chain", to: "refuse", label: "no AI Defense", kind: "control" }],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "Prompt and response.", "cisco")],
      },
      defense: {
        title: "Cisco AI Defense",
        note: "Two placements: untrusted case text before the agent reads it, and every model hop. Typology rules, aggregates, and the verifier never enter Inspection.",
        entities: [
          box("segments", "Untrusted text", "Segment by segment", "Payment memos and customer documents. A flagged segment (prompt injection, card number) is withheld from the agent.", "cisco"),
          box("hops", "Model hops", "Prompt and response", "Enforce is forced when the case file goes to a hosted model, so the tenant's injection and PII/PCI rules apply to every hop. Minimization keeps SSN, date of birth, and street address out of the prompt.", "cisco"),
          box("stop", "Fail closed", "Withhold or stop", "No verdict means the segment is withheld or the model call stops.", "failure"),
        ],
        edges: [
          { from: "segments", to: "stop", label: "flagged", kind: "control" },
          { from: "hops", to: "stop", label: "deny / unavailable", kind: "control" },
        ],
        stubs: [],
      },
      observe: {
        title: "Splunk Agent Observability",
        note: "Only verdict booleans reach Agent Control, never case data. When the controls are not registered the same rules run in-process and are labelled local checks.",
        entities: [
          box("controls", "Agent Control", "Hosted SAR controls", "Deny actions on three steps. A missing control evaluation fails closed.", "cisco", {
            chips: [
              chip("cited", "Narrative cited", "sar.narrative_cited"),
              chip("tip", "No tipping off", "sar.no_tipping_off"),
              chip("file", "Filing approval", "sar.file_requires_approval"),
            ],
          }),
          box("trace", "Agent trace", "Galileo SDK", "One trace per investigation with tool and model spans when Galileo is keyed.", "service"),
          box("otlp", "OTLP export", "Only when configured", "A separate exporter sends spans only when SPLUNK_REALM and SPLUNK_ACCESS_TOKEN, or an OTLP endpoint, are set.", "service"),
        ],
        edges: [{ from: "trace", to: "otlp", label: "optional export", kind: "telemetry" }],
        stubs: [],
      },
    },
  };
