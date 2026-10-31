import {
  BiAdjacentGraph,
  type Graph,
  Graphs,
  NodeMapping,
  NodePartition,
  type SortedIntView,
  TopOrder,
} from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** A subgraph with its mapping and data. */
export interface Subgraph {
  readonly loading: Graph;
  readonly newToOld: NodeMapping;
  readonly loadingNames: string[];
  readonly savingAndShowing: Graph;
}

/** Renumbered graphs. */
export interface Renumbered {
  readonly inSearchOrder: Graph;
  readonly searchOrder: NodeMapping;
  readonly inRunOrder: Graph;
  readonly runOrder: NodeMapping;
}

/** Node data carried over, and node IDs translated. */
export interface NodeData {
  readonly loadingLines: Int32Array;
  readonly newIdOfParse: number;
  readonly mainKept: boolean;
  readonly partial: boolean;
  readonly mappedCount: number;
  readonly indexCount: number;
  readonly secondToOriginal: NodeMapping;
  readonly calleeLines: Int32Array;
}

/** The transposed graph with its edge data. */
export interface Transposed {
  readonly calledBy: BiAdjacentGraph;
  readonly transposedIndexOfLoadToRead: number;
  readonly callersOfFormat: readonly string[];
}

/** Groups of the caller's own and the condensed graph. */
export interface OwnGroups {
  readonly byPackage: NodePartition;
  readonly packageCalls: Graph;
  readonly groupCount: number;
  readonly sizeOfService: number;
  readonly methodsOfService: SortedIntView;
}

/** Data combined per group. */
export interface Combined {
  readonly linesPerPackage: Int32Array;
  readonly sitesPerPackageCall: Int32Array;
  readonly behind: SortedIntView;
}

