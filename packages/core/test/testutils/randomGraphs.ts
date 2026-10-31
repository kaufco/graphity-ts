import { type Graph, GraphBuilder } from "../../src/index.js";
import { JavaRandom } from "./javaRandom.js";

/** A generator invocation tagged with its recipe, for reproducible failure messages. */
export interface LabeledGraph {
  readonly generator: string;
  readonly nodeCount: number;
  readonly seed: bigint;
  readonly graph: Graph;
  describe(): string;
}

function labeled(generator: string, nodeCount: number, seed: bigint, graph: Graph): LabeledGraph {
  return { generator, nodeCount, seed, graph, describe: () => `gen=${generator}, n=${nodeCount}, seed=${seed}` };
}

type Seed = bigint | number;

/**
 * Seed-based random graph generators for the fuzz tests, as Java's `RandomGraphs`. They draw from
 * {@link JavaRandom}, so every seed yields the graph the Java tests use. Self-loops are allowed;
 * parallel edges are merged by the builder.
 */
export const RandomGraphs = {
  /** G(n, p): each of the n * n directed pairs with probability `edgeProb`. */
  gnp(n: number, edgeProb: number, seed: Seed): Graph {
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (rnd.nextDouble() < edgeProb) b.addEdge(u, v);
    return b.build();
  },

  /** G(n, m): exactly `m` random directed edges, with replacement. */
  gnm(n: number, m: number, seed: Seed): Graph {
    if (n === 0) return new GraphBuilder().build();
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i < m; i++) {
      const u = rnd.nextInt(n);
      b.addEdge(u, rnd.nextInt(n));
    }
    return b.build();
  },

  /** Random out-tree rooted at 0: each node i > 0 gets a random parent in [0, i). */
  randomTree(n: number, seed: Seed): Graph {
    if (n === 0) return new GraphBuilder().build();
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) b.addEdge(rnd.nextInt(i), i);
    return b.build();
  },

  /** Random forest of out-trees: each node i > 0 starts a tree with probability `rootProb`. */
  randomForest(n: number, rootProb: number, seed: Seed): Graph {
    if (n === 0) return new GraphBuilder().build();
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) if (rnd.nextDouble() >= rootProb) b.addEdge(rnd.nextInt(i), i);
    return b.build();
  },

  /** Forest of long chains: each node's parent is its predecessor, unless a new tree starts. */
  chainForest(n: number, rootProb: number, seed: Seed): Graph {
    if (n === 0) return new GraphBuilder().build();
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) if (rnd.nextDouble() >= rootProb) b.addEdge(i - 1, i);
    return b.build();
  },

  /** Random DAG: forward edges u < v, each with probability `edgeProb`. */
  randomDag(n: number, edgeProb: number, seed: Seed): Graph {
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let u = 0; u < n; u++) for (let v = u + 1; v < n; v++) if (rnd.nextDouble() < edgeProb) b.addEdge(u, v);
    return b.build();
  },

  /** Random bipartite graph: cross-class pairs with probability `edgeProb`, random direction. */
  randomBipartite(n: number, edgeProb: number, seed: Seed): Graph {
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    const secondClass: boolean[] = [];
    for (let i = 0; i < n; i++) secondClass.push(rnd.nextBoolean());
    for (let u = 0; u < n; u++) {
      for (let v = u + 1; v < n; v++) {
        if (secondClass[u] !== secondClass[v] && rnd.nextDouble() < edgeProb) {
          if (rnd.nextBoolean()) b.addEdge(u, v);
          else b.addEdge(v, u);
        }
      }
    }
    return b.build();
  },

  /** A copy of `graph` with `extraEdges` random edges added (duplicates and self-loops possible). */
  withExtraEdges(graph: Graph, extraEdges: number, seed: Seed): Graph {
    const n = graph.nodeCount;
    const rnd = new JavaRandom(seed);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let u = 0; u < n; u++) for (const v of graph.outNodes(u)) b.addEdge(u, v);
    for (let i = 0; i < extraEdges && n > 0; i++) {
      const u = rnd.nextInt(n);
      b.addEdge(u, rnd.nextInt(n));
    }
    return b.build();
  },

  /** A copy of `graph` with every edge stored in both directions; self-loops kept. */
  symmetrized(graph: Graph): Graph {
    const b = new GraphBuilder();
    b.addNodes(graph.nodeCount);
    for (let u = 0; u < graph.nodeCount; u++) {
      for (const v of graph.outNodes(u)) {
        b.addEdge(u, v);
        b.addEdge(v, u);
      }
    }
    return b.build();
  },

  /** Any of the four base generators with randomized size (10..500) and density. */
  anyGraph(seed: Seed): LabeledGraph {
    const s = BigInt(seed);
    const rnd = new JavaRandom(s);
    const n = pickNodeCount(rnd);
    const p = pickEdgeProb(rnd);
    const innerSeed = rnd.nextLong();
    switch (rnd.nextInt(4)) {
      case 0:
        return labeled(`gnp(p=${p.toFixed(3)})`, n, s, RandomGraphs.gnp(n, p, innerSeed));
      case 1: {
        const m = Math.min(Math.round(p * n * n), 0x7fffffff);
        return labeled(`gnm(m=${m})`, n, s, RandomGraphs.gnm(n, m, innerSeed));
      }
      case 2:
        return labeled("randomTree", n, s, RandomGraphs.randomTree(n, innerSeed));
      default:
        return labeled(`randomDag(p=${p.toFixed(3)})`, n, s, RandomGraphs.randomDag(n, p, innerSeed));
    }
  },

  /** A random forest of out-trees, bushy or chain-like, one tree or several. */
  anyForest(seed: Seed): LabeledGraph {
    const s = BigInt(seed);
    const rnd = new JavaRandom(s);
    const n = pickNodeCount(rnd);
    const innerSeed = rnd.nextLong();
    const rootProb = [0.0, 0.01, 0.1][rnd.nextInt(3)];
    switch (rnd.nextInt(3)) {
      case 0:
        return labeled("randomTree", n, s, RandomGraphs.randomTree(n, innerSeed));
      case 1:
        return labeled(
          `randomForest(rootProb=${rootProb.toFixed(2)})`,
          n,
          s,
          RandomGraphs.randomForest(n, rootProb, innerSeed),
        );
      default:
        return labeled(
          `chainForest(rootProb=${rootProb.toFixed(2)})`,
          n,
          s,
          RandomGraphs.chainForest(n, rootProb, innerSeed),
        );
    }
  },

  /**
   * A graph from the shapes on which the undirected predicates discriminate: bipartite graphs and
   * graphs one edge away, trees and forests stored in one or both directions, with extra edges.
   */
  anyUndirectedShape(seed: Seed): LabeledGraph {
    const s = BigInt(seed);
    const rnd = new JavaRandom(s);
    const n = pickNodeCount(rnd);
    const p = pickEdgeProb(rnd);
    const innerSeed = rnd.nextLong();
    const R = RandomGraphs;
    switch (rnd.nextInt(9)) {
      case 0:
        return labeled(`randomBipartite(p=${p.toFixed(3)})`, n, s, R.randomBipartite(n, p, innerSeed));
      case 1:
        return labeled(
          `randomBipartite(p=${p.toFixed(3)})+3`,
          n,
          s,
          R.withExtraEdges(R.randomBipartite(n, p, innerSeed), 3, innerSeed),
        );
      case 2:
        return labeled("randomTree", n, s, R.randomTree(n, innerSeed));
      case 3:
        return labeled("randomTree+1", n, s, R.withExtraEdges(R.randomTree(n, innerSeed), 1, innerSeed));
      case 4:
        return labeled("symmetrized(randomTree)", n, s, R.symmetrized(R.randomTree(n, innerSeed)));
      case 5:
        return labeled("randomForest(rootProb=0.05)", n, s, R.randomForest(n, 0.05, innerSeed));
      case 6:
        return labeled(
          "symmetrized(randomForest(rootProb=0.05))",
          n,
          s,
          R.symmetrized(R.randomForest(n, 0.05, innerSeed)),
        );
      case 7:
        return labeled("gnm(m=n)", n, s, R.gnm(n, n, innerSeed));
      default:
        return labeled(
          "symmetrized(randomTree+1)",
          n,
          s,
          R.symmetrized(R.withExtraEdges(R.randomTree(n, innerSeed), 1, innerSeed)),
        );
    }
  },

  /** A random DAG from `randomTree` or `randomDag`. */
  anyDag(seed: Seed): LabeledGraph {
    const s = BigInt(seed);
    const rnd = new JavaRandom(s);
    const n = pickNodeCount(rnd);
    const p = pickEdgeProb(rnd);
    const innerSeed = rnd.nextLong();
    return rnd.nextInt(2) === 0
      ? labeled("randomTree", n, s, RandomGraphs.randomTree(n, innerSeed))
      : labeled(`randomDag(p=${p.toFixed(3)})`, n, s, RandomGraphs.randomDag(n, p, innerSeed));
  },
} as const;

/** Node count uniformly in [10, 500]. */
function pickNodeCount(rnd: JavaRandom): number {
  return 10 + rnd.nextInt(500 - 10 + 1);
}

/** Edge density favoring sparse graphs. */
function pickEdgeProb(rnd: JavaRandom): number {
  const choices = [0.001, 0.002, 0.005, 0.01, 0.05, 0.1];
  return choices[rnd.nextInt(choices.length)];
}
