#!/usr/bin/env python3
"""
parse_quant.py - Extract GMAT Quant (PS + DS) from Manhattan Review
Quantitative Question Bank 6th Ed into questions-quant.json.

Usage:
    python parse_quant.py "<pdf_path>"
    python parse_quant.py "<pdf_path>" --ps-topics "Number properties" --ds-topics "Numbers"

Equation handling:
    Uses fitz page.get_text('dict') which returns per-span font-size and y-position.
    - Superscripts: size < 8.0 (vs normal 9.5)
    - Fractions: separate blocks at different y-levels with x-range overlap
    - Square roots: literal sqrt/radical char in Unicode
    No visual guessing -- the PDF's own TeX encoding drives the reconstruction.

Answer validation:
    PRIMARY  -- numbered Answer Key pages (NNN) X
    SECONDARY -- solution text "The correct answer is option X."
    If they disagree -> null + needs_review flag. Never guessed.
"""

import sys
import os
import re
import json
from collections import Counter, defaultdict

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("ERROR: PyMuPDF not installed. Run: pip install pymupdf")

try:
    from PIL import Image
    import io
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("WARNING: Pillow not installed -- diagram cropping disabled. "
          "Run: pip install Pillow")

# Bring in embed_questions from the existing parser (graceful if unavailable)
try:
    sys.path.insert(0, os.path.dirname(__file__))
    from parser import embed_questions
except Exception:
    def embed_questions(questions):
        print("WARNING: Could not import embed_questions from parser.py -- skipping embeddings.")
        return questions

# =========================================================================== #
# Constants
# =========================================================================== #

PDF_PATH_DEFAULT = None   # filled by main()

SQRT_CHARS = {'√', '∛', '∜'}  # sqrt cube-root fourth-root

DS_CHOICES = [
    {"label": "A",
     "text": "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient."},
    {"label": "B",
     "text": "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient."},
    {"label": "C",
     "text": "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient."},
    {"label": "D",
     "text": "EACH statement ALONE is sufficient."},
    {"label": "E",
     "text": "Statements (1) and (2) TOGETHER are not sufficient."},
]

SOURCE_LABEL = "Manhattan Review Quantitative Question Bank 6th Ed"

# Normal body font size in this PDF
NORMAL_SIZE = 9.5
SUP_SIZE_MAX = 8.0       # spans with size <= this are superscripts
FRAC_Y_MIN = 4.5         # y-offset (px) to classify as fraction rather than superscript

# =========================================================================== #
# Text / LaTeX helpers
# =========================================================================== #

def _slug(text):
    """kebab-case slug for topic labels."""
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def _clean(text):
    """Collapse whitespace, strip. Keep math chars intact."""
    text = text.replace('\x12', '').replace('\x13', '')
    return re.sub(r'\s+', ' ', text).strip()


def _span_text(span):
    return span['text']


def _span_y(span):
    return span['origin'][1]


def _span_x(span):
    return span['origin'][0]


def _span_size(span):
    return span['size']


def _block_y_min(block):
    return block['bbox'][1]


def _block_y_max(block):
    return block['bbox'][3]


def _block_x_min(block):
    return block['bbox'][0]


def _block_x_max(block):
    return block['bbox'][2]


def _all_spans(block):
    """Flatten all spans from a text block, in order."""
    spans = []
    for line in block.get('lines', []):
        spans.extend(line.get('spans', []))
    return spans


def _collect_text(spans):
    """Concatenate span texts, ignoring control chars."""
    parts = []
    for s in spans:
        t = s['text']
        if t in ('\x12', '\x13'):
            continue
        parts.append(t)
    return ''.join(parts)


# =========================================================================== #
# Equation / LaTeX reconstruction (from structured spans)
# =========================================================================== #

def _spans_to_latex(spans, extra_den_blocks=None):
    """
    Convert a list of fitz span dicts (from one logical section) plus
    optional extra denominator blocks into (plain_text, latex_text).

    Rules (all purely structural -- no guessing):
      - span.size < SUP_SIZE_MAX => superscript, attach to preceding token
      - sqrt character (radical symbol) => \\sqrt{...}
      - extra_den_blocks present => wrap numerator/denominator in \frac{}{}
      - \x12 / \x13 control chars (TeX fraction delimiters) signal inline
        fractions: split spans between them by y-level into num/den
    """
    # Filter empties and control chars
    work = [s for s in spans if s['text'].strip() and s['text'] not in ('\x12', '\x13')]

    if not work:
        if extra_den_blocks:
            # Den block with empty numerator
            den_text = _clean(_collect_text(
                [sp for blk in extra_den_blocks for sp in _all_spans(blk)]
            ))
            return ('1/' + den_text, r'$\frac{1}{' + den_text + r'}$')
        return ('', '')

    # Check whether we have an inline fraction (spans at 2+ y-levels, normal size)
    ys = [round(_span_y(s) / 2) * 2 for s in work if _span_size(s) >= SUP_SIZE_MAX]
    y_counts = Counter(ys)
    dom_y = y_counts.most_common(1)[0][0] if y_counts else None

    # Classify spans
    main_s = []   # normal text at dominant y
    sup_s = []    # superscripts (small size)
    fnum_s = []   # fraction numerator (normal size, above dom_y by >= FRAC_Y_MIN)
    fden_s = []   # fraction denominator (normal size, below dom_y by >= FRAC_Y_MIN)

    for s in work:
        if _span_size(s) < SUP_SIZE_MAX:
            sup_s.append(s)
            continue
        if dom_y is None:
            main_s.append(s); continue
        offset = dom_y - round(_span_y(s) / 2) * 2
        if offset >= FRAC_Y_MIN:
            fnum_s.append(s)
        elif offset <= -FRAC_Y_MIN:
            fden_s.append(s)
        else:
            main_s.append(s)

    has_inline_frac = bool(fnum_s or fden_s)
    has_block_frac = bool(extra_den_blocks)

    if not has_inline_frac and not has_block_frac:
        # Simple case: main text + superscripts
        return _build_simple(main_s, sup_s)

    if has_block_frac and not has_inline_frac:
        # Option-level fraction: numerator = this block, denominator = extra block(s)
        den_spans = [sp for blk in extra_den_blocks for sp in _all_spans(blk)]
        den_spans = [s for s in den_spans if s['text'].strip() and s['text'] not in ('\x12', '\x13')]
        # The numerator is main_s + sup_s
        num_plain, num_latex = _build_simple(
            [s for s in main_s if s['text'].strip()], sup_s
        )
        den_plain, den_latex = _build_simple(
            [s for s in den_spans if _span_size(s) >= SUP_SIZE_MAX],
            [s for s in den_spans if _span_size(s) < SUP_SIZE_MAX],
        )
        plain = f'({num_plain})/({den_plain})' if den_plain else num_plain
        latex = r'\frac{' + num_latex.strip('$') + r'}{' + den_latex.strip('$') + r'}'
        return (plain, f'${latex}$')

    # Inline fraction: process by x-position groups
    return _build_inline_frac(main_s, sup_s, fnum_s, fden_s)


