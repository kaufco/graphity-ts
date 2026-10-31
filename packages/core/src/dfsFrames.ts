import { ArrayLimits } from "./arrayLimits.js";

/** Most frames a stack holds, 2^30 - 5: as many as fit into the largest array. */
const MAX_DEPTH = ArrayLimits.MAX_NODE_COUNT_TWO_INTS;

/** The largest array, rounded down to whole frames. */
const MAX_LENGTH = 2 * MAX_DEPTH;

/**
 * The growth of the frame stacks of the depth-first searches without recursion. A frame is two
 * interleaved ints, the node and its resume position in the adjacency array, so a stack of depth
 * `d` needs `2 x d` ints. Only the growth is shared, as it runs once per doubling; each search
 * keeps its own loop over the edges, which a shared loop would slow down.
 *
 * @internal
 */
export const DfsFrames = {
  /** Initial capacity: one frame per node, but at least 16 and at most 1024 frames. */
  initial(nodeCount: number): Int32Array {
    return new Int32Array(2 * Math.max(16, Math.min(nodeCount, 1024)));
  },

  /**
   * Doubles the stack, capped at one frame per node and at the array limit.
   *
   * @throws Error if the search is deeper than an array can hold, which takes a path of more than
   *     2^30 - 5 nodes
   */
  grow(frames: Int32Array, nodeCount: number): Int32Array {
    let wanted = Math.min(2 * frames.length, 2 * nodeCount);
    if (wanted > MAX_LENGTH) {
      if (frames.length >= MAX_LENGTH) {
        throw new Error(`a depth-first path is longer than ${MAX_DEPTH} nodes, the most frames an array can hold`);
      }
      wanted = MAX_LENGTH;
    }
    const grown = new Int32Array(wanted);
    grown.set(frames.subarray(0, Math.min(frames.length, wanted)));
    return grown;
  },
} as const;
