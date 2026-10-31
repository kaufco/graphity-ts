import type { MermaidWriter } from "./mermaidWriter.js";
import { Csr, type EdgeConsumer, type Graph, type NodePartition } from "@kobayami/graphity-core";

/** The groups drawn as clusters, with the label of each; set together, so held together. */
interface Clusters {
  readonly partition: NodePartition;
  readonly label: (group: number) => string | null | undefined;
}

/**
 * @internal The graph, the node filter, the undirected reading and the clusters of a
 * {@link MermaidWriter}, and the order in which edges are written. `@kobayami/graphity-dot` keeps
 * its own copy for `DotWriter`, as Java's modules do: a package uses only the public API of
 * another. Change both together.
 */
export class Selection {
  readonly graph: Graph;
  private readonly outAdjacencyStart: Int32Array;
  private readonly outAdjacency: Int32Array;
  nodeFilter: ((node: number) => boolean) | null = null;
  undirected = false;
  clusters: Clusters | null = null;

  constructor(graph: Graph) {
    this.graph = graph;
    this.outAdjacencyStart = Csr.outAdjacencyStart(graph);
    this.outAdjacency = Csr.outAdjacency(graph);
  }

  /**
   * Sets the groups drawn as clusters (Java: `clusters(partition, label)`).
   *
   * @throws Error if the partition covers a different number of nodes
   */
  setClusters(partition: NodePartition, label: (group: number) => string | null | undefined): void {
    if (partition.nodeCount !== this.graph.nodeCount) {
      throw new Error(`the partition covers ${partition.nodeCount} nodes, the graph has ${this.graph.nodeCount}`);
    }
    this.clusters = { partition, label };
  }

  isIncluded(node: number): boolean {
    return this.nodeFilter === null || this.nodeFilter(node);
  }

  /** The cluster of a node, `-1` for none. */
  clusterOf(node: number): number {
    return this.clusters === null ? -1 : this.clusters.partition.get(node);
  }

  /**
   * Whether the edge `source -> target` of an included source is written: its target included,
   * and in the undirected reading only one edge per reciprocal pair, the one from the lower node
   * ID.
   */
  private isWritten(source: number, target: number): boolean {
    if (!this.isIncluded(target)) return false;
    return !this.undirected || source <= target || !this.graph.hasOutNode(target, source);
  }

  /** Calls `action` for every written edge, in edge index order. */
  forEachWrittenEdge(action: EdgeConsumer): void {
    const n = this.graph.nodeCount;
    const outAdjacencyStart = this.outAdjacencyStart;
    const outAdjacency = this.outAdjacency;
    for (let source = 0; source < n; source++) {
      if (!this.isIncluded(source)) continue;
      for (let e = outAdjacencyStart[source], end = outAdjacencyStart[source + 1]; e < end; e++) {
        const target = outAdjacency[e];
        if (this.isWritten(source, target)) action(source, target, e);
      }
    }
  }
}

/** @internal Whether `name` is a plain identifier: a letter or underscore, then also digits. */
export function isIdentifier(name: string): boolean {
  if (name.length === 0) return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    const letter = (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || c === 0x5f;
    const digit = c >= 0x30 && c <= 0x39;
    if (!(letter || (i > 0 && digit))) return false;
  }
  return true;
}
