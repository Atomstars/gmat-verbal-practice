package com.gmattrainer.controller;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.dto.QuestionDtos.CatalogQuestion;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import com.gmattrainer.repository.QuestionRepository;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/questions")
public class QuestionController {
    private final QuestionRepository questions;
    public QuestionController(QuestionRepository questions) { this.questions = questions; }

    @GetMapping("/catalog")
    public Map<String, List<CatalogQuestion>> catalog() { return Map.of("questions", questions.catalog()); }

    @GetMapping("/{id}")
    public Map<String, StudentQuestion> one(@PathVariable String id) {
        if (id.length() > 200) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_id", "Invalid question ID.");
        return Map.of("question", questions.safeById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "Question not found.")));
    }

    @GetMapping("/{id}/similar")
    public Map<String, Object> similar(@PathVariable String id,
                                       @RequestParam(defaultValue = "3") int limit) {
        if (limit < 1 || limit > 10)
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_limit", "Limit must be between 1 and 10.");
        return Map.of("results", questions.similar(id, limit));
    }
}
