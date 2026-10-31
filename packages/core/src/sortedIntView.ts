import { ArrayLimits } from "./arrayLimits.js";
import { arrayHashCode, checkFromIndexSize, checkFromToIndex, checkIndex, indexOfInRange } from "./internal.js";

/**
 * A list of `int` values as the library takes it, such as start nodes, sources, entries or the
 * nodes of a subgraph. It is any array-like of numbers (an `Array`, an `Int32Array` or another
 * typed array) or a {@link SortedIntView}. So a result of the library can be passed back without
 * copying it into an array first.
 *
 * It is the counterpart of the parameters of type `IntList` (fastutil) in Java. A list is read
 * during the call and never kept. {@link IntLists.asArrayLike} reads either form.
 */
export type IntList = ArrayLike<number> | SortedIntView;

/** Reading an {@link IntList} in either of its forms, for code that takes lists as the library does. */
export const IntLists = {
  /**
   * Returns the values of `list` as an array-like, without copying: a {@link SortedIntView} as a
   * view of its array ({@link SortedIntView.asInt32Array}), anything else as it is.
   *
   * **Time:** O(1).
   *
   * @param list the list to read
   * @returns its values; not to be modified
   * @throws TypeError if `list` is neither a {@link SortedIntView} of this library nor has a
   *     numeric `length`, as for `null` or a view from a second installed copy of the library
   *     (Java: `NullPointerException` for `null`)
   */
  asArrayLike(list: IntList): ArrayLike<number> {
    if (list instanceof SortedIntView) return list.asInt32Array();
    if (typeof (list as Partial<ArrayLike<number>> | null | undefined)?.length !== "number") throw notAList(list);
    return list;
  },
} as const;

/**
 * @internal The error for a list argument that is neither a {@link SortedIntView} of this library
 * nor has a numeric `length`, which would otherwise read as an empty list.
 */
export function notAList(value: unknown): TypeError {
  const type = typeof value === "object" && value !== null ? value.constructor?.name : undefined;
  return new TypeError(`not a list: ${type ? `an object of class ${type} without a numeric length` : String(value)}`);
}

/**
 * A list of `int` values in ascending order and without duplicates, as a view of a range of an
 * `Int32Array`.
 *
 * Adjacency lookups such as {@link Graph.outNodes} return it, as do other methods of this library
 * that return nodes or edge indices in ascending order, such as {@link Graphs.reachableFrom}. It
 * reads like a list, with {@link SortedIntView.get} and {@link SortedIntView.size}. It is also
 * iterable: `for (const node of graph.outNodes(v))`. Since its values are sorted and distinct,
 * {@link SortedIntView.indexOf} and {@link SortedIntView.contains} search in O(log size), and
 * {@link SortedIntView.first} and {@link SortedIntView.last} are the smallest and the largest
 * value. A loop that must not create an iterator reads `size` and `get(i)`, or the arrays of
 * {@link Csr} directly.
 *
 * A view shares its array with the object it comes from instead of copying it; a method that
 * returns a copy, such as {@link SortedIntView.union}, says so. Instances are immutable, as the
 * arrays behind them never change. A view that {@link SortedIntView.viewOf} makes of an array of
 * the caller stays sorted and unchanged only as long as nobody modifies that range of the array.
 * A view is a plain object of three fields rather than a `subarray` of an `Int32Array`, which costs
 * several times as much to create.
 *
 * **Memory:** constant; the values stay in the shared array.
 */
export class SortedIntView implements Iterable<number> {
  /** An empty view. */
  static readonly EMPTY: SortedIntView = new SortedIntView(new Int32Array(0), 0, 0);

  /**
   * @internal The view is `array[fromIndex..toIndex - 1]`. The array may be shared with a graph and
   * other views, and is never written.
   */
  readonly array: Int32Array;

  /** @internal The first position of the view in {@link SortedIntView.array}. */
  readonly fromIndex: number;

  /** @internal The end position of the view in {@link SortedIntView.array}, exclusive. */
  readonly toIndex: number;

  // Type-only, no field at run time: a private member makes the type nominal, so that an object of
  // the same shape is not taken for an instance, as in Java.
  declare private readonly brand: never;