def _build_simple(main_s, sup_s):
    """Build (plain, latex) for simple spans + superscripts (no fractions)."""
    # Sort all by x
    all_s = sorted(main_s + sup_s, key=_span_x)
    if not all_s:
        return ('', '')

    plain_parts = []
    latex_parts = []
    has_math = bool(sup_s)
    i = 0
    while i < len(all_s):
        s = all_s[i]
        t = s['text']

        if s in sup_s:
            # Collect consecutive superscript spans
            sup_buf = t
            j = i + 1
            while j < len(all_s) and all_s[j] in sup_s:
                sup_buf += all_s[j]['text']
                j += 1
            sup_clean = _clean(sup_buf)
            plain_parts.append(f'^{sup_clean}')
            latex_parts.append(f'^{{{sup_clean}}}')
            i = j
        elif any(c in t for c in SQRT_CHARS):
            has_math = True
            # Emit text before radical
            for c in SQRT_CHARS:
                if c in t:
                    before, _, after_arg = t.partition(c)
                    break
            if _clean(before):
                plain_parts.append(_clean(before))
                latex_parts.append(_clean(before))
            # Collect argument: remainder of this span + next main spans until punctuation
            arg_parts = [after_arg] if after_arg.strip() else []
            j = i + 1
            # Heuristic: sqrt argument is the rest of the current span only
            # (TeX places the radical argument immediately after the radical char)
            arg_text = _clean(''.join(arg_parts))
            plain_parts.append(f'sqrt({arg_text})' if arg_text else 'sqrt()')
            latex_parts.append(r'\sqrt{' + arg_text + r'}')
            i = j
        else:
            plain_parts.append(t)
            latex_parts.append(t)
            i += 1

    plain = _clean(''.join(plain_parts))
    latex_str = ''.join(latex_parts)
    if has_math:
        return (plain, '$' + latex_str.strip() + '$')
    return (plain, plain)


def _build_inline_frac(main_s, sup_s, fnum_s, fden_s):
    """
    Build LaTeX for inline fractions (stem expressions with \x12/\x13 brackets).
    Groups numerator/denominator by x-range proximity.
    """
    # Find x-ranges of numerator clusters
    # For each numerator span, find the matching denominator span by x-overlap
    # Build a list of (num_group, den_group, x_start) tuples
    num_sorted = sorted(fnum_s, key=_span_x)
    den_sorted = sorted(fden_s, key=_span_x)

    # Simple approach: pair them up by x-position
    # Group numerator spans that are contiguous (within 30px of each other)
    def _group_by_x(spans, gap=35):
        if not spans: return []
        groups = [[spans[0]]]
        for s in spans[1:]:
            if _span_x(s) - _span_x(groups[-1][-1]) < gap:
                groups[-1].append(s)
            else:
                groups.append([s])
        return groups

    num_groups = _group_by_x(num_sorted)
    den_groups = _group_by_x(den_sorted)

    # Match num_group with den_group by x-overlap
    fractions = []
    used_den = set()
    for ni, ng in enumerate(num_groups):
        nx_min = min(_span_x(s) for s in ng)
        nx_max = max(_span_x(s) + len(s['text']) * 5 for s in ng)
        best_den = None
        for di, dg in enumerate(den_groups):
            if di in used_den: continue
            dx_min = min(_span_x(s) for s in dg)
            dx_max = max(_span_x(s) + len(s['text']) * 5 for s in dg)
            # Check x-overlap
            if dx_min < nx_max + 10 and dx_max > nx_min - 10:
                best_den = di
                break
        fractions.append((ng, den_groups[best_den] if best_den is not None else [], nx_min))
        if best_den is not None:
            used_den.add(best_den)

    # Build the full expression by interleaving main_s and fractions
    # Sort main_s and fractions by x-position
    main_sorted = sorted(main_s + sup_s, key=_span_x)
    frac_tokens = [(fx, ng, dg) for (ng, dg, fx) in fractions]

    result_plain = []
    result_latex = []
    has_math = True

    fi = 0  # fraction index
    mi = 0  # main span index

    while mi < len(main_sorted) or fi < len(frac_tokens):
        next_frac_x = frac_tokens[fi][0] if fi < len(frac_tokens) else float('inf')
        next_main_x = _span_x(main_sorted[mi]) if mi < len(main_sorted) else float('inf')

        if next_main_x <= next_frac_x:
            s = main_sorted[mi]
            t = s['text']
            if s in sup_s:
                plain_parts_tmp = []
                latex_parts_tmp = []
                sup_buf = t
                j = mi + 1
                while j < len(main_sorted) and main_sorted[j] in sup_s:
                    sup_buf += main_sorted[j]['text']
                    j += 1
                sup_clean = _clean(sup_buf)
                result_plain.append(f'^{sup_clean}')
                result_latex.append(f'^{{{sup_clean}}}')
                mi = j
            else:
                result_plain.append(t)
                result_latex.append(t)
                mi += 1
        else:
            _, ng, dg = frac_tokens[fi]
            num_text = _clean(''.join(s['text'] for s in sorted(ng, key=_span_x)))
            den_text = _clean(''.join(s['text'] for s in sorted(dg, key=_span_x)))
            if den_text:
                result_plain.append(f'({num_text}/{den_text})')
                result_latex.append(r'\frac{' + num_text + r'}{' + den_text + r'}')
            else:
                result_plain.append(num_text)
                result_latex.append(num_text)
            fi += 1

    plain = _clean(''.join(result_plain))
    latex_str = ''.join(result_latex)
    return (plain, '$' + latex_str.strip() + '$')


