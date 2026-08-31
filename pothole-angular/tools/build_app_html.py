# -*- coding: utf-8 -*-
from pathlib import Path
import re

def fix_mojibake(s: str) -> str:
    pairs = [
        ("d\u00c3\u00a9tection", "d\u00e9tection"),
        ("S\u00c3\u00a9lectionnez", "S\u00e9lectionnez"),
        ("mod\u00c3\u00a8le", "mod\u00e8le"),
        ("Mod\u00c3\u00a8le", "Mod\u00e8le"),
        ("entra\u00c3\u00aen\u00c3\u00a9", "entra\u00een\u00e9"),
        ("vid\u00c3\u00a9o", "vid\u00e9o"),
        ("d\u00c3\u00a9tect\u00c3\u00a9", "d\u00e9tect\u00e9"),
        ("R\u00c3\u00a9sultats", "R\u00e9sultats"),
        ("Aper\u00c3\u00a7u", "Aper\u00e7u"),
        ("analys\u00c3\u00a9e", "analys\u00e9e"),
        ("endommag\u00c3\u00a9s", "endommag\u00e9s"),
        ("D\u00c3\u00a9tections", "D\u00e9tections"),
        ("Signal\u00c3\u00a9tique", "Signal\u00e9tique"),
        ("Donn\u00c3\u00a9es", "Donn\u00e9es"),
        ("r\u00c3\u00a9sultats", "r\u00e9sultats"),
        ("Vid\u00c3\u00a9o", "Vid\u00e9o"),
        ("s\u00c3\u00a9quentielle", "s\u00e9quentielle"),
        ("compl\u00c3\u00a9ter", "compl\u00e9ter"),
        ("analys\u00c3\u00a9es", "analys\u00e9es"),
        ("d\u00c3\u00a9tect\u00c3\u00a9e", "d\u00e9tect\u00e9e"),
        ("Dur\u00c3\u00a9e", "Dur\u00e9e"),
        ("tr\u00c3\u00a8s", "tr\u00e8s"),
        ("ab\u00c3\u00aem\u00c3\u00a9", "ab\u00eem\u00e9"),
        ("d\u00c3\u00a9tect\u00c3\u00a9s", "d\u00e9tect\u00e9s"),
        ("Cr\u00c3\u00a9ez", "Cr\u00e9ez"),
        ("Op\u00c3\u00a9rateur", "Op\u00e9rateur"),
        ("R\u00c3\u00b4le", "R\u00f4le"),
        ("g\u00c3\u00a9n\u00c3\u00a9r\u00c3\u00a9", "g\u00e9n\u00e9r\u00e9"),
        ("Cr\u00c3\u00a9ation", "Cr\u00e9ation"),
        ("\u00c3\u00a9v\u00c3\u00a9nements", "\u00e9v\u00e9nements"),
        ("c\u00c3\u00b4t\u00c3\u00a9", "c\u00f4t\u00e9"),
        ("pr\u00c3\u00a9diction", "pr\u00e9diction"),
        ("L\u00e2\u20ac\u2122", "L'"),
        ("l\u00e2\u20ac\u2122", "l'"),
        ("\u00c3\u00a0", "\u00e0"),
        ("\u00e2\u20ac\u201c", "\u2014"),
        ("\u00e2\u20ac\u00a6", "\u2026"),
        ("\u00c2\u00ab", "\u00ab"),
        ("\u00c2\u00bb", "\u00bb"),
        ("\u00e2\u2013\u00b6", "\u25b6"),
        ("\u00c2\u00b7", "\u00b7"),
        ("0\u00e2\u20ac\u201c1", "0\u20131"),
    ]
    for a, b in pairs:
        s = s.replace(a, b)
    return s

root = Path(__file__).resolve().parents[1]
frag = fix_mojibake((root / "src/app/_content_fragment.html").read_text(encoding="utf-8-sig"))
frag = re.sub(
    r'<div class="empty-state-icon">[^<]+</div>',
    '<div class="empty-state-icon">\u2022</div>',
    frag,
)
for junk in ["</main>", "      }", "    </div>"]:
    frag = frag.replace(junk, "")

chunks = re.split(r"(?=\n\s*<section class=\"panel\">)", frag)
chunks = [c.strip() for c in chunks if c.strip()]
if chunks and not chunks[0].startswith("<section"):
    chunks[0] = '<section class="panel">\n' + chunks[0]

header = (root / "tools/app_shell_header.html").read_text(encoding="utf-8")
footer = (root / "tools/app_shell_footer.html").read_text(encoding="utf-8")

detection = "".join(chunks[:2]) if len(chunks) >= 2 else (chunks[0] if chunks else "")
video = users_block = events_block = ""
for c in chunks:
    if "Analyse s" in c and "quentielle" in c:
        video = c
    elif "Gestion des utilisateurs" in c:
        users_block = c
    elif "Journal des" in c:
        events_block = c

out = header
if detection:
    out += "\n        @if (activeSection() === 'detection') {\n" + detection + "\n        }\n"
if video:
    out += "\n        @if (activeSection() === 'video') {\n" + video + "\n        }\n"
if users_block:
    out += "\n        @if (activeSection() === 'users' && auth.user()?.role === 'ADMIN') {\n" + users_block + "\n        }\n"
if events_block:
    out += "\n        @if (activeSection() === 'events') {\n" + events_block + "\n        }\n"
out += footer

(root / "src/app/app.html").write_text(out, encoding="utf-8", newline="\n")
print("OK", len(out))
