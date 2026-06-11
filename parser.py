#!/usr/bin/env python3
"""
parser.py - Extract GMAT Verbal practice problems from Manhattan Prep's
"GMAT All the Verbal" (6th ed.) into a single questions.json file.

INPUT
-----
Pass the book file. Both formats of the *same* book are supported:

    python parser.py "GMAT All the Verbal.pdf"     # the 799-page PDF
    python parser.py "GMAT All the Verbal.epub"    # the EPUB edition

The PDF path uses pdfplumber to extract text and parses the linear text with
structural anchors ("(A)" option markers, "The correct answer is (X)", the
"CORRECT." marker in answer analyses). The EPUB path parses the structured
XHTML. Both emit the identical JSON schema.

If BOTH files are available, the parser runs the other one too and cross-checks
every confirmed answer; agreement between two independent extractions is a
strong guarantee that nothing was hallucinated. Pass --epub PATH / --pdf PATH to
point at the second file, or let it auto-discover in ./ and ~/Downloads.

WHAT IT EXTRACTS
----------------
    Chapters  2- 9  -> Sentence Correction (SC)   [2-3 option teaching drills]
    Chapters 11-15  -> Reading Comprehension (RC)  [passage + 5-option MC]
    Chapters 16-22  -> Critical Reasoning (CR)     [argument + 5-option MC]
(Chapters 1 and 10 are instructional and have no problem set.)

ANSWER INFERENCE  (conservative -- never guesses)
    CR  -> solution states "<Title>: The correct answer is (X)."
    RC  -> the answer analysis marks one labelled choice "(X) ... CORRECT."
    SC  -> left null. The book's SC solutions are teaching prose with no
           reliable answer marker AND aren't 1:1 with the questions; guessing
           would risk wrong answers. (SC is also no longer on the current GMAT.)

Output: questions.json + a printed coverage summary.
"""

import sys
import os
import re
import json
import glob
import zipfile
from collections import Counter

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None


# --------------------------------------------------------------------------- #
# Shared metadata + text helpers
# --------------------------------------------------------------------------- #

CHAPTER_TITLES = {
    2:  "Chapter 2: Grammar and Meaning",
    3:  "Chapter 3: Sentence Structure",
    4:  "Chapter 4: Modifiers",
    5:  "Chapter 5: Parallelism",
    6:  "Chapter 6: Comparisons",
    7:  "Chapter 7: Pronouns",
    8:  "Chapter 8: Verbs",
    9:  "Chapter 9: Idioms",
    11: "Chapter 11: Breaking Down the Passage",
    12: "Chapter 12: Mapping the Passage",
    13: "Chapter 13: General Questions",
    14: "Chapter 14: Specific Questions",
    15: "Chapter 15: Extra Problem Set",
    16: "Chapter 16: Argument Structure",
    17: "Chapter 17: Methodology",
    18: "Chapter 18: Structure-Based Family",
    19: "Chapter 19: The Assumption Family: Find the Assumption",
    20: "Chapter 20: The Assumption Family: Strengthen and Weaken",
    21: "Chapter 21: The Assumption Family: Evaluate / Find the Flaw",
    22: "Chapter 22: Evidence Family",
}

# The chapters that have a Problem Set, in book order. The PDF's problem-set
# pages are matched to this sequence (the EPUB carries its own chapter numbers).
PROBLEMSET_CHAPTERS = [2, 3, 4, 5, 6, 7, 8, 9,        # SC
                       11, 12, 13, 14, 15,            # RC
                       16, 17, 18, 19, 20, 21, 22]    # CR

LETTERS = "ABCDEFGHIJ"

def unit_for_chapter(ch):
    if ch <= 9:
        return "SC"
    if ch <= 15:
        return "RC"
    return "CR"

SMART = {
    "‘": "'", "’": "'", "‚": ",", "‛": "'",
    "“": '"', "”": '"', "„": '"',
    "–": "-", "—": "-", "…": "...", "−": "-",
    " ": " ", "​": "", "﻿": "", "": "->", "ﬁ": "fi",
    "ﬂ": "fl", "­": "",
}

def clean(text):
    if not text:
        return ""
    for k, v in SMART.items():
        text = text.replace(k, v)
    text = re.sub(r"-\s+(?=[a-z])", "", text) if False else text  # (kept simple)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w ]", "", s or "")).strip().lower()

def clean_paras(paras):
    """clean() each paragraph and join them with a blank line, dropping empties.
    Used for passages/explanations so paragraph structure survives (clean() alone
    flattens every newline to a single space)."""
    out = [clean(p) for p in paras]
    return "\n\n".join(p for p in out if p)


# --------------------------------------------------------------------------- #
# Answer-inference (shared by both backends, operating on plain text)
# --------------------------------------------------------------------------- #

CORRECT_IS_RE = re.compile(
    r"(?:correct|best)\s+answer\s+is\s*\(?\s*([A-E])\s*\)?", re.I)

def cr_answer_from_text(text):
    """Single agreed letter from 'The correct answer is (X)' in a block, else None."""
    letters = {m.upper() for m in CORRECT_IS_RE.findall(text)}
    if len(letters) == 1:
        return letters.pop()
    return None

def cr_answer_by_title(title, solutions_text):
    """Find '<Title>: The correct answer is (X)' over the whole chapter solutions."""
    if not title:
        return None
    m = re.search(re.escape(title) +
                  r"\s*:?\s*The\s+(?:correct|best)\s+answer\s+is\s*\(?\s*([A-E])",
                  solutions_text, re.I)
    return m.group(1).upper() if m else None


# --------------------------------------------------------------------------- #
# Input discovery
# --------------------------------------------------------------------------- #

def discover(ext):
    dirs = [".", os.path.expanduser("~/Downloads"), os.path.expanduser("~/Desktop"),
            os.path.expanduser("~/Documents"),
            os.path.expanduser("~/OneDrive/Desktop")]
    hits = []
    for d in dirs:
        for p in glob.glob(os.path.join(d, "**", "*." + ext), recursive=True):
            n = os.path.basename(p).lower()
            if "verbal" in n and "manhattan" in n:
                hits.append(p)
    return hits[0] if hits else None


# =========================================================================== #
# PDF BACKEND
# =========================================================================== #

OPT_RE = re.compile(r"^\(([A-E])\)\s+(.*)")
NUM_RE = re.compile(r"^(\d+)\.\s+(.*)")
PASSAGE_RE = re.compile(r"^Passage\s+[A-Za-z0-9]+\s*:\s*(.*)")
LINE_NO_RE = re.compile(r"\(\d{1,3}\)")          # RC passage line markers, e.g. "(5)"

