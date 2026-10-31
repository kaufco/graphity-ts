import {
  BiAdjacentGraph,
  Csr,
  DfsEdgeTraverser,
  DfsTraverser,
  EdgeAction,
  FrontierTraverser,
  Graphs,
  TargetState,
} from "@kobayami/graphity";
import { SmallFamily } from "../smallFamily.js";
import { SmallProgram } from "../smallProgram.js";
import { TransformingGraphs } from "./transformingGraphs.js";

/**
 * The methods reached without the storage package, and the recursive calls on the way.
 */
export interface WithoutStorage {
  readonly reached: readonly string[];
  readonly recursive: readonly string[];
}

/** Per-method sums and counts, computed on the arrays of the graph. */
export interface FromArrays {
  readonly sitesIn: Int32Array;
  readonly callerCount: Int32Array;
  readonly sitesFromOthers: Int32Array;
}

/** Searches of one's own, on the traversers of Graphity and on the arrays of a graph. */
export const WritingSearches = {
  /** Returns the number of descendants of every person, computed bottom-up. */
  descendants(): Int32Array {
    const family = SmallFamily.tree();
    const ada = SmallFamily.personOf("Ada");
    // @start region="dfs"
    // this.graph, a field of DfsTraverser, is the graph it searches.
    class Descendants extends DfsTraverser {
      readonly count = new Int32Array(this.graph.nodeCount);

      protected enterNode(person: number): boolean {
        return true;   // search from the children of every person
      }

      protected override leaveNode(person: number): void {
        // Called after the whole subtree of the person: the counts of the children are
        // complete.
        for (const child of this.graph.outNodes(person)) {
          this.count[person] += 1 + this.count[child];
        }
      }
    }
    const descendants = new Descendants(family);
    descendants.run(ada);
    // descendants.count: [9, 4, 3, 2, 0, 2, 0, 0, 0, 0] - Ada has 9, Ben 4, Cleo 3, ...
    // @end
    return descendants.count;
  },

  /** Returns what main reaches without calling into storage. */
  withoutStorage(): WithoutStorage {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const packageOf = SmallProgram.packageOf();
    const storage = SmallProgram.nodeOf(SmallProgram.packageNames(), "storage");
    const main = SmallProgram.nodeOf(names, "main");
    // @start region="dfsEdges"
    class AvoidingStorage extends DfsEdgeTraverser {
      readonly reached: string[] = [];
      readonly recursive: string[] = [];

      protected override enterNode(method: number): boolean {
        this.reached.push(names[method]);
        return true;
      }

      protected override visitEdge(
        caller: number,
        callee: number,
        edge: number,
        state: TargetState,
      ): EdgeAction {
        if (state === TargetState.ON_STACK) {
          this.recursive.push(`${names[caller]} -> ${names[callee]}`);   // closes a cycle
        }
        if (packageOf[callee] === storage) {
          return EdgeAction.SKIP;   // do not follow calls into storage
        }
        return super.visitEdge(caller, callee, edge, state);
      }
    }
    const search = new AvoidingStorage(calls);
    search.run(main);
    // search.reached: [main, parseArgs, run, load, parse, save, format, show]
    // search.recursive: [parse -> parse, format -> format]
    // @end
    return { reached: search.reached, recursive: search.recursive };
  },

  /** Returns the methods by call depth from main. */
  byDepth(): string[][] {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(names, "main");
    // @start region="frontier"
    class ByDepth extends FrontierTraverser {
      readonly levels: string[][] = [];
      current: string[] = [];

      protected visitNode(method: number): void {
        this.current.push(names[method]);
        this.enqueueChildren(method);     // the out-nodes form the next level
      }

      protected override leaveLevel(level: number): void {
        this.levels.push(this.current);   // after the last node of each level
        this.current = [];
      }
    }
    const byDepth = new ByDepth(calls);
    byDepth.run(main);
    // byDepth.levels: [[main], [parseArgs, run], [load, save, show],
    //                  [parse, read, format, write]]
    // @end
    return byDepth.levels;
  },

  /**
   * Returns the call sites in each method, its callers, and where other methods call it.
   */
  fromArrays(): FromArrays {
    const calls = SmallProgram.calls();
    const siteCount = TransformingGraphs.siteCount();
    // @start region="arrays"
    const start = Csr.outAdjacencyStart(calls);
    const callees = Csr.outAdjacency(calls);
    const sitesIn = new Int32Array(calls.nodeCount);
    const callerCount = new Int32Array(calls.nodeCount);
    for (let method = 0; method < calls.nodeCount; method++) {
      // positions = edges
      for (let edge = start[method]; edge < start[method + 1]; edge++) {
        sitesIn[method] += siteCount[edge];
        callerCount[callees[edge]]++;
      }
    }
    // sitesIn: [2, 0, 4, 2, 2, 1, 2, 1, 0, 0] - run calls from 4 places in its code
    // callerCount: [0, 1, 1, 1, 1, 1, 2, 3, 1, 1] - format has 3 callers, itself included

    // The in-nodes of a BiAdjacentGraph have the same layout, but a position there is an
    // edge index of the transposed graph: the edge data has to follow first.
    const both = BiAdjacentGraph.of(calls);
    const inStart = Csr.inAdjacencyStart(both);
    const callers = Csr.inAdjacency(both);
    const calledBySiteCount = Graphs.transposedEdgeMapping(calls).gather(siteCount);
    const sitesFromOthers = new Int32Array(calls.nodeCount);
    for (let method = 0; method < calls.nodeCount; method++) {
      for (let edge = inStart[method]; edge < inStart[method + 1]; edge++) {
        if (callers[edge] !== method) {
          sitesFromOthers[method] += calledBySiteCount[edge];
        }
      }
    }
    // sitesFromOthers: [0, 1, 1, 1, 1, 2, 1, 2, 1, 1] - show is called from 2 places
    // @end
    return { sitesIn, callerCount, sitesFromOthers };
  },
} as const;
