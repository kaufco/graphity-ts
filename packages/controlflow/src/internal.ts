/**
 * Small helpers of the package: the index check of `java.util.Objects` and a growable int list in
 * the manner of fastutil's `IntArrayList`. The core has its own copies, which a package cannot see.
 *
 * @internal
 */

/**
 * Throws a `RangeError` unless `index` is an integer in `0..length-1` - the counterpart of
 * `Objects.checkIndex`, with the core's message. Non-integers and `NaN` are out of range: node
 * and loop IDs are `int` in Java.
 *
 * @internal
 */
export function checkIndex(index: number, length: number): number {
  if (!(index >= 0 && index < length) || (index | 0) !== index) {
    throw new RangeError(`Index ${index} out of bounds for length ${length}`);
  }
  return index;
}

/** Initial capacity fastutil's `IntArrayList` takes on its first addition. */
const DEFAULT_INITIAL_CAPACITY = 10;

/** fastutil's limit for array growth, which is the JDK's soft maximum array length. */
const MAX_ARRAY_SIZE = 0x7fffffff - 8;

const EMPTY = new Int32Array(0);

/**
 * A growable list of ints over an `Int32Array`, with the growth policy of fastutil's
 * `IntArrayList`: empty until the first addition, then 10 elements, then by half on every
 * overflow.
 *
 * @internal
 */
export class IntBuffer {
  data: Int32Array = EMPTY;
  length = 0;

  /** Appends one value. */
  push(value: number): void {
    if (this.length === this.data.length) this.grow();
    this.data[this.length++] = value;
  }

  /** The values as an array of exactly `length` elements: the buffer's own array if it fits, else a copy. */
  toInt32Array(): Int32Array {
    return this.length === this.data.length ? this.data : this.data.slice(0, this.length);
  }

  private grow(): void {
    const capacity =
      this.data === EMPTY
        ? DEFAULT_INITIAL_CAPACITY
        : Math.max(Math.min(this.data.length + (this.data.length >> 1), MAX_ARRAY_SIZE), this.length + 1);
    const grown = new Int32Array(capacity);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }
}
