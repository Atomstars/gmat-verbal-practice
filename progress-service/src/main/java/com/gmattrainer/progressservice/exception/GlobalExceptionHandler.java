package com.gmattrainer.progressservice.exception;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    @ExceptionHandler(ServiceException.class)
    ResponseEntity<?> known(ServiceException e) { return ResponseEntity.status(e.status()).body(error(e.code(), e.getMessage())); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation() { return ResponseEntity.badRequest().body(error("validation_error", "The request is invalid.")); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unknown(Exception e) {
        LOG.error("Unhandled progress-service failure", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error("internal_error", "The request could not be completed."));
    }
    private static Map<String,Object> error(String code, String message) {
        return Map.of("error", Map.of("code", code, "message", message));
    }
}
