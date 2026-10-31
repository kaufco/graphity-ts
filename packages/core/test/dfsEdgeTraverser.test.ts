import { describe, expect, it } from "vitest";
import { DfsEdgeTraverser, EdgeAction, EdgeType, EdgeTypes, type Graph, TargetState } from "../src/index.js";
import { expectArgumentError, expectIndexError } from "./testutils/assertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { RecordingDfsTraverser } from "./testutils/recording.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { dfsState } from "./testutils/traversalHelpers.js";

/** Records every callback; descends by default, or answers from {@link action}. */
class Recorder extends DfsEdgeTraverser {
  readonly preOrder: number[] = [];
  readonly postOrder: number[] = [];
  readonly edges: number[] = [];
  readonly states: TargetState[] = [];
  /** Edges reported with a wrong source or target, or from a source off the stack. */
  readonly violations: string[] = [];

  protected override enterNode(node: number): boolean {
    this.preOrder.push(node);
    return true;
  }

  protected override leaveNode(node: number): void {
    this.postOrder.push(node);
  }

  protected override visitEdge(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
    // Plain comparisons per edge - an expect per edge would dominate the random-graph tests.
    if (this.graph.edgeSource(edgeIndex) !== source || this.graph.edgeTarget(edgeIndex) !== target) {
      this.violations.push(`edge ${edgeIndex} reported as ${source} -> ${target}`);
    }
    if (!this.isOnStack(source)) this.violations.push(`source ${source} of edge ${edgeIndex} not on the stack`);
    this.edges.push(edgeIndex);
    this.states.push(state);
    return this.action(source, target, edgeIndex, state);
  }

  action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
    return super.visitEdge(source, target, edgeIndex, state);
  }
}

/** Records like {@link Recorder} and stops in the hook and at the node it is told to. */
class StoppingRecorder extends Recorder {
  stopOnEnter = -1;
  stopOnLeave = -1;
  pruneNode = -1;

  protected override enterNode(node: number): boolean {
    super.enterNode(node);
    if (node === this.stopOnEnter) this.stop();
    return node !== this.pruneNode;
  }

  protected override leaveNode(node: number): void {
    super.leaveNode(node);
    if (node === this.stopOnLeave) this.stop();
  }
}

/**
 * Calls the run form `variant` of its own from the hook `nestIn` at node 1 (for `visitEdge`: at
 * its edge into node 1) while `nest` is set.
 */
class NestingRecorder extends Recorder {
  nestIn = 0; // 0: enterNode, 1: leaveNode, 2: visitEdge
  variant = 0; // 0: run(), 1: run(node), 2: run(list)
  nest = true;

  protected override enterNode(node: number): boolean {
    super.enterNode(node);
    if (this.nestIn === 0 && this.nest && node === 1) this.runVariant(3);
    return true;
  }

  protected override leaveNode(node: number): void {
    super.leaveNode(node);
    if (this.nestIn === 1 && this.nest && node === 1) this.runVariant(3);
  }

  override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
    if (this.nestIn === 2 && this.nest && target === 1) this.runVariant(3);
    return super.action(source, target, edgeIndex, state);
  }

  runVariant(node: number): void {
    if (this.variant === 0) this.run();
    else if (this.variant === 1) this.run(node);
    else this.run([node]);
  }
}

/** Subtree sizes: a recursive algorithm turned into hooks. */
class SubtreeSizes extends DfsEdgeTraverser {
  readonly parent: Int32Array;
  readonly size: Int32Array;

  constructor(tree: Graph) {
    super(tree);
    this.parent = new Int32Array(tree.nodeCount).fill(-1);
    this.size = new Int32Array(tree.nodeCount);
  }

  protected override visitEdge(source: number, target: number, _edgeIndex: number, state: TargetState): EdgeAction {
    if (state === TargetState.UNVISITED) this.parent[target] = source;
    return EdgeAction.DESCEND;
  }

  protected override leaveNode(node: number): void {
    this.size[node]++;
    if (this.parent[node] >= 0) this.size[this.parent[node]] += this.size[node];
  }
}

