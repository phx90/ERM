from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
REL_NS = {"p": "http://schemas.openxmlformats.org/package/2006/relationships"}
CELL_RE = re.compile(r"([A-Z]+)(\d+)")


def col_number(ref: str) -> int:
    match = CELL_RE.match(ref)
    if not match:
        return 0
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.findall(".//m:t", NS))
            for item in root.findall("m:si", NS)]


def cell_value(cell: ET.Element, shared: list[str]) -> str | float | None:
    kind = cell.attrib.get("t")
    value = cell.find("m:v", NS)
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:t", NS))
    if value is None:
        return None
    raw = value.text or ""
    if kind == "s" and raw.isdigit():
        index = int(raw)
        return shared[index] if index < len(shared) else raw
    if kind in {"str", "e"}:
        return raw
    try:
        return float(raw)
    except ValueError:
        return raw


def analyze(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        shared = load_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in relations.findall("p:Relationship", REL_NS)}
        defined_names = {
            n.attrib.get("name", ""): n.text
            for n in workbook.findall("m:definedNames/m:definedName", NS)
        }
        result = {"file": str(path), "definedNames": defined_names, "sheets": []}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            name = sheet.attrib["name"]
            state = sheet.attrib.get("state", "visible")
            target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
            xml_path = target if target.startswith("xl/") else f"xl/{target}"
            root = ET.fromstring(archive.read(xml_path))
            dimension = root.find("m:dimension", NS)
            rows = root.findall("m:sheetData/m:row", NS)
            nonempty: list[tuple[int, int, str, object]] = []
            formulas = []
            errors = []
            styles = Counter()
            for row in rows:
                for cell in row.findall("m:c", NS):
                    ref = cell.attrib.get("r", "")
                    value = cell_value(cell, shared)
                    formula = cell.find("m:f", NS)
                    if value not in (None, "") or formula is not None:
                        row_no = int(CELL_RE.match(ref).group(2)) if CELL_RE.match(ref) else 0
                        nonempty.append((row_no, col_number(ref), ref, value))
                    if formula is not None:
                        text = formula.text or ""
                        formulas.append({"cell": ref, "formula": text, "value": value})
                        if "#REF!" in text or value == "#REF!":
                            errors.append({"cell": ref, "formula": text, "value": value})
                    if cell.attrib.get("s"):
                        styles[cell.attrib["s"]] += 1
            main_rows = [r for r, _, _, _ in nonempty if r <= 10000]
            far_cells = [{"cell": ref, "value": value} for r, _, ref, value in nonempty
                         if r > 10000 or col_number(ref) > 100]
            sample = []
            for row_no in sorted(set(r for r, _, _, _ in nonempty))[:12]:
                values = {ref: value for r, _, ref, value in nonempty if r == row_no}
                sample.append({"row": row_no, "cells": values})
            validations = root.findall("m:dataValidations/m:dataValidation", NS)
            conditional = root.findall("m:conditionalFormatting", NS)
            filters = root.findall(".//m:autoFilter", NS)
            merges = root.findall("m:mergeCells/m:mergeCell", NS)
            result["sheets"].append({
                "name": name,
                "state": state,
                "dimension": dimension.attrib.get("ref") if dimension is not None else None,
                "xmlRowCount": len(rows),
                "nonEmptyCellCount": len(nonempty),
                "firstDataRow": min(main_rows) if main_rows else None,
                "lastDataRow": max(main_rows) if main_rows else None,
                "formulas": len(formulas),
                "brokenRefs": errors[:100],
                "dataValidations": [{"sqref": v.attrib.get("sqref"), "type": v.attrib.get("type"),
                                     "formula1": (v.findtext("m:formula1", default="", namespaces=NS))}
                                    for v in validations],
                "conditionalFormattingRanges": [c.attrib.get("sqref") for c in conditional],
                "filters": [f.attrib.get("ref") for f in filters],
                "mergedCells": [m.attrib.get("ref") for m in merges],
                "topStyles": styles.most_common(10),
                "farCells": far_cells[:100],
                "sampleRows": sample,
            })
        return result


if __name__ == "__main__":
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(analyze(source), ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)
