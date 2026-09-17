package com.gmattrainer.rag.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.gmattrainer.rag.dto.RagDtos;
import com.gmattrainer.rag.repository.KnowledgeRetriever;
import java.util.List;
import org.junit.jupiter.api.Test;

class PromptBuilderTest {
    private final PromptBuilder prompts = new PromptBuilder();

    @Test void unansweredQuestionNeverContainsProtectedAnswer() {
        var context = new RagDtos.QuestionContext("q1", "CR", null, "What follows?",
            List.of(new RagDtos.QuestionOption("A", "First")), false, null, null);
        String prompt = prompts.question(context);
        assertThat(prompt).contains("has NOT submitted", "Never reveal").doesNotContain("OFFICIAL ANSWER:");
    }
    @Test void teacherPromptLabelsRetrievedSources() {
        var chunk = new KnowledgeRetriever.Chunk("q1", "Rates", "trusted explanation", "og:q1", .7, .2, .61);
        assertThat(prompts.teacher(List.of(chunk))).contains("trusted explanation", "label=\"og:q1\"", "Use only");
    }
}
