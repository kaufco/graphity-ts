import { Csr, Graph } from "@kobayami/graphity";

/** The graph and the arrays read back from it. */
export interface FromArrays {
  readonly graph: Graph;
  readonly start: Int32Array;
  readonly adjacency: Int32Array;
}

/** A graph made from the two arrays of its CSR layout, and the arrays read back. */
export const UsingCsrArrays = {
  /** Returns the control flow of the method load, made from its two arrays. */
  load(): FromArrays {
    // @start region="csr"
    // The control flow of the method load, as another tool might hand it over: the
    // out-nodes of all its blocks, block after block, and where the out-nodes of each
    // block start. The blocks entry, header, body, then, next and exit are the nodes
    // 0 to 5.
    const start = [0, 1, 3, 5, 6, 7, 7];
    const adjacency = [1, 2, 5, 3, 4, 4, 1];
    const cfg = Graph.of(start, adjacency);   // copies and checks both arrays
    // cfg: 6 nodes, 7 edges

    // The other way round: the arrays of a graph, for code of your own that reads every
    // edge. They are the graph's own arrays, not copies: read them, never change them.
    const outStart = Csr.outAdjacencyStart(cfg);   // [0, 1, 3, 5, 6, 7, 7]
    const outNodes = Csr.outAdjacency(cfg);        // [1, 2, 5, 3, 4, 4, 1]
    // @end
    return { graph: cfg, start: outStart, adjacency: outNodes };
  },
} as const;
