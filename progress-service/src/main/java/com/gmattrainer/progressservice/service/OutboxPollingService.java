package com.gmattrainer.progressservice.service;

import com.gmattrainer.progressservice.repository.OutboxRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OutboxPollingService {
    private static final Logger LOG=LoggerFactory.getLogger(OutboxPollingService.class);
    private final OutboxRepository outbox;
    private final OutboxEventHandler handler;
    private final int batchSize;
    public OutboxPollingService(OutboxRepository outbox,OutboxEventHandler handler,
                                @Value("${app.outbox.batch-size}") int batchSize){
        this.outbox=outbox;this.handler=handler;this.batchSize=batchSize;
    }
    @Scheduled(fixedDelayString="${app.outbox.poll-delay-ms}",initialDelayString="${app.outbox.poll-delay-ms}")
    public void poll(){
        for(var event:outbox.pending(batchSize)){
            try{handler.handle(event);}
            catch(Exception exception){
                LOG.error("Progress event failed: eventId={}, type={}",event.id(),event.eventType(),exception);
                outbox.recordFailure(event.id(),exception.getMessage());
            }
        }
    }
}
