package com.gmattrainer.progressservice.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.progressservice.dto.ProgressDtos.AnswerSubmittedEvent;
import com.gmattrainer.progressservice.exception.ServiceException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class ProgressRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public ProgressRepository(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    public Map<String,Object> read(UUID userId) {
        Map<String,Object> history = new LinkedHashMap<>();
        jdbc.query("select * from progress_service.user_progress where user_id=?",
            (RowCallbackHandler) rs -> history.put(rs.getString("question_id"), historyEntry(rs)), userId);
        var state = jdbc.query("""
            select daily,adaptive,activity,legacy_migrated_at
            from progress_service.user_study_state where user_id=?
            """, (rs,row) -> Map.<String,Object>of(
                "daily", readJson(rs.getString("daily")), "adaptive", readJson(rs.getString("adaptive")),
                "activity", readJson(rs.getString("activity")), "legacyMigrated", rs.getTimestamp("legacy_migrated_at") != null),
            userId).stream().findFirst().orElse(Map.of());
        return Map.of("version", 3, "history", history,
            "daily", state.getOrDefault("daily", defaultDaily()),
            "adaptive", state.getOrDefault("adaptive", Map.of("level", "Easy")),
            "activity", state.getOrDefault("activity", Map.of()),
            "legacyMigrated", state.getOrDefault("legacyMigrated", false));
    }

    public List<Map<String,Object>> history(UUID userId, List<String> types, int limit) {
        var sql = new StringBuilder("""
            select question_id,attempt_count,correct_count,last_answer,last_result,last_time_ms,last_attempted_at,
              question_type,subtype,chapter,difficulty,question_text
            from progress_service.user_progress where user_id=?
            """);
        var args = new ArrayList<Object>(); args.add(userId);
        if (!types.isEmpty()) {
            sql.append(" and question_type in (").append("?,".repeat(types.size()),0,types.size()*2-1).append(")");
            args.addAll(types);
        }
        sql.append(" order by last_attempted_at desc limit ?"); args.add(limit);
        return jdbc.query(sql.toString(), (rs,row) -> {
            var question = new LinkedHashMap<String,Object>();
            question.put("id",rs.getString("question_id")); question.put("type",nullable(rs.getString("question_type")));
            question.put("subtype",nullable(rs.getString("subtype"))); question.put("chapter",nullable(rs.getString("chapter")));
            question.put("difficulty",nullable(rs.getString("difficulty"))); question.put("question",nullable(rs.getString("question_text")));
            var out = new LinkedHashMap<String,Object>();
            out.put("question_id",rs.getString("question_id")); out.put("attempt_count",rs.getInt("attempt_count"));
            out.put("correct_count",rs.getInt("correct_count")); out.put("last_answer",rs.getString("last_answer"));
            out.put("last_result",rs.getBoolean("last_result")); out.put("last_time_ms",rs.getObject("last_time_ms"));
            out.put("last_attempted_at",rs.getTimestamp("last_attempted_at")); out.put("questions",question);
            return out;
        },args.toArray());
    }

    @Transactional
    public Map<String,Object> migrate(UUID userId, JsonNode legacy) {
        if (legacy == null || !legacy.isObject() || !legacy.path("history").isObject() || legacy.path("history").size()>2000)
            throw new ServiceException(HttpStatus.BAD_REQUEST,"invalid_progress","Legacy progress is invalid.");
        Boolean done = jdbc.queryForObject("""
            select exists(select 1 from progress_service.user_study_state
              where user_id=? and legacy_migrated_at is not null)
            """,Boolean.class,userId);
        if (Boolean.TRUE.equals(done)) return Map.of("migrated",false,"reason","already_migrated","progress",read(userId));
        int imported=0;
        var fields=legacy.path("history").fields();
        while(fields.hasNext()) {
            var entry=fields.next(); JsonNode item=entry.getValue(); String questionId=entry.getKey();
            int attempts=item.path("attempts").asInt(-1), correct=item.path("correct").asInt(-1);
            if(questionId.isBlank()||questionId.length()>200||attempts<1||correct<0||correct>attempts) continue;
            String picked=item.path("lastPicked").asText(""); if(!picked.matches("[A-E]")) picked=null;
            String type=item.path("type").asText(""); if(!type.matches("RC|CR|PS|DS")) type=null;
            long millis=item.path("ts").asLong(item.path("lastSeen").asLong(0));
            jdbc.update("""
                insert into progress_service.user_progress(user_id,question_id,attempt_count,correct_count,last_answer,
                  last_result,last_time_ms,last_attempted_at,question_type,subtype,chapter,difficulty,metadata)
                values (?,?,?,?,?,?,?,?,?,?,?,?, '{"migrated_from":"gmat_verbal_v1"}'::jsonb)
                on conflict(user_id,question_id) do update set
                  attempt_count=greatest(progress_service.user_progress.attempt_count,excluded.attempt_count),
                  correct_count=greatest(progress_service.user_progress.correct_count,excluded.correct_count),
                  last_answer=case when excluded.last_attempted_at>=progress_service.user_progress.last_attempted_at then excluded.last_answer else progress_service.user_progress.last_answer end,
                  last_result=case when excluded.last_attempted_at>=progress_service.user_progress.last_attempted_at then excluded.last_result else progress_service.user_progress.last_result end,
                  updated_at=now()
                """,userId,questionId,attempts,correct,picked,"correct".equals(item.path("lastResult").asText()),
                item.path("lastTimeMs").isNumber()?item.path("lastTimeMs").asInt():null,
                millis>0?java.sql.Timestamp.from(Instant.ofEpochMilli(millis)):java.sql.Timestamp.from(Instant.EPOCH),
                type,nullableText(item,"subtype"),nullableText(item,"chapter"),nullableText(item,"difficulty"));
            imported++;
        }
        jdbc.update("""
            insert into progress_service.user_study_state(user_id,daily,adaptive,activity,legacy_migrated_at)
            values (?,cast(? as jsonb),cast(? as jsonb),cast(? as jsonb),now())
            on conflict(user_id) do update set legacy_migrated_at=coalesce(progress_service.user_study_state.legacy_migrated_at,now()),updated_at=now()
            """,userId,jsonString(legacy.path("daily")),jsonString(legacy.path("adaptive")),jsonString(legacy.path("activity")));
        return Map.of("migrated",true,"imported",imported,"progress",read(userId));
    }

    public void apply(AnswerSubmittedEvent event) {
        jdbc.update("""
            insert into progress_service.user_progress(user_id,question_id,attempt_count,correct_count,last_answer,
              last_result,last_time_ms,last_attempted_at,question_type,subtype,chapter,difficulty,question_text)
            values (?,?,1,?,?,?,?,?,?,?,?,?,?)
            on conflict(user_id,question_id) do update set
              attempt_count=progress_service.user_progress.attempt_count+1,
              correct_count=progress_service.user_progress.correct_count+(case when excluded.last_result then 1 else 0 end),
              last_answer=case when excluded.last_attempted_at>=progress_service.user_progress.last_attempted_at then excluded.last_answer else progress_service.user_progress.last_answer end,
              last_result=case when excluded.last_attempted_at>=progress_service.user_progress.last_attempted_at then excluded.last_result else progress_service.user_progress.last_result end,
              last_time_ms=case when excluded.last_attempted_at>=progress_service.user_progress.last_attempted_at then excluded.last_time_ms else progress_service.user_progress.last_time_ms end,
              last_attempted_at=greatest(progress_service.user_progress.last_attempted_at,excluded.last_attempted_at),
              question_type=coalesce(excluded.question_type,progress_service.user_progress.question_type),
              subtype=coalesce(excluded.subtype,progress_service.user_progress.subtype),
              chapter=coalesce(excluded.chapter,progress_service.user_progress.chapter),
              difficulty=coalesce(excluded.difficulty,progress_service.user_progress.difficulty),
              question_text=coalesce(excluded.question_text,progress_service.user_progress.question_text),updated_at=now()
            """,event.userId(),event.questionId(),event.correct()?1:0,event.selectedAnswer(),event.correct(),event.timeMs(),
            java.sql.Timestamp.from(event.attemptedAt()),event.questionType(),event.subtype(),event.chapter(),event.difficulty(),event.questionText());
    }

    private Map<String,Object> historyEntry(ResultSet rs) throws SQLException {
        var value=new LinkedHashMap<String,Object>();
        value.put("attempts",rs.getInt("attempt_count")); value.put("correct",rs.getInt("correct_count"));
        value.put("lastPicked",rs.getString("last_answer")); value.put("lastResult",rs.getBoolean("last_result")?"correct":"wrong");
        value.put("lastTimeMs",rs.getObject("last_time_ms"));
        value.put("ts",rs.getTimestamp("last_attempted_at")==null?0:rs.getTimestamp("last_attempted_at").getTime());
        value.put("type",rs.getString("question_type")); value.put("subtype",rs.getString("subtype"));
        value.put("chapter",rs.getString("chapter")); value.put("difficulty",rs.getString("difficulty"));
        return value;
    }
    private Object readJson(String raw){try{return json.readValue(raw,Object.class);}catch(Exception e){return Map.of();}}
    private String jsonString(JsonNode node){return node==null||!node.isObject()?"{}":node.toString();}
    private static String nullableText(JsonNode node,String field){return node.path(field).isTextual()?node.path(field).asText():null;}
    private static Object nullable(Object value){return value==null?"":value;}
    private static Map<String,Object> defaultDaily(){return Map.of("date","","level","Easy","streak",0,"recent",List.of());}
}
