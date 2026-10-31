/**
 * Hard correctness check on a large random tree, to rule out any under-traversal or packed-state
 * bit bug that acyclic inputs could hide. A tree has fully determined results for every DFS
 * algorithm; any skipped node or wrong bit would break one of these invariants.
 */

import { describe, expect, it } from "vitest";
import { BackEdges, Components, EdgeType, EdgeTypes, GraphBuilder, Graphs, TopOrder } from "../src/index.js";
import { JavaRandom } from "./testutils/javaRandom.js";

describe("PackedStateTreeCorrectnessTest", () => {
  it("allDfsAlgorithmsAreCorrectOnLargeRandomTree", () => {
    const n = 100_000;
    const rnd = new JavaRandom(7);
    const parent = new Int32Array(n);
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 1; i < n; i++) {
      parent[i] = rnd.nextInt(i);
      b.addEdge(parent[i], i); // out-tree rooted at 0, parent < child, acyclic
    }
    const tree = b.build();

    // SCC: every node is its own component -> n singletons covering all nodes.
    const sccs = Components.sccsOf(tree);
    expect(sccs.groupCount).toBe(n);
    let covered = 0;
    let wrongSizes = 0;
    for (let g = 0; g < sccs.groupCount; g++) {
      if (sccs.nodesOf(g).size !== 1) wrongSizes++;
      covered += sccs.nodesOf(g).size;
    }
    expect(wrongSizes).toBe(0);
    expect(covered).toBe(n); // proves every node was visited

    // isDag: a tree is acyclic.
    expect(Graphs.isDag(tree)).toBe(true);

    // TopOrder: complete + valid (parent before child for every edge).
    const order = TopOrder.of(tree);
    expect(order.length).toBe(n);
    const pos = new Int32Array(n);
    for (let k = 0; k < n; k++) pos[order[k]] = k;
    let violations = 0;
    for (let i = 1; i < n; i++) if (!(pos[parent[i]] < pos[i])) violations++;
    expect(violations).toBe(0);

    // BackEdges: none in a tree.
    expect(BackEdges.of(tree).count).toBe(0);

    // EdgeTypes: every one of the n-1 edges is a TREE edge (no BACK/FORWARD/CROSS).
    const et = EdgeTypes.of(tree);
    let treeEdges = 0;
    for (let e = 0; e < tree.edgeCount; e++) if (et.typeOf(e) === EdgeType.TREE) treeEdges++;
    expect(treeEdges).toBe(tree.edgeCount);
    expect(treeEdges).toBe(n - 1);
  });

  it("packedStateHandlesCyclesToo", () => {
    const n = 1000;
    const b = new GraphBuilder();
    b.addNodes(n);
    for (let i = 0; i < n; i++) b.addEdge(i, (i + 1) % n); // one big directed cycle
    const cycle = b.build();

    expect(Components.sccsOf(cycle).groupCount).toBe(1); // whole cycle = one SCC
    expect(Graphs.isDag(cycle)).toBe(false);
    expect(BackEdges.of(cycle).count).toBe(1); // exactly one back edge closes it
  });
});