/** Subgraphs, renumbered and transposed graphs, groups of one's own, and their data. */
export const TransformingGraphs = {
  /** The number of call sites of each call, by edge index of the calls. */
  siteCount(): Int32Array {
    const calls = SmallProgram.calls();
    const siteCount = new Int32Array(calls.edgeCount);
    for (const site of SmallProgram.callSites()) {
      siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
    }
    return siteCount;
  },

  /**
   * Returns the subgraph of the methods that load reaches, and that of four given
   * methods.
   */
  subgraph(): Subgraph {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const load = SmallProgram.nodeOf(names, "load");
    // @start region="subgraph"
    // The subgraph of the methods that load reaches:
    const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
    const loading = Graphs.remapped(calls, newToOld);
    // loading: 0 -> [1, 2], 1 -> [1], 2 -> [] - load -> [parse, read], parse -> [parse]

    // The names come along through the mapping, from new to old node IDs.
    const loadingNames = new Array<string>(loading.nodeCount);
    newToOld.gather(names, loadingNames);   // [load, parse, read]

    // Or a subgraph of nodes given by their node IDs: save, show, format and write.
    const savingAndShowing = Graphs.remapped(calls, NodeMapping.forSubgraph(4, 5, 7, 9));
    // savingAndShowing: 0 -> [2, 3], 1 -> [2], 2 -> [2], 3 -> [] - save, show, format,
    // write
    // @end
    return { loading, newToOld, loadingNames, savingAndShowing };
  },

  /**
   * Returns the calls numbered in depth-first order, and the steps in topological order.
   */
  renumbered(): Renumbered {
    const calls = SmallProgram.calls();
    const steps = SmallProgram.buildSteps();
    // @start region="renumber"
    // In the order of a depth-first search: nodes visited one after another get adjacent
    // IDs.
    const searchOrder = NodeMapping.reindex(calls);
    const inSearchOrder = Graphs.remapped(calls, searchOrder);
    // searchOrder, new to old: [0, 1, 2, 3, 6, 8, 4, 7, 9, 5] - parse and read follow
    // load

    // In an order of your own, here a topological one: every edge then goes to a higher
    // ID.
    const runOrder = NodeMapping.forPermutation(TopOrder.of(steps));
    const inRunOrder = Graphs.remapped(steps, runOrder);
    // runOrder, new to old: [2, 0, 1, 4, 3, 5, 6, 7, 8] - lint, generate, compile, docs,
    // ...
    // @end
    return { inSearchOrder, searchOrder, inRunOrder, runOrder };
  },

  /**
   * Returns node data of the subgraph of load and translations between old and new IDs.
   */
  nodeData(): NodeData {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const load = SmallProgram.nodeOf(names, "load");
    const parse = SmallProgram.nodeOf(names, "parse");
    const main = SmallProgram.nodeOf(names, "main");
    const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
    const loading = Graphs.remapped(calls, newToOld);
    // @start region="nodeData"
    // The lines of code of each method:
    const linesOf = Int32Array.of(12, 30, 20, 25, 18, 15, 60, 40, 10, 10);
    const loadingLines = newToOld.gather(linesOf);   // [25, 60, 10] - load, parse, read

    // From old to new node IDs: the inverse mapping. Not every old node has a new one.
    const oldToNew = newToOld.inverted(calls.nodeCount);
    const newIdOfParse = oldToNew.get(parse);        // 1 - parse is node 1 of loading
    const mainKept = oldToNew.isMapped(main);        // false - main is not in loading
    // true - 7 of 10 old nodes are not kept
    const partial = oldToNew.isPartial;
    const mappedCount = oldToNew.mappedCount;        // 3 - load, parse, read
    const indexCount = oldToNew.indexCount;          // 10 - the methods of calls

    // Transformed twice - loading, then its subgraph of the out-nodes of its node 0,
    // load: compose the two mappings, and gather from the data of calls in one step.
    const secondToFirst = NodeMapping.forSubgraph(loading.outNodes(0));
    const secondToOriginal = newToOld.compose(secondToFirst);
    const calleeLines = secondToOriginal.gather(linesOf);   // [60, 10] - parse, read
    // @end
    return {
      loadingLines,
      newIdOfParse,
      mainKept,
      partial,
      mappedCount,
      indexCount,
      secondToOriginal,
      calleeLines,
    };
  },

  /** Returns the call sites of each call of the subgraph of load. */
  edgeData(): Int32Array {
    const calls = SmallProgram.calls();
    const load = SmallProgram.nodeOf(SmallProgram.methodNames(), "load");
    const siteCount = TransformingGraphs.siteCount();
    const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
    const loading = Graphs.remapped(calls, newToOld);
    // @start region="edgeData"
    const edges = Graphs.edgeMapping(loading, calls, newToOld);
    const loadingSiteCount = edges.gather(siteCount);
    // loadingSiteCount: [1, 1, 2] - load -> parse, load -> read, parse -> parse
    // @end
    return loadingSiteCount;
  },

  /**
   * Returns the callers of format with their call sites, through the transposed graph.
   */
  transposed(): Transposed {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const format = SmallProgram.nodeOf(names, "format");
    const siteCount = TransformingGraphs.siteCount();
    const loadToRead = calls.edgeIndexOf(
      SmallProgram.nodeOf(names, "load"),
      SmallProgram.nodeOf(names, "read"),
    );
    // @start region="transposed"
    const both = BiAdjacentGraph.of(calls);
    const calledBy = both.transposed();   // without copying
    const transposedIndex = both.transposedEdgeIndex(loadToRead);   // 10 - read -> load

    // The edge data, by edge index of the transposed graph:
    const calledBySiteCount = Graphs.transposedEdgeMapping(calls).gather(siteCount);
    const callersOfFormat: string[] = [];
    for (
      let edge = calledBy.outEdgeStart(format);
      edge < calledBy.outEdgeEnd(format);
      edge++
    ) {
      callersOfFormat.push(
        `${names[calledBy.edgeTarget(edge)]}: ${calledBySiteCount[edge]}`,
      );
    }
    // callersOfFormat: [save: 1, show: 1, format: 1]
    // @end
    return { calledBy, transposedIndexOfLoadToRead: transposedIndex, callersOfFormat };
  },

  /** Returns the calls grouped by package and condensed. */
  ownGroups(): OwnGroups {
    const calls = SmallProgram.calls();
    const packageOf = SmallProgram.packageOf();
    const service = SmallProgram.nodeOf(SmallProgram.packageNames(), "service");
    // @start region="ownGroups"
    const byPackage = NodePartition.of(calls, packageOf, 8);
    const groupCount = byPackage.groupCount;               // 8 - json and util are empty
    const sizeOfService = byPackage.sizeOf(service);       // 2
    const methodsOfService = byPackage.nodesOf(service);   // [3, 4] - load and save

    // The calls between packages: an edge wherever a method of one calls a method of
    // another.
    const packageCalls = byPackage.condense();
    // packageCalls: app -> [cli, ui, service], ui -> [model], service -> [model, storage]
    // @end
    return { byPackage, packageCalls, groupCount, sizeOfService, methodsOfService };
  },

  /** Returns node and edge data combined per package. */
  combined(): Combined {
    const calls = SmallProgram.calls();
    const byPackage = NodePartition.of(calls, SmallProgram.packageOf(), 8);
    const packageCalls = byPackage.condense();
    const packages = SmallProgram.packageNames();
    const service = SmallProgram.nodeOf(packages, "service");
    const model = SmallProgram.nodeOf(packages, "model");
    const siteCount = TransformingGraphs.siteCount();
    // @start region="reduce"
    // The lines of code of each method:
    const linesOf = Int32Array.of(12, 30, 20, 25, 18, 15, 60, 40, 10, 10);
    const linesPerPackage = byPackage.reduce(linesOf, 0, (sum, lines) => sum + lines);
    // linesPerPackage: [32, 30, 15, 43, 100, 20, 0, 0] - model has 100, json and util
    // none

    // Edge data: which calls are behind each call between packages, and their sum.
    const byPackageCall = Graphs.edgePartition(packageCalls, byPackage);
    const behind = byPackageCall.edgesOf(packageCalls.edgeIndexOf(service, model));
    // behind: [5, 7] - load -> parse and save -> format
    const sitesPerPackageCall = byPackageCall.reduce(
      siteCount,
      0,
      (sum, sites) => sum + sites,
    );
    // sitesPerPackageCall: [1, 2, 2, 1, 2, 2] - app -> cli has 1, service -> model 2
    // @end
    return { linesPerPackage, sitesPerPackageCall, behind };
  },
} as const;
