package com.gmattrainer.dto;

import com.fasterxml.jackson.databind.JsonNode;

public final class ProgressDtos {
    private ProgressDtos() {}

    public record MigrationRequest(JsonNode legacy) {}
}
