import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, FrontierTraverser, Graphs } from "../src/index.js";
import { expectIndexError } from "./testutils/assertions.js";
import { RecordingFrontierTraverser } from "./testutils/recording.js";
import { TestGraphs } from "./testutils/testGraphs.js";
import { frontierState } from "./testutils/traversalHelpers.js";

/** A recording traverser whose `enqueue` a test can call outside a run, as the Java test does. */
class SeedingRecorder extends RecordingFrontierTraverser {
  seed(node: number): boolean {
    return this.enqueue(node);
  }
}

/** Binary tree: 0 -> 1, 2; 1 -> 3, 4; 2 -> 5, 6. */
const binaryTree = () => TestGraphs.of(7, 0, 1, 0, 2, 1, 3, 1, 4, 2, 5, 2, 6);

class ExposedEnqueueFrontier extends FrontierTraverser {
  callEnqueue(node: number): boolean {
    return this.enqueue(node);
  }

  protected visitNode(): void {}
}

/**
 * Records visits, their levels and completed levels; stops when visiting a node or completing a
 * level, and enqueues a node when completing a level.
 */
class StoppingFrontier extends FrontierTraverser {
  readonly visits: number[] = [];
  readonly visitLevels: number[] = [];
  readonly levels: number[] = [];
  stopOnVisit = -1;
  stopOnLevel = -1;
  enqueueOnLevel = -1;
  nodeToEnqueue = -1;

  protected visitNode(node: number): void {
    this.visits.push(node);
    this.visitLevels.push(this.currentLevel);
    this.enqueueChildren(node);
    if (node === this.stopOnVisit) this.stop();
  }

  protected override leaveLevel(level: number): void {
    this.levels.push(level);
    if (level === this.enqueueOnLevel) this.enqueue(this.nodeToEnqueue);
    if (level === this.stopOnLevel) this.stop();
  }
}

/** Calls the run form `variant` of its own from the hook `nestIn` while `nest` is set. */
class NestingFrontier extends FrontierTraverser {
  readonly visits: number[] = [];
  nestIn = 0; // 0: visitNode, 1: leaveLevel
  variant = 0; // 0: run(), 1: run(node), 2: run(list)
  nest = true;

  protected visitNode(node: number): void {
    this.visits.push(node);
    this.enqueueChildren(node);
    if (this.nestIn === 0 && this.nest) this.runVariant(3);
  }

  protected override leaveLevel(): void {
    if (this.nestIn === 1 && this.nest) this.runVariant(3);
  }

  runVariant(node: number): void {
    if (this.variant === 0) this.run();
    else if (this.variant === 1) this.run(node);
    else this.run([node]);
  }
}

