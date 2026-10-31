import { describe, expect, it } from "vitest";
import { BitSet } from "../src/index.js";
import { expectArgumentError, expectIndexError } from "./testutils/assertions.js";

/** The port's own subset of `java.util.BitSet`, which Java takes from the JDK. */
describe("BitSetTest", () => {
  it("sets, reads and clears bits, growing past its capacity", () => {
    const bits = new BitSet(8);
    bits.set(3);
    bits.set(100);
    expect(bits.get(3)).toBe(true);
    expect(bits.get(4)).toBe(false);
    expect(bits.get(100)).toBe(true);
    expect(bits.get(10_000)).toBe(false);
    bits.clear(3);
    bits.clear(10_000);
    expect(bits.get(3)).toBe(false);
    expect(bits.cardinality()).toBe(1);
    expect(bits.length()).toBe(101);
  });

  it("isEmpty is true until a bit is set and again once all are cleared", () => {
    const bits = new BitSet();
    expect(bits.isEmpty()).toBe(true);
    bits.set(70);
    expect(bits.isEmpty()).toBe(false);
    bits.clear(70);
    expect(bits.isEmpty()).toBe(true);
    expect(bits.length()).toBe(0);
  });

  it("nextSetBit and nextClearBit scan as Java's", () => {
    const bits = new BitSet(64);
    for (const i of [0, 1, 2, 31, 32, 33, 63]) bits.set(i);
    expect(bits.nextSetBit(3)).toBe(31);
    expect(bits.nextSetBit(34)).toBe(63);
    expect(bits.nextSetBit(64)).toBe(-1);
    expect(bits.nextClearBit(0)).toBe(3);
    expect(bits.nextClearBit(31)).toBe(34);
    expect(bits.nextClearBit(63)).toBe(64);
    expect(bits.nextClearBit(1000)).toBe(1000);
  });

  it("rejects a negative bit index with the messages of java.util.BitSet", () => {
    const bits = new BitSet();
    expectIndexError(() => bits.get(-1), /^bitIndex < 0: -1$/);
    expectIndexError(() => bits.set(-1), /^bitIndex < 0: -1$/);
    expectIndexError(() => bits.clear(-1), /^bitIndex < 0: -1$/);
    expectIndexError(() => bits.nextSetBit(-1), /^fromIndex < 0: -1$/);
    expectIndexError(() => bits.nextClearBit(-1), /^fromIndex < 0: -1$/);
  });

  it("rejects a bit index that is not an int", () => {
    const bits = new BitSet();
    for (const index of [1.5, Number.NaN, 2 ** 31]) {
      expectIndexError(() => bits.get(index), /^bitIndex is not an int: /);
      expectIndexError(() => bits.set(index), /^bitIndex is not an int: /);
      expectIndexError(() => bits.clear(index), /^bitIndex is not an int: /);
      expectIndexError(() => bits.nextSetBit(index), /^fromIndex is not an int: /);
      expectIndexError(() => bits.nextClearBit(index), /^fromIndex is not an int: /);
    }
  });

  it("rejects a negative size as Java's NegativeArraySizeException, and one that is not an int", () => {
    expectArgumentError(() => new BitSet(-1), /^nbits < 0: -1$/);
    for (const nbits of [1.5, Number.NaN, 2 ** 32])
      expectArgumentError(() => new BitSet(nbits), /^nbits is not an int: /);
  });
});
