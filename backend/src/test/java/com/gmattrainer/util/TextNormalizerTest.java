package com.gmattrainer.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TextNormalizerTest {
    @Test
    void portsSmartCharactersWhitespaceAndLigatures() {
        assertThat(TextNormalizer.clean("  “ﬁrst”\u00a0—\tsecond…  "))
            .isEqualTo("\"first\" - second...");
    }

    @Test
    void normalizesDeterministicallyForMatching() {
        assertThat(TextNormalizer.normalizeForMatch("GMAT’s  42% Rule!"))
            .isEqualTo("gmats 42 rule");
        assertThat(TextNormalizer.cleanParagraphs(List.of(" First ", "", "Second\nline")))
            .isEqualTo("First\n\nSecond line");
    }
}
