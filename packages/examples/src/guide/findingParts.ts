import { Components, type Graph, GraphBuilder, Graphs } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The components, by name, and two checks. */
export interface Wccs {
  readonly rest: Graph;
  readonly componentCount: number;
  readonly components: string[][];
  readonly callsConnected: boolean;
  readonly restConnected: boolean;
}

/**
 * The weakly connected components of the calls between methods: the groups of methods
 * that calls connect when their direction does not matter.
 */
export const FindingParts = {
  /** Returns the calls without those made by main and run. */
  callsBelowRun(): Graph {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(names, "main");
    const run = SmallProgram.nodeOf(names, "run");
    // @start region="rest"
    // Leave out the calls of main and run, which call into every area of the program.
    const builder = new GraphBuilder();
    builder.addNodes(calls.nodeCount);
    calls.forEachEdge((caller, callee) => {
      if (caller !== main && caller !== run) {
        builder.addEdge(caller, callee);
      }
    });
    const rest = builder.build();
    // @end
    return rest;
  },

  /** Returns the weakly connected components of the calls without main and run. */
  wccs(): Wccs {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const rest = FindingParts.callsBelowRun();
    // @start region="wccsOf"
    const components = Components.wccsOf(rest);
    const componentCount = components.groupCount;   // 5
    const byName: string[][] = [];
    for (let component = 0; component < componentCount; component++) {
      byName.push(Array.from(components.nodesOf(component), (m) => names[m]));
    }
    // byName: [[main], [parseArgs], [run], [load, parse, read],
    //          [save, show, format, write]]

    const callsConnected = Graphs.isWeaklyConnected(calls);   // true
    const restConnected = Graphs.isWeaklyConnected(rest);     // false
    // @end
    return { rest, componentCount, components: byName, callsConnected, restConnected };
  },
} as const;
