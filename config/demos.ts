import { definition as demo0 } from "../demos/code-vulnerability/definition.ts";
import { definition as demo1 } from "../demos/brahe-bank/definition.ts";
import { definition as demo2 } from "../demos/fraud-modeling/definition.ts";
import { definition as demo3 } from "../demos/company-briefing/definition.ts";
import { definition as demo4 } from "../demos/market-research/definition.ts";
import { definition as demo5 } from "../demos/client-advisory/definition.ts";
import { definition as demo6 } from "../demos/kyc-processing/definition.ts";
import { definition as demo7 } from "../demos/sar-support/definition.ts";
import { definition as demo8 } from "../demos/transaction-llm/definition.ts";
import { definition as demo9 } from "../demos/interbank-a2a/definition.ts";
import type { DemoDefinition } from "./demo-contract.ts";

export const demoDefinitions: readonly DemoDefinition[] = [demo0, demo1, demo2, demo3, demo4, demo5, demo6, demo7, demo8, demo9];
export const demoById = (id: string) => demoDefinitions.find(demo => demo.id === id);
