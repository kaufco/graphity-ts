/**
 * The int hash set behind IteratedDominanceFrontier.frontierOf, which stands in for fastutil's
 * IntOpenHashSet (Java has no test of its own for it): set semantics, growth, and fastutil's hash,
 * sizes and limit, pinned to the values fastutil 8.5.17 computes.
 */

import { describe, expect, it } from "vitest";
import { arraySize, IntOpenHashSet, mix } from "../src/intOpenHashSet.js";
import { expectArgumentError, JavaRandom } from "./testutils/core.js";

describe("IntOpenHashSet", () => {
  it("adds each key once, 0 and negative keys included", () => {
    const set = new IntOpenHashSet(4);
    for (const k of [0, 1, -1, 7, 0x7fffffff, -0x80000000]) {
      expect(set.contains(k)).toBe(false);
      expect(set.add(k)).toBe(true);
      expect(set.add(k)).toBe(false);
      expect(set.contains(k)).toBe(true);
    }
    expect(set.size).toBe(6);
    expect(set.contains(2)).toBe(false);
  });

  it("grows and agrees with a Set on random keys", () => {
    const set = new IntOpenHashSet();
    const reference = new Set<number>();
    const rnd = new JavaRandom(42);
    for (let i = 0; i < 50_000; i++) {
      const k = rnd.nextInt(30_000) - 10_000;
      expect(set.add(k)).toBe(!reference.has(k));
      reference.add(k);
    }
    expect(set.size).toBe(reference.size);
    for (let k = -10_001; k <= 20_001; k++) {
      if (set.contains(k) !== reference.has(k)) expect(set.contains(k), `contains(${k})`).toBe(reference.has(k));
    }
  });

  it("hashes and sizes its table as fastutil does", () => {
    expect(mix(-7)).toBe(-1_401_223_286);
    expect(mix(123_456_789)).toBe(-1_161_192_476);
    expect(arraySize(0)).toBe(2);
    expect(arraySize(4)).toBe(8);
    expect(arraySize(16)).toBe(32);
    expect(arraySize(1024)).toBe(2048);
    expect(arraySize(805_306_368)).toBe(2 ** 30);
  });

  it("refuses a table beyond 2^30 slots with fastutil's message", () => {
    // IteratedDominanceFrontier.frontierOf documents this as "about 8 x 10^8" explored nodes.
    expectArgumentError(
      () => arraySize(805_306_369),
      /^Too large \(805306369 expected elements with load factor 0\.75\)$/,
    );
    expectArgumentError(() => new IntOpenHashSet(805_306_369));
  });
});