def pdf_extract_pages(path):
    import pdfplumber
    cache = "pdf_pages.json"
    # tiny convenience cache so re-runs are instant during development
    try:
        if os.path.getmtime(cache) > os.path.getmtime(path):
            return json.load(open(cache, encoding="utf-8"))
    except OSError:
        pass
    with pdfplumber.open(path) as pdf:
        pages = [(pg.extract_text() or "") for pg in pdf.pages]
    try:
        json.dump(pages, open(cache, "w", encoding="utf-8"))
    except OSError:
        pass
    return pages

def _standalone(line, words):
    return line.strip() in words

def pdf_regions(pages):
    """Ordered list of (problem_set_page, region_end_page), skipping the TOC."""
    ps = [i for i, t in enumerate(pages)
          if i >= 20 and any(_standalone(l, {"Problem Set"}) for l in t.splitlines())]
    regions = []
    for k, p in enumerate(ps):
        end = ps[k + 1] if k + 1 < len(ps) else len(pages)
        regions.append((p, end))
    return regions

def _split_problem_solution(region_pages_text):
    """Split a region into (problem_part, solution_part) at the 'Solutions' line."""
    lines = region_pages_text.splitlines()
    cut = None
    for i, l in enumerate(lines):
        if _standalone(l, {"Solutions", "Answers"}):
            cut = i
            break
    if cut is None:
        return "\n".join(lines), ""
    return "\n".join(lines[:cut]), "\n".join(lines[cut + 1:])

def _after_heading(text, headings):
    out, started = [], False
    for l in text.splitlines():
        if not started:
            if _standalone(l, headings):
                started = True
            continue
        out.append(l.rstrip())
    return out if started else [l.rstrip() for l in text.splitlines()]

def pdf_split_problems(lines):
    """
    Split problem-set lines into problems. A numbered line "N." starts a problem
    only if an "(A)" option appears before the next numbered line -- this filters
    out the directions' own 1-4 numbered list (which has no answer options).
    """
    nums = [(i, int(NUM_RE.match(l.strip()).group(1)))
            for i, l in enumerate(lines) if NUM_RE.match(l.strip())]
    starts = []
    for k, (i, n) in enumerate(nums):
        nxt = nums[k + 1][0] if k + 1 < len(nums) else len(lines)
        has_a = any((OPT_RE.match(lines[j].strip()) or [None]) and
                    OPT_RE.match(lines[j].strip()) and
                    OPT_RE.match(lines[j].strip()).group(1) == "A"
                    for j in range(i, nxt))
        if has_a:
            starts.append(i)
    problems = []
    for k, i in enumerate(starts):
        j = starts[k + 1] if k + 1 < len(starts) else len(lines)
        problems.append(lines[i:j])
    return problems

def pdf_parse_problem(block, unit):
    """Return (title, question_text, options{label:text})."""
    block = list(block)
    m = NUM_RE.match(block[0].strip())
    if m:
        block[0] = m.group(2)
    body, opts, cur = [], {}, None
    for l in block:
        s = l.strip()
        # a new passage header ends this question -- don't let the next passage's
        # text bleed into the last answer choice (or the stem).
        if PASSAGE_RE.match(s):
            break
        mo = OPT_RE.match(s)
        if mo:
            cur = mo.group(1)
            opts[cur] = [mo.group(2)]
        elif cur is not None:
            opts[cur].append(s)
        else:
            body.append(s)
    title = None
    # CR problems open with a short topic label (e.g. "MTC and Asthma"); RC/SC
    # questions are the stem itself, so only treat a label as a title for CR.
    if unit == "CR" and body and len(body[0]) < 55 and not body[0].rstrip().endswith((".", "?", ":", ",")):
        title = clean(body[0])
        body = body[1:]
    question = clean(" ".join(body))
    options = {k: clean(" ".join(v)) for k, v in opts.items()}
    return title, question, options

def pdf_parse_passages(lines):
    """
    For RC: return a list of (start_index, passage_title, passage_text) for each
    'Passage X: ...' block, with inline line-number markers stripped.
    """
    passages = []
    idxs = [i for i, l in enumerate(lines) if PASSAGE_RE.match(l.strip())]
    for k, i in enumerate(idxs):
        end = idxs[k + 1] if k + 1 < len(idxs) else len(lines)
        title = clean(PASSAGE_RE.match(lines[i].strip()).group(1))
        # passage text = lines after the header until the first question/option
        text_lines = []
        for j in range(i + 1, end):
            s = lines[j].strip()
            if NUM_RE.match(s) or OPT_RE.match(s):
                break
            text_lines.append(s)
        text = clean(LINE_NO_RE.sub(" ", " ".join(text_lines)))
        passages.append((i, title, text))
    return passages

def pdf_ordered_correct_letters(solutions_text):
    """
    Every RC answer analysis marks the right choice '(X) ...text... CORRECT.'.
    Return the answer letters in document order: for each 'CORRECT' marker, the
    nearest preceding '(A-E)' label. Solutions are in question order, so this
    list lines up with the questions when the counts match.
    """
    letters = []
    for cm in re.finditer(r"CORRECT", solutions_text):
        prefix = solutions_text[:cm.start()]
        labels = re.findall(r"\(([A-E])\)", prefix)
        letters.append(labels[-1] if labels else None)
    return letters

def pdf_rc_answer_by_stem(qstem, solutions_text):
    """
    Fallback for chapters where CORRECT-count != question-count: find the
    question's stem in the (whitespace-normalized) solution text and read the
    '(X)' label of the CORRECT choice in the window that follows.
    """
    if not qstem:
        return None
    flat = re.sub(r"\s+", " ", solutions_text)
    needle = re.sub(r"\s+", " ", qstem)[:55]
    pos = flat.find(needle)
    if pos < 0:
        return None
    window = flat[pos: pos + 3500]
    cpos = window.find("CORRECT")
    if cpos < 0:
        return None
    labels = re.findall(r"\(([A-E])\)", window[:cpos])
    return labels[-1] if labels else None

def pdf_rc_explanation_anchor(correct_opt_text, solution_part):
    """
    Per-question RC explanation, anchored on the correct choice's own text (which
    is unique to the question, so it can't be confused by duplicate question
    stems like "The primary purpose of the passage is to"). Returns the answer
    analysis window around that choice, or "" if the option text isn't found.
    """
    if not correct_opt_text:
        return ""
    flat = re.sub(r"\s+", " ", solution_part).strip()
    opt = re.sub(r"\s+", " ", correct_opt_text)
    pos = -1
    for n in (60, 40, 25):           # tolerate line-wrap differences
        pos = flat.find(opt[:n])
        if pos >= 0:
            break
    if pos < 0:
        return ""
    start = max(0, pos - 400)        # back up to include the question-type intro
    # trim the leading partial sentence so the window starts cleanly
    cut = flat.rfind(". ", start, pos)
    if cut != -1:
        start = cut + 2
    return clean(flat[start: pos + 1600])

