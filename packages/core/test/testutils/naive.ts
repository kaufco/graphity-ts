/**
 * Naive oracles for the fuzz and unit tests: Java's `NaiveDominators`, `NaiveEdgeClassifier` and
 * `RecursiveDfsOrder`, and in place of the JGraphT algorithms the Java tests compare against,
 * definitions computed the slow way - reachability per node, removal of each node or edge. They
 * share no code and no idea with the algorithms under test and are meant for graphs of a few
 * hundred nodes.
 */

import { EdgeType, type Graph, type IntList, IntLists } from "../../src/index.js";

/** Out-neighbors of every node as plain arrays, read through the checked public API. */
export function adjacency(graph: Graph): number[][] {
  const result: number[][] = [];
  for (let u = 0; u < graph.nodeCount; u++) result.push(Array.from(graph.outNodes(u)));
  return result;
}

/** Neighbors under the undirected reading: both directions, without self-loops, each once. */
export function undirectedAdjacency(graph: Graph): number[][] {
  const sets: Set<number>[] = Array.from({ length: graph.nodeCount }, () => new Set<number>());
  for (let u = 0; u < graph.nodeCount; u++) {
    for (const v of graph.outNodes(u)) {
      if (u === v) continue;
      sets[u].add(v);
      sets[v].add(u);
    }
  }
  return sets.map((s) => Array.from(s).sort((a, b) => a - b));
}

