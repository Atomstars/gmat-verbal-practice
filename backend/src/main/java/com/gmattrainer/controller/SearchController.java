package com.gmattrainer.controller;

import com.gmattrainer.dto.QuestionDtos.ScoredQuestion;
import com.gmattrainer.repository.QuestionRepository;
import dev.langchain4j.model.embedding.EmbeddingModel;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class SearchController {
    public record SearchRequest(@NotBlank @Size(min=3,max=500) String query, @Min(1) @Max(20) Integer limit,
        @Size(max=4) List<@Pattern(regexp="RC|CR|PS|DS") String> types,
        @Pattern(regexp="Easy|Medium|Hard") String difficulty) {}
    private final EmbeddingModel embeddings;
    private final QuestionRepository questions;
    public SearchController(EmbeddingModel embeddings, QuestionRepository questions) {
        this.embeddings = embeddings;
        this.questions = questions;
    }

    @PostMapping
    public Map<String, List<ScoredQuestion>> search(@Valid @RequestBody SearchRequest request) {
        int limit = request.limit() == null ? 8 : request.limit();
        float[] vector = embeddings.embed(request.query()).content().vector();
        return Map.of("results", questions.search(vector, limit, request.types(), request.difficulty()));
    }
}
