package com.gmattrainer.util;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Java port of pipeline/gmat_parsing_common.py's deterministic text helpers. */
public final class TextNormalizer {
    private static final Pattern SPACE = Pattern.compile("\\s+");
    private static final Pattern PUNCTUATION = Pattern.compile("[^\\p{L}\\p{N}_ ]");
    private static final Map<String,String> SMART = Map.ofEntries(
        Map.entry("‘", "'"), Map.entry("’", "'"), Map.entry("‚", ","), Map.entry("‛", "'"),
        Map.entry("“", "\""), Map.entry("”", "\""), Map.entry("„", "\""),
        Map.entry("–", "-"), Map.entry("—", "-"), Map.entry("…", "..."), Map.entry("−", "-"),
        Map.entry(" ", " "), Map.entry("​", ""), Map.entry("﻿", ""), Map.entry("", "->"),
        Map.entry("ﬁ", "fi"), Map.entry("ﬂ", "fl"), Map.entry("­", ""));
    private TextNormalizer() {}

    public static String clean(String text) {
        if (text == null || text.isEmpty()) return "";
        String result = text;
        for (var entry : SMART.entrySet()) result = result.replace(entry.getKey(), entry.getValue());
        return SPACE.matcher(result).replaceAll(" ").trim();
    }

    public static String normalizeForMatch(String text) {
        return SPACE.matcher(PUNCTUATION.matcher(text == null ? "" : text).replaceAll("")).replaceAll(" ").trim().toLowerCase();
    }

    public static String cleanParagraphs(List<String> paragraphs) {
        return paragraphs.stream().map(TextNormalizer::clean).filter(value -> !value.isEmpty())
            .reduce((left, right) -> left + "\n\n" + right).orElse("");
    }
}
