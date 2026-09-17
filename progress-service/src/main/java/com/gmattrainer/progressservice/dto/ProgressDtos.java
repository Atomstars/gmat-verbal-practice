package com.gmattrainer.progressservice.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public final class ProgressDtos {
    private ProgressDtos() {}
    public record MigrationRequest(@NotNull JsonNode legacy) {}
    public record AnswerSubmittedEvent(UUID attemptId, UUID userId, String questionId, String selectedAnswer,
        boolean correct, Integer timeMs, Instant attemptedAt, String questionType, String subtype,
        String chapter, String difficulty, String questionText) {}
}
