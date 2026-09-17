package com.gmattrainer.service;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.dto.PracticeDtos.CreateSessionRequest;
import com.gmattrainer.dto.PracticeDtos.PracticeSessionResponse;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import com.gmattrainer.repository.QuestionRepository;
import com.gmattrainer.repository.SessionRepository;
import com.gmattrainer.security.CurrentUser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;

@Service
public class PracticeService {
    private final QuestionRepository questions;
    private final SessionRepository sessions;

    public PracticeService(QuestionRepository questions, SessionRepository sessions) {
        this.questions = questions;
        this.sessions = sessions;
    }

    public PracticeSessionResponse create(CreateSessionRequest request, Optional<CurrentUser> user) {
        String mode = request.mode() == null ? "practice" : request.mode();
        int count = request.count() == null ? 10 : request.count();
        List<String> types = request.types() == null ? List.of() : request.types();
        Set<String> explicit = new HashSet<>(request.ids() == null ? List.of() : request.ids());
        Set<String> excluded = new HashSet<>(request.excludeIds() == null ? List.of() : request.excludeIds());
        user.ifPresent(sessions::ensureUser);
        if (explicit.isEmpty() && user.isPresent()) {
            if (mode.equals("redo")) explicit.addAll(sessions.seen(user.get().id(), true));
            else excluded.addAll(sessions.seen(user.get().id(), false));
        }

        var pool = new ArrayList<>(questions.candidates().stream()
            .filter(q -> explicit.isEmpty() || explicit.contains(q.id()))
            .filter(q -> explicit.isEmpty() && !mode.equals("redo") ? !excluded.contains(q.id()) : true)
            .filter(q -> types.isEmpty() || types.contains(q.type()))
            .filter(q -> request.topic() == null || request.topic().equals(q.chapter()) || request.topic().equals(q.subtype()))
            .filter(q -> request.difficulty() == null || request.difficulty().equals(q.difficulty()))
            .toList());
        if ("shuffle".equals(request.order()) || mode.equals("exam") || mode.equals("gmatfocus")) Collections.shuffle(pool);
        else pool.sort(Comparator.comparing(StudentQuestion::bank).thenComparing(q -> q.number() == null ? Integer.MAX_VALUE : q.number()));
        if (mode.equals("daily")) pool = dailyPassage(pool);
        else if (pool.size() > count) pool = new ArrayList<>(pool.subList(0, count));
        var sessionId = sessions.create(user.map(CurrentUser::id).orElse(null), mode,
            Map.of("types", types, "topic", request.topic() == null ? "" : request.topic(),
                "difficulty", request.difficulty() == null ? "" : request.difficulty()),
            pool.stream().map(StudentQuestion::id).toList());
        return new PracticeSessionResponse(sessionId, pool, pool.size());
    }

    @Transactional
    public void extend(UUID sessionId, String questionId, Optional<CurrentUser> user) {
        var session = sessions.findForUpdate(sessionId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "session_not_found", "Practice session not found."));
        if (session.expiresAt().isBefore(Instant.now()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "session_expired", "Practice session has expired.");
        if (session.userId() != null && (user.isEmpty() || !session.userId().equals(user.get().id())))
            throw new ApiException(HttpStatus.FORBIDDEN, "wrong_user", "This session belongs to another user.");
        questions.safeById(questionId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "question_not_found", "Question not found."));
        sessions.addQuestion(sessionId, questionId);
    }

    private ArrayList<StudentQuestion> dailyPassage(List<StudentQuestion> pool) {
        var rc = pool.stream().filter(q -> q.type().equals("RC") && q.passage() != null).toList();
        if (rc.isEmpty()) return new ArrayList<>();
        var seed = rc.get((int) (Math.random() * rc.size()));
        return new ArrayList<>(rc.stream().filter(q -> seed.passage().equals(q.passage())).toList());
    }
}
