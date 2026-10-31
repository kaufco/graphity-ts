/**
 * The test utilities of `@kobayami/graphity-core` that the control-flow tests share, as Java's
 * `graphity-controlflow` tests use the `testutils` of `graphity-core`: imported from the core's
 * test directory, unchanged, in one place.
 *
 * They import the core from its sources (`../../src/index.js`). Vitest resolves `@kobayami/graphity-core`
 * to the same file (`vitest.config.ts`), and `tsconfig.test.json` maps it there for the type check,
 * so that the tests, these utilities and the package under test all see one `Graph` class.
 */

export { expectArgumentError, expectIndexError, ints } from "../../../core/test/testutils/assertions.js";
export { ControlFlowGraphs } from "../../../core/test/testutils/controlFlowGraphs.js";
export { JavaRandom } from "../../../core/test/testutils/javaRandom.js";
export { NaiveDominators } from "../../../core/test/testutils/naive.js";
export { RandomGraphs } from "../../../core/test/testutils/randomGraphs.js";
export { TestGraphs } from "../../../core/test/testutils/testGraphs.js";
