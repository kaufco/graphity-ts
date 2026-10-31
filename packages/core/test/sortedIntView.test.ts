import { describe, expect, it } from "vitest";
import { IntLists, SortedIntView } from "../src/index.js";
import { containsInRange, indexOfInRange } from "../src/internal.js";
import { unionCapacity, unionInRange } from "../src/sortedIntView.js";
import { expectArgumentError, expectIndexError, ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";

const view = (values: number[], from?: number, to?: number) =>
  from === undefined
    ? SortedIntView.create(Int32Array.from(values))
    : SortedIntView.create(Int32Array.from(values), from, to);

/**
 * Java's SortedIntView is a fastutil IntList with list iterators and spliterators; the TypeScript
 * view is iterable in ascending order instead. The iterator and stream cases map onto that.
 */
describe("SortedIntViewTest", () => {
  it("constructor over the full array covers the whole array", () => {
    const v = view([1, 3, 5, 7]);
    expect(v.size).toBe(4);
    expect(ints(v.toInt32Array())).toEqual([1, 3, 5, 7]);
  });

  it("constructor over a range covers the range", () => {
    const v = view([1, 3, 5, 7, 9], 1, 4);
    expect(v.size).toBe(3);
    expect(ints(v.toInt32Array())).toEqual([3, 5, 7]);
  });

  it("constructor over an empty range is empty", () => {
    const v = view([1, 2, 3], 2, 2);
    expect(v.size).toBe(0);
    expect(v.isEmpty).toBe(true);
  });

  it("constructor with a negative fromIndex throws", () => {
    expectIndexError(() => view([1, 2, 3], -1, 2));
  });

  it("constructor with toIndex beyond the length throws", () => {
    expectIndexError(() => view([1, 2, 3], 0, 4));
  });

  it("constructor with fromIndex greater than toIndex throws", () => {
    expectIndexError(() => view([1, 2, 3], 2, 1));
  });

  it("EMPTY has size zero", () => {
    expect(SortedIntView.EMPTY.size).toBe(0);
    expect(SortedIntView.EMPTY.isEmpty).toBe(true);
  });

  it("get with a valid index returns the element", () => {
    const v = view([10, 20, 30, 40], 1, 4);
    expect(v.get(0)).toBe(20);
    expect(v.get(1)).toBe(30);
    expect(v.get(2)).toBe(40);
  });

  it.each([-1, 3, 100])("get(%i) out of bounds throws", (index) => {
    const v = view([1, 2, 3]);
    expectIndexError(() => v.get(index));
  });

  it("first returns the smallest element", () => {
    expect(view([5, 10, 15]).first()).toBe(5);
  });

  it("last returns the largest element", () => {
    expect(view([5, 10, 15]).last()).toBe(15);
  });

  it("first on an empty view throws (Java: NoSuchElementException)", () => {
    expectArgumentError(() => SortedIntView.EMPTY.first());
  });

  it("last on an empty view throws (Java: NoSuchElementException)", () => {
    expectArgumentError(() => SortedIntView.EMPTY.last());
  });

  it("first and last on a sub-view respect the range", () => {
    const v = view([1, 2, 3, 4, 5], 2, 5);
    expect(v.first()).toBe(3);
    expect(v.last()).toBe(5);
  });

  it.each([
    [1, 0],
    [3, 1],
    [5, 2],
    [7, 3],
    [9, 4],
    [0, -1],
    [2, -1],
    [4, -1],
    [10, -1],
  ])("indexOf(%i) on a full view is %i", (value, expectedIndex) => {
    expect(view([1, 3, 5, 7, 9]).indexOf(value)).toBe(expectedIndex);
  });

  it("indexOf on a sub-view returns the view-relative index", () => {
    const v = view([1, 3, 5, 7, 9], 2, 5);
    expect(v.indexOf(5)).toBe(0);
    expect(v.indexOf(7)).toBe(1);
    expect(v.indexOf(9)).toBe(2);
    expect(v.indexOf(3)).toBe(-1);
    expect(v.indexOf(1)).toBe(-1);
  });

  it("lastIndexOf behaves like indexOf", () => {
    const v = view([1, 3, 5, 7, 9]);
    expect(v.lastIndexOf(5)).toBe(v.indexOf(5));
    expect(v.lastIndexOf(4)).toBe(v.indexOf(4));
  });

  it("contains works", () => {
    const v = view([1, 3, 5]);
    expect(v.contains(3)).toBe(true);
    expect(v.contains(4)).toBe(false);
  });

  it("indexOf and contains find no value that is not an int", () => {
    const v = view([1, 3, 5]);
    for (const value of [NaN, undefined as unknown as number, 2.5, 2 ** 32 + 1]) {
      expect(v.indexOf(value)).toBe(-1);
      expect(v.lastIndexOf(value)).toBe(-1);
      expect(v.contains(value)).toBe(false);
    }
  });

  it("indexOfInRange returns the absolute index", () => {
    const array = Int32Array.of(1, 3, 5, 7, 9);
    expect(indexOfInRange(array, 2, 5, 5)).toBe(2);
    expect(indexOfInRange(array, 2, 5, 7)).toBe(3);
    expect(indexOfInRange(array, 2, 5, 3)).toBe(-1);
  });

  it("containsInRange detects membership", () => {
    const array = Int32Array.of(1, 3, 5, 7, 9);
    expect(containsInRange(array, 2, 5, 7)).toBe(true);
    expect(containsInRange(array, 2, 5, 3)).toBe(false);
  });

  it("toInt32Array of an empty view returns an empty array", () => {
    expect(SortedIntView.EMPTY.toInt32Array().length).toBe(0);
  });

  it("toInt32Array of a sub-view returns a copy of the range", () => {
    expect(ints(view([1, 3, 5, 7, 9], 1, 4).toInt32Array())).toEqual([3, 5, 7]);
  });

  it("toInt32Array returns an independent copy", () => {
    const backing = Int32Array.of(1, 3, 5);
    const copy = SortedIntView.create(backing).toInt32Array();
    copy[0] = 999;
    expect(backing[0]).toBe(1);
  });

  it("toArray with a null destination allocates a new array", () => {
    expect(ints(view([1, 3, 5]).toArray(null))).toEqual([1, 3, 5]);
  });

  it("toArray without a destination allocates a new array", () => {
    expect(ints(view([1, 3, 5]).toArray())).toEqual([1, 3, 5]);
  });

  it("toArray with a destination too small allocates a new array", () => {
    const dest = new Int32Array(2);
    const result = view([1, 3, 5]).toArray(dest);
    expect(result).not.toBe(dest);
    expect(ints(result)).toEqual([1, 3, 5]);
  });

  it("toArray with a destination of exact size reuses it", () => {
    const dest = new Int32Array(3);
    const result = view([1, 3, 5]).toArray(dest);
    expect(result).toBe(dest);
    expect(ints(dest)).toEqual([1, 3, 5]);
  });

  it("toArray with a larger destination reuses it", () => {
    const dest = Int32Array.of(9, 9, 9, 9, 9);
    const result = view([1, 3, 5]).toArray(dest);
    expect(result).toBe(dest);
    expect(ints(dest)).toEqual([1, 3, 5, 9, 9]);
  });

  it("getElements copies the correct range", () => {
    const dest = new Int32Array(4);
    view([1, 3, 5, 7, 9]).getElements(1, dest, 0, 3);
    expect(ints(dest)).toEqual([3, 5, 7, 0]);
  });

  it("getElements with an invalid source range throws", () => {
    expectIndexError(() => view([1, 3, 5]).getElements(0, new Int32Array(3), 0, 5));
  });

  it("getElements with an invalid destination range throws", () => {
    expectIndexError(() => view([1, 3, 5]).getElements(0, new Int32Array(2), 0, 3));
  });

  it("forEach visits all elements in order", () => {
    const collected: number[] = [];
    view([1, 3, 5, 7], 1, 4).forEach((v) => collected.push(v));
    expect(collected).toEqual([3, 5, 7]);
  });

  it("iteration goes forward over the range (Java: listIterator)", () => {
    const iterator = view([0, 10, 20, 30, 40], 1, 4)[Symbol.iterator]();
    expect(iterator.next()).toEqual({ value: 10, done: false });
    expect(iterator.next()).toEqual({ value: 20, done: false });
    expect(iterator.next()).toEqual({ value: 30, done: false });
    expect(iterator.next().done).toBe(true);
  });

  it("iteration past the end stays done (Java: nextInt past the end throws)", () => {
    const iterator = view([10, 20])[Symbol.iterator]();
    iterator.next();
    iterator.next();
    expect(iterator.next().done).toBe(true);
    expect(iterator.next().done).toBe(true);
  });

  it("iteration feeds spread, for-of and Array.from (Java: streams)", () => {
    const v = view([0, 1, 3, 5, 7, 9], 1, 6);
    expect([...v]).toEqual([1, 3, 5, 7, 9]);
    let sum = 0;
    for (const x of view([1, 3, 5, 7])) sum += x;
    expect(sum).toBe(16);
    expect(Array.from(SortedIntView.EMPTY)).toEqual([]);
  });

  it("asInt32Array views the range without copying", () => {
    const backing = Int32Array.of(0, 1, 3, 5, 9);
    const v = SortedIntView.create(backing, 1, 4);
    const array = v.asInt32Array();
    expect(ints(array)).toEqual([1, 3, 5]);
    expect(array.buffer).toBe(backing.buffer);
    expect(IntLists.asArrayLike(v)).toEqual(array);
    const plain = [4, 2];
    expect(IntLists.asArrayLike(plain)).toBe(plain);
  });

  it("asArrayLike rejects what is not a list, rather than reading it as empty", () => {
    // A view of a second installed copy of the core: the same shape, but another class.
    const foreign = new (class SortedIntView {
      readonly array = Int32Array.of(1, 3);
      readonly fromIndex = 0;
      readonly toIndex = 2;
    })();
    expect(() => IntLists.asArrayLike(foreign as never)).toThrow(TypeError);
    expect(() => IntLists.asArrayLike(foreign as never)).toThrow(
      "not a list: an object of class SortedIntView without a numeric length",
    );
    expect(() => IntLists.asArrayLike(null as never)).toThrow(new TypeError("not a list: null"));
    expect(() => IntLists.asArrayLike(undefined as never)).toThrow(new TypeError("not a list: undefined"));
    expect(() => IntLists.asArrayLike({} as never)).toThrow(TypeError);
  });

  it("subList over the full range returns the same instance", () => {
    const v = view([1, 3, 5]);
    expect(v.subList(0, 3)).toBe(v);
  });

  it("subList over an empty range returns EMPTY", () => {
    expect(view([1, 3, 5]).subList(1, 1)).toBe(SortedIntView.EMPTY);
  });

  it("subList over a partial range creates a sub-view", () => {
    expect(ints(view([1, 3, 5, 7, 9]).subList(1, 4))).toEqual([3, 5, 7]);
  });

  it("subList out of bounds throws", () => {
    const v = view([1, 3, 5]);
    expectIndexError(() => v.subList(-1, 2));
    expectIndexError(() => v.subList(0, 4));
    expectIndexError(() => v.subList(2, 1));
  });

  it("viewOf an empty range returns EMPTY", () => {
    expect(SortedIntView.viewOf(Int32Array.of(1, 3, 5), 2, 2)).toBe(SortedIntView.EMPTY);
  });

  it("viewOf a non-empty range creates a view", () => {
    expect(ints(SortedIntView.viewOf(Int32Array.of(1, 3, 5, 7), 1, 3))).toEqual([3, 5]);
  });

  it("viewOf an invalid range throws", () => {
    expectIndexError(() => SortedIntView.viewOf(Int32Array.of(1, 3), 0, 5));
  });

  it("viewOf an unsorted range throws", () => {
    expectArgumentError(() => SortedIntView.viewOf(Int32Array.of(5, 1, 3), 0, 3), "1 follows 5");
  });

  it("viewOf a range with duplicates throws", () => {
    expectArgumentError(() => SortedIntView.viewOf(Int32Array.of(1, 2, 2, 3), 0, 4), "2 follows 2");
  });

  it("viewOf checks only its range", () => {
    expect(ints(SortedIntView.viewOf(Int32Array.of(9, 1, 3, 5, 0), 1, 4))).toEqual([1, 3, 5]);
  });

  it("viewOf shares the array", () => {
    const backing = Int32Array.of(1, 3, 5);
    const v = SortedIntView.viewOf(backing, 0, 3);
    backing[1] = 4;
    expect(ints(v)).toEqual([1, 4, 5]);
  });

  it("equals on the same instance is true", () => {
    const v = view([1, 3, 5]);
    expect(v.equals(v)).toBe(true);
  });

  it("equals with the same content over a different array is true", () => {
    expect(view([1, 3, 5]).equals(view([1, 3, 5]))).toBe(true);
  });

  it("equals with the same content via a sub-view is true", () => {
    expect(view([0, 1, 3, 5, 9], 1, 4).equals(view([1, 3, 5]))).toBe(true);
  });

  it("equals with a different size is false", () => {
    expect(view([1, 3, 5]).equals(view([1, 3]))).toBe(false);
  });

  it("equals with the same size and different content is false", () => {
    expect(view([1, 3, 5]).equals(view([1, 3, 6]))).toBe(false);
  });

  it("equals an equivalent list - an array or a typed array (Java: an IntList)", () => {
    const v = view([1, 3, 5]);
    expect(v.equals([1, 3, 5])).toBe(true);
    expect(v.equals(Int32Array.of(1, 3, 5))).toBe(true);
    expect(v.equals(Float64Array.of(1, 3, 5))).toBe(true);
  });

  it("equals a different list is false", () => {
    expect(view([1, 3, 5]).equals([1, 3, 6])).toBe(false);
    expect(view([1, 3, 5]).equals(Int32Array.of(1, 3, 6))).toBe(false);
  });

  it("equals null is false", () => {
    expect(view([1, 3, 5]).equals(null)).toBe(false);
    expect(view([1, 3, 5]).equals(undefined)).toBe(false);
  });

  it("equals an unrelated type is false", () => {
    expect(view([1, 3, 5]).equals("not a list")).toBe(false);
    expect(view([1, 3, 5]).equals({ length: 3, 0: 1, 1: 3, 2: 5 })).toBe(false);
    expect(view([1, 3, 5]).equals(new DataView(new ArrayBuffer(12)))).toBe(false);
  });

  it("equals a shorter list is false", () => {
    expect(view([1, 3, 5]).equals([1, 3])).toBe(false);
  });

  it("equals compares lists, also from a sub-view", () => {
    const v = view([0, 1, 3, 5], 1, 4);
    expect(v.equals([1, 3, 5])).toBe(true);
    expect(v.equals(Int32Array.of(1, 3, 5))).toBe(true);
    expect(v.equals([1, 3, 6])).toBe(false);
  });

  it("subList from zero to less than the size creates a sub-view", () => {
    const v = view([1, 3, 5]);
    const sub = v.subList(0, 2);
    expect(sub).not.toBe(v);
    expect(ints(sub)).toEqual([1, 3]);
  });

  it("hashCode matches the list contract", () => {
    // Java's List.hashCode: h = 31 * h + e from 1, so [1, 3, 5] gives ((31 + 1) * 31 + 3) * 31 + 5.
    expect(view([1, 3, 5]).hashCode()).toBe(((31 + 1) * 31 + 3) * 31 + 5);
    expect(SortedIntView.EMPTY.hashCode()).toBe(1);
  });

  it("hashCode wraps at 32 bits as Java's int does", () => {
    const values = Int32Array.from({ length: 50 }, (_, i) => i * 1_000_003);
    let h = 1;
    for (const x of values) h = (Math.imul(31, h) + x) | 0;
    expect(SortedIntView.create(values).hashCode()).toBe(h);
  });

  it("hashCode is consistent with equals", () => {
    const a = view([1, 3, 5, 7, 9], 1, 4);
    const b = view([3, 5, 7]);
    expect(a.equals(b)).toBe(true);
    expect(a.hashCode()).toBe(b.hashCode());
  });

  it("toString lists the elements as Java does", () => {
    expect(view([0, 1, 3, 5], 1, 4).toString()).toBe("[1, 3, 5]");
    expect(SortedIntView.EMPTY.toString()).toBe("[]");
  });

  it("union of two empty views is empty", () => {
    expect(SortedIntView.EMPTY.union(SortedIntView.EMPTY).isEmpty).toBe(true);
  });

  it("union with an empty this returns the other", () => {
    const other = view([1, 3, 5]);
    expect(SortedIntView.EMPTY.union(other)).toBe(other);
  });

  it("union with an empty other returns this", () => {
    const self = view([1, 3, 5]);
    expect(self.union(SortedIntView.EMPTY)).toBe(self);
  });

  it("union of disjoint ranges merges and sorts", () => {
    expect(ints(view([1, 3, 5]).union(view([2, 4, 6])))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("union of overlapping ranges deduplicates", () => {
    expect(ints(view([1, 2, 3, 4]).union(view([3, 4, 5, 6])))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("union of identical views returns the same content", () => {
    expect(ints(view([1, 3, 5]).union(view([1, 3, 5])))).toEqual([1, 3, 5]);
  });

  it("union with a subset returns the larger set", () => {
    expect(ints(view([1, 2, 3, 4, 5]).union(view([2, 4])))).toEqual([1, 2, 3, 4, 5]);
  });

  it("unionInRange with offset ranges deduplicates", () => {
    const a = Int32Array.of(0, 1, 3, 5, 9);
    const b = Int32Array.of(0, 3, 4, 5, 9);
    expect(ints(unionInRange(a, 1, 4, b, 1, 4))).toEqual([1, 3, 4, 5]);
  });

  // The size of a union against the largest array, on small limits: two views that reach the real
  // one take gigabytes.

  it("unionCapacity is the sum of the sizes within the limit", () => {
    const a = Int32Array.of(1, 2, 3);
    const b = Int32Array.of(2, 3, 4);
    expect(unionCapacity(a, 0, 3, b, 0, 3, 6)).toBe(6);
  });

  it("unionCapacity counts the union when the sum exceeds the limit", () => {
    // The sizes add up to 6; the union {1, 2, 3, 4} has 4 values.
    const a = Int32Array.of(1, 2, 3);
    const b = Int32Array.of(2, 3, 4);
    expect(unionCapacity(a, 0, 3, b, 0, 3, 5)).toBe(4);
    expect(unionCapacity(a, 0, 3, b, 0, 3, 4)).toBe(4);
    expectArgumentError(() => unionCapacity(a, 0, 3, b, 0, 3, 3), "4 values");
  });

  it("unionCapacity counts the union of random ranges", () => {
    // With the limit at the size of the union, the count runs whenever the ranges share a value.
    // Java draws the sets through Random.ints; the sets here differ, the property is the same.
    const random = new JavaRandom(42);
    /** Up to 20 distinct values in -30..29, sorted ascending. */
    const randomSet = (): Int32Array => {
      const values = new Set<number>();
      for (let i = random.nextInt(21); i > 0; i--) values.add(random.nextInt(60) - 30);
      return Int32Array.from(values).sort();
    };
    for (let round = 0; round < 500; round++) {
      const a = randomSet();
      const b = randomSet();
      const aFrom = random.nextInt(a.length + 1);
      const aTo = aFrom + random.nextInt(a.length - aFrom + 1);
      const bFrom = random.nextInt(b.length + 1);
      const bTo = bFrom + random.nextInt(b.length - bFrom + 1);
      const size = unionInRange(a, aFrom, aTo, b, bFrom, bTo).length;
      expect(unionCapacity(a, aFrom, aTo, b, bFrom, bTo, size)).toBe(size);
      if (size > 0) expectArgumentError(() => unionCapacity(a, aFrom, aTo, b, bFrom, bTo, size - 1));
    }
  });
});