def parse_pdf(path):
    pages = pdf_extract_pages(path)
    regions = pdf_regions(pages)
    if len(regions) != len(PROBLEMSET_CHAPTERS):
        print(f"  [warn] found {len(regions)} problem-set regions, "
              f"expected {len(PROBLEMSET_CHAPTERS)}; mapping by order anyway.")
    results = []
    for (ps_page, end_page), ch in zip(regions, PROBLEMSET_CHAPTERS):
        unit = unit_for_chapter(ch)
        region_text = "\n".join(pages[ps_page:end_page])
        problem_part, solution_part = _split_problem_solution(region_text)
        plines = _after_heading(problem_part, {"Problem Set"})
        problems = pdf_split_problems(plines)
        passages = pdf_parse_passages(plines) if unit == "RC" else []

        # RC: try a positional answer map (i-th CORRECT marker -> i-th question);
        # only trust it when the counts line up exactly.
        rc_letters = None
        if unit == "RC":
            ordered = pdf_ordered_correct_letters(solution_part)
            mc_count = sum(1 for b in problems
                           if len([1 for l in b if OPT_RE.match(l.strip())]) >= 2)
            if len(ordered) == mc_count and mc_count > 0:
                rc_letters = ordered

        qnum = 0
        mc_seen = 0
        # need start index of each problem block to map to its passage
        # recompute block start indices in plines
        starts = []
        if problems:
            # find each block's first line index within plines
            search_from = 0
            for blk in problems:
                first = blk[0]
                idx = plines.index(first, search_from)
                starts.append(idx)
                search_from = idx + 1

        for bi, block in enumerate(problems):
            qnum += 1
            title, question, options = pdf_parse_problem(block, unit)
            is_mc = len(options) >= 2
            if is_mc:
                mc_seen += 1

            passage = None
            if unit == "RC" and passages:
                pos = starts[bi] if bi < len(starts) else 0
                prev = [(pt, ttl) for (pi, ttl, pt) in
                        [(p[0], p[1], p[2]) for p in passages] if pi <= pos]
                if prev:
                    passage = prev[-1][0]
                else:
                    passage = passages[0][2]

            correct = None
            if is_mc:
                if unit == "CR":
                    correct = cr_answer_by_title(title, solution_part)
                elif unit == "RC":
                    if rc_letters is not None and (mc_seen - 1) < len(rc_letters):
                        correct = rc_letters[mc_seen - 1]
                    else:
                        stem = question.split("\n")[-1]
                        correct = pdf_rc_answer_by_stem(stem, solution_part)
                if correct is not None and correct not in options:
                    correct = None

            # explanation: for an answered RC question, anchor on the correct
            # choice's text (immune to duplicate stems); else best-effort slice.
            explanation = ""
            if unit == "RC" and correct:
                explanation = pdf_rc_explanation_anchor(options.get(correct), solution_part)
            if not explanation:
                explanation = _pdf_explanation(title, question, solution_part, unit)

            full_q = (f"{title}\n\n{question}" if (title and question) else (title or question))
            results.append({
                "id": f"{unit.lower()}-ch{ch}-q{qnum}",
                "type": unit if is_mc else "exercise",
                "chapter": CHAPTER_TITLES.get(ch, f"Chapter {ch}"),
                "title": title,
                "question": full_q,
                "passage": passage,
                "options": [{"label": k, "text": options[k]} for k in sorted(options)],
                "correct_answer": correct,
                "explanation": explanation,
                "format": "multiple_choice" if is_mc else "open_ended",
            })
    return results

def _pdf_explanation(title, question, solutions_text, unit):
    """Slice out this question's explanation from the chapter solution text."""
    anchor = None
    if unit == "CR" and title:
        m = re.search(re.escape(title) + r"\s*:?\s*The\s+(?:correct|best)\s+answer\s+is",
                      solutions_text, re.I)
        anchor = m.start() if m else None
    flat = re.sub(r"\s+", " ", solutions_text)
    if anchor is None:
        stem = re.sub(r"\s+", " ", question.split("\n")[-1])[:55]
        if stem:
            p = flat.find(stem)
            anchor = p if p >= 0 else None
        return clean(flat[anchor:anchor + 2600]) if anchor is not None else ""
    return clean(solutions_text[anchor:anchor + 2600])


# =========================================================================== #
# EPUB BACKEND  (used as the cross-check oracle; also a full backend on its own)
# =========================================================================== #

def epub_load_chapters(path):
    chapters = {}
    with zipfile.ZipFile(path) as z:
        for info in z.namelist():
            m = re.search(r"chapter(\d+)/chapter\d+\.xhtml$", info)
            if not m:
                continue
            ch = int(m.group(1))
            html = z.read(info).decode("utf-8", errors="replace")
            chapters[ch] = BeautifulSoup(html, "lxml")
    return chapters

def _el_text(el):
    if el is None:
        return ""
    parts = [clean(p.get_text(" ", strip=True)) for p in el.find_all("p")]
    parts = [p for p in parts if p]
    return clean_paras(parts) if parts else clean(el.get_text(" ", strip=True))

def _epub_passage_text(el):
    """RC passages in the EPUB are a run of <span class="ktp-numbered-line">, one
    per visual line, with each paragraph's first line indented by leading (nbsp)
    spaces. Join wrapped lines, split paragraphs on that indent -> blank-line text.
    Falls back to _el_text() if the passage isn't structured as numbered lines."""
    spans = el.find_all("span", class_="ktp-numbered-line")
    if not spans:
        return _el_text(el)
    paras, cur = [], []
    for s in spans:
        raw = s.get_text()                       # keep leading whitespace
        if re.match(r"^[ \t ]{2,}", raw) and cur:
            paras.append(" ".join(cur)); cur = []
        cur.append(raw.strip())
    if cur:
        paras.append(" ".join(cur))
    return clean_paras(paras)

def _epub_rc_answer(sol_li, n):
    for ol in sol_li.find_all("ol"):
        if "upper-alpha" not in " ".join(ol.get("class") or []):
            continue
        items = ol.find_all("li", recursive=False)
        if not (n - 1 <= len(items) <= n + 1):
            continue
        for i, li in enumerate(items):
            if re.search(r"\bCORRECT\b", li.get_text(" ", strip=True)):
                return LETTERS[i] if i < len(LETTERS) else None
    return None

