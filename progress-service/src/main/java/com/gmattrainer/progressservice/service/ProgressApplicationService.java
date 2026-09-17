package com.gmattrainer.progressservice.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.gmattrainer.progressservice.repository.OutboxRepository;
import com.gmattrainer.progressservice.repository.ProgressRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ProgressApplicationService {
    private final ProgressRepository progress;
    private final OutboxRepository outbox;
    public ProgressApplicationService(ProgressRepository progress,OutboxRepository outbox){this.progress=progress;this.outbox=outbox;}
    public Map<String,Object> read(UUID userId){return progress.read(userId);}
    public List<Map<String,Object>> history(UUID userId,List<String> types,int limit){return progress.history(userId,types,limit);}
    public Map<String,Object> migrate(UUID userId,JsonNode legacy){return progress.migrate(userId,legacy);}
    public Map<String,Object> health(){return Map.of("ok",true,"pendingEvents",outbox.pendingCount(),"deadLetterEvents",outbox.deadLetterCount());}
}
