package com.gmattrainer.rag.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.rag.client.TutorProviderClient;
import com.gmattrainer.rag.dto.RagDtos;
import com.gmattrainer.rag.enums.RagMode;
import com.gmattrainer.rag.enums.ScopeDecision;
import com.gmattrainer.rag.repository.KnowledgeRetriever;
import com.gmattrainer.rag.service.PromptBuilder;
import com.gmattrainer.rag.service.ScopeGuard;
import jakarta.validation.Valid;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/internal")
public class RagController {
    private final byte[] internalToken;
    private final KnowledgeRetriever retriever;
    private final ScopeGuard scope;
    private final PromptBuilder prompts;
    private final TutorProviderClient provider;
    private final ObjectMapper json;

    public RagController(@Value("${app.internal-token}") String internalToken, KnowledgeRetriever retriever,
                         ScopeGuard scope, PromptBuilder prompts, TutorProviderClient provider, ObjectMapper json) {
        this.internalToken = internalToken.getBytes(StandardCharsets.UTF_8);
        this.retriever = retriever; this.scope = scope; this.prompts = prompts; this.provider = provider; this.json = json;
    }

    @GetMapping("/health")
    public Map<String, Object> health(@RequestHeader("X-Internal-Token") String token) {
        authorize(token);
        return Map.of("ok", true, "configured", provider.configured(), "model", provider.model(),
            "retrieval", "hybrid-corrective", "knowledgeChunks", retriever.activeChunkCount());
    }

    @PostMapping(value = "/tutor", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> tutor(@RequestHeader("X-Internal-Token") String token,
                                                        @Valid @RequestBody RagDtos.RagRequest request) {
        authorize(token);
        String query = latestUserMessage(request.messages());
        final String prompt;
        if (request.mode() == RagMode.QUESTION) {
            if (request.question() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Question context is required in QUESTION mode");
            if (scope.question(query) == ScopeDecision.OUT_OF_SCOPE)
                return synthetic("I’m here to help with this GMAT question. Ask me about the passage, reasoning, choices, or solving strategy.");
            prompt = prompts.question(request.question());
        } else {
            ScopeDecision precheck = scope.precheckTeacher(query);
            if (precheck == ScopeDecision.GREETING)
                return synthetic("Hi! I’m your GMAT teacher. Ask me about Quant, Verbal, Data Insights, strategy, or a concept you want explained.");
            if (precheck == ScopeDecision.OUT_OF_SCOPE)
                return synthetic("That’s outside my GMAT teaching scope. I can help with GMAT Quant, Verbal, Data Insights, pacing, or study strategy.");
            List<KnowledgeRetriever.Chunk> chunks = retriever.retrieve(query);
            ScopeDecision decision = scope.teacher(query, chunks);
            if (decision == ScopeDecision.INSUFFICIENT_CONTEXT)
                return synthetic("I don’t have enough trusted GMAT material in the knowledge base to answer that reliably. Try asking about a specific GMAT concept or question type.");
            prompt = prompts.teacher(chunks);
        }

        InputStream upstream = provider.open(prompt, request);
        StreamingResponseBody body = output -> {
            try (upstream) { upstream.transferTo(output); }
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .contentType(MediaType.TEXT_EVENT_STREAM).body(body);
    }

    private void authorize(String supplied) {
        if (!MessageDigest.isEqual(internalToken, supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid internal service credential");
    }

    private static String latestUserMessage(List<RagDtos.Message> messages) {
        for (int i = messages.size() - 1; i >= 0; i--)
            if ("user".equals(messages.get(i).role())) return messages.get(i).content();
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A user message is required");
    }

    private ResponseEntity<StreamingResponseBody> synthetic(String text) {
        StreamingResponseBody body = output -> {
            String frame = "data: " + json.writeValueAsString(Map.of("choices",
                List.of(Map.of("delta", Map.of("content", text))))) + "\n\ndata: [DONE]\n\n";
            output.write(frame.getBytes(StandardCharsets.UTF_8));
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .contentType(MediaType.TEXT_EVENT_STREAM).body(body);
    }
}
