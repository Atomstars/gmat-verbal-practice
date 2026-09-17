package com.gmattrainer.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class QuestionRepositoryTest {
    @Test
    void serializesOnlyTheProvidedVector() {
        assertThat(QuestionRepository.vectorLiteral(new float[]{0.25f, -1f, 3.5f}))
            .isEqualTo("[0.25,-1.0,3.5]");
    }
}
