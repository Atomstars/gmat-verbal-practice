package com.gmattrainer.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Idempotent Java replacement for the JSON-to-database publishing step. */
public final class ContentMigrationMain {
    private static final ObjectMapper JSON = JsonMapper.builder()
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private static final Set<String> TYPES = Set.of("RC", "CR", "PS", "DS");
    private static final Set<String> LETTERS = Set.of("A", "B", "C", "D", "E");
    private static final Map<String,String> BANKS = Map.of(
        "questions-og.json", "og", "questions.json", "manhattan", "questions-quant.json", "quant");
    private ContentMigrationMain() {}

    public static void main(String[] args) throws Exception {
        boolean dryRun = List.of(args).contains("--dry-run");
        Path root = argument(args, "--root").map(Path::of).orElse(Path.of("..")).toAbsolutePath().normalize();
        var questions = new LinkedHashMap<String,QuestionRow>();
        var errors = new ArrayList<String>();
        int read = 0;
        for (var bank : BANKS.entrySet()) {
            JsonNode records = JSON.readTree(Files.readString(root.resolve(bank.getKey())));
            if (!records.isArray()) throw new IllegalArgumentException(bank.getKey() + " is not an array");
            read += records.size();
            for (JsonNode raw : records) {
                try {
                    QuestionRow row = validate(raw, bank.getValue(), bank.getKey());
                    QuestionRow previous = questions.putIfAbsent(row.id(), row);
                    if (previous != null) errors.add(row.id() +
                        (previous.raw().equals(row.raw()) ? ": duplicate ID" : ": conflicting duplicate ID"));
                } catch (IllegalArgumentException exception) { errors.add(exception.getMessage()); }
            }
        }
        JsonNode vectorJson = JSON.readTree(Files.readString(root.resolve("embeddings.json")));
        if (!vectorJson.isObject()) throw new IllegalArgumentException("embeddings.json is not an object");
        var vectors = new LinkedHashMap<String,float[]>();
        vectorJson.fields().forEachRemaining(entry -> {
            try {
                if (!questions.containsKey(entry.getKey())) throw new IllegalArgumentException(entry.getKey() + ": vector has no question");
                JsonNode value = entry.getValue();
                if (!value.isArray() || value.size() != 384) throw new IllegalArgumentException(entry.getKey() + ": vector dimension is not 384");
                float[] vector = new float[384];
                for (int i = 0; i < 384; i++) {
                    vector[i] = (float) value.get(i).asDouble(Double.NaN);
                    if (!Float.isFinite(vector[i])) throw new IllegalArgumentException(entry.getKey() + ": vector contains a non-finite value");
                }
                vectors.put(entry.getKey(), vector);
            } catch (IllegalArgumentException exception) { errors.add(exception.getMessage()); }
        });
        questions.keySet().stream().filter(id -> !vectors.containsKey(id))
            .forEach(id -> errors.add(id + ": question has no vector"));
        errors.stream().limit(50).forEach(message -> System.err.println("error: " + message));
        int importedQuestions = 0, importedVectors = 0;
        if (errors.isEmpty() && !dryRun) {
            String url = required("DATABASE_URL"), username = System.getenv().getOrDefault("DATABASE_USERNAME", "");
            String password = System.getenv().getOrDefault("DATABASE_PASSWORD", "");
            try (Connection connection = DriverManager.getConnection(url, username, password)) {
                connection.setAutoCommit(false);
                try {
                    publishQuestions(connection, questions.values()); importedQuestions = questions.size();
                    publishVectors(connection, vectors); importedVectors = vectors.size();
                    connection.commit();
                } catch (Exception exception) {
                    connection.rollback();
                    throw exception;
                }
            }
        }
        System.out.println("questions read: " + read);
        System.out.println("questions imported: " + importedQuestions);
        System.out.println("vectors imported: " + importedVectors);
        System.out.println("skipped records: " + errors.size());
        System.out.println("errors: " + errors.size());
        if (dryRun && errors.isEmpty()) System.out.printf("dry run valid: %d questions and %d vectors ready%n", questions.size(), vectors.size());
        if (!errors.isEmpty()) System.exit(1);
    }

    private static QuestionRow validate(JsonNode raw, String bank, String file) {
        raw = stripNullBytes(raw);
        String id = text(raw, "id"), type = text(raw, "type"), question = text(raw, "question");
        if (id.isBlank() || id.length() > 200) throw new IllegalArgumentException(file + ": invalid ID");
        if (!TYPES.contains(type)) throw new IllegalArgumentException(id + ": invalid type");
        if (question.isBlank()) throw new IllegalArgumentException(id + ": missing question");
        JsonNode options = raw.path("options");
        if (!options.isArray()) throw new IllegalArgumentException(id + ": options are not an array");
        var labels = new java.util.HashSet<String>();
        for (JsonNode option : options) {
            String label = text(option, "label");
            if (!LETTERS.contains(label) || !option.path("text").isTextual() || !labels.add(label))
                throw new IllegalArgumentException(id + ": malformed options");
        }
        String answer = nullableText(raw, "correct_answer");
        if (answer != null && !LETTERS.contains(answer)) throw new IllegalArgumentException(id + ": invalid answer");
        boolean answerPresent = answer == null || labels.contains(answer);
        boolean review = raw.path("needs_review").asBoolean(false) || !answerPresent;
        boolean published = answer != null && answerPresent && !options.isEmpty() && !"open_ended".equals(raw.path("format").asText());
        return new QuestionRow(id, bank, type, raw, review, published);
    }

