package com.gmattrainer.controller;

import com.gmattrainer.security.CurrentUser;
import com.gmattrainer.client.TutorGatewayClient;
import com.gmattrainer.dto.TutorDtos;
import com.gmattrainer.enums.TutorMode;
import com.gmattrainer.service.TutorContextService;
import jakarta.validation.Valid;
import java.io.InputStream;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Public tutor gateway. Retrieval and generation live in the separate rag-service. */
@RestController
@RequestMapping("/api/tutor")
public class TutorController {
    private final TutorContextService contexts;
    private final TutorGatewayClient rag;

    public TutorController(TutorContextService contexts, TutorGatewayClient rag) {
        this.contexts = contexts;
        this.rag = rag;
    }

    @GetMapping
    public Map<String, Object> health() {
        return rag.health();
    }

    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> chat(@Valid @RequestBody TutorDtos.TutorRequest request,
                                                       Authentication authentication) {
        TutorMode mode = request.questionId() == null && request.sessionId() == null
            ? TutorMode.TEACHER : TutorMode.QUESTION;
        TutorDtos.QuestionContext context = mode == TutorMode.QUESTION
            ? contexts.authorizedContext(request, CurrentUser.from(authentication)) : null;
        InputStream upstream = rag.open(new TutorDtos.RagRequest(mode, request.messages(), request.think(), context));
        StreamingResponseBody stream = output -> {
            try (upstream) { upstream.transferTo(output); }
        };
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .contentType(MediaType.TEXT_EVENT_STREAM).body(stream);
    }
}
