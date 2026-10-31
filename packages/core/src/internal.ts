/**
 * Small helpers shared across the package: the argument checks of `java.util.Objects`, a growable
 * `Int32Array` in the manner of fastutil's `IntArrayList`, sorting and binary search on ranges.
 * Nothing here is exported from the package.
 */

/**
 * Throws a `RangeError` unless `index` is an integer in `0..length-1` - the counterpart of
 * `Objects.checkIndex`. Non-integers and `NaN` are out of range: node IDs are `int` in Java.
 */
export function checkIndex(index: number, length: number): number {
  if (!(index >= 0 && index < length) || (index | 0) !== index) {
    throw new RangeError(`Index ${index} out of bounds for length ${length}`);
  }
  return index;
}

/**
 * Checks every node of a list of start nodes, sources or entries before any work begins - the
 * check of each list form of a traversal or search in this package. Java keeps it in `Graphs`
 * (`Graphs.checkNodes`, package-private); here it sits with the other checks, so that the
 * traversers need not import `Graphs`.
 *
 * @throws RangeError if a node is not in `0..nodeCount-1`
 */
export function checkNodes(nodes: ArrayLike<number>, nodeCount: number): void {
  for (let i = 0, size = nodes.length; i < size; i++) checkIndex(nodes[i], nodeCount);
}

/** Throws a `RangeError` unless `0 <= fromIndex <= toIndex <= length`, as `Objects.checkFromToIndex`. */
export function checkFromToIndex(fromIndex: number, toIndex: number, length: number): void {
  if (
    !(fromIndex >= 0 && fromIndex <= toIndex && toIndex <= length) ||
    (fromIndex | 0) !== fromIndex ||
    (toIndex | 0) !== toIndex
  ) {
    throw new RangeError(`Range [${fromIndex}, ${toIndex}) out of bounds for length ${length}`);
  }
}

/** Throws a `RangeError` unless `[fromIndex, fromIndex + size)` lies in `0..length`, as `Objects.checkFromIndexSize`. */
export function checkFromIndexSize(fromIndex: number, size: number, length: number): void {
  if (
    !(fromIndex >= 0 && size >= 0 && fromIndex + size <= length) ||
    (fromIndex | 0) !== fromIndex ||
    (size | 0) !== size
  ) {
    throw new RangeError(`Range [${fromIndex}, ${fromIndex} + ${size}) out of bounds for length ${length}`);
  }
}

/** Throws the `Error` that stands for Java's `IllegalArgumentException` when the lengths differ. */
export function checkLength(length: number, expected: number, name: string): void {
  if (length !== expected) {
    throw new Error(`${name} has length ${length}, expected ${expected}`);
  }
}

/** Initial capacity fastutil's `IntArrayList` takes on its first addition. */
const DEFAULT_INITIAL_CAPACITY = 10;

/** fastutil's limit for array growth, which is the JDK's soft maximum array length. */
const MAX_ARRAY_SIZE = 0x7fffffff - 8;

const EMPTY = new Int32Array(0);

/**
 * A growable list of ints over an `Int32Array`, with the growth policy of fastutil's
 * `IntArrayList`: empty until the first addition, then 10 elements, then by half on every
 * overflow; {@link ensureCapacity} grows to the exact size requested.
 */
export class IntBuffer {
  data: Int32Array = EMPTY;
  length = 0;

  constructor(capacity = 0) {
    if (capacity > 0) this.data = new Int32Array(capacity);
  }

  /** Appends one value. */
  push(value: number): void {
    if (this.length === this.data.length) this.grow(this.length + 1);
    this.data[this.length++] = value;
  }

  /** Grows to hold at least `capacity` values, to exactly that size, as `IntArrayList.ensureCapacity`. */
  ensureCapacity(capacity: number): void {
    if (capacity <= this.data.length || (this.data === EMPTY && capacity <= DEFAULT_INITIAL_CAPACITY)) return;
    this.reallocate(capacity);
  }

  /** Whether the buffer holds no value. */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  /** The values as an array of exactly `length` elements: the buffer's own array if it fits, else a copy. */
  toInt32Array(): Int32Array {
    return this.length === this.data.length ? this.data : this.data.slice(0, this.length);
  }

  private grow(capacity: number): void {
    if (capacity <= this.data.length) return;
    if (this.data !== EMPTY) {
      capacity = Math.max(Math.min(this.data.length + (this.data.length >> 1), MAX_ARRAY_SIZE), capacity);
    } else if (capacity < DEFAULT_INITIAL_CAPACITY) {
      capacity = DEFAULT_INITIAL_CAPACITY;
    }
    this.reallocate(capacity);
  }

  private reallocate(capacity: number): void {
    const grown = new Int32Array(capacity);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }
}

/**
 * Sorts `array[from..to)` ascending in place. Short ranges - most adjacency lists - by insertion
 * sort, because a `subarray` view per list would cost an allocation each.
 */
export function sortRange(array: Int32Array, from: number, to: number): void {
  if (to - from > 16) {
    array.subarray(from, to).sort();
    return;
  }
  for (let i = from + 1; i < to; i++) {
    const v = array[i];
    let j = i - 1;
    while (j >= from && array[j] > v) {
      array[j + 1] = array[j];
      j--;
    }
    array[j + 1] = v;
  }
}

/** Absolute index of `value` in the sorted range `array[from..to)`, or -1 - `Arrays.binarySearch` reduced to a hit. */
export function indexOfInRange(array: ArrayLike<number>, from: number, to: number, value: number): number {
  let lo = from;
  let hi = to - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const m = array[mid];
    if (m < value) lo = mid + 1;
    else if (m > value) hi = mid - 1;
    // NaN and undefined are neither below nor above any element; only equality is a hit.
    else return m === value ? mid : -1;
  }
  return -1;
}

/** Whether the sorted range `array[from..to)` contains `value`. */
export function containsInRange(array: ArrayLike<number>, from: number, to: number, value: number): boolean {
  return indexOfInRange(array, from, to, value) >= 0;
}

/** Index of the lowest set bit of a non-zero 32-bit word, as `Integer.numberOfTrailingZeros`. */
export function numberOfTrailingZeros(word: number): number {
  return 31 - Math.clz32(word & -word);
}

/** Java's `Arrays.hashCode(int[])`: `31 * h + value` from 1, in 32-bit arithmetic. */
export function arrayHashCode(array: ArrayLike<number>, from = 0, to = array.length): number {
  let h = 1;
  for (let i = from; i < to; i++) h = (Math.imul(31, h) + array[i]) | 0;
  return h;
}

/** Whether two int arrays hold the same values. */
export function sameInts(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
