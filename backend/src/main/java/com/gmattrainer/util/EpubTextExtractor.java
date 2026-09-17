package com.gmattrainer.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipFile;
import org.jsoup.Jsoup;

/** jsoup/ZipFile replacement for BeautifulSoup EPUB text extraction. */
public final class EpubTextExtractor {
    public List<String> extract(Path path) throws IOException {
        try (var zip = new ZipFile(path.toFile(), StandardCharsets.UTF_8)) {
            var names = zip.stream().filter(e -> !e.isDirectory())
                .map(e -> e.getName()).filter(n -> n.endsWith(".xhtml") || n.endsWith(".html"))
                .sorted(Comparator.naturalOrder()).toList();
            var sections = new ArrayList<String>(names.size());
            for (String name : names) {
                try (var input = zip.getInputStream(zip.getEntry(name))) {
                    sections.add(Jsoup.parse(input, "UTF-8", "").text());
                }
            }
            return sections;
        }
    }
}
