/** Recipes for edge data - visiting, summing, collecting and carrying it along - checked independently. */

import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, BitSet, Components, type Graph, Graphs, NodeMapping, SortedIntView } from "../src/index.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";

function weightsOf(graph: Graph): Float64Array {
  const weights = new Float64Array(graph.edgeCount);
  for (let e = 0; e < weights.length; e++) weights[e] = 1 + (e % 7);
  return weights;
}

describe("EdgeDataRecipesTest", () => {
  it("visits every edge with its data", () => {
    const graph = RandomGraphs.gnp(40, 0.1, 1);
    const weights = weightsOf(graph);
    let total = 0;
    graph.forEachEdge((_source, _target, edgeIndex) => {
      total += weights[edgeIndex];
    });
    expect(total).toBe(weights.reduce((a, b) => a + b, 0));
  });

  it("sums the weights behind each contracted edge and collects the edges between two groups", () => {
    const graph = RandomGraphs.gnp(60, 0.03, 2);
    const weights = weightsOf(graph);
    const partition = Components.sccsOf(graph);

    const condensed = partition.condense();
    const provenance = Graphs.edgePartition(condensed, partition);
    const weightPerCondensedEdge = provenance.reduce(weights, 0.0, (a, b) => a + b);

    expect(partition.sccCount).toBeGreaterThan(10);
    expect(condensed.edgeCount).toBeGreaterThan(10);

    for (let g = 0; g < partition.sccCount; g++) {
      for (let h = 0; h < partition.sccCount; h++) {
        const condensedEdge = condensed.edgeIndexOf(g, h); // -1 if no edge runs from g to h
        const between = condensedEdge < 0 ? SortedIntView.EMPTY : provenance.edgesOf(condensedEdge);
        let betweenWeight = 0;
        for (let i = 0; i < between.size; i++) betweenWeight += weights[between.get(i)];

        let sum = 0;
        let count = 0;
        for (let e = 0; e < graph.edgeCount; e++) {
          if (g !== h && partition.sccOf(graph.edgeSource(e)) === g && partition.sccOf(graph.edgeTarget(e)) === h) {
            sum += weights[e];
            count++;
          }
        }
        expect(between.size, `${g} -> ${h}`).toBe(count);
        expect(betweenWeight).toBe(sum);
        if (condensedEdge >= 0) expect(weightPerCondensedEdge[condensedEdge]).toBe(sum);
        for (const edgeIndex of between) {
          expect(partition.sccOf(graph.edgeSource(edgeIndex))).toBe(g);
          expect(partition.sccOf(graph.edgeTarget(edgeIndex))).toBe(h);
        }
      }
    }
    // Edges inside one group are in no condensed edge.
    for (let e = 0; e < graph.edgeCount; e++) {
      const inside = partition.sccOf(graph.edgeSource(e)) === partition.sccOf(graph.edgeTarget(e));
      expect(provenance.get(e) < 0).toBe(inside);
    }
  });

  it("carries edge data across a subgraph", () => {
    const graph = RandomGraphs.gnp(50, 0.1, 3);
    const weights = weightsOf(graph);
    const names = Array.from({ length: graph.nodeCount }, (_, v) => `v${v}`);
    const selected = new BitSet();
    for (let v = 0; v < graph.nodeCount; v += 2) selected.set(v);

    const keep = NodeMapping.forSubgraph(selected);
    const sub = Graphs.remapped(graph, keep);
    const subToGraph = Graphs.edgeMapping(sub, graph, keep);
    const subWeights = subToGraph.gather(weights);
    const subNames = new Array<string>(sub.nodeCount);
    keep.gather(names, subNames);

    expect(subWeights).toBeInstanceOf(Float64Array);
    sub.forEachEdge((source, target, edgeIndex) => {
      const oldEdge = graph.edgeIndexOf(keep.get(source), keep.get(target));
      expect(subWeights[edgeIndex]).toBe(weights[oldEdge]);
    });
    for (let v = 0; v < sub.nodeCount; v++) expect(subNames[v]).toBe(`v${keep.get(v)}`);
  });

  it("carries edge data across a transpose", () => {
    const graph = RandomGraphs.gnp(30, 0.1, 4);
    const weights = weightsOf(graph);

    const transpose = BiAdjacentGraph.of(graph).transposed();
    const newToOld = Graphs.transposedEdgeMapping(graph);
    const transposedWeights = newToOld.gather(weights);

    expect(transpose.edgeCount).toBeGreaterThan(0);
    transpose.forEachEdge((source, target, edgeIndex) => {
      expect(transposedWeights[edgeIndex]).toBe(weights[graph.edgeIndexOf(target, source)]);
    });
  });
});
