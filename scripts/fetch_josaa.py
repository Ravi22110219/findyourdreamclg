#!/usr/bin/env python3
"""Fetch JoSAA opening/closing-rank archive data into local JSON/JS files.

The JoSAA archive is an ASP.NET WebForms page. This script walks the same
postback sequence as the browser dropdowns, requests all institutes/programs
for a year and round, then parses the result table without third-party
dependencies.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import http.cookiejar
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ARCHIVE_URL = (
    "https://josaa.admissions.nic.in/applicant/seatmatrix/"
    "openingclosingrankarchieve.aspx"
)

FIELD_YEAR = "ctl00$ContentPlaceHolder1$ddlYear"
FIELD_ROUND = "ctl00$ContentPlaceHolder1$ddlroundno"
FIELD_INST_TYPE = "ctl00$ContentPlaceHolder1$ddlInstype"
FIELD_INSTITUTE = "ctl00$ContentPlaceHolder1$ddlInstitute"
FIELD_BRANCH = "ctl00$ContentPlaceHolder1$ddlBranch"
FIELD_SEAT_TYPE = "ctl00$ContentPlaceHolder1$ddlSeatType"
FIELD_SUBMIT = "ctl00$ContentPlaceHolder1$btnSubmit"

OFFICIAL_NOTE = (
    "Opening/Closing Ranks for Open Seats represent CRL. Opening/Closing "
    "Ranks for EWS, OBC-NCL, SC and ST Seats represent respective Category "
    "Ranks. Opening/Closing Ranks for PwD Seats represent PwD Ranks within "
    "Respective Categories."
)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def normalize_key(value: str) -> str:
    return clean_text(value).casefold()


def hidden_value(page: str, field_name: str) -> str:
    pattern = r'name="%s"[^>]*value="([^"]*)"' % re.escape(field_name)
    match = re.search(pattern, page)
    return html.unescape(match.group(1)) if match else ""


class SelectParser(HTMLParser):
    def __init__(self, select_id: str) -> None:
        super().__init__(convert_charrefs=False)
        self.select_id = select_id
        self.in_select = False
        self.in_option = False
        self.option_value = ""
        self.option_text: list[str] = []
        self.options: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "select" and attr.get("id") == self.select_id:
            self.in_select = True
        elif self.in_select and tag == "option":
            self.in_option = True
            self.option_value = attr.get("value") or ""
            self.option_text = []

    def handle_endtag(self, tag: str) -> None:
        if self.in_select and tag == "option":
            self.options.append(
                {"value": self.option_value, "label": clean_text("".join(self.option_text))}
            )
            self.in_option = False
        elif self.in_select and tag == "select":
            self.in_select = False

    def handle_data(self, data: str) -> None:
        if self.in_option:
            self.option_text.append(data)

    def handle_entityref(self, name: str) -> None:
        if self.in_option:
            self.option_text.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self.in_option:
            self.option_text.append(f"&#{name};")


class GridParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.in_grid = False
        self.table_depth = 0
        self.in_row = False
        self.in_cell = False
        self.current_cell: list[str] = []
        self.current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "table" and "GridView1" in (attr.get("id") or ""):
            self.in_grid = True
            self.table_depth = 1
            return

        if not self.in_grid:
            return

        if tag == "table":
            self.table_depth += 1
        elif tag == "tr":
            self.in_row = True
            self.current_row = []
        elif self.in_row and tag in {"td", "th"}:
            self.in_cell = True
            self.current_cell = []

    def handle_endtag(self, tag: str) -> None:
        if not self.in_grid:
            return

        if self.in_cell and tag in {"td", "th"}:
            self.current_row.append(clean_text("".join(self.current_cell)))
            self.current_cell = []
            self.in_cell = False
        elif self.in_row and tag == "tr":
            if self.current_row:
                self.rows.append(self.current_row)
            self.current_row = []
            self.in_row = False
        elif tag == "table":
            self.table_depth -= 1
            if self.table_depth <= 0:
                self.in_grid = False

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current_cell.append(data)

    def handle_entityref(self, name: str) -> None:
        if self.in_cell:
            self.current_cell.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self.in_cell:
            self.current_cell.append(f"&#{name};")


class JosaaClient:
    def __init__(self, timeout: int = 60) -> None:
        cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(cookie_jar)
        )
        self.timeout = timeout

    def get(self) -> str:
        request = urllib.request.Request(
            ARCHIVE_URL,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        return self.opener.open(request, timeout=self.timeout).read().decode(
            "utf-8", "replace"
        )

    def post(self, page: str, values: dict[str, str]) -> str:
        fields = {
            "__VIEWSTATE": hidden_value(page, "__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": hidden_value(page, "__VIEWSTATEGENERATOR"),
            "__EVENTVALIDATION": hidden_value(page, "__EVENTVALIDATION"),
            "ctl00$hdnSecKey": "",
            FIELD_SUBMIT: "Submit",
        }
        fields.update(values)
        request = urllib.request.Request(
            ARCHIVE_URL,
            data=urllib.parse.urlencode(fields).encode(),
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0",
            },
        )
        return self.opener.open(request, timeout=self.timeout).read().decode(
            "utf-8", "replace"
        )


def parse_select_options(page: str, short_id: str) -> list[dict[str, str]]:
    parser = SelectParser(f"ctl00_ContentPlaceHolder1_{short_id}")
    parser.feed(page)
    return parser.options


def parse_grid_rows(page: str) -> list[list[str]]:
    parser = GridParser()
    parser.feed(page)
    header = [
        "Institute",
        "Academic Program Name",
        "Quota",
        "Seat Type",
        "Gender",
        "Opening Rank",
        "Closing Rank",
    ]
    return [
        row
        for row in parser.rows
        if row != header and len(row) == 7 and any(cell.strip() for cell in row)
    ]


def parse_rank(raw_value: str) -> tuple[int | None, bool]:
    value = clean_text(raw_value).replace(",", "")
    if not value:
        return None, False
    match = re.match(r"^(\d+)([A-Za-z]*)$", value)
    if not match:
        return None, value.upper().endswith("P")
    return int(match.group(1)), match.group(2).upper() == "P"


def institute_type_from_code(code: str) -> str:
    first = (code or "")[:1]
    return {
        "1": "IIT",
        "2": "NIT",
        "3": "IIIT",
        "4": "GFTI",
    }.get(first, "Other")


def build_institute_meta(options: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    meta: dict[str, dict[str, str]] = {}
    for option in options:
        code = option["value"]
        label = option["label"]
        if code in {"0", "ALL"} or not label:
            continue
        meta[normalize_key(label)] = {
            "code": code,
            "type": institute_type_from_code(code),
        }
    return meta


def fetch_archive(year: str, round_no: str) -> dict[str, Any]:
    client = JosaaClient()
    page = client.get()

    steps = [
        {FIELD_YEAR: year},
        {FIELD_YEAR: year, FIELD_ROUND: round_no},
        {FIELD_YEAR: year, FIELD_ROUND: round_no, FIELD_INST_TYPE: "ALL"},
        {
            FIELD_YEAR: year,
            FIELD_ROUND: round_no,
            FIELD_INST_TYPE: "ALL",
            FIELD_INSTITUTE: "ALL",
        },
        {
            FIELD_YEAR: year,
            FIELD_ROUND: round_no,
            FIELD_INST_TYPE: "ALL",
            FIELD_INSTITUTE: "ALL",
            FIELD_BRANCH: "ALL",
        },
        {
            FIELD_YEAR: year,
            FIELD_ROUND: round_no,
            FIELD_INST_TYPE: "ALL",
            FIELD_INSTITUTE: "ALL",
            FIELD_BRANCH: "ALL",
            FIELD_SEAT_TYPE: "ALL",
        },
    ]

    for values in steps:
        page = client.post(page, values)

    institute_options = parse_select_options(page, "ddlInstitute")
    institute_meta = build_institute_meta(institute_options)
    raw_rows = parse_grid_rows(page)

    rows: list[dict[str, Any]] = []
    for cells in raw_rows:
        institute, program, quota, seat_type, gender, opening_raw, closing_raw = cells
        opening_rank, opening_preparatory = parse_rank(opening_raw)
        closing_rank, closing_preparatory = parse_rank(closing_raw)
        meta = institute_meta.get(normalize_key(institute), {})

        rows.append(
            {
                "institute": institute,
                "instituteCode": meta.get("code", ""),
                "instituteType": meta.get("type", "Other"),
                "program": program,
                "quota": quota,
                "seatType": seat_type,
                "gender": gender,
                "openingRank": opening_rank,
                "openingRankRaw": opening_raw,
                "closingRank": closing_rank,
                "closingRankRaw": closing_raw,
                "isPreparatory": opening_preparatory or closing_preparatory,
            }
        )

    if not rows:
        raise RuntimeError("No JoSAA rows were parsed from the archive response.")

    facets = {
        "genders": sorted({row["gender"] for row in rows}),
        "instituteTypes": sorted({row["instituteType"] for row in rows}),
        "quotas": sorted({row["quota"] for row in rows}),
        "seatTypes": sorted({row["seatType"] for row in rows}),
    }

    return {
        "source": {
            "name": "JoSAA opening and closing rank archive",
            "url": ARCHIVE_URL,
            "year": year,
            "round": round_no,
            "fetchedAt": dt.datetime.now(dt.timezone.utc)
            .replace(microsecond=0)
            .isoformat(),
            "note": OFFICIAL_NOTE,
            "filters": {
                "instituteType": "ALL",
                "institute": "ALL",
                "program": "ALL",
                "seatType": "ALL",
            },
        },
        "facets": facets,
        "rows": rows,
    }


def default_json_path(year: str, round_no: str) -> Path:
    return Path("data") / f"josaa-{year}-round-{round_no}.json"


def default_js_path(year: str, round_no: str) -> Path:
    return Path("data") / f"josaa-{year}-round-{round_no}.js"


def write_payload(payload: dict[str, Any], json_path: Path, js_path: Path) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    js_path.parent.mkdir(parents=True, exist_ok=True)

    compact = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    json_path.write_text(compact + "\n", encoding="utf-8")
    js_path.write_text(
        "window.JOSAA_DATA = " + compact + ";\n",
        encoding="utf-8",
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Fetch JoSAA OR/CR archive data for a year and round."
    )
    parser.add_argument("--year", default="2025", help="JoSAA archive year")
    parser.add_argument("--round", default="6", dest="round_no", help="Round number")
    parser.add_argument("--json", type=Path, help="Output JSON path")
    parser.add_argument("--js", type=Path, help="Output browser JS path")
    args = parser.parse_args(argv)

    json_path = args.json or default_json_path(args.year, args.round_no)
    js_path = args.js or default_js_path(args.year, args.round_no)

    payload = fetch_archive(args.year, args.round_no)
    write_payload(payload, json_path, js_path)

    print(
        f"Wrote {len(payload['rows'])} rows for JoSAA {args.year} "
        f"round {args.round_no}"
    )
    print(f"JSON: {json_path}")
    print(f"JS:   {js_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