# =========================================================================== #
# PDF structure discovery
# =========================================================================== #

def _page_header(doc, idx):
    """Return the header text of a page (first block, stripped)."""
    try:
        page = doc[idx]
        blocks = page.get_text('dict')['blocks']
        for b in blocks:
            if b['type'] == 0:
                t = _clean(_collect_text(_all_spans(b)))
                if t:
                    return t
    except Exception:
        pass
    return ''


def find_page_ranges(doc):
    """
    Locate the key page ranges by scanning header text.
    Returns dict with keys: ps_q, ds_q, answer_key, ps_sol, ds_sol
    Each value is (start_idx, end_idx) inclusive.
    """
    n = len(doc)
    ranges = {}

    in_ps = in_ds = in_ak = in_ps_sol = in_ds_sol = False
    ps_start = ds_start = ak_start = ps_sol_start = ds_sol_start = None

    for i in range(n):
        page = doc[i]
        text = page.get_text()
        header = ''
        blocks = page.get_text('dict')['blocks']
        for b in blocks:
            if b['type'] == 0:
                h = _clean(_collect_text(_all_spans(b)))
                if h:
                    header = h
                    break

        is_ps = 'PS Questions' in text and 'Quantitative Question Bank' in text
        is_ds = 'DS Questions' in text and 'Quantitative Question Bank' in text
        is_ak = 'Answer Key' in text and 'Quantitative Question' in text
        is_ps_sol = 'PS Solutions' in text and 'Quantitative Question' in text
        is_ds_sol = 'DS Solutions' in text and 'Quantitative Question' in text

        if is_ps and not in_ps and ps_start is None:
            ps_start = i
            in_ps = True
        if in_ps and (is_ds or is_ak) and 'ps_q' not in ranges:
            ranges['ps_q'] = (ps_start, i - 1)
            in_ps = False

        if is_ds and not in_ds and ds_start is None:
            ds_start = i
            in_ds = True
        if in_ds and (is_ak or is_ps_sol) and 'ds_q' not in ranges:
            ranges['ds_q'] = (ds_start, i - 1)
            in_ds = False

        if is_ak and ak_start is None:
            ak_start = i
        if ak_start is not None and (is_ps_sol or is_ds_sol) and 'answer_key' not in ranges:
            ranges['answer_key'] = (ak_start, i - 1)

        if is_ps_sol and ps_sol_start is None:
            ps_sol_start = i
        if ps_sol_start is not None and is_ds_sol and 'ps_sol' not in ranges:
            ranges['ps_sol'] = (ps_sol_start, i - 1)
            ds_sol_start = i

    # Close out trailing ranges
    if in_ps and 'ps_q' not in ranges:
        ranges['ps_q'] = (ps_start, n - 1)
    if in_ds and 'ds_q' not in ranges:
        ranges['ds_q'] = (ds_start, n - 1)
    if ak_start is not None and 'answer_key' not in ranges:
        ranges['answer_key'] = (ak_start, n - 1)
    if ps_sol_start is not None and 'ps_sol' not in ranges:
        ranges['ps_sol'] = (ps_sol_start, n - 1)
    if ds_sol_start is not None:
        ranges['ds_sol'] = (ds_sol_start, n - 1)

    return ranges


# Section heading: "2.1\nNumber properties" or "2.1 Number properties"
# The number and title may be on separate lines within the same block, so we
# join them and match across the whole block text.
_SECTION_RE = re.compile(r'(\d+\.\d+)\s+([A-Za-z][^\n\d]{2,}?)(?:\s*\n|$)', re.MULTILINE)


def build_topic_map(doc, ps_range, ds_range):
    """
    Map page_idx -> topic_label for PS and DS sections.
    Scans pages for headings like '2.1\\nNumber properties' (larger font).
    The number and title may occupy separate lines; we use the raw page text
    so the newline is preserved, then regex-match across it.
    """
    topic_map = {}
    current_topic = None
    start = min(ps_range[0], ds_range[0])
    end = max(ps_range[1], ds_range[1])

    for i in range(start, end + 1):
        page = doc[i]
        # Use structured dict to find large-font blocks (headings ~13.2pt)
        # then get the block's full plain text for matching
        blocks = page.get_text('dict')['blocks']
        found_heading = False
        for b in blocks:
            if b['type'] != 0:
                continue
            # Check if any span in this block has heading-size font
            has_large = any(
                s.get('size', 0) > 11.0
                for line in b.get('lines', [])
                for s in line.get('spans', [])
            )
            if not has_large:
                continue
            # Get the block's plain text (joins lines with newlines)
            block_text = '\n'.join(
                ''.join(s['text'] for s in line.get('spans', []))
                for line in b.get('lines', [])
            )
            block_text = block_text.strip()
            m = _SECTION_RE.search(block_text)
            if m:
                current_topic = m.group(2).strip()
                found_heading = True
                break
        if current_topic:
            topic_map[i] = current_topic

    return topic_map


