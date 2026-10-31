import com.kobayami.graphity.Graph;
import com.kobayami.graphity.GraphBuilder;
import com.kobayami.graphity.NodePartition;
import com.kobayami.graphity.dot.DotWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.Supplier;

/**
 * Prints the digest that {@code javaConformance.test.ts} pins: the SHA-256 of the DOT text of
 * 3000 random graphs and configurations, drawn by the same generator with the same calls in the
 * same order as the test. It draws the same values as the generator of the Mermaid package, up to
 * the last value the DOT writer needs. Not part of the build; run it with Java 17 or newer against
 * the released jars of Graphity 3.0.0 and their dependencies, from Maven Central:
 *
 * <pre>
 * CP=graphity-core-3.0.0.jar:graphity-dot-3.0.0.jar:fastutil-8.5.17.jar:jspecify-1.0.0.jar
 * java -cp $CP packages/dot/test/JavaConformance.java
 * </pre>
 */
public class JavaConformance {

  static final String[] FRAGMENTS = {
    "a", "Z", "\"", "\\", "\n", "\r", "\r\n", "&", "&amp;", "\u0000", "#", "%", "%%", ":", ";",
    "<", ">", "`", "direction", "Direction", " ", "\t", "\u3000", "\u00a0", "\ufeff", "\u001c",
    "\u0085", "\u2007", "\uD83D\uDE00", "{", "}", "[", "|", "'"
  };
  static final String[] GRAPH_ATTRIBUTES = {"label", "rankdir", "URL", "xlabel", "Label", "fontname"};
  static final String[] ATTRIBUTES = {
    "label", "shape", "xlabel", "headlabel", "taillabel", "color", "URL", "tooltip", "LABEL"
  };

  record Attributes(List<String[]> entries, boolean removeLabel) {}

  static String text(Random r) {
    var text = new StringBuilder();
    for (int i = 0, k = r.nextInt(5); i < k; i++) {
      text.append(FRAGMENTS[r.nextInt(FRAGMENTS.length)]);
    }
    return text.toString();
  }

  static String nullableText(Random r) {
    return r.nextInt(4) == 0 ? null : text(r);
  }

  static Attributes attributes(Random r) {
    List<String[]> entries = new ArrayList<>();
    for (int i = 0, k = r.nextInt(3); i < k; i++) {
      String name = ATTRIBUTES[r.nextInt(ATTRIBUTES.length)];
      entries.add(new String[] {name, text(r)});
    }
    return new Attributes(entries, r.nextInt(5) == 0);
  }

  static void apply(Attributes attributes, Map<String, String> map) {
    for (String[] entry : attributes.entries()) map.put(entry[0], entry[1]);
    if (attributes.removeLabel()) map.remove("label");
  }

  /** A value per ID, or {@code null} for no hook, with a coin flip first. */
  static <T> List<T> maybe(Random r, int count, Supplier<T> draw) {
    if (!r.nextBoolean()) return null;
    List<T> values = new ArrayList<>();
    for (int i = 0; i < count; i++) values.add(draw.get());
    return values;
  }

  static String writeCase(int seed) {
    var r = new Random(seed);
    int n = r.nextInt(10);
    var builder = new GraphBuilder();
    builder.addNodes(n);
    for (int i = 0, m = n == 0 ? 0 : r.nextInt(3 * n + 1); i < m; i++) {
      int source = r.nextInt(n);
      builder.addEdge(source, r.nextInt(n));
    }
    Graph graph = builder.build();
    int e = graph.edgeCount();
    boolean undirected = r.nextBoolean();
    List<Boolean> include = maybe(r, n, () -> r.nextInt(4) != 0);
    NodePartition partition = null;
    List<String> clusterLabels = new ArrayList<>();
    if (r.nextBoolean()) {
      int groupCount = r.nextInt(4) + 1;
      int[] groupOf = new int[n];
      for (int v = 0; v < n; v++) groupOf[v] = r.nextInt(groupCount + 1) - 1;
      for (int c = 0; c < groupCount; c++) clusterLabels.add(nullableText(r));
      partition = NodePartition.of(graph, groupOf, groupCount);
    }
    List<String> nodeLabels = maybe(r, n, () -> nullableText(r));
    List<String> edgeLabels = maybe(r, e, () -> nullableText(r));
    List<String[]> graphAttributes = new ArrayList<>();
    for (int i = 0, k = r.nextInt(3); i < k; i++) {
      String name = GRAPH_ATTRIBUTES[r.nextInt(GRAPH_ATTRIBUTES.length)];
      graphAttributes.add(new String[] {name, text(r)});
    }
    List<Attributes> nodeAttributes = maybe(r, n, () -> attributes(r));
    List<Attributes> edgeAttributes = maybe(r, e, () -> attributes(r));

    var dot = DotWriter.of(graph);
    if (undirected) dot.undirected();
    if (include != null) dot.nodeFilter(include::get);
    if (partition != null) dot.clusters(partition, clusterLabels::get);
    if (nodeLabels != null) dot.nodeLabel(nodeLabels::get);
    if (edgeLabels != null) dot.edgeLabel(edgeLabels::get);
    for (String[] entry : graphAttributes) dot.graphAttribute(entry[0], entry[1]);
    if (nodeAttributes != null) dot.nodeAttributes((v, map) -> apply(nodeAttributes.get(v), map));
    if (edgeAttributes != null) dot.edgeAttributes((i, map) -> apply(edgeAttributes.get(i), map));
    return "=== " + seed + "\n" + dot.writeToString();
  }

  public static void main(String[] args) throws Exception {
    var digest = MessageDigest.getInstance("SHA-256");
    for (int seed = 0; seed < 3000; seed++) {
      digest.update(writeCase(seed).getBytes(StandardCharsets.UTF_8));
    }
    System.out.println(HexFormat.of().formatHex(digest.digest()));
  }
}
