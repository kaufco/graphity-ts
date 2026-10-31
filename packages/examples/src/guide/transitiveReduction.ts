import { type Edges, type Graph, Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The reduction, its edge count and the edges it leaves out. */
export interface Reduced {
  readonly reduction: Graph;
  readonly edgeCount: number;
  readonly leftOut: Edges;
}

/** The build steps without the edges that other paths make redundant. */
export const TransitiveReduction = {
  /** Returns the transitive reduction of the build steps. */
  reduction(): Reduced {
    const steps = SmallProgram.buildSteps();
    // @start region="reduction"
    // steps has no cycles.

    // Leave out every edge that a longer path makes redundant.
    const reduction = Graphs.transitiveReduction(steps);
    const edgeCount = reduction.edgeCount;   // 9 - one fewer than the 10 of steps

    // Which edges are redundant? Those the reduction leaves out.
    const leftOut = Graphs.diff(steps, reduction).removedEdges;
    // leftOut: compile -> package, edge 3 of steps -
    // compile -> compileTests -> test -> package
    // @end
    return { reduction, edgeCount, leftOut };
  },
} as const;