  private constructor(array: Int32Array, fromIndex: number, toIndex: number) {
    checkFromToIndex(fromIndex, toIndex, array.length);
    this.array = array;
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }

  /**
   * @internal A view of `array[fromIndex..toIndex - 1]`, without a copy, checking only the bounds
   * of the range: the caller guarantees that the range is strictly ascending.
   *
   * @throws RangeError if the range is not within the array
   */
  static create(array: Int32Array, fromIndex = 0, toIndex = array.length): SortedIntView {
    return new SortedIntView(array, fromIndex, toIndex);
  }

  /**
   * Returns a view of `array[fromIndex..toIndex-1]`, which must be strictly ascending.
   *
   * The range is checked, not copied: the view shares `array`, and stays sorted and unchanged only
   * as long as nobody modifies that range of it.
   *
   * **Time:** O(toIndex - fromIndex).
   *
   * @param array the array to view
   * @param fromIndex first position of the range
   * @param toIndex end position of the range, exclusive
   * @returns a view of the range
   * @throws RangeError if `fromIndex` is negative, `toIndex` is greater than `array.length`, or
   *     `fromIndex > toIndex`
   * @throws Error if the range is not strictly ascending
   */
  static viewOf(array: Int32Array, fromIndex: number, toIndex: number): SortedIntView {
    checkFromToIndex(fromIndex, toIndex, array.length);
    if (fromIndex === toIndex) return SortedIntView.EMPTY;
    for (let i = fromIndex + 1; i < toIndex; i++) {
      if (array[i] <= array[i - 1]) {
        throw new Error(
          `array[${fromIndex}..${toIndex}) must be strictly ascending, but ${array[i]} follows ${array[i - 1]} at index ${i}`,
        );
      }
    }
    return new SortedIntView(array, fromIndex, toIndex);
  }

  /**
   * Returns the value at position `index` (Java: `getInt`).
   *
   * **Time:** O(1).
   *
   * @param index position in `0..size-1`
   * @throws RangeError if `index` is out of range
   */
  get(index: number): number {
    checkIndex(index, this.toIndex - this.fromIndex);
    return this.array[this.fromIndex + index];
  }

  /**
   * The number of values (Java: `size()`).
   *
   * **Time:** O(1).
   */
  get size(): number {
    return this.toIndex - this.fromIndex;
  }

  /**
   * Whether the view has no values (Java: `isEmpty()`).
   *
   * **Time:** O(1).
   */
  get isEmpty(): boolean {
    return this.toIndex === this.fromIndex;
  }

  /**
   * Returns the first value, which is the smallest.
   *
   * **Time:** O(1).
   *
   * @returns smallest value
   * @throws Error if the view is empty (Java: `NoSuchElementException`)
   */
  first(): number {
    if (this.fromIndex === this.toIndex) throw new Error("the view is empty");
    return this.array[this.fromIndex];
  }

  /**
   * Returns the last value, which is the largest.
   *
   * **Time:** O(1).
   *
   * @returns largest value
   * @throws Error if the view is empty (Java: `NoSuchElementException`)
   */
  last(): number {
    if (this.fromIndex === this.toIndex) throw new Error("the view is empty");
    return this.array[this.toIndex - 1];
  }

  /**
   * Returns the position of `value`, or `-1` if the view does not contain it.
   *
   * **Time:** O(log size).
   *
   * @param value the value to search for
   * @returns position in `0..size-1`, or `-1`
   */
  indexOf(value: number): number {
    const index = indexOfInRange(this.array, this.fromIndex, this.toIndex, value);
    return index >= 0 ? index - this.fromIndex : -1;
  }

  /**
   * Returns the position of `value`, or `-1` if the view does not contain it. Equivalent to
   * {@link SortedIntView.indexOf}, since no value occurs twice.
   *
   * **Time:** O(log size).
   */
  lastIndexOf(value: number): number {
    return this.indexOf(value);
  }

  /**
   * Returns whether the view contains `value`.
   *
   * **Time:** O(log size).
   */
  contains(value: number): boolean {
    return indexOfInRange(this.array, this.fromIndex, this.toIndex, value) >= 0;
  }

