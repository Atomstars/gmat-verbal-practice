package com.gmattrainer.util;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;

/** Exact field order and truncation policy used by the Python embedding pipeline. */
public final class EmbeddingTextBuilder {
    private EmbeddingTextBuilder() {}
    public static String from(JsonNode question) {
        var parts = new ArrayList<String>();
        add(parts, question.path("title").asText(""), Integer.MAX_VALUE);
        add(parts, question.path("question").asText(""), Integer.MAX_VALUE);
        add(parts, question.path("diagram_description").asText(""), 300);
        add(parts, question.path("passage").asText(""), 500);
        var choices = new StringBuilder();
        question.path("options").forEach(option -> {
            if (!choices.isEmpty()) choices.append(' ');
            choices.append(option.path("text").asText(""));
        });
        add(parts, choices.toString(), 300);
        String result = String.join(" ", parts);
        return result.substring(0, Math.min(1000, result.length()));
    }
    private static void add(ArrayList<String> parts, String value, int limit) {
        if (!value.isEmpty()) parts.add(value.substring(0, Math.min(limit, value.length())));
    }
}
