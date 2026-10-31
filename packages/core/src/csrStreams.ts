import { ArrayLimits } from "./arrayLimits.js";

// The binary format of Graph.writeTo and Graph.readFrom, whose documentation is its
// specification. It handles the bare arrays, not Graph, so that Graph and it do not depend on each
// other.

const HEADER_BYTES = 8;

/** Ints per block where the platform is big-endian: the 64 KiB of Java's buffer. */
const CHUNK_INTS = 1 << 14;

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * Where {@link Graph.writeTo} puts the bytes of a graph: anything with a `write(chunk)` method that
 * takes a `Uint8Array`. That is a Node.js `Writable` such as a file stream, a
 * `WritableStreamDefaultWriter`, or a collector of one's own. It is the counterpart of Java's
 * `OutputStream`.
 *
 * The graph passes its bytes in a few chunks and ignores what `write` returns: a Node.js stream
 * buffers past its high-water mark, and the promise of a stream writer is not awaited. A chunk is
 * never changed after it is passed, so the sink may keep it instead of copying it. On a
 * little-endian platform, the chunks after the header are views of the graph's own arrays, which
 * the sink must not change. A `write` that throws ends the writing with its error.
 *
 * Only a `write` that throws fails the call, as Java's `IOException` does. A Node.js stream reports
 * its errors through its `'error'` event, and a `WritableStreamDefaultWriter` through its promises
 * (`writer.closed`, `writer.close()`), after the call has returned. The caller must watch these, as
 * Node.js otherwise ends the process on such an error. For an error that fails the call itself, use
 * a sink that writes synchronously, such as one that calls `fs.writeSync`.
 */
export interface ByteSink {
  /** Takes the next bytes. */
  write(chunk: Uint8Array): unknown;
}

/** @internal The arrays of a graph as read, not yet checked. */
export interface CsrArrays {
  readonly outAdjacencyStart: Int32Array;
  readonly outAdjacency: Int32Array;
}

/** @internal Writes the header and the two arrays. */
export function writeCsr(outAdjacencyStart: Int32Array, outAdjacency: Int32Array, out: ByteSink): void {
  const header = new Uint8Array(HEADER_BYTES);
  const view = new DataView(header.buffer);
  view.setInt32(0, outAdjacencyStart.length - 1, true);
  view.setInt32(4, outAdjacency.length, true);
  out.write(header);
  writeInts(outAdjacencyStart, out);
  writeInts(outAdjacency, out);
}

/**
 * @internal Reads the arrays of the graph at the start of `bytes`, not yet checked:
 *     `Graph.readFrom`
 * checks them as it builds the graph.
 *
 * @throws Error if the data ends before the graph does, or a count in the header is negative or
 *     larger than a graph can have
 */
export function readCsr(bytes: Uint8Array): CsrArrays {
  requireBytes(bytes, HEADER_BYTES);
  const header = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  const nodeCount = header.getInt32(0, true);
  const edgeCount = header.getInt32(4, true);
  if (
    nodeCount < 0 ||
    nodeCount > ArrayLimits.MAX_NODE_COUNT ||
    edgeCount < 0 ||
    edgeCount > ArrayLimits.MAX_ARRAY_LENGTH
  ) {
    throw new Error(`invalid header: nodeCount ${nodeCount}, edgeCount ${edgeCount}`);
  }
  // Checked before any allocation: a header may announce more than the data holds.
  const adjacencyOffset = HEADER_BYTES + 4 * (nodeCount + 1);
  requireBytes(bytes, adjacencyOffset + 4 * edgeCount);
  return {
    outAdjacencyStart: readInts(bytes, HEADER_BYTES, nodeCount + 1),
    outAdjacency: readInts(bytes, adjacencyOffset, edgeCount),
  };
}

/** Views of the array where the platform is little-endian, little-endian copies in blocks otherwise. */
function writeInts(values: Int32Array, out: ByteSink): void {
  if (values.length === 0) return;
  if (LITTLE_ENDIAN) {
    out.write(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
    return;
  }
  for (let from = 0; from < values.length; from += CHUNK_INTS) {
    const count = Math.min(CHUNK_INTS, values.length - from);
    const chunk = new Uint8Array(4 * count);
    const view = new DataView(chunk.buffer);
    for (let i = 0; i < count; i++) view.setInt32(4 * i, values[from + i], true);
    out.write(chunk);
  }
}

/** `count` little-endian ints from `offset`: a view where possible, a copy otherwise. */
function readInts(bytes: Uint8Array, offset: number, count: number): Int32Array {
  const at = bytes.byteOffset + offset;
  if (LITTLE_ENDIAN && at % 4 === 0) return new Int32Array(bytes.buffer, at, count);
  const values = new Int32Array(count);
  const view = new DataView(bytes.buffer, at, 4 * count);
  for (let i = 0; i < count; i++) values[i] = view.getInt32(4 * i, true);
  return values;
}

/** Java's `EOFException`: the data ends before `length` bytes. */
function requireBytes(bytes: Uint8Array, length: number): void {
  if (bytes.length < length) {
    throw new Error(`the data ended inside a graph: ${bytes.length} of ${length} bytes`);
  }
}
