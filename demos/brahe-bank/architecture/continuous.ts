import { BRAHE_GROUPS, collapseBraheGroup, normalizeBraheExpansion, projectBraheSystem } from "./system.ts";
import type { ContinuousSystem } from "../../../app/map/continuous.ts";

const braheHeader = { width: 220, height: 44 };

export const brahe: ContinuousSystem = {
  rootLabel: "Card guidance",
  rootGroupId: BRAHE_GROUPS.assistant,
  rootOccurrenceId: "brahe.assistant",
  railLabel: "Assistant stages",
  stages: [
    { instanceId: "check", displayLabel: "Check question", groupId: BRAHE_GROUPS.check, occurrenceId: "brahe.stage.check" },
    { instanceId: "build", displayLabel: "Build explanation", groupId: BRAHE_GROUPS.build, occurrenceId: "brahe.stage.build" },
    { instanceId: "return-stage", displayLabel: "Check and return", groupId: BRAHE_GROUPS.return, occurrenceId: "brahe.stage.return" },
  ],
  labels: {
    [BRAHE_GROUPS.assistant]: "Bank assistant",
    [BRAHE_GROUPS.check]: "Check question",
    [BRAHE_GROUPS.requestInspection]: "Request inspection",
    [BRAHE_GROUPS.build]: "Build explanation",
    [BRAHE_GROUPS.hosting]: "Model hosting",
    [BRAHE_GROUPS.return]: "Check and return",
    [BRAHE_GROUPS.answerInspection]: "Answer inspection",
  },
  occurrences: {
    [BRAHE_GROUPS.assistant]: "brahe.assistant",
    [BRAHE_GROUPS.check]: "brahe.stage.check",
    [BRAHE_GROUPS.requestInspection]: "brahe.check.inspect",
    [BRAHE_GROUPS.build]: "brahe.stage.build",
    [BRAHE_GROUPS.hosting]: "brahe.build.host",
    [BRAHE_GROUPS.return]: "brahe.stage.return",
    [BRAHE_GROUPS.answerInspection]: "brahe.return.inspect",
  },
  framing: {
    [BRAHE_GROUPS.assistant]: { prefixes: ["brahe."] },
    [BRAHE_GROUPS.check]: {
      ids: ["brahe.assistant", "brahe.stage.check", "brahe.check.question", "brahe.check.inspect", "brahe.scope.evaluate", "brahe.scope.control", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"],
      shrink: { "brahe.assistant": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.requestInspection]: {
      ids: ["brahe.assistant", "brahe.stage.check", "brahe.check.question", "brahe.check.inspect", "brahe.inspect.request.call", "brahe.service.ai-defense", "brahe.inspect.request.apply", "brahe.scope.evaluate", "brahe.scope.control", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"],
      shrink: { "brahe.assistant": braheHeader, "brahe.stage.check": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.build]: {
      ids: ["brahe.stage.check", "brahe.stage.build", "brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.cards", "brahe.build.card-tool", "brahe.build.card-docs", "brahe.build.score", "brahe.build.score-tool", "brahe.build.score-value", "brahe.build.host", "brahe.stage.return"],
      shrink: { "brahe.assistant": { x: 470, ...braheHeader } },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.hosting]: {
      ids: ["brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.host", "brahe.host.runtime", "brahe.host.endpoint"],
      shrink: { "brahe.assistant": braheHeader },
    },
    [BRAHE_GROUPS.return]: {
      ids: ["brahe.assistant", "brahe.stage.return", "brahe.return.answer", "brahe.return.inspect", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"],
      shrink: { "brahe.assistant": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.answerInspection]: {
      ids: ["brahe.assistant", "brahe.stage.return", "brahe.return.answer", "brahe.return.inspect", "brahe.inspect.answer.call", "brahe.service.ai-defense", "brahe.inspect.answer.apply", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"],
      shrink: { "brahe.assistant": braheHeader, "brahe.stage.return": braheHeader },
      minZoom: 0.8,
    },
  },
  project: projectBraheSystem,
  normalize: normalizeBraheExpansion,
  collapse: collapseBraheGroup,
  frameParent: (groupId) => {
    if (groupId === BRAHE_GROUPS.requestInspection) return BRAHE_GROUPS.check;
    if (groupId === BRAHE_GROUPS.hosting) return BRAHE_GROUPS.build;
    if (groupId === BRAHE_GROUPS.answerInspection) return BRAHE_GROUPS.return;
    if (groupId === BRAHE_GROUPS.check || groupId === BRAHE_GROUPS.build || groupId === BRAHE_GROUPS.return) return BRAHE_GROUPS.assistant;
    return groupId;
  },
  railOccurrence: (step) => ({
    prepare: "brahe.assistant",
    check: "brahe.stage.check",
    build: "brahe.stage.build",
    "return-stage": "brahe.stage.return",
  })[step] ?? `brahe.${step}`,
};
