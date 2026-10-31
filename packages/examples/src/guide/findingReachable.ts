import { BiAdjacentGraph, Graphs, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The nodes reached forward. */
export interface Forward {
  readonly fromLoad: SortedIntView;
  readonly fromLoadOrSave: SortedIntView;
}

/**
 * The methods a method may end up calling, and the methods that may end up calling it.
 */
export const FindingReachable = {
  /** Returns the methods that load, and load or save, may end up calling. */
  forward(): Forward {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const load = SmallProgram.nodeOf(names, "load");
    const save = SmallProgram.nodeOf(names, "save");
    // @start region="reachableFrom"
    const fromLoad = Graphs.reachableFrom(calls, load);
    // fromLoad: [3, 6, 8] - load, parse and read
    const fromLoadOrSave = Graphs.reachableFrom(calls, [load, save]);
    // fromLoadOrSave: [3, 4, 6, 7, 8, 9] - load, save, parse, format, read and write
    // @end
    return { fromLoad, fromLoadOrSave };
  },

  /** Returns the methods that may end up calling format. */
  callersOfFormat(): SortedIntView {
    const calls = SmallProgram.calls();
    const format = SmallProgram.nodeOf(SmallProgram.methodNames(), "format");
    // @start region="reaching"
    // Turn every call around, to search from format to the methods that may end up
    // calling it.
    const calledBy = BiAdjacentGraph.of(calls).transposed();
    const affected = Graphs.reachableFrom(calledBy, format);
    // affected: [0, 2, 4, 5, 7] - main, run, save, show and format itself
    // @end
    return affected;
  },
} as const;
