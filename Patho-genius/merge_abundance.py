#!/usr/bin/env python3
"""
merge_abundance.py — Merge multiple CLARK/CU-CLARK-L abundance CSVs
=====================================================================
Combines abundance reports from split FASTQ batch processing into a
single unified abundance CSV.  Re-computes Proportion_All(%) and
Proportion_Classified(%) from the merged read counts.

Usage:
    python merge_abundance.py part1.abundance.csv part2.abundance.csv -o merged.abundance.csv

Ported from the C++ handle_merge logic used in the batch pipeline.
"""

import csv
import sys
import argparse
from collections import OrderedDict


def parse_abundance_file(filepath):
    """Parse an abundance CSV and return (entries, has_lineage).

    Each entry is a dict:  {name, taxid, lineage, count, prop_all, prop_cls}
    """
    entries = []
    has_lineage = False

    with open(filepath, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header is None:
            return entries, has_lineage

        # Detect column layout (with or without Lineage column)
        hdr = [h.strip() for h in header]

        # Build index map for known columns
        col = {}
        for i, h in enumerate(hdr):
            col[h] = i

        has_lineage = "Lineage" in col
        idx_name = col.get("Name", 0)
        idx_taxid = col.get("TaxID", 1)
        idx_lineage = col.get("Lineage") if has_lineage else None
        idx_count = col.get("Count", 3 if has_lineage else 2)

        for row in reader:
            if not row:
                continue
            try:
                entry = {
                    "name": row[idx_name].strip(),
                    "taxid": row[idx_taxid].strip(),
                    "lineage": row[idx_lineage].strip() if idx_lineage is not None else "",
                    "count": int(row[idx_count].strip()),
                }
                entries.append(entry)
            except (ValueError, IndexError):
                continue

    return entries, has_lineage


def merge_abundance_files(input_files, output_file):
    """Merge multiple abundance CSVs, summing counts per taxid."""
    merged = OrderedDict()
    any_lineage = False

    for fpath in input_files:
        entries, has_lineage = parse_abundance_file(fpath)
        if has_lineage:
            any_lineage = True

        for e in entries:
            key = e["taxid"]
            if key in merged:
                merged[key]["count"] += e["count"]
                # Fill in name/lineage if missing
                if not merged[key]["name"] and e["name"]:
                    merged[key]["name"] = e["name"]
                if not merged[key]["lineage"] and e["lineage"]:
                    merged[key]["lineage"] = e["lineage"]
            else:
                merged[key] = dict(e)

    if not merged:
        print("No entries found in any input file.", file=sys.stderr)
        return False

    # Compute totals
    grand_total = sum(e["count"] for e in merged.values())
    unknown_count = 0
    unknown_entry = None

    for e in merged.values():
        if e["taxid"] == "NA" or e["name"] == "UNKNOWN":
            unknown_count = e["count"]
            unknown_entry = e

    classified_total = grand_total - unknown_count

    # Collect non-UNKNOWN entries, sorted by count descending
    sorted_entries = sorted(
        [e for e in merged.values() if e["name"] != "UNKNOWN" and e["taxid"] != "NA"],
        key=lambda x: -x["count"],
    )

    # Write output
    with open(output_file, "w", newline="") as f:
        writer = csv.writer(f)
        if any_lineage:
            writer.writerow(["Name", "TaxID", "Lineage", "Count",
                             "Proportion_All(%)", "Proportion_Classified(%)"])
        else:
            writer.writerow(["Name", "TaxID", "Count",
                             "Proportion_All(%)", "Proportion_Classified(%)"])

        for e in sorted_entries:
            prop_all = round(100.0 * e["count"] / grand_total, 6) if grand_total > 0 else 0
            prop_cls = round(100.0 * e["count"] / classified_total, 6) if classified_total > 0 else 0
            row = [e["name"], e["taxid"]]
            if any_lineage:
                row.append(e["lineage"])
            row.extend([e["count"], prop_all, prop_cls])
            writer.writerow(row)

        # UNKNOWN entry last
        if unknown_entry:
            prop_all = round(100.0 * unknown_count / grand_total, 6) if grand_total > 0 else 0
            row = [unknown_entry["name"], unknown_entry["taxid"]]
            if any_lineage:
                row.append(unknown_entry["lineage"])
            row.extend([unknown_count, prop_all, 0])
            writer.writerow(row)

    print(f"Merged {len(input_files)} abundance files "
          f"({grand_total} total reads) -> {output_file}")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Merge CLARK abundance CSV files from batch processing"
    )
    parser.add_argument("inputs", nargs="+", help="Input abundance CSV files")
    parser.add_argument("-o", "--output", required=True, help="Output merged CSV")
    args = parser.parse_args()

    success = merge_abundance_files(args.inputs, args.output)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
