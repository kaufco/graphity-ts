# Graphity for TypeScript

[![npm](https://img.shields.io/npm/v/@kobayami/graphity)](https://www.npmjs.com/package/@kobayami/graphity)
[![API documentation](https://img.shields.io/badge/API%20documentation-online-blue)](https://kaufco.github.io/graphity-ts/)
[![Guide](https://img.shields.io/badge/Guide-online-blue)](https://kaufco.github.io/graphity-doc/?lang=ts)
[![CI](https://github.com/kaufco/graphity-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/kaufco/graphity-ts/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-blue)](https://nodejs.org/)

**This repository follows [Graphity for Java](https://github.com/kaufco/graphity).** Development happens there: see [its issues](https://github.com/kaufco/graphity/issues) and [its changelog](https://github.com/kaufco/graphity/blob/main/CHANGELOG.md) for what is new and what comes next.

This is the TypeScript implementation of Graphity, for Node.js and the browser. It has no runtime dependencies and comes as ES modules with TypeScript declarations.

Graphity is a graph library which keeps graphs in a compact, immutable form and provides algorithms on top of it, such as strongly and weakly connected components, bridges and articulation points, topological order and levels, cycle detection and edge classification, breadth-first distances and reachability, lowest common ancestors, dominators, loop nesting and condensed graphs. The core stays lean: the analyses of control flow and the writers for DOT (the language of Graphviz) and for Mermaid flowcharts are packages of their own, which you add when you need them.

It is built for code analysis and compiler pipelines, with graphs such as abstract syntax trees, control-flow and data-flow graphs, and dependency graphs. More generally, it is built for anywhere you build a graph from your domain model, run analyses on it, and use the results. Every algorithm returns a typed, immutable result with follow-up queries, and runs without recursion, so deep graphs do not overflow the call stack.

Data on nodes and edges stays in your own arrays, indexed by node ID or edge index, and every transformation tells you how to carry them along. The graph itself stores only structure: 4 bytes per node and per edge, in a compressed sparse row (CSR) layout, which is where speed and footprint come from.

**The same library exists for Java, Rust and C#**, with the same API and the same binary format: a graph written in TypeScript can be read in any of them. See [One library, four languages](#one-library-four-languages).

## Contents

1. [Installation](#installation)
2. [Getting started](#getting-started)
3. [Where to find what](#where-to-find-what)
4. [Data on nodes and edges](#data-on-nodes-and-edges)
5. [One library, four languages](#one-library-four-languages)
6. [Documentation](#documentation)
7. [Building and testing from source](#building-and-testing-from-source)
8. [License](#license)

## Installation

`@kobayami/graphity` brings in every package of Graphity:

```bash
npm install @kobayami/graphity
```

To take only what you need, depend on the packages themselves instead of `@kobayami/graphity`, the same way and at the same version:

| Package | What it adds |
|---|---|
| `@kobayami/graphity-core` | The graph, the builder, and every algorithm that applies to any directed graph, dominators included |
| `@kobayami/graphity-controlflow` | The analyses of control flow: loops, dominance frontiers, control dependence and the placement of phi-nodes |
| `@kobayami/graphity-dot` | A writer for DOT (the language of Graphviz) |
| `@kobayami/graphity-mermaid` | A writer for Mermaid flowcharts, which render in Markdown |
| `@kobayami/graphity` | All of the above |

Graphity requires Node.js 22 or newer, or a browser that supports ES2022. The packages are ES modules only, without a CommonJS build, and their TypeScript declarations compile without `skipLibCheck`. No parameter, return value or element in the API is `null` unless its type includes `null`.

## Getting started

A `Graph` holds nothing but its structure: its nodes are the `number` IDs `0..nodeCount-1`, its edges are numbered by edge index, and it takes 4 bytes per node and per edge. Names, weights and any other data on nodes and edges stay in arrays you own, indexed by node ID or edge index.

The algorithms are types of their own: each takes a graph and returns a typed result with follow-up queries. Graphs and results are immutable, and no algorithm recurses, so a deep graph does not overflow the call stack.

The following example is a complete module, ready to run. It builds a graph of the dependencies between the packages of a small TypeScript program. These dependencies contain a cycle:

<!-- example: gettingStarted.ts#program -->
```ts
import { GraphBuilder, Graphs } from "@kobayami/graphity";

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

// Print the cycle with the names of its packages.
console.log(Array.from(cycle, (pkg) => names[pkg]));
// [ 'model', 'storage' ]
```

The next two examples continue it. Every further question is a call on the same graph. `Components.sccsOf` puts `model` and `storage` into one SCC (strongly connected component) and orders the SCCs so that each package comes after the packages it uses, which can serve as a build order:

<!-- example: connectivity.ts#sccsOf -->
```ts
import { Components } from "@kobayami/graphity";

// The SCCs in reverse topological order, each as the names of its packages.
const sccs = Components.sccsOf(dependencies);
const buildOrder: string[][] = [];
for (let scc = 0; scc < sccs.sccCount; scc++) {
  buildOrder.push(Array.from(sccs.nodesOf(scc), (node) => names[node]));
}
// buildOrder: [[util], [cli], [json], [model, storage], [service], [ui], [app]]
```

Which packages does a change to `model` affect? `BiAdjacentGraph.of` adds the in-nodes of every node, so that a search can follow the edges against their direction:

<!-- example: transposing.ts#transposed -->
```ts
import { BiAdjacentGraph } from "@kobayami/graphity";

const model = 4;
const usedBy = BiAdjacentGraph.of(dependencies).transposed();
const affected = Graphs.reachableFrom(usedBy, model);
// affected: [0, 2, 3, 4, 5] - app, ui, service, model and storage
```

The [guide](https://kaufco.github.io/graphity-doc/?lang=ts) goes on from here, one problem per page, on topics such as building graphs, cycles and orders, reachability, trees, dominance and control flow, transforming graphs with their data, and searches of your own.

## Where to find what

The guide [Solving Graph Problems with Graphity](https://kaufco.github.io/graphity-doc/?lang=ts) shows how to solve graph problems with Graphity: one page per problem, with pictures of the graph, tested code and its results. It shows every example in Java, Rust, TypeScript and C#.

These are the questions that Graphity answers, with the algorithms and the entry points that answer them:

- **How do I build a graph?** `GraphBuilder` from edges in any order, or `Graph.of` from the two arrays of a CSR layout.
- **Which parts belong together?** Strongly connected components (Tarjan's algorithm), weakly connected components, and the connected components of the graph read as undirected; bridges, articulation points and biconnected components (Hopcroft and Tarjan); strong bridges and strong articulation points (Italiano, Laura and Santaroni). All in `Components`.
- **In which order, and where are the cycles?** A topological order (topological sort) by depth-first search (`TopOrder`), and one with a level per node by Kahn's algorithm (`TopOrderAndLevels`); whether a graph has a cycle, and one of its cycles (`Graphs.isDag`, `Graphs.findCycle`); the tree, back, forward and cross edges of a depth-first search (`EdgeTypes`, `BackEdges`).
- **What is reachable, and how far?** The nodes reachable from one or several nodes (`Graphs.reachableFrom`); distances and shortest paths by breadth-first search (`BfsDistances`); transitive closure and, for a DAG (directed acyclic graph), transitive reduction, both in `Graphs`.
- **Who is the ancestor of whom in a tree?** Parent, depth and LCA (lowest common ancestor) in a forest (`Ancestry`); the ancestor test in O(1) and the nodes of each subtree (`PreorderAncestry`); shape checks such as `Graphs.isTree`, `Graphs.isPath` and `Graphs.isBipartite`.
- **Which node dominates which?** Dominators from one or several entries, and post-dominators on the transposed graph (`Dominators`, by the algorithm of Lengauer and Tarjan); the dominator tree (`Graphs.dominatorTree`).
- **Where are the loops, where do phi-nodes go, what controls what?** (`@kobayami/graphity-controlflow`) The loop nesting forest, irreducible loops included (`Loops`, by Havlak's algorithm); the blocks where SSA (static single assignment) form places phi-nodes (`IteratedDominanceFrontier`, by the algorithm of Sreedhar and Gao); dominance frontiers and control dependence (`ControlFlow`).
- **How do I condense, filter or renumber a graph?** The condensed graph of a partition of your choosing (`NodePartition.condense`); subgraphs and renumbered graphs (`Graphs.remapped` with a `NodeMapping`); the transposed graph, without copying (`BiAdjacentGraph.transposed`).
- **How does my data follow a transformation?** `NodeMapping` for data on nodes; `Graphs.edgeMapping`, `Graphs.transposedEdgeMapping` and `Graphs.edgePartition` for data on edges.
- **How do I store, load and compare graphs?** `Graph.writeTo` and `Graph.readFrom`, as the two arrays of the CSR layout in little-endian byte order; a 64-bit hash of the nodes and edges (`Graphs.topologyHash`); the edges added and removed between two versions of a graph (`Graphs.diff`).
- **How do I look at a graph?** (`@kobayami/graphity-dot`, `@kobayami/graphity-mermaid`) `DotWriter` and `MermaidWriter`, with labels, attributes, shapes and clusters from your own arrays; `Graphs.adjacencyListOf` for a whole graph as text.
- **How do I write a search of my own?** The base classes of depth-first and breadth-first searches, without recursion (`DfsTraverser`, `DfsEdgeTraverser`, `FrontierTraverser`); `Csr` hands the arrays of a graph to loops of your own.

The [API documentation](https://kaufco.github.io/graphity-ts/) opens on the same questions; the documentation of each package lists its entry points by topic, and every method states its contract: what it returns and throws, and its cost in time and memory. The guide has an [index of all entry points](https://kaufco.github.io/graphity-doc/api-index/?lang=ts), each with the problems that use it.

## Data on nodes and edges

Graphity keeps no data on nodes or edges. You keep it in arrays of your own, one array per attribute. An array is indexed by node ID `0..nodeCount-1` or by edge index `0..edgeCount-1` - like a column of a table whose rows are the nodes or the edges. An array can hold primitives or objects, and a graph can have as many arrays as you need.

Here, `calls` holds the calls between the methods of the small program, and `callSites` the places in the source where one method calls another. The nodes carry an object per method, and the edges the number of call sites:

<!-- example: dataOnNodesAndEdges.ts#columns -->
```ts
interface Method { readonly name: string; readonly pkg: string }
const methods: Method[] = [                         // methods[node]
  { name: "main", pkg: "app" }, { name: "parseArgs", pkg: "cli" },
  { name: "run", pkg: "app" }, { name: "load", pkg: "service" },
  { name: "save", pkg: "service" }, { name: "show", pkg: "ui" },
  { name: "parse", pkg: "model" }, { name: "format", pkg: "model" },
  { name: "read", pkg: "storage" }, { name: "write", pkg: "storage" }];

const siteCount = new Int32Array(calls.edgeCount);  // siteCount[edgeIndex]
for (const site of callSites) {
  siteCount[calls.edgeIndexOf(site.caller, site.callee)]++;
}
// siteCount: 2 for run -> show and for parse -> parse, 1 for every other call
```

A transformation that renumbers nodes or merges them comes with the mapping or partition that carries the arrays along, each array on its own: you take the columns you still need and leave the others behind. Here, the subgraph of the methods that `load` reaches takes both arrays:

<!-- example: dataOnNodesAndEdges.ts#carryAlong -->
```ts
import { NodeMapping } from "@kobayami/graphity";

const newToOld = NodeMapping.forSubgraph(Graphs.reachableFrom(calls, load));
const loading = Graphs.remapped(calls, newToOld);
// loading: load -> parse, load -> read, parse -> parse

const loadingMethods = new Array<Method>(loading.nodeCount);
newToOld.gather(methods, loadingMethods);
// loadingMethods: load, parse, read

const loadingSiteCount = Graphs.edgeMapping(loading, calls, newToOld).gather(
  siteCount,
);
// loadingSiteCount: 1 for load -> parse and for load -> read, 2 for parse -> parse
```

A renumbering in depth-first order (`NodeMapping.reindex`) and the transposed graph (`Graphs.transposedEdgeMapping`) work the same way. A condensed graph merges edges, and `EdgePartition.reduce` aggregates their data, such as the call sites behind each call between two packages. The [guide](https://kaufco.github.io/graphity-doc/transforming/reduce-data/?lang=ts) shows how.

## One library, four languages

Graphity exists for [Java](https://github.com/kaufco/graphity), [Rust](https://github.com/kaufco/graphity-rust), [TypeScript](https://github.com/kaufco/graphity-ts) and [C#](https://github.com/kaufco/graphity-csharp). This matters where a system spans several languages, for example with a producer in Java and a consumer in TypeScript:

- **The same API.** Every public type and method of the Java library has its counterpart in the other languages, in the names of each language. So there is nothing new to learn, and neither side lacks a feature that the other has.
- **The same data.** All implementations read and write the same binary format, so a graph written in Java can be read in TypeScript, and the other way round. A graph also has the same hash in every language.
- **The same results.** Orders, IDs and the text of the writers are the same, bit for bit, wherever the API fixes them.

| Language | Repository | Dependency |
|---|---|---|
| Java | [kaufco/graphity](https://github.com/kaufco/graphity) | `com.kobayami:graphity` |
| Rust | [kaufco/graphity-rust](https://github.com/kaufco/graphity-rust) | `graphity-all` |
| TypeScript | [kaufco/graphity-ts](https://github.com/kaufco/graphity-ts) | `@kobayami/graphity` |
| C# | [kaufco/graphity-csharp](https://github.com/kaufco/graphity-csharp) | `Graphity.All` |

Each of these dependencies brings the whole library. The README of each repository lists the single modules.

## Documentation

This README is the overview; the guide goes into depth, and the API documentation is the contract.

- **Guide:** [kaufco.github.io/graphity-doc](https://kaufco.github.io/graphity-doc/?lang=ts) - one page per problem, from building a graph to control-flow analysis: the problem, the graph before and after, and tested code, with an index by API and a glossary.
- **API reference:** [kaufco.github.io/graphity-ts](https://kaufco.github.io/graphity-ts/) - the contract of every class and method.
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)

## Building and testing from source

To use Graphity, take the published packages (see [Installation](#installation)). The instructions below are for contributors who want to fork or extend the library.

From the repository root:

```bash
npm ci
npm run build
npm test
```

Builds all packages and runs all tests. Building needs Node.js 22.12 or newer.

## License

Graphity is licensed under the [Apache License, Version 2.0](LICENSE).

Copyright 2025–2026 Marco Kaufmann.

Forks and modifications are welcome under the terms of the license. The name "Graphity" refers to the original project at https://github.com/kaufco/graphity; please pick a different name for any redistributed version. See [`NOTICE`](NOTICE).
