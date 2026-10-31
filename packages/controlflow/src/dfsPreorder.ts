import { Csr, type Graph, type IntList, IntLists } from "@kobayami/graphity-core";
import { MAX_ARRAY_LENGTH } from "./controlFlow.js";
import { checkIndex } from "./internal.js";

/**
 * Depth-first preorder of the nodes reachable from a list of entries - the first step of
 * `Loops`. The core keeps its own copy for `Dominators`: a package has no access to the
 * core's internal modules.
 *
 * Preorder numbers start at 1. Number 0 is a virtual root above all entries, so that several
 * entries need no special case downstream: every entry the search starts from is a child of the
 * virtual root, and {@link isEntry} marks every entry, also one that the search reached from an
 * earlier entry. Successors are visited in ascending node order and entries in list order.
 * Iterative; the frame stack lives on the heap.
 *
 * @internal
 */
export class DfsPreorder {
  /**
   * Largest supported node count, 2^30 - 6. The control-flow analyses hold two ints per preorder
   * number, the virtual root included, so `2 x (MAX_NODE_COUNT + 1)` has to stay within the
   * largest array, `MAX_ARRAY_LENGTH` of `controlFlow.ts`. Follows `DfsPreorder.MAX_NODE_COUNT` in
   * the core, which derives it from the one array limit there.
   */
  static readonly MAX_NODE_COUNT = Math.floor(MAX_ARRAY_LENGTH / 2) - 1;

  private constructor(
    /** Number of nodes reachable from the entries. */
    readonly reachedCount: number,
    /** Node with each preorder number, `order[0] == -1` for the virtual root. */
    readonly order: Int32Array,
    /** Preorder number of each node, 0 for a node not reachable from any entry. */
    readonly preorderNumber: Int32Array,
    /** Preorder number of each node's parent in the search tree, 0 below the virtual root. */
    readonly parent: Int32Array,
    /** Bit set over preorder numbers: set for every entry. */
    private readonly entryBits: Int32Array,
  ) {}

  /**
   * Rejects a node count above {@link DfsPreorder.MAX_NODE_COUNT}. The message names the reason of
   * the limit, which lies in `Dominators`, not in the caller.
   *
   * @throws Error if `nodeCount > MAX_NODE_COUNT`
   */
  static checkNodeCount(nodeCount: number, analysis: string): void {
    if (nodeCount > DfsPreorder.MAX_NODE_COUNT) {
      throw new Error(
        `${analysis} takes the node limit of Dominators, which keeps two ints per node in one array, counting its virtual root: nodeCount must be <= ${DfsPreorder.MAX_NODE_COUNT}, but was ${nodeCount}`,
      );
    }
  }

  /**
   * Runs the search.
   *
   * @param analysis name of the calling analysis, for the error message
   * @throws RangeError if an entry is out of range
   * @throws Error if `graph.nodeCount > MAX_NODE_COUNT`
   */
  static of(graph: Graph, entryList: IntList, analysis: string): DfsPreorder {
    const n = graph.nodeCount;
    DfsPreorder.checkNodeCount(n, analysis);
    const entries = IntLists.asArrayLike(entryList);
    const entryCount = entries.length;
    for (let i = 0; i < entryCount; i++) checkIndex(entries[i], n);
    const out = Csr.outAdjacencyStart(graph);
    const adj = Csr.outAdjacency(graph);

    const preorderNumber = new Int32Array(n);
    const order = new Int32Array(n + 1);
    const parent = new Int32Array(n + 1);
    order[0] = -1;
    parent[0] = -1;
    // A frame is (node, resume cursor), interleaved, so both reads of a frame hit one cache line.
    let frames = new Int32Array(2 * Math.max(16, Math.min(n, 1024)));
    let count = 0;

    for (let e = 0; e < entryCount; e++) {
      const entry = entries[e];
      if (preorderNumber[entry] !== 0) continue;
      preorderNumber[entry] = ++count;
      order[count] = entry;
      parent[count] = 0;
      frames[0] = entry;
      frames[1] = out[entry];
      let top = 0;

      outer: while (top >= 0) {
        const u = frames[2 * top];
        let i = frames[2 * top + 1];
        const end = out[u + 1];
        while (i < end) {
          const v = adj[i++];
          if (preorderNumber[v] === 0) {
            frames[2 * top + 1] = i;
            preorderNumber[v] = ++count;
            order[count] = v;
            parent[count] = preorderNumber[u];
            if (2 * (++top + 1) > frames.length) {
              // At most one frame per node, so 2 x nodeCount suffices.
              const grown = new Int32Array(Math.min(2 * frames.length, 2 * n));
              grown.set(frames);
              frames = grown;
            }
            frames[2 * top] = v;
            frames[2 * top + 1] = out[v];
            continue outer;
          }
        }
        top--;
      }
    }

    // 32-bit words where Java has 64-bit ones: JavaScript's integer operators are 32-bit.
    const entryBits = new Int32Array((count >> 5) + 1);
    for (let e = 0; e < entryCount; e++) {
      const number = preorderNumber[entries[e]];
      entryBits[number >> 5] |= 1 << (number & 31);
    }
    return new DfsPreorder(count, order, preorderNumber, parent, entryBits);
  }

  /** Whether the node with this preorder number is one of the entries. */
  isEntry(number: number): boolean {
    return (this.entryBits[number >> 5] & (1 << (number & 31))) !== 0;
  }
}
