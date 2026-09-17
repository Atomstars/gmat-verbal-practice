package com.gmattrainer.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.gmattrainer.enums.IntegrationEventType;
import com.gmattrainer.dto.PracticeDtos.SubmitAnswerRequest;
import com.gmattrainer.dto.QuestionDtos.ProtectedAnswer;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import com.gmattrainer.repository.QuestionRepository;
import com.gmattrainer.repository.SessionRepository;
import com.gmattrainer.security.CurrentUser;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AnswerServiceTest {
    @Test
    void guestIsGradedServerSideWithoutPersistingAUserAttempt() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        QuestionRepository questions = mock(QuestionRepository.class);
        SessionRepository sessions = mock(SessionRepository.class);
        OutboxEventPublisher outbox = mock(OutboxEventPublisher.class);
        UUID sessionId = UUID.randomUUID();
        var request = new SubmitAnswerRequest(sessionId, "q1", "B", 1200, "practice", UUID.randomUUID());
        when(sessions.findForUpdate(sessionId)).thenReturn(Optional.of(
            new SessionRepository.Session(sessionId, null, Set.of("q1"), Set.of(), Instant.now().plusSeconds(60))));
        when(questions.answer("q1")).thenReturn(Optional.of(new ProtectedAnswer("B", "Official reasoning")));

        var result = new AnswerService(jdbc, questions, sessions, outbox).submit(request, Optional.empty());

        assertThat(result.correct()).isTrue();
        assertThat(result.correctAnswer()).isEqualTo("B");
        assertThat(result.explanation()).isEqualTo("Official reasoning");
        verify(sessions).markSubmitted(sessionId, "q1");
        verify(jdbc, never()).update(org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.<Object[]>any());
        verify(outbox, never()).publish(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyMap());
    }

    @Test
    void authenticatedAnswerPublishesProgressEventAfterAttemptInsert() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        QuestionRepository questions = mock(QuestionRepository.class);
        SessionRepository sessions = mock(SessionRepository.class);
        OutboxEventPublisher outbox = mock(OutboxEventPublisher.class);
        UUID sessionId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        var user = new CurrentUser(userId, "student@example.com");
        var request = new SubmitAnswerRequest(sessionId, "q1", "B", 1200, "practice", UUID.randomUUID());
        when(sessions.findForUpdate(sessionId)).thenReturn(Optional.of(
            new SessionRepository.Session(sessionId, userId, Set.of("q1"), Set.of(), Instant.now().plusSeconds(60))));
        when(questions.answer("q1")).thenReturn(Optional.of(new ProtectedAnswer("B", "Official reasoning")));
        when(questions.safeById("q1")).thenReturn(Optional.of(new StudentQuestion(
            "q1", "official", "CR", "Arguments", "Assumption", "Verbal", "Medium", null, null,
            "Which option follows?", List.of(), "text", "source", 1, null, null, 10)));
        when(jdbc.update(org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any())).thenReturn(1);

        var result = new AnswerService(jdbc, questions, sessions, outbox).submit(request, Optional.of(user));

        assertThat(result.correct()).isTrue();
        verify(sessions).ensureUser(user);
        verify(outbox).publish(org.mockito.ArgumentMatchers.eq(IntegrationEventType.ANSWER_SUBMITTED),
            org.mockito.ArgumentMatchers.eq("question_attempt"), org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.argThat(payload -> {
                @SuppressWarnings("unchecked") var values = (Map<String,Object>) payload;
                return userId.equals(values.get("userId")) && "q1".equals(values.get("questionId"));
            }));
    }
}
