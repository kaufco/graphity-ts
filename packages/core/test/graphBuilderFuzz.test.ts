/**
 * Counterpart of Java's `GraphBuilderFuzzTest`: the convenience and batch methods of the builder
 * against the primitives they are sugar for. The oracle is always a second construction path that
 * must yield an equal graph. The random edge lists are drawn from `JavaRandom` with Java's seeds,
 * so they are the lists the Java test uses.
 */

import { describe, expect, it } from "vitest";
import { Edges, type Graph, GraphBuilder } from "../src/index.js";
import { expectSameGraph } from "./testutils/graphAssertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";

const ITERATIONS = 200;

interface EdgeList {
  readonly nodeCount: number;
  readonly sources: number[];
  readonly targets: number[];
}

const size = (edges: EdgeList) => edges.sources.length;

const describeEdges = (edges: EdgeList) => `n=${edges.nodeCount}, m=${size(edges)}`;

/** Node count required when nodes are created on reference rather than up front. */
function referencedNodeCount(edges: EdgeList): number {
  let max = -1;
  for (let i = 0; i < size(edges); i++) max = Math.max(max, edges.sources[i], edges.targets[i]);
  return max + 1;
}

function randomEdges(seed: number): EdgeList {
  const rnd = new JavaRandom(BigInt(seed) * 1_000_003n + 17n);
  const n = 1 + rnd.nextInt(60);
  const m = rnd.nextInt(3 * n);
  const sources: number[] = [];
  const targets: number[] = [];
  for (let i = 0; i < m; i++) {
    sources.push(rnd.nextInt(n));
    targets.push(rnd.nextInt(n));
  }
  return { nodeCount: n, sources, targets };
}

function edgeByEdge(edges: EdgeList): Graph {
  const b = new GraphBuilder();
  b.addNodes(edges.nodeCount);
  for (let i = 0; i < size(edges); i++) b.addEdge(edges.sources[i], edges.targets[i]);
  return b.build();
}

/** Buckets the edge list by source (or by target), producing one list per node. */
function group(edges: EdgeList, bySource: boolean, nodeCount: number): number[][] {
  const groups: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let i = 0; i < size(edges); i++) {
    const key = bySource ? edges.sources[i] : edges.targets[i];
    groups[key].push(bySource ? edges.targets[i] : edges.sources[i]);
  }
  return groups;
}

function interleave(edges: EdgeList): Int32Array {
  const flat = new Int32Array(2 * size(edges));
  for (let i = 0; i < size(edges); i++) {
    flat[2 * i] = edges.sources[i];
    flat[2 * i + 1] = edges.targets[i];
  }
  return flat;
}

/** The random edges as an `Edges` list; the builder ignores the edge indices. */
const asEdges = (edges: EdgeList) =>
  Edges.create(Int32Array.from(edges.sources), Int32Array.from(edges.targets), new Int32Array(size(edges)));