def parse_epub(path):
    chapters = epub_load_chapters(path)
    results = []
    for ch in sorted(chapters):
        if ch not in CHAPTER_TITLES:
            continue
        soup = chapters[ch]
        unit = unit_for_chapter(ch)
        order = {id(el): i for i, el in enumerate(soup.descendants)}
        expl = soup.find("section", class_="explanations")
        end = order.get(id(expl), 10 ** 9) if expl else 10 ** 9
        start = 0
        for h2 in soup.find_all("h2"):
            if h2.get_text(strip=True).lower() == "problem set":
                start = order.get(id(h2), 0)
                break
        leaf = [li for li in soup.find_all("li", class_="ktp-question")
                if not li.find("li", class_="ktp-question")]
        questions = [li for li in leaf if start <= order.get(id(li), -1) < end]
        solutions = [li for li in (expl.find_all("li", class_="ktp-question") if expl else [])
                     if not li.find("li", class_="ktp-question")]
        sol_pairs = [(li, norm(li.get_text(" ", strip=True))) for li in solutions]
        expl_text = expl.get_text(" ", strip=True) if expl else ""
        passages = []
        if unit == "RC":
            seen = set()
            for el in soup.find_all(class_="ktp-passage"):
                o = order.get(id(el), -1)
                if not (start <= o < end):
                    continue
                txt = _epub_passage_text(el)
                key = norm(txt)[:60]
                if txt and key not in seen:
                    seen.add(key)
                    passages.append((o, txt))

        qnum = 0
        for i, qli in enumerate(questions):
            qnum += 1
            sec = qli.find("section") or qli
            ps = [clean(p.get_text(" ", strip=True)) for p in sec.find_all("p")]
            ps = [p for p in ps if p]
            title = None
            if ps:
                p0 = sec.find("p")
                em = p0.find("em") if p0 else None
                if em and clean(em.get_text()) == ps[0] and len(ps[0]) < 60:
                    title = ps[0]
            prompt = "\n".join(ps[1:] if title else ps)
            aset = qli.find("ol", class_="ktp-answer-set")
            options = []
            if aset:
                for k, li in enumerate(aset.find_all("li", recursive=False)):
                    t = clean(li.get_text(" ", strip=True))
                    if t:
                        options.append({"label": LETTERS[k], "text": t})
            is_mc = len(options) >= 2

            # match solution by stem content
            stem = ""
            for p in reversed(ps):
                if p.endswith("?"):
                    stem = p
                    break
            stem = stem or (ps[-1] if ps else "")
            key = norm(stem)[-70:]
            sol_li = None
            hits = [li for li, t in sol_pairs if key and key in t]
            if len(hits) == 1:
                sol_li = hits[0]
            elif len(hits) > 1:
                sol_li = hits[i] if i < len(hits) else hits[0]

            correct = None
            if is_mc:
                if unit == "CR":
                    if sol_li is not None:
                        correct = cr_answer_from_text(sol_li.get_text(" ", strip=True))
                    if correct is None:
                        correct = cr_answer_by_title(title, expl_text)
                elif unit == "RC" and sol_li is not None:
                    correct = _epub_rc_answer(sol_li, len(options))
                if correct is not None and correct not in {o["label"] for o in options}:
                    correct = None

            passage = None
            if unit == "RC" and passages:
                o = order.get(id(qli), 0)
                prev = [p for po, p in passages if po <= o]
                passage = prev[-1] if prev else passages[0][1]

            full_q = (f"{title}\n\n{prompt}" if (title and prompt) else (title or prompt))
            results.append({
                "id": f"{unit.lower()}-ch{ch}-q{qnum}",
                "type": unit if is_mc else "exercise",
                "chapter": CHAPTER_TITLES.get(ch, f"Chapter {ch}"),
                "title": title,
                "question": full_q,
                "passage": passage,
                "options": options,
                "correct_answer": correct,
                "explanation": _el_text(sol_li),
                "format": "multiple_choice" if is_mc else "open_ended",
            })
    return results


# =========================================================================== #
# OFFICIAL GUIDE BACKEND  (GMAT Official Guide 2024-2025, Focus Edition)
# =========================================================================== #
#
# A different book with a different structure from "All the Verbal". Verbal lives
# entirely in Chapter 8, in six clean sub-sections:
#
#     8.4 Practice Questions : Reading Comprehension   (passages + Q456-619)
#     8.5 Answer Key         : Reading Comprehension   ("NNN. X" numbered key)
#     8.6 Answer Explanations: Reading Comprehension   (restated Q + "X. Correct.")
#     8.7 Practice Questions : Critical Reasoning       (arguments + Q620-801)
#     8.8 Answer Key         : Critical Reasoning
#     8.9 Answer Explanations: Critical Reasoning       (+ "The correct answer is X.")
#
# Two INDEPENDENT answer signals exist within this single PDF and are cross-checked
# against each other (the project's anti-hallucination guarantee, here intra-file):
#     (1) the numbered Answer Key  -> the book's authoritative key, complete.
#     (2) the explanation's marker -> "(X)... Correct." / "The correct answer is X."
# The shipped answer is the numbered key; a question whose two signals DISAGREE is
# reported as a conflict and its answer left null rather than guessed.
#
# This PDF's text is extracted with PyMuPDF (fitz), not pdfplumber: pdfplumber
# drops this file's fi/fl ligatures ("scienti ic") and maps its smart quotes/dashes
# to U+FFFD, whereas fitz returns clean Unicode that clean()/SMART normalize.

OG_SECT = re.compile(r"8\.([4-9])\s+(Practice Questions|Answer Key|Answer Explanations)"
                     r":\s+(Reading Comprehension|Critical Reasoning)")
OG_NUM  = re.compile(r"^\s*(\d{3,4})\.\s+(.*)")
OG_OPT  = re.compile(r"^\s*([A-E])\.\s+(.*)")
OG_LINEMARK = re.compile(r"^\s*\(\d{1,3}\)\s*$")               # passage line markers (5),(10)
_DASH = r"[–—-]"   # en-dash / em-dash / hyphen (raw text, pre-clean())
OG_QREF = re.compile(r"^\s*Questions?\s+(\d+)(?:\s*" + _DASH + r"\s*(\d+))?\s+refers?\s+to the passage", re.I)
OG_DIFF = re.compile(r"Questions\s+(\d+)\s*" + _DASH + r"\s*(\d+)\s*" + _DASH + r"\s*Difficulty:\s*(\w+)")
OG_TS   = re.compile(r"^\s*\d\d/\d\d/\d{4},\s*\d\d:\d\d\s*$")   # "23/06/2024, 22:25"
OG_PG   = re.compile(r"^\s*\d+/\d+\s*$")                        # "10/481" page counter

# RC = 456-619, CR = 620-801 (verified contiguous against the printed answer key).
OG_RC_RANGE = (456, 619)
OG_CR_RANGE = (620, 801)

# --- Question sub-typing -------------------------------------------------- #
# The OG prints a category heading in each answer explanation (on its own line,
# right after the restated options). For RC these ARE the GMAT's official question
# types; we read them verbatim (source-faithful). For CR the book only prints 3
# broad buckets, so we ALSO infer a finer task from the question stem wording.
OG_RC_TYPES = {"Main Idea", "Supporting Idea", "Supporting Ideas", "Inference",
               "Application", "Evaluation", "Logical Structure", "Style and Tone",
               "Detail", "Purpose"}
