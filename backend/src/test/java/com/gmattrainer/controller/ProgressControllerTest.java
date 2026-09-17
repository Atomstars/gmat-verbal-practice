package com.gmattrainer.controller;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.service.ProgressGatewayService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ProgressControllerTest {
    @Test
    void cloudProgressRequiresAuthentication() {
        var controller = new ProgressController(org.mockito.Mockito.mock(ProgressGatewayService.class));
        assertThatThrownBy(() -> controller.progress(null))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                org.assertj.core.api.Assertions.assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
                org.assertj.core.api.Assertions.assertThat(error.code()).isEqualTo("authentication_required");
            });
    }
}
