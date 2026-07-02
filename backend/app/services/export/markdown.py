"""
app/services/export/markdown.py

Tiny Markdown→HTML for text blocks — only the subset TextBlock.tsx's own
renderMarkdown() supports. Escapes all content before wrapping in tags, so
its output is safe to render with | safe in the passage panel. No external
dependency: the exported file must work fully offline.
"""

from __future__ import annotations

import re

_INLINE_PATTERN = re.compile(r"(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)")


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _render_inline(raw: str) -> str:
    out: list[str] = []
    last = 0
    for m in _INLINE_PATTERN.finditer(raw):
        if m.start() > last:
            out.append(_escape_html(raw[last : m.start()]))
        token = m.group(0)
        if token.startswith("***"):
            out.append(f"<strong><em>{_escape_html(token[3:-3])}</em></strong>")
        elif token.startswith("**"):
            out.append(f"<strong>{_escape_html(token[2:-2])}</strong>")
        else:
            out.append(f"<em>{_escape_html(token[1:-1])}</em>")
        last = m.end()
    if last < len(raw):
        out.append(_escape_html(raw[last:]))
    return "".join(out)


def markdown_to_html(content: str) -> str:
    """Convert the subset of Markdown TextBlock.tsx supports into HTML."""
    lines = (content or "").split("\n")
    output: list[str] = []
    list_buffer: list[str] = []
    para_buffer: list[str] = []

    def flush_list() -> None:
        nonlocal list_buffer
        if list_buffer:
            items = "".join(f"<li>{item}</li>" for item in list_buffer)
            output.append(f"<ul>{items}</ul>")
            list_buffer = []

    def flush_para() -> None:
        nonlocal para_buffer
        text = " ".join(para_buffer).strip()
        para_buffer = []
        if text:
            output.append(f"<p>{_render_inline(text)}</p>")

    for line in lines:
        if line.startswith("## "):
            flush_list()
            flush_para()
            output.append(f"<h2>{_render_inline(line[3:])}</h2>")
        elif line.startswith("### "):
            flush_list()
            flush_para()
            output.append(f"<h3>{_render_inline(line[4:])}</h3>")
        elif re.match(r"^[-*]{3,}$", line.strip()):
            flush_list()
            flush_para()
            output.append("<hr>")
        elif re.match(r"^[-*]\s", line):
            flush_para()
            list_buffer.append(_render_inline(line[2:]))
        elif re.match(r"^\d+\.\s", line):
            flush_para()
            list_buffer.append(_render_inline(re.sub(r"^\d+\.\s", "", line)))
        elif line.strip() == "":
            flush_list()
            flush_para()
        else:
            flush_list()
            para_buffer.append(line)

    flush_list()
    flush_para()
    return "\n".join(output)