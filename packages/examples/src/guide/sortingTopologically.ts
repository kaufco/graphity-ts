import { TopOrder } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The build steps in an order that respects every edge. */
export const SortingTopologically = {
  /** Returns the build steps in topological order, by name. */
  runOrder(): string[] {
    const steps = SmallProgram.buildSteps();
    const names = SmallProgram.stepNames();
    // @start region="topOrder"
    const order = TopOrder.of(steps);   // [2, 0, 1, 4, 3, 5, 6, 7, 8]
    const runOrder = Array.from(order, (step) => names[step]);
    // runOrder: [lint, generate, compile, docs, compileTests, test, package, sign,
    //            publish]
    // @end
    return runOrder;
  },
} as const;
