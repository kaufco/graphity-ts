import { BiAdjacentGraph, Graphs, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** Following edges against their direction. */
export const Transposing = {
  /** Returns `model` and the packages that depend on it, directly or indirectly. */
  affectedByModel(): SortedIntView {
    const dependencies = SmallProgram.dependencies();
    // @start region="transposed"
    const model = 4;
    const usedBy = BiAdjacentGraph.of(dependencies).transposed();
    const affected = Graphs.reachableFrom(usedBy, model);
    // affected: [0, 2, 3, 4, 5] - app, ui, service, model and storage
    // @end
    return affected;
  },
} as const;
