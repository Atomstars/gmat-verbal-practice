package com.gmattrainer.rag.repository;

import dev.langchain4j.model.embedding.EmbeddingModel;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class KnowledgeRetriever {
    public record Chunk(String id, String title, String content, String source,
                        double semanticScore, double lexicalScore, double score) {}
    private final JdbcTemplate jdbc;
    private final EmbeddingModel embeddings;
    private final int candidates;
    private final int limit;

    public KnowledgeRetriever(JdbcTemplate jdbc, EmbeddingModel embeddings,
                              @Value("${app.retrieval.candidates}") int candidates,
                              @Value("${app.retrieval.limit}") int limit) {
        this.jdbc = jdbc; this.embeddings = embeddings; this.candidates = candidates; this.limit = limit;
    }

    /** Hybrid retrieval: ANN semantic candidates plus PostgreSQL full-text candidates, reranked together. */
    public List<Chunk> retrieve(String query) {
        String vector = vectorLiteral(embeddings.embed(query).content().vector());
        var merged = new LinkedHashMap<String, Candidate>();
        jdbc.query("""
            select id,title,content,source_label,
              (1-(embedding <=> cast(? as vector))) semantic_score,
              ts_rank_cd(search_vector, plainto_tsquery('english', ?)) lexical_score
            from knowledge_chunks where active
            order by embedding <=> cast(? as vector) limit ?
            """, (rs, row) -> new Candidate(rs.getString("id"), rs.getString("title"),
                rs.getString("content"), rs.getString("source_label"), rs.getDouble("semantic_score"),
                rs.getDouble("lexical_score")), vector, query, vector, candidates)
            .forEach(c -> merged.put(c.id(), c));
        jdbc.query("""
            select id,title,content,source_label,
              (1-(embedding <=> cast(? as vector))) semantic_score,
              ts_rank_cd(search_vector, plainto_tsquery('english', ?)) lexical_score
            from knowledge_chunks
            where active and search_vector @@ plainto_tsquery('english', ?)
            order by lexical_score desc limit ?
            """, (rs, row) -> new Candidate(rs.getString("id"), rs.getString("title"),
                rs.getString("content"), rs.getString("source_label"), rs.getDouble("semantic_score"),
                rs.getDouble("lexical_score")), vector, query, query, candidates)
            .forEach(c -> merged.merge(c.id(), c, Candidate::strongest));

        var ranked = new ArrayList<Chunk>();
        for (Candidate c : merged.values()) {
            double lexical = Math.min(1.0, c.lexicalScore() * 4.0);
            double combined = 0.82 * c.semanticScore() + 0.18 * lexical;
            ranked.add(new Chunk(c.id(), c.title(), c.content(), c.source(),
                c.semanticScore(), c.lexicalScore(), combined));
        }
        return ranked.stream().sorted(Comparator.comparingDouble(Chunk::score).reversed()).limit(limit).toList();
    }

    public int activeChunkCount() {
        Integer count = jdbc.queryForObject("select count(*) from knowledge_chunks where active", Integer.class);
        return count == null ? 0 : count;
    }

    private record Candidate(String id, String title, String content, String source,
                             double semanticScore, double lexicalScore) {
        private Candidate strongest(Candidate other) {
            return new Candidate(id, title, content, source, Math.max(semanticScore, other.semanticScore),
                Math.max(lexicalScore, other.lexicalScore));
        }
    }

    static String vectorLiteral(float[] vector) {
        var value = new StringBuilder("[");
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) value.append(',');
            value.append(Float.toString(vector[i]));
        }
        return value.append(']').toString();
    }
}
