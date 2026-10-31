/**
 * Oracles for the biconnectivity, strong connectivity and ancestry tests, in place of the JGraphT
 * algorithms the Java tests compare against. Each follows a definition, not an algorithm of the
 * library: components after removing a node, blocks as the classes of edges that share a node
 * whose other ends stay connected without it, strong bridges by removal and recount, the lowest
 * common ancestor by intersecting ancestor sets.
 */

import { Components, type Graph } from "../../src/index.js";
import { undirectedAdjacency } from "./naive.js";
import { TestGraphs } from "./testGraphs.js";

/** A key for the undirected edge {a, b}, independent of direction. */
export function pairKey(a: number, b: number): number {
  return Math.min(a, b) * 0x10000 + Math.max(a, b);
}

/**
 * Labels the connected components of an undirected adjacency, with node `removed` taken out (its
 * label stays -1). Returns the number of components.
 */
function labelComponents(adj: number[][], removed: number, labels: Int32Array, queue: Int32Array): number {
  labels.fill(-1);
  let count = 0;
  for (let s = 0; s < adj.length; s++) {
    if (s === removed || labels[s] >= 0) continue;
    labels[s] = count;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const u = queue[head++];
      for (const v of adj[u]) {
        if (v !== removed && labels[v] < 0) {
          labels[v] = count;
          queue[tail++] = v;
        }
      }
    }
    count++;
  }
  return count;
}

/** The undirected structure of a graph, decided the slow way. */
export interface UndirectedOracle {
  /** Bridges as {@link pairKey}s. */
  readonly bridges: Set<number>;
  /** Articulation points, ascending. */
  readonly articulationPoints: number[];
  /** Blocks, each as the sorted string of its {@link pairKey}s. */
  readonly blocks: Set<string>;
}

/**
 * Bridges, articulation points and blocks of the undirected reading (reciprocal pairs collapsed,
 * self-loops dropped):
 * - `v` is an articulation point if removing it leaves more components among the other nodes
 *   than there were (an isolated node takes its own component with it);
 * - two edges `{v, a}` and `{v, b}` lie in one block exactly if `a` and `b` stay connected without
 *   `v`; blocks are the classes of the transitive closure of that relation;
 * - an edge is a bridge if it lies on no cycle; on small graphs this is checked by removing the
 *   edge, on larger ones as a block of a single edge, which is the same thing.
 */
export function undirectedOracle(graph: Graph): UndirectedOracle {
  const adj = undirectedAdjacency(graph);
  const n = adj.length;
  const labels = new Int32Array(n);
  const queue = new Int32Array(n);
  const base = labelComponents(adj, -1, labels, queue);

  const edges: number[] = [];
  const edgeIndex = new Map<number, number>();
  for (let u = 0; u < n; u++) {
    for (const v of adj[u]) {
      if (u < v) {
        edgeIndex.set(pairKey(u, v), edges.length);
        edges.push(pairKey(u, v));
      }
    }
  }
  const parent = edges.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const articulationPoints: number[] = [];
  for (let v = 0; v < n; v++) {
    const count = labelComponents(adj, v, labels, queue);
    const isolated = adj[v].length === 0 ? 1 : 0;
    if (count > base - isolated) articulationPoints.push(v);
    const firstEdgeOfComponent = new Map<number, number>();
    for (const a of adj[v]) {
      const e = edgeIndex.get(pairKey(v, a))!;
      const first = firstEdgeOfComponent.get(labels[a]);
      if (first === undefined) firstEdgeOfComponent.set(labels[a], e);
      else parent[find(e)] = find(first);
    }
  }

  const classes = new Map<number, number[]>();
  edges.forEach((key, i) => {
    const root = find(i);
    let members = classes.get(root);
    if (members === undefined) classes.set(root, (members = []));
    members.push(key);
  });
  const blocks = new Set<string>();
  const bridges = new Set<number>();
  for (const members of classes.values()) {
    members.sort((a, b) => a - b);
    blocks.add(members.join(","));
    if (members.length === 1 && edges.length > 2000) bridges.add(members[0]);
  }

  if (edges.length <= 2000) {
    // Small enough to remove every edge and look again.
    for (const key of edges) {
      const a = Math.floor(key / 0x10000);
      const b = key % 0x10000;
      const without = adj.map((list, w) =>
        w === a ? list.filter((x) => x !== b) : w === b ? list.filter((x) => x !== a) : list,
      );
      if (labelComponents(without, -1, labels, queue) > base) bridges.add(key);
    }
  }
  return { bridges, articulationPoints, blocks };
}

/** Strong bridges as `"u->v"` in edge index order, and strong articulation points, by removal and recount. */
export function strongByRemoval(g: Graph): { bridges: string[]; points: number[] } {
  const n = g.nodeCount;
  const sccs = Components.sccsOf(g);
  const count = sccs.groupCount;
  const bridges: string[] = [];
  for (let e = 0; e < g.edgeCount; e++) {
    if (Components.sccsOf(without(g, e, -1)).groupCount > count) {
      const key = `${g.edgeSource(e)}->${g.edgeTarget(e)}`;
      if (!bridges.includes(key)) bridges.push(key);
    }
  }
  const points: number[] = [];
  for (let v = 0; v < n; v++) {
    // v stays as an isolated node, which adds one component of its own.
    const remaining = Components.sccsOf(without(g, -1, v)).groupCount - 1;
    const before = count - (sccs.sizeOf(sccs.get(v)) === 1 ? 1 : 0);
    if (remaining > before) points.push(v);
  }
  return { bridges, points };
}

/** The graph without edge index `edge` and without the edges at node `node`. */
function without(g: Graph, edge: number, node: number): Graph {
  const edges: number[] = [];
  for (let e = 0; e < g.edgeCount; e++) {
    const source = g.edgeSource(e);
    const target = g.edgeTarget(e);
    if (e === edge || source === node || target === node) continue;
    edges.push(source, target);
  }
  return TestGraphs.of(g.nodeCount, ...edges);
}

/** Parent of every node, read from the forest's edges, -1 for a root. */
export function parentsOf(forest: Graph): Int32Array {
  const parent = new Int32Array(forest.nodeCount).fill(-1);
  forest.forEachEdge((source, target) => {
    parent[target] = source;
  });
  return parent;
}

/** The lowest common ancestor by intersecting ancestor sets, -1 across trees. */
export function naiveLowestCommonAncestor(parent: Int32Array, a: number, b: number): number {
  const ancestorsOfA = new Set<number>();
  for (let x = a; x >= 0; x = parent[x]) ancestorsOfA.add(x);
  for (let y = b; y >= 0; y = parent[y]) if (ancestorsOfA.has(y)) return y;
  return -1;
}
