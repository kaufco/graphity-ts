// Derived from fastutil's IntOpenHashSet and HashCommon (https://fastutil.di.unimi.it/),
// Copyright (C) 2002-2024 Sebastiano Vigna, Apache License, Version 2.0.

/**
 * A set of ints by open addressing with linear probing: fastutil's `IntOpenHashSet`, which the
 * Java version of `IteratedDominanceFrontier` uses, reduced to `add`, `contains` and `size`.
 *
 * Same table layout, hash and growth as fastutil: a power-of-two table of `Int32Array` slots in
 * which 0 marks a free slot (the key 0 itself is a flag), `HashCommon.mix` as the hash, load
 * factor 0.75, doubling once the table is three quarters full, and the same limit - a table of at
 * most 2^30 slots, so about 8 x 10^8 keys - with the same `IllegalArgumentException`, here an
 * `Error`. A JavaScript `Set` would allocate per entry and stops at 2^24 entries in V8 with a
 * `RangeError`, which the port reserves for indices.
 *
 * @internal
 */
export class IntOpenHashSet {
  /** Slots, `n + 1` of them as in fastutil; 0 marks a free slot. */
  #key: Int32Array;

  /** Table size, a power of two. */
  #n: number;

  #mask: number;

  /** Number of keys at which the next addition grows the table. */
  #maxFill: number;

  /** Number of keys, the key 0 included. */
  #size = 0;

  #containsNull = false;

  /**
   * An empty set for `expected` keys before it grows - fastutil's default of 16 when omitted.
   *
   * @throws Error if the table for `expected` keys would exceed 2^30 slots
   */
  constructor(expected = DEFAULT_INITIAL_SIZE) {
    this.#n = arraySize(expected);
    this.#mask = this.#n - 1;
    this.#maxFill = maxFill(this.#n);
    this.#key = new Int32Array(this.#n + 1);
  }

  /** The number of keys. */
  get size(): number {
    return this.#size;
  }

  /**
   * Adds `k` and returns whether it was new.
   *
   * @throws Error if the set would grow beyond a table of 2^30 slots
   */
  add(k: number): boolean {
    if (k === 0) {
      if (this.#containsNull) return false;
      this.#containsNull = true;
    } else {
      const key = this.#key;
      const mask = this.#mask;
      let pos = mix(k) & mask;
      let curr = key[pos];
      if (curr !== 0) {
        if (curr === k) return false;
        while ((curr = key[(pos = (pos + 1) & mask)]) !== 0) if (curr === k) return false;
      }
      key[pos] = k;
    }
    if (this.#size++ >= this.#maxFill) this.#rehash(arraySize(this.#size + 1));
    return true;
  }

  /** Whether the set contains `k`. */
  contains(k: number): boolean {
    if (k === 0) return this.#containsNull;
    const key = this.#key;
    const mask = this.#mask;
    let pos = mix(k) & mask;
    let curr = key[pos];
    if (curr === 0) return false;
    if (curr === k) return true;
    while (true) {
      if ((curr = key[(pos = (pos + 1) & mask)]) === 0) return false;
      if (curr === k) return true;
    }
  }

  #rehash(newN: number): void {
    const key = this.#key;
    const mask = newN - 1;
    const newKey = new Int32Array(newN + 1);
    let i = this.#n;
    for (let j = this.#containsNull ? this.#size - 1 : this.#size; j-- !== 0;) {
      while (key[--i] === 0);
      let pos = mix(key[i]) & mask;
      if (newKey[pos] !== 0) while (newKey[(pos = (pos + 1) & mask)] !== 0);
      newKey[pos] = key[i];
    }
    this.#n = newN;
    this.#mask = mask;
    this.#maxFill = maxFill(newN);
    this.#key = newKey;
  }
}

/** fastutil's `Hash.DEFAULT_INITIAL_SIZE`. */
const DEFAULT_INITIAL_SIZE = 16;

/** fastutil's `Hash.DEFAULT_LOAD_FACTOR`, `0.75f`, exact in a double. */
const LOAD_FACTOR = 0.75;

/** The largest table fastutil allocates. */
const MAX_TABLE_SIZE = 2 ** 30;

/**
 * `HashCommon.mix(int)`: the finalisation step of MurmurHash3 with the golden ratio.
 *
 * @internal
 */
export function mix(x: number): number {
  const h = Math.imul(x, 0x9e3779b9);
  return h ^ (h >>> 16);
}

/**
 * `HashCommon.arraySize(expected, 0.75f)`: the smallest power of two, at least 2, that holds
 * `expected` keys at the load factor.
 *
 * @throws Error if that exceeds 2^30, with fastutil's message
 * @internal
 */
export function arraySize(expected: number): number {
  const needed = Math.ceil(expected / LOAD_FACTOR);
  let s = 2;
  while (s < needed) s *= 2;
  if (s > MAX_TABLE_SIZE) {
    throw new Error(`Too large (${expected} expected elements with load factor ${LOAD_FACTOR})`);
  }
  return s;
}

/** `HashCommon.maxFill(n, 0.75f)`: keys a table of `n` slots takes before it grows. */
function maxFill(n: number): number {
  return Math.min(Math.ceil(n * LOAD_FACTOR), n - 1);
}
