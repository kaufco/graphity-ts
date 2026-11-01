# Changelog

All notable changes to Graphity for TypeScript are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Graphity for TypeScript adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Its
version is that of the Java library whose API it implements: the same version number means the
same features as in [Graphity](https://github.com/kaufco/graphity) for Java.

---

## [3.0.0] — 2026-11-01

This is the first release of Graphity in TypeScript, for Node.js and the browser. It implements
the API of Graphity 3.0.0 for Java: the same packages, types and methods, the same algorithms and
data layouts, the same limits, errors and complexity, and the same results wherever Java fixes
them. Java fixes, for example, the IDs of strongly connected components, orders, loop IDs, hashes,
the text of the writers and the bytes of the binary format. The packages are
ES modules with TypeScript declarations and have no runtime dependencies. They require Node.js 22
or newer, or a browser that supports ES2022.

### Added

- `@kobayami/graphity-core` - the graph, the builder, and every algorithm that applies to any
  directed graph, dominators included
- `@kobayami/graphity-controlflow` - the analyses of control flow: loops, dominance frontiers,
  control dependence and the placement of phi-nodes
- `@kobayami/graphity-dot` - a writer for DOT (the language of Graphviz)
- `@kobayami/graphity-mermaid` - a writer for Mermaid flowcharts, which render in Markdown
- `@kobayami/graphity` - everything the four packages export, re-exported from one package; the
  counterpart of the Java artifact `graphity`