  /**
   * Returns the values as a new array (Java: `toIntArray`).
   *
   * **Time:** O(size).
   * **Memory:** 4 x size bytes for the result.
   */
  toInt32Array(): Int32Array {
    return this.array.slice(this.fromIndex, this.toIndex);
  }

  /**
   * Returns the values in `dest` from position `0` on, or in a new array if `dest` is `null`,
   * missing or too short.
   *
   * **Time:** O(size).
   * **Memory:** 4 x size bytes if it returns a new array, otherwise none.
   *
   * @param dest the array to fill, or `null` or none for a new one
   * @returns `dest`, or a new array
   */
  toArray(dest?: Int32Array | null): Int32Array {
    const size = this.size;
    if (dest == null || dest.length < size) return this.toInt32Array();
    dest.set(this.array.subarray(this.fromIndex, this.toIndex));
    return dest;
  }

  /**
   * Copies `length` values, from position `srcOffset` on, into `dest` at `destOffset`.
   *
   * **Time:** O(length).
   *
   * @throws RangeError if the range to copy is not within this view or not within `dest`
   */
  getElements(srcOffset: number, dest: Int32Array, destOffset: number, length: number): void {
    checkFromIndexSize(srcOffset, length, this.size);
    checkFromIndexSize(destOffset, length, dest.length);
    const from = this.fromIndex + srcOffset;
    dest.set(this.array.subarray(from, from + length), destOffset);
  }

  /**
   * Returns the values as an `Int32Array` that views the array of this view, without a copy. This
   * is the bridge to code that takes typed arrays. It is not in Java, where the view is itself an
   * `IntList`.
   *
   * The result must not be modified, like the arrays of {@link Csr}: it shares its memory with the
   * graph or the result the view comes from.
   *
   * **Time:** O(1).
   */
  asInt32Array(): Int32Array {
    return this.array.subarray(this.fromIndex, this.toIndex);
  }

  /**
   * Calls `action` for every value, in ascending order.
   *
   * **Time:** O(size).
   */
  forEach(action: (value: number) => void): void {
    const array = this.array;
    for (let i = this.fromIndex, end = this.toIndex; i < end; i++) action(array[i]);
  }

  /**
   * Returns an iterator over the values, in ascending order (Java: `iterator()`; the list
   * iterator and the spliterator have no counterpart).
   *
   * **Time:** O(1) to create the iterator.
   */
  [Symbol.iterator](): Iterator<number, undefined> {
    const array = this.array;
    const end = this.toIndex;
    let position = this.fromIndex;
    return {
      next: (): IteratorResult<number, undefined> =>
        position < end ? { value: array[position++], done: false } : { value: undefined, done: true },
    };
  }

  /**
   * Returns the values at the positions `fromIndex..toIndex-1` as a view of the same array, not a
   * copy.
   *
   * **Time:** O(1).
   *
   * @param fromIndex first position
   * @param toIndex end position, exclusive
   * @throws RangeError if `fromIndex` is negative, `toIndex` is greater than `size`, or
   *     `fromIndex > toIndex`
   */
  subList(fromIndex: number, toIndex: number): SortedIntView {
    checkFromToIndex(fromIndex, toIndex, this.size);
    if (fromIndex === 0 && toIndex === this.size) return this;
    if (fromIndex === toIndex) return SortedIntView.EMPTY;
    return new SortedIntView(this.array, this.fromIndex + fromIndex, this.fromIndex + toIndex);
  }

  /**
   * Returns whether `other` is a list with the same values in the same order, as the
   * `java.util.List` contract defines it. A list is another view, an `Array` or a typed array.
   *
   * **Time:** O(size).
   */
  equals(other: unknown): boolean {
    if (other === this) return true;
    let array: ArrayLike<unknown>;
    let from: number;
    let to: number;
    if (other instanceof SortedIntView) {
      array = other.array;
      from = other.fromIndex;
      to = other.toIndex;
    } else if (Array.isArray(other) || (ArrayBuffer.isView(other) && !(other instanceof DataView))) {
      array = other as ArrayLike<unknown>;
      from = 0;
      to = array.length;
    } else {
      return false;
    }
    if (to - from !== this.size) return false;
    for (let i = this.fromIndex, j = from; i < this.toIndex; i++, j++) {
      if (this.array[i] !== array[j]) return false;
    }
    return true;
  }