describe("DfsEdgeTraverserTest", () => {
  // ---- Default behaviour ----

  it("runPicksRootsByItsOwnStateNotByAnOverriddenIsVisited", () => {
    // TypeScript only: isVisited is final in Java, here a subclass can override it.
    const t = new (class extends Recorder {
      protected override isVisited(): boolean {
        return true;
      }
    })(TestGraphs.path(3));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2]);
  });

  it("defaultOrderMatchesNodeCentricTraverserOnRandomGraphs", () => {
    for (let seed = 0; seed < 300; seed++) {
      const lg = RandomGraphs.anyGraph(seed);
      const g = lg.graph;
      const nodeCentric = new RecordingDfsTraverser(g);
      nodeCentric.run();
      const edgeCentric = new Recorder(g);
      edgeCentric.run();
      expect(edgeCentric.preOrder, `preorder (${lg.describe()})`).toEqual(nodeCentric.preOrder);
      expect(edgeCentric.postOrder, `postorder (${lg.describe()})`).toEqual(nodeCentric.postOrder);
      expect(edgeCentric.edges.length, `every edge once (${lg.describe()})`).toBe(g.edgeCount);
      expect(edgeCentric.violations, lg.describe()).toEqual([]);
    }
  });

  it("targetStatesAgreeWithEdgeTypesOnRandomGraphs", () => {
    for (let seed = 0; seed < 300; seed++) {
      const lg = RandomGraphs.anyGraph(seed);
      const g = lg.graph;
      const types = EdgeTypes.of(g);
      const t = new Recorder(g);
      t.run();
      const expected = t.edges.map((e) => {
        const type = types.typeOf(e);
        return type === EdgeType.TREE
          ? TargetState.UNVISITED
          : type === EdgeType.BACK
            ? TargetState.ON_STACK
            : TargetState.FINISHED;
      });
      expect(t.states, lg.describe()).toEqual(expected);
      expect(t.violations, lg.describe()).toEqual([]);
    }
  });

  it("selfLoopTargetIsOnStack", () => {
    const t = new Recorder(TestGraphs.of(1, 0, 0));
    t.run();
    expect(t.states).toEqual([TargetState.ON_STACK]);
  });

  it("enterNodeDefaultsToDescending", () => {
    const left: number[] = [];
    const t = new (class extends DfsEdgeTraverser {
      protected override leaveNode(node: number): void {
        left.push(node);
      }
    })(TestGraphs.path(3));
    t.run();
    expect(left).toEqual([2, 1, 0]);
  });

  it("theEnumsKeepTheirJavaOrder", () => {
    expect([TargetState.UNVISITED, TargetState.ON_STACK, TargetState.FINISHED]).toEqual([0, 1, 2]);
    expect([EdgeAction.DESCEND, EdgeAction.SKIP, EdgeAction.STOP]).toEqual([0, 1, 2]);
  });

  // ---- Actions ----

  it("skippingAnUnvisitedTargetLeavesItForLaterEdgesAndRoots", () => {
    // 0 -> 1, 0 -> 2, 2 -> 1, 3 isolated. Skip 0 -> 1: node 1 is then reached via 2.
    const g = TestGraphs.of(4, 0, 1, 0, 2, 2, 1);
    const t = new (class extends Recorder {
      override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
        return source === 0 && target === 1 ? EdgeAction.SKIP : super.action(source, target, edgeIndex, state);
      }
    })(g);
    t.run(0);
    expect(t.preOrder).toEqual([0, 2, 1]);
    expect(t.states).toEqual([TargetState.UNVISITED, TargetState.UNVISITED, TargetState.UNVISITED]);
    expect(t.violations).toEqual([]);

    const confined = new (class extends Recorder {
      override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
        return target === 1 ? EdgeAction.SKIP : super.action(source, target, edgeIndex, state);
      }
    })(g);
    confined.run(0);
    expect(dfsState(confined).isVisited(1)).toBe(false);
    confined.run();
    expect(confined.preOrder).toEqual([0, 2, 1, 3]);
  });

  it("descendIntoVisitedTargetActsLikeSkip", () => {
    const t = new (class extends Recorder {
      override action(): EdgeAction {
        return EdgeAction.DESCEND;
      }
    })(TestGraphs.cycle(3));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2]);
    expect(t.postOrder).toEqual([2, 1, 0]);
  });

  it("stopEndsTheRunWithoutLeavingThePath", () => {
    // Path 0 -> 1 -> 2 -> 3; stop on the edge 1 -> 2.
    const t = new (class extends Recorder {
      override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
        return source === 1 ? EdgeAction.STOP : super.action(source, target, edgeIndex, state);
      }
    })(TestGraphs.path(4));
    t.run();
    expect(t.preOrder).toEqual([0, 1]);
    expect(t.postOrder).toEqual([]);
    const state = dfsState(t);
    expect(state.isVisited(0)).toBe(true);
    expect(state.isOnStack(0)).toBe(false);
    expect(state.isOnStack(1)).toBe(false);
    expect(state.isVisited(2)).toBe(false);
  });

  it("laterRunContinuesAfterStopAndSeesStoppedPathAsFinished", () => {
    // 0 -> 1, 1 -> 2, 2 -> 0; stop at the first edge, then continue from 2.
    const stopOnce = new (class extends Recorder {
      stopped = false;
      override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
        if (!this.stopped) {
          this.stopped = true;
          return EdgeAction.STOP;
        }
        return super.action(source, target, edgeIndex, state);
      }
    })(TestGraphs.cycle(3));
    stopOnce.run(0);
    stopOnce.run(2);
    expect(stopOnce.preOrder).toEqual([0, 2]);
    expect(stopOnce.states).toEqual([TargetState.UNVISITED, TargetState.FINISHED]);
    expect(stopOnce.postOrder).toEqual([2]);
  });

  it("stopEndsTheWholeRunFromANodeList", () => {
    const t = new (class extends Recorder {
      override action(): EdgeAction {
        return EdgeAction.STOP;
      }
    })(TestGraphs.of(4, 0, 1, 2, 3));
    t.run([0, 2]);
    expect(t.preOrder).toEqual([0]);
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2]);
  });

  // ---- Pruning ----

  it("prunedNodeReportsNoEdgesButIsLeft", () => {
    // 0 -> 1, 0 -> 2, 1 -> 2: prune 1, so 1 -> 2 is never reported.
    const t = new (class extends Recorder {
      protected override enterNode(node: number): boolean {
        super.enterNode(node);
        return node !== 1;
      }
    })(TestGraphs.of(3, 0, 1, 0, 2, 1, 2));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2]);
    expect(t.postOrder).toEqual([1, 2, 0]);
    expect(t.edges.length).toBe(2);
  });

  it("prunedRootReportsNoEdgesButIsLeft", () => {
    const t = new (class extends Recorder {
      protected override enterNode(node: number): boolean {
        super.enterNode(node);
        return false;
      }
    })(TestGraphs.path(3));
    t.run(0);
    expect(t.preOrder).toEqual([0]);
    expect(t.postOrder).toEqual([0]);
    expect(t.edges).toEqual([]);
    expect(dfsState(t).isOnStack(0)).toBe(false);
    expect(dfsState(t).isVisited(1)).toBe(false);
  });

  // ---- Run contract ----

  it.each([-1, 4, 1000, 1.5, Number.NaN, undefined])("runFromNodeOutOfRangeThrows(%s)", (startNode) => {
    // undefined, as read past the end of an array, is a start node, not the call without one.
    const t = new Recorder(TestGraphs.isolated(4));
    expectIndexError(() => t.run(startNode as number), `Index ${startNode} out of bounds for length 4`);
    expect(t.preOrder).toEqual([]);
  });

  it("runFromNullThrowsTypeErrorAsJavaForANullList", () => {
    const t = new Recorder(TestGraphs.isolated(4));
    expect(() => t.run(null as never)).toThrow(TypeError);
  });

  it.each([-1, 4, 15, 16, 1000])("runFromNodeListOutOfRangeThrowsBeforeAnyHook(%s)", (startNode) => {
    // 4 and 15 still fall into the packed state word of the valid nodes.
    const t = new Recorder(TestGraphs.isolated(4));
    expectIndexError(() => t.run([0, startNode]));
    expect(t.preOrder).toEqual([]);
    expect(dfsState(t).isVisited(0)).toBe(false);
  });

  it("everyEntryPointSkipsVisitedNodes", () => {
    const t = new Recorder(TestGraphs.of(4, 0, 1));
    t.run(0);
    t.run(1);
    t.run([0, 2, 2]);
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
  });

  it("runOnEmptyGraphIsNoOp", () => {
    const t = new Recorder(TestGraphs.empty());
    t.run();
    expect(t.preOrder).toEqual([]);
  });

  it("deepPathDoesNotOverflowStack", () => {
    const deep = 1_000_000;
    const counter = new (class extends DfsEdgeTraverser {
      edgeCount = 0;
      left = 0;
      protected override visitEdge(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
        this.edgeCount++;
        return super.visitEdge(source, target, edgeIndex, state);
      }
      protected override leaveNode(): void {
        this.left++;
      }
    })(TestGraphs.path(deep));
    counter.run(0);
    expect(counter.edgeCount).toBe(deep - 1);
    expect(counter.left).toBe(deep);
  });

  // ---- stop() ----

  it("stopFromEveryHookEndsTheRun", () => {
    // Path 0 -> 1 -> 2 -> 3; stop in enterNode(1), visitEdge(1 -> 2) or leaveNode(3).
    // prettier-ignore
    const expectedEnter = [[0, 1], [0, 1], [0, 1, 2, 3]];
    const expectedLeave = [[], [], [3]];
    const expectedEdges = [[0], [0, 1], [0, 1, 2]];
    for (let hook = 0; hook < 3; hook++) {
      const stopIn = hook;
      const t = new (class extends Recorder {
        protected override enterNode(node: number): boolean {
          super.enterNode(node);
          if (stopIn === 0 && node === 1) this.stop();
          return true;
        }
        protected override leaveNode(node: number): void {
          super.leaveNode(node);
          if (stopIn === 2 && node === 3) this.stop();
        }
        override action(source: number, target: number, edgeIndex: number, state: TargetState): EdgeAction {
          if (stopIn === 1 && source === 1) this.stop();
          return super.action(source, target, edgeIndex, state);
        }
      })(TestGraphs.path(4));
      t.run();
      expect(t.edges, `hook ${hook}`).toEqual(expectedEdges[hook]);
      expect(t.preOrder, `hook ${hook}`).toEqual(expectedEnter[hook]);
      expect(t.postOrder, `hook ${hook}`).toEqual(expectedLeave[hook]);
      for (let v = 0; v < 4; v++) expect(dfsState(t).isOnStack(v), `hook ${hook}, node ${v} on stack`).toBe(false);
    }
  });

  it("stopInEnterNodeOfTheRootReportsNothingElse", () => {
    const t = new StoppingRecorder(TestGraphs.path(3));
    t.stopOnEnter = 0;
    t.run();
    expect(t.preOrder).toEqual([0]);
    expect(t.postOrder).toEqual([]);
    expect(t.edges).toEqual([]);
    expect(dfsState(t).isOnStack(0)).toBe(false);
  });

  it("stopInLeaveNodeOfAPrunedRootEndsTheRun", () => {
    const t = new StoppingRecorder(TestGraphs.isolated(3));
    t.pruneNode = 0;
    t.stopOnLeave = 0;
    t.run();
    expect(t.preOrder).toEqual([0]);
    expect(t.postOrder).toEqual([0]);
  });

  it("stopInLeaveNodeOfAPrunedChildEndsTheRun", () => {
    // 0 -> 1, 0 -> 2: node 1 is pruned and stops the run when it is left.
    const t = new StoppingRecorder(TestGraphs.of(3, 0, 1, 0, 2));
    t.pruneNode = 1;
    t.stopOnLeave = 1;
    t.run();
    expect(t.preOrder).toEqual([0, 1]);
    expect(t.postOrder).toEqual([1]);
    expect(t.edges).toEqual([0]);
    expect(dfsState(t).isOnStack(0)).toBe(false);
  });

  it("everyRunVariantClearsAnEarlierStop", () => {
    // 1 -> 2: after a stop at node 0, each variant must still descend from 1 to 2.
    for (let variant = 0; variant < 3; variant++) {
      const t = new StoppingRecorder(TestGraphs.of(3, 1, 2));
      t.stopOnEnter = 0;
      t.run(0);
      t.stopOnEnter = -1;
      if (variant === 0) t.run(1);
      else if (variant === 1) t.run([1]);
      else t.run();
      expect(t.preOrder, `variant ${variant}`).toEqual([0, 1, 2]);
    }
  });

  // ---- run from a hook ----

  it("runFromAHookThrowsAndALaterRunStillStarts", () => {
    // 0 -> 1, 2 -> 3: a nested run during a run from 0 is rejected, then run(2) works as usual.
    for (let hook = 0; hook < 3; hook++) {
      for (let variant = 0; variant < 3; variant++) {
        const label = `hook ${hook}, variant ${variant}`;
        const t = new NestingRecorder(TestGraphs.of(4, 0, 1, 2, 3));
        t.nestIn = hook;
        t.variant = variant;
        let error: unknown;
        try {
          t.runVariant(0);
        } catch (e) {
          error = e;
        }
        expect(error, label).toBeInstanceOf(Error);
        expect(error, label).not.toBeInstanceOf(RangeError);
        expect((error as Error).message, label).toMatch("a run is in progress");
        expect(dfsState(t).isVisited(3), label).toBe(false);

        t.nest = false;
        t.run(2);
        expect(t.preOrder.slice(-2), label).toEqual([2, 3]);
      }
    }
  });

  // ---- Out-of-range values (TypeScript only) ----

  it("isVisitedAndIsOnStackAnswerFalseForAValueOutOfRange", () => {
    // Java documents false or an IndexOutOfBoundsException; here it is false, also for a value
    // that is not an int, which would otherwise read the bits of another node.
    const t = new (class extends DfsEdgeTraverser {})(TestGraphs.path(3));
    t.run();
    expect(dfsState(t).isVisited(1)).toBe(true);
    for (const value of [-1, 3, 16, 1000, 1.5, Number.NaN, 2 ** 32 + 1]) {
      expect(dfsState(t).isVisited(value), `${value}`).toBe(false);
      expect(dfsState(t).isOnStack(value), `${value}`).toBe(false);
    }
  });

  it("aVisitEdgeResultThatIsNoEdgeActionFailsTheRun", () => {
    // Java's switch over the action fails on null; here any value outside EdgeAction fails, so
    // that a hook that forgets to return does not read as SKIP.
    for (const action of [undefined, null, 3, -1, 0.5]) {
      const t = new Recorder(TestGraphs.path(3));
      t.action = () => action as unknown as EdgeAction;
      expectArgumentError(() => t.run(), new RegExp(`^not an edge action: ${String(action)}$`));
      expect(t.edges, `${action}`).toEqual([0]);
    }
  });

  // ---- A recursive algorithm turned into hooks: subtree sizes ----

  it("subtreeSizesOnATree", () => {
    // 0 -> 1, 0 -> 2, 1 -> 3, 1 -> 4, 2 -> 5
    const sizes = new SubtreeSizes(TestGraphs.of(6, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5));
    sizes.run();
    expect(Array.from(sizes.size)).toEqual([6, 3, 2, 1, 1, 1]);
  });

  it("subtreeSizesOnADeepPath", () => {
    const n = 1_000_000;
    const sizes = new SubtreeSizes(TestGraphs.path(n));
    sizes.run();
    expect(sizes.size[0]).toBe(n);
    expect(sizes.size[n - 1]).toBe(1);
  });
});
