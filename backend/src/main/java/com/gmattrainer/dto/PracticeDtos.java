package com.gmattrainer.dto;

import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class PracticeDtos {
    private PracticeDtos() {}
    public record CreateSessionRequest(
        @Size(max=4) List<@Pattern(regexp="RC|CR|PS|DS") String> types,
        @Pattern(regexp="practice|exam|redo|daily|gmatfocus") String mode,
        @Min(1) @Max(100) Integer count,
        @Size(max=200) String topic,
        @Pattern(regexp="Easy|Medium|Hard") String difficulty,
        @Pattern(regexp="shuffle|book") String order,
        @Size(max=100) List<@Size(max=200) String> ids,
        @Size(max=2000) List<@Size(max=200) String> excludeIds
    ) {}
    public record PracticeSessionResponse(UUID sessionId, List<StudentQuestion> questions, int total) {}
    public record ExtendSessionRequest(@NotNull @Size(min=1,max=200) String questionId) {}
    public record SubmitAnswerRequest(
        @NotNull UUID sessionId,
        @NotNull @Size(min=1,max=200) String questionId,
        @NotNull @Pattern(regexp="[A-E]") String selectedAnswer,
        @Min(0) @Max(86400000) Integer timeMs,
        @Size(max=40) String mode,
        @NotNull UUID clientAttemptId
    ) {}
    public record AnswerResponse(UUID attemptId, boolean correct, String correctAnswer, String explanation) {}
}
