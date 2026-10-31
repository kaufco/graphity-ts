# Examples

This directory holds the examples of the documentation comments, of the README of [Graphity for TypeScript](../../README.md) and of the guide [Solving Graph Problems with Graphity](https://kaufco.github.io/graphity-doc/?lang=ts). It is the counterpart of the Java module `graphity-examples`. It is not a package of its own: it is never built or published.

Every example builds on the graphs of a small program in `src/smallProgram.ts`. The examples of the guide, in `src/guide`, also build on the grammar of a small language (`src/smallGrammar.ts`) and on a family tree (`src/smallFamily.ts`). There is one file per topic. Each example is a method that returns or prints what it computes. The exception is `src/gettingStarted.ts`, which holds the first program of the README and runs when its module is loaded, as a script does. The tests check what its comments claim. The code that the documentation shows is a region of these files, between `// @start region="name"` and `// @end`. Java's Javadoc embeds its regions the same way, with `{@snippet}`. Three places show such a region, each with its tests:

- a documentation comment shows a region in a `ts` code block after the marker `<!-- example: file.ts#region -->`, and `test/documentationExamples.test.ts` checks that the block equals the region;
- the README does the same, and `test/readmeExamples.test.ts` checks its blocks and their imports;
- the guide shows a region of `src/guide/<file>.ts` wherever it shows the region of the same name of the Java file `guide/<File>.java`, and the tests in `test/guide` check what the comments of these examples claim, as Java's tests of the guide do.

A change to an example goes into its file first; the tests then name every block that no longer matches.

The guide links the full example below each block. A region that the guide shows therefore has no comment that only makes up for the code the excerpt leaves out.

The guide links every name of the Java API that it shows to the API documentation of the language a reader picks. These names are the public and protected types, constructors and methods of the published Java modules, as `java-refs.txt` lists them. `api-ts.json` maps each name to its name in TypeScript and its page of the [API documentation](https://kaufco.github.io/graphity-ts/). An entry adds the signature where Java's overloads are overload signatures of one name in TypeScript, and a note where TypeScript differs from what the Java text says. Where TypeScript has no counterpart, the entry gives the reason instead. `test/apiMapping.test.ts` checks that `api-ts.json` has exactly these entries, and, where the API documentation is built (`npm run build && npm run docs`), that every page and anchor exists.

## Line length

No line of the example sources in `src` is longer than 90 characters, counted with its indentation. At its standard width the guide wraps any longer line, which breaks the layout of the code. A line that is too long is brought under the limit in one of three ways:

- a comment line is wrapped, and the rest is joined with the next comment line, so that the comment still reads as one paragraph; every line starts with the comment marker, such as `//`;
- a code line that is too long only because of its trailing comment gets the comment on a line of its own directly above it, with the same indentation; a result comment such as `// 3 - nextLine` moves the same way; where it would land directly under another comment, a blank line keeps the two apart;
- a code line that is too long by itself is wrapped as Prettier wraps it, except that a table of values keeps several entries per line, as the tables of these files do.

The format check does not reach these files: `.prettierignore` leaves them out, as Prettier would collapse their aligned tables. The limit is up to whoever changes an example.