OG_CR_CATS = {"Argument Construction", "Argument Evaluation", "Evaluation of a Plan"}

def _og_category(blk, cats):
    """First explanation line that is exactly one of `cats` (the printed heading)."""
    for l in blk:
        t = l.strip()
        if t in cats:
            return "Supporting Idea" if t == "Supporting Ideas" else t
    return None

# Ordered (priority) rules mapping a CR stem to a finer task type. Earlier rules win.
# Each pattern is matched against the whitespace-normalized, lowercased stem. These
# are INFERRED from the question wording (the OG does not print them); a stem that
# matches no rule is left "Unclassified" rather than guessed.
_OG_CR_RULES = [
    ("Boldface / Method", r"boldface"),
    ("Flaw", r"vulnerab\w+ to (the |these )?(criticism|objection|grounds)|"
             r"logical(ly)? flaw|flaw in (the|its|her|his) reasoning|"
             r"reasoning is (most )?(flawed|questionable|vulnerable)|"
             r"criticism on which|error in reasoning"),
    ("Weaken", r"\bweaken|cast(s)? (the most |serious )?doubt|calls? into question|"
               r"argues against|undermin\w+|points? to the most serious weakness|"
               r"most seriously (weaken|undermin)|damage(s)? the argument"),
    ("Assumption", r"depends on (the )?assum|assumes (which|that)|"
                   r"assumption (on |upon )?which|presuppos|relies on the assum|"
                   r"required? (by the argument|assuming)|the argument depends on"),
    ("Explain a Discrepancy", r"resolve|discrepanc|paradox|reconcile|"
                              r"helps? to explain|explain(s)? (the|why|the apparent|this)|"
                              r"account(s)? for (the|this|why)"),
    ("Evaluate", r"\bevaluat\w+|useful to (know|determine|establish)|"
                 r"most relevant in (evaluating|determining|assessing)|"
                 r"help(s|ful)? (to )?(determine|evaluate)|answer to which of"),
    ("Inference / Conclusion", r"supports? which of the following|"
                               r"most strongly supported by|if the (statements|information) "
                               r"(above|given) (are|is) true|can be (properly )?(inferred|concluded)|"
                               r"\bmust (also )?be true|properly (drawn|inferred)|"
                               r"which of the following can be (inferred|concluded)"),
    ("Complete the Argument", r"logically completes? the (argument|passage)|"
                              r"most logically complete"),
    ("Strengthen", r"\bstrengthen|most strongly supports|justif\w+|best reason|"
                   r"strongest (support|evidence|reason)|most help(s)? to (support|justify)|"
                   r"provides? (the )?(most |strongest )?support"),
    ("Plan", r"\bplan\b|strateg\w+|objective|achieve its (goal|aim|objective)|predict"),
]

def _og_cr_task(stem):
    s = re.sub(r"\s+", " ", stem or "").lower()
    for label, pat in _OG_CR_RULES:
        if re.search(pat, s):
            return label
    return "Unclassified"


_OG_EXPL_HEADERS = {"Situation", "Reasoning"}   # CR explanation sub-headings
_OG_OPT_LINE = re.compile(r"^([A-E])\.\s")
_OG_ANS_LINE = re.compile(r"^The correct answer is", re.I)

def _og_format_explanation(blk, category):
    """
    Turn a raw explanation block into readable, paragraph-separated text.

    The OG prints each explanation as: the restated question + the five restated
    options, then a category heading (e.g. "Main Idea" / "Argument Evaluation"),
    then the reasoning, then a per-choice analysis ("A. ... B. Correct. ..."), then
    "The correct answer is X." The restated question/options are already shown by
    the app above the explanation, so they are dropped here; everything from the
    category heading on is kept, with the heading, the CR "Situation"/"Reasoning"
    sub-headings, each per-choice note, and the final answer line each on their own
    paragraph. No words are changed -- only paragraph breaks are (re)introduced.
    """
    lines = [l.strip() for l in blk if not _og_is_junk(l) and l.strip()]
    cat_variants = set()
    if category:
        cat_variants.add(category)
        if category == "Supporting Idea":
            cat_variants.add("Supporting Ideas")
    # Drop the restated stem + options preceding the category heading.
    start = 0
    for i, s in enumerate(lines):
        if s in cat_variants:
            start = i
            break
    paras, cur = [], []
    def flush():
        if cur:
            paras.append(" ".join(cur))
            cur.clear()
    for s in lines[start:]:
        is_header = s in cat_variants or s in _OG_EXPL_HEADERS
        if is_header or _OG_OPT_LINE.match(s) or _OG_ANS_LINE.match(s):
            flush()
            cur.append(s)
            if is_header:                # a heading stands on its own line
                flush()
        else:
            cur.append(s)
    flush()
    return clean_paras(paras)


def _og_is_junk(line):
    """Page furniture that must never be mistaken for question/option/passage text."""
    s = line.strip()
    if not s:
        return True
    # NOTE: OG_DIFF/OG_QREF/OG_LINEMARK are normalized by clean() at call sites that
    # need their values; here we just drop them as content.
    if OG_TS.match(s) or OG_PG.match(s):
        return True
    if s.startswith("file:///"):
        return True
    if s.startswith("To register for the GMAT"):
        return True
    if s.startswith("Each of the") and "questions" in s:
        return True
    if OG_SECT.search(s) or OG_DIFF.search(s):
        return True
    if s == "Line" or OG_LINEMARK.match(s):
        return True
    return False


def _og_find_sections(pages):
    """Map '8.N' -> first body page index (skipping the table of contents)."""
    heads = {}
    for i, t in enumerate(pages):
        if i <= 20:
            continue
        m = OG_SECT.search(t)
        if m:
            heads.setdefault("8." + m.group(1), i)
    return heads


def _og_parse_key(pages, lo, hi):
    """Standalone 'NNN. X' lines are the answer key (and only the key)."""
    d = {}
    for i in range(lo, hi + 1):
        for l in pages[i].splitlines():
            m = re.match(r"^\s*(\d{3,4})\.\s*([A-E])\s*$", l.strip())
            if m:
                d[int(m.group(1))] = m.group(2)
    return d


def _og_parse_bands(pages, lo, hi):
    """Difficulty bands, e.g. (456, 500, 'Easy'), from the explanation headers."""
    bands = []
    for i in range(lo, hi):
        for m in OG_DIFF.finditer(pages[i]):
            bands.append((int(m.group(1)), int(m.group(2)), m.group(3)))
    return bands


def _og_difficulty(n, bands):
    for a, b, d in bands:
        if a <= n <= b:
            return d
    return None


