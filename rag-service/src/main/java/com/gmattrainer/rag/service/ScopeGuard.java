package com.gmattrainer.rag.service;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import com.gmattrainer.rag.enums.ScopeDecision;
import com.gmattrainer.rag.repository.KnowledgeRetriever;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ScopeGuard {
    private static final Set<String> GREETINGS = Set.of("hi", "hello", "hey", "good morning", "good evening");
    private static final Pattern OFF_TOPIC = Pattern.compile(
        "\\b(movie|film|weather|recipe|celebrity|football|cricket|election|politics|song|music|stock price|coding|programming)\\b",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern GMAT = Pattern.compile(
        "\\b(gmat|quant|verbal|data insights?|data sufficiency|problem solving|reading comprehension|critical reasoning|" +
        "algebra|geometry|arithmetic|probability|combinations?|permutations?|ratio|percent|average|median|passage|" +
        "argument|assumption|inference|strengthen|weaken|score|pacing|exam|question|answer choice)\\b",
        Pattern.CASE_INSENSITIVE);
    private final double minimumScore;

    public ScopeGuard(@Value("${app.retrieval.minimum-score}") double minimumScore) {
        this.minimumScore = minimumScore;
    }

    public ScopeDecision precheckTeacher(String query) {
        String normalized = query.trim().toLowerCase(Locale.ROOT).replaceAll("[!.?]+$", "");
        if (GREETINGS.contains(normalized)) return ScopeDecision.GREETING;
        if (OFF_TOPIC.matcher(query).find() && !GMAT.matcher(query).find()) return ScopeDecision.OUT_OF_SCOPE;
        return ScopeDecision.ALLOW;
    }

    public ScopeDecision teacher(String query, List<KnowledgeRetriever.Chunk> chunks) {
        ScopeDecision precheck = precheckTeacher(query);
        if (precheck != ScopeDecision.ALLOW) return precheck;
        if (chunks.isEmpty() || chunks.getFirst().score() < minimumScore) return ScopeDecision.INSUFFICIENT_CONTEXT;
        return ScopeDecision.ALLOW;
    }

    public ScopeDecision question(String query) {
        return OFF_TOPIC.matcher(query).find() && !GMAT.matcher(query).find()
            ? ScopeDecision.OUT_OF_SCOPE : ScopeDecision.ALLOW;
    }
}