describe("FrontierTraverserTest", () => {
  it("runOnPathGivesBfsOrder", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(4));
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2, 3]);
    expect(t.levelAtVisit).toEqual([0, 1, 2, 3]);
  });

  it("runOnBinaryTreeGivesLevelOrder", () => {
    const t = new RecordingFrontierTraverser(binaryTree());
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(t.levelAtVisit).toEqual([0, 1, 1, 2, 2, 2, 2]);
  });

  it("runCoversDisconnectedForestInNodeOrder", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.of(4, 0, 1, 2, 3));
    t.run();
    expect(t.visitOrder).toEqual([0, 1, 2, 3]);
  });

  it("runOnEmptyGraphIsNoOp", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.empty());
    t.run();
    expect(t.visitOrder).toEqual([]);
    expect(t.completedLevels).toEqual([]);
  });

  it("runOnCycleTerminates", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.cycle(5));
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2, 3, 4]);
    expect(t.levelAtVisit).toEqual([0, 1, 2, 3, 4]);
  });

  it("runOnOutStarGivesRootAtLevelZero", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.outStar(5));
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2, 3, 4]);
    expect(t.levelAtVisit).toEqual([0, 1, 1, 1, 1]);
  });

  it.each([-1, 4, 1000, 0.5, undefined])("runFromNodeOutOfRangeThrows(%s)", (startNode) => {
    // undefined, as read past the end of an array, is a start node, not the call without one.
    const t = new RecordingFrontierTraverser(TestGraphs.isolated(4));
    expectIndexError(() => t.run(startNode as number), `Index ${startNode} out of bounds for length 4`);
    expect(t.visitOrder).toEqual([]);
  });

  it("runFromNullThrowsTypeErrorAsJavaForANullList", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.isolated(4));
    expect(() => t.run(null as never)).toThrow(TypeError);
  });

  it.each([-1, 4, 1000])("runFromNodeListOutOfRangeThrowsBeforeAnySeed(%s)", (startNode) => {
    const t = new RecordingFrontierTraverser(TestGraphs.isolated(4));
    expectIndexError(() => t.run([0, startNode]));
    expect(t.visitOrder).toEqual([]);
    expect(frontierState(t).isVisited(0), "valid seed before the bad one").toBe(false);
  });

  it("runFromNodeListPutsAllSeedsAtLevelZero", () => {
    // Disjoint: 0->1, 2->3, 4->5.
    const t = new RecordingFrontierTraverser(TestGraphs.of(6, 0, 1, 2, 3, 4, 5));
    t.run([4, 0, 2]);
    expect(t.visitOrder).toEqual([4, 0, 2, 5, 1, 3]);
    expect(t.levelAtVisit).toEqual([0, 0, 0, 1, 1, 1]);
    expect(t.completedLevels).toEqual([0, 1]);
  });

  it("runFromTheRootNodesTreatsAllRootsAsLevelZero", () => {
    // Roots 0 and 3: 0 -> 1 -> 2, 3 -> 2.
    const g = BiAdjacentGraph.of(TestGraphs.of(4, 0, 1, 1, 2, 3, 2));
    const t = new RecordingFrontierTraverser(g);
    t.run(Graphs.rootNodes(g));
    expect(t.visitOrder).toEqual([0, 3, 1, 2]);
    expect(t.levelAtVisit).toEqual([0, 0, 1, 1]);
    expect(t.completedLevels).toEqual([0, 1]);
  });

  it("runFromNodeListSkipsAlreadyVisited", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(4));
    t.run(0);
    t.run([1, 2]);
    expect(t.visitOrder).toEqual([0, 1, 2, 3]);
  });

  it("everyEntryPointSkipsVisitedNodes", () => {
    // 0 -> 1, plus isolated 2 and 3; duplicates and repeated starts must not revisit.
    const t = new RecordingFrontierTraverser(TestGraphs.of(4, 0, 1));
    t.run(0);
    t.run(1);
    t.run([0, 2, 2]);
    t.run();
    expect(t.visitOrder).toEqual([0, 1, 2, 3]);
    expect(t.completedLevels).toEqual([0, 1, 0, 0]);
  });

  it("runFromEmptyNodeListIsNoOp", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(3));
    t.run([]);
    expect(t.visitOrder).toEqual([]);
  });

  it("multipleRunCallsDoNotRevisit", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(3));
    t.run(0);
    t.run(0);
    t.run();
    expect(t.visitOrder).toEqual([0, 1, 2]);
  });

  it("preMarkedNodesAreExcludedFromTraversal", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(5));
    frontierState(t).visited.set(2);
    frontierState(t).visited.set(3);
    t.run(0);
    // From 0: visits 0, 1; stops at pre-marked 2.
    expect(t.visitOrder).toEqual([0, 1]);
  });

  it("currentLevelIsAvailableDuringVisit", () => {
    const levels: number[] = [];
    const t = new (class extends FrontierTraverser {
      protected visitNode(node: number): void {
        levels.push(this.currentLevel);
        this.enqueueChildren(node);
      }
    })(TestGraphs.path(4));
    t.run(0);
    expect(levels).toEqual([0, 1, 2, 3]);
  });

  it("leaveLevelFiresForEachLevel", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.path(4));
    t.run(0);
    expect(t.completedLevels).toEqual([0, 1, 2, 3]);
  });

  it("leaveLevelFiresOncePerTreeInForest", () => {
    // Two components: 0->1 (2 levels) and 2->3->4 (3 levels).
    const t = new RecordingFrontierTraverser(TestGraphs.of(5, 0, 1, 2, 3, 3, 4));
    t.run();
    expect(t.completedLevels).toEqual([0, 1, 0, 1, 2]);
  });

  it("leaveLevelNotFiredForEmptyGraph", () => {
    const t = new RecordingFrontierTraverser(TestGraphs.empty());
    t.run();
    expect(t.completedLevels).toEqual([]);
  });

  it("pruningByOmittingEnqueueChildren", () => {
    const seen: number[] = [];
    const t = new (class extends FrontierTraverser {
      protected visitNode(node: number): void {
        seen.push(node);
        if (node !== 1) this.enqueueChildren(node);
      }
    })(binaryTree());
    t.run(0);
    expect(seen).toEqual([0, 1, 2, 5, 6]);
  });

  it("enqueueReturnsTrueForNewNodesFalseForVisited", () => {
    const t = new ExposedEnqueueFrontier(TestGraphs.isolated(3));
    expect(t.callEnqueue(1)).toBe(true);
    expect(t.callEnqueue(1)).toBe(false);
  });

  it.each([-1, 3, 1000])("enqueueOutOfRangeThrows(%s)", (node) => {
    const t = new ExposedEnqueueFrontier(TestGraphs.isolated(3));
    expectIndexError(() => t.callEnqueue(node));
  });

  it("enqueueSchedulesCustomFrontier", () => {
    // Disjoint: 0->1, 2->3, 4->5. Use enqueue() to schedule 2 and 4 explicitly.
    const visits: number[] = [];
    const t = new (class extends FrontierTraverser {
      protected visitNode(node: number): void {
        visits.push(node);
        if (node === 0) {
          this.enqueue(2);
          this.enqueue(4);
        } else {
          this.enqueueChildren(node);
        }
      }
    })(TestGraphs.of(6, 0, 1, 2, 3, 4, 5));
    t.run(0);
    expect(visits).toEqual([0, 2, 4, 3, 5]);
  });

  it("isVisitedReflectsEnqueuedState", () => {
    let allVisitedAfterRoot = false;
    const t = new (class extends FrontierTraverser {
      protected visitNode(node: number): void {
        if (node === 0) {
          this.enqueueChildren(node);
          // After enqueueChildren, 1 and 2 are marked visited even before visitNode fires.
          allVisitedAfterRoot = this.isVisited(1) && this.isVisited(2);
        }
      }
    })(TestGraphs.of(3, 0, 1, 0, 2));
    t.run(0);
    expect(allVisitedAfterRoot).toBe(true);
  });

  it("runOnDiamondVisitsTargetOnce", () => {
    // Diamond 0->1, 0->2, 1->3, 2->3. Node 3 enqueued by 1, skipped by 2.
    const t = new RecordingFrontierTraverser(TestGraphs.of(4, 0, 1, 0, 2, 1, 3, 2, 3));
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2, 3]);
    expect(t.levelAtVisit).toEqual([0, 1, 1, 2]);
  });

  it("enqueueChildrenRejectsANodeOutOfRange", () => {
    // TypeScript only: Java throws IndexOutOfBoundsException from the array access, with the
    // messages of that access.
    const t = new RecordingFrontierTraverser(TestGraphs.path(3));
    const state = t as unknown as { enqueueChildren(node: number): void };
    expectIndexError(() => state.enqueueChildren(-1), /^Index -1 out of bounds for length 4$/);
    expectIndexError(() => state.enqueueChildren(3), /^Index 4 out of bounds for length 4$/);
    expectIndexError(() => state.enqueueChildren(1.5));
    t.run(0);
    expect(t.visitOrder).toEqual([0, 1, 2]);
  });

  it("isVisitedAnswersFalseOrThrowsForAValueOutOfRange", () => {
    // TypeScript only: as Java's BitSet, false beyond the set bits and an index error below 0;
    // also an index error for a value that is not an int.
    const t = new RecordingFrontierTraverser(TestGraphs.path(3));
    t.run(0);
    expect(frontierState(t).isVisited(2)).toBe(true);
    expect(frontierState(t).isVisited(3)).toBe(false);
    expect(frontierState(t).isVisited(1000)).toBe(false);
    expectIndexError(() => frontierState(t).isVisited(-1));
    expectIndexError(() => frontierState(t).isVisited(1.5));
  });

  // ---- enqueue outside a run ----

  it("nodesEnqueuedBeforeARunFormItsLevelZeroInEveryRunVariant", () => {
    // 0 -> 1 and 3 -> 2. After run(0), the 3 is enqueued outside a run; the start 0 of run(0) and
    // run([0]) is visited already.
    for (let variant = 0; variant < 3; variant++) {
      const t = new SeedingRecorder(TestGraphs.of(4, 0, 1, 3, 2));
      t.run(0);
      t.seed(3);
      if (variant === 0) t.run();
      else if (variant === 1) t.run(0);
      else t.run([0]);
      expect(t.visitOrder, `variant ${variant}`).toEqual([0, 1, 3, 2]);
      expect(t.levelAtVisit, `variant ${variant}`).toEqual([0, 1, 0, 1]);
      expect(t.completedLevels, `variant ${variant}`).toEqual([0, 1, 0, 1]);
    }
  });

  it("runVisitsANodeEnqueuedBeforeItEvenWithNoRootLeft", () => {
    const t = new SeedingRecorder(TestGraphs.isolated(2));
    t.run(0);
    t.seed(1);
    t.run();
    expect(t.visitOrder).toEqual([0, 1]);
  });

  it("nodesEnqueuedBeforeARunComeAheadOfItsStartNode", () => {
    // 0 -> 1 and 3 -> 2: the 3 joins the start 0 in level 0, ahead of it.
    const t = new SeedingRecorder(TestGraphs.of(4, 0, 1, 3, 2));
    t.seed(3);
    t.run(0);
    expect(t.visitOrder).toEqual([3, 0, 2, 1]);
    expect(t.levelAtVisit).toEqual([0, 0, 1, 1]);
  });

  // ---- stop() ----

  it("stopAtTheFirstSeedDropsTheOtherSeedsOfTheSameLevel", () => {
    const t = new StoppingFrontier(TestGraphs.of(4, 0, 1, 2, 3));
    t.stopOnVisit = 0;
    t.run([0, 2]);
    expect(t.visits).toEqual([0]);
    expect(t.levels).toEqual([]);
  });

  it("nodesEnqueuedWhenTheLastLevelCompletesFormTheNextLevel", () => {
    // 0 -> 1, plus isolated 2 and 3; level 1 is the last level of run(0) and enqueues 2.
    const t = new StoppingFrontier(TestGraphs.of(4, 0, 1));
    t.enqueueOnLevel = 1;
    t.nodeToEnqueue = 2;
    t.run(0);
    expect(t.visits).toEqual([0, 1, 2]);
    expect(t.visitLevels).toEqual([0, 1, 2]);
    expect(t.levels).toEqual([0, 1, 2]);
  });

  it("nodesEnqueuedWhenAnInnerLevelCompletesJoinTheNextLevel", () => {
    // 0 -> 1, plus isolated 2 and 3; level 0 enqueues 2 next to the child 1.
    const t = new StoppingFrontier(TestGraphs.of(4, 0, 1));
    t.enqueueOnLevel = 0;
    t.nodeToEnqueue = 2;
    t.run(0);
    expect(t.visits).toEqual([0, 1, 2]);
    expect(t.visitLevels).toEqual([0, 1, 1]);
    expect(t.levels).toEqual([0, 1]);
  });

  it("stopWhenTheLastLevelCompletesDropsTheNodesItEnqueued", () => {
    const t = new StoppingFrontier(TestGraphs.of(4, 0, 1));
    t.enqueueOnLevel = 1;
    t.nodeToEnqueue = 2;
    t.stopOnLevel = 1;
    t.run(0);
    expect(t.visits).toEqual([0, 1]);
    expect(frontierState(t).isVisited(2), "enqueued before the stop").toBe(true);

    t.enqueueOnLevel = -1;
    t.stopOnLevel = -1;
    t.run();
    expect(t.visits).toEqual([0, 1, 3]);
    expect(t.visitLevels).toEqual([0, 1, 0]);
  });

  it("stopInVisitNodeDropsTheRestOfTheFrontier", () => {
    // 0 -> 1, 0 -> 2, 1 -> 3; stop while visiting 1: 2 and 3 are enqueued but dropped.
    const t = new StoppingFrontier(TestGraphs.of(5, 0, 1, 0, 2, 1, 3));
    t.stopOnVisit = 1;
    t.run();
    expect(t.visits).toEqual([0, 1]);
    expect(t.levels).toEqual([0]);
    expect(frontierState(t).isVisited(2), "enqueued before the stop").toBe(true);
    expect(frontierState(t).isVisited(4)).toBe(false);

    t.stopOnVisit = -1;
    t.run();
    expect(t.visits).toEqual([0, 1, 4]);
  });

  it("stopInLeaveLevelEndsTheRun", () => {
    const t = new StoppingFrontier(binaryTree());
    t.stopOnLevel = 1;
    t.run(0);
    expect(t.visits).toEqual([0, 1, 2]);
    expect(t.levels).toEqual([0, 1]);
  });

  it("stopEndsTheWholeRunOverAllRoots", () => {
    const t = new StoppingFrontier(TestGraphs.isolated(3));
    t.stopOnLevel = 0;
    t.run();
    expect(t.visits).toEqual([0]);
    t.stopOnLevel = -1;
    t.run();
    expect(t.visits).toEqual([0, 1, 2]);
  });

  it("runOfOneNodeClearsAnEarlierStop", () => {
    const t = new StoppingFrontier(TestGraphs.of(3, 1, 2));
    t.stopOnVisit = 0;
    t.run(0);
    t.stopOnVisit = -1;
    t.run(1);
    expect(t.visits).toEqual([0, 1, 2]);
  });

  it("runFromNodeListClearsAnEarlierStop", () => {
    const t = new StoppingFrontier(TestGraphs.of(3, 1, 2));
    t.stopOnVisit = 0;
    t.run(0);
    t.stopOnVisit = -1;
    t.run([1]);
    expect(t.visits).toEqual([0, 1, 2]);
  });

  // ---- run from a hook ----

  it("runFromAHookThrowsAndALaterRunStillStarts", () => {
    // 0 -> 1, 2 -> 3: a nested run during a run from 0 is rejected, then run(2) works as usual.
    for (let hook = 0; hook < 2; hook++) {
      for (let variant = 0; variant < 3; variant++) {
        const label = `hook ${hook}, variant ${variant}`;
        const t = new NestingFrontier(TestGraphs.of(4, 0, 1, 2, 3));
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
        expect(frontierState(t).isVisited(3), label).toBe(false);

        t.nest = false;
        t.run(2);
        expect(t.visits, label).toContain(2);
        expect(t.visits, label).toContain(3);
      }
    }
  });
});