def _og_parse_explanations(pages, lo, hi, rng, stop_re=None, cats=None):
    """
    {qnum: (marker_answer, explanation_text, category)} for one section. Includes
    page `hi` because each explanation section spills onto the next section's first
    page; `stop_re` halts before that next section's own heading. `cats` is the set
    of printed category headings to look for (RC types / CR buckets).
    """
    stop = re.compile(stop_re) if stop_re else None
    lines = []
    for i in range(lo, hi + 1):
        for l in pages[i].splitlines():
            if stop and stop.search(l):
                break
            lines.append(l)
    blocks, cur, buf = {}, None, []
    for l in lines:
        m = OG_NUM.match(l)
        if m and rng[0] <= int(m.group(1)) <= rng[1]:
            if cur is not None:
                blocks[cur] = buf
            cur, buf = int(m.group(1)), [l]
        elif cur is not None:
            buf.append(l)
    if cur is not None:
        blocks[cur] = buf
    out = {}
    for n, blk in blocks.items():
        text = "\n".join(blk)
        ans = None
        m = re.search(r"(?m)^\s*([A-E])\.\s+Correct\.", text)          # RC + CR
        if m:
            ans = m.group(1)
        else:
            m2 = re.search(r"The correct answer is\s+([A-E])", text)    # CR phrasing
            if m2:
                ans = m2.group(1)
        category = _og_category(blk, cats) if cats else None
        out[n] = (ans, _og_format_explanation(blk, category), category)
    return out


def _og_parse_rc_practice(pages, lo, hi):
    """Return (questions, passages{qnum:text}). `hi` is the Answer Key page; its
    pre-heading lines hold the last questions, so include it but stop at 8.5."""
    lines = []
    for i in range(lo, hi + 1):
        for l in pages[i].splitlines():
            if re.search(r"8\.5\s+Answer Key", l):
                break
            lines.append(l)
    start = 0
    for j, l in enumerate(lines):
        if re.search(r"8\.4\s+Practice Questions", l):
            start = j + 1
            break
    lines = lines[start:]

    passages, questions = {}, []
    # pbuf is a list of paragraphs (each a list of line-fragments). The PDF marks
    # every paragraph's first line with a leading em-space (U+2003); that indent is
    # the only paragraph-boundary signal in the linear text, so it drives the split.
    mode, pbuf, cur_q = "passage", [], None
    EMSP = " "

    def flush():
        nonlocal cur_q
        if cur_q is None:
            return
        num, stem, opts, _ = cur_q
        questions.append({"num": num, "stem": clean(" ".join(stem)),
                          "options": {k: clean(" ".join(v)) for k, v in opts.items()}})
        cur_q = None

    for l in lines:
        if l.strip() == "Line":                 # a standalone "Line" begins a new passage
            flush()
            pbuf, mode = [], "passage"
            continue
        mq = OG_QREF.match(l)
        if mq:
            flush()
            a = int(mq.group(1)); b = int(mq.group(2)) if mq.group(2) else a
            ptext = clean_paras([" ".join(p) for p in pbuf])
            for n in range(a, b + 1):
                passages[n] = ptext
            pbuf, mode = [], "questions"
            continue
        if mode == "passage":
            if not _og_is_junk(l):
                if l.lstrip(" \t").startswith(EMSP) or not pbuf:
                    pbuf.append([l.strip()])     # em-space -> start a new paragraph
                else:
                    pbuf[-1].append(l.strip())
            continue
        if _og_is_junk(l):
            continue
        mn = OG_NUM.match(l)
        if mn and OG_RC_RANGE[0] <= int(mn.group(1)) <= OG_RC_RANGE[1]:
            flush()
            cur_q = (int(mn.group(1)), [mn.group(2)], {}, None)
            continue
        mo = OG_OPT.match(l)
        if mo and cur_q is not None:
            num, stem, opts, _ = cur_q
            opts[mo.group(1)] = [mo.group(2)]
            cur_q = (num, stem, opts, mo.group(1))
            continue
        if cur_q is not None:
            num, stem, opts, curl = cur_q
            (opts[curl] if curl else stem).append(l.strip())
    flush()
    return questions, passages


def _og_parse_cr_practice(pages, lo, hi):
    lines = []
    for i in range(lo, hi + 1):
        for l in pages[i].splitlines():
            if re.search(r"8\.8\s+Answer Key", l):
                break
            lines.append(l)
    start = 0
    for j, l in enumerate(lines):
        if re.search(r"8\.7\s+Practice Questions", l):
            start = j + 1
            break
    lines = lines[start:]
    questions, cur_q = [], None

    def flush():
        nonlocal cur_q
        if cur_q is None:
            return
        num, stem, opts, _ = cur_q
        questions.append({"num": num, "stem": clean(" ".join(stem)),
                          "options": {k: clean(" ".join(v)) for k, v in opts.items()}})
        cur_q = None

    for l in lines:
        if _og_is_junk(l):
            continue
        mn = OG_NUM.match(l)
        if mn and OG_CR_RANGE[0] <= int(mn.group(1)) <= OG_CR_RANGE[1]:
            flush()
            cur_q = (int(mn.group(1)), [mn.group(2)], {}, None)
            continue
        mo = OG_OPT.match(l)
        if mo and cur_q is not None:
            num, stem, opts, _ = cur_q
            opts[mo.group(1)] = [mo.group(2)]
            cur_q = (num, stem, opts, mo.group(1))
            continue
        if cur_q is not None:
            num, stem, opts, curl = cur_q
            (opts[curl] if curl else stem).append(l.strip())
    flush()
    return questions


