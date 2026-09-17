package com.gmattrainer.progressservice.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.gmattrainer.progressservice.exception.ServiceException;
import org.junit.jupiter.api.Test;

class InternalAuthorizationServiceTest {
    private final InternalAuthorizationService authorization = new InternalAuthorizationService("expected-token");

    @Test
    void acceptsMatchingServiceCredential() {
        assertThatCode(() -> authorization.require("expected-token")).doesNotThrowAnyException();
    }

    @Test
    void rejectsMissingOrIncorrectServiceCredential() {
        assertThatThrownBy(() -> authorization.require("incorrect-token")).isInstanceOf(ServiceException.class);
        assertThatThrownBy(() -> authorization.require(null)).isInstanceOf(ServiceException.class);
    }
}
