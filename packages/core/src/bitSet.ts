import { numberOfTrailingZeros } from "./internal.js";

/**
 * A set of non-negative integers, one bit each, that grows as needed. It is the counterpart of
 * `java.util.BitSet`, with the part of it that the API of the library needs: the visited nodes of a
 * {@link FrontierTraverser}, which a subclass may mark, and the selection of
 * {@link NodeMapping.forSubgraph}. JavaScript has no bit set of its own.
 *
 * The bits are kept in 32-bit words, where Java keeps them in 64-bit words; the set grows when a
 * bit beyond its capacity is set. Instances are mutable.
 *
 * **Memory:** 1 bit per bit up to the highest set or the initial capacity, in words of 4 bytes.
 */
export class BitSet {
  /** @internal The words, bit `i` in `words[i >>> 5]`. */
  words: Int32Array;

  /**
   * Creates an empty set with room for the bits `0..nbits-1` before it grows. The default is 64, as
   * in Java.
   *
   * **Time:** O(nbits).
   *
   * @param nbits the number of bits to make room for
   * @throws Error if `nbits` is negative (Java: `NegativeArraySizeException`) or not an integer in
   *     the 32-bit range
   */
  constructor(nbits = 64) {
    if (nbits < 0) throw new Error(`nbits < 0: ${nbits}`);
    if ((nbits | 0) !== nbits) throw new Error(`nbits is not an int: ${nbits}`);
    this.words = new Int32Array((nbits + 31) >>> 5);
  }

  /**
   * Returns whether bit `index` is set; `false` beyond the capacity.
   *
   * **Time:** O(1).
   *
   * @param index bit index, `0` or more
   * @throws RangeError if `index` is negative or not an integer
   */
  get(index: number): boolean {
    checkIndex(index, "bitIndex");
    const word = index >>> 5;
    return word < this.words.length && (this.words[word] & (1 << (index & 31))) !== 0;
  }

  /**
   * Sets bit `index`, and grows the set if the bit lies beyond its capacity.
   *
   * **Time:** O(1) amortized.
   *
   * @param index bit index, `0` or more
   * @throws RangeError if `index` is negative or not an integer
   */
  set(index: number): void {
    checkIndex(index, "bitIndex");
    const word = index >>> 5;
    if (word >= this.words.length) this.growTo(word + 1);
    this.words[word] |= 1 << (index & 31);
  }

  /**
   * Clears bit `index`.
   *
   * **Time:** O(1).
   *
   * @param index bit index, `0` or more
   * @throws RangeError if `index` is negative or not an integer
   */
  clear(index: number): void {
    checkIndex(index, "bitIndex");
    const word = index >>> 5;
    if (word < this.words.length) this.words[word] &= ~(1 << (index & 31));
  }

  /**
   * Returns the index of the first set bit at or after `from`, or `-1` if there is none.
   *
   * **Time:** O(capacity / 32).
   *
   * @param from bit index to start at, `0` or more
   * @throws RangeError if `from` is negative or not an integer
   */
  nextSetBit(from: number): number {
    checkIndex(from, "fromIndex");
    const words = this.words;
    let word = from >>> 5;
    if (word >= words.length) return -1;
    let bits = words[word] & (-1 << (from & 31));
    while (bits === 0) {
      if (++word === words.length) return -1;
      bits = words[word];
    }
    return (word << 5) + numberOfTrailingZeros(bits);
  }

  /**
   * Returns the index of the first clear bit at or after `from`.
   *
   * **Time:** O(capacity / 32).
   *
   * @param from bit index to start at, `0` or more
   * @throws RangeError if `from` is negative or not an integer
   */
  nextClearBit(from: number): number {
    checkIndex(from, "fromIndex");
    const words = this.words;
    let word = from >>> 5;
    if (word >= words.length) return from;
    let bits = ~words[word] & (-1 << (from & 31));
    while (bits === 0) {
      if (++word === words.length) return words.length << 5;
      bits = ~words[word];
    }
    return (word << 5) + numberOfTrailingZeros(bits);
  }

  /**
   * Returns the number of set bits.
   *
   * **Time:** O(capacity / 32).
   */
  cardinality(): number {
    let count = 0;
    for (let i = 0; i < this.words.length; i++) {
      let w = this.words[i];
      while (w !== 0) {
        w &= w - 1;
        count++;
      }
    }
    return count;
  }

  /**
   * Returns the index of the highest set bit plus one, or `0` if no bit is set.
   *
   * **Time:** O(capacity / 32), where Java keeps the number of words in use and answers in O(1).
   */
  length(): number {
    for (let word = this.words.length - 1; word >= 0; word--) {
      const bits = this.words[word];
      if (bits !== 0) return (word << 5) + 32 - Math.clz32(bits);
    }
    return 0;
  }

  /**
   * Returns whether no bit is set.
   *
   * **Time:** O(capacity / 32), where Java answers in O(1).
   */
  isEmpty(): boolean {
    return this.length() === 0;
  }

  private growTo(wordCount: number): void {
    const grown = new Int32Array(Math.max(wordCount, 2 * this.words.length));
    grown.set(this.words);
    this.words = grown;
  }
}

/**
 * Rejects a bit index that is negative, with the message of `java.util.BitSet`, or that is not an
 * `int`, which the words could not address.
 */
function checkIndex(index: number, name: string): void {
  if (index < 0) throw new RangeError(`${name} < 0: ${index}`);
  if ((index | 0) !== index) throw new RangeError(`${name} is not an int: ${index}`);
}
