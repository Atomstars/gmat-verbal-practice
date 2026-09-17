package com.gmattrainer.progressservice.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.gmattrainer.progressservice.dto.OutboxEvent;
import com.gmattrainer.progressservice.repository.OutboxRepository;
import com.gmattrainer.progressservice.repository.ProgressRepository;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OutboxEventHandlerTest {
    @Test
    void appliesEachAnswerEventAndMarksItProcessed() {
        OutboxRepository outbox = mock(OutboxRepository.class);
        ProgressRepository progress = mock(ProgressRepository.class);
        UUID eventId = UUID.randomUUID();
        var event = event(eventId);
        when(outbox.claim(eventId, "ANSWER_SUBMITTED", "question_attempt", event.aggregateId())).thenReturn(true);

        new OutboxEventHandler(outbox, progress, mapper()).handle(event);

        verify(progress).apply(org.mockito.ArgumentMatchers.argThat(answer ->
            answer.userId().toString().equals(event.payload().get("userId").asText()) && answer.correct()));
        verify(outbox).markProcessed(eventId);
    }

    @Test
    void duplicateEventIsAcknowledgedWithoutUpdatingProgressAgain() {
        OutboxRepository outbox = mock(OutboxRepository.class);
        ProgressRepository progress = mock(ProgressRepository.class);
        UUID eventId = UUID.randomUUID();
        var event = event(eventId);
        when(outbox.claim(eventId, "ANSWER_SUBMITTED", "question_attempt", event.aggregateId())).thenReturn(false);

        new OutboxEventHandler(outbox, progress, mapper()).handle(event);

        verify(progress, never()).apply(org.mockito.ArgumentMatchers.any());
        verify(outbox).markProcessed(eventId);
    }

    private static OutboxEvent event(UUID eventId) {
        ObjectMapper mapper = mapper();
        UUID attemptId = UUID.randomUUID();
        return new OutboxEvent(eventId, "ANSWER_SUBMITTED", "question_attempt", attemptId.toString(), mapper.valueToTree(Map.of(
            "attemptId", attemptId, "userId", UUID.randomUUID(), "questionId", "q1",
            "selectedAnswer", "B", "correct", true, "timeMs", 1200,
            "attemptedAt", Instant.parse("2026-01-01T00:00:00Z"), "questionType", "CR",
            "questionText", "Which option follows?")));
    }

    private static ObjectMapper mapper() {
        return new ObjectMapper().registerModule(new JavaTimeModule());
    }
}
