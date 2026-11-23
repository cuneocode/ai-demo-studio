import type { EvidenceRef } from "./types.ts";

export const evidenceRef = (id: string, file: string, symbol: string, start: number, end: number, proves: string): EvidenceRef => ({ id, file, symbol, start, end, proves, evidenceKind: "source", proofRole: "Full context" });
