package com.gmattrainer.service;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.enums.IntegrationEventType;
import com.gmattrainer.dto.PracticeDtos.AnswerResponse;
import com.gmattrainer.dto.PracticeDtos.SubmitAnswerRequest;
import com.gmattrainer.repository.QuestionRepository;
import com.gmattrainer.repository.SessionRepository;
import com.gmattrainer.security.CurrentUser;
import java.time.Instant;
import java.util.Optional;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnswerService {
    private final JdbcTemplate jdbc;
    private final QuestionRepository questions;
    private final SessionRepository sessions;
    private final OutboxEventPublisher outbox;

    public AnswerService(JdbcTemplate jdbc, QuestionRepository questions, SessionRepository sessions,
                         OutboxEventPublisher outbox) {
        this.jdbc = jdbc;
        this.questions = questions;
        this.sessions = sessions;
        this.outbox = outbox;
    }

    @Transactional
    public AnswerResponse submit(SubmitAnswerRequest request, Optional<CurrentUser> user) {
        if (request.sessionId() == null || request.questionId() == null || request.selectedAnswer() == null || request.clientAttemptId() == null)
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_submission", "Required answer fields are missing.");
        var session = sessions.findForUpdate(request.sessionId())
            .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "invalid_session", "Session not found."));
        if (session.expiresAt().isBefore(Instant.now()) || !session.questionIds().contains(request.questionId()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_session", "Session is expired or does not contain this question.");
        if (session.userId() != null && (user.isEmpty() || !session.userId().equals(user.get().id())))
            throw new ApiException(HttpStatus.FORBIDDEN, "wrong_user", "This session belongs to another user.");
        var answer = questions.answer(request.questionId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "question_not_found", "Question not found."));
        boolean correct = request.selectedAnswer().equals(answer.correctAnswer());
        sessions.markSubmitted(request.sessionId(), request.questionId());
        if (user.isEmpty()) return new AnswerResponse(null, correct, answer.correctAnswer(), answer.explanation());

        sessions.ensureUser(user.get());
        UUID attemptId = UUID.randomUUID();
        int inserted = jdbc.update("""
            insert into question_attempts(id,client_attempt_id,user_id,question_id,session_id,selected_answer,is_correct,time_ms,mode)
            values (?,?,?,?,?,?,?,?,?) on conflict(client_attempt_id) do nothing
            """, attemptId, request.clientAttemptId(), user.get().id(), request.questionId(), request.sessionId(),
            request.selectedAnswer(), correct, request.timeMs(), request.mode() == null ? "practice" : request.mode());
        if (inserted == 0) {
            var existing = jdbc.query("select id,is_correct,user_id,question_id,session_id,selected_answer from question_attempts where client_attempt_id=?",
                (rs, row) -> new Object[]{(UUID) rs.getObject(1), rs.getBoolean(2), (UUID) rs.getObject(3),
                    rs.getString(4), (UUID) rs.getObject(5), rs.getString(6)},
                request.clientAttemptId()).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "attempt_conflict", "Attempt ID conflict."));
            if (!user.get().id().equals(existing[2]) || !request.questionId().equals(existing[3]) ||
                !request.sessionId().equals(existing[4]) || !request.selectedAnswer().equals(existing[5]))
                throw new ApiException(HttpStatus.CONFLICT, "attempt_conflict", "Attempt ID was already used for a different submission.");
            return new AnswerResponse((UUID) existing[0], (boolean) existing[1], answer.correctAnswer(), answer.explanation());
        }
        var question = questions.safeById(request.questionId()).orElseThrow();
        var payload = new LinkedHashMap<String,Object>();
        payload.put("attemptId", attemptId); payload.put("userId", user.get().id());
        payload.put("questionId", request.questionId()); payload.put("selectedAnswer", request.selectedAnswer());
        payload.put("correct", correct); payload.put("timeMs", request.timeMs()); payload.put("attemptedAt", Instant.now());
        payload.put("questionType", question.type()); payload.put("subtype", question.subtype());
        payload.put("chapter", question.chapter()); payload.put("difficulty", question.difficulty());
        payload.put("questionText", question.question());
        outbox.publish(IntegrationEventType.ANSWER_SUBMITTED, "question_attempt", attemptId.toString(), payload);
        return new AnswerResponse(attemptId, correct, answer.correctAnswer(), answer.explanation());
    }
}
