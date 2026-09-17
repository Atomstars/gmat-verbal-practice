package com.gmattrainer.progressservice.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

public record OutboxEvent(UUID id, String eventType, String aggregateType, String aggregateId, JsonNode payload) {}
