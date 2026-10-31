/** The comments of the examples give node IDs with their names; the tests compare both. */
export function namesOf(nodes: Iterable<number> | ArrayLike<number>, names: readonly string[]): string[] {
  return Array.from(nodes as Iterable<number>, (node) => names[node]);
}
