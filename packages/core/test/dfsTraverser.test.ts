import { describe, expect, it } from "vitest";
import { DfsTraverser, type Graph } from "../src/index.js";
import { expectIndexError } from "./testutils/assertions.js";
import { recursiveDfsOrder } from "./testutils/naive.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { RecordingDfsTraverser } from "./testutils/recording.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { dfsState } from "./testutils/traversalHelpers.js";

/** Binary tree: 0 -> 1, 2; 1 -> 3, 4; 2 -> 5, 6. */
const binaryTree = () => TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 2, 6);

/** Records pre- and postorder and stops when entering or leaving the given node. */
class StoppingDfs extends DfsTraverser {
  readonly enter: number[] = [];
  readonly leave: number[] = [];
  stopOnEnter = -1;
  stopOnLeave = -1;
  prune = false;
  pruneNode = -1;

  protected enterNode(node: number): boolean {
    this.enter.push(node);
    if (node === this.stopOnEnter) this.stop();
    return !this.prune && node !== this.pruneNode;
  }

  protected override leaveNode(node: number): void {
    this.leave.push(node);
    if (node === this.stopOnLeave) this.stop();
  }

  stopNow(): void {
    this.stop();
  }
}

/** Calls the run form `variant` of its own from the hook `nestIn` of node 1 while `nest` is set. */
class NestingDfs extends DfsTraverser {
  readonly enter: number[] = [];
  nestIn = 0; // 0: enterNode, 1: leaveNode
  variant = 0; // 0: run(), 1: run(node), 2: run(list)
  nest = true;

  protected enterNode(node: number): boolean {
    this.enter.push(node);
    if (this.nestIn === 0 && this.nest && node === 1) this.runVariant(3);
    return true;
  }

  protected override leaveNode(node: number): void {
    if (this.nestIn === 1 && this.nest && node === 1) this.runVariant(3);
  }

  runVariant(node: number): void {
    if (this.variant === 0) this.run();
    else if (this.variant === 1) this.run(node);
    else this.run([node]);
  }
}

function expectSameOrderAsRecursive(g: Graph, desc: string): void {
  const recursive = recursiveDfsOrder(g);
  const iterative = new RecordingDfsTraverser(g);
  iterative.run();
  expect(iterative.preOrder, `preorder parity (${desc})`).toEqual(recursive.preOrder);
  expect(iterative.postOrder, `postorder parity (${desc})`).toEqual(recursive.postOrder);
}