# =========================================================================== #
# Answer key loading
# =========================================================================== #

_AK_RE = re.compile(r'\((\d+)\)\s+([A-E])')


def load_answer_key(doc, ak_range):
    """
    Parse the numbered Answer Key pages.
    Returns {question_number: letter} for all Q1-500.
    """
    key = {}
    for i in range(ak_range[0], ak_range[1] + 1):
        text = doc[i].get_text()
        for m in _AK_RE.finditer(text):
            key[int(m.group(1))] = m.group(2)
    return key


# =========================================================================== #
# Solution loading
# =========================================================================== #

_SOL_ANSWER_RE = re.compile(
    r'[Tt]he\s+correct\s+answer\s+is\s+option\s+([A-E])', re.IGNORECASE
)

# Matches "N." (question solution start) but NOT "N.M" (section heading like "5.1").
# Uses negative lookahead: must NOT be followed by a digit, so "5.1" won't match Q5,
# but "1.Here" and "2. text" both match correctly.
_SOL_QNUM_RE = re.compile(r'^(\d+)\.(?!\d)')

# Section headings in the solutions section look like "5.1 Number properties"
_SOL_SECTION_RE = re.compile(r'^\d+\.\d+')


def load_solutions(doc, sol_range, min_q=1):
    """
    Load solution text blocks per question number.
    Returns {question_number: (sol_text, sol_letter_or_None)}.
    sol_letter is extracted from "The correct answer is option X."

    min_q: only treat a matched number as a new question if >= min_q.
    Use min_q=251 for DS solutions to prevent sub-point labels like
    "2. – Sufficient" from being misread as Q2.

    Anti-confusion rules:
    - Skip page headers, footers, and chapter titles.
    - Skip section headings like "5.1 Number properties" (match _SOL_SECTION_RE).
    - Only start a new question when matched number >= min_q.
    """
    solutions = {}

    current_num = None
    current_lines = []

    for i in range(sol_range[0], sol_range[1] + 1):
        page = doc[i]
        blocks = page.get_text('dict')['blocks']
        for b in blocks:
            if b['type'] != 0:
                continue
            text = _clean(_collect_text(_all_spans(b)))
            if not text:
                continue

            # Skip page headers/footers
            if any(kw in text for kw in ('Quantitative Question Bank', 'manhattanreview.com',
                                          '1999-2016', 'Manhattan Review', 'Solutions')):
                continue

            # Skip section headings (e.g. "5.1 Number properties", "6.17 Quadratic...")
            if _SOL_SECTION_RE.match(text):
                continue

            # Check if this starts a new question solution
            m = _SOL_QNUM_RE.match(text)
            if m and int(m.group(1)) >= min_q:
                if current_num is not None and current_lines:
                    sol_text = ' '.join(current_lines)
                    sol_letter = _extract_sol_letter(sol_text)
                    solutions[current_num] = (sol_text, sol_letter)
                current_num = int(m.group(1))
                current_lines = [text]
            elif current_num is not None:
                current_lines.append(text)

    # Flush last
    if current_num is not None and current_lines:
        sol_text = ' '.join(current_lines)
        sol_letter = _extract_sol_letter(sol_text)
        solutions[current_num] = (sol_text, sol_letter)

    return solutions


def _extract_sol_letter(text):
    """Extract answer letter from solution text. Returns None if absent."""
    m = _SOL_ANSWER_RE.search(text)
    return m.group(1).upper() if m else None


# =========================================================================== #
# Question parsing
# =========================================================================== #

_OPT_RE = re.compile(r'^\(([A-E])\)\s*$|^\(([A-E])\)\s+\S')
_QNUM_RE = re.compile(r'^(\d+)\.\s*$')


def _blocks_for_page(doc, page_idx):
    """Return all text blocks for a page, sorted top-to-bottom."""
    page = doc[page_idx]
    blocks = page.get_text('dict')['blocks']
    return sorted([b for b in blocks if b['type'] == 0],
                  key=lambda b: b['bbox'][1])


def _first_text(block):
    """Return the first non-empty text from a block's spans."""
    for line in block.get('lines', []):
        for span in line.get('spans', []):
            t = span['text'].strip()
            if t and t not in ('\x12', '\x13'):
                return t
    return ''


def _block_text(block):
    return _clean(_collect_text(_all_spans(block)))


def _is_page_header(text):
    return any(kw in text for kw in (
        'Quantitative Question Bank', 'manhattanreview.com',
        '1999-2016', 'Manhattan Review',
    ))


def _is_question_start(block):
    """True if block starts with 'N.' question number."""
    t = _first_text(block)
    return bool(_QNUM_RE.match(t))


def _get_question_num(block):
    t = _first_text(block)
    m = _QNUM_RE.match(t)
    return int(m.group(1)) if m else None


def _is_option_start(block):
    """True if block contains an option label (A)-(E)."""
    t = _first_text(block)
    return bool(_OPT_RE.match(t)) or bool(re.match(r'^\(([A-E])\)', t))


def _get_option_label(block):
    t = _first_text(block)
    m = re.match(r'^\(([A-E])\)', t)
    return m.group(1) if m else None


def _x_overlap(block1, block2, margin=5):
    """True if block1 and block2 have overlapping x-ranges."""
    x1_min, _, x1_max, _ = block1['bbox']
    x2_min, _, x2_max, _ = block2['bbox']
    return x1_min - margin < x2_max and x2_min - margin < x1_max


