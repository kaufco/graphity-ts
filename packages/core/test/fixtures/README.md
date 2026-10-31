# Conformance fixtures

This directory holds graphs and the results that the Java implementation of Graphity 3.0.0
computes on them. `conformance.test.ts` reads them. The port never computes these files itself:
they come from Java, so that a test failure means a result that differs from Java's.

There are 28 cases: 14 shapes with 200 and 1000 nodes each. The shapes are paths, trees, sparse and
dense random graphs, chains of cliques, and sparse and dense random DAGs (directed acyclic graphs),
each also with shuffled node IDs. Each case is named `<shape>-<n>`. These are the files:

| File | Content |
|---|---|
| `<case>.gphy` | the graph, as `Graph.writeTo` writes it |
| `<case>.scc.i32`, `<case>.wcc.i32` | the SCC (strongly connected component) and the WCC (weakly connected component) of every node |
| `<case>.condensed.gphy` | the condensation by SCCs |
| `<case>.edgetypes.u8` | the depth-first edge type of every edge: 0 tree, 1 back, 2 forward, 3 cross |
| `<case>.reindex.i32` | `NodeMapping.reindex`, new ID by old ID |
| `<case>.dfspre.i32`, `<case>.dfspost.i32` | the nodes in the order of the hooks of a `DfsTraverser` run |
| `<case>.toporder.i32`, `.kahnorder.i32`, `.levels.i32` | DAGs only: `TopOrder.of`, the order and the level of every node of `TopOrderAndLevels.of` |
| `cases.tsv` | per case its name, shape, node and edge count, whether it is a DAG, and its numbers of SCCs, WCCs and levels |

A `.gphy` file is the format of `Graph.writeTo`: `nodeCount`, `edgeCount`, then
`outAdjacencyStart` (nodeCount + 1 values) and `outAdjacency` (edgeCount values), all signed
32-bit integers in little-endian byte order. An `.i32` file is such an array without a header, and
a `.u8` file holds one byte per value.
