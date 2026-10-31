// Compiled, never run: what a project that imports the published packages may and may not write.
import { ControlFlow, IteratedDominanceFrontier, Loops } from "@kobayami/graphity-controlflow";
import {
  Ancestry,
  BfsDistances,
  BiAdjacentGraph,
  Biconnectivity,
  BitSet,
  Dominators,
  Edges,
  EdgeMapping,
  EdgePartition,
  EdgeTypes,
  Graph,
  GraphBuilder,
  GraphDiff,
  IndexMapping,
  IndexPartition,
  NodeMapping,
  NodePartition,
  PreorderAncestry,
  Sccs,
  SortedIntView,
  StrongConnectivity,
  TopOrderAndLevels,
} from "@kobayami/graphity-core";
import { DotWriter } from "@kobayami/graphity-dot";
import { MermaidWriter } from "@kobayami/graphity-mermaid";
import * as graphity from "@kobayami/graphity";

/** Accepts a class only if a consumer may call its constructor with `new`. */
function constructible(type: abstract new (...args: never[]) => unknown): void {
  void type;
}

// The constructors that are public in Java.
constructible(GraphBuilder);
constructible(BitSet);

// Every other result type is built by the library only: its constructor is package-private or
// private in Java, and protected or private here.
// @ts-expect-error -- package-private in Java
constructible(Graph);
// @ts-expect-error -- package-private in Java
constructible(BiAdjacentGraph);
// @ts-expect-error -- package-private in Java
constructible(SortedIntView);
// @ts-expect-error -- package-private in Java
constructible(Edges);
// @ts-expect-error -- package-private in Java
constructible(IndexMapping);
// @ts-expect-error -- package-private in Java
constructible(NodeMapping);
// @ts-expect-error -- package-private in Java
constructible(EdgeMapping);
// @ts-expect-error -- package-private in Java
constructible(IndexPartition);
// @ts-expect-error -- package-private in Java
constructible(NodePartition);
// @ts-expect-error -- package-private in Java
constructible(EdgePartition);
// @ts-expect-error -- package-private in Java
constructible(Sccs);
// @ts-expect-error -- package-private in Java
constructible(Ancestry);
// @ts-expect-error -- private in Java
constructible(PreorderAncestry);
// @ts-expect-error -- package-private in Java
constructible(GraphDiff);
// @ts-expect-error -- private in Java
constructible(EdgeTypes);
// @ts-expect-error -- private in Java
constructible(Dominators);
// @ts-expect-error -- private in Java
constructible(BfsDistances);
// @ts-expect-error -- private in Java
constructible(Biconnectivity);
// @ts-expect-error -- private in Java
constructible(StrongConnectivity);
// @ts-expect-error -- private in Java
constructible(TopOrderAndLevels);
// @ts-expect-error -- private in Java
constructible(Loops);
// @ts-expect-error -- private in Java
constructible(IteratedDominanceFrontier);
// @ts-expect-error -- private in Java
constructible(DotWriter);
// @ts-expect-error -- private in Java
constructible(MermaidWriter);

// The types are nominal, as in Java: an object with the public members of a class is not an
// instance of it, and would fail inside the algorithms or read as an empty list.
declare function lookalike<T>(): { [K in keyof T]: T[K] };
// @ts-expect-error -- nominal as in Java
const fakeGraph: Graph = lookalike<Graph>();
// @ts-expect-error -- nominal as in Java
const fakeBiAdjacentGraph: BiAdjacentGraph = lookalike<BiAdjacentGraph>();
// @ts-expect-error -- nominal as in Java
const fakeView: SortedIntView = lookalike<SortedIntView>();
// @ts-expect-error -- nominal as in Java
const fakeAncestry: Ancestry = lookalike<Ancestry>();
// @ts-expect-error -- nominal as in Java
const fakeEdgeTypes: EdgeTypes = lookalike<EdgeTypes>();
// @ts-expect-error -- nominal as in Java
const fakeEdges: Edges = lookalike<Edges>();
void [fakeGraph, fakeBiAdjacentGraph, fakeView, fakeAncestry, fakeEdgeTypes, fakeEdges];

// Static methods are inherited as in Java: BiAdjacentGraph.of(start, adjacency) is Graph.of, and
// PreorderAncestry.of(forest) is Ancestry.of, each returning the plain type.
const graph: Graph = BiAdjacentGraph.of([0, 1, 1], [1]);
const bi: BiAdjacentGraph = BiAdjacentGraph.of(graph);
const ancestry: Ancestry = PreorderAncestry.of(graph);
const preorder: PreorderAncestry = PreorderAncestry.of(ancestry);
const frontiers: Graph = ControlFlow.dominanceFrontiers(Dominators.of(bi, 0));
const text: string = DotWriter.of(frontiers).writeToString() + MermaidWriter.of(graph).writeToString();
void [preorder, text, Loops.of(bi, 0).loopCount];

// The aggregate package exports the same classes.
const all: Graph = graphity.Graph.of([0, 1, 1], [1]);
const sink: graphity.TextSink = { write: (chunk: string) => chunk.length };
graphity.DotWriter.of(all).write(sink);
graphity.MermaidWriter.of(all).direction(graphity.Direction.LEFT_RIGHT).write(sink);
void graphity.Loops.of(graphity.BiAdjacentGraph.of(all), 0).isReducible;