def _is_denominator_block(block, prev_opt_block, prev_opt_den_blocks, next_block=None):
    """
    True if this block is a hanging fraction denominator for the previous option.
    Criteria:
      1. Block has no option label or question number
      2. Block's x-range overlaps with prev_opt_block's content x-range
      3. Block is vertically close (within 30px) of prev_opt_block bottom
    """
    ft = _first_text(block)
    if _OPT_RE.match(ft) or _QNUM_RE.match(ft):
        return False
    if _is_page_header(_block_text(block)):
        return False

    # Check x-overlap
    if not _x_overlap(block, prev_opt_block):
        return False

    # Vertical proximity
    y_gap = block['bbox'][1] - prev_opt_block['bbox'][3]
    if y_gap < -5 or y_gap > 35:
        return False

    return True


def _block_content_spans(block):
    """Return spans from a block, skipping the option letter (A)-(E) prefix."""
    spans = _all_spans(block)
    # Skip leading option-label spans
    skip = 0
    for s in spans:
        t = s['text'].strip()
        if re.match(r'^\([A-E]\)$', t) or t in ('(A)', '(B)', '(C)', '(D)', '(E)'):
            skip += 1
        else:
            break
    return spans[skip:]


def _option_has_content_spans(block):
    """True if option block has more than just the label."""
    return bool(_block_content_spans(block))


def parse_questions_in_range(doc, page_range, q_type, topic_map,
                             ps_topics_filter=None, ds_topics_filter=None):
    """
    Parse all questions in the given page range.
    Returns list of partial question dicts (no correct_answer, no explanation yet).
    """
    records = []
    # Collect all blocks across the page range, tagging each with page_idx
    all_blocks = []
    for pi in range(page_range[0], page_range[1] + 1):
        for b in _blocks_for_page(doc, pi):
            all_blocks.append((pi, b))

    # Group blocks into questions
    # A question starts when we see a block whose first text is "N."
    question_groups = []  # list of (q_num, page_idx, [(page_idx, block), ...])
    current_q_num = None
    current_q_page = None
    current_blocks = []

    for (pi, block) in all_blocks:
        bt = _block_text(block)
        if _is_page_header(bt):
            continue

        if _is_question_start(block):
            if current_q_num is not None:
                question_groups.append((current_q_num, current_q_page, current_blocks))
            current_q_num = _get_question_num(block)
            current_q_page = pi
            current_blocks = [(pi, block)]
        elif current_q_num is not None:
            current_blocks.append((pi, block))

    if current_q_num is not None and current_blocks:
        question_groups.append((current_q_num, current_q_page, current_blocks))

    for (q_num, q_page, blocks) in question_groups:
        # Determine topic
        topic = topic_map.get(q_page, 'Unknown')

        # Apply topic filter
        if q_type == 'PS' and ps_topics_filter:
            if topic not in ps_topics_filter:
                continue
        if q_type == 'DS' and ds_topics_filter:
            if topic not in ds_topics_filter:
                continue

        # Parse the question block into stem, options
        rec = _parse_question_blocks(q_num, q_type, topic, q_page, blocks)
        if rec:
            records.append(rec)

    return records


def _parse_question_blocks(q_num, q_type, topic, page_idx, tagged_blocks):
    """
    Build a question record from its list of (page_idx, block) pairs.
    Returns partial record dict (no correct_answer or explanation yet).
    """
    blocks = [b for (_, b) in tagged_blocks]

    # ---- Separate stem blocks from option blocks ---- #
    # Walk blocks; the first (A) block marks the start of options
    # For DS, there are no (A)-(E) choice blocks -- only (1)/(2) statements
    stem_blocks = []
    opt_blocks = {}       # label -> [block, ...] (first = label block, rest = content)
    opt_den_blocks = {}   # label -> [denominator block, ...]
    in_opts = False
    current_opt = None

    # The first block starts with "N." (the question number span).
    # We always include it; _build_stem will strip the leading number span.
    for bi, block in enumerate(blocks):
        bt = _block_text(block)
        ft = _first_text(block)

        if q_type == 'DS':
            # DS: no A-E option blocks, just collect everything as stem
            if not _is_page_header(bt):
                stem_blocks.append(block)
            continue

        if not in_opts and _is_option_start(block):
            in_opts = True

        if in_opts:
            label = _get_option_label(block)
            if label:
                current_opt = label
                opt_blocks[label] = [block]
                opt_den_blocks[label] = []
            elif current_opt is not None:
                # Could be denominator block or continuation
                prev_opt_block = opt_blocks[current_opt][0]
                if _is_denominator_block(block, prev_opt_block, opt_den_blocks[current_opt]):
                    opt_den_blocks[current_opt].append(block)
                else:
                    opt_blocks[current_opt].append(block)
        else:
            if not _is_page_header(bt):
                stem_blocks.append(block)

    # ---- Build stem text ---- #
    stem_plain, stem_latex = _build_stem(stem_blocks)

    # ---- Build options ---- #
    if q_type == 'DS':
        options = DS_CHOICES[:]
    else:
        options = _build_options(opt_blocks, opt_den_blocks)

    if not options and q_type == 'PS':
        # No options found -- skip question (probably a header page)
        return None

    qid = f'{q_type.lower()}-{_slug(topic)}-q{q_num:03d}'

    return {
        'id': qid,
        'type': q_type,
        'chapter': topic,
        'question': stem_latex or stem_plain,
        'question_plain': stem_plain,
        'options': options,
        'correct_answer': None,      # filled by cross-check
        'explanation': None,         # filled by solution loader
        'equations': [],
        'diagram': None,
        'needs_review': False,
        'source_page': page_idx + 1,  # 1-indexed
        'number': q_num,
        'source': SOURCE_LABEL,
        'format': 'multiple_choice',
    }


