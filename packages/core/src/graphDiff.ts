import type { Edges } from "./edges.js";

/**
 * The edges added and removed between two graphs over the same nodes, as {@link Graphs.diff}
 * returns them.
 *
 * Each edge comes with its edge index in the graph it belongs to: an added edge with its edge index
 * in the newer graph, a removed edge with its edge index in the older one. With these edge indices,
 * the caller can look up data on the edges of either graph in arrays indexed by edge index. Both
 * lists are in edge index order. To see whether a graph changed without keeping the older one,
 * compare hashes from {@link Graphs.topologyHash} instead.
 *
 * Instances are immutable.
 *
 * **Memory:** 12 bytes per added or removed edge.
 */
export class GraphDiff {
  readonly #addedEdges: Edges;
  readonly #removedEdges: Edges;

  private constructor(addedEdges: Edges, removedEdges: Edges) {
    this.#addedEdges = addedEdges;
    this.#removedEdges = removedEdges;
  }

  /** @internal Takes the two lists as they are. */
  static create(addedEdges: Edges, removedEdges: Edges): GraphDiff {
    return new GraphDiff(addedEdges, removedEdges);
  }

  /**
   * The edges of the newer graph that the older one does not have, with their edge indices in the
   * newer graph, in edge index order (Java: `addedEdges()`).
   *
   * **Time:** O(1).
   */
  get addedEdges(): Edges {
    return this.#addedEdges;
  }

  /**
   * The edges of the older graph that the newer one does not have, with their edge indices in the
   * older graph, in edge index order (Java: `removedEdges()`).
   *
   * **Time:** O(1).
   */
  get removedEdges(): Edges {
    return this.#removedEdges;
  }

  /**
   * Whether no edge was added or removed, that is, whether the two graphs are equal. Equivalent to
   * `addedEdges.isEmpty && removedEdges.isEmpty` (Java: `isEmpty()`).
   *
   * **Time:** O(1).
   */
  get isEmpty(): boolean {
    return this.#addedEdges.isEmpty && this.#removedEdges.isEmpty;
  }

  /**
   * Returns the numbers of added and removed edges, for debuggers and logs.
   *
   * **Time:** O(1).
   */
  toString(): string {
    return `GraphDiff[added=${this.#addedEdges.count}, removed=${this.#removedEdges.count}]`;
  }
}
