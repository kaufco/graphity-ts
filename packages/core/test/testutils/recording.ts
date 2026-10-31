import { DfsTraverser, FrontierTraverser } from "../../src/index.js";

/** A {@link DfsTraverser} that records preorder and postorder, as Java's `RecordingDfsTraverser`. */
export class RecordingDfsTraverser extends DfsTraverser {
  readonly preOrder: number[] = [];
  readonly postOrder: number[] = [];

  protected enterNode(node: number): boolean {
    this.preOrder.push(node);
    return true;
  }

  protected override leaveNode(node: number): void {
    this.postOrder.push(node);
  }
}

/**
 * A {@link FrontierTraverser} that records visit order, the level of each visit and the completed
 * levels, enqueuing all children (standard BFS), as Java's `RecordingFrontierTraverser`.
 */
export class RecordingFrontierTraverser extends FrontierTraverser {
  readonly visitOrder: number[] = [];
  readonly levelAtVisit: number[] = [];
  readonly completedLevels: number[] = [];

  protected visitNode(node: number): void {
    this.visitOrder.push(node);
    this.levelAtVisit.push(this.currentLevel);
    this.enqueueChildren(node);
  }

  protected override leaveLevel(level: number): void {
    this.completedLevels.push(level);
  }
}
