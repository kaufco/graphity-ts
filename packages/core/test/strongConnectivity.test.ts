import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, Components, type Graph, type StrongConnectivity } from "../src/index.js";
import { DfsPreorder } from "../src/dfsPreorder.js";
import { expectArgumentError } from "./testutils/assertions.js";
import { strongByRemoval } from "./testutils/connectivityHelpers.js";
import { JavaRandom } from "./testutils/javaRandom.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

const of = (graph: Graph): StrongConnectivity => Components.strongConnectivityOf(BiAdjacentGraph.of(graph));

function bridges(result: StrongConnectivity): string[] {
  const b = result.strongBridges;
  const list: string[] = [];
  for (let i = 0; i < b.count; i++) list.push(`${b.sourceNodes[i]}->${b.targetNodes[i]}`);
  return list;
}

const points = (result: StrongConnectivity): number[] => Array.from(result.strongArticulationPoints);

function assertMatchesRemoval(g: Graph, description: string): void {
  const expected = strongByRemoval(g);
  const result = of(g);
  expect(bridges(result), `strong bridges of ${description}`).toEqual(expected.bridges);
  expect(points(result), `strong articulation points of ${description}`).toEqual(expected.points);
  const b = result.strongBridges;
  for (let p = 0; p < b.count; p++) {
    expect(g.edgeIndexOf(b.sourceNodes[p], b.targetNodes[p]), `edge index of a strong bridge, ${description}`).toBe(
      b.edgeIndices[p],
    );
  }
}

describe("StrongConnectivityTest", () => {
  // ---- Definitions ----

  it("a cycle without chords has only strong bridges and articulation points", () => {
    const result = of(TestGraphs.cycle(5));
    expect(bridges(result)).toEqual(["0->1", "1->2", "2->3", "3->4", "4->0"]);
    expect(points(result)).toEqual([0, 1, 2, 3, 4]);
  });

  it("a two-node cycle has two strong bridges but no articulation point", () => {
    const result = of(TestGraphs.cycle(2));
    expect(bridges(result)).toEqual(["0->1", "1->0"]);
    expect(points(result)).toEqual([]);
  });

  it("redundant paths leave nothing", () => {
    const result = of(TestGraphs.clique(4));
    expect(bridges(result)).toEqual([]);
    expect(points(result)).toEqual([]);
  });

  it("an edge between two tangles is not a strong bridge", () => {
    const result = of(TestGraphs.of(6, 0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3, 2, 3));
    expect(bridges(result)).toEqual(["0->1", "1->2", "2->0", "3->4", "4->5", "5->3"]);
    expect(points(result)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("the hub of two cycles is the only articulation point", () => {
    const result = of(TestGraphs.of(3, 0, 1, 1, 0, 0, 2, 2, 0));
    expect(points(result)).toEqual([0]);
    expect(bridges(result)).toEqual(["0->1", "0->2", "1->0", "2->0"]);
  });

  it("a chord is no strong bridge", () => {
    const result = of(TestGraphs.of(3, 0, 1, 1, 2, 2, 0, 0, 2));
    expect(bridges(result)).toEqual(["0->1", "1->2", "2->0"]);
    expect(points(result)).toEqual([0, 2]);
  });

  it("a self-loop is never a strong bridge", () => {
    expect(bridges(of(TestGraphs.of(1, 0, 0)))).toEqual([]);
    expect(bridges(of(TestGraphs.of(3, 0, 1, 1, 2, 2, 0, 1, 1)))).toEqual(["0->1", "1->2", "2->0"]);
  });

  it("acyclic and empty graphs have nothing", () => {
    for (const g of [
      TestGraphs.empty(),
      TestGraphs.isolated(3),
      TestGraphs.path(5),
      TestGraphs.outStar(4),
      RandomGraphs.randomDag(40, 0.2, 7),
      RandomGraphs.randomTree(40, 7),
    ]) {
      const result = of(g);
      expect(bridges(result)).toEqual([]);
      expect(points(result)).toEqual([]);
    }
  });

  it("the entry of its component is found too", () => {
    const g = TestGraphs.of(6, 0, 1, 1, 2, 2, 0, 0, 3, 3, 4, 4, 0, 4, 5);
    expect(points(of(g))).toEqual([0, 1, 2, 3, 4]);
  });

  it("works on a long cycle without overflowing the stack", () => {
    const n = 100_000;
    const result = of(TestGraphs.cycle(n));
    expect(result.strongBridges.count).toBe(n);
    expect(result.strongArticulationPoints.size).toBe(n);
  });

  it("rejects a node count beyond the limit of the dominators under its own name", () => {
    // A graph at the limit takes gigabytes; the check reads only the node count. TypeScript only:
    // the message names strongConnectivityOf, not the dominators that impose the limit.
    const huge = { nodeCount: DfsPreorder.MAX_NODE_COUNT + 1 } as unknown as BiAdjacentGraph;
    expectArgumentError(
      () => Components.strongConnectivityOf(huge),
      /^strongConnectivityOf keeps two ints per node in one array, counting a virtual root if it adds one, and so requires nodeCount <= 1073741818, but was 1073741819$/,
    );
  });

  // ---- Against removal and recount ----

  it("matches removal on random graphs", () => {
    const random = new JavaRandom(31);
    for (let iteration = 0; iteration < 400; iteration++) {
      const n = 1 + random.nextInt(12);
      const p = 0.05 + random.nextDouble() * 0.4;
      assertMatchesRemoval(RandomGraphs.gnp(n, p, random.nextLong()), `gnp ${iteration}`);
    }
    for (let seed = 0; seed < 150; seed++) {
      const lg = RandomGraphs.anyGraph(seed);
      if (lg.graph.nodeCount <= 60) assertMatchesRemoval(lg.graph, lg.describe());
    }
  });
});
