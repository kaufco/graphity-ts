/**
 * Analyses of control flow: loops, dominance frontiers, control dependence and the placement of
 * phi-nodes.
 *
 * This package is the counterpart of the Java module `graphity-controlflow`, released with
 * `@kobayami/graphity-core` at the same version. Its analyses work on a control-flow graph, with
 * the basic blocks of a method as nodes and an edge wherever control can pass from one block to
 * another:
 *
 * - {@link Loops} - the loop nesting forest: every loop with its header, its body and its entries,
 *   and how the loops nest, irreducible loops included.
 * - {@link IteratedDominanceFrontier} - the blocks where SSA (static single assignment) form places
 *   the phi-nodes of a variable.
 * - {@link ControlFlow} - the dominance frontiers as a graph, and from them control dependence:
 *   which block decides whether another one runs.
 *
 * The analyses follow edges against their direction, so they take a `BiAdjacentGraph`, or the
 * `Dominators` computed on one; build it once and pass it to all of them. Here, the loop of a
 * method `load` around its block `then`, from its control flow `cfg` and its entry block `entry`:
 *
 * <!-- example: analyzingControlFlow.ts#loops -->
 * ```ts
 * // The basic blocks of load are the nodes 0..5 of cfg: entry, header, body, then,
 * // next, exit.
 *
 * // Find the loops of load, from its entry block.
 * const loops = Loops.of(BiAdjacentGraph.of(cfg), entry);
 *
 * // Find the loop around the block then, with its header and its body.
 * const loop = loops.innermostLoopOf(then);   // 0 - the for loop, the only loop
 * const header = loops.headerOf(loop);        // 1 - the block header
 * // [1, 2, 3, 4] - header, body, then and next
 * const blocks = loops.bodyOf(loop);
 * ```
 *
 * The package uses only the public API of the core. Errors follow the core: a `RangeError` where
 * Java throws an `IndexOutOfBoundsException`, a plain `Error` where it throws an
 * `IllegalArgumentException`.
 *
 * @packageDocumentation
 */

export { ControlFlow } from "./controlFlow.js";
export { IteratedDominanceFrontier } from "./iteratedDominanceFrontier.js";
export { Loops } from "./loops.js";