describe("DfsTraverserTest", () => {
  // ---- Basic order ----

  it("runPicksRootsByItsOwnStateNotByAnOverriddenIsVisited", () => {
    // TypeScript only: isVisited is final in Java, here a subclass can override it.
    const t = new (class extends RecordingDfsTraverser {
      protected override isVisited(): boolean {
        return true;
      }
    })(TestGraphs.path(3));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2]);
  });

  it("runVisitsSinglePathInPreOrder", () => {
    const t = new RecordingDfsTraverser(TestGraphs.path(4));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
    expect(t.postOrder).toEqual([3, 2, 1, 0]);
  });

  it("runVisitsBinaryTreeInSortedPreOrder", () => {
    const t = new RecordingDfsTraverser(binaryTree());
    t.run();
    expect(t.preOrder).toEqual([0, 1, 3, 4, 2, 5, 6]);
    expect(t.postOrder).toEqual([3, 4, 1, 5, 6, 2, 0]);
  });

  it("runOnEmptyGraphIsNoOp", () => {
    const t = new RecordingDfsTraverser(TestGraphs.empty());
    t.run();
    expect(t.preOrder).toEqual([]);
    expect(t.postOrder).toEqual([]);
  });

  it("runTerminatesOnCycle", () => {
    const t = new RecordingDfsTraverser(TestGraphs.cycle(5));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3, 4]);
    expect(t.postOrder).toEqual([4, 3, 2, 1, 0]);
  });

  it("runOnCliqueVisitsAllNodes", () => {
    const t = new RecordingDfsTraverser(TestGraphs.clique(4));
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
  });

  // ---- Run contract ----

  it("runFromSingleNodeVisitsReachableOnly", () => {
    const t = new RecordingDfsTraverser(TestGraphs.of(5, 0, 1, 1, 2, 3, 4));
    t.run(0);
    expect(t.preOrder).toEqual([0, 1, 2]);
  });

  it.each([-1, 4, 1000, 1.5, Number.NaN, undefined])("runFromNodeOutOfRangeThrows(%s)", (startNode) => {
    // undefined, as read past the end of an array, is a start node, not the call without one.
    const t = new RecordingDfsTraverser(TestGraphs.isolated(4));
    expectIndexError(() => t.run(startNode as number), `Index ${startNode} out of bounds for length 4`);
    expect(t.preOrder).toEqual([]);
  });

  it("runFromNullThrowsTypeErrorAsJavaForANullList", () => {
    const t = new RecordingDfsTraverser(TestGraphs.isolated(4));
    expect(() => t.run(null as never)).toThrow(TypeError);
  });

  it.each([-1, 4, 15, 16, 1000])("runFromNodeListOutOfRangeThrowsBeforeAnyHook(%s)", (startNode) => {
    // 4 and 15 still fall into the packed state word of the valid nodes.
    const t = new RecordingDfsTraverser(TestGraphs.isolated(4));
    expectIndexError(() => t.run([0, startNode]));
    expect(t.preOrder).toEqual([]);
    expect(dfsState(t).isVisited(0)).toBe(false);
  });

  it("runFromNodeListVisitsInListOrder", () => {
    // Disjoint: {0->1}, {2->3}, {4->5}.
    const t = new RecordingDfsTraverser(TestGraphs.of(6, 0, 1, 2, 3, 4, 5));
    t.run([4, 0, 2]);
    expect(t.preOrder).toEqual([4, 5, 0, 1, 2, 3]);
  });

  it("runFromNodeListAcceptsTypedArraysAndViews", () => {
    const g = TestGraphs.of(6, 0, 1, 2, 3, 4, 5);
    const typed = new RecordingDfsTraverser(g);
    typed.run(Int32Array.of(4, 0, 2));
    expect(typed.preOrder).toEqual([4, 5, 0, 1, 2, 3]);
    const view = new RecordingDfsTraverser(g);
    view.run(g.outNodes(2)); // [3]
    expect(view.preOrder).toEqual([3]);
  });

  it("runFromNodeListSkipsAlreadyVisitedStartNodes", () => {
    const t = new RecordingDfsTraverser(TestGraphs.path(4));
    t.run(0); // visits 0, 1, 2, 3
    t.run([1, 2]); // all already visited
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
  });

  it("everyEntryPointSkipsVisitedNodes", () => {
    // 0 -> 1, plus isolated 2 and 3; duplicates and repeated starts must not revisit.
    const t = new RecordingDfsTraverser(TestGraphs.of(4, 0, 1));
    t.run(0);
    t.run(1);
    t.run([0, 2, 2]);
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
  });

  it("runFromEmptyNodeListIsNoOp", () => {
    const t = new RecordingDfsTraverser(TestGraphs.path(3));
    t.run([]);
    expect(t.preOrder).toEqual([]);
  });

  it("multipleRunCallsDoNotRevisit", () => {
    const t = new RecordingDfsTraverser(TestGraphs.path(4));
    t.run(0);
    t.run(0);
    t.run();
    expect(t.preOrder).toEqual([0, 1, 2, 3]);
  });

  it("runThenRunCombinesTraversals", () => {
    // Two components.
    const t = new RecordingDfsTraverser(TestGraphs.of(5, 0, 1, 2, 3, 3, 4));
    t.run(2);
    t.run();
    expect(t.preOrder).toEqual([2, 3, 4, 0, 1]);
  });

  // ---- Pruning via enterNode returning false ----

  it("pruneSkipsSubtreeButStillLeavesNode", () => {
    const enter: number[] = [];
    const leave: number[] = [];
    const t = new (class extends DfsTraverser {
      protected enterNode(node: number): boolean {
        enter.push(node);
        return node !== 1; // cut subtree below node 1
      }
      protected override leaveNode(node: number): void {
        leave.push(node);
      }
    })(binaryTree());
    t.run(0);
    // Node 1 is entered (and left) but its children 3, 4 are never discovered.
    expect(enter).toEqual([0, 1, 2, 5, 6]);
    // leaveNode fires for every entered node, pruned node 1 included.
    expect(leave).toEqual([1, 5, 6, 2, 0]);
  });

  it("pruningRootLeavesItImmediately", () => {
    const enter: number[] = [];
    const leave: number[] = [];
    const t = new (class extends DfsTraverser {
      protected enterNode(node: number): boolean {
        enter.push(node);
        return false; // prune everything at the root
      }
      protected override leaveNode(node: number): void {
        leave.push(node);
      }
    })(TestGraphs.path(3));
    t.run(0);
    expect(enter).toEqual([0]);
    expect(leave).toEqual([0]);
  });

  // ---- isOnStack / isVisited ----

  it("ancestorsAreOnStackDuringEnterNode", () => {
    // Path 0 -> 1 -> 2 -> 3: when node k is entered, exactly 0..k are on the stack.
    let checks = 0;
    const t = new (class extends DfsTraverser {
      protected enterNode(node: number): boolean {
        for (let i = 0; i <= node; i++)
          expect(this.isOnStack(i), `node ${i} on stack when entering ${node}`).toBe(true);
        for (let i = node + 1; i < 4; i++) {
          expect(this.isOnStack(i), `node ${i} not on stack when entering ${node}`).toBe(false);
        }
        checks++;
        return true;
      }
    })(TestGraphs.path(4));
    t.run(0);
    expect(checks).toBe(4);
  });

  it("nodeIsOffStackAfterLeave", () => {
    // Diamond 0 -> 1, 2; 1 -> 3; 2 -> 3. After leaving 1, it must be off-stack before 2 is entered.
    let checked = false;
    const t = new (class extends DfsTraverser {
      protected enterNode(node: number): boolean {
        if (node === 2) {
          expect(this.isOnStack(1), "sibling 1 already left").toBe(false);
          expect(this.isVisited(1), "sibling 1 already visited").toBe(true);
          expect(this.isOnStack(0), "ancestor 0 still on stack").toBe(true);
          checked = true;
        }
        return true;
      }
    })(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    t.run(0);
    expect(checked).toBe(true);
  });

  // ---- Order parity with a recursive depth-first search ----

  it("orderMatchesRecursiveOnDeterministicShapes", () => {
    const shapes = [
      TestGraphs.path(6),
      TestGraphs.cycle(6),
      TestGraphs.clique(5),
      TestGraphs.outStar(6),
      TestGraphs.inStar(6),
      binaryTree(),
      TestGraphs.of(6, 0, 1, 0, 2, 1, 3, 2, 3, 3, 4, 4, 5), // diamond + tail
      TestGraphs.isolated(4),
    ];
    for (const g of shapes) expectSameOrderAsRecursive(g, "deterministic shape");
  });

  it("orderMatchesRecursiveOnRandomGraphs", () => {
    for (let seed = 0; seed < 300; seed++) {
      const lg = RandomGraphs.anyGraph(seed);
      expectSameOrderAsRecursive(lg.graph, lg.describe());
    }
  });

  // ---- Stack safety (regression guard, mirrors DeepGraphStackSafetyTest) ----

  it("deepPathDoesNotOverflowStack", () => {
    const deep = 1_000_000;
    const counter = new (class extends DfsTraverser {
      entered = 0;
      left = 0;
      protected enterNode(): boolean {
        this.entered++;
        return true;
      }
      protected override leaveNode(): void {
        this.left++;
      }
    })(TestGraphs.path(deep));
    expect(() => counter.run()).not.toThrow();
    expect(counter.entered).toBe(deep);
    expect(counter.left).toBe(deep);
  });

  // ---- Out-of-range values (TypeScript only) ----

  it("isVisitedAndIsOnStackAnswerFalseForAValueOutOfRange", () => {
    // Java documents false or an IndexOutOfBoundsException; here it is false, also for a value
    // that is not an int, which would otherwise read the bits of another node.
    const t = new RecordingDfsTraverser(TestGraphs.path(3));
    t.run();
    expect(dfsState(t).isVisited(1)).toBe(true);
    for (const value of [-1, 3, 16, 1000, 1.5, Number.NaN, 2 ** 32 + 1]) {
      expect(dfsState(t).isVisited(value), `${value}`).toBe(false);
      expect(dfsState(t).isOnStack(value), `${value}`).toBe(false);
    }
  });

  // ---- stop() ----

  it("stopInEnterNodeEndsTheRunWithoutLeavingThePath", () => {
    const t = new StoppingDfs(TestGraphs.path(5));
    t.stopOnEnter = 2;
    t.run();
    expect(t.enter).toEqual([0, 1, 2]);
    expect(t.leave).toEqual([]);
    for (let v = 0; v < 5; v++) expect(dfsState(t).isOnStack(v), `node ${v} on stack`).toBe(false);
    expect(dfsState(t).isVisited(2)).toBe(true);
    expect(dfsState(t).isVisited(3)).toBe(false);

    t.stopOnEnter = -1;
    t.run();
    expect(t.enter).toEqual([0, 1, 2, 3, 4]);
    expect(t.leave).toEqual([4, 3]);
  });

  it("stopInLeaveNodeEndsTheRun", () => {
    const t = new StoppingDfs(binaryTree());
    t.stopOnLeave = 3;
    t.run();
    expect(t.enter).toEqual([0, 1, 3]);
    expect(t.leave).toEqual([3]);
    expect(dfsState(t).isOnStack(0)).toBe(false);
    expect(dfsState(t).isOnStack(1)).toBe(false);
  });

  it("stopOnAPrunedNodeSkipsItsLeaveNode", () => {
    const t = new StoppingDfs(TestGraphs.isolated(3));
    t.prune = true;
    t.stopOnEnter = 1;
    t.run();
    expect(t.enter).toEqual([0, 1]);
    expect(t.leave).toEqual([0]);
  });

  it("stopEndsTheWholeRunFromANodeList", () => {
    const t = new StoppingDfs(TestGraphs.isolated(4));
    t.stopOnLeave = 3;
    t.run([3, 1, 2]);
    expect(t.enter).toEqual([3]);
  });

  it("stopOutsideARunHasNoEffect", () => {
    const t = new StoppingDfs(TestGraphs.path(3));
    t.stopNow();
    t.run(0);
    expect(t.enter).toEqual([0, 1, 2]);
  });

  it("stopInLeaveNodeOfAPrunedRootEndsTheRun", () => {
    const t = new StoppingDfs(TestGraphs.isolated(3));
    t.prune = true;
    t.stopOnLeave = 0;
    t.run();
    expect(t.enter).toEqual([0]);
    expect(t.leave).toEqual([0]);
  });

  it("stopInLeaveNodeOfAPrunedChildEndsTheRun", () => {
    // 0 -> 1, 0 -> 2: node 1 is pruned and stops the run when it is left.
    const t = new StoppingDfs(TestGraphs.of(3, 0, 1, 0, 2));
    t.pruneNode = 1;
    t.stopOnLeave = 1;
    t.run();
    expect(t.enter).toEqual([0, 1]);
    expect(t.leave).toEqual([1]);
    expect(dfsState(t).isOnStack(0)).toBe(false);
    expect(dfsState(t).isVisited(2)).toBe(false);
  });

  it("runFromNodeListClearsAnEarlierStop", () => {
    const t = new StoppingDfs(TestGraphs.isolated(3));
    t.stopOnEnter = 0;
    t.run([0, 1]);
    expect(t.enter).toEqual([0]);
    t.stopOnEnter = -1;
    t.run([1, 2]);
    expect(t.enter).toEqual([0, 1, 2]);
  });

  // ---- run from a hook ----

  it("runFromAHookThrowsAndALaterRunStillStarts", () => {
    // 0 -> 1, 2 -> 3: a nested run during a run from 0 is rejected, then run(2) works as usual.
    for (let hook = 0; hook < 2; hook++) {
      for (let variant = 0; variant < 3; variant++) {
        const label = `hook ${hook}, variant ${variant}`;
        const t = new NestingDfs(TestGraphs.of(4, 0, 1, 2, 3));
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
        expect(t.enter, label).toEqual([0, 1, 2, 3]);
      }
    }
  });

  it("runFromEnterNodeOfTheRootThrows", () => {
    const t = new (class extends DfsTraverser {
      protected enterNode(node: number): boolean {
        if (node === 0) this.run(1);
        return true;
      }
    })(TestGraphs.of(2, 0, 1));
    expect(() => t.run(0)).toThrow("a run is in progress");
  });
});
