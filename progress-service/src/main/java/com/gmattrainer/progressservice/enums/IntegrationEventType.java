package com.gmattrainer.progressservice.enums;

public enum IntegrationEventType {
    ANSWER_SUBMITTED;

    public static IntegrationEventType from(String value) {
        return IntegrationEventType.valueOf(value);
    }
}
