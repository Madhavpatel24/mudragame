"""Fuzzy mapping between teacher segment names and dataset class names.

Spellings differ (Angali/Anjali, Kapotha/Kapotham, Kartareeswastika/Kartariawastika ...), so both sides are
reduced to a phonetic stem and compared with difflib. Segments with no match (e.g. Dola, Utsanga) are
EXCLUDED, never forced onto another class. Use `teacher.aliases` in config.yaml to override.
"""
import re
import difflib


def clean_class_name(name):
    """Folder names like "Anjali(1)" or "Anjali (2)" -> "Anjali"."""
    return re.sub(r"\s*\(\d+\)\s*$", "", name).strip()


def stem(name):
    s = re.sub(r"[^a-z]", "", name.lower())
    for a, b in [("sh", "s"), ("ch", "c"), ("th", "t"), ("kh", "k"), ("dh", "d"), ("bh", "b"), ("ph", "p"),
                 ("aa", "a"), ("ee", "i"), ("oo", "u"), ("w", "v"), ("g", "j")]:
        s = s.replace(a, b)
    s = re.sub(r"(.)\1+", r"\1", s)      # collapse doubled letters (Karkatta -> Karkata)
    s = re.sub(r"m$", "", s)              # trailing -m (Kapotham)
    s = re.sub(r"a$", "", s)              # trailing -a
    return s


def best_match(name, class_names, cutoff=0.8):
    s = stem(name)
    best, best_score = None, 0.0
    for c in class_names:
        score = difflib.SequenceMatcher(None, s, stem(c)).ratio()
        if score > best_score:
            best, best_score = c, score
    if best is not None and best_score >= cutoff:
        return best, best_score
    return None, best_score


def map_segments(segments, class_names, aliases=None, cutoff=0.8):
    """Return (mapped, excluded). mapped items are segment dicts + expected_class + match_score."""
    aliases = {k.lower(): v for k, v in (aliases or {}).items()}
    mapped, excluded = [], []
    for seg in segments:
        name = seg.get("name") or seg.get("display")
        key = name.lower()
        if key in aliases:
            target = aliases[key]
            if target is None:
                excluded.append({**seg, "reason": "excluded by alias"})
                continue
            if target not in class_names:
                excluded.append({**seg, "reason": f"alias target '{target}' not in dataset classes"})
                continue
            mapped.append({**seg, "expected_class": target, "match_score": 1.0})
            continue
        cls, score = best_match(name, class_names, cutoff)
        if cls is None:
            excluded.append({**seg, "reason": f"no dataset class matches (best score {score:.2f})"})
        else:
            mapped.append({**seg, "expected_class": cls, "match_score": round(score, 3)})
    return mapped, excluded
