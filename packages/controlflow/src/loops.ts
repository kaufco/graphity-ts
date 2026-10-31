import { type BiAdjacentGraph, Csr, type IntList, SortedIntView } from "@kobayami/graphity-core";
import { DfsPreorder } from "./dfsPreorder.js";
import { checkIndex, IntBuffer } from "./internal.js";

/**
 * The loop nesting forest of a control-flow graph: its loops, how they nest and where each of them
 * is entered, irreducible loops included.
 *
 * A loop has a header, through which it is normally entered, and a body: the header, the other
 * nodes of the loop and those of the loops nested in it. {@link Loops.of} finds the loops from the
 * entry of the graph - here, the loop of a method `load` around its block `then`, from its control
 * flow `cfg` and its entry block `entry`:
 *
 * <!-- example: analyzingControlFlow.ts#loops -->
 * ```ts
 * // The basic blocks of load are the nodes 0..5 of cfg: entry, header, body, then,
 * // next, exit.
 *
 * // Find the loops of load, from its entry block.
 * const loops = Loops.of(BiAdjacentGraph.of(cfg), entry);
 *
 * // Find the loop around the block then, with its header and its body.
 * const loop = loops.innermostLoopOf(then);   // 0 - the for loop, the only loop
 * const header = loops.headerOf(loop);        // 1 - the block header
 * // [1, 2, 3, 4] - header, body, then and next
 * const blocks = loops.bodyOf(loop);
 * ```
 *
 * The forest is defined on every graph, reducible or not, over the nodes that the entries reach:
 *
 * - The outermost loops are the strongly connected components that contain at least one edge.
 * - The header of a loop is the node of its component that a depth-first search from the entries
 *   reaches first. The search takes the entries in list order and the out-nodes of a node in
 *   ascending order.
 * - Without the edges that lead into the header from inside the component, the rest of it breaks up
 *   into the nested loops, by the same rule.
 *
 * Uses Havlak's algorithm, without recursion. On a reducible graph, the loops are the natural
 * loops. An irreducible loop is a cycle that can be entered at more than one node, as `goto`,
 * bytecode or generated state machines produce it. It is one loop with several
 * {@link Loops.entriesOf | entries}, and which of them is the header depends on the order of the
 * search. An entry of the graph that lies in a loop is an entry of that loop. A node with a
 * self-loop is the header of a loop of its own, unless it already is the header of a larger one.
 * Nodes that no entry reaches are in no loop.
 *
 * Loops have IDs `0..loopCount-1`, in preorder of the forest: a loop has a smaller ID than the
 * loops nested in it, which follow it as one range of IDs. Going through the IDs downwards visits
 * the inner loops first.
 *
 * Like `Dominators`, the analysis follows edges against their direction and so takes a
 * `BiAdjacentGraph`; the same graph serves both. Instances are immutable.
 *
 * **Memory:** 4 x nodeCount bytes, plus 4 bytes per node in a loop, 24 bytes per loop and 4 bytes
 * per entry of a loop.
 */
export class Loops {
  /** Innermost loop of each node, -1 outside every loop. */
  readonly #innermostLoop: Int32Array;

  /** Header node of each loop. */
  readonly #header: Int32Array;

  /** Enclosing loop of each loop, -1 at the top level. */
  readonly #parent: Int32Array;

  /** One past the last loop nested in each loop: the loops in `L` are `[L, end[L])`. */
  readonly #subtreeEnd: Int32Array;

  /** Number of loops containing each loop, itself included. */
  readonly #depth: Int32Array;

  /**
   * Start of each loop's own nodes in {@link #bodies}; the body of `L` with its nested loops is
   * `[bodyStart[L], bodyStart[subtreeEnd[L]])`.
   */
  readonly #bodyStart: Int32Array;

  /** All loop bodies in loop-ID order, each loop's own nodes header first, then ascending. */
  readonly #bodies: Int32Array;

  /** Entries of each loop as CSR offsets into {@link #entries}, each list ascending. */
  readonly #entryStart: Int32Array;

  readonly #entries: Int32Array;

  readonly #reducible: boolean;

