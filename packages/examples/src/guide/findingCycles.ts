import { Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example finds. */
export interface Found {
  readonly dependenciesAcyclic: boolean;
  readonly cycle: Int32Array;
}

/** Whether a graph has a cycle, and one of its cycles. */
export const FindingCycles = {
  /** Returns whether the packages have a cycle, and a cycle. */
  cycles(): Found {
    const dependencies = SmallProgram.dependencies();
    // @start region="findCycle"
    const dependenciesAcyclic = Graphs.isDag(dependencies);   // false
    const cycle = Graphs.findCycle(dependencies);             // [4, 5] - model, storage
    // @end
    return { dependenciesAcyclic, cycle };
  },
} as const;
