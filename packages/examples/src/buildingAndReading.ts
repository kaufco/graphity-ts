import { BackEdges, Csr, type Graph, GraphBuilder } from "@kobayami/graphity";
import { EdgeData } from "./edgeData.js";
import { SmallProgram } from "./smallProgram.js";

/** Building a graph with `GraphBuilder`, and reading its edges in bulk. */
export const BuildingAndReading = {
  /** Builds the calls between the methods from the call sites, one edge per call site. */
  callsFromCallSites(): Graph {
    const names = SmallProgram.methodNames();
    const callSites = SmallProgram.callSites();
    // @start region="build"
    const builder = new GraphBuilder();
    builder.addNodes(names.length);    // one node per method, numbered as in names
    for (const site of callSites) {
      builder.addEdge(site.caller, site.callee);
    }
    const calls = builder.build();
    // 14 call sites, 12 edges: run -> show and parse -> parse were added twice
    // @end
    return calls;
  },

  /**
   * Builds part of the dependencies between the packages with each form in which the
   * batch methods take node IDs. TypeScript only: Java has an overload for `int...` and
   * one for `IntList`.
   */
  argumentForms(): Graph {
    const dependencies = SmallProgram.dependencies();
    // @start region="argumentForms"
    const builder = new GraphBuilder();
    builder.addNodes(dependencies.nodeCount);
    builder.addOutEdges(0, 1, 2, 3);                   // loose arguments
    builder.addOutEdges(2, [3, 4, 7]);                 // an array or a typed array
    builder.addOutEdges(3, dependencies.outNodes(3));  // a SortedIntView, without a copy
    const someDependencies = builder.build();
    // app -> [cli, ui, service], ui -> [service, model, util],
    // service -> [model, storage]
    // @end
    return someDependencies;
  },

  /**
   * Returns the dependencies of a next version of the program, in which ui also uses
   * storage.
   */
  nextVersion(): Graph {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const ui = SmallProgram.nodeOf(names, "ui");
    const storage = SmallProgram.nodeOf(names, "storage");
    // @start region="addGraph"
    const builder = new GraphBuilder();
    // into an empty builder: the node IDs stay the same
    builder.addGraph(dependencies);
    builder.addEdge(ui, storage);
    const nextVersion = builder.build();
    // @end
    return nextVersion;
  },

  /** Returns the number of callers of each method, by node ID of `calls`. */
  callerCounts(): Int32Array {
    const calls = SmallProgram.calls();
    // @start region="loop"
    const start = Csr.outAdjacencyStart(calls);
    const callees = Csr.outAdjacency(calls);
    const callerCount = new Int32Array(calls.nodeCount);
    for (let method = 0; method < calls.nodeCount; method++) {
      for (let edge = start[method], end = start[method + 1]; edge < end; edge++) {
        callerCount[callees[edge]]++;
      }
    }
    // callerCount: 3 for format, 2 for parse, 0 for main, 1 for every other method
    // @end
    return callerCount;
  },

  /** Prints the recursive calls, with the number of call sites of each. */
  recursiveCalls(): void {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const siteCount = EdgeData.callSitesPerEdge();
    // @start region="edges"
    const recursive = BackEdges.of(calls);
    for (let p = 0; p < recursive.count; p++) {
      const caller = recursive.sourceNodes[p];
      const callee = recursive.targetNodes[p];
      const edge = recursive.edgeIndices[p];
      console.log(`${names[caller]} -> ${names[callee]}: ${siteCount[edge]}`);
    }
    // parse -> parse: 2
    // format -> format: 1
    // @end
  },
} as const;
