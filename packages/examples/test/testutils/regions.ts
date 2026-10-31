import { readFileSync } from "node:fs";

/** A line with nothing but the start or the end of a region. */
const MARKUP = /^\s*\/\/ @(start|end)(?: region="([^"]*)")?\s*$/;

/** The source of an example file of this package, by its name, such as `connectivity.ts`. */
export function exampleSource(file: string): string | undefined {
  try {
    return readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * The lines of a region, as Java's Javadoc tool shows the regions of `{@snippet}`: from
 * `// @start region="name"` to the `// @end` that closes it, without the markup lines of regions
 * nested in it and without their common indentation. `// @end` closes the region started last,
 * `// @end region="name"` the region of that name.
 *
 * @returns the region, or `undefined` if the source has none of that name
 */
export function region(source: string, name: string): string | undefined {
  const open: string[] = [];
  const lines: string[] = [];
  for (const line of source.split("\n")) {
    const markup = MARKUP.exec(line);
    if (markup === null) {
      if (open.includes(name)) lines.push(line);
      continue;
    }
    const regionName = markup[2];
    if (markup[1] === "start") {
      open.push(regionName ?? "");
    } else {
      const closed = regionName ?? open[open.length - 1];
      open.splice(open.lastIndexOf(closed), 1);
      if (closed === name) return dedent(lines.join("\n"));
    }
  }
  return undefined;
}

/** `text` without the indentation its lines share, trailing whitespace and blank lines at either end. */
export function dedent(text: string): string {
  const lines = text.trim() === "" ? [] : text.split("\n");
  let indent = Number.MAX_SAFE_INTEGER;
  for (const line of lines) {
    if (line.trim() !== "") indent = Math.min(indent, line.length - line.trimStart().length);
  }
  return lines
    .map((line) => (line.trim() === "" ? "" : line.slice(indent).trimEnd()))
    .join("\n")
    .trim();
}

/** A code block with the examples it shows. */
export interface ExampleBlock {
  /** Where the block starts, as `file:line`. */
  readonly location: string;
  /** The references of its marker, such as `connectivity.ts#sccsOf`, or none without a marker. */
  readonly references: readonly string[];
  /** The lines of the block. */
  readonly lines: readonly string[];
}

/**
 * The TypeScript code blocks of a Markdown text, each with the references of the marker
 * `<!-- example: file.ts#region ... -->` on the line right before it.
 *
 * @param lines the lines of the text, in a documentation comment without their leading `*`
 * @param file the name of the file, for the locations
 * @param lineOf the line of the file that holds each of `lines`
 */
export function exampleBlocks(lines: readonly string[], file: string, lineOf: (index: number) => number): ExampleBlock[] {
  const blocks: ExampleBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```ts") continue;
    const marker = i > 0 ? /^\s*<!-- example: (.*?) -->\s*$/.exec(lines[i - 1]) : null;
    const start = i;
    const body: string[] = [];
    for (i++; i < lines.length && lines[i].trim() !== "```"; i++) body.push(lines[i]);
    blocks.push({
      location: `${file}:${lineOf(start)}`,
      references: marker === null ? [] : marker[1].trim().split(/ +/),
      lines: body,
    });
  }
  return blocks;
}

/**
 * Compares a block with the regions it names: its leading `import` lines, if `withImports`, must be
 * imports of the named files, and the rest must equal the regions, without their common
 * indentation, separated by a blank line.
 *
 * @returns what is wrong, or nothing
 */
export function check(block: ExampleBlock, withImports: boolean): string[] {
  if (block.references.length === 0) return [`${block.location}: a TypeScript block without an example marker`];
  const failures: string[] = [];
  const regions: string[] = [];
  const sources: string[] = [];
  for (const reference of block.references) {
    const [file, name] = reference.split("#");
    const source = exampleSource(file);
    if (source !== undefined) sources.push(source);
    const text = source === undefined || name === undefined ? undefined : region(source, name);
    if (text === undefined) failures.push(`${block.location}: no region ${reference}`);
    else regions.push(text);
  }
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of block.lines) {
    (withImports && body.length === 0 && line.startsWith("import ") ? imports : body).push(line);
  }
  const imported = sources.flatMap((source) => [...importsOf(source)]);
  for (const line of imports) {
    for (const name of importsOf(line)) {
      if (!imported.includes(name)) {
        failures.push(`${block.location}: ${name} is not imported by ${block.references.join(" ")}`);
      }
    }
  }
  const expected = regions.join("\n\n");
  const actual = dedent(body.join("\n"));
  if (regions.length === block.references.length && actual !== expected) {
    failures.push(`${block.location}: differs from ${block.references.join(" ")}\n--- documentation\n${actual}\n--- examples\n${expected}`);
  }
  return failures;
}

/**
 * The names that the `import { ... } from "module"` statements of `source` import, each as
 * `module:name`, without a `type` modifier.
 */
function importsOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const statement of source.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)";/gm)) {
    for (const name of statement[1].split(",")) {
      const bare = name.trim().replace(/^type\s+/, "");
      if (bare !== "") names.add(`${statement[2]}:${bare}`);
    }
  }
  return names;
}