  private constructor(
    innermostLoop: Int32Array,
    header: Int32Array,
    parent: Int32Array,
    subtreeEnd: Int32Array,
    depth: Int32Array,
    bodyStart: Int32Array,
    bodies: Int32Array,
    entryStart: Int32Array,
    entries: Int32Array,
    reducible: boolean,
  ) {
    this.#innermostLoop = innermostLoop;
    this.#header = header;
    this.#parent = parent;
    this.#subtreeEnd = subtreeEnd;
    this.#depth = depth;
    this.#bodyStart = bodyStart;
    this.#bodies = bodies;
    this.#entryStart = entryStart;
    this.#entries = entries;
    this.#reducible = reducible;
  }

  /**
   * Returns the loop nesting forest of `graph` with one entry. Equivalent to `of(graph, [entry])`.
   *
   * **Time:** as for the form with a list of entries.
   * **Memory:** as for the form with a list of entries.
   *
   * @param graph the control-flow graph
   * @param entry node ID in `0..nodeCount-1`
   * @returns the loop nesting forest
   * @throws RangeError if `entry` is out of range
   * @throws Error if `graph` has more than 2^30 - 6 nodes
   */
  static of(graph: BiAdjacentGraph, entry: number): Loops;
  /**
   * Returns the loop nesting forest of `graph` with the given entries.
   *
   * The entries work as in {@link @kobayami/graphity-core!Dominators.of | `Dominators.of`}: an
   * entry given twice counts once, and with no entries, no node is reachable, so there is no loop.
   * Their order matters here: it decides which node of an irreducible loop the search reaches
   * first, and so which node is its header.
   *
   * **Time:** O(number of entries + (nodeCount + edgeCount) log nodeCount) on a reducible graph. On
   * an irreducible graph, an edge costs one more step for every loop it enters other than through
   * the header. **Memory:** the result, as given in the class documentation; while it runs, about
   * 45 x nodeCount + 4 x edgeCount bytes more, plus 28 bytes per loop and 12 bytes per entry of a
   * loop.
   *
   * @param graph the control-flow graph
   * @param entries node IDs in `0..nodeCount-1`, in the order the search takes them
   * @returns the loop nesting forest
   * @throws RangeError if an entry is out of range
   * @throws Error if `graph` has more than 2^30 - 6 nodes
   */
  static of(graph: BiAdjacentGraph, entries: IntList): Loops;
  static of(graph: BiAdjacentGraph, entries: number | IntList): Loops {
    const n = graph.nodeCount;
    // A list is an object; anything else is a node ID, so that undefined fails the range check.
    const dfs = DfsPreorder.of(graph, typeof entries === "object" ? entries : [entries], "Loops");
    const size = dfs.reachedCount + 1;
    const order = dfs.order;
    const number = dfs.preorderNumber;

    // 1) Last preorder number in each search subtree: v's subtree is [v, last[v]].
    const last = new Int32Array(size);
    for (let v = 0; v < size; v++) last[v] = v;
    for (let v = size - 1; v >= 1; v--) {
      const p = dfs.parent[v];
      if (p > 0 && last[v] > last[p]) last[p] = last[v];
    }

    // Predecessors from the in-adjacency over node IDs, translated per edge through `number`
    // (0 = unreachable).
    const predStart = Csr.inAdjacencyStart(graph);
    const preds = Csr.inAdjacency(graph);

    // 2) Headers in reverse preorder, inner before outer. The body of w is the part of its search
    //    subtree that reaches w inside that subtree. Union-find collapses finished loops into
    //    their header; the edges that enter a collapsed region from outside wait in a linked list
    //    per region, so an enclosing header scans each of them once instead of rescanning every
    //    predecessor of every node inside.
    const uf = new Int32Array(size);
    for (let v = 0; v < size; v++) uf[v] = v;
    const enclosing = new Int32Array(size);
    const mark = new Int32Array(size);
    const pendingHead = new Int32Array(size).fill(-1);
    const pendingTail = new Int32Array(size).fill(-1);
    const pendingNext = new Int32Array(preds.length);
    const stack = new Int32Array(size);
    const body = new Int32Array(size);
    const isHeader = new Uint8Array(size);
    let loopCount = 0;

    for (let w = size - 1; w >= 1; w--) {
      const lastW = last[w];
      let selfLoop = false;
      let top = 0;
      const node = order[w];
      for (let i = predStart[node], end = predStart[node + 1]; i < end; i++) {
        const v = number[preds[i]];
        if (v === 0) continue;
        if (v >= w && v <= lastW) {
          if (v === w) {
            selfLoop = true;
          } else {
            const r = find(uf, v);
            if (mark[r] !== w) {
              mark[r] = w;
              stack[top++] = r;
            }
          }
        } else {
          append(pendingHead, pendingTail, pendingNext, w, i);
        }
      }
      if (top === 0 && !selfLoop) continue;

      isHeader[w] = 1;
      loopCount++;
      let bodyCount = 0;
      while (top > 0) {
        const x = stack[--top];
        body[bodyCount++] = x;
        let i = pendingHead[x];
        pendingHead[x] = -1;
        pendingTail[x] = -1;
        while (i >= 0) {
          const next = pendingNext[i];
          const r = find(uf, number[preds[i]]);
          if (r >= w && r <= lastW) {
            if (r !== w && mark[r] !== w) {
              mark[r] = w;
              stack[top++] = r;
            }
          } else {
            append(pendingHead, pendingTail, pendingNext, w, i);
          }
          i = next;
        }
      }
      for (let b = 0; b < bodyCount; b++) {
        uf[body[b]] = w;
        enclosing[body[b]] = w;
      }
    }

    // 3) Loop IDs in preorder of the forest; siblings by the preorder of their headers.
    // The child lists and the walk are ParentForest.groupCounted and ParentForest.preorder of the
    // core, which a package cannot call; change them together.
    // mark and stack are free now: mark maps each header to its index, stack walks the forest.
    const loopIndex = mark.fill(-1);
    const indexHeader = new Int32Array(loopCount);
    let k = 0;
    for (let v = 1; v < size; v++) {
      if (isHeader[v] !== 0) {
        loopIndex[v] = k;
        indexHeader[k++] = v;
      }
    }
    const childStart = new Int32Array(loopCount + 1);
    const indexParent = new Int32Array(loopCount);
    for (let i = 0; i < loopCount; i++) {
      const e = enclosing[indexHeader[i]];
      indexParent[i] = e === 0 ? -1 : loopIndex[e];
      if (indexParent[i] >= 0) childStart[indexParent[i]]++;
    }
    let nextChildStart = 0;
    for (let i = 0; i < loopCount; i++) {
      const count = childStart[i];
      childStart[i] = nextChildStart;
      nextChildStart += count;
    }
    childStart[loopCount] = nextChildStart;
    const children = new Int32Array(nextChildStart);
    // childStart[p] doubles as write pointer and is shifted back afterwards.
    for (let i = 0; i < loopCount; i++) {
      if (indexParent[i] >= 0) children[childStart[indexParent[i]]++] = i;
    }
    for (let i = loopCount; i > 0; i--) childStart[i] = childStart[i - 1];
    childStart[0] = 0;

    const idOfIndex = new Int32Array(loopCount);
    const header = new Int32Array(loopCount);
    const parent = new Int32Array(loopCount);
    const depth = new Int32Array(loopCount);
    const subtreeEnd = new Int32Array(loopCount);
    let id = 0;
    let top = 0;
    for (let i = loopCount - 1; i >= 0; i--) {
      if (indexParent[i] < 0) stack[top++] = i;
    }
    while (top > 0) {
      const i = stack[--top];
      idOfIndex[i] = id;
      header[id] = order[indexHeader[i]];
      parent[id] = indexParent[i] < 0 ? -1 : idOfIndex[indexParent[i]];
      depth[id] = parent[id] < 0 ? 1 : depth[parent[id]] + 1;
      id++;
      for (let c = childStart[i + 1] - 1; c >= childStart[i]; c--) stack[top++] = children[c];
    }
    for (let l = 0; l < loopCount; l++) subtreeEnd[l] = l + 1;
    for (let l = loopCount - 1; l >= 0; l--) {
      if (parent[l] >= 0 && subtreeEnd[l] > subtreeEnd[parent[l]]) {
        subtreeEnd[parent[l]] = subtreeEnd[l];
      }
    }

    // 4) Innermost loop per node: its own loop for a header, else the loop that collapsed it.
    const innermostLoop = new Int32Array(n).fill(-1);
    for (let v = 1; v < size; v++) {
      const h = isHeader[v] !== 0 ? v : enclosing[v];
      if (h !== 0) innermostLoop[order[v]] = idOfIndex[loopIndex[h]];
    }

    // 5) Bodies: each loop's own nodes, header first, then ascending; loops in ID order, so the
    //    nested loops of L follow its own nodes and the whole body is one slice.
    const bodyStart = new Int32Array(loopCount + 1);
    for (let node = 0; node < n; node++) {
      if (innermostLoop[node] >= 0) bodyStart[innermostLoop[node]]++;
    }
    let nextBodyStart = 0;
    for (let l = 0; l < loopCount; l++) {
      const count = bodyStart[l];
      bodyStart[l] = nextBodyStart;
      nextBodyStart += count;
    }
    bodyStart[loopCount] = nextBodyStart;
    const bodies = new Int32Array(nextBodyStart);
    const bodyWritePos = bodyStart.slice(0, loopCount);
    for (let l = 0; l < loopCount; l++) bodies[bodyWritePos[l]++] = header[l];
    for (let node = 0; node < n; node++) {
      const l = innermostLoop[node];
      if (l >= 0 && header[l] !== node) bodies[bodyWritePos[l]++] = node;
    }

    // 6) Entries: x enters every loop that contains x but not one of its predecessors - a chain
    //    from the innermost loop of x upwards. Walking each chain only above the part already
    //    marked keeps this proportional to the result. A graph entry has the virtual root as
    //    predecessor, which no loop contains.
    const entryLoops = new IntBuffer();
    const entryNodes = new IntBuffer();
    for (let x = 0; x < n; x++) {
      const lx = innermostLoop[x];
      if (lx < 0) continue;
      const v = number[x];
      let marked = -1;
      if (dfs.isEntry(v)) {
        for (let l = lx; l >= 0; l = parent[l]) {
          entryLoops.push(l);
          entryNodes.push(x);
        }
        continue;
      }
      for (let i = predStart[x], end = predStart[x + 1]; i < end; i++) {
        const y = preds[i];
        if (number[y] === 0) continue;
        const ly = innermostLoop[y];
        let l: number;
        if (marked < 0) {
          l = lx;
        } else if (contains(subtreeEnd, marked, ly)) {
          continue;
        } else {
          l = parent[marked];
        }
        while (l >= 0 && !contains(subtreeEnd, l, ly)) {
          entryLoops.push(l);
          entryNodes.push(x);
          marked = l;
          l = parent[l];
        }
      }
    }
    const entryStart = new Int32Array(loopCount + 1);
    const entryLoopData = entryLoops.data;
    const entryCount = entryLoops.length;
    for (let i = 0; i < entryCount; i++) entryStart[entryLoopData[i]]++;
    let nextEntryStart = 0;
    let reducible = true;
    for (let l = 0; l < loopCount; l++) {
      const count = entryStart[l];
      if (count !== 1) reducible = false;
      entryStart[l] = nextEntryStart;
      nextEntryStart += count;
    }
    entryStart[loopCount] = nextEntryStart;
    const loopEntries = new Int32Array(nextEntryStart);
    const entryWritePos = entryStart.slice(0, loopCount);
    const entryNodeData = entryNodes.data;
    for (let i = 0; i < entryCount; i++) {
      loopEntries[entryWritePos[entryLoopData[i]]++] = entryNodeData[i];
    }

    return new Loops(
      innermostLoop,
      header,
      parent,
      subtreeEnd,
      depth,
      bodyStart,
      bodies,
      entryStart,
      loopEntries,
      reducible,
    );
  }

