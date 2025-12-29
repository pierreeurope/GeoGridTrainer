#!/usr/bin/env python3
"""
GeoGridTrainer - CDN mirror + clean CSV export

This script mirrors the public GeoGrid CDN datasets and exports "clean" CSVs:
- list/dict fields are stored as JSON strings (so list-like categories remain lists)
- additional normalized tables are produced for easy filtering/joins

Data source discovered from GeoGrid frontend:
  https://www.geogridgame.com/
CDN base:
  https://cdn-assets.teuteuf.fr/data/
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


CDN_BASE = "https://cdn-assets.teuteuf.fr/data/"
GEOGRID_START_DATE = dt.date(2024, 4, 7)  # from site source code (getBoardId.js)
GEOGRID_SOURCEMAP_PATH = "raw data/geogrid_site/app.e26f3b91.js.map"


@dataclass(frozen=True)
class Paths:
    root: Path
    raw_cdn: Path
    raw_common_countries: Path
    raw_geogrid_countries: Path
    raw_geogrid_boards: Path
    raw_flag_svgs: Path
    cleaned: Path

    @staticmethod
    def from_root(root: Path) -> "Paths":
        return Paths(
            root=root,
            raw_cdn=root / "raw data" / "cdn",
            raw_common_countries=root / "raw data" / "cdn" / "common_countries",
            raw_geogrid_countries=root / "raw data" / "cdn" / "geogrid_countries",
            raw_geogrid_boards=root / "raw data" / "cdn" / "geogrid_boards",
            raw_flag_svgs=root / "raw data" / "cdn" / "common_flags_svg",
            cleaned=root / "cleaned",
        )


def _ensure_dirs(p: Paths) -> None:
    for d in [
        p.raw_cdn,
        p.raw_common_countries,
        p.raw_geogrid_countries,
        p.raw_geogrid_boards,
        p.raw_flag_svgs,
        p.cleaned,
    ]:
        d.mkdir(parents=True, exist_ok=True)


def _run(cmd: List[str]) -> Tuple[int, str, str]:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def fetch_to_file(url: str, out_path: Path) -> Tuple[bool, Optional[int]]:
    """
    Fetch URL to a file using curl -k (TLS verify disabled).
    Returns (ok, http_status).
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    status_fmt = "%{http_code}"
    cmd = [
        "curl",
        "-k",
        "-sS",
        "-L",
        "-w",
        status_fmt,
        url,
        "-o",
        str(tmp_path),
    ]
    code, stdout, stderr = _run(cmd)
    if code != 0:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        return False, None
    try:
        http_status = int(stdout.strip() or "0")
    except ValueError:
        http_status = None
    if http_status != 200:
        tmp_path.unlink(missing_ok=True)
        return False, http_status
    tmp_path.replace(out_path)
    return True, http_status


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def json_dumps_stable(val: Any) -> str:
    return json.dumps(val, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def is_primitive(val: Any) -> bool:
    return val is None or isinstance(val, (str, int, float, bool))


def flatten_for_csv(obj: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    """
    Flatten a dict into a single-level dict:
    - primitives kept as-is
    - lists/dicts become stable JSON strings
    - nested dicts are flattened with "__" separator
    """
    out: Dict[str, Any] = {}
    for k, v in obj.items():
        key = f"{prefix}{k}" if not prefix else f"{prefix}__{k}"
        if is_primitive(v):
            out[key] = v
        elif isinstance(v, dict):
            # flatten nested dict, but also keep the JSON form for lossless roundtrip
            out[key] = json_dumps_stable(v)
            for nk, nv in flatten_for_csv(v, prefix=key).items():
                # Avoid exploding keys too much; nested primitives are still helpful
                if is_primitive(nv):
                    out[nk] = nv
        elif isinstance(v, list):
            out[key] = json_dumps_stable(v)
        else:
            out[key] = json_dumps_stable(v)
    return out


def write_csv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def build_name_to_code_maps(common_countries: List[Dict[str, Any]]) -> Tuple[Dict[str, str], List[Dict[str, Any]]]:
    """
    Build a mapping of normalized country names -> country code, plus a CSV-friendly mapping table.

    We include:
    - country['name']
    - names[*] translations

    NOTE: GeoGrid boards sometimes use English names; we normalize with a conservative normalizer.
    """

    def norm(s: str) -> str:
        s = s.strip().lower()
        s = s.replace("’", "'")
        s = " ".join(s.split())
        return s

    name_to_code: Dict[str, str] = {}
    mapping_rows: List[Dict[str, Any]] = []
    for c in common_countries:
        code = c.get("code")
        if not code:
            continue
        names: Dict[str, str] = c.get("names") or {}
        candidates: List[str] = []
        if isinstance(c.get("name"), str):
            candidates.append(c["name"])
        if isinstance(names, dict):
            candidates.extend([v for v in names.values() if isinstance(v, str)])
        for raw in candidates:
            n = norm(raw)
            if not n:
                continue
            # If collisions occur, keep first and record duplicates by skipping overwrite.
            if n not in name_to_code:
                name_to_code[n] = code
            mapping_rows.append({"name_normalized": n, "name_raw": raw, "code": code})
    return name_to_code, mapping_rows


def update_old_names_to_match_cdn(name: str) -> str:
    """
    Mirrors the site's updateOldCountryName.js behavior (limited mapping).
    Helps reconcile board answer names to CDN names.
    """
    mapping = {
        "Ivory Coast": "Côte d'Ivoire",
        "Aland Islands": "Åland",
        "East Timor": "Timor-Leste",
        "Micronesia": "Federated States of Micronesia",
        "Guernsey": "Bailiwick of Guernsey",
        "Cape Verde": "Cabo Verde",
        "Reunion": "Réunion",
        "Curacao": "Curaçao",
        "Saint Barthelemy": "Saint Barthélemy",
        "Sao Tome and Principe": "São Tomé and Príncipe",
    }
    return mapping.get(name, name)


def compute_latest_board_id(today: Optional[dt.date] = None) -> int:
    if today is None:
        today = dt.date.today()
    if today < GEOGRID_START_DATE:
        return 1
    return (today - GEOGRID_START_DATE).days + 1


def board_date(board_id: int) -> dt.date:
    return GEOGRID_START_DATE + dt.timedelta(days=board_id - 1)


def mirror_base_files(p: Paths) -> Dict[str, Any]:
    # version.json
    ok, status = fetch_to_file(CDN_BASE + "version.json", p.raw_cdn / "version.json")
    if not ok:
        raise RuntimeError(f"Failed to fetch version.json (status={status})")

    # common lists
    ok, status = fetch_to_file(CDN_BASE + "common/countries.json", p.raw_cdn / "common__countries.json")
    if not ok:
        raise RuntimeError(f"Failed to fetch common/countries.json (status={status})")
    ok, status = fetch_to_file(CDN_BASE + "common/cities.json", p.raw_cdn / "common__cities.json")
    if not ok:
        raise RuntimeError(f"Failed to fetch common/cities.json (status={status})")

    version_obj = load_json(p.raw_cdn / "version.json")
    countries = load_json(p.raw_cdn / "common__countries.json")
    cities = load_json(p.raw_cdn / "common__cities.json")

    if not isinstance(countries, list) or not countries:
        raise RuntimeError("common__countries.json did not parse as a non-empty list")
    if not isinstance(cities, list):
        raise RuntimeError("common__cities.json did not parse as a list")

    return {"version": version_obj, "countries": countries, "cities": cities}


def mirror_country_details(p: Paths, country_codes: List[str]) -> Dict[str, Any]:
    missing_common: List[str] = []
    missing_geogrid: List[str] = []
    for code in country_codes:
        cc = code.lower()
        common_path = p.raw_common_countries / f"{cc}.json"
        geogrid_path = p.raw_geogrid_countries / f"{cc}.json"

        if not common_path.exists():
            ok, status = fetch_to_file(CDN_BASE + f"common/countries/{cc}.json", common_path)
            if not ok:
                missing_common.append(code)
        if not geogrid_path.exists():
            ok, status = fetch_to_file(CDN_BASE + f"geogrid/countries/{cc}.json", geogrid_path)
            if not ok:
                missing_geogrid.append(code)

    # Validate JSON parse for downloaded files that exist
    invalid_common: List[str] = []
    invalid_geogrid: List[str] = []
    for code in country_codes:
        cc = code.lower()
        common_path = p.raw_common_countries / f"{cc}.json"
        geogrid_path = p.raw_geogrid_countries / f"{cc}.json"
        if common_path.exists():
            try:
                _ = load_json(common_path)
            except Exception:
                invalid_common.append(code)
        if geogrid_path.exists():
            try:
                _ = load_json(geogrid_path)
            except Exception:
                invalid_geogrid.append(code)

    return {
        "missing_common": missing_common,
        "missing_geogrid": missing_geogrid,
        "invalid_common": invalid_common,
        "invalid_geogrid": invalid_geogrid,
    }


def mirror_boards(p: Paths, latest_board_id: int) -> Dict[str, Any]:
    """
    Download boards 1..latest_board_id.
    Stops early if we hit a run of missing boards at the end (safety for timezone/cutover).
    """
    missing: List[int] = []
    invalid: List[int] = []
    consecutive_misses = 0
    last_success = 0

    for board_id in range(1, latest_board_id + 1):
        out_path = p.raw_geogrid_boards / f"{board_id}.json"
        if not out_path.exists():
            ok, status = fetch_to_file(CDN_BASE + f"geogrid/boards/{board_id}.json", out_path)
            if not ok:
                missing.append(board_id)
                consecutive_misses += 1
                # if we are near the end and keep missing, break (avoid pounding CDN)
                if board_id >= latest_board_id - 7 and consecutive_misses >= 3:
                    break
                continue
        consecutive_misses = 0

        try:
            b = load_json(out_path)
            if not isinstance(b, dict) or "rows" not in b or "columns" not in b or "answers" not in b:
                invalid.append(board_id)
            else:
                last_success = board_id
        except Exception:
            invalid.append(board_id)

    return {"missing": missing, "invalid": invalid, "last_success": last_success}


def mirror_flag_svgs(p: Paths, country_codes: List[str]) -> Dict[str, Any]:
    """
    Mirror all flag SVGs from the CDN into a folder keyed by country code.
    Example:
      raw data/cdn/common_flags_svg/af.svg
    CDN endpoint:
      https://cdn-assets.teuteuf.fr/data/common/flags/{cc}.svg
    """
    missing: List[str] = []
    invalid: List[str] = []
    downloaded = 0

    for code in country_codes:
        cc = str(code).lower()
        out_path = p.raw_flag_svgs / f"{cc}.svg"
        if not out_path.exists():
            ok, status = fetch_to_file(CDN_BASE + f"common/flags/{cc}.svg", out_path)
            if not ok:
                missing.append(str(code).upper())
                continue
            downloaded += 1

        # basic sanity: SVG should start with <svg or XML prolog
        try:
            head = out_path.read_text(encoding="utf-8", errors="ignore")[:200].lstrip()
            if not (head.startswith("<svg") or head.startswith("<?xml") or "<svg" in head[:200]):
                invalid.append(str(code).upper())
        except Exception:
            invalid.append(str(code).upper())

    return {"downloaded": downloaded, "missing": missing, "invalid": invalid, "total": len(country_codes)}


def _node_eval_js_to_json(js_source: str, expression: str) -> Any:
    """
    Evaluate JS source in Node and JSON.stringify a given expression.
    Intended for extracting structured literals (like categories.js) from sourcemaps.
    """
    wrapped = (
        '"use strict";\n'
        + js_source
        + "\n"
        + f"process.stdout.write(JSON.stringify({expression}));\n"
    )
    code, stdout, stderr = _run(["node", "-e", wrapped])
    if code != 0:
        raise RuntimeError(f"Node eval failed (code={code}): {stderr.strip()}")
    try:
        return json.loads(stdout)
    except Exception as e:
        raise RuntimeError(f"Failed to parse Node JSON output: {e}")


def extract_site_categories(root: Path) -> Optional[List[Dict[str, Any]]]:
    """
    Extract the official category naming/descriptions from GeoGrid frontend sourcemap.
    Returns list of section objects (each with {name, categories:[...]}) or None if missing.
    """
    sm_path = root / GEOGRID_SOURCEMAP_PATH
    if not sm_path.exists():
        return None
    sm = json.loads(sm_path.read_text(encoding="utf-8"))
    src_name = "webpack://frontend/./src/utils/categories.js"
    try:
        idx = sm["sources"].index(src_name)
    except ValueError:
        return None
    js = sm["sourcesContent"][idx] or ""
    if not js.strip():
        return None

    # Remove ESM export line so Node can eval in script mode
    js_lines = []
    for line in js.splitlines():
        if line.strip().startswith("export default"):
            continue
        js_lines.append(line)
    js_clean = "\n".join(js_lines)
    categories = _node_eval_js_to_json(js_clean, "categories")
    if not isinstance(categories, list):
        return None
    return categories


def pretty_column_name(raw: str) -> str:
    """
    Convert internal column keys to a more readable label.
    Example: flagInfo__colorsOnFlag -> Flag / Colors on flag
    """

    section_map = {
        "flagInfo": "Flag",
        "geographyInfo": "Geography",
        "economicInfo": "Economy",
        "politicalInfo": "Politics",
        "sportsInfo": "Sports",
        "factsInfo": "Facts",
    }

    def split_camel(s: str) -> str:
        out = []
        buf = ""
        for ch in s:
            if ch.isupper() and buf:
                out.append(buf)
                buf = ch
            else:
                buf += ch
        if buf:
            out.append(buf)
        return " ".join(w.lower() for w in out).strip()

    # Keep known stable id columns as-is but nicer
    if raw in {"code", "name", "name_en"}:
        return {"code": "Country code", "name": "Country name", "name_en": "Country name (EN)"}[raw]

    parts = raw.split("__")
    if len(parts) == 1:
        return split_camel(parts[0]).capitalize()
    sect = section_map.get(parts[0], split_camel(parts[0]).capitalize())
    rest = " / ".join(split_camel(p).capitalize() for p in parts[1:])
    return f"{sect} / {rest}"


def export_site_category_metadata(p: Paths) -> Dict[str, Any]:
    """
    Export GeoGrid's own category wording (sections, ids, descriptions, sources).
    """
    categories = extract_site_categories(p.root)
    if not categories:
        return {"exported": False, "rows": 0}

    rows: List[Dict[str, Any]] = []
    id_rows: List[Dict[str, Any]] = []
    for s_idx, section in enumerate(categories):
        sec_name = section.get("name")
        cats = section.get("categories") or []
        if not isinstance(cats, list):
            continue
        for c_idx, cat in enumerate(cats):
            if not isinstance(cat, dict):
                continue
            ids = cat.get("ids") or []
            rows.append(
                {
                    "section_idx": s_idx,
                    "section_name": sec_name,
                    "category_idx": c_idx,
                    "category_name": cat.get("name"),
                    "ids_json": json_dumps_stable(ids),
                    "description_json": json_dumps_stable(cat.get("description") or []),
                    "stats_json": json_dumps_stable(cat.get("stats") or []),
                    "sources_json": json_dumps_stable(cat.get("sources") or []),
                }
            )
            if isinstance(ids, list):
                for cid in ids:
                    if isinstance(cid, str):
                        id_rows.append(
                            {
                                "section_name": sec_name,
                                "category_name": cat.get("name"),
                                "category_id": cid,
                            }
                        )

    if rows:
        write_csv(
            p.cleaned / "geogrid_category_metadata.csv",
            rows,
            fieldnames=[
                "section_idx",
                "section_name",
                "category_idx",
                "category_name",
                "ids_json",
                "description_json",
                "stats_json",
                "sources_json",
            ],
        )
    if id_rows:
        write_csv(
            p.cleaned / "geogrid_category_ids.csv",
            id_rows,
            fieldnames=["category_id", "category_name", "section_name"],
        )

    return {"exported": True, "rows": len(rows), "ids": len(id_rows)}


def export_csvs(p: Paths, common_countries: List[Dict[str, Any]], common_cities: List[Dict[str, Any]]) -> Dict[str, Any]:
    # 1) Common countries list
    common_country_rows: List[Dict[str, Any]] = []
    for c in common_countries:
        names = c.get("names") or {}
        row = dict(c)
        row["name_en"] = names.get("en") if isinstance(names, dict) else ""
        row["names_json"] = json_dumps_stable(names) if isinstance(names, dict) else json_dumps_stable({})
        common_country_rows.append(row)
    common_country_fieldnames = sorted({k for r in common_country_rows for k in r.keys()})
    write_csv(p.cleaned / "common_countries.csv", common_country_rows, common_country_fieldnames)

    # 2) Common cities list
    common_city_rows: List[Dict[str, Any]] = []
    for c in common_cities:
        names = c.get("names") or {}
        row = dict(c)
        row["name_en"] = names.get("en") if isinstance(names, dict) else ""
        row["names_json"] = json_dumps_stable(names) if isinstance(names, dict) else json_dumps_stable({})
        if "images" in row:
            row["images_json"] = json_dumps_stable(row["images"])
        common_city_rows.append(row)
    common_city_fieldnames = sorted({k for r in common_city_rows for k in r.keys()})
    write_csv(p.cleaned / "common_cities.csv", common_city_rows, common_city_fieldnames)

    # 3) Name->code mapping table (for board answer reconciliation)
    name_to_code, mapping_rows = build_name_to_code_maps(common_countries)
    write_csv(
        p.cleaned / "country_name_to_code.csv",
        mapping_rows,
        fieldnames=["name_normalized", "name_raw", "code"],
    )

    # 4) Per-country details (common + geogrid)
    codes = [c.get("code") for c in common_countries if c.get("code")]
    common_details_rows: List[Dict[str, Any]] = []
    geogrid_details_rows: List[Dict[str, Any]] = []
    geogrid_details_long_rows: List[Dict[str, Any]] = []  # normalized key/value for list-friendly filtering

    # build quick join from code -> country basic metadata
    code_to_basic = {c["code"].upper(): c for c in common_countries if isinstance(c.get("code"), str)}

    for code in codes:
        cc = str(code).lower()
        common_path = p.raw_common_countries / f"{cc}.json"
        geogrid_path = p.raw_geogrid_countries / f"{cc}.json"
        common_obj: Optional[Dict[str, Any]] = None
        geogrid_obj: Optional[Dict[str, Any]] = None
        if common_path.exists():
            obj = load_json(common_path)
            if isinstance(obj, dict):
                common_obj = obj
                row = flatten_for_csv(obj)
                row["code"] = code
                basic = code_to_basic.get(str(code).upper())
                if basic:
                    row["name"] = basic.get("name")
                    names = basic.get("names") or {}
                    row["name_en"] = names.get("en") if isinstance(names, dict) else ""

                # Derived: borders count + borders codes list (very useful for filtering)
                borders = obj.get("borders")
                if isinstance(borders, list):
                    row["border_count"] = len(borders)
                    row["border_countries_codes_json"] = json_dumps_stable(borders)
                common_details_rows.append(row)
        if geogrid_path.exists():
            obj = load_json(geogrid_path)
            if isinstance(obj, dict):
                geogrid_obj = obj
                row = {"code": code}
                basic = code_to_basic.get(str(code).upper())
                if basic:
                    row["name"] = basic.get("name")
                    names = basic.get("names") or {}
                    row["name_en"] = names.get("en") if isinstance(names, dict) else ""

                # Flatten each section with a stable prefix
                for section, section_obj in obj.items():
                    if isinstance(section_obj, dict):
                        flat = flatten_for_csv(section_obj, prefix=section)
                        row.update(flat)
                        # long-format (key/value) for primitives and list JSON
                        for k, v in section_obj.items():
                            if is_primitive(v) or isinstance(v, (list, dict)):
                                geogrid_details_long_rows.append(
                                    {
                                        "code": code,
                                        "section": section,
                                        "key": k,
                                        "value_json": json_dumps_stable(v),
                                        "value_type": type(v).__name__,
                                    }
                                )
                    else:
                        row[section] = json_dumps_stable(section_obj)

                # Derived: border count / bordering country codes (from common data, with optional override)
                borders = common_obj.get("borders") if isinstance(common_obj, dict) else None
                border_count = len(borders) if isinstance(borders, list) else None
                border_override = None
                if isinstance(geogrid_obj, dict):
                    geo = geogrid_obj.get("geographyInfo")
                    if isinstance(geo, dict):
                        border_override = geo.get("borderCountOverride")
                if isinstance(border_override, int):
                    border_count = border_override
                if border_count is not None:
                    row["geographyInfo__borderCount"] = border_count
                    geogrid_details_long_rows.append(
                        {
                            "code": code,
                            "section": "geographyInfo",
                            "key": "borderCount",
                            "value_json": json_dumps_stable(border_count),
                            "value_type": "int",
                        }
                    )
                if isinstance(borders, list):
                    row["geographyInfo__borderCountriesCodes_json"] = json_dumps_stable(borders)
                    geogrid_details_long_rows.append(
                        {
                            "code": code,
                            "section": "geographyInfo",
                            "key": "borderCountriesCodes",
                            "value_json": json_dumps_stable(borders),
                            "value_type": "list",
                        }
                    )
                geogrid_details_rows.append(row)

    if common_details_rows:
        common_details_fieldnames = sorted({k for r in common_details_rows for k in r.keys()})
        write_csv(p.cleaned / "common_country_details.csv", common_details_rows, common_details_fieldnames)

    if geogrid_details_rows:
        geogrid_details_fieldnames = sorted({k for r in geogrid_details_rows for k in r.keys()})
        write_csv(p.cleaned / "geogrid_country_details.csv", geogrid_details_rows, geogrid_details_fieldnames)

    if geogrid_details_long_rows:
        write_csv(
            p.cleaned / "geogrid_country_details_long.csv",
            geogrid_details_long_rows,
            fieldnames=["code", "section", "key", "value_type", "value_json"],
        )

    # 4b) Column dictionaries (keep machine columns stable, but provide UI-friendly labels)
    if common_details_rows:
        cols = sorted({k for r in common_details_rows for k in r.keys()})
        dict_rows = [
            {"table": "common_country_details.csv", "column": c, "display_name": pretty_column_name(c)}
            for c in cols
        ]
        write_csv(
            p.cleaned / "column_dictionary_common_country_details.csv",
            dict_rows,
            fieldnames=["table", "column", "display_name"],
        )
    if geogrid_details_rows:
        cols = sorted({k for r in geogrid_details_rows for k in r.keys()})
        dict_rows = [
            {"table": "geogrid_country_details.csv", "column": c, "display_name": pretty_column_name(c)}
            for c in cols
        ]
        write_csv(
            p.cleaned / "column_dictionary_geogrid_country_details.csv",
            dict_rows,
            fieldnames=["table", "column", "display_name"],
        )

    # 5) Boards + prompts + cells
    board_rows: List[Dict[str, Any]] = []
    prompt_rows: List[Dict[str, Any]] = []
    cell_rows: List[Dict[str, Any]] = []
    unresolved_answer_names: List[Dict[str, Any]] = []

    # helper normalizer compatible with name_to_code map
    def norm_country_name(s: str) -> str:
        s = update_old_names_to_match_cdn(s)
        s = s.strip().lower().replace("’", "'")
        s = " ".join(s.split())
        return s

    # iterate boards from disk
    for board_file in sorted(p.raw_geogrid_boards.glob("*.json"), key=lambda x: int(x.stem)):
        board_id = int(board_file.stem)
        b = load_json(board_file)
        if not isinstance(b, dict):
            continue
        rows = b.get("rows") or []
        cols = b.get("columns") or []
        answers = b.get("answers") or {}

        board_rows.append(
            {
                "board_id": board_id,
                "grid_id": b.get("grid_id", board_id),
                "date": board_date(board_id).isoformat(),
                "rows_json": json_dumps_stable(rows),
                "columns_json": json_dumps_stable(cols),
                "answers_keys_json": json_dumps_stable(sorted(list(answers.keys())) if isinstance(answers, dict) else []),
            }
        )

        for axis, prompts in [("row", rows), ("col", cols)]:
            if isinstance(prompts, list):
                for idx, pr in enumerate(prompts):
                    if isinstance(pr, dict):
                        prompt_rows.append(
                            {
                                "board_id": board_id,
                                "axis": axis,
                                "idx": idx,
                                "prompt_id": pr.get("id"),
                                "variantId": pr.get("variantId"),
                                "name": pr.get("name"),
                                "prompt_json": json_dumps_stable(pr),
                            }
                        )

        if isinstance(answers, dict):
            # match_box_1..9 (3x3)
            for key, ans_list in answers.items():
                if not isinstance(ans_list, list):
                    continue
                # attempt to infer row/col from match_box_N
                row_idx = col_idx = None
                if isinstance(key, str) and key.startswith("match_box_"):
                    try:
                        n = int(key.split("_")[-1])
                        row_idx = (n - 1) // 3
                        col_idx = (n - 1) % 3
                    except Exception:
                        pass

                codes_resolved: List[str] = []
                unknown: List[str] = []
                for name in ans_list:
                    if not isinstance(name, str):
                        continue
                    nrm = norm_country_name(name)
                    code = name_to_code.get(nrm)
                    if code:
                        codes_resolved.append(code)
                    else:
                        unknown.append(name)
                        unresolved_answer_names.append(
                            {
                                "board_id": board_id,
                                "cell_key": key,
                                "answer_name": name,
                                "answer_name_normalized": nrm,
                            }
                        )

                cell_rows.append(
                    {
                        "board_id": board_id,
                        "cell_key": key,
                        "row_idx": row_idx,
                        "col_idx": col_idx,
                        "answers_count": len(ans_list),
                        "answers_names_json": json_dumps_stable(ans_list),
                        "answers_codes_json": json_dumps_stable(sorted(set(codes_resolved))),
                        "unknown_answers_json": json_dumps_stable(sorted(set(unknown))),
                    }
                )

    if board_rows:
        write_csv(p.cleaned / "geogrid_boards.csv", board_rows, fieldnames=sorted(board_rows[0].keys()))
    if prompt_rows:
        write_csv(
            p.cleaned / "geogrid_board_prompts.csv",
            prompt_rows,
            fieldnames=["board_id", "axis", "idx", "prompt_id", "variantId", "name", "prompt_json"],
        )
    if cell_rows:
        write_csv(
            p.cleaned / "geogrid_board_cells.csv",
            cell_rows,
            fieldnames=[
                "board_id",
                "cell_key",
                "row_idx",
                "col_idx",
                "answers_count",
                "answers_names_json",
                "answers_codes_json",
                "unknown_answers_json",
            ],
        )
    if unresolved_answer_names:
        write_csv(
            p.cleaned / "geogrid_board_unresolved_answer_names.csv",
            unresolved_answer_names,
            fieldnames=["board_id", "cell_key", "answer_name", "answer_name_normalized"],
        )

    return {
        "counts": {
            "common_countries": len(common_country_rows),
            "common_cities": len(common_city_rows),
            "common_country_details": len(common_details_rows),
            "geogrid_country_details": len(geogrid_details_rows),
            "geogrid_country_details_long": len(geogrid_details_long_rows),
            "boards": len(board_rows),
            "board_prompts": len(prompt_rows),
            "board_cells": len(cell_rows),
            "unresolved_board_answer_names": len(unresolved_answer_names),
        }
    }


def _read_csv_as_dicts(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def export_final_countries_csv(p: Paths, common_countries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Produce a single final wide CSV intended for UI consumption:
    - one row per country
    - includes country code
    - includes country names for every language available in the dataset (one column per language code)
    - merges both common_country_details + geogrid_country_details
    - uses readable column names, while preserving machine keys in brackets for stability
    """
    common_details_path = p.cleaned / "common_country_details.csv"
    geogrid_details_path = p.cleaned / "geogrid_country_details.csv"
    if not common_details_path.exists() or not geogrid_details_path.exists():
        raise RuntimeError("Missing prerequisite CSVs; run export_csvs first.")

    common_rows = _read_csv_as_dicts(common_details_path)
    geogrid_rows = _read_csv_as_dicts(geogrid_details_path)

    common_by_code = {r.get("code", ""): r for r in common_rows if r.get("code")}
    geogrid_by_code = {r.get("code", ""): r for r in geogrid_rows if r.get("code")}

    # Collect all language codes available across countries.names
    lang_codes: List[str] = []
    lang_set = set()
    code_to_names: Dict[str, Dict[str, str]] = {}
    code_to_default_name: Dict[str, str] = {}
    for c in common_countries:
        code = c.get("code")
        if not isinstance(code, str):
            continue
        code = code.upper()
        code_to_default_name[code] = c.get("name") if isinstance(c.get("name"), str) else ""
        names = c.get("names") if isinstance(c.get("names"), dict) else {}
        # keep only str values
        clean_names = {k: v for k, v in names.items() if isinstance(k, str) and isinstance(v, str)}
        code_to_names[code] = clean_names
        for k in clean_names.keys():
            if k not in lang_set:
                lang_set.add(k)
                lang_codes.append(k)
    lang_codes = sorted(lang_codes)

    # Build merged wide rows
    all_codes = sorted({c.get("code", "").upper() for c in common_countries if isinstance(c.get("code"), str)})
    merged_rows: List[Dict[str, Any]] = []

    # Gather feature keys from both tables (excluding code/name columns that we'll replace)
    exclude_keys = {"code", "name", "name_en"}
    common_keys = sorted({k for r in common_rows for k in r.keys()} - exclude_keys)
    geogrid_keys = sorted({k for r in geogrid_rows for k in r.keys()} - exclude_keys)

    # Use unique readable headers; include machine key in brackets
    def header_for(table_prefix: str, key: str) -> str:
        # table_prefix keeps same-looking keys from colliding
        display = pretty_column_name(key)
        return f"{table_prefix}{display} [{key}]"

    headers: List[str] = []
    headers.append("Country code")
    headers.append("Country name (default)")
    for lc in lang_codes:
        headers.append(f"Country name ({lc})")

    common_header_map = {k: header_for("Common / ", k) for k in common_keys}
    geogrid_header_map = {k: header_for("GeoGrid / ", k) for k in geogrid_keys}

    headers.extend([common_header_map[k] for k in common_keys])
    headers.extend([geogrid_header_map[k] for k in geogrid_keys])

    for code in all_codes:
        row: Dict[str, Any] = {}
        row["Country code"] = code
        row["Country name (default)"] = code_to_default_name.get(code, "")
        names = code_to_names.get(code, {})
        for lc in lang_codes:
            row[f"Country name ({lc})"] = names.get(lc, "")

        c_row = common_by_code.get(code, {})
        g_row = geogrid_by_code.get(code, {})
        for k in common_keys:
            row[common_header_map[k]] = c_row.get(k, "")
        for k in geogrid_keys:
            row[geogrid_header_map[k]] = g_row.get(k, "")

        merged_rows.append(row)

    write_csv(p.cleaned / "final_countries.csv", merged_rows, fieldnames=headers)
    return {"rows": len(merged_rows), "langs": len(lang_codes), "columns": len(headers)}


def export_ui_countries_csv(p: Paths) -> Dict[str, Any]:
    """
    Produce a UI-focused CSV intended to be served directly by the React app:
    - one row per country
    - English name only (Country)
    - keep code for linking flags (hidden in UI but useful)
    - ONLY columns that correspond to GeoGrid game attributes (plus a few needed from common data)
    - readable headers (no machine key noise)
    - list-like values stored as JSON arrays for robust filtering
    """
    final_path = p.cleaned / "final_countries.csv"
    if not final_path.exists():
        raise RuntimeError("final_countries.csv missing; run export_final_countries_csv first.")

    rows = _read_csv_as_dicts(final_path)
    if not rows:
        raise RuntimeError("final_countries.csv appears empty")

    # Build a derived "rarity" from historical GeoGrid boards:
    # rarity is based on how often a country appears as a valid answer across all board cells.
    # (This is NOT player-answer rarity; it's a dataset coverage rarity.)
    board_cells_path = p.cleaned / "geogrid_board_cells.csv"
    code_to_answer_cell_count: Dict[str, int] = {}
    total_cells = 0
    if board_cells_path.exists():
        with board_cells_path.open("r", encoding="utf-8", newline="") as f:
            rdr = csv.DictReader(f)
            for cell in rdr:
                total_cells += 1
                raw = (cell.get("answers_codes_json") or "").strip()
                if not raw:
                    continue
                try:
                    codes = json.loads(raw)
                except Exception:
                    continue
                if not isinstance(codes, list):
                    continue
                # count once per cell
                for cc in {str(x).upper() for x in codes if isinstance(x, str) and x}:
                    code_to_answer_cell_count[cc] = code_to_answer_cell_count.get(cc, 0) + 1

    # Convert counts to a 0..100 score where 100 is "rarest" (lowest count) and 0 is "most common".
    # Use percentile rank over countries that appear at least once.
    rarity_score_by_code: Dict[str, int] = {}
    if code_to_answer_cell_count:
        items = sorted(code_to_answer_cell_count.items(), key=lambda kv: (kv[1], kv[0]))  # asc count
        n = len(items)
        for idx, (cc, _cnt) in enumerate(items):
            if n == 1:
                rarity_score_by_code[cc] = 100
            else:
                percentile = idx / (n - 1)  # 0 (rarest) .. 1 (most common)
                rarity_score_by_code[cc] = int(round(100 * (1 - percentile)))

    # Helper to find columns by machine key suffix in brackets: "... [machineKey]"
    def find_col(machine_key: str) -> Optional[str]:
        for k in rows[0].keys():
            if k.endswith(f"[{machine_key}]"):
                return k
        return None

    # Core identifiers
    code_col = "Country code"
    name_col = "Country name (default)"

    # Common fields used by some GeoGrid categories
    common_continent = find_col("continent")
    common_population = find_col("population")
    common_size = find_col("size")

    # GeoGrid attribute machine keys to include (these are the “base facts” behind most categories)
    geogrid_keys = [
        # Flag
        "flagInfo__colorsOnFlag",
        "flagInfo__hasStar",
        "flagInfo__hasCoatOfArms",
        "flagInfo__hasAnimal",
        # Geography
        "geographyInfo__landlocked",
        "geographyInfo__islandNation",
        "geographyInfo__coastlineLength",
        "geographyInfo__coastline",
        "geographyInfo__touchesSahara",
        "geographyInfo__rivers",
        "geographyInfo__touchesEurasionSteppe",
        "geographyInfo__touchesEquator",
        "geographyInfo__top10Lakes",
        "geographyInfo__borderCount",
        "geographyInfo__borderCountriesCodes_json",
        # Economy
        "economicInfo__HDI",
        "economicInfo__GDPPerCapita",
        "economicInfo__GDPPerCapitaYear",
        "economicInfo__top20WheatProduction",
        "economicInfo__top20OilProduction",
        "economicInfo__top20RenewableElectricityProduction",
        "economicInfo__producesNuclearPower",
        # Politics
        "politicalInfo__isMonarchy",
        "politicalInfo__inEU",
        "politicalInfo__hasNuclearWeapons",
        "politicalInfo__wasUSSR",
        "politicalInfo__inCommonwealth",
        "politicalInfo__timeZones",
        "politicalInfo__observesDST",
        "politicalInfo__sameSexMarriageLegal",
        "politicalInfo__sameSexActivitiesIllegal",
        "politicalInfo__CPI",
        "politicalInfo__isTerritory",
        # Sports
        "sportsInfo__olympicMedals",
        "sportsInfo__hostedF1",
        "sportsInfo__hostedOlympics",
        "sportsInfo__hostedMensWorldCup",
        "sportsInfo__playedMensWorldCup",
        "sportsInfo__wonMensWorldCup",
        # Facts
        "factsInfo__drivesLeft",
        "factsInfo__hasAlcoholBan",
        "factsInfo__has50Skyscrapers",
        "factsInfo__top20ObesityRate",
        "factsInfo__top20ChocolateConsumption",
        "factsInfo__top20AlcoholConsumption",
        "factsInfo__top20PopulationDensity",
        "factsInfo__bottom20PopulationDensity",
        "factsInfo__top20TourismRate",
        "factsInfo__top20RailSize",
        "factsInfo__top20WorldHeritageSites",
        "factsInfo__airPollution",
        "factsInfo__co2Emissions",
    ]

    selected_cols: List[Tuple[str, str]] = []  # (out_header, source_col)

    # Always include code (for flag URL building), but UI can hide it by default.
    selected_cols.append(("code", code_col))
    selected_cols.append(("Country", name_col))
    selected_cols.append(("Rarity", "__computed_rarity"))
    selected_cols.append(("flag_svg", "code"))  # computed later from code

    if common_continent:
        selected_cols.append(("Continent codes", common_continent))
    if common_population:
        selected_cols.append(("Population", common_population))
    if common_size:
        selected_cols.append(("Area km²", common_size))

    # Map geo keys to their existing source columns in final_countries.csv (preferring GeoGrid table)
    for mk in geogrid_keys:
        src = find_col(mk)
        if src:
            selected_cols.append((pretty_column_name(mk).replace(" / ", " - "), src))

    out_rows: List[Dict[str, Any]] = []
    for r in rows:
        out: Dict[str, Any] = {}
        code = (r.get(code_col) or "").strip().upper()
        out["code"] = code
        out["Country"] = (r.get(name_col) or "").strip()
        out["Rarity"] = rarity_score_by_code.get(code) if code else ""
        out["flag_svg"] = f"/flags/{code.lower()}.svg" if code else ""
        for out_h, src_h in selected_cols:
            if out_h in {"code", "Country", "Rarity", "flag_svg"}:
                continue
            out[out_h] = r.get(src_h, "")
        out_rows.append(out)

    # Ensure deterministic column order
    fieldnames = list(out_rows[0].keys())
    write_csv(p.cleaned / "ui_countries.csv", out_rows, fieldnames=fieldnames)
    return {"rows": len(out_rows), "columns": len(fieldnames), "total_cells": total_cells}


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    p = Paths.from_root(root)
    _ensure_dirs(p)

    print("== GeoGridTrainer: mirror CDN + export CSV ==")
    print("root:", root)
    print("cdn:", CDN_BASE)
    print("start_date:", GEOGRID_START_DATE.isoformat())

    # Step 1: mirror base files
    print("\n-- Step 1: Download base lists --")
    base = mirror_base_files(p)
    version = base["version"]
    common_countries = base["countries"]
    common_cities = base["cities"]
    print("version.json:", version)
    print("common countries:", len(common_countries))
    print("common cities:", len(common_cities))

    # Step 1b: mirror flag SVGs
    print("\n-- Step 1b: Download flag SVGs --")
    codes = [c.get("code") for c in common_countries if isinstance(c.get("code"), str)]
    flags_report = mirror_flag_svgs(p, codes)
    print("flags total:", flags_report["total"])
    print("flags downloaded (this run):", flags_report["downloaded"])
    print("flags missing:", len(flags_report["missing"]))
    print("flags invalid:", len(flags_report["invalid"]))

    # Step 2: download per-country details
    print("\n-- Step 2: Download per-country detail JSONs --")
    report_countries = mirror_country_details(p, codes)
    print("missing common country detail:", len(report_countries["missing_common"]))
    print("missing geogrid country detail:", len(report_countries["missing_geogrid"]))
    print("invalid common country detail:", len(report_countries["invalid_common"]))
    print("invalid geogrid country detail:", len(report_countries["invalid_geogrid"]))

    # Step 3: boards
    print("\n-- Step 3: Download boards --")
    latest = compute_latest_board_id()
    print("computed latest board id (from system date):", latest)
    report_boards = mirror_boards(p, latest_board_id=latest)
    print("boards missing:", len(report_boards["missing"]))
    print("boards invalid:", len(report_boards["invalid"]))
    print("boards last_success:", report_boards["last_success"])

    # Step 4: export CSVs
    print("\n-- Step 4: Export cleaned CSVs --")
    export_report = export_csvs(p, common_countries=common_countries, common_cities=common_cities)
    for k, v in export_report["counts"].items():
        print(f"{k}: {v}")

    # Step 4b: export site category metadata (official wording)
    print("\n-- Step 4b: Export GeoGrid category metadata (official labels) --")
    cat_report = export_site_category_metadata(p)
    if cat_report.get("exported"):
        print("geogrid_category_metadata.csv rows:", cat_report.get("rows"))
        print("geogrid_category_ids.csv rows:", cat_report.get("ids"))
    else:
        print("No sourcemap category metadata found; skipped.")

    # Step 4c: export final merged wide CSV with readable headers + names in all languages
    print("\n-- Step 4c: Export final merged countries CSV (readable headers) --")
    final_report = export_final_countries_csv(p, common_countries=common_countries)
    print("final_countries.csv rows:", final_report["rows"])
    print("final_countries.csv name languages:", final_report["langs"])
    print("final_countries.csv columns:", final_report["columns"])

    print("\n-- Step 4d: Export UI-focused countries CSV (GeoGrid-only columns) --")
    ui_report = export_ui_countries_csv(p)
    print("ui_countries.csv rows:", ui_report["rows"])
    print("ui_countries.csv columns:", ui_report["columns"])

    # Step 5: verification summary / hard failures
    print("\n-- Step 5: Verification --")
    hard_fail = False
    if report_countries["invalid_common"] or report_countries["invalid_geogrid"]:
        print("ERROR: Some downloaded per-country JSON files did not parse as JSON.")
        hard_fail = True
    if flags_report["missing"] or flags_report["invalid"]:
        print("ERROR: Some flag SVGs were missing or did not look like SVG.")
        hard_fail = True
    if not (p.cleaned / "geogrid_country_details.csv").exists():
        print("ERROR: geogrid_country_details.csv was not created.")
        hard_fail = True
    if not (p.cleaned / "ui_countries.csv").exists():
        print("ERROR: ui_countries.csv was not created.")
        hard_fail = True
    if export_report["counts"]["unresolved_board_answer_names"] > 0:
        print(
            "WARN: Some board answer names could not be mapped to a country code. "
            "See cleaned/geogrid_board_unresolved_answer_names.csv"
        )

    print("\nDone.")
    return 2 if hard_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())


