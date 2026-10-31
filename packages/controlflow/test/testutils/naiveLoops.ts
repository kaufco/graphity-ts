import { Components, type Graph, Graphs, type IntList, IntLists, NodeMapping } from "@kobayami/graphity-core";

/** One loop: its header, its body with nested loops, and the header of its enclosing loop. */
export interface NaiveLoop {
  readonly header: number;
  readonly body: boolean[];
  readonly parentHeader: number;
}

/**
 * Oracle for the loop nesting forest, taken literally from its definition by strongly connected
 * components: the outermost loops are the components with an edge, the header of each is the node
 * that a depth-first search from the entries reaches first, and the nested loops are the
 * components of the rest once the header is taken out. Recursive over the nesting and
 * O(nodeCount x (nodeCount + edgeCount)); meant for graphs of a few hundred nodes. As Java's
 * `NaiveLoops`.
 */
export class NaiveLoops {
  /** Loops keyed by header, `null` for a node that heads none. */
  readonly loopOfHeader: (NaiveLoop | null)[];

  readonly reachable: boolean[];

  /** Preorder position of each node in the search, -1 if unreachable. */
  readonly preorder: number[];

  readonly #graph: Graph;
  readonly #entries: number[];

  constructor(graph: Graph, entries: IntList) {
    this.#graph = graph;
    this.#entries = Array.from(IntLists.asArrayLike(entries));
    const n = graph.nodeCount;
    this.preorder = searchOrder(graph, this.#entries);
    this.reachable = this.preorder.map((p) => p >= 0);
    const all: number[] = [];
    for (let v = 0; v < n; v++) if (this.reachable[v]) all.push(v);
    this.loopOfHeader = new Array<NaiveLoop | null>(n).fill(null);
    this.#decompose(all, -1);
  }

  /** Records the loops among `region`, all inside the loop headed by `parentHeader`. */
  #decompose(region: number[], parentHeader: number): void {
    const mapping = NodeMapping.forSubgraph(region);
    const sub = Graphs.remapped(this.#graph, mapping);
    const sccs = Components.sccsOf(sub);
    for (let c = 0; c < sccs.groupCount; c++) {
      if (!sccs.containsCycle(c)) continue;
      const members = sccs.nodesOf(c);
      let header = -1;
      const body = new Array<boolean>(this.#graph.nodeCount).fill(false);
      for (let i = 0; i < members.size; i++) {
        const node = mapping.get(members.get(i));
        body[node] = true;
        if (header < 0 || this.preorder[node] < this.preorder[header]) header = node;
      }
      this.loopOfHeader[header] = { header, body, parentHeader };
      const rest: number[] = [];
      for (let i = 0; i < members.size; i++) {
        const node = mapping.get(members.get(i));
        if (node !== header) rest.push(node);
      }
      rest.sort((a, b) => a - b);
      this.#decompose(rest, header);
    }
  }

  /**
   * The entries of a loop: its nodes with a reachable predecessor outside it, and the entries of
   * the graph inside it.
   */
  entriesOf(loop: NaiveLoop): number[] {
    const graph = this.#graph;
    const n = graph.nodeCount;
    const isGraphEntry = new Array<boolean>(n).fill(false);
    for (const e of this.#entries) isGraphEntry[e] = true;
    const result: number[] = [];
    for (let x = 0; x < n; x++) {
      if (!loop.body[x]) continue;
      let entered = isGraphEntry[x];
      for (let p = 0; p < n && !entered; p++) {
        if (this.reachable[p] && !loop.body[p] && graph.hasOutNode(p, x)) entered = true;
      }
      if (entered) result.push(x);
    }
    return result;
  }
}

/** Preorder of a depth-first search from the entries in list order, successors ascending. */
function searchOrder(graph: Graph, entries: number[]): number[] {
  const n = graph.nodeCount;
  const preorder = new Array<number>(n).fill(-1);
  const nodeStack: number[] = [];
  const cursorStack: number[] = [];
  let count = 0;
  for (const entry of entries) {
    if (preorder[entry] >= 0) continue;
    preorder[entry] = count++;
    nodeStack.push(entry);
    cursorStack.push(0);
    while (nodeStack.length > 0) {
      const top = nodeStack.length - 1;
      const u = nodeStack[top];
      const cursor = cursorStack[top];
      const outs = graph.outNodes(u);
      if (cursor === outs.size) {
        nodeStack.pop();
        cursorStack.pop();
        continue;
      }
      cursorStack[top] = cursor + 1;
      const v = outs.get(cursor);
      if (preorder[v] < 0) {
        preorder[v] = count++;
        nodeStack.push(v);
        cursorStack.push(0);
      }
    }
  }
  return preorder;
}
