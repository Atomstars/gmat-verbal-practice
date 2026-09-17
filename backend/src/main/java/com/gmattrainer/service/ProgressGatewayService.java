package com.gmattrainer.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.gmattrainer.client.ProgressServiceClient;
import com.gmattrainer.security.CurrentUser;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ProgressGatewayService {
    private final ProgressServiceClient client;

    public ProgressGatewayService(ProgressServiceClient client) {
        this.client = client;
    }

    public Map<String,Object> read(CurrentUser user) {
        return client.read(user.id());
    }

    public Map<String,Object> migrate(CurrentUser user, JsonNode legacy) {
        return client.migrate(user.id(), legacy);
    }

    public Map<String,Object> history(CurrentUser user, List<String> types, int limit) {
        return client.history(user.id(), types, limit);
    }
}
