import { type Graph, GraphBuilder } from "../../src/index.js";
import { JavaRandom } from "./javaRandom.js";

/** A generated graph with its recipe, for reproducible failure messages. */
export interface LabeledCfg {
  readonly generator: string;
  readonly nodeCount: number;
  readonly seed: bigint;
  readonly graph: Graph;
  describe(): string;
}

function labeled(generator: string, nodeCount: number, seed: bigint, graph: Graph): LabeledCfg {
  return { generator, nodeCount, seed, graph, describe: () => `gen=${generator}, n=${nodeCount}, seed=${seed}` };
}

type Seed = bigint | number;

/**
 * Generators for graphs shaped like control flow, as Java's `ControlFlowGraphs`: node 0 is the
 * entry and every node is reachable from it. Structured code with nested loops, the same with
 * jumps that make it irreducible, ladders, chains, and the fan behind a chain.
 */
export const ControlFlowGraphs = {
  /**
   * Structured control flow, reducible throughout: starting from the edge `0 -> 1`, a random edge
   * is replaced by a sequence, an if-then, an if-then-else, a while or a do-while loop, until the
   * graph has at least `targetNodes` nodes.
   */
  structured(targetNodes: number, seed: Seed): Graph {
    const rnd = new JavaRandom(seed);
    const sources = [0];
    const targets = [1];
    let n = 2;
    const add = (...pairs: number[]) => {
      for (let i = 0; i < pairs.length; i += 2) {
        sources.push(pairs[i]);
        targets.push(pairs[i + 1]);
      }
    };
    while (n < targetNodes) {
      const e = rnd.nextInt(sources.length);
      const a = sources[e];
      const b = targets[e];
      const last = sources.length - 1;
      sources[e] = sources[last];
      targets[e] = targets[last];
      sources.pop();
      targets.pop();
      switch (rnd.nextInt(5)) {
        case 0: {
          const x = n++;
          add(a, x, x, b);
          break;
        }
        case 1: {
          const cond = n++;
          const then = n++;
          add(a, cond, cond, then, cond, b, then, b);
          break;
        }
        case 2: {
          const cond = n++;
          const then = n++;
          const otherwise = n++;
          add(a, cond, cond, then, cond, otherwise, then, b, otherwise, b);
          break;
        }
        case 3: {
          const header = n++;
          const body = n++;
          add(a, header, header, body, body, header, header, b);
          break;
        }
        default: {
          const body = n++;
          const cond = n++;
          add(a, body, body, cond, cond, body, cond, b);
        }
      }
    }
    const builder = new GraphBuilder();
    builder.addNodes(n);
    for (let i = 0; i < sources.length; i++) builder.addEdge(sources[i], targets[i]);
    return builder.build();
  },

  /** {@link structured} with `jumps` random extra edges between non-entry nodes. */
  irreducible(targetNodes: number, jumps: number, seed: Seed): Graph {
    const base = ControlFlowGraphs.structured(targetNodes, seed);
    const n = base.nodeCount;
    const rnd = new JavaRandom(BigInt.asIntN(64, BigInt(seed) ^ BigInt.asIntN(64, 0x9e3779b97f4a7c15n)));
    const b = new GraphBuilder();
    b.addGraph(base);
    for (let i = 0; i < jumps; i++) {
      const u = 1 + rnd.nextInt(n - 1);
      b.addEdge(u, 1 + rnd.nextInt(n - 1));
    }
    return b.build();
  },

  /** A ladder of `rungs` branches with a common exit; dominance frontiers grow quadratically. */
  ladder(rungs: number): Graph {
    const exit = 2 * rungs;
    const b = new GraphBuilder();
    b.addNodes(2 * rungs + 1);
    for (let i = 0; i < rungs; i++) {
      b.addEdge(i, rungs + i);
      if (i + 1 < rungs) {
        b.addEdge(i, i + 1);
        b.addEdge(rungs + i, rungs + i + 1);
      }
    }
    if (rungs > 0) {
      b.addEdge(rungs - 1, exit);
      b.addEdge(2 * rungs - 1, exit);
    }
    return b.build();
  },

  /** A straight-line chain `0 -> 1 -> ... -> n-1`. */
  chain(n: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i + 1 < n; i++) b.addEdge(i, i + 1);
    return b.build();
  },

  /** A fan behind a chain, on which plain SEMI-NCA and the iterative algorithm turn quadratic. */
  fanBehindChain(chainLength: number, fanWidth: number): Graph {
    const b = new GraphBuilder();
    b.addNodes(1 + chainLength + fanWidth);
    for (let i = 0; i < chainLength; i++) b.addEdge(i, i + 1);
    for (let f = 0; f < fanWidth; f++) {
      const fan = 1 + chainLength + f;
      b.addEdge(chainLength, fan);
      b.addEdge(0, fan);
    }
    return b.build();
  },

  /** A control-flow graph of a random shape and size (4..203 nodes) for fuzzing. */
  anyControlFlowGraph(seed: Seed): LabeledCfg {
    const s = BigInt(seed);
    const rnd = new JavaRandom(s);
    const n = 4 + rnd.nextInt(200);
    const innerSeed = rnd.nextLong();
    const C = ControlFlowGraphs;
    switch (rnd.nextInt(8)) {
      case 0:
      case 1:
      case 2:
        return labeled("structured", n, s, C.structured(n, innerSeed));
      case 3:
      case 4: {
        const jumps = 1 + rnd.nextInt(Math.max(1, Math.trunc(n / 10)));
        return labeled(`irreducible(jumps=${jumps})`, n, s, C.irreducible(n, jumps, innerSeed));
      }
      case 5:
        return labeled("ladder", n, s, C.ladder(Math.trunc(n / 2)));
      case 6:
        return labeled("chain", n, s, C.chain(n));
      default:
        return labeled("fanBehindChain", n, s, C.fanBehindChain(Math.trunc(n / 2), n - Math.trunc(n / 2) - 1));
    }
  },
} as const;
