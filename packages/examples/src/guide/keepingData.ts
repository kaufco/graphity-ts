import { SmallProgram } from "../smallProgram.js";

/** The data the example keeps and reads. */
export interface Data {
  readonly packageOf: readonly string[];
  readonly siteCount: Int32Array;
  readonly lines: readonly string[];
}

/** Data on the nodes and edges of a graph, in arrays of the caller's own. */
export const KeepingData = {
  /**
   * Returns the package of each method and the call sites of each call, and prints the
   * calls.
   */
  callData(): Data {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const callSites = SmallProgram.callSites();
    // @start region="data"
    // Data on nodes: one array per kind of data, indexed by node ID.
    const packageOf = ["app", "cli", "app", "service", "service", "ui", "model", "model",
      "storage", "storage"];

    // Data on edges: one array per kind of data, indexed by edge index.
    const siteCount = new Int32Array(calls.edgeCount);
    for (const site of callSites) {
      siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
    }
    // @end
    // @start region="forEachEdge"
    // The calls between packages, each with its number of call sites. The edge index
    // finds the data of an edge in its arrays.
    const lines: string[] = [];
    calls.forEachEdge((caller, callee, edge) => {
      if (packageOf[caller] !== packageOf[callee]) {
        lines.push(`${names[caller]} -> ${names[callee]}: ${siteCount[edge]}`);
      }
    });
    // lines: [main -> parseArgs: 1, run -> load: 1, run -> save: 1, run -> show: 2,
    //         load -> parse: 1, load -> read: 1, save -> format: 1, save -> write: 1,
    //         show -> format: 1]
    // @end
    return { packageOf, siteCount, lines };
  },
} as const;
