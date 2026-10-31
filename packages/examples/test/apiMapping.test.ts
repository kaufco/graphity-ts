import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** An entry of api-ts.json: the TypeScript counterpart of one Java ref, or the reason there is none. */
interface Entry {
  name?: unknown;
  signature?: unknown;
  url?: unknown;
  note?: unknown;
  reason?: unknown;
}

/** api-ts.json: where the API documentation is built and how, and an entry per Java ref. */
interface Mapping {
  about?: unknown;
  docRoot?: unknown;
  docCommand?: unknown;
  refs: Record<string, Entry>;
}

/** The directory of this package, which holds api-ts.json and java-refs.txt. */
const EXAMPLES = new URL("../", import.meta.url);

/** The root of the repository, to which docRoot is relative. */
const ROOT = new URL("../../", EXAMPLES);

/**
 * When set, the API documentation must be built and the check of the urls runs instead of being
 * skipped: CI sets it in the step that runs this test after `npm run docs`.
 */
const DOCS_REQUIRED = process.env.GRAPHITY_API_DOCS_REQUIRED === "true";

const mapping = JSON.parse(readFileSync(new URL("api-ts.json", EXAMPLES), "utf8")) as Mapping;

/**
 * The refs of java-refs.txt: every public or protected type, constructor and method of the four
 * published Java modules, keyed by its declaration.
 */
const javaRefs = readFileSync(new URL("java-refs.txt", EXAMPLES), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * Checks api-ts.json, the TypeScript counterparts of the Java API references that the guide Solving
 * Graph Problems with Graphity links to the API documentation of the language a reader picks: an
 * entry for exactly the refs of java-refs.txt, each with a name and a url, or with a reason why
 * TypeScript has none; where the name has overload signatures, also with the signature of its
 * overload, the name with a parameter list. Where the API documentation is built (`npm run build &&
 * npm run docs`, into the docRoot of the mapping), every url must name a page of it and an anchor on
 * that page; where it is not, that test is skipped and says so.
 */
describe("ApiMappingTest", () => {
  it("saysWhatItIsAndWhereTheApiDocumentationIsBuilt", () => {
    expect(isText(mapping.about)).toBe(true);
    expect(isText(mapping.docRoot)).toBe(true);
    expect(isText(mapping.docCommand)).toBe(true);
  });

  it("hasAnEntryForExactlyTheRefsOfTheJavaApi", () => {
    expect(javaRefs.length).toBeGreaterThan(0);
    expect(javaRefs.filter((ref, index) => javaRefs.indexOf(ref) !== index)).toEqual([]);
    const keys = Object.keys(mapping.refs);
    expect(javaRefs.filter((ref) => !Object.hasOwn(mapping.refs, ref))).toEqual([]);
    expect(keys.filter((key) => !javaRefs.includes(key))).toEqual([]);
  });

  it("givesEveryRefANameAndAUrlOrAReason", () => {
    const problems: string[] = [];
    for (const [ref, entry] of Object.entries(mapping.refs)) {
      const fields = ["name", "signature", "url", "note", "reason"];
      const unknown = Object.keys(entry).filter((key) => !fields.includes(key));
      if (unknown.length > 0) problems.push(`${ref}: unknown fields ${unknown.join(", ")}`);
      if (entry.name === null) {
        if (entry.url !== null) problems.push(`${ref}: a url without a name`);
        if (!isText(entry.reason)) problems.push(`${ref}: neither a name nor a reason`);
        if (entry.note !== undefined) problems.push(`${ref}: a note without a name`);
        if (entry.signature !== undefined) problems.push(`${ref}: a signature without a name`);
      } else {
        if (!isText(entry.name)) problems.push(`${ref}: the name is not a non-empty string or null`);
        if (!isText(entry.url)) problems.push(`${ref}: a name without a url`);
        else if (!/^[^/#][^#]*\.html(#[^#]+)?$/.test(entry.url) || entry.url.includes("..")) {
          problems.push(`${ref}: the url ${entry.url} is not a page relative to the root, with at most one anchor`);
        }
        if (entry.reason !== undefined) problems.push(`${ref}: a reason, but also a name`);
        if (entry.note !== undefined && !isText(entry.note)) problems.push(`${ref}: an empty note`);
        if (entry.signature !== undefined) {
          const name = String(entry.name);
          if (!isText(entry.signature)) problems.push(`${ref}: the signature is not a non-empty string`);
          else if (
            !entry.signature.startsWith(name) ||
            !/^(<[^(]+>)?\(.*\)$/.test(entry.signature.slice(name.length))
          ) {
            problems.push(`${ref}: the signature ${entry.signature} is not the name with a parameter list`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("pointsEveryUrlAtAPageAndAnAnchorOfTheBuiltApiDocumentation", (context) => {
    const docRoot = new URL(String(mapping.docRoot).replace(/\/?$/, "/"), ROOT);
    const built = existsSync(new URL("index.html", docRoot));
    if (!built && !DOCS_REQUIRED) {
      const note = `the API documentation is not built in ${String(mapping.docRoot)}: run ${String(mapping.docCommand)} to check the urls of api-ts.json`;
      context.skip(note);
    }
    expect(built, `the API documentation is not built in ${String(mapping.docRoot)}`).toBe(true);
    const pages = new Map<string, string | null>();
    const problems: string[] = [];
    let checked = 0;
    for (const [ref, entry] of Object.entries(mapping.refs)) {
      if (typeof entry.url !== "string") continue;
      const [page, anchor] = entry.url.split("#");
      if (!pages.has(page)) {
        const file = new URL(page, docRoot);
        pages.set(page, existsSync(file) ? readFileSync(file, "utf8") : null);
      }
      const html = pages.get(page);
      if (html === null || html === undefined) {
        problems.push(`${ref}: no page ${page}`);
      } else if (anchor !== undefined && !html.includes(` id="${anchor}"`)) {
        problems.push(`${ref}: no anchor #${anchor} on ${page}`);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});
