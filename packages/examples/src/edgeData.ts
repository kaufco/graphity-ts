import { SmallProgram } from "./smallProgram.js";

/** Data on edges, in arrays indexed by edge index. */
export const EdgeData = {
  /** Returns the number of call sites of each call, by edge index of `calls`. */
  callSitesPerEdge(): Int32Array {
    const calls = SmallProgram.calls();
    const callSites = SmallProgram.callSites();
    // @start region="edgeIndexOf"
    const siteCount = new Int32Array(calls.edgeCount);
    for (const site of callSites) {
      siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
    }
    // 2 for run -> show and for parse -> parse, 1 for every other edge
    // @end
    return siteCount;
  },

  /** Prints each method that `run` calls, with the number of call sites. */
  calleesOfRun(): void {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const run = SmallProgram.nodeOf(names, "run");
    const siteCount = EdgeData.callSitesPerEdge();
    // @start region="outEdges"
    for (let edge = calls.outEdgeStart(run); edge < calls.outEdgeEnd(run); edge++) {
      console.log(`${names[calls.edgeTarget(edge)]}: ${siteCount[edge]}`);
    }
    // load: 1
    // save: 1
    // show: 2
    // @end
  },
} as const;
