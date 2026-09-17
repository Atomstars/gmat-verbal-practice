package com.gmattrainer.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.exception.ApiException;
import com.gmattrainer.dto.TutorDtos;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class TutorGatewayClient {
    private final URI chatUri;
    private final URI healthUri;
    private final String token;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public TutorGatewayClient(@Value("${app.rag.base-url}") String baseUrl,
                              @Value("${app.rag.internal-token}") String token, ObjectMapper json) {
        String base = baseUrl.replaceAll("/$", "");
        this.chatUri = URI.create(base + "/internal/tutor");
        this.healthUri = URI.create(base + "/internal/health");
        this.token = token; this.json = json;
    }

    public Map<String, Object> health() {
        try {
            HttpResponse<String> response = http.send(request(healthUri).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) return unavailable("RAG service returned HTTP " + response.statusCode());
            Map<String, Object> body = json.readValue(response.body(), new TypeReference<>() {});
            var result = new LinkedHashMap<String, Object>();
            result.put("ok", true); result.put("configured", Boolean.TRUE.equals(body.get("configured")));
            result.put("model", String.valueOf(body.getOrDefault("model", ""))); result.put("rag", true);
            result.put("retrieval", body.getOrDefault("retrieval", "unknown"));
            result.put("knowledgeChunks", body.getOrDefault("knowledgeChunks", 0));
            return result;
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            return unavailable("RAG service is unavailable");
        }
    }

    public java.io.InputStream open(TutorDtos.RagRequest payload) {
        final String body;
        try { body = json.writeValueAsString(payload); }
        catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "serialization_failed", "Tutor request could not be prepared.");
        }
        HttpRequest upstream = request(chatUri).timeout(Duration.ofSeconds(75))
            .header("Content-Type", "application/json").header("Accept", "text/event-stream")
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try {
            HttpResponse<java.io.InputStream> response = http.send(upstream, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                response.body().close();
                throw new ApiException(HttpStatus.BAD_GATEWAY, "rag_unavailable",
                    "Tutor RAG service returned HTTP " + response.statusCode() + ".");
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "rag_unavailable", "Tutor request was interrupted.");
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "rag_unavailable", "Tutor RAG service is unavailable.");
        }
    }

    private HttpRequest.Builder request(URI uri) {
        return HttpRequest.newBuilder(uri).header("X-Internal-Token", token);
    }
    private static Map<String, Object> unavailable(String detail) {
        return Map.of("ok", false, "configured", false, "rag", true, "error", detail);
    }
}