def parse_og(pdf_path):
    """
    Extract OG 2024-2025 Verbal (RC + CR) into the project's record schema, with
    an intra-file cross-validation report. Returns (records, report_dict).
    """
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    pages = [doc[i].get_text() for i in range(len(doc))]

    H = _og_find_sections(pages)
    needed = ["8.4", "8.5", "8.6", "8.7", "8.8", "8.9"]
    missing = [s for s in needed if s not in H]
    if missing:
        raise RuntimeError(f"OG: could not locate sections {missing}; got {H}")

    rc_key = _og_parse_key(pages, H["8.5"], H["8.6"])
    cr_key = _og_parse_key(pages, H["8.8"], H["8.9"])
    rc_bands = _og_parse_bands(pages, H["8.6"], H["8.7"])
    cr_bands = _og_parse_bands(pages, H["8.9"], len(pages))

    # CR explanations end at the last page that states an answer (bounds q801's block
    # so it doesn't swallow the rest of the book).
    cr_expl_hi = max(i for i in range(H["8.9"], len(pages))
                     if "The correct answer is" in pages[i])
    rc_expl = _og_parse_explanations(pages, H["8.6"], H["8.7"], OG_RC_RANGE,
                                     r"8\.7\s+Practice Questions", cats=OG_RC_TYPES)
    cr_expl = _og_parse_explanations(pages, H["8.9"], cr_expl_hi, OG_CR_RANGE,
                                     cats=OG_CR_CATS)

    rc_q, rc_pass = _og_parse_rc_practice(pages, H["8.4"], H["8.5"])
    cr_q = _og_parse_cr_practice(pages, H["8.7"], H["8.8"])

    records, report = [], {"agree": 0, "conflict": 0, "key_only": 0,
                           "conflicts": [], "no_answer": [],
                           "no_subtype": [], "cr_unclassified": []}

    def emit(qs, key, expl, bands, unit, passages=None):
        nice = "Reading Comprehension" if unit == "RC" else "Critical Reasoning"
        for q in qs:
            n = q["num"]
            key_ans = key.get(n)
            mark_ans = expl.get(n, (None, "", None))[0]
            # Reconcile the two independent signals.
            if key_ans and mark_ans:
                if key_ans == mark_ans:
                    correct = key_ans; report["agree"] += 1
                else:
                    correct = None; report["conflict"] += 1
                    report["conflicts"].append((n, key_ans, mark_ans))
            elif key_ans:
                correct = key_ans; report["key_only"] += 1
            else:
                correct = mark_ans  # may be None
            if correct is None:
                report["no_answer"].append(n)
            if correct is not None and correct not in q["options"]:
                correct = None
            diff = _og_difficulty(n, bands)
            category = expl.get(n, (None, "", None))[2]   # book's printed label
            if unit == "RC":
                # RC: the book's printed type IS the GMAT question type.
                subtype = category
                if subtype is None:
                    report["no_subtype"].append(n)
            else:
                # CR: finer task inferred from the stem (the book prints only the
                # 3 broad `category` buckets); left "Unclassified" when uncertain.
                subtype = _og_cr_task(q["stem"])
                if subtype == "Unclassified":
                    report["cr_unclassified"].append(n)
            records.append({
                "id": f"og-{unit.lower()}-q{n}",
                "type": unit,
                "chapter": f"{nice}{(' — ' + diff) if diff else ''}",
                "title": None,
                "question": q["stem"],
                "passage": (passages or {}).get(n),
                "options": [{"label": k, "text": q["options"][k]}
                            for k in sorted(q["options"])],
                "correct_answer": correct,
                "explanation": expl.get(n, (None, "", None))[1],
                "format": "multiple_choice",
                "difficulty": diff,
                "subtype": subtype,            # RC: book type · CR: inferred task
                "category": category,          # the book's printed label (verbatim)
                "number": n,
                "source": "GMAT Official Guide 2024-2025",
            })

    emit(rc_q, rc_key, rc_expl, rc_bands, "RC", rc_pass)
    emit(cr_q, cr_key, cr_expl, cr_bands, "CR")
    report["counts"] = {"RC": len(rc_q), "CR": len(cr_q),
                        "rc_key": len(rc_key), "cr_key": len(cr_key)}
    return records, report


