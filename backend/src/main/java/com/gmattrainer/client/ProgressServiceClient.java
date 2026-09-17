package com.gmattrainer.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.exception.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class ProgressServiceClient {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private final URI baseUri;
    private final String internalToken;
    private final ObjectMapper json;
    private final HttpClient http;

    public ProgressServiceClient(@Value("${app.progress.base-url}") String baseUrl,
                                 @Value("${app.progress.internal-token}") String internalToken,
                                 ObjectMapper json) {
        this.baseUri = URI.create(baseUrl.replaceAll("/$", ""));
        this.internalToken = internalToken;
        this.json = json;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    }

    public Map<String,Object> read(UUID userId) {
        return send(request(path(userId, "/progress")).GET().build());
    }

    public Map<String,Object> migrate(UUID userId, JsonNode legacy) {
        var body = new LinkedHashMap<String,Object>();
        body.put("legacy", legacy);
        return send(request(path(userId, "/progress/migrations"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(write(body))).build());
    }

    public Map<String,Object> history(UUID userId, List<String> types, int limit) {
        String query = "?types=" + encode(String.join(",", types)) + "&limit=" + limit;
        return send(request(path(userId, "/history") + query).GET().build());
    }

    private Map<String,Object> send(HttpRequest request) {
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "progress_upstream_error",
                    "Progress service returned HTTP " + response.statusCode() + ".");
            }
            return json.readValue(response.body(), new TypeReference<>() {});
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "progress_unavailable",
                "Progress request was interrupted.");
        } catch (IOException | IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "progress_unavailable",
                "Progress service is unavailable.");
        }
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(baseUri.resolve(path)).timeout(REQUEST_TIMEOUT)
            .header("X-Internal-Token", internalToken).header("Accept", "application/json");
    }

    private String path(UUID userId, String suffix) {
        return "/internal/users/" + userId + suffix;
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (IOException exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "serialization_failed",
                "Progress request could not be prepared.");
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
