Graphity is a graph library which keeps graphs in a compact, immutable form and provides algorithms on top of it, such as strongly and weakly connected components, bridges and articulation points, topological order and levels, cycle detection and edge classification, breadth-first distances and reachability, lowest common ancestors, dominators, loop nesting and condensed graphs.

This is its TypeScript implementation, which follows the [Java library](https://github.com/kaufco/graphity) of the same version type by type and method by method.

Every algorithm returns a typed, immutable result with follow-up queries, and runs without recursion, so deep graphs do not overflow the call stack. Data on nodes and edges stays in your own arrays, indexed by node ID or edge index, and every transformation tells you how to carry them along. The graph itself stores only structure: 4 bytes per node and per edge, in a compressed sparse row (CSR) layout, which is where speed and footprint come from.

## Where to start

The nodes of a {@link @kobayami/graphity-core!Graph Graph} are the `number` IDs `0..nodeCount-1`, and its edges are numbered by edge index `0..edgeCount-1`, ordered by source and then by target. {@link @kobayami/graphity-core!GraphBuilder GraphBuilder} builds a graph from edges in any order. The algorithms are not methods of the graph but functions: `of` on a class or constant object named after the algorithm, such as {@link @kobayami/graphity-core!TopOrder.of TopOrder.of} and {@link @kobayami/graphity-core!Dominators.of Dominators.of}; the functions of {@link @kobayami/graphity-core!Components Components} for the components; and those of {@link @kobayami/graphity-core!Graphs Graphs} for the rest, such as {@link @kobayami/graphity-core!Graphs.findCycle Graphs.findCycle}.

A `Graph` holds the out-nodes of every node. {@link @kobayami/graphity-core!BiAdjacentGraph.of BiAdjacentGraph.of} adds the in-nodes. The algorithms that need them, such as {@link @kobayami/graphity-core!Dominators Dominators} and {@link @kobayami/graphity-core!Components.biconnectivityOf Components.biconnectivityOf}, take a `BiAdjacentGraph`: build it once and pass it to all of them.

The following example builds a graph of the dependencies between the packages of a small TypeScript program. These dependencies contain a cycle:

<!-- example: gettingStarted.ts#firstResult -->
```ts
// The packages are the nodes 0..7, and uses[p] lists the packages that package p uses.
const names = ["app", "cli", "ui", "service", "model", "storage", "json", "util"];
const uses = [[1, 2, 3], [7], [3, 4, 7], [4, 5], [5], [4, 6, 7], [7], []];

// Build the graph: an edge p -> q for every package q that p uses.
const builder = new GraphBuilder();
builder.addNodes(uses.length);
for (let pkg = 0; pkg < uses.length; pkg++) {
  builder.addOutEdges(pkg, uses[pkg]);
}
const dependencies = builder.build();

// Find a cycle.
const cycle = Graphs.findCycle(dependencies);
// cycle: [4, 5] - model and storage use each other
```

## Where to find what

| Question | Entry points |
|---|---|
| How do I build a graph? | {@link @kobayami/graphity-core!GraphBuilder GraphBuilder} from edges in any order, or {@link @kobayami/graphity-core!Graph.of Graph.of} from the two arrays of a CSR layout. |
| Which parts belong together? | {@link @kobayami/graphity-core!Components Components}: strongly and weakly connected components, and the connected components of the graph read as undirected; bridges, articulation points and biconnected components; strong bridges and strong articulation points. |
| In which order, and where are the cycles? | A topological order ({@link @kobayami/graphity-core!TopOrder TopOrder}), and one with a level per node ({@link @kobayami/graphity-core!TopOrderAndLevels TopOrderAndLevels}); whether a graph has a cycle, and one of its cycles ({@link @kobayami/graphity-core!Graphs.isDag Graphs.isDag}, {@link @kobayami/graphity-core!Graphs.findCycle Graphs.findCycle}); the tree, back, forward and cross edges of a depth-first search ({@link @kobayami/graphity-core!EdgeTypes EdgeTypes}, {@link @kobayami/graphity-core!BackEdges BackEdges}). |
| What is reachable, and how far? | The nodes reachable from one or several nodes ({@link @kobayami/graphity-core!Graphs.reachableFrom Graphs.reachableFrom}); distances and shortest paths by breadth-first search ({@link @kobayami/graphity-core!BfsDistances BfsDistances}); transitive closure and, for a DAG (directed acyclic graph), transitive reduction ({@link @kobayami/graphity-core!Graphs.transitiveClosure Graphs.transitiveClosure}, {@link @kobayami/graphity-core!Graphs.transitiveReduction Graphs.transitiveReduction}). |
| Who is the ancestor of whom in a tree? | Parent, depth and LCA (lowest common ancestor) in a forest ({@link @kobayami/graphity-core!Ancestry Ancestry}); the ancestor test in O(1) and the nodes of each subtree ({@link @kobayami/graphity-core!PreorderAncestry PreorderAncestry}); shape checks such as {@link @kobayami/graphity-core!Graphs.isTree Graphs.isTree}, {@link @kobayami/graphity-core!Graphs.isPath Graphs.isPath} and {@link @kobayami/graphity-core!Graphs.isBipartite Graphs.isBipartite}. |
| Which node dominates which? | Dominators from one or several entries, and post-dominators on the transposed graph ({@link @kobayami/graphity-core!Dominators Dominators}); the dominator tree ({@link @kobayami/graphity-core!Graphs.dominatorTree Graphs.dominatorTree}). |
| Where are the loops, where do phi-nodes go, what controls what? (`@kobayami/graphity-controlflow`) | The loop nesting forest, irreducible loops included ({@link @kobayami/graphity-controlflow!Loops Loops}); the blocks where SSA (static single assignment) form places phi-nodes ({@link @kobayami/graphity-controlflow!IteratedDominanceFrontier IteratedDominanceFrontier}); dominance frontiers and control dependence ({@link @kobayami/graphity-controlflow!ControlFlow ControlFlow}). |
| How do I condense, filter or renumber a graph? | The condensed graph of a partition of your choosing ({@link @kobayami/graphity-core!NodePartition.condense NodePartition.condense}); subgraphs and renumbered graphs ({@link @kobayami/graphity-core!Graphs.remapped Graphs.remapped} with a {@link @kobayami/graphity-core!NodeMapping NodeMapping}); the transposed graph, without copying ({@link @kobayami/graphity-core!BiAdjacentGraph.transposed BiAdjacentGraph.transposed}). |
| How does my data follow a transformation? | {@link @kobayami/graphity-core!NodeMapping NodeMapping} for data on nodes; {@link @kobayami/graphity-core!Graphs.edgeMapping Graphs.edgeMapping}, {@link @kobayami/graphity-core!Graphs.transposedEdgeMapping Graphs.transposedEdgeMapping} and {@link @kobayami/graphity-core!Graphs.edgePartition Graphs.edgePartition} for data on edges. |
| How do I store, load and compare graphs? | {@link @kobayami/graphity-core!Graph.writeTo Graph.writeTo} and {@link @kobayami/graphity-core!Graph.readFrom Graph.readFrom}, as the two arrays of the CSR layout; a 64-bit hash of the nodes and edges ({@link @kobayami/graphity-core!Graphs.topologyHash Graphs.topologyHash}); the edges added and removed between two versions of a graph ({@link @kobayami/graphity-core!Graphs.diff Graphs.diff}). |
| How do I look at a graph? (`@kobayami/graphity-dot`, `@kobayami/graphity-mermaid`) | {@link @kobayami/graphity-dot!DotWriter DotWriter} and {@link @kobayami/graphity-mermaid!MermaidWriter MermaidWriter}, with labels, attributes, shapes and clusters from your own arrays; {@link @kobayami/graphity-core!Graphs.adjacencyListOf Graphs.adjacencyListOf} for a whole graph as text. |
| How do I write a search of my own? | The base classes of depth-first and breadth-first searches, without recursion ({@link @kobayami/graphity-core!DfsTraverser DfsTraverser}, {@link @kobayami/graphity-core!DfsEdgeTraverser DfsEdgeTraverser}, {@link @kobayami/graphity-core!FrontierTraverser FrontierTraverser}); {@link @kobayami/graphity-core!Csr Csr} hands the arrays of a graph to loops of your own. |

The documentation of each package, listed below, groups its entry points by topic, and the documentation of each type names the algorithm it uses.

## Contracts

Every method states its contract: what it returns and throws, whether a result is a view or a copy, in which order the results come where that matters, and its cost in time and memory. Three rules hold across the whole API:

- No parameter, return value or element in the API is `null` unless its type includes `null`.
- Graphs, mappings, partitions and the results of the algorithms are immutable. The builder, the traversers and the writers are mutable.
- A node ID, an edge index or any other ID or position outside its range throws a `RangeError`; any other invalid argument throws an `Error`.

## Further references

- **Guide:** [kaufco.github.io/graphity-doc](https://kaufco.github.io/graphity-doc/?lang=ts) - one page per problem, from building a graph to control-flow analysis: the problem, the graph before and after, and tested code, with an index by API and a glossary.
- **README:** [kaufco/graphity-ts](https://github.com/kaufco/graphity-ts#readme) - how to add Graphity to a project, and a first complete program.
- **Repository:** [kaufco/graphity-ts](https://github.com/kaufco/graphity-ts) - the source code and the changelog. It follows [Graphity for Java](https://github.com/kaufco/graphity), where development happens.

## Packages

| Package | What it adds |
|---|---|
| {@link @kobayami/graphity-core! @kobayami/graphity-core} | The graph, the builder, and every algorithm that applies to any directed graph, dominators included |
| {@link @kobayami/graphity-controlflow! @kobayami/graphity-controlflow} | The analyses of control flow: loops, dominance frontiers, control dependence and the placement of phi-nodes |
| {@link @kobayami/graphity-dot! @kobayami/graphity-dot} | A writer for DOT (the language of Graphviz) |
| {@link @kobayami/graphity-mermaid! @kobayami/graphity-mermaid} | A writer for Mermaid flowcharts, which render in Markdown |
| {@link @kobayami/graphity! @kobayami/graphity} | All of the above |
