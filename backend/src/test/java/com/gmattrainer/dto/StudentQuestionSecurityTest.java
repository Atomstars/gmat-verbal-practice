package com.gmattrainer.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.dto.QuestionDtos.Option;
import com.gmattrainer.dto.QuestionDtos.StudentQuestion;
import java.util.List;
import org.junit.jupiter.api.Test;

class StudentQuestionSecurityTest {
    @Test
    void studentDtoCannotSerializeAnswersExplanationsOrEmbeddings() throws Exception {
        var dto = new StudentQuestion("q1", "og", "CR", null, null, null, "Easy",
            null, null, "Stem", List.of(new Option("A", "Choice")), "multiple_choice",
            "OG", 1, null, null, 10);
        String body = new ObjectMapper().writeValueAsString(dto);
        assertThat(body).doesNotContain("correctAnswer", "correct_answer", "explanation", "embedding");
        assertThat(body).contains("\"diagram_description\"", "\"source_page\"");
    }
}
