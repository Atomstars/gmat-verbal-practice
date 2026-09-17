package com.gmattrainer.progressservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.progressservice.dto.OutboxEvent;
import com.gmattrainer.progressservice.dto.ProgressDtos.AnswerSubmittedEvent;
import com.gmattrainer.progressservice.enums.IntegrationEventType;
import com.gmattrainer.progressservice.repository.OutboxRepository;
import com.gmattrainer.progressservice.repository.ProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxEventHandler {
    private final OutboxRepository outbox;
    private final ProgressRepository progress;
    private final ObjectMapper json;
    public OutboxEventHandler(OutboxRepository outbox,ProgressRepository progress,ObjectMapper json){
        this.outbox=outbox;this.progress=progress;this.json=json;
    }

    @Transactional
    public void handle(OutboxEvent event){
        IntegrationEventType type=IntegrationEventType.from(event.eventType());
        if(!outbox.claim(event.id(),type.name(),event.aggregateType(),event.aggregateId())){
            outbox.markProcessed(event.id());return;
        }
        if(type==IntegrationEventType.ANSWER_SUBMITTED){
            progress.apply(json.convertValue(event.payload(),AnswerSubmittedEvent.class));
        }
        outbox.markProcessed(event.id());
    }
}
