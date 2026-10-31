import { type Graph, GraphBuilder } from "@kobayami/graphity";

const PACKAGES: readonly string[] = [
  "app", "cli", "ui", "service", "model", "storage", "json", "util",
];

// A package, then the packages it uses.
const USES: readonly (readonly string[])[] = [
  ["app", "cli", "ui", "service"],
  ["cli", "util"],
  ["ui", "service", "model", "util"],
  ["service", "model", "storage"],
  ["model", "storage"],
  ["storage", "model", "json", "util"],
  ["json", "util"],
];

const METHODS: readonly string[] = [
  "main", "parseArgs", "run", "load", "save", "show", "parse", "format", "read", "write",
];

// A method, then the methods it calls, once per call site: run shows the notes before and
// after saving them, and parse calls itself for nested arrays and for nested objects.
const CALL_SITES: readonly (readonly string[])[] = [
  ["main", "parseArgs", "run"],
  ["run", "load", "show", "save", "show"],
  ["load", "read", "parse"],
  ["save", "format", "write"],
  ["show", "format"],
  ["parse", "parse", "parse"],
  ["format", "format"],
];

// The methods of each package, the package first. Packages without methods are left out.
const METHODS_OF_PACKAGE: readonly (readonly string[])[] = [
  ["app", "main", "run"],
  ["cli", "parseArgs"],
  ["ui", "show"],
  ["service", "load", "save"],
  ["model", "parse", "format"],
  ["storage", "read", "write"],
];

const BLOCKS: readonly string[] = ["entry", "header", "body", "then", "next", "exit"];

// The control flow of load, a block, then the blocks it may continue with:
//
//   function load(file: string): Note[] {
//     const lines = read(file);                  // entry
//     const notes: Note[] = [];
//     for (let i = 0; i < lines.length; i++) {   // header: i < lines.length
//       const line = lines[i];                   // body
//       if (line.trim() !== "") {
//         notes.push(parse(line));               // then
//       }
//     }                                          // next: i++
//     return notes;                              // exit
//   }
const FLOW: readonly (readonly string[])[] = [
  ["entry", "header"],
  ["header", "body", "exit"],
  ["body", "then", "next"],
  ["then", "next"],
  ["next", "header"],
];

const SHOW_BLOCKS: readonly string[] = [
  "entry", "nextNote", "format", "nextLine", "print", "exit",
];

// The control flow of show, a block, then the blocks it may continue with:
//
//   function show(notes: Note[]): void {
//     out.write(`${notes.length} notes\n`);           // entry
//     for (const note of notes) {                     // nextNote: another note?
//       const lines = format(note).split("\n");       // format
//       for (const line of lines) {                   // nextLine: another line?
//         out.write(`  ${line}\n`);                   // print
//       }
//     }
//     out.end();                                      // exit
//   }
const SHOW_FLOW: readonly (readonly string[])[] = [
  ["entry", "nextNote"],
  ["nextNote", "format", "exit"],
  ["format", "nextLine"],
  ["nextLine", "print", "nextNote"],
  ["print", "nextLine"],
];

const STEPS: readonly string[] = [
  "generate", "compile", "lint", "compileTests", "docs",
  "test", "package", "sign", "publish",
];

// A step, then the steps that may start only after it.
const BEFORE: readonly (readonly string[])[] = [
  ["generate", "compile"],
  ["compile", "compileTests", "docs", "package"],
  ["lint", "package"],
  ["compileTests", "test"],
  ["docs", "publish"],
  ["test", "package"],
  ["package", "sign"],
  ["sign", "publish"],
];

const PARSE_ARGS_BLOCKS: readonly string[] = ["entry", "option", "value", "exit"];

// The control flow of parseArgs, a block, then the blocks it may continue with. parseArgs
// is generated from a state machine with two states that jump to each other; it starts in
// the state "option" or, if the first argument is not an option, in the state "value":
//
//   entry:   if (isOption(args[0])) goto option; else goto value;
//   option:  read an option;  if (done) goto exit; else goto value;
//   value:   read a value;    if (done) goto exit; else goto option;
//   exit:    return the settings;
const PARSE_ARGS_FLOW: readonly (readonly string[])[] = [
  ["entry", "option", "value"],
  ["option", "value", "exit"],
  ["value", "option", "exit"],
];

/**
 * A place in the source where one method calls another.
 *
 * `caller` is the calling method and `callee` the called one, both node IDs of
 * {@link SmallProgram.calls}.
 */
export interface CallSite {
  readonly caller: number;
  readonly callee: number;
}

/**
 * The example domain: a small program, seen as graphs.
 *
 * The program is a notebook on the command line. Its packages depend on each other, its
 * methods call each other, and each method has a control flow between its basic blocks.
 * This object gives six of these graphs, each with the names of its nodes:
 *
 * - {@link SmallProgram.dependencies} with {@link SmallProgram.packageNames} - the
 *   packages and the packages they use; `model` and `storage` use each other, the one
 *   cycle.
 * - {@link SmallProgram.calls} with {@link SmallProgram.methodNames} - the methods and
 *   the methods they call, built from the {@link SmallProgram.callSites}; `parse` and
 *   `format` call themselves. {@link SmallProgram.packageOf} gives the package of each
 *   method.
 * - {@link SmallProgram.cfg} with {@link SmallProgram.blockNames} - the control flow of
 *   `load`, a loop with a branch in it, from the entry block to the exit block.
 * - {@link SmallProgram.cfgOfShow} with {@link SmallProgram.blockNamesOfShow} - the
 *   control flow of `show`, a loop over the lines of a note inside a loop over the notes.
 * - {@link SmallProgram.buildSteps} with {@link SmallProgram.stepNames} - the steps that
 *   build and publish the program, an edge from each step to each step that may start
 *   only after it.
 * - {@link SmallProgram.cfgOfParseArgs} with {@link SmallProgram.blockNamesOfParseArgs} -
 *   the control flow of `parseArgs`, a state machine whose loop is entered in either of
 *   its two states.
 *
 * Node IDs follow the order of the names. The graphs never change: the comments of the
 * examples, and the documentation that shows them, depend on every node and edge.
 */
