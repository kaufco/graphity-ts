import { BiAdjacentGraph, Graphs, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The root nodes, and a test of a single node. */
export interface Roots {
  readonly roots: SortedIntView;
  readonly compileIsRoot: boolean;
}

/** The build steps that need no other step: where a run starts. */
export const FindingRoots = {
  /** Returns the steps without an edge into them. */
  roots(): Roots {
    const names = SmallProgram.stepNames();
    const compile = SmallProgram.nodeOf(names, "compile");
    // @start region="rootNodes"
    // Root nodes have no in-nodes, so the graph needs its in-nodes.
    const steps = BiAdjacentGraph.of(SmallProgram.buildSteps());
    const roots = Graphs.rootNodes(steps);             // [0, 2] - generate and lint
    const compileIsRoot = steps.isRootNode(compile);   // false - it waits for generate
    // @end
    return { roots, compileIsRoot };
  },
} as const;
