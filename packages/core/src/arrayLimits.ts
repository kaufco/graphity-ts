/** The JDK's soft maximum array length. */
const MAX_ARRAY_LENGTH = 0x7fffffff - 8;

/**
 * The largest array the library allocates, and the limits derived from it.
 *
 * The values are Java's - the JDK's soft maximum array length, `2^31 - 9` - so that every port
 * accepts and rejects the same graphs with the same messages. JavaScript engines allow typed arrays
 * of that length on 64-bit platforms; node IDs are 32-bit integers in any case.
 * `@kobayami/graphity-controlflow` cannot see this module and repeats the numbers it needs, each
 * with a note that it follows this one.
 *
 * @internal
 */
export const ArrayLimits = {
  /** The JDK's soft maximum array length. */
  MAX_ARRAY_LENGTH,

  /**
   * Largest node count of a graph, `2^31 - 10`: its `nodeCount + 1` node offsets fill the largest
   * array. The node limit of `GraphBuilder`, the group limit of `NodePartition.of` and the bound on
   * the node count that `Graph.readFrom` accepts from a header.
   */
  MAX_NODE_COUNT: MAX_ARRAY_LENGTH - 1,

  /**
   * Largest node count for an array of two ints per node, 2^30 - 5: the lanes of Tarjan's
   * algorithm, the double cover of `Graphs.isBipartite` and the frames of a depth-first path
   * through every node.
   */
  MAX_NODE_COUNT_TWO_INTS: Math.floor(MAX_ARRAY_LENGTH / 2),

  /**
   * Rejects a node count above `maxNodeCount`, the most nodes for which `algorithm` fits its two
   * ints per node into one array, counting a virtual root as a node if the algorithm adds one.
   *
   * @throws Error if `nodeCount > maxNodeCount`
   */
  checkNodeCount(nodeCount: number, maxNodeCount: number, algorithm: string): void {
    if (nodeCount > maxNodeCount) {
      throw new Error(
        `${algorithm} keeps two ints per node in one array, counting a virtual root if it adds one, and so requires nodeCount <= ${maxNodeCount}, but was ${nodeCount}`,
      );
    }
  },
} as const;
