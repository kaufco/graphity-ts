import { type Graph, Graphs, NodeMapping } from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** The data on the calls, and the subgraph that `load` reaches with its data. */
export interface CallData {
  readonly names: string[];
  readonly packages: string[];
  readonly siteCount: Int32Array;
  readonly loading: Graph;
  readonly loadingNames: string[];
  readonly loadingSiteCount: Int32Array;
}

/**
 * Data on nodes and edges in arrays of your own, one per attribute, and how a subgraph
 * takes it.
 */
export const DataOnNodesAndEdges = {
  /**
   * Returns an object per method and the call sites per call, for the calls and their
   * subgraph.
   */
  callData(): CallData {
    const calls = SmallProgram.calls();
    const callSites = SmallProgram.callSites();
    const load = SmallProgram.nodeOf(SmallProgram.methodNames(), "load");
    // @start region="columns"
    interface Method { readonly name: string; readonly pkg: string }
    const methods: Method[] = [                         // methods[node]
      { name: "main", pkg: "app" }, { name: "parseArgs", pkg: "cli" },
      { name: "run", pkg: "app" }, { name: "load", pkg: "service" },
      { name: "save", pkg: "service" }, { name: "show", pkg: "ui" },
      { name: "parse", pkg: "model" }, { name: "format", pkg: "model" },
      { name: "read", pkg: "storage" }, { name: "write", pkg: "storage" }];

    const siteCount = new Int32Array(calls.edgeCount);  // siteCount[edgeIndex]
    for (const site of callSites) {
      siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
    }
    // siteCount: 2 for run -> show and for parse -> parse, 1 for every other call
    // @end
    // @start region="carryAlong"
    const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
    const loading = Graphs.remapped(calls, newToOld);
    // loading: load -> parse, load -> read, parse -> parse

    const loadingMethods = new Array<Method>(loading.nodeCount);
    newToOld.gather(methods, loadingMethods);
    // loadingMethods: load, parse, read

    const loadingSiteCount = Graphs.edgeMapping(loading, calls, newToOld).gather(
      siteCount,
    );
    // loadingSiteCount: 1 for load -> parse and for load -> read, 2 for parse -> parse
    // @end
    return {
      names: methods.map((method) => method.name),
      packages: methods.map((method) => method.pkg),
      siteCount,
      loading,
      loadingNames: loadingMethods.map((method) => method.name),
      loadingSiteCount,
    };
  },
} as const;
