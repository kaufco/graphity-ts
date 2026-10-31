import { type Graph, GraphBuilder } from "../../src/index.js";

/** Deterministic mini-graph generators for unit tests, as Java's `TestGraphs`. */
export const TestGraphs = {
  /** Empty graph with no nodes and no edges. */
  empty(): Graph {
    return new GraphBuilder().build();
  },

  /** Graph with `n` isolated nodes and no edges. */
  isolated(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    return b.build();
  },

  /** Directed path `0 -> 1 -> ... -> n-1`. */
  path(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i + 1 < n; i++) b.addEdge(i, i + 1);
    return b.build();
  },

  /** Directed cycle `0 -> 1 -> ... -> n-1 -> 0`; a self-loop for `n == 1`. */
  cycle(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i < n; i++) b.addEdge(i, (i + 1) % n);
    return b.build();
  },

  /** Complete directed graph on `n` nodes, without self-loops. */
  clique(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (u !== v) b.addEdge(u, v);
    return b.build();
  },

  /** Out-star: `0 -> 1, 0 -> 2, ..., 0 -> n-1`. */
  outStar(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) b.addEdge(0, i);
    return b.build();
  },

  /** In-star: `1 -> 0, 2 -> 0, ..., n-1 -> 0`. */
  inStar(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) b.addEdge(i, 0);
    return b.build();
  },

  /** A graph with `n` nodes from a flat list of edge endpoints: `of(3, 0, 1, 1, 2)`. */
  of(n: number, ...edges: number[]): Graph {
    if ((edges.length & 1) !== 0) throw new Error("edges must come in (source, target) pairs");
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i < edges.length; i += 2) b.addEdge(edges[i], edges[i + 1]);
    return b.build();
  },
} as const;
