package com.gmattrainer.rag.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.rag.dto.RagDtos;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class TutorProviderClient {
    private final URI endpoint;
    private final String apiKey;
    private final String model;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    public TutorProviderClient(@Value("${app.provider.base-url}") String baseUrl,
                               @Value("${app.provider.api-key}") String apiKey,
                               @Value("${app.provider.model}") String model, ObjectMapper json) {
        this.endpoint = URI.create(baseUrl.replaceAll("/$", "") + "/chat/completions");
        this.apiKey = apiKey; this.model = model; this.json = json;
    }

    public boolean configured() { return !apiKey.isBlank(); }
    public String model() { return model; }

    public InputStream open(String systemPrompt, RagDtos.RagRequest request) {
        if (!configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Tutor provider is not configured");
        var messages = new ArrayList<Map<String, String>>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.addAll(boundedHistory(request.messages()));
        var payload = new LinkedHashMap<String, Object>();
        payload.put("model", model); payload.put("messages", messages); payload.put("stream", true);
        payload.put("temperature", request.think() ? 0.7 : 0.25); payload.put("top_p", 0.9);
        payload.put("max_tokens", 1_400);
        payload.put("chat_template_kwargs", Map.of("enable_thinking", request.think()));
        if (request.think()) payload.put("reasoning_budget", 4_096);
        try {
            HttpRequest upstream = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(75))
                .header("Content-Type", "application/json").header("Accept", "text/event-stream")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
            HttpResponse<InputStream> response = http.send(upstream, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                response.body().close();
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Tutor provider returned HTTP " + response.statusCode());
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Tutor request was interrupted", exception);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Tutor provider is unavailable", exception);
        }
    }

    /** Keep recent conversation turns within a predictable prompt budget. */
    private static List<Map<String, String>> boundedHistory(List<RagDtos.Message> source) {
        var reverse = new ArrayList<Map<String, String>>();
        int characters = 0;
        for (int i = source.size() - 1; i >= 0 && reverse.size() < 12; i--) {
            RagDtos.Message message = source.get(i);
            if (characters + message.content().length() > 24_000 && !reverse.isEmpty()) break;
            characters += message.content().length();
            reverse.add(Map.of("role", message.role(), "content", message.content()));
        }
        Collections.reverse(reverse);
        return reverse;
    }
}
