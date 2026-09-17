package com.gmattrainer.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.gmattrainer.dto.PracticeDtos.SubmitAnswerRequest;
import com.gmattrainer.controller.SearchController.SearchRequest;
import jakarta.validation.Validation;
import java.util.List;
import org.junit.jupiter.api.Test;

class RequestValidationTest {
    @Test
    void rejectsMissingAnswerFieldsAndBlankSearchQueries() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new SubmitAnswerRequest(null, null, null, null, null, null)))
                .hasSize(4);
            assertThat(validator.validate(new SearchRequest("  ", 21, List.of("SC"), null)))
                .hasSizeGreaterThanOrEqualTo(3);
        }
    }
}
