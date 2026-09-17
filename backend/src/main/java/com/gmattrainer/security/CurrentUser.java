package com.gmattrainer.security;

import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

public record CurrentUser(UUID id, String email) {
    public static Optional<CurrentUser> from(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt)) return Optional.empty();
        try {
            return Optional.of(new CurrentUser(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email")));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }
}
