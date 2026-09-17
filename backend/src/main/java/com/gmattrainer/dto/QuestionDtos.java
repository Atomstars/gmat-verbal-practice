package com.gmattrainer.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public final class QuestionDtos {
    private QuestionDtos() {}

    public record Option(String label, String text) {}
    public record StudentQuestion(
        String id, String bank, String type, String chapter, String subtype, String category,
        String difficulty, String title, String passage, String question, List<Option> options,
        String format, String source, Integer number, String diagram,
        @JsonProperty("diagram_description") String diagramDescription,
        @JsonProperty("source_page") Integer sourcePage
    ) {}
    public record CatalogQuestion(String id, String bank, String type, String chapter,
                                  String subtype, String difficulty, String format, Integer number) {}
    public record ProtectedAnswer(String correctAnswer, String explanation) {}
    public record ScoredQuestion(StudentQuestion question, double score) {}
}