def _spans_with_spaces(blocks):
    """
    Flatten spans from all blocks, inserting a synthetic space span between
    spans whose x-gap implies a word boundary (gap > 1.5 pts on the same line).
    Also inserts a space at block boundaries.
    """
    result = []
    prev_x_end = None
    prev_y = None
    _SPACE = {'text': ' ', 'size': NORMAL_SIZE, 'origin': (0, 0), 'flags': 0}

    for bi, b in enumerate(blocks):
        for si, s in enumerate(_all_spans(b)):
            t = s['text']
            if not t or t in ('\x12', '\x13'):
                result.append(s)   # keep control chars for fraction detection
                continue
            # Estimate span x-end (origin is baseline-left; width ≈ len*size*0.55)
            x_start = s['origin'][0]
            y_now = s['origin'][1]
            # Insert space if same y-line and there's a gap
            if prev_x_end is not None and prev_y is not None:
                same_line = abs(y_now - prev_y) < 3.0
                if same_line and x_start - prev_x_end > 1.5:
                    result.append(dict(_SPACE))
                elif not same_line and bi > 0:
                    # Different line (within same block or across blocks)
                    result.append(dict(_SPACE))
            elif bi > 0 and si == 0:
                result.append(dict(_SPACE))
            result.append(s)
            prev_x_end = x_start + len(t) * _span_size(s) * 0.55
            prev_y = y_now
    return result


def _build_stem(blocks):
    """
    Convert stem blocks into (plain, rich_text) where rich_text has inline
    $math$ tokens for superscripts/fractions/sqrt while prose stays as plain text.
    This prevents KaTeX from rendering prose words as math variables.
    """
    # Collect all spans with space hints
    raw_spans = []
    for bi, b in enumerate(blocks):
        spans = _all_spans(b)
        if bi == 0:
            # Strip the leading "N." question-number span
            while spans and _QNUM_RE.match(spans[0]['text'].strip()):
                spans = spans[1:]
        raw_spans.extend(spans)

    if not raw_spans:
        return ('', '')

    # Check for \x12/\x13 fraction markers — pure math stem
    has_frac_markers = any(s['text'] == '\x12' for s in raw_spans)
    if has_frac_markers:
        return _spans_to_latex(raw_spans)

    # Determine dominant y-level for baseline
    normal_ys = [s['origin'][1] for s in raw_spans
                 if s['text'].strip() and s['text'] not in ('\x12', '\x13')
                 and _span_size(s) >= SUP_SIZE_MAX]
    if not normal_ys:
        return ('', '')
    y_counts = Counter(round(y / 2) * 2 for y in normal_ys)
    dom_y = y_counts.most_common(1)[0][0]

    # Fraction detection without markers: only trigger for stems where normal-size
    # spans appear at exactly 2 distinct y-clusters with overlapping x-ranges
    # (numerator stacked above denominator). Multi-line prose has non-overlapping
    # x-spans across lines, so we skip the fallback for stems.
    # Fractions with \x12/\x13 are already handled above.
    # No fallback here -- inline math handles everything else.

    # Walk spans: emit prose as plain text, wrap only math tokens in $...$
    # A span is a "true superscript" only if:
    #   1. size < SUP_SIZE_MAX  AND
    #   2. y-position is at least 2pt ABOVE the dominant baseline
    #      (small text at same y is footnote/label, not a superscript)
    rich_parts = []   # list of str (text) or ('math', latex_str)
    plain_parts = []
    i = 0
    spans = raw_spans

    while i < len(spans):
        s = spans[i]
        t = s['text']

        if not t or t in ('\x12', '\x13'):
            i += 1; continue

        y = s['origin'][1]
        is_true_sup = (_span_size(s) < SUP_SIZE_MAX and (dom_y - y) > 2.0)

        if is_true_sup:
            # Collect all consecutive true superscript spans
            sup_buf = t
            j = i + 1
            while j < len(spans):
                ns = spans[j]
                ny = ns['origin'][1]
                if ns['text'] and ns['text'] not in ('\x12', '\x13') \
                        and _span_size(ns) < SUP_SIZE_MAX and (dom_y - ny) > 2.0:
                    sup_buf += ns['text']
                    j += 1
                else:
                    break
            sup_clean = _clean(sup_buf)
            if not sup_clean:
                i = j; continue

            # Pull the base from the last plain part
            if rich_parts and isinstance(rich_parts[-1], str):
                last_text = rich_parts[-1]
                # Find the rightmost word/token as base
                stripped = last_text.rstrip()
                sp = stripped.rfind(' ')
                if sp >= 0:
                    base = stripped[sp+1:]
                    rich_parts[-1] = stripped[:sp+1]
                else:
                    base = stripped
                    rich_parts[-1] = ''
                if base:
                    rich_parts.append(('math', f'{base}^{{{sup_clean}}}'))
                    plain_parts.append(f'{base}^{sup_clean}')
                else:
                    rich_parts.append(('math', f'^{{{sup_clean}}}'))
                    plain_parts.append(f'^{sup_clean}')
            else:
                rich_parts.append(('math', f'^{{{sup_clean}}}'))
                plain_parts.append(f'^{sup_clean}')
            i = j

        elif any(c in t for c in SQRT_CHARS):
            for c in SQRT_CHARS:
                if c in t:
                    before, _, arg = t.partition(c)
                    break
            if before.strip():
                rich_parts.append(before)
                plain_parts.append(before)
            # If the argument is in the next span (sqrt char alone in this span)
            if not arg.strip() and i + 1 < len(spans):
                arg = spans[i + 1]['text']
                i += 1  # consume the next span too
            arg_clean = _clean(arg)
            rich_parts.append(('math', f'\\sqrt{{{arg_clean}}}'))
            plain_parts.append(f'sqrt({arg_clean})')
            i += 1

        else:
            rich_parts.append(t)
            plain_parts.append(t)
            i += 1

    # Build the final strings
    # For rich text: emit plain str tokens as-is, math tokens as $...$
    rich_out = []
    for tok in rich_parts:
        if isinstance(tok, tuple):
            _, latex = tok
            rich_out.append(f'${latex}$')
        else:
            rich_out.append(tok)

    plain = _clean(''.join(plain_parts))
    rich = _clean(''.join(rich_out))
    return (plain, rich)