/** Breadth-first reachability from `sources` (the sources included), skipping `removed`. */
export function reach(adj: number[][], sources: Iterable<number>, removed = -1): boolean[] {
  const seen = new Array<boolean>(adj.length).fill(false);
  const queue: number[] = [];
  for (const s of sources) {
    if (s !== removed && !seen[s]) {
      seen[s] = true;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    for (const v of adj[queue[head]]) {
      if (v !== removed && !seen[v]) {
        seen[v] = true;
        queue.push(v);
      }
    }
  }
  return seen;
}

/** `matrix[u][v]`: v is reachable from u by a path of zero or more edges. */
export function reachabilityMatrix(graph: Graph): boolean[][] {
  const adj = adjacency(graph);
  return adj.map((_, u) => reach(adj, [u]));
}

/** A partition as a canonical, comparable form: every group sorted, groups sorted by first member. */
export function canonical(groups: number[][]): number[][] {
  return groups
    .map((g) => [...g].sort((a, b) => a - b))
    .sort((a, b) => (a.length === 0 ? -1 : b.length === 0 ? 1 : a[0] - b[0]));
}

/** The strongly connected components by mutual reachability. */
export function naiveSccs(graph: Graph): number[][] {
  const r = reachabilityMatrix(graph);
  const n = graph.nodeCount;
  const assigned = new Array<boolean>(n).fill(false);
  const groups: number[][] = [];
  for (let u = 0; u < n; u++) {
    if (assigned[u]) continue;
    const group: number[] = [];
    for (let v = u; v < n; v++) {
      if (!assigned[v] && r[u][v] && r[v][u]) {
        assigned[v] = true;
        group.push(v);
      }
    }
    groups.push(group);
  }
  return canonical(groups);
}

/** The connected components of the undirected reading. */
export function naiveWccs(graph: Graph): number[][] {
  return componentsOf(undirectedAdjacency(graph), -1);
}

/** The components of an undirected adjacency, with node `removed` taken out. */
export function componentsOf(adj: number[][], removed: number): number[][] {
  const n = adj.length;
  const seen = new Array<boolean>(n).fill(false);
  const groups: number[][] = [];
  for (let u = 0; u < n; u++) {
    if (u === removed || seen[u]) continue;
    const r = reach(adj, [u], removed);
    const group: number[] = [];
    for (let v = 0; v < n; v++) {
      if (r[v]) {
        seen[v] = true;
        group.push(v);
      }
    }
    groups.push(group);
  }
  return canonical(groups);
}

/** Number of strongly connected components, the slow way. */
export function naiveSccCount(graph: Graph): number {
  return naiveSccs(graph).length;
}

/**
 * The bridges of the undirected reading, as pairs `[min, max]` sorted: undirected edges whose
 * removal increases the number of components.
 */
export function naiveBridges(graph: Graph): [number, number][] {
  const adj = undirectedAdjacency(graph);
  const base = componentsOf(adj, -1).length;
  const bridges: [number, number][] = [];
  for (let u = 0; u < adj.length; u++) {
    for (const v of adj[u]) {
      if (v < u) continue;
      const without = adj.map((list, w) =>
        w === u ? list.filter((x) => x !== v) : w === v ? list.filter((x) => x !== u) : list,
      );
      if (componentsOf(without, -1).length > base) bridges.push([u, v]);
    }
  }
  return bridges;
}

/** The articulation points of the undirected reading, ascending. */
export function naiveArticulationPoints(graph: Graph): number[] {
  const adj = undirectedAdjacency(graph);
  const base = componentsOf(adj, -1).length;
  const points: number[] = [];
  for (let v = 0; v < adj.length; v++) {
    // Removing v takes away its own component if it was isolated.
    const isolated = adj[v].length === 0 ? 1 : 0;
    if (componentsOf(adj, v).length > base - isolated) points.push(v);
  }
  return points;
}

/**
 * The blocks of the undirected reading, each as the sorted list of its undirected edges
 * `min * n + max`: two edges at a common node `v` with other ends `a` and `b` lie in one block
 * exactly if `a` and `b` are connected in the graph without `v`, and blocks are the classes of
 * the transitive closure of that relation.
 */
export function naiveBlocks(graph: Graph): number[][] {
  const adj = undirectedAdjacency(graph);
  const n = adj.length;
  const keys: number[] = [];
  for (let u = 0; u < n; u++) for (const v of adj[u]) if (u < v) keys.push(u * n + v);
  const index = new Map(keys.map((k, i) => [k, i]));
  const parent = keys.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const keyOf = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  for (let v = 0; v < n; v++) {
    const components = componentsOf(adj, v);
    const componentOf = new Map<number, number>();
    components.forEach((group, c) => group.forEach((w) => componentOf.set(w, c)));
    const firstEdgeOfComponent = new Map<number, number>();
    for (const a of adj[v]) {
      const edge = index.get(keyOf(v, a))!;
      const c = componentOf.get(a)!;
      const first = firstEdgeOfComponent.get(c);
      if (first === undefined) firstEdgeOfComponent.set(c, edge);
      else parent[find(edge)] = find(first);
    }
  }
  const blocks = new Map<number, number[]>();
  keys.forEach((k, i) => {
    const root = find(i);
    if (!blocks.has(root)) blocks.set(root, []);
    blocks.get(root)!.push(k);
  });
  return Array.from(blocks.values())
    .map((b) => b.sort((x, y) => x - y))
    .sort((x, y) => x[0] - y[0]);
}

/** Whether the undirected reading is two-colorable; a self-loop makes it not. */
export function naiveIsBipartite(graph: Graph): boolean {
  for (let u = 0; u < graph.nodeCount; u++) if (graph.hasOutNode(u, u)) return false;
  const adj = undirectedAdjacency(graph);
  const color = new Array<number>(adj.length).fill(-1);
  for (let s = 0; s < adj.length; s++) {
    if (color[s] >= 0) continue;
    color[s] = 0;
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      for (const v of adj[u]) {
        if (color[v] < 0) {
          color[v] = 1 - color[u];
          queue.push(v);
        } else if (color[v] === color[u]) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Whether the graph has a directed cycle, a self-loop included. */
export function naiveHasCycle(graph: Graph): boolean {
  const r = reachabilityMatrix(graph);
  for (let u = 0; u < graph.nodeCount; u++) {
    if (graph.hasOutNode(u, u)) return true;
    for (const v of graph.outNodes(u)) if (r[v][u]) return true;
  }
  return false;
}

/** Breadth-first distances from the sources, -1 where unreachable. */
export function naiveDistances(graph: Graph, sources: number[]): number[] {
  const adj = adjacency(graph);
  const distance = new Array<number>(adj.length).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    if (distance[s] < 0) {
      distance[s] = 0;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    for (const v of adj[u]) {
      if (distance[v] < 0) {
        distance[v] = distance[u] + 1;
        queue.push(v);
      }
    }
  }
  return distance;
}

/**
 * Oracle for dominance, straight from the definition: `d` dominates `v` if `v` is reachable from
 * the entries, but no longer once `d` is removed. As Java's `NaiveDominators`.
 */
export class NaiveDominators {
  /** `dominates[d][v]`: d dominates v. A node dominates itself. */
  readonly dominates: boolean[][];

  /** Reachability from the entries. */
  readonly reachable: boolean[];

  constructor(
    private readonly graph: Graph,
    entries: IntList,
  ) {
    const n = graph.nodeCount;
    const adj = adjacency(graph);
    const entryList = Array.from(IntLists.asArrayLike(entries));
    this.reachable = reach(adj, entryList);
    this.dominates = [];
    for (let d = 0; d < n; d++) {
      const row = new Array<boolean>(n).fill(false);
      if (this.reachable[d]) {
        const without = reach(adj, entryList, d);
        for (let v = 0; v < n; v++) row[v] = this.reachable[v] && !without[v];
      }
      this.dominates.push(row);
    }
  }

  /** The strict dominator of `v` that all other strict dominators dominate, or -1. */
  immediateDominatorOf(v: number): number {
    if (!this.reachable[v]) return -1;
    const n = this.graph.nodeCount;
    let best = -1;
    let bestCount = -1;
    for (let d = 0; d < n; d++) {
      if (d === v || !this.dominates[d][v]) continue;
      let count = 0;
      for (let x = 0; x < n; x++) if (this.dominates[x][d]) count++;
      if (count > bestCount) {
        best = d;
        bestCount = count;
      }
    }
    return best;
  }
}

/** The DFS edge type of every edge by plain recursion, as Java's `NaiveEdgeClassifier`. */
export function naiveEdgeTypes(graph: Graph): EdgeType[] {
  const n = graph.nodeCount;
  const types = new Array<EdgeType>(graph.edgeCount);
  const visited = new Array<boolean>(n).fill(false);
  const onStack = new Array<boolean>(n).fill(false);
  const disc = new Array<number>(n).fill(0);
  let time = 0;
  const dfs = (u: number): void => {
    visited[u] = true;
    onStack[u] = true;
    disc[u] = ++time;
    for (let e = graph.outEdgeStart(u); e < graph.outEdgeEnd(u); e++) {
      const v = graph.edgeTarget(e);
      if (!visited[v]) {
        types[e] = EdgeType.TREE;
        dfs(v);
      } else if (onStack[v]) {
        types[e] = EdgeType.BACK;
      } else if (disc[u] < disc[v]) {
        types[e] = EdgeType.FORWARD;
      } else {
        types[e] = EdgeType.CROSS;
      }
    }
    onStack[u] = false;
  };
  for (let s = 0; s < n; s++) if (!visited[s]) dfs(s);
  return types;
}

/** Preorder and postorder of a textbook recursive DFS, as Java's `RecursiveDfsOrder`. */
export function recursiveDfsOrder(graph: Graph): { preOrder: number[]; postOrder: number[] } {
  const visited = new Array<boolean>(graph.nodeCount).fill(false);
  const preOrder: number[] = [];
  const postOrder: number[] = [];
  const visit = (node: number): void => {
    visited[node] = true;
    preOrder.push(node);
    for (let e = graph.outEdgeStart(node); e < graph.outEdgeEnd(node); e++) {
      const target = graph.edgeTarget(e);
      if (!visited[target]) visit(target);
    }
    postOrder.push(node);
  };
  for (let node = 0; node < visited.length; node++) if (!visited[node]) visit(node);
  return { preOrder, postOrder };
}
