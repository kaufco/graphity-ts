import { BiAdjacentGraph, type Graph, Graphs, NodeMapping } from "@kobayami/graphity";
import { EdgeData } from "./edgeData.js";
import { SmallProgram } from "./smallProgram.js";

/** The methods that `load` reaches, with their names and the call sites of each call. */
export interface Loading {
  readonly graph: Graph;
  readonly names: string[];
  readonly siteCount: Int32Array;
}

/**
 * Renumbering the nodes of a graph, and carrying the data on its nodes and edges along.
 */
export const Mappings = {
  /** Returns the subgraph of the calls that `load` reaches, with its data. */
  loading(): Loading {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const siteCount = EdgeData.callSitesPerEdge();
    const load = SmallProgram.nodeOf(names, "load");
    // @start region="subgraph"
    const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
    const loading = Graphs.remapped(calls, newToOld);
    const loadingNames = new Array<string>(loading.nodeCount);
    newToOld.gather(names, loadingNames);
    // loadingNames: [load, parse, read]
    // loading: load -> parse, load -> read, parse -> parse
    // @end
    // @start region="edgeMapping"
    const loadingSiteCount = Graphs.edgeMapping(loading, calls, newToOld).gather(
      siteCount,
    );
    // 1 for load -> parse and for load -> read, 2 for parse -> parse
    // @end
    return { graph: loading, names: loadingNames, siteCount: loadingSiteCount };
  },

  /** Prints each method that calls `parse`, with the number of call sites. */
  callersOfParse(): void {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const siteCount = EdgeData.callSitesPerEdge();
    const parse = SmallProgram.nodeOf(names, "parse");
    // @start region="transposedEdges"
    const calledBy = BiAdjacentGraph.of(calls).transposed();
    const calledBySiteCount = Graphs.transposedEdgeMapping(calls).gather(siteCount);
    for (
      let edge = calledBy.outEdgeStart(parse);
      edge < calledBy.outEdgeEnd(parse);
      edge++
    ) {
      console.log(`${names[calledBy.edgeTarget(edge)]}: ${calledBySiteCount[edge]}`);
    }
    // load: 1
    // parse: 2
    // @end
  },
} as const;
