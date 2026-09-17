package com.gmattrainer.service;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.repository.SessionRepository;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import com.gmattrainer.repository.QuestionRepository;
import com.gmattrainer.security.CurrentUser;
import com.gmattrainer.dto.TutorDtos;
import java.time.Instant;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class TutorContextService {
    private final QuestionRepository questions;
    private final SessionRepository sessions;
    public TutorContextService(QuestionRepository questions, SessionRepository sessions) {
        this.questions = questions; this.sessions = sessions;
    }

    public TutorDtos.QuestionContext authorizedContext(TutorDtos.TutorRequest request, Optional<CurrentUser> user) {
        if (request.questionId() == null || request.sessionId() == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_context",
                "Both questionId and sessionId are required for the question tutor.");
        var session = sessions.find(request.sessionId()).orElseThrow(() -> forbidden("Tutor session not found."));
        if (session.expiresAt().isBefore(Instant.now()) || !session.questionIds().contains(request.questionId()) ||
            (session.userId() != null && (user.isEmpty() || !session.userId().equals(user.get().id()))))
            throw forbidden("Tutor context is invalid or expired.");
        StudentQuestion question = questions.safeById(request.questionId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Question not found."));
        boolean answered = session.submittedQuestionIds().contains(question.id());
        var answer = answered ? questions.answer(question.id()).orElseThrow() : null;
        return new TutorDtos.QuestionContext(question.id(), question.type(), question.passage(), question.question(),
            question.options().stream().map(o -> new TutorDtos.QuestionOption(o.label(), o.text())).toList(), answered,
            answer == null ? null : answer.correctAnswer(), answer == null ? null : answer.explanation());
    }

    private static ApiException forbidden(String detail) {
        return new ApiException(HttpStatus.FORBIDDEN, "invalid_context", detail);
    }
}
