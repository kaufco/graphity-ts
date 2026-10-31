/**
 * `java.util.Random`, bit for bit: the 48-bit linear congruential generator with Java's
 * multiplier, so that the random graphs of the fuzz tests are the very graphs the Java tests
 * generate for the same seed, and a failure names a case that reproduces in both.
 *
 * The 48-bit state is kept in two 24-bit halves, whose products stay exact in doubles.
 */
export class JavaRandom {
  private hi: number;
  private lo: number;

  constructor(seed: bigint | number) {
    const scrambled = (BigInt.asIntN(64, BigInt(seed)) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
    this.hi = Number(scrambled >> 24n);
    this.lo = Number(scrambled & 0xffffffn);
  }

  /** `Random.next(bits)` for `bits <= 32`, as a signed 32-bit value like Java's `int`. */
  next(bits: number): number {
    const M_HI = 0x5de;
    const M_LO = 0xece66d;
    const p0 = this.lo * M_LO + 0xb;
    const lo = p0 % 0x1000000;
    const carry = Math.floor(p0 / 0x1000000);
    const p1 = this.hi * M_LO + this.lo * M_HI + carry;
    this.hi = p1 % 0x1000000;
    this.lo = lo;
    const value = Math.floor((this.hi * 0x1000000 + this.lo) / 2 ** (48 - bits));
    return value | 0;
  }

  /** `Random.nextInt(bound)`, the legacy algorithm that `java.util.Random` keeps. */
  nextInt(bound: number): number {
    if (!(bound > 0)) throw new Error(`bound must be positive: ${bound}`);
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> 31n);
    for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31));
    return r;
  }

  /** `Random.nextDouble()`. */
  nextDouble(): number {
    return (this.next(26) * 2 ** 27 + this.next(27)) * 2 ** -53;
  }

  /** `Random.nextBoolean()`. */
  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  /** `Random.nextLong()`, as a signed 64-bit bigint. */
  nextLong(): bigint {
    const high = BigInt(this.next(32));
    const low = BigInt(this.next(32));
    return BigInt.asIntN(64, (high << 32n) + low);
  }
}
