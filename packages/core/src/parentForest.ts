/**
 * Indices grouped by key as CSR: those with key `k` are `members[start[k]..start[k + 1])`,
 * ascending.
 *
 * @internal
 */
export interface Groups {
  readonly start: Int32Array;
  readonly members: Int32Array;
}

/**
 * Helpers for a forest given as a parent array, `-1` for a root - the form in which `Ancestry`
 * and `Dominators` hold their trees -, and the grouping by key that its child lists are one case
 * of: the partitions build their member lists with it as well.
 *
 * @internal
 */
export const ParentForest = {
  /**
   * The child lists of the forest, each ascending: {@link groupIndices} with the parent as key.
   *
   * **Memory:** 4 x (nodeCount + 1 + childCount) bytes.
   */
  childrenOf(parent: Int32Array): Groups {
    return ParentForest.groupIndices(parent, parent.length);
  },

  /**
   * Groups the indices `i` of `keyOf` by their key `keyOf[i]`, which lies in `0..keyCount-1`; an
   * index with a negative key is in no group.
   *
   * **Memory:** 4 x (keyCount + 1 + groupedCount) bytes.
   */
  groupIndices(keyOf: Int32Array, keyCount: number): Groups {
    const start = new Int32Array(keyCount + 1);
    for (let i = 0; i < keyOf.length; i++) {
      const key = keyOf[i];
      if (key >= 0) start[key]++;
    }
    return { start, members: ParentForest.groupCounted(keyOf, start) };
  },

  /**
   * The second half of {@link groupIndices}, for a caller that counts the keys in a pass it makes
   * anyway. On entry `start[k]` holds the number of indices with key `k` and `start[keyCount]` is
   * `0`; on return `start` holds the offsets of the groups.
   *
   * @returns the members of all groups, grouped by key
   */
  groupCounted(keyOf: Int32Array, start: Int32Array): Int32Array {
    const keyCount = start.length - 1;
    let next = 0;
    for (let key = 0; key < keyCount; key++) {
      const count = start[key];
      start[key] = next;
      next += count;
    }
    const members = new Int32Array(next);
    // The ascending scan leaves every group sorted; start[k] doubles as write pointer and is
    // shifted back afterwards.
    for (let i = 0; i < keyOf.length; i++) {
      const key = keyOf[i];
      if (key >= 0) members[start[key]++] = i;
    }
    for (let key = keyCount; key > 0; key--) start[key] = start[key - 1];
    start[0] = 0;
    return members;
  },

  /**
   * The canonical preorder of the forest - roots ascending, children ascending - with the size of
   * every subtree. Fills the three given arrays, each of length nodeCount.
   *
   * `IteratedDominanceFrontier.of` in `@kobayami/graphity-controlflow` keeps a copy, extended by
   * the depth of every node, and `Loops.of` there copies this and `groupCounted`; change them
   * together.
   *
   * **Memory:** 4 x (nodeCount + 1 + childCount) bytes for the child lists.
   */
  preorder(parent: Int32Array, preorderIndex: Int32Array, order: Int32Array, subtreeSize: Int32Array): void {
    const n = parent.length;
    const { start, members: nodes } = ParentForest.childrenOf(parent);

    // Every node is pushed exactly once, so the stack fits in n slots; the subtree-size array
    // serves as the stack until it is filled below.
    const stack = subtreeSize;
    let top = 0;
    for (let node = n - 1; node >= 0; node--) {
      if (parent[node] < 0) stack[top++] = node;
    }
    let position = 0;
    while (top > 0) {
      const node = stack[--top];
      preorderIndex[node] = position;
      order[position++] = node;
      for (let i = start[node + 1] - 1; i >= start[node]; i--) stack[top++] = nodes[i];
    }

    // Reverse preorder visits every child before its parent.
    subtreeSize.fill(1);
    for (let i = n - 1; i >= 0; i--) {
      const node = order[i];
      const p = parent[node];
      if (p >= 0) subtreeSize[p] += subtreeSize[node];
    }
  },
} as const;
