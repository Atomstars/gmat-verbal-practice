package com.gmattrainer.controller;

import com.gmattrainer.dto.PracticeDtos.AnswerResponse;
import com.gmattrainer.dto.PracticeDtos.CreateSessionRequest;
import com.gmattrainer.dto.PracticeDtos.ExtendSessionRequest;
import com.gmattrainer.dto.PracticeDtos.PracticeSessionResponse;
import com.gmattrainer.dto.PracticeDtos.SubmitAnswerRequest;
import com.gmattrainer.security.CurrentUser;
import com.gmattrainer.service.AnswerService;
import com.gmattrainer.service.PracticeService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PracticeController {
    private final PracticeService practice;
    private final AnswerService answers;
    public PracticeController(PracticeService practice, AnswerService answers) {
        this.practice = practice;
        this.answers = answers;
    }

    @PostMapping("/practice/sessions")
    public PracticeSessionResponse create(@Valid @RequestBody CreateSessionRequest request, Authentication auth) {
        return practice.create(request, CurrentUser.from(auth));
    }

    @PostMapping("/answers")
    public AnswerResponse answer(@Valid @RequestBody SubmitAnswerRequest request, Authentication auth) {
        return answers.submit(request, CurrentUser.from(auth));
    }

    @PostMapping("/practice/sessions/{sessionId}/questions")
    public Map<String, Boolean> extend(@PathVariable java.util.UUID sessionId,
                                       @Valid @RequestBody ExtendSessionRequest request,
                                       Authentication auth) {
        practice.extend(sessionId, request.questionId(), CurrentUser.from(auth));
        return Map.of("added", true);
    }
}
