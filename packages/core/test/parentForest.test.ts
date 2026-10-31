import { describe, expect, it } from "vitest";
import { ParentForest } from "../src/parentForest.js";
import { ints } from "./testutils/assertions.js";
import { JavaRandom } from "./testutils/javaRandom.js";

describe("ParentForestTest", () => {
  it("groupIndices lists each group ascending and skips negative keys", () => {
    const groups = ParentForest.groupIndices(Int32Array.of(2, -1, 0, 2, -1, 0, 3), 5);
    expect(ints(groups.start)).toEqual([0, 2, 2, 4, 5, 5]);
    expect(ints(groups.members)).toEqual([2, 5, 0, 3, 6]);
  });

  it("groupIndices without keys or indices", () => {
    const noKeys = ParentForest.groupIndices(Int32Array.of(-1, -1), 0);
    expect(ints(noKeys.start)).toEqual([0]);
    expect(ints(noKeys.members)).toEqual([]);
    const noIndices = ParentForest.groupIndices(new Int32Array(0), 3);
    expect(ints(noIndices.start)).toEqual([0, 0, 0, 0]);
    expect(ints(noIndices.members)).toEqual([]);
  });

  it("groupIndices matches a scan per key", () => {
    const random = new JavaRandom(7);
    for (let round = 0; round < 500; round++) {
      const keyCount = random.nextInt(12);
      const keyOf = new Int32Array(random.nextInt(40));
      for (let i = 0; i < keyOf.length; i++) keyOf[i] = random.nextInt(keyCount + 2) - 2; // -2 and -1 are in no group
      const groups = ParentForest.groupIndices(keyOf, keyCount);
      expect(groups.start.length).toBe(keyCount + 1);
      let at = 0;
      for (let key = 0; key < keyCount; key++) {
        expect(groups.start[key]).toBe(at);
        for (let i = 0; i < keyOf.length; i++) {
          if (keyOf[i] === key) expect(groups.members[at++]).toBe(i);
        }
      }
      expect(groups.start[keyCount]).toBe(at);
      expect(groups.members.length).toBe(at);
    }
  });

  it("childrenOf groups by parent", () => {
    const children = ParentForest.childrenOf(Int32Array.of(-1, 0, 0, 1, -1, 4));
    expect(ints(children.start)).toEqual([0, 2, 3, 3, 3, 4, 4]);
    expect(ints(children.members)).toEqual([1, 2, 3, 5]);
  });

  it("preorder lists roots and children ascending with subtree sizes", () => {
    const parent = Int32Array.of(-1, 0, 0, 1, -1, 4);
    const preorderIndex = new Int32Array(6);
    const order = new Int32Array(6);
    const subtreeSize = new Int32Array(6);
    ParentForest.preorder(parent, preorderIndex, order, subtreeSize);
    expect(ints(order)).toEqual([0, 1, 3, 2, 4, 5]);
    expect(ints(preorderIndex)).toEqual([0, 1, 3, 2, 4, 5]);
    expect(ints(subtreeSize)).toEqual([4, 2, 1, 1, 2, 1]);
  });
});
