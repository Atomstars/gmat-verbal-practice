package com.gmattrainer.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.enums.IntegrationEventType;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Writes integration events inside the caller's existing database transaction. */
@Service
public class OutboxEventPublisher {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public OutboxEventPublisher(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc; this.json = json;
    }

    public UUID publish(IntegrationEventType type, String aggregateType, String aggregateId, Object payload) {
        UUID eventId = UUID.randomUUID();
        try {
            jdbc.update("""
                insert into integration_outbox(id,event_type,aggregate_type,aggregate_id,payload)
                values (?,?,?,?,cast(? as jsonb))
                """, eventId, type.name(), aggregateType, aggregateId, json.writeValueAsString(payload));
            return eventId;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Integration event could not be serialized", exception);
        }
    }
}
