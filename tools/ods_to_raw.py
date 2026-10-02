"""Stage 1: kautian.ods -> raw/<sheet>.json (list of row lists). Stdlib only, streaming."""
import sys, os, json, zipfile
from xml.etree.ElementTree import iterparse

T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
X = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"


def cell_text(cell):
    paras = []
    for p in cell.iter(X + "p"):
        buf = []

        def walk(e):
            if e.text:
                buf.append(e.text)
            for c in e:
                if c.tag == X + "s":
                    buf.append(" " * int(c.get(X + "c", "1")))
                elif c.tag == X + "line-break":
                    buf.append("\n")
                elif c.tag == X + "tab":
                    buf.append("\t")
                else:
                    walk(c)
                if c.tail:
                    buf.append(c.tail)

        walk(p)
        paras.append("".join(buf))
    if paras:
        return "\n".join(paras)
    # numeric cells carry the value only as an attribute
    v = cell.get(O + "value")
    if v is not None:
        if v.endswith(".0"):
            v = v[:-2]
        return v
    return ""


MAX_CONTENT_BYTES = 400 * 1024 * 1024     # the official file's content.xml is about 70 MB
MAX_RATIO = 200                           # a spreadsheet does not compress 200:1; a zip bomb does


def sheets(path):
    z = zipfile.ZipFile(path)
    info = z.getinfo("content.xml")
    if info.file_size > MAX_CONTENT_BYTES or info.file_size > MAX_RATIO * max(info.compress_size, 1):
        raise SystemExit(
            f"content.xml unpacks to {info.file_size / 1e6:.0f} MB from {info.compress_size / 1e6:.1f} MB: "
            "that is not the dictionary file from sutian.moe.edu.tw. Refusing to read it.")
    with z.open("content.xml") as f:
        name, rows = None, None
        for ev, el in iterparse(f, events=("start", "end")):
            if ev == "start" and el.tag == T + "table":
                name, rows = el.get(T + "name"), []
            elif ev == "end" and el.tag == T + "table-row":
                out = []
                for c in el:
                    if c.tag not in (T + "table-cell", T + "covered-table-cell"):
                        continue
                    rep = int(c.get(T + "number-columns-repeated", "1"))
                    txt = cell_text(c)
                    if not txt and rep > 20:
                        rep = 0  # trailing filler
                    out.extend([txt] * rep)
                while out and out[-1] == "":
                    out.pop()
                if out:
                    rows.append(out)
                el.clear()
            elif ev == "end" and el.tag == T + "table":
                yield name, rows
                el.clear()


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for name, rows in sheets(src):
        with open(os.path.join(dst, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False)
        print(f"{name}: {len(rows) - 1} rows, header={rows[0]}")
