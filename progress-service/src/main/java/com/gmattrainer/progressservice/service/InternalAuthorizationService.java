package com.gmattrainer.progressservice.service;

import com.gmattrainer.progressservice.exception.ServiceException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class InternalAuthorizationService {
    private final byte[] expected;
    public InternalAuthorizationService(@Value("${app.internal-token}") String token) {
        this.expected = token.getBytes(StandardCharsets.UTF_8);
    }
    public void require(String supplied) {
        if (supplied == null || !MessageDigest.isEqual(expected, supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ServiceException(HttpStatus.FORBIDDEN, "invalid_service_credential", "Invalid internal service credential.");
    }
}
