/** The text of `lines`, each ended by a line break, as a Java text block ends every line. */
export function textOf(...lines: string[]): string {
  return lines.map((line) => `${line}\n`).join("");
}
