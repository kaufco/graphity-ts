import { type Graph, Graphs, type SortedIntView } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** What the example reads from the closure. */
export interface Read {
  readonly closure: Graph;
  readonly edgeCount: number;
  readonly mainReachesWrite: boolean;
  readonly fromRun: SortedIntView;
  readonly parseOnCycle: boolean;
  readonly loadOnCycle: boolean;
}

/** All reachability between the methods at once, as a graph. */
export const TransitiveClosure = {
  /** Returns the transitive closure of the calls and what the example reads from it. */
  closure(): Read {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(names, "main");
    const write = SmallProgram.nodeOf(names, "write");
    const run = SmallProgram.nodeOf(names, "run");
    const parse = SmallProgram.nodeOf(names, "parse");
    const load = SmallProgram.nodeOf(names, "load");
    // @start region="closure"
    const closure = Graphs.transitiveClosure(calls);
    // 23 - 12 calls and 11 new edges
    const edgeCount = closure.edgeCount;
    const mainReachesWrite = closure.hasOutNode(main, write);   // true
    const fromRun = closure.outNodes(run);
    // fromRun: [3, 4, 5, 6, 7, 8, 9] - load, save, show, parse, format, read and write

    // true - parse calls itself
    const parseOnCycle = closure.containsSelfLoop(parse);
    const loadOnCycle = closure.containsSelfLoop(load);         // false
    // @end
    return { closure, edgeCount, mainReachesWrite, fromRun, parseOnCycle, loadOnCycle };
  },
} as const;