    private static void publishQuestions(Connection connection, Iterable<QuestionRow> rows) throws Exception {
        String sql = """
            insert into questions(id,bank,type,subtype,chapter,category,difficulty,title,passage,question,options,format,
              diagram,diagram_description,correct_answer,official_explanation,source,source_page,number,needs_review,active,published,updated_at)
            values (?,?,?,?,?,?,?,?,?,?,cast(? as jsonb),?,?,?,?,?,?,?,?,?,true,?,now()) on conflict(id) do update set
              bank=excluded.bank,type=excluded.type,subtype=excluded.subtype,chapter=excluded.chapter,category=excluded.category,
              difficulty=excluded.difficulty,title=excluded.title,passage=excluded.passage,question=excluded.question,options=excluded.options,
              format=excluded.format,diagram=excluded.diagram,diagram_description=excluded.diagram_description,
              correct_answer=excluded.correct_answer,official_explanation=excluded.official_explanation,source=excluded.source,
              source_page=excluded.source_page,number=excluded.number,needs_review=excluded.needs_review,published=excluded.published,updated_at=now()
            """;
        try (var statement = connection.prepareStatement(sql)) {
            for (QuestionRow row : rows) {
                JsonNode q = row.raw(); int i = 1;
                statement.setString(i++, row.id()); statement.setString(i++, row.bank()); statement.setString(i++, row.type());
                for (String field : List.of("subtype","chapter","category","difficulty","title","passage")) statement.setString(i++, nullableText(q, field));
                statement.setString(i++, text(q, "question")); statement.setString(i++, q.path("options").toString());
                statement.setString(i++, q.path("format").asText("multiple_choice"));
                for (String field : List.of("diagram","diagram_description","correct_answer","explanation","source")) statement.setString(i++, nullableText(q, field));
                setInteger(statement, i++, q.get("source_page")); setInteger(statement, i++, q.get("number"));
                statement.setBoolean(i++, row.needsReview()); statement.setBoolean(i, row.published()); statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private static void publishVectors(Connection connection, Map<String,float[]> vectors) throws Exception {
        try (var statement = connection.prepareStatement("""
            insert into question_embeddings(question_id,embedding,model,model_version,updated_at)
            values (?,cast(? as vector),'sentence-transformers/all-MiniLM-L6-v2','1',now())
            on conflict(question_id) do update set embedding=excluded.embedding,model=excluded.model,model_version=excluded.model_version,updated_at=now()
            """)) {
            for (var entry : vectors.entrySet()) {
                statement.setString(1, entry.getKey()); statement.setString(2, vectorLiteral(entry.getValue())); statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private static String vectorLiteral(float[] vector) {
        var out = new StringBuilder("[");
        for (int i=0;i<vector.length;i++) { if (i>0) out.append(','); out.append(vector[i]); }
        return out.append(']').toString();
    }
    private static void setInteger(java.sql.PreparedStatement s, int i, JsonNode n) throws Exception {
        if (n == null || n.isNull()) s.setObject(i, null); else s.setInt(i, n.asInt());
    }
    private static String text(JsonNode node, String field) { return node.path(field).asText(""); }
    private static String nullableText(JsonNode node, String field) {
        JsonNode value = node.get(field); return value == null || value.isNull() ? null : value.asText();
    }
    static JsonNode stripNullBytes(JsonNode node) {
        if (node.isTextual()) return TextNode.valueOf(node.textValue().replace("\u0000", ""));
        if (node.isArray()) {
            ArrayNode clean = JSON.createArrayNode();
            node.forEach(child -> clean.add(stripNullBytes(child)));
            return clean;
        }
        if (node.isObject()) {
            ObjectNode clean = JSON.createObjectNode();
            node.fields().forEachRemaining(entry -> clean.set(entry.getKey(), stripNullBytes(entry.getValue())));
            return clean;
        }
        return node.deepCopy();
    }
    private static String required(String name) {
        String value = System.getenv(name); if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required"); return value;
    }
    private static java.util.Optional<String> argument(String[] args, String name) {
        for (int i=0;i<args.length-1;i++) if (args[i].equals(name)) return java.util.Optional.of(args[i+1]);
        return java.util.Optional.empty();
    }
    private record QuestionRow(String id, String bank, String type, JsonNode raw, boolean needsReview, boolean published) {}
}
