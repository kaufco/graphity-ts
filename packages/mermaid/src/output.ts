import type { MermaidWriter } from "./mermaidWriter.js";

/**
 * Where {@link MermaidWriter.write} puts its text: anything with a `write(text)` method. That is a
 * Node.js `Writable` such as `process.stdout` or a file stream, a `WritableStreamDefaultWriter`, or
 * a collector of one's own. It is the counterpart of Java's `Appendable`.
 *
 * The writer passes the text in chunks of about 8 KiB characters, not piece by piece, and ignores
 * what `write` returns: a Node.js stream buffers past its high-water mark, and the promise of a
 * stream writer is not awaited. A `write` that throws ends the writing with its error.
 *
 * Only a `write` that throws fails the call, as Java's `IOException` does. A Node.js stream reports
 * its errors through its `'error'` event, and a `WritableStreamDefaultWriter` through its promises
 * (`writer.closed`, `writer.close()`), after the call has returned. The caller must watch these, as
 * Node.js otherwise ends the process on such an error. For an error that fails the call itself, use
 * a sink that writes synchronously, such as one that calls `fs.writeSync`.
 */
export interface TextSink {
  /** Takes the next part of the text. */
  write(text: string): unknown;
}

/** The length from which {@link Output.append} passes the pending text on to the sink. */
const CHUNK_LENGTH = 8192;

/**
 * @internal The text of one write: collected in full for `writeToString`, passed on to a
 * {@link TextSink} in chunks otherwise.
 */
export class Output {
  private readonly sink: TextSink | null;
  private text = "";

  constructor(sink: TextSink | null) {
    this.sink = sink;
  }

  append(text: string): void {
    this.text += text;
    if (this.sink !== null && this.text.length >= CHUNK_LENGTH) this.flush();
  }

  /**
   * Passes the pending text on to the sink. Emptied before the call, so that a sink that throws
   * is not handed the same text again by the `flush` after the error.
   */
  flush(): void {
    const text = this.text;
    if (this.sink === null || text.length === 0) return;
    this.text = "";
    this.sink.write(text);
  }

  /** The whole text, without a sink. */
  toString(): string {
    return this.text;
  }
}

/**
 * @internal Writes the text of `body` to `sink`, as Java's `write(Appendable)` does: in chunks,
 * and what was produced before an error is passed on before the error propagates.
 */
export function writeTo(sink: TextSink, body: (out: Output) => void): void {
  const out = new Output(sink);
  try {
    body(out);
  } finally {
    out.flush();
  }
}

/** @internal Returns the text of `body`, as Java's `writeToString` does. */
export function writeToString(body: (out: Output) => void): string {
  const out = new Output(null);
  body(out);
  return out.toString();
}
