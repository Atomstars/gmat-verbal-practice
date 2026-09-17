package com.gmattrainer.util;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;

/** PDFBox replacement for the page-extraction stage used by the Python parsers. */
public final class PdfPageExtractor {
    public List<String> extract(Path path) throws IOException {
        try (var document = Loader.loadPDF(path.toFile())) {
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            var pages = new ArrayList<String>(document.getNumberOfPages());
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page); stripper.setEndPage(page);
                pages.add(stripper.getText(document));
            }
            return pages;
        }
    }
}
