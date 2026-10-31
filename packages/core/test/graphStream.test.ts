import { describe, expect, it } from "vitest";
import { BiAdjacentGraph, type ByteSink, Csr, Graph } from "../src/index.js";
import { expectArgumentError, ints } from "./testutils/assertions.js";
import { RandomGraphs } from "./testutils/randomGraphs.js";
import { TestGraphs } from "./testutils/testGraphs.js";

/**
 * Java's `writeTo` and `readFrom` take an `OutputStream` and an `InputStream`; here `writeTo` takes
 * a {@link ByteSink} and `readFrom` the bytes. The stream-specific cases map onto bytes: reading
 * one graph from the start of longer data leaves the rest for the caller, and truncated data fails
 * like a stream that ends early (Java's `EOFException`).
 */
describe("GraphStreamTest", () => {
  /** A sink that collects the chunks, as Java's `ByteArrayOutputStream`. */
  class Collector implements ByteSink {
    readonly chunks: Uint8Array[] = [];
    closed = false;

    write(chunk: Uint8Array): void {
      this.chunks.push(chunk);
    }

    end(): void {
      this.closed = true;
    }

    bytes(): Uint8Array {
      const bytes = new Uint8Array(this.chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      for (const chunk of this.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    }
  }

  function bytesOf(graph: Graph): Uint8Array {
    const out = new Collector();
    graph.writeTo(out);
    return out.bytes();
  }

  const readBack = (bytes: Uint8Array) => Graph.readFrom(bytes);
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  /** The 8 header bytes of a graph with the given counts, and nothing after them. */
  function header(nodeCount: number, edgeCount: number): Uint8Array {
    const bytes = new Uint8Array(8);
    view(bytes).setInt32(0, nodeCount, true);
    view(bytes).setInt32(4, edgeCount, true);
    return bytes;
  }

  function expectSameTopology(actual: Graph, expected: Graph): void {
    expect(ints(Csr.outAdjacencyStart(actual))).toEqual(ints(Csr.outAdjacencyStart(expected)));
    expect(ints(Csr.outAdjacency(actual))).toEqual(ints(Csr.outAdjacency(expected)));
  }

  function errorOf(action: () => unknown): Error {
    try {
      action();
    } catch (e) {
      return e as Error;
    }
    throw new Error("expected an error, but none was thrown");
  }

  it("round-trips random graphs", () => {
    for (let seed = 0; seed < 20; seed++) {
      const graph = RandomGraphs.gnp(60, 0.07, seed);
      expectSameTopology(readBack(bytesOf(graph)), graph);
    }
  });

  it("round-trips the empty graph", () => {
    const read = readBack(bytesOf(TestGraphs.empty()));

    expect(read.nodeCount).toBe(0);
    expect(read.edgeCount).toBe(0);
  });

  it("round-trips arrays larger than one buffer", () => {
    const graph = RandomGraphs.gnm(40_000, 100_000, 7);
    expectSameTopology(readBack(bytesOf(graph)), graph);
  });

  it("round-trips arrays at the buffer boundaries", () => {
    const chunk = 1 << 14;
    for (const count of [chunk - 1, chunk, chunk + 1, 2 * chunk, 2 * chunk + 1]) {
      const edges = TestGraphs.path(count + 1);
      expect(edges.edgeCount).toBe(count);
      expectSameTopology(readBack(bytesOf(edges)), edges);

      const offsets = TestGraphs.isolated(count - 1);
      expectSameTopology(readBack(bytesOf(offsets)), offsets);
    }
  });

  it("writes the documented layout", () => {
    const graph = TestGraphs.of(3, 0, 1, 0, 2, 2, 0);

    // prettier-ignore
    expect(Array.from(bytesOf(graph))).toEqual([
      3, 0, 0, 0, // nodeCount
      3, 0, 0, 0, // edgeCount
      0, 0, 0, 0, // outAdjacencyStart
      2, 0, 0, 0,
      2, 0, 0, 0,
      3, 0, 0, 0,
      1, 0, 0, 0, // outAdjacency
      2, 0, 0, 0,
      0, 0, 0, 0,
    ]);
  });

  it("writes little-endian", () => {
    const bytes = bytesOf(TestGraphs.isolated(0x0102));

    expect(Array.from(bytes.subarray(0, 8))).toEqual([0x02, 0x01, 0, 0, 0, 0, 0, 0]);
  });

  it("a BiAdjacentGraph is written as its out-adjacency", () => {
    const graph = RandomGraphs.gnp(30, 0.1, 3);

    expect(ints(bytesOf(BiAdjacentGraph.of(graph)))).toEqual(ints(bytesOf(graph)));
  });

  it("a BiAdjacentGraph is read back as a Graph", () => {
    const written = BiAdjacentGraph.of(RandomGraphs.gnp(30, 0.1, 3));

    const read = readBack(bytesOf(written));

    expect(read.constructor).toBe(Graph);
    expectSameTopology(read, written);
  });

  it("readFrom called on BiAdjacentGraph returns a Graph", () => {
    const written = BiAdjacentGraph.of(RandomGraphs.gnp(30, 0.1, 3));

    // The static method that BiAdjacentGraph inherits from Graph.
    const read: Graph = BiAdjacentGraph.readFrom(bytesOf(written));

    expect(read.constructor).toBe(Graph);
    expectSameTopology(read, written);
  });

  it("reads exactly one graph and leaves the rest", () => {
    const out = new Collector();
    const first = TestGraphs.path(4);
    const second = TestGraphs.cycle(3);
    first.writeTo(out);
    second.writeTo(out);
    out.write(Uint8Array.of(42));
    const all = out.bytes();

    const read = Graph.readFrom(all);
    expectSameTopology(read, first);
    // The data after a graph begins at 8 + 4 x (nodeCount + 1 + edgeCount).
    const length = 8 + 4 * (read.nodeCount + 1 + read.edgeCount);
    const readSecond = Graph.readFrom(all.subarray(length));
    expectSameTopology(readSecond, second);
    expect(all[length + 8 + 4 * (readSecond.nodeCount + 1 + readSecond.edgeCount)]).toBe(42);
  });

  it("rejects counts outside their range", () => {
    const cases = [
      [0, -1],
      [0, -5],
      [0, 0x7fffffff],
      [4, -1],
      [4, -0x80000000],
    ];
    for (const [offset, value] of cases) {
      const bytes = bytesOf(TestGraphs.path(3));
      view(bytes).setInt32(offset, value, true);

      expectArgumentError(() => readBack(bytes), "invalid header");
    }
  });

  it("rejects counts beyond the largest array from the header alone", () => {
    // Data of the header only: a count the layout allows passes the header and then meets the end
    // of the data; one beyond the largest array is rejected as an invalid header.
    const nodeLimit = 0x7fffffff - 9;
    const edgeLimit = 0x7fffffff - 8;
    expectArgumentError(() => readBack(header(nodeLimit, 0)), "ended inside a graph");
    expectArgumentError(() => readBack(header(0, edgeLimit)), "ended inside a graph");
    for (const [nodeCount, edgeCount] of [
      [nodeLimit + 1, 0],
      [0x7fffffff - 1, 0],
      [0, edgeLimit + 1],
    ]) {
      expectArgumentError(() => readBack(header(nodeCount, edgeCount)), "invalid header");
    }
  });

  it("rejects truncated data", () => {
    const bytes = bytesOf(TestGraphs.path(5));

    for (const length of [0, 3, 7, 8, 12, bytes.length - 1]) {
      expectArgumentError(() => readBack(bytes.slice(0, length)), /^the data ended inside a graph: \d+ of \d+ bytes$/);
    }
  });

  it("a huge announced size fails at the end of the data, not with an allocation", () => {
    // The largest node count and edge count the header allows.
    for (const [field, count] of [
      [0, 0x7fffffff - 9],
      [4, 0x7fffffff - 8],
    ]) {
      const bytes = bytesOf(TestGraphs.path(3));
      view(bytes).setInt32(field, count, true);

      // An attempt to allocate the announced arrays would fail with a RangeError of the engine.
      expectArgumentError(() => readBack(bytes), "ended inside a graph");
    }
  });

  it("rejects arrays that do not form a graph", () => {
    const bytes = bytesOf(TestGraphs.of(2, 0, 1));
    // The only target, at byte 8 + 4 x 3, points past the last node.
    view(bytes).setInt32(8 + 12, 5, true);

    const error = errorOf(() => readBack(bytes));
    expect(error.constructor).toBe(Error);
    expect(error.message).toContain("valid graph");
    expect(error.cause).toBeInstanceOf(RangeError);
  });

  it("rejects an edge count that disagrees with the offsets", () => {
    // path(3) has the offsets 0, 1, 2, 2; announce and send one edge instead of two.
    const bytes = bytesOf(TestGraphs.path(3));
    const shortened = bytes.slice(0, bytes.length - 4);
    view(shortened).setInt32(4, 1, true);

    const error = errorOf(() => readBack(shortened));
    expect(error.constructor).toBe(Error);
    expect((error.cause as Error).constructor).toBe(Error);
  });

  it("rejects unsorted lists with the cause from Graph.of", () => {
    const bytes = bytesOf(TestGraphs.of(3, 0, 1, 0, 2));
    // Swap the two targets of node 0, at bytes 8 + 4 x 4 and 8 + 4 x 5.
    view(bytes).setInt32(24, 2, true);
    view(bytes).setInt32(28, 1, true);

    const error = errorOf(() => readBack(bytes));
    expect(error.constructor).toBe(Error);
    expect((error.cause as Error).constructor).toBe(Error);
  });

  it("does not close the sink", () => {
    const out = new Collector();
    TestGraphs.path(3).writeTo(out);

    expect(out.closed).toBe(false);
  });

  it("passes an error of the sink on", () => {
    const failing: ByteSink = {
      write() {
        throw new Error("disk full");
      },
    };

    expectArgumentError(() => TestGraphs.path(3).writeTo(failing), "disk full");
  });

  it("never changes a chunk after passing it", () => {
    const graph = RandomGraphs.gnm(40_000, 100_000, 11);
    const out = new Collector();
    graph.writeTo(out);
    const copies = out.chunks.map((chunk) => chunk.slice());

    expect(out.chunks.length).toBeGreaterThan(1);
    out.chunks.forEach((chunk, i) => expect(ints(chunk)).toEqual(ints(copies[i])));
  });

  it("does not modify the bytes it reads", () => {
    const bytes = bytesOf(TestGraphs.cycle(4));
    const copy = bytes.slice();

    readBack(bytes);

    expect(ints(bytes)).toEqual(ints(copy));
  });

  it("reads unaligned input into copies", () => {
    const graph = RandomGraphs.gnp(20, 0.2, 5);
    const bytes = bytesOf(graph);
    const unaligned = new Uint8Array(bytes.length + 1);
    unaligned.set(bytes, 1);

    const read = readBack(unaligned.subarray(1));

    expectSameTopology(read, graph);
    expect(Csr.outAdjacency(read).buffer).not.toBe(unaligned.buffer);
  });

  it("views aligned little-endian input instead of copying it", () => {
    const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const bytes = bytesOf(TestGraphs.path(5));

    const read = readBack(bytes);

    if (littleEndian) {
      expect(Csr.outAdjacencyStart(read).buffer).toBe(bytes.buffer);
      expect(Csr.outAdjacency(read).buffer).toBe(bytes.buffer);
    }
    expectSameTopology(read, TestGraphs.path(5));
  });

  it("writes views of the graph's own arrays on a little-endian platform", () => {
    const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const graph = TestGraphs.path(5);
    const out = new Collector();

    graph.writeTo(out);

    expect(out.chunks.map((chunk) => chunk.length)).toEqual([8, 4 * 6, 4 * 4]);
    if (littleEndian) {
      expect(out.chunks[1].buffer).toBe(Csr.outAdjacencyStart(graph).buffer);
      expect(out.chunks[2].buffer).toBe(Csr.outAdjacency(graph).buffer);
    }
  });
});