def _build_options(opt_blocks, opt_den_blocks):
    """Build options list [{label, text, text_plain}]."""
    options = []
    for label in ('A', 'B', 'C', 'D', 'E'):
        if label not in opt_blocks:
            continue
        # Content spans = all spans in this option's blocks, minus the leading label
        content_spans = []
        for block in opt_blocks[label]:
            content_spans.extend(_block_content_spans(block))

        den_blocks = opt_den_blocks.get(label, [])

        plain, latex = _spans_to_latex(content_spans, extra_den_blocks=den_blocks or None)
        options.append({
            'label': label,
            'text': latex if latex else plain,
            'text_plain': plain,
        })

    return options


# =========================================================================== #
# Diagram detection and extraction
# =========================================================================== #

def _extract_diagrams(doc, records):
    """
    For each record that may have a diagram, detect vector drawings on its source page
    and crop them.
    Modifies records in-place, setting 'diagram' path.
    """
    if not HAS_PIL:
        return

    os.makedirs('diagrams', exist_ok=True)

    # Group records by source page
    by_page = defaultdict(list)
    for rec in records:
        by_page[rec['source_page'] - 1].append(rec)  # 0-indexed

    for page_idx, page_records in by_page.items():
        page = doc[page_idx]
        drawings = page.get_drawings()
        if not drawings:
            continue

        # Get the bounding rects of all drawings on the page
        # Filter out horizontal lines (likely page rules or separators)
        # A "diagram" cluster has width and height > 20px
        diagram_rects = []
        for d in drawings:
            r = d.get('rect')
            if r and r.width > 20 and r.height > 20:
                diagram_rects.append(r)

        if not diagram_rects:
            continue

        # Rasterize page at 200 DPI
        mat = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        img_w, img_h = img.size
        page_rect = page.rect  # in pts

        scale_x = img_w / page_rect.width
        scale_y = img_h / page_rect.height

        # For each record on this page, find if any diagram rect is "near" it
        # We use a heuristic: if the diagram's y-midpoint is within 200pts of
        # the question's approximate y position on the page
        for rec in page_records:
            # Estimate where the question appears on the page
            # (we don't have exact y, but source_page gives us the page)
            # For now, assign the largest diagram cluster on the page to the record
            # if the page has only one record with diagrams
            # Better: check if the diagram y-range is within the question's text y-range

            # Collect drawings that overlap with this question's text range
            # We'll use a generous assignment: all diagrams on a page go to all records
            # that reference figures in their stem ("figure", "shown", "below", "above")
            stem_lower = (rec.get('question_plain') or '').lower()
            has_figure_ref = any(w in stem_lower for w in
                                 ('figure', 'shown', 'below', 'above', 'diagram',
                                  'inscribed', 'rectangle', 'circle', 'triangle',
                                  'parallelogram', 'polygon'))

            if not has_figure_ref and len(page_records) > 1:
                # Multiple questions on page, no figure reference -- skip
                continue

            # Union bbox of diagram rects (in page pts)
            all_r = diagram_rects
            if not all_r:
                continue

            x0 = min(r.x0 for r in all_r) - 5
            y0 = min(r.y0 for r in all_r) - 5
            x1 = max(r.x1 for r in all_r) + 5
            y1 = max(r.y1 for r in all_r) + 5

            # Clip to page bounds
            x0 = max(0, x0); y0 = max(0, y0)
            x1 = min(page_rect.width, x1); y1 = min(page_rect.height, y1)

            # Scale to raster coords
            cx0 = int(x0 * scale_x); cy0 = int(y0 * scale_y)
            cx1 = int(x1 * scale_x); cy1 = int(y1 * scale_y)

            if cx1 <= cx0 or cy1 <= cy0:
                continue

            cropped = img.crop((cx0, cy0, cx1, cy1))
            out_path = os.path.join('diagrams', f'{rec["id"]}.png')
            cropped.save(out_path)
            rec['diagram'] = out_path.replace('\\', '/')


# =========================================================================== #
# Cross-validation and record finalization
# =========================================================================== #

def finalize_records(records, answer_key, solutions, report):
    """
    Attach correct_answer and explanation to each record.
    Updates report dict with validation stats.
    """
    for rec in records:
        q_num = rec['number']
        key_ans = answer_key.get(q_num)
        sol_text, sol_ans = solutions.get(q_num, (None, None))

        rec['explanation'] = sol_text or ''

        if key_ans and sol_ans:
            if key_ans == sol_ans:
                rec['correct_answer'] = key_ans
                report['agree'] += 1
            else:
                rec['correct_answer'] = None
                rec['needs_review'] = True
                report['conflict'] += 1
                report['conflicts'].append(
                    f'Q{q_num}: key={key_ans} sol={sol_ans}'
                )
        elif key_ans:
            rec['correct_answer'] = key_ans
            report['key_only'] += 1
        else:
            rec['correct_answer'] = None
            rec['needs_review'] = True
            report['no_answer'].append(q_num)

    return records


# =========================================================================== #
# Coverage summary
# =========================================================================== #

