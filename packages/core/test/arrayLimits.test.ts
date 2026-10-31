import { describe, expect, it } from "vitest";
import { ArrayLimits } from "../src/arrayLimits.js";
import { DfsPreorder } from "../src/dfsPreorder.js";
import { expectArgumentError } from "./testutils/assertions.js";

/**
 * The limits derived from the largest array, against the thresholds the documentation states. A
 * graph at a limit takes gigabytes, so the checks themselves are exercised on small numbers.
 */
describe("ArrayLimitsTest", () => {
  it("the largest array is the JDK soft maximum", () => {
    expect(ArrayLimits.MAX_ARRAY_LENGTH).toBe(0x7fffffff - 8);
  });

  it("a graph holds one node fewer than the largest array", () => {
    // GraphBuilder, NodePartition.of and the header of Graph.readFrom: nodeCount + 1 offsets.
    const limit = ArrayLimits.MAX_NODE_COUNT;
    expect(limit).toBe(0x7fffffff - 9);
    expect(limit + 1).toBe(ArrayLimits.MAX_ARRAY_LENGTH);
  });

  it("two ints per node allow 2^30 - 5 nodes", () => {
    // sccsOf, isBipartite and the depth of a depth-first path.
    const limit = ArrayLimits.MAX_NODE_COUNT_TWO_INTS;
    expect(limit).toBe(2 ** 30 - 5);
    expect(2 * limit).toBeLessThanOrEqual(ArrayLimits.MAX_ARRAY_LENGTH);
    expect(2 * (limit + 1)).toBeGreaterThan(ArrayLimits.MAX_ARRAY_LENGTH);
  });

  it("the control-flow analyses allow one node less for the virtual root", () => {
    // Dominators, Loops and strongConnectivityOf.
    const limit = DfsPreorder.MAX_NODE_COUNT;
    expect(limit).toBe(2 ** 30 - 6);
    expect(2 * (limit + 1)).toBeLessThanOrEqual(ArrayLimits.MAX_ARRAY_LENGTH);
    expect(2 * (limit + 2)).toBeGreaterThan(ArrayLimits.MAX_ARRAY_LENGTH);
  });

  it("checkNodeCount rejects only counts above the limit", () => {
    expect(() => ArrayLimits.checkNodeCount(10, 10, "Some analysis")).not.toThrow();
    expectArgumentError(
      () => ArrayLimits.checkNodeCount(11, 10, "Some analysis"),
      /^Some analysis keeps two ints per node in one array, counting a virtual root if it adds one, and so requires nodeCount <= 10, but was 11$/,
    );
  });
});