  /**
   * The number of loops (Java: `loopCount()`).
   *
   * **Time:** O(1).
   */
  get loopCount(): number {
    return this.#header.length;
  }

  /**
   * Whether the graph is reducible: whether every loop has its header as its only entry (Java:
   * `isReducible()`).
   *
   * The loops of a reducible graph are its natural loops. A node counts only if the entries reach
   * it.
   *
   * **Time:** O(1).
   */
  get isReducible(): boolean {
    return this.#reducible;
  }

  /**
   * Returns the innermost loop that contains `node`, or `-1` if it lies in no loop.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns loop ID, or `-1`
   * @throws RangeError if `node` is out of range
   */
  innermostLoopOf(node: number): number {
    checkIndex(node, this.#innermostLoop.length);
    return this.#innermostLoop[node];
  }

  /**
   * Returns the loop depth of `node`: the number of loops that contain it. A node in no loop has
   * loop depth `0`.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @returns loop depth
   * @throws RangeError if `node` is out of range
   */
  loopDepthOf(node: number): number {
    checkIndex(node, this.#innermostLoop.length);
    const loop = this.#innermostLoop[node];
    return loop < 0 ? 0 : this.#depth[loop];
  }

  /**
   * Returns whether `node` lies in `loop`, directly or in a loop nested in it.
   *
   * **Time:** O(1).
   *
   * @param node node ID in `0..nodeCount-1`
   * @param loop loop ID in `0..loopCount-1`
   * @returns `true` if the node is in the loop
   * @throws RangeError if `node` or `loop` is out of range
   */
  isInLoop(node: number, loop: number): boolean {
    checkIndex(node, this.#innermostLoop.length);
    checkIndex(loop, this.#header.length);
    return contains(this.#subtreeEnd, loop, this.#innermostLoop[node]);
  }

  /**
   * Returns the header of `loop`.
   *
   * **Time:** O(1).
   *
   * @param loop loop ID in `0..loopCount-1`
   * @returns header node ID
   * @throws RangeError if `loop` is out of range
   */
  headerOf(loop: number): number {
    checkIndex(loop, this.#header.length);
    return this.#header[loop];
  }

  /**
   * Returns the entries of `loop`, in ascending order.
   *
   * These are the nodes of the loop with an in-node outside the loop, and the entries of the graph
   * that lie in the loop. An in-node counts only if the entries of the graph reach it. A loop that
   * can only be entered through its header has the header as its only entry.
   *
   * The result is a view of this forest's own array, not a copy.
   *
   * **Time:** O(entriesOf(loop).size).
   *
   * @param loop loop ID in `0..loopCount-1`
   * @returns entry node IDs
   * @throws RangeError if `loop` is out of range
   */
  entriesOf(loop: number): SortedIntView {
    checkIndex(loop, this.#header.length);
    return SortedIntView.viewOf(this.#entries, this.#entryStart[loop], this.#entryStart[loop + 1]);
  }

  /**
   * Returns the loop that immediately encloses `loop`, or `-1` for an outermost loop.
   *
   * **Time:** O(1).
   *
   * @param loop loop ID in `0..loopCount-1`
   * @returns enclosing loop ID, smaller than `loop`, or `-1`
   * @throws RangeError if `loop` is out of range
   */
  parentOf(loop: number): number {
    checkIndex(loop, this.#header.length);
    return this.#parent[loop];
  }

  /**
   * Returns the body of `loop`: its nodes and those of the loops nested in it.
   *
   * The nodes come in this order: first the header, then, in ascending order, the other nodes whose
   * innermost loop is `loop`, then the nodes of the nested loops in the same form, loop after loop
   * in ID order.
   *
   * The result is a view of this forest's own array, not a copy, and must not be modified (Java: an
   * unmodifiable view). All bodies share the array, so a node is stored once, however deeply its
   * loop is nested.
   *
   * **Time:** O(1).
   *
   * @param loop loop ID in `0..loopCount-1`
   * @returns node IDs of the body
   * @throws RangeError if `loop` is out of range
   */
  bodyOf(loop: number): Int32Array {
    checkIndex(loop, this.#header.length);
    return this.#bodies.subarray(this.#bodyStart[loop], this.#bodyStart[this.#subtreeEnd[loop]]);
  }
}

/** Whether the loop `inner`, -1 for none, is `loop` or nested in it. */
function contains(subtreeEnd: Int32Array, loop: number, inner: number): boolean {
  return inner >= loop && inner < subtreeEnd[loop];
}

function find(uf: Int32Array, x: number): number {
  let root = x;
  while (uf[root] !== root) root = uf[root];
  while (uf[x] !== root) {
    const up = uf[x];
    uf[x] = root;
    x = up;
  }
  return root;
}

function append(head: Int32Array, tail: Int32Array, next: Int32Array, list: number, item: number): void {
  next[item] = -1;
  if (tail[list] < 0) {
    head[list] = item;
  } else {
    next[tail[list]] = item;
  }
  tail[list] = item;
}
