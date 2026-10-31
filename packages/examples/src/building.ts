import { Graph } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** Building a graph, and looking at it. */
export const Building = {
  /** Builds the control flow of `load` from the two arrays of its CSR layout. */
  cfgFromArrays(): Graph {
    // @start region="of"
    // blocks 0..5: entry, header, body, then, next, exit
    const outAdjacencyStart = [0, 1, 3, 5, 6, 7, 7];
    const outAdjacency = [
      1,       // entry  -> header
      2, 5,    // header -> body, exit
      3, 4,    // body   -> then, next
      4,       // then   -> next
      1];      // next   -> header
    const cfg = Graph.of(outAdjacencyStart, outAdjacency);
    // @end
    return cfg;
  },

  /** Returns the text of the control flow of `load`. */
  cfgAsText(): string {
    const cfg = SmallProgram.cfg();
    // @start region="toString"
    const text = cfg.toString();
    // Graph[nodes=6, edges=7] {0 -> [1], 1 -> [2, 5], 2 -> [3, 4], 3 -> [4], 4 -> [1],
    //                          5 -> []}
    // @end
    return text;
  },
} as const;
