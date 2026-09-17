package com.gmattrainer.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.security.CurrentUser;
import java.sql.Array;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Repository;

@Repository
public class SessionRepository {
    public record Session(UUID id, UUID userId, Set<String> questionIds,
                          Set<String> submittedQuestionIds, Instant expiresAt) {}
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public SessionRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void ensureUser(CurrentUser user) {
        jdbc.update("""
            insert into app_users(id,email) values (?,?) on conflict(id) do update
            set email=coalesce(excluded.email,app_users.email),updated_at=now()
            """, user.id(), user.email());
    }

    public Set<String> seen(UUID userId, boolean wrongOnly) {
        String sql = wrongOnly ? """
            select question_id from (
              select distinct on (question_id) question_id,is_correct
              from question_attempts where user_id=? order by question_id,attempted_at desc
            ) latest where not is_correct
            """ : "select distinct question_id from question_attempts where user_id=?";
        return new HashSet<>(jdbc.query(sql, (rs, row) -> rs.getString(1), userId));
    }

    public UUID create(UUID userId, String mode, Object filters, List<String> questionIds) {
        UUID id = UUID.randomUUID();
        try {
            String filterJson = json.writeValueAsString(filters);
            jdbc.execute((ConnectionCallback<Void>) connection -> {
                try (var statement = connection.prepareStatement(
                    "insert into practice_sessions(id,user_id,mode,filters,question_ids) values (?,?,?,cast(? as jsonb),?)")) {
                    statement.setObject(1, id);
                    statement.setObject(2, userId);
                    statement.setString(3, mode);
                    statement.setString(4, filterJson);
                    Array ids = connection.createArrayOf("text", questionIds.toArray());
                    statement.setArray(5, ids);
                    statement.executeUpdate();
                }
                return null;
            });
            return id;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid session filters", exception);
        }
    }

    public Optional<Session> findForUpdate(UUID id) {
        return find(id, true);
    }

    public Optional<Session> find(UUID id) {
        return find(id, false);
    }

    private Optional<Session> find(UUID id, boolean lock) {
        String sql = "select id,user_id,question_ids,submitted_question_ids,expires_at from practice_sessions where id=?" +
            (lock ? " for update" : "");
        return jdbc.query(sql,
            (rs, row) -> new Session((UUID) rs.getObject("id"), (UUID) rs.getObject("user_id"),
                new HashSet<>(Arrays.asList((String[]) rs.getArray("question_ids").getArray())),
                new HashSet<>(Arrays.asList((String[]) rs.getArray("submitted_question_ids").getArray())),
                rs.getTimestamp("expires_at").toInstant()), id).stream().findFirst();
    }

    public void markSubmitted(UUID sessionId, String questionId) {
        jdbc.update("update practice_sessions set submitted_question_ids=array_append(submitted_question_ids,?) " +
            "where id=? and not (?=any(submitted_question_ids))", questionId, sessionId, questionId);
    }

    public void addQuestion(UUID sessionId, String questionId) {
        jdbc.update("update practice_sessions set question_ids=array_append(question_ids,?) " +
            "where id=? and not (?=any(question_ids))", questionId, sessionId, questionId);
    }
}