export const SmallProgram = {
  /**
   * Returns the dependencies between the packages: an edge from each package to each
   * package it uses.
   *
   * @returns 8 nodes, 14 edges
   */
  dependencies(): Graph {
    return build(PACKAGES, USES);
  },

  /**
   * Returns the names of the packages, by node ID of {@link SmallProgram.dependencies}.
   *
   * @returns app, cli, ui, service, model, storage, json, util
   */
  packageNames(): string[] {
    return [...PACKAGES];
  },

  /**
   * Returns the calls between the methods: an edge from each method to each method it
   * calls, built with `GraphBuilder` from one edge per call site, which merges the
   * duplicates.
   *
   * @returns 10 nodes, 12 edges
   */
  calls(): Graph {
    return build(METHODS, CALL_SITES);
  },

  /**
   * Returns the call sites in source order, one per place in the source where a method
   * calls another: `run` calls `show` twice, and `parse` calls itself twice.
   *
   * @returns 14 call sites, as node IDs of {@link SmallProgram.calls}
   */
  callSites(): readonly CallSite[] {
    const sites: CallSite[] = [];
    for (const row of CALL_SITES) {
      const caller = SmallProgram.nodeOf(METHODS, row[0]);
      for (let i = 1; i < row.length; i++) {
        sites.push(
          Object.freeze({ caller, callee: SmallProgram.nodeOf(METHODS, row[i]) }),
        );
      }
    }
    return Object.freeze(sites);
  },

  /**
   * Returns the names of the methods, by node ID of {@link SmallProgram.calls}.
   *
   * @returns main, parseArgs, run, load, save, show, parse, format, read, write
   */
  methodNames(): string[] {
    return [...METHODS];
  },

  /**
   * Returns the package of each method, a node ID of {@link SmallProgram.dependencies},
   * by node ID of {@link SmallProgram.calls}. Every call between two packages is a
   * dependency between them.
   *
   * @returns app for main and run, cli for parseArgs, ui for show, service for load and
   *     save, model for parse and format, storage for read and write
   */
  packageOf(): Int32Array {
    const packageOf = new Int32Array(METHODS.length);
    for (const row of METHODS_OF_PACKAGE) {
      const pkg = SmallProgram.nodeOf(PACKAGES, row[0]);
      for (let i = 1; i < row.length; i++) {
        packageOf[SmallProgram.nodeOf(METHODS, row[i])] = pkg;
      }
    }
    return packageOf;
  },

  /**
   * Returns the control flow of the method `load` between its basic blocks.
   *
   * @returns 6 nodes, 7 edges
   */
  cfg(): Graph {
    return build(BLOCKS, FLOW);
  },

  /**
   * Returns the names of the basic blocks, by node ID of {@link SmallProgram.cfg}.
   *
   * @returns entry, header, body, then, next, exit
   */
  blockNames(): string[] {
    return [...BLOCKS];
  },

  /**
   * Returns the control flow of the method `show` between its basic blocks.
   *
   * @returns 6 nodes, 7 edges
   */
  cfgOfShow(): Graph {
    return build(SHOW_BLOCKS, SHOW_FLOW);
  },

  /**
   * Returns the names of the basic blocks of `show`, by node ID of
   * {@link SmallProgram.cfgOfShow}.
   *
   * @returns entry, nextNote, format, nextLine, print, exit
   */
  blockNamesOfShow(): string[] {
    return [...SHOW_BLOCKS];
  },

  /**
   * Returns the steps that build and publish the program: an edge `a -> b` if step `b`
   * may start only after step `a` has finished.
   *
   * @returns 9 nodes, 10 edges
   */
  buildSteps(): Graph {
    return build(STEPS, BEFORE);
  },

  /**
   * Returns the names of the build steps, by node ID of {@link SmallProgram.buildSteps}.
   *
   * @returns generate, compile, lint, compileTests, docs, test, package, sign, publish
   */
  stepNames(): string[] {
    return [...STEPS];
  },

  /**
   * Returns the control flow of the method `parseArgs` between its basic blocks.
   *
   * @returns 4 nodes, 6 edges
   */
  cfgOfParseArgs(): Graph {
    return build(PARSE_ARGS_BLOCKS, PARSE_ARGS_FLOW);
  },

  /**
   * Returns the names of the basic blocks of `parseArgs`, by node ID of
   * {@link SmallProgram.cfgOfParseArgs}.
   *
   * @returns entry, option, value, exit
   */
  blockNamesOfParseArgs(): string[] {
    return [...PARSE_ARGS_BLOCKS];
  },

  /**
   * Returns the node ID of the node named `name`.
   *
   * @param names the names of the nodes, by node ID
   * @param name the name to look up
   * @returns the node ID
   * @throws Error if no node has this name
   */
  nodeOf(names: readonly string[], name: string): number {
    const node = names.indexOf(name);
    if (node < 0) throw new Error(`no node is named ${name}`);
    return node;
  },
} as const;

function build(names: readonly string[], rows: readonly (readonly string[])[]): Graph {
  const builder = new GraphBuilder();
  builder.addNodes(names.length);
  for (const row of rows) {
    const source = SmallProgram.nodeOf(names, row[0]);
    for (let i = 1; i < row.length; i++) {
      builder.addEdge(source, SmallProgram.nodeOf(names, row[i]));
    }
  }
  return builder.build();
}
