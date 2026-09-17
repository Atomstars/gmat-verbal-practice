package com.gmattrainer.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ContentMigrationMainTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void stripsPostgresUnsupportedNullBytesRecursively() throws Exception {
        var source = json.readTree("""
            {"question":"before\\u0000after","options":[{"text":"A\\u0000B"}],"number":2}
            """);

        var clean = ContentMigrationMain.stripNullBytes(source);

        assertThat(clean.path("question").asText()).isEqualTo("beforeafter");
        assertThat(clean.path("options").get(0).path("text").asText()).isEqualTo("AB");
        assertThat(clean.path("number").asInt()).isEqualTo(2);
    }
}