def print_summary(records, report, ps_topics_filter, ds_topics_filter):
    from collections import Counter
    print()
    print('=' * 70)
    print('COVERAGE SUMMARY (Manhattan Review Quant Question Bank, 6th Ed)')
    print('=' * 70)

    ps_recs = [r for r in records if r['type'] == 'PS']
    ds_recs = [r for r in records if r['type'] == 'DS']
    ps_conf = sum(1 for r in ps_recs if r['correct_answer'])
    ds_conf = sum(1 for r in ds_recs if r['correct_answer'])

    print(f'Total questions extracted   : {len(records)}')
    print(f'  PS: {ps_conf}/{len(ps_recs)} with confirmed answer')
    print(f'  DS: {ds_conf}/{len(ds_recs)} with confirmed answer')
    print(f'Confirmed answers (total)   : {ps_conf + ds_conf}/{len(records)}')

    print()
    print('-' * 60)
    print('CROSS-VALIDATION (Answer Key vs solution marker)')
    print('-' * 60)
    print(f'Both signals AGREE          : {report["agree"]}')
    print(f'Key only (marker absent)    : {report["key_only"]}')
    print(f'Signals DISAGREE (->null)   : {report["conflict"]}')
    for c in report['conflicts']:
        print(f'    CONFLICT {c}')
    null_count = len(report['no_answer'])
    print(f'Left null / needs_review    : {null_count}')
    if report['no_answer']:
        nums = ', '.join(str(n) for n in sorted(report['no_answer'])[:20])
        print(f'    Missing from key: Q{nums}')

    print()
    print('-' * 60)
    print('DIAGRAMS')
    print('-' * 60)
    diag_count = sum(1 for r in records if r.get('diagram'))
    print(f'Questions with diagrams     : {diag_count}')

    print()
    print('-' * 60)
    print('TOPICS')
    print('-' * 60)
    ps_topics = Counter(r['chapter'] for r in ps_recs)
    ds_topics = Counter(r['chapter'] for r in ds_recs)
    if ps_recs:
        print('PS topics:')
        for t, c in ps_topics.most_common():
            print(f'  {c:3d}  {t}')
    if ds_recs:
        print('DS topics:')
        for t, c in ds_topics.most_common():
            print(f'  {c:3d}  {t}')


# =========================================================================== #
# Main entry point
# =========================================================================== #

def parse_quant(pdf_path, ps_topics_filter=None, ds_topics_filter=None):
    """
    Full parse pipeline. Returns list of records written to questions-quant.json.
    """
    print(f'Opening PDF: {pdf_path}')
    doc = fitz.open(pdf_path)
    print(f'  Pages: {len(doc)}')

    print('Scanning page structure...')
    ranges = find_page_ranges(doc)
    print(f'  PS questions  : pages {ranges["ps_q"][0]+1}-{ranges["ps_q"][1]+1}')
    print(f'  DS questions  : pages {ranges["ds_q"][0]+1}-{ranges["ds_q"][1]+1}')
    print(f'  Answer key    : pages {ranges["answer_key"][0]+1}-{ranges["answer_key"][1]+1}')
    print(f'  PS solutions  : pages {ranges["ps_sol"][0]+1}-{ranges["ps_sol"][1]+1}')
    if 'ds_sol' in ranges:
        print(f'  DS solutions  : pages {ranges["ds_sol"][0]+1}-{ranges["ds_sol"][1]+1}')

    print('Loading answer key...')
    answer_key = load_answer_key(doc, ranges['answer_key'])
    print(f'  {len(answer_key)} answers loaded')

    print('Building topic map...')
    topic_map = build_topic_map(doc, ranges['ps_q'], ranges['ds_q'])

    print('Parsing PS questions...')
    ps_records = parse_questions_in_range(
        doc, ranges['ps_q'], 'PS', topic_map,
        ps_topics_filter=ps_topics_filter,
        ds_topics_filter=ds_topics_filter,
    )
    print(f'  {len(ps_records)} PS questions parsed')

    print('Parsing DS questions...')
    ds_records = parse_questions_in_range(
        doc, ranges['ds_q'], 'DS', topic_map,
        ps_topics_filter=ps_topics_filter,
        ds_topics_filter=ds_topics_filter,
    )
    print(f'  {len(ds_records)} DS questions parsed')

    print('Loading PS solutions...')
    ps_solutions = load_solutions(doc, ranges['ps_sol'])
    print(f'  {len(ps_solutions)} PS solutions loaded')

    ds_solutions = {}
    if 'ds_sol' in ranges:
        print('Loading DS solutions...')
        ds_solutions = load_solutions(doc, ranges['ds_sol'], min_q=251)
        print(f'  {len(ds_solutions)} DS solutions loaded')

    report = {
        'agree': 0, 'conflict': 0, 'key_only': 0,
        'conflicts': [], 'no_answer': [],
    }

    print('Cross-validating answers...')
    all_records = ps_records + ds_records
    all_solutions = {**ps_solutions, **ds_solutions}
    all_records = finalize_records(all_records, answer_key, all_solutions, report)

    print('Detecting and cropping diagrams...')
    _extract_diagrams(doc, all_records)

    print('Embedding questions...')
    all_records = embed_questions(all_records)

    # Strip internal-only field before writing
    for r in all_records:
        r.pop('question_plain', None)

    out_path = 'questions-quant.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {len(all_records)} records to {out_path}')

    print_summary(all_records, report, ps_topics_filter, ds_topics_filter)
    return all_records


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)

    pdf_path = None
    ps_topics = None
    ds_topics = None
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--ps-topics':
            ps_topics = [t.strip() for t in args[i + 1].split(',')]
            i += 2
        elif a == '--ds-topics':
            ds_topics = [t.strip() for t in args[i + 1].split(',')]
            i += 2
        elif not a.startswith('--') and pdf_path is None:
            pdf_path = a
            i += 1
        else:
            i += 1

    if not pdf_path:
        sys.exit('ERROR: No PDF path provided.')

    parse_quant(pdf_path, ps_topics_filter=ps_topics, ds_topics_filter=ds_topics)


if __name__ == '__main__':
    main()