  /**
   * Returns a hash code over the values, as the `java.util.List` contract defines it. It has the
   * same value as in Java.
   *
   * **Time:** O(size).
   */
  hashCode(): number {
    return arrayHashCode(this.array, this.fromIndex, this.toIndex);
  }

  /**
   * Returns the values of this view and `other` together, in ascending order and without
   * duplicates.
   *
   * The result is a copy, merged on every call, unless one of the two views is empty: then it is
   * the other one.
   *
   * **Time:** O(size + other.size).
   * **Memory:** up to 4 x (size + other.size) bytes for the result; while it runs, up to as much
   * again if the two views share values.
   *
   * @param other the view to unite with this one
   * @returns the union
   * @throws Error if the union has more than 2^31 - 9 values, the most an array can hold
   */
  union(other: SortedIntView): SortedIntView {
    if (other.isEmpty) return this;
    if (this.isEmpty) return other;
    const out = unionInRange(this.array, this.fromIndex, this.toIndex, other.array, other.fromIndex, other.toIndex);
    return new SortedIntView(out, 0, out.length);
  }

  /** Returns the values as Java's lists write them: `[1, 2, 3]`. */
  toString(): string {
    return `[${Array.from(this.array.subarray(this.fromIndex, this.toIndex)).join(", ")}]`;
  }
}

/**
 * @internal The merge behind {@link SortedIntView.union} and {@link BiAdjacentGraph.neighbors}, on
 * ranges of arrays, so that neither needs view objects.
 *
 * @throws Error if the union does not fit into an array
 */
export function unionInRange(
  a: Int32Array,
  aFrom: number,
  aTo: number,
  b: Int32Array,
  bFrom: number,
  bTo: number,
): Int32Array {
  const out = new Int32Array(unionCapacity(a, aFrom, aTo, b, bFrom, bTo, ArrayLimits.MAX_ARRAY_LENGTH));
  let outPos = 0;
  let aPos = aFrom;
  let bPos = bFrom;
  while (aPos < aTo && bPos < bTo) {
    const aValue = a[aPos];
    const bValue = b[bPos];
    if (aValue < bValue) {
      out[outPos++] = aValue;
      aPos++;
    } else if (bValue < aValue) {
      out[outPos++] = bValue;
      bPos++;
    } else {
      out[outPos++] = aValue;
      aPos++;
      bPos++;
    }
  }
  if (aPos < aTo) {
    out.set(a.subarray(aPos, aTo), outPos);
    outPos += aTo - aPos;
  } else if (bPos < bTo) {
    out.set(b.subarray(bPos, bTo), outPos);
    outPos += bTo - bPos;
  }
  // Trim to the actual size in case a and b share values.
  return outPos === out.length ? out : out.slice(0, outPos);
}

/**
 * @internal The length to allocate for the union of two sorted, duplicate-free ranges: the sum of
 * their sizes, or, if that exceeds `maxLength`, the size of the union itself, counted by a merge
 * that writes nothing - so that two large ranges with many common values still fit. `maxLength`
 * is the largest array length; tests pass a small one.
 *
 * @throws Error if the union has more than `maxLength` values
 */
export function unionCapacity(
  a: Int32Array,
  aFrom: number,
  aTo: number,
  b: Int32Array,
  bFrom: number,
  bTo: number,
  maxLength: number,
): number {
  const sizeSum = aTo - aFrom + (bTo - bFrom);
  if (sizeSum <= maxLength) return sizeSum;
  let aPos = aFrom;
  let bPos = bFrom;
  let unionSize = 0;
  while (aPos < aTo && bPos < bTo) {
    const aValue = a[aPos];
    const bValue = b[bPos];
    if (aValue <= bValue) aPos++;
    if (bValue <= aValue) bPos++;
    unionSize++;
  }
  unionSize += aTo - aPos + (bTo - bPos);
  if (unionSize > maxLength) {
    throw new Error(`the union has ${unionSize} values, more than the largest array length of ${maxLength}`);
  }
  return unionSize;
}
