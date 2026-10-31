import { GraphBuilder, Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The two answers of the example. */
export interface Answers {
  readonly cfgStronglyConnected: boolean;
  readonly loadWellFormed: boolean;
}

/** Whether every node of a graph reaches every other. */
export const CheckingStrongConnectivity = {
  /**
   * Returns whether the control flow of load is strongly connected, without and with an
   * edge from its exit back to its entry.
   */
  check(): Answers {
    const cfg = SmallProgram.cfg();
    const blocks = SmallProgram.blockNames();
    const entry = SmallProgram.nodeOf(blocks, "entry");
    const exit = SmallProgram.nodeOf(blocks, "exit");
    // @start region="stronglyConnected"
    // No edge leads to entry, so no other block reaches it.
    const cfgStronglyConnected = Graphs.isStronglyConnected(cfg);   // false

    // With an edge from exit back to entry, the graph is strongly connected exactly when
    // every block can be reached from entry and can reach exit.
    const builder = new GraphBuilder();
    builder.addGraph(cfg);
    builder.addEdge(exit, entry);
    const loadWellFormed = Graphs.isStronglyConnected(builder.build());   // true
    // @end
    return { cfgStronglyConnected, loadWellFormed };
  },
} as const;
