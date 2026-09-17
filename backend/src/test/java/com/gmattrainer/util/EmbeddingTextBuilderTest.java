package com.gmattrainer.util;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class EmbeddingTextBuilderTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void preservesPythonFieldOrderAndChoiceText() throws Exception {
        var question = json.readTree("""
            {"title":"Title","question":"Stem","diagram_description":"Diagram",
             "passage":"Passage","options":[{"label":"A","text":"One"},{"label":"B","text":"Two"}]}
            """);
        assertThat(EmbeddingTextBuilder.from(question))
            .isEqualTo("Title Stem Diagram Passage One Two");
    }

    @Test
    void capsTheFinalEmbeddingInputAtOneThousandCharacters() throws Exception {
        var question = json.createObjectNode().put("title", "x".repeat(1200));
        assertThat(EmbeddingTextBuilder.from(question)).hasSize(1000);
    }
}
