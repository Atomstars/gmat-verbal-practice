package com.gmattrainer.rag.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.gmattrainer.rag.enums.ScopeDecision;
import com.gmattrainer.rag.repository.KnowledgeRetriever;
import java.util.List;
import org.junit.jupiter.api.Test;

class ScopeGuardTest {
    private final ScopeGuard guard = new ScopeGuard(0.28);

    @Test void rejectsClearlyUnrelatedTeacherRequests() {
        assertThat(guard.teacher("Hey, how is the movie?", List.of())).isEqualTo(ScopeDecision.OUT_OF_SCOPE);
    }
    @Test void acceptsRelevantRetrievedGmatMaterial() {
        var chunk = new KnowledgeRetriever.Chunk("x", "Data Sufficiency", "content", "og:x", .52, .2, .46);
        assertThat(guard.teacher("Explain data sufficiency", List.of(chunk))).isEqualTo(ScopeDecision.ALLOW);
    }
    @Test void refusesWhenTrustedContextIsTooWeak() {
        var chunk = new KnowledgeRetriever.Chunk("x", "Unrelated", "content", "og:x", .1, 0, .082);
        assertThat(guard.teacher("Tell me a fact", List.of(chunk))).isEqualTo(ScopeDecision.INSUFFICIENT_CONTEXT);
    }
    @Test void keepsQuestionTutorOnQuestion() {
        assertThat(guard.question("Which movie should I watch?")).isEqualTo(ScopeDecision.OUT_OF_SCOPE);
        assertThat(guard.question("Why is option B tempting?")).isEqualTo(ScopeDecision.ALLOW);
    }
}