def run_og(pdf_path):
    """Parse the Official Guide, print coverage + intra-file cross-validation,
    and write questions-og.json."""
    print(f"Source (Official Guide PDF): {pdf_path}")
    records, rep = parse_og(pdf_path)
    mc = [r for r in records if r["format"] == "multiple_choice"]
    answered = [r for r in mc if r["correct_answer"]]
    print("\n" + "=" * 60)
    print("COVERAGE SUMMARY  (GMAT Official Guide 2024-2025, Focus Edition)")
    print("=" * 60)
    print(f"Total Verbal problems extracted : {len(records)}")
    for unit in ("RC", "CR"):
        u = [r for r in records if r["type"] == unit]
        ua = [r for r in u if r["correct_answer"]]
        print(f"  {unit}: {len(ua)}/{len(u)} with confirmed answer")
    print(f"Confirmed answers (total)        : {len(answered)}/{len(mc)}")
    print("\n" + "-" * 60)
    print("CROSS-VALIDATION  (numbered Answer Key  vs  explanation marker)")
    print("-" * 60)
    print(f"Both signals present & AGREE     : {rep['agree']}")
    print(f"Key present, marker absent (kept): {rep['key_only']}")
    print(f"Signals DISAGREE (answer->null)  : {rep['conflict']}")
    for n, ka, ma in rep["conflicts"]:
        print(f"    CONFLICT q{n}: key={ka} marker={ma}")
    if rep["no_answer"]:
        print(f"Left null (unconfirmable)        : {len(rep['no_answer'])} {rep['no_answer']}")
    if rep["conflict"] == 0 and not rep["no_answer"]:
        print("  => Every answer confirmed by the key; no key/marker disagreed.")

    # Sub-type coverage
    from collections import Counter
    print("\n" + "-" * 60)
    print("QUESTION SUB-TYPES")
    print("-" * 60)
    rc_sub = Counter(r["subtype"] for r in records if r["type"] == "RC")
    cr_sub = Counter(r["subtype"] for r in records if r["type"] == "CR")
    print("RC types (from the book's printed labels — source-faithful):")
    for k, v in rc_sub.most_common():
        print(f"    {v:>3}  {k}")
    print(f"  RC with a type: {sum(v for k,v in rc_sub.items() if k)}/{sum(rc_sub.values())}")
    print("CR tasks (inferred from the question stem wording):")
    for k, v in cr_sub.most_common():
        print(f"    {v:>3}  {k}")
    classified = sum(v for k, v in cr_sub.items() if k != "Unclassified")
    print(f"  CR classified: {classified}/{sum(cr_sub.values())}"
          f"  ({len(rep['cr_unclassified'])} left Unclassified)")

    with open("questions-og.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"\nWrote questions-og.json ({len(records)} RC+CR problems).")


# =========================================================================== #
# Cross-validation + reporting
# =========================================================================== #

def cross_check(primary, oracle):
    """
    Compare confirmed answers between two extractions, matched by normalized
    question text. Returns (agree, disagree[list], only_primary, only_oracle).
    """
    def index(qs):
        d = {}
        for q in qs:
            if q["correct_answer"]:
                d[norm(q["question"])[:80]] = q
        return d
    a, b = index(primary), index(oracle)
    agree = disagree = 0
    conflicts = []
    for k, q in a.items():
        if k in b:
            if q["correct_answer"] == b[k]["correct_answer"]:
                agree += 1
            else:
                disagree += 1
                conflicts.append((q["id"], q["correct_answer"], b[k]["correct_answer"]))
    return agree, disagree, conflicts


def merge_format_from_oracle(primary, oracle):
    """
    For the Manhattan book the PDF is the answer source of record, but the EPUB
    extraction is far better formatted: clean paragraph breaks in passages and
    cleaner, per-question explanations. Borrow that FORMATTING from the EPUB
    without ever changing a PDF answer, matched by id:
      * passage     -> use the EPUB's paragraph-formatted passage when its text
                       essentially matches the PDF's (same words, just breaks);
      * explanation -> use the EPUB's explanation only when the EPUB's answer
                       AGREES with the PDF's, so a shipped explanation never argues
                       for a different letter than the shipped answer. (This leaves
                       the one known PDF/EPUB conflict on its PDF explanation.)
    Returns (passages_updated, explanations_updated).
    """
    import difflib
    by_id = {q["id"]: q for q in oracle}
    npsg = nexp = 0
    for q in primary:
        e = by_id.get(q["id"])
        if not e:
            continue
        if q.get("passage") and e.get("passage") and "\n\n" in e["passage"] \
                and difflib.SequenceMatcher(None, norm(q["passage"]),
                                            norm(e["passage"])).ratio() >= 0.95:
            q["passage"] = e["passage"]; npsg += 1
        if e.get("explanation") and q.get("correct_answer") \
                and e.get("correct_answer") == q["correct_answer"]:
            q["explanation"] = e["explanation"]; nexp += 1
    return npsg, nexp


def summarize(all_q):
    by_type = Counter(q["type"] for q in all_q)
    mc = [q for q in all_q if q["format"] == "multiple_choice"]
    oe = [q for q in all_q if q["format"] == "open_ended"]
    mc_ans = [q for q in mc if q["correct_answer"]]
    print("\n" + "=" * 60)
    print("COVERAGE SUMMARY")
    print("=" * 60)
    print(f"Total problems extracted : {len(all_q)}")
    print(f"  Multiple choice        : {len(mc)}")
    print(f"  Open-ended exercises   : {len(oe)}")
    print("\nBy type:")
    for t in ("SC", "RC", "CR", "exercise"):
        if by_type.get(t):
            print(f"  {t:<9}: {by_type[t]}")
    print("\nAnswer key (multiple-choice):")
    print(f"  Confirmed answer       : {len(mc_ans)}")
    print(f"  Could not infer (null) : {len(mc) - len(mc_ans)}")
    print("\nMC answer coverage by section:")
    for unit in ("CR", "RC", "SC"):
        u = [q for q in mc if q["type"] == unit]
        ua = [q for q in u if q["correct_answer"]]
        if u:
            print(f"  {unit}: {len(ua)}/{len(u)} with confirmed answer")


def discover_og():
    """Auto-find the Official Guide PDF by filename ('official' + 'guide')."""
    dirs = [".", os.path.expanduser("~/Downloads"), os.path.expanduser("~/Desktop"),
            os.path.expanduser("~/Documents"), os.path.expanduser("~/OneDrive/Desktop")]
    for d in dirs:
        for p in glob.glob(os.path.join(d, "**", "*.pdf"), recursive=True):
            n = os.path.basename(p).lower()
            if "official" in n and "guide" in n:
                return p
    return None


def main():
    args = [a for a in sys.argv[1:]]
    pdf_path = epub_path = og_path = None
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--pdf":
            pdf_path = args[i + 1]; i += 2; continue
        if a == "--epub":
            epub_path = args[i + 1]; i += 2; continue
        if a == "--og":
            og_path = args[i + 1]; i += 2; continue
        if a.lower().endswith(".pdf"):
            pdf_path = a
        elif a.lower().endswith(".epub"):
            epub_path = a
        i += 1

    # Official Guide path: a separate book (Focus Edition) that ships to its own
    # questions-og.json. Triggered by --og, or by a bare .pdf whose name looks
    # like the Official Guide, or by auto-discovery when nothing else is given.
    if not og_path:
        if pdf_path and "official" in os.path.basename(pdf_path).lower() \
                and "guide" in os.path.basename(pdf_path).lower():
            og_path, pdf_path = pdf_path, None
    if not og_path and not pdf_path and not epub_path:
        og_path = discover_og()
    if og_path:
        run_og(og_path)
        return

    pdf_path = pdf_path or discover("pdf")
    epub_path = epub_path or discover("epub")

    if not pdf_path and not epub_path:
        sys.exit("No book file found. Pass the .pdf (or .epub) path.")

    primary = primary_src = None
    oracle = oracle_src = None

    # Prefer the PDF as the source of record (it's the file in the brief); fall
    # back to EPUB if no PDF. Use whichever other file exists as the oracle.
    if pdf_path:
        print(f"Primary source (PDF): {pdf_path}")
        primary, primary_src = parse_pdf(pdf_path), "PDF"
        if epub_path and BeautifulSoup is not None:
            print(f"Cross-check source (EPUB): {epub_path}")
            oracle, oracle_src = parse_epub(epub_path), "EPUB"
    else:
        if BeautifulSoup is None:
            sys.exit("Only an EPUB was found but beautifulsoup4 is not installed.")
        print(f"Primary source (EPUB): {epub_path}")
        primary, primary_src = parse_epub(epub_path), "EPUB"

    summarize(primary)

    if oracle is not None:
        agree, disagree, conflicts = cross_check(primary, oracle)
        print("\n" + "-" * 60)
        print(f"CROSS-VALIDATION  ({primary_src} vs {oracle_src})")
        print("-" * 60)
        print(f"Confirmed answers that appear in both & AGREE : {agree}")
        print(f"Confirmed answers that DISAGREE               : {disagree}")
        for cid, pa, oa in conflicts:
            print(f"    CONFLICT {cid}: {primary_src}={pa} {oracle_src}={oa}")
        if disagree == 0:
            print("  => Two independent extractions agree on every shared answer.")

        # Borrow the EPUB's cleaner formatting (paragraph breaks) onto the shipped
        # PDF records, without changing any PDF answer. See merge_format_from_oracle.
        npsg, nexp = merge_format_from_oracle(primary, oracle)
        print(f"\nFORMATTING ({oracle_src} layout, {primary_src} answers kept)")
        print("-" * 60)
        print(f"Passages given paragraph breaks : {npsg}")
        print(f"Explanations replaced (clean, answer-matched) : {nexp}")

    # Ship only the current-GMAT Verbal types. Sentence Correction is dropped:
    #   * it was removed from the GMAT in the Focus Edition (current exam);
    #   * the book's SC items are 2-3 option teaching drills whose prose
    #     solutions carry no reliable answer key (answers would have to be
    #     guessed), and their option boundaries don't survive linear-PDF text
    #     extraction cleanly. Per the brief, correctness beats volume.
    shipped = [q for q in primary if q["type"] in ("CR", "RC")]
    dropped_sc = len(primary) - len(shipped)
    print(f"\nExcluding {dropped_sc} Sentence Correction items from questions.json:")
    print("  SC is not on the current GMAT (Focus Edition) and the book's SC")
    print("  drills have no reliable answer key. CR + RC are the current types.")

    with open("questions.json", "w", encoding="utf-8") as f:
        json.dump(shipped, f, ensure_ascii=False, indent=2)
    print(f"\nWrote questions.json ({len(shipped)} CR+RC problems) from {primary_src}.")


if __name__ == "__main__":
    main()
