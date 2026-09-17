package com.gmattrainer.repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.dto.QuestionDtos.CatalogQuestion;
import com.gmattrainer.dto.QuestionDtos.Option;
import com.gmattrainer.dto.QuestionDtos.ProtectedAnswer;
import com.gmattrainer.dto.QuestionDtos.ScoredQuestion;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class QuestionRepository {
    private static final String SAFE_COLUMNS = "q.id,q.bank,q.type,q.chapter,q.subtype,q.category,q.difficulty," +
        "q.title,q.passage,q.question,q.options,q.format,q.source,q.number,q.diagram,q.diagram_description,q.source_page";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public QuestionRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<CatalogQuestion> catalog() {
        return jdbc.query("""
            select id,bank,type,chapter,subtype,difficulty,format,number from questions
            where active and published and correct_answer is not null
            order by bank, number nulls last, id
            """, (rs, row) -> new CatalogQuestion(rs.getString("id"), rs.getString("bank"),
            rs.getString("type"), rs.getString("chapter"), rs.getString("subtype"),
            rs.getString("difficulty"), rs.getString("format"), integer(rs, "number")));
    }

    public List<StudentQuestion> candidates() {
        return jdbc.query("select " + SAFE_COLUMNS + " from questions q where q.active and q.published " +
            "and q.correct_answer is not null and q.format <> 'open_ended' order by q.bank,q.number nulls last,q.id",
            this::student);
    }

    public Optional<StudentQuestion> safeById(String id) {
        return jdbc.query("select " + SAFE_COLUMNS + " from questions q where q.id=? and q.active and q.published",
            this::student, id).stream().findFirst();
    }

    public Optional<ProtectedAnswer> answer(String id) {
        return jdbc.query("select correct_answer,official_explanation from questions where id=? and active and published",
            (rs, row) -> new ProtectedAnswer(rs.getString(1), rs.getString(2)), id).stream().findFirst();
    }

    public List<ScoredQuestion> search(float[] vector, int limit, List<String> types, String difficulty) {
        var sql = new StringBuilder("select ").append(SAFE_COLUMNS)
            .append(",(1-(e.embedding <=> cast(? as vector))) score from question_embeddings e ")
            .append("join questions q on q.id=e.question_id where q.active and q.published ");
        var args = new ArrayList<Object>();
        args.add(vectorLiteral(vector));
        if (types != null && !types.isEmpty()) {
            sql.append("and q.type in (").append("?,".repeat(types.size()), 0, types.size() * 2 - 1).append(") ");
            args.addAll(types);
        }
        if (difficulty != null) { sql.append("and q.difficulty=? "); args.add(difficulty); }
        sql.append("order by e.embedding <=> cast(? as vector) limit ?");
        args.add(vectorLiteral(vector));
        args.add(limit);
        return jdbc.query(sql.toString(), (rs, row) -> new ScoredQuestion(student(rs, row), rs.getDouble("score")), args.toArray());
    }

    public List<ScoredQuestion> similar(String id, int limit) {
        return jdbc.query("select " + SAFE_COLUMNS + "," +
            "(1-(e.embedding <=> source.embedding)) score from question_embeddings source " +
            "join question_embeddings e on e.question_id<>source.question_id join questions q on q.id=e.question_id " +
            "where source.question_id=? and q.active and q.published order by e.embedding <=> source.embedding limit ?",
            (rs, row) -> new ScoredQuestion(student(rs, row), rs.getDouble("score")), id, limit);
    }

    private StudentQuestion student(ResultSet rs, int ignored) throws SQLException {
        try {
            List<Option> options = json.readValue(rs.getString("options"), new TypeReference<>() {});
            return new StudentQuestion(rs.getString("id"), rs.getString("bank"), rs.getString("type"),
                rs.getString("chapter"), rs.getString("subtype"), rs.getString("category"),
                rs.getString("difficulty"), rs.getString("title"), rs.getString("passage"),
                rs.getString("question"), options, rs.getString("format"), rs.getString("source"),
                integer(rs, "number"), rs.getString("diagram"), rs.getString("diagram_description"),
                integer(rs, "source_page"));
        } catch (java.io.IOException exception) {
            throw new SQLException("Invalid options JSON for " + rs.getString("id"), exception);
        }
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    public static String vectorLiteral(float[] vector) {
        var value = new StringBuilder("[");
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) value.append(',');
            value.append(Float.toString(vector[i]));
        }
        return value.append(']').toString();
    }
}
