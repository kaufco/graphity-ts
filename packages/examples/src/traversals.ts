import {
  BfsDistances,
  DfsEdgeTraverser,
  DfsTraverser,
  EdgeAction,
  EdgeType,
  EdgeTypes,
  Edges,
  FrontierTraverser,
  TargetState,
} from "@kobayami/graphity";
import { SmallProgram } from "./smallProgram.js";

/** The type of an edge, and the edges of another type. */
export interface Classified {
  readonly loopEdge: EdgeType;
  readonly forwardEdges: Edges;
}

/** A distance, and a shortest path of that length. */
export interface Chain {
  readonly depth: number;
  readonly chain: Int32Array;
}

/** Traversals of your own, and what the built-in searches find. */
export const Traversals = {
  /** Returns the methods that `main` reaches, each after the methods it calls. */
  calleesFirst(): number[] {
    const calls = SmallProgram.calls();
    const main = SmallProgram.nodeOf(SmallProgram.methodNames(), "main");
    // @start region="leaveNode"
    class CalleesFirst extends DfsTraverser {
      readonly order: number[] = [];

      protected enterNode(): boolean { return true; }

      protected override leaveNode(method: number): void { this.order.push(method); }
    }
    const calleesFirst = new CalleesFirst(calls);
    calleesFirst.run(main);
    // calleesFirst.order: [1, 6, 8, 3, 7, 9, 4, 5, 2, 0] - parseArgs, parse, read, load,
    // format, write, save, show, run and main
    // @end
    return calleesFirst.order;
  },

  /**
   * Returns the edge index of the dependency that closes the first cycle the search
   * finds.
   */
  firstCycleEdge(): number {
    const dependencies = SmallProgram.dependencies();
    // @start region="visitEdge"
    class FirstCycle extends DfsEdgeTraverser {
      closingEdge = -1;

      protected override visitEdge(
        source: number,
        target: number,
        edgeIndex: number,
        state: TargetState,
      ): EdgeAction {
        if (state === TargetState.ON_STACK) {
          this.closingEdge = edgeIndex;
          return EdgeAction.STOP;
        }
        return super.visitEdge(source, target, edgeIndex, state);
      }
    }
    const firstCycle = new FirstCycle(dependencies);
    firstCycle.run();
    // firstCycle.closingEdge: 10 - the edge storage -> model
    // @end
    return firstCycle.closingEdge;
  },

  /** Returns the methods that `main` reaches with at most two calls, nearest first. */
  withinTwoCalls(): number[] {
    const calls = SmallProgram.calls();
    const main = SmallProgram.nodeOf(SmallProgram.methodNames(), "main");
    // @start region="currentLevel"
    class WithinTwoCalls extends FrontierTraverser {
      readonly reached: number[] = [];

      protected visitNode(method: number): void {
        this.reached.push(method);
        if (this.currentLevel < 2) {
          this.enqueueChildren(method);
        }
      }
    }
    const withinTwoCalls = new WithinTwoCalls(calls);
    withinTwoCalls.run(main);
    // withinTwoCalls.reached: [0, 1, 2, 3, 4, 5] - main, parseArgs, run, load, save and
    // show
    // @end
    return withinTwoCalls.reached;
  },

  /**
   * Returns the type of the edge that closes the loop of `load`, and its forward edges.
   */
  edgeTypesOfLoad(): Classified {
    const cfg = SmallProgram.cfg();
    const names = SmallProgram.blockNames();
    const header = SmallProgram.nodeOf(names, "header");
    const next = SmallProgram.nodeOf(names, "next");
    // @start region="edgeTypes"
    const types = EdgeTypes.of(cfg);
    const loopEdge = types.typeOf(cfg.edgeIndexOf(next, header));
    const forwardEdges = Edges.of(types, EdgeType.FORWARD);
    // loopEdge: EdgeType.BACK
    // forwardEdges: body -> next
    // @end
    return { loopEdge, forwardEdges };
  },

  /** Returns the length of a shortest chain of calls from `main` to `parse`. */
  callChainToParse(): Chain {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    const main = SmallProgram.nodeOf(names, "main");
    const parse = SmallProgram.nodeOf(names, "parse");
    // @start region="pathTo"
    const fromMain = BfsDistances.of(calls, main);
    const depth = fromMain.distanceOf(parse);
    const chain = fromMain.pathTo(parse);
    // depth: 3
    // chain: [0, 2, 3, 6] - main -> run -> load -> parse
    // @end
    return { depth, chain };
  },
} as const;
