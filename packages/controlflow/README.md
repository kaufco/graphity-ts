# @kobayami/graphity-controlflow

This package holds the analyses of control flow of Graphity, on the control-flow graph of a method: the loop nesting forest with irreducible loops (Havlak), dominance frontiers and control dependence, and the iterated dominance frontiers where SSA (static single assignment) form places phi-nodes (Sreedhar and Gao).

It is a package of [Graphity for TypeScript](https://github.com/kaufco/graphity-ts#readme), which is the TypeScript implementation of the Java library [Graphity](https://github.com/kaufco/graphity). Its counterpart in Java is the module `graphity-controlflow`. The [README](https://github.com/kaufco/graphity-ts#readme) of the repository shows how to use it and how its API relates to Java's.

```bash
npm install @kobayami/graphity-controlflow
```

Licensed under the Apache License 2.0; see the files `LICENSE` and `NOTICE` in the package.
