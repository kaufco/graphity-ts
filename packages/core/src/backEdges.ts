import { DfsFrames } from "./dfsFrames.js";
import { Edges } from "./edges.js";
import type { Graph } from "./graph.js";
import { IntBuffer } from "./internal.js";

const VISITED = 0b01;
const ON_STACK = 0b10;

/**
 * The back edges of a graph: the edges that a depth-first search finds pointing back to a node on
 * its current path, self-loops included.
 *
 * Every cycle contains a back edge, so a graph without back edges is a DAG (directed acyclic
 * graph), and removing the back edges of a graph leaves a DAG. They form a feedback arc set,
 * though not in general a smallest one.
 *
 * Uses the depth-first search of {@link EdgeTypes.of}, without recursion: {@link BackEdges.of}
 * finds the edges that `EdgeTypes` classifies as {@link EdgeType.BACK}, without classifying the
 * others.
 */
export const BackEdges = {
  /**
   * Returns the back edges of `graph`, in the order in which the search finds them.
   *
   * Unlike the other results that list edges, they do not come in edge index order. For that
   * order, use `Edges.of(EdgeTypes.of(graph), EdgeType.BACK)`: the same edges, at the cost of
   * classifying every edge first.
   *
   * **Time:** O(nodeCount + edgeCount).
   * **Memory:** 12 bytes per back edge for the result; while it runs, up to 18 bytes more per back
   * edge, 2 bits per node and up to 8 x nodeCount bytes for the stack, which grows with the
   * deepest path.
   *
   * @param graph the graph to search
   * @returns the back edges with their edge indices
   * @throws Error if a depth-first path is longer than 2^30 - 5 nodes
   */
  of(graph: Graph): Edges {
    const n = graph.nodeCount;
    const out = graph.outStart;
    const adj = graph.outAdj;
    // Visited and on-stack flags packed 2 bits per node: one load yields both flags of a target.
    const state = new Int32Array((n >> 4) + 1);
    const sources = new IntBuffer();
    const targets = new IntBuffer();
    const edgeIndices = new IntBuffer();
    let frames = DfsFrames.initial(n);

    for (let root = 0; root < n; root++) {
      const rShift = (root & 0xf) << 1;
      if (((state[root >> 4] >>> rShift) & VISITED) !== 0) continue;
      state[root >> 4] |= (VISITED | ON_STACK) << rShift;
      frames[0] = root;
      frames[1] = out[root];
      let top = 0;

      outer: while (top >= 0) {
        const u = frames[2 * top];
        const end = out[u + 1];
        let i = frames[2 * top + 1];
        while (i < end) {
          const v = adj[i++];
          const shift = (v & 0xf) << 1;
          const flags = state[v >> 4] >>> shift;
          if ((flags & VISITED) === 0) {
            frames[2 * top + 1] = i;
            state[v >> 4] |= (VISITED | ON_STACK) << shift;
            if (++top === frames.length >> 1) frames = DfsFrames.grow(frames, n);
            frames[2 * top] = v;
            frames[2 * top + 1] = out[v];
            continue outer;
          } else if ((flags & ON_STACK) !== 0) {
            sources.push(u);
            targets.push(v);
            edgeIndices.push(i - 1);
          }
        }
        state[u >> 4] &= ~(ON_STACK << ((u & 0xf) << 1)); // postorder: leave the DFS stack
        top--;
      }
    }
    return Edges.create(sources.toInt32Array(), targets.toInt32Array(), edgeIndices.toInt32Array());
  },
} as const;
