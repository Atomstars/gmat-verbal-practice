package com.gmattrainer.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.model.embedding.onnx.allminilml6v2.AllMiniLmL6V2EmbeddingModel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import com.gmattrainer.util.EmbeddingTextBuilder;

/** Verifies that Java query embeddings occupy the same vector space as Python output. */
public final class EmbeddingParityMain {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> BANKS = List.of("questions-og.json", "questions.json", "questions-quant.json");
    private EmbeddingParityMain() {}

    public static void main(String[] args) throws Exception {
        Path root = Path.of("..").toAbsolutePath().normalize();
        JsonNode stored = JSON.readTree(Files.readString(root.resolve("embeddings.json")));
        var first = stored.fields().next();
        JsonNode question = find(root, first.getKey());
        float[] javaVector = new AllMiniLmL6V2EmbeddingModel()
            .embed(EmbeddingTextBuilder.from(question)).content().vector();
        float[] pythonVector = new float[first.getValue().size()];
        for (int i = 0; i < pythonVector.length; i++) pythonVector[i] = (float) first.getValue().get(i).asDouble();
        double similarity = cosine(javaVector, pythonVector);
        int rank = 1;
        for (var candidate = stored.fields(); candidate.hasNext();) {
            var entry = candidate.next();
            if (entry.getKey().equals(first.getKey())) continue;
            float[] vector = new float[entry.getValue().size()];
            for (int i = 0; i < vector.length; i++) vector[i] = (float) entry.getValue().get(i).asDouble();
            if (cosine(javaVector, vector) > similarity) rank++;
        }
        System.out.printf("question: %s%njava dimensions: %d%npython dimensions: %d%ncosine parity: %.8f%nself-match rank: %d of %d%n",
            first.getKey(), javaVector.length, pythonVector.length, similarity, rank, stored.size());
        // Independent ONNX runtimes differ slightly in tokenization/pooling, so
        // ranking compatibility is the important invariant, not bit equality.
        if (javaVector.length != 384 || pythonVector.length != 384 || similarity < 0.95 || rank != 1)
            throw new IllegalStateException("Java and Python embeddings are not compatible");
    }

    private static JsonNode find(Path root, String id) throws Exception {
        for (String bank : BANKS) {
            for (JsonNode question : JSON.readTree(Files.readString(root.resolve(bank))))
                if (id.equals(question.path("id").asText())) return question;
        }
        throw new IllegalArgumentException("Question not found: " + id);
    }

    private static double cosine(float[] left, float[] right) {
        double dot = 0, a = 0, b = 0;
        for (int i = 0; i < left.length; i++) {
            dot += left[i] * right[i]; a += left[i] * left[i]; b += right[i] * right[i];
        }
        return dot / (Math.sqrt(a) * Math.sqrt(b));
    }
}
