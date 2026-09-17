package com.gmattrainer.rag.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import com.gmattrainer.rag.enums.RagMode;

public final class RagDtos {
    private RagDtos() {}
    public record Message(@Pattern(regexp = "user|assistant") String role,
                          @NotBlank @Size(max = 8_000) String content) {}
    public record QuestionOption(String label, String text) {}
    public record QuestionContext(String id, String type, String passage, String question,
                                  List<QuestionOption> options, boolean answered,
                                  String correctAnswer, String officialExplanation) {}
    public record RagRequest(@NotNull RagMode mode,
                             @NotNull @Size(min = 1, max = 40) List<@Valid Message> messages,
                             boolean think, QuestionContext question) {}
}
