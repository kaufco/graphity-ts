import { Graphs } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** Operations on whole graphs: a cycle, and the graph as text. */
export const GraphOperations = {
  /** Returns the cycle in the dependencies between the packages. */
  cycleInDependencies(): Int32Array {
    const dependencies = SmallProgram.dependencies();
    // @start region="findCycle"
    const cycle = Graphs.findCycle(dependencies);
    // cycle: [4, 5] - model and storage, closed by the edge storage -> model
    // @end
    return cycle;
  },

  /** Returns the whole control flow of `load` as text. */
  cfgAsAdjacencyList(): string {
    const cfg = SmallProgram.cfg();
    // @start region="adjacencyListOf"
    const text = Graphs.adjacencyListOf(cfg);
    // 0 -> [1]
    // 1 -> [2, 5]
    // 2 -> [3, 4]
    // 3 -> [4]
    // 4 -> [1]
    // 5 -> []
    // @end
    return text;
  },
} as const;