describe("GraphBuilderFuzzTest", () => {
  it("capacityHintsDoNotChangeTheResult", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const edges = randomEdges(seed);
      const expected = edgeByEdge(edges);
      for (const hint of [0, Math.trunc(size(edges) / 2), size(edges), 2 * size(edges) + 8]) {
        const b = new GraphBuilder();
        b.ensureEdgeCapacity(hint);
        b.addNodes(edges.nodeCount);
        for (let i = 0; i < size(edges); i++) b.addEdge(edges.sources[i], edges.targets[i]);
        expectSameGraph(b.build(), expected, `capacity hint ${hint} for ${describeEdges(edges)}`);
      }
    }
  });

  it("capacityHintAppliedMidConstructionKeepsAllEdges", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const edges = randomEdges(seed);
      const half = Math.trunc(size(edges) / 2);
      const b = new GraphBuilder();
      b.addNodes(edges.nodeCount);
      for (let i = 0; i < half; i++) b.addEdge(edges.sources[i], edges.targets[i]);
      b.ensureEdgeCapacity(size(edges));
      for (let i = half; i < size(edges); i++) b.addEdge(edges.sources[i], edges.targets[i]);
      expectSameGraph(b.build(), edgeByEdge(edges), `mid-construction hint for ${describeEdges(edges)}`);
    }
  });

  it("batchFormsMatchEdgeByEdge", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const edges = randomEdges(seed);
      const n = edges.nodeCount;
      const expected = edgeByEdge(edges);
      const bySource = group(edges, true, n);
      const byTarget = group(edges, false, n);

      const fanOutArray = new GraphBuilder();
      fanOutArray.addNodes(n);
      for (let node = 0; node < n; node++) fanOutArray.addOutEdges(node, Int32Array.from(bySource[node]));

      const fanOutList = new GraphBuilder();
      fanOutList.addNodes(n);
      for (let node = 0; node < n; node++) fanOutList.addOutEdges(node, bySource[node]);

      const fanOutLoose = new GraphBuilder();
      fanOutLoose.addNodes(n);
      for (let node = 0; node < n; node++) fanOutLoose.addOutEdges(node, ...bySource[node]);

      const fanInArray = new GraphBuilder();
      fanInArray.addNodes(n);
      for (let node = 0; node < n; node++) fanInArray.addInEdges(node, Int32Array.from(byTarget[node]));

      const fanInList = new GraphBuilder();
      fanInList.addNodes(n);
      for (let node = 0; node < n; node++) fanInList.addInEdges(node, byTarget[node]);

      const pairs = new GraphBuilder();
      pairs.addNodes(n);
      pairs.addEdgePairs(interleave(edges));

      const edgeList = new GraphBuilder();
      edgeList.addNodes(n);
      edgeList.addEdges(asEdges(edges));

      const d = describeEdges(edges);
      expectSameGraph(fanOutArray.build(), expected, `fan-out from Int32Array for ${d}`);
      expectSameGraph(fanOutList.build(), expected, `fan-out from a list for ${d}`);
      expectSameGraph(fanOutLoose.build(), expected, `fan-out from loose arguments for ${d}`);
      expectSameGraph(fanInArray.build(), expected, `fan-in from Int32Array for ${d}`);
      expectSameGraph(fanInList.build(), expected, `fan-in from a list for ${d}`);
      expectSameGraph(pairs.build(), expected, `edge pairs for ${d}`);
      expectSameGraph(edgeList.build(), expected, `Edges for ${d}`);
    }
  });

  it("andNodesTwinsMatchPreallocatedConstruction", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const edges = randomEdges(seed);
      const referenced = referencedNodeCount(edges);

      const expected = new GraphBuilder();
      expected.addNodes(referenced);
      for (let i = 0; i < size(edges); i++) expected.addEdge(edges.sources[i], edges.targets[i]);
      const reference = expected.build();

      const single = new GraphBuilder();
      for (let i = 0; i < size(edges); i++) single.addEdgeAndNodes(edges.sources[i], edges.targets[i]);

      const pairs = new GraphBuilder();
      pairs.addEdgePairsAndNodes(interleave(edges));

      const edgeList = new GraphBuilder();
      edgeList.addEdgesAndNodes(asEdges(edges));

      const bySource = group(edges, true, referenced);
      const fanOutArray = new GraphBuilder();
      const fanOutList = new GraphBuilder();
      for (let node = 0; node < referenced; node++) {
        fanOutArray.addOutEdgesAndNodes(node, Int32Array.from(bySource[node]));
        fanOutList.addOutEdgesAndNodes(node, bySource[node]);
      }

      const byTarget = group(edges, false, referenced);
      const fanInArray = new GraphBuilder();
      const fanInList = new GraphBuilder();
      for (let node = 0; node < referenced; node++) {
        fanInArray.addInEdgesAndNodes(node, Int32Array.from(byTarget[node]));
        fanInList.addInEdgesAndNodes(node, byTarget[node]);
      }

      const d = describeEdges(edges);
      expectSameGraph(single.build(), reference, `addEdgeAndNodes for ${d}`);
      expectSameGraph(pairs.build(), reference, `addEdgePairsAndNodes for ${d}`);
      expectSameGraph(edgeList.build(), reference, `addEdgesAndNodes from Edges for ${d}`);
      expectSameGraph(fanOutArray.build(), reference, `addOutEdgesAndNodes from Int32Array for ${d}`);
      expectSameGraph(fanOutList.build(), reference, `addOutEdgesAndNodes from a list for ${d}`);
      expectSameGraph(fanInArray.build(), reference, `addInEdgesAndNodes from Int32Array for ${d}`);
      expectSameGraph(fanInList.build(), reference, `addInEdgesAndNodes from a list for ${d}`);
    }
  });

  it("pathsMatchExplicitEdges", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const rnd = new JavaRandom(seed * 977 + 13);
      const n = 1 + rnd.nextInt(40);
      const length = rnd.nextInt(12);
      const nodes: number[] = [];
      for (let i = 0; i < length; i++) nodes.push(rnd.nextInt(n));

      const explicitEdges = new GraphBuilder();
      explicitEdges.addNodes(n);
      for (let i = 1; i < length; i++) explicitEdges.addEdge(nodes[i - 1], nodes[i]);
      const reference = explicitEdges.build();

      const viaPath = new GraphBuilder();
      viaPath.addNodes(n);
      viaPath.addPath(...nodes);

      const viaPathArray = new GraphBuilder();
      viaPathArray.addNodes(n);
      viaPathArray.addPath(Int32Array.from(nodes));

      const viaPathList = new GraphBuilder();
      viaPathList.addNodes(n);
      viaPathList.addPath(nodes);

      expectSameGraph(viaPath.build(), reference, `addPath, seed ${seed}`);
      expectSameGraph(viaPathArray.build(), reference, `addPath from Int32Array, seed ${seed}`);
      expectSameGraph(viaPathList.build(), reference, `addPath from a list, seed ${seed}`);

      const referenced = nodes.reduce((max, node) => Math.max(max, node + 1), 0);
      const grownReference = new GraphBuilder();
      grownReference.addNodes(referenced);
      grownReference.addPath(nodes);

      const viaPathAndNodes = new GraphBuilder();
      viaPathAndNodes.addPathAndNodes(...nodes);

      const viaPathAndNodesList = new GraphBuilder();
      viaPathAndNodesList.addPathAndNodes(nodes);

      expectSameGraph(viaPathAndNodes.build(), grownReference.build(), `addPathAndNodes, seed ${seed}`);
      expectSameGraph(viaPathAndNodesList.build(), grownReference.build(), `addPathAndNodes from a list, seed ${seed}`);
    }
  });

  it("childAndParentHelpersMatchManualConstruction", () => {
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const helpers = new GraphBuilder();
      const manual = new GraphBuilder();
      helpers.addNode();
      manual.addNode();

      const rnd = new JavaRandom(seed * 31 + 5);
      const rounds = 1 + rnd.nextInt(12);
      let nodeCount = 1;

      for (let round = 0; round < rounds; round++) {
        const anchor = rnd.nextInt(nodeCount);
        const count = rnd.nextInt(4);
        const downwards = rnd.nextBoolean();

        let viaHelper: number;
        let viaManual: number;
        if (count === 1 && downwards) {
          viaHelper = helpers.addChild(anchor);
          viaManual = manual.addNode();
          manual.addEdge(anchor, viaManual);
        } else if (count === 1) {
          viaHelper = helpers.addParent(anchor);
          viaManual = manual.addNode();
          manual.addEdge(viaManual, anchor);
        } else if (downwards) {
          viaHelper = helpers.addChildren(anchor, count);
          viaManual = manual.addNodes(count);
          for (let i = 0; i < count; i++) manual.addEdge(anchor, viaManual + i);
        } else {
          viaHelper = helpers.addParents(anchor, count);
          viaManual = manual.addNodes(count);
          for (let i = 0; i < count; i++) manual.addEdge(viaManual + i, anchor);
        }
        expect(viaHelper, `first returned ID, seed ${seed} round ${round}`).toBe(viaManual);
        nodeCount += count;
      }
      expectSameGraph(helpers.build(), manual.build(), `child/parent helpers, seed ${seed}`);
    }
  });

  /**
   * Every added edge, duplicates included, is found by `edgeIndexOf` at an index that holds exactly
   * that edge, and distinct edges never share an index.
   */
  it("edgeIndexOfTranslatesEveryInsertion", () => {
    let duplicatesSeen = 0;
    for (let seed = 0; seed < ITERATIONS; seed++) {
      const edges = randomEdges(seed);
      const g = edgeByEdge(edges);
      const edgeOfInsertion: number[] = [];
      for (let k = 0; k < size(edges); k++) {
        const s = edges.sources[k];
        const t = edges.targets[k];
        const e = g.edgeIndexOf(s, t);
        edgeOfInsertion.push(e);
        expect(e >= 0 && e < g.edgeCount, `insertion ${k}, ${describeEdges(edges)}`).toBe(true);
        expect(g.edgeSource(e)).toBe(s);
        expect(g.edgeTarget(e)).toBe(t);
      }
      for (let a = 0; a < size(edges); a++) {
        for (let b = a + 1; b < size(edges); b++) {
          const same = edges.sources[a] === edges.sources[b] && edges.targets[a] === edges.targets[b];
          if (same) duplicatesSeen++;
          if ((edgeOfInsertion[a] === edgeOfInsertion[b]) !== same) {
            expect.fail(`insertions ${a} and ${b}, ${describeEdges(edges)}: same index ${!same}`);
          }
        }
      }
    }
    expect(duplicatesSeen, "duplicate insertions compared").toBeGreaterThan(50);
  });
});
