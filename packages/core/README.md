# @kobayami/graphity-core

This package is the core of Graphity: the graph, the builder, and every algorithm that applies to any directed graph. The algorithms compute, for example, strongly and weakly connected components, bridges and articulation points, topological order and levels, cycles and edge classification, breadth-first distances and reachability, lowest common ancestors, dominators and condensed graphs. The graph is compact and immutable, in a compressed sparse row (CSR) layout of 4 bytes per node and per edge.

It is a package of [Graphity for TypeScript](https://github.com/kaufco/graphity-ts#readme), which is the TypeScript implementation of the Java library [Graphity](https://github.com/kaufco/graphity). Its counterpart in Java is the module `graphity-core`. The [README](https://github.com/kaufco/graphity-ts#readme) of the repository shows how to use it and how its API relates to Java's.

```bash
npm install @kobayami/graphity-core
```

Licensed under the Apache License 2.0; see the files `LICENSE` and `NOTICE` in the package.
