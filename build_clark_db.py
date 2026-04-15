#!/usr/bin/env python3
"""
Universal CLARK-l database builder.

Reads genome_sources from config.yaml.  Each source is a directory of FASTA
files (.fna / .fasta / .fa / .fna.gz / .fasta.gz).  Taxid resolution uses
whichever strategy works for each file:

  1. reads_mapping strategy  — if the source specifies a reads_mapping (.tsv
     or .tsv.gz) AND the FASTA headers look like SPAdes NODE contigs.
     Parses  anonymous_read_id | genome_id | tax_id | read_id  and maps
     contig names to genome_ids, then genome_ids to taxids.

  2. NCBI organism-name strategy  — if the header contains a recognisable
     binomial name (e.g. "Escherichia coli K-12…"), query NCBI Taxonomy.

  3. NCBI accession strategy  — fallback using the accession in the header.

After resolving all taxids the script:
  • copies every FASTA into clark_db/Custom/
  • writes .custom and .custom.fileToAccssnTaxID so set_targets.sh skips the
    4.5 GB nucl_accss download
  • downloads NCBI taxdump (~55 MB) if taxonomy/ is missing
  • runs set_targets.sh inside the CLARK Docker image to produce targets.txt
"""

import gzip
import json
import re
import shutil
import subprocess
import tarfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml  # PyYAML  (pip install pyyaml)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DB_DIR     = Path("clark_db")
CUSTOM_DIR = DB_DIR / "Custom"
TAX_DIR    = DB_DIR / "taxonomy"

_STRAIN_TOKENS = {
    "str.", "strain", "substr.", "subsp.", "serovar", "bv.", "pv.",
    "RS", "ATCC", "DSM", "NCTC", "NCIMB", "CCUG", "JCM",
    "genomic", "scaffold", "contig", "plasmid", "chromosome",
    "complete", "whole", "isolate", "clone",
}

FASTA_SUFFIXES = {".fna", ".fasta", ".fa", ".fsa"}


# ---------------------------------------------------------------------------
# Helpers: FASTA
# ---------------------------------------------------------------------------

def _open(path: Path):
    """Open a plain or gzip-compressed file for text reading."""
    if path.suffix == ".gz":
        return gzip.open(path, "rt")
    return open(path)


def _fasta_headers(path: Path):
    """Yield every header line (without '>') from a FASTA file."""
    with _open(path) as fh:
        for line in fh:
            if line.startswith(">"):
                yield line[1:].strip()


def _first_header(path: Path) -> str | None:
    for h in _fasta_headers(path):
        return h
    return None


def _is_node_header(header: str) -> bool:
    """True if this looks like a SPAdes assembly contig header."""
    return header.startswith("NODE_")


def _parse_accession(header: str) -> str | None:
    """Extract the leading accession token from a FASTA header."""
    return header.split()[0] if header else None


def _trim_to_species(description: str) -> str:
    """Return genus + species from a free-text description."""
    words = description.split()
    kept = []
    for i, word in enumerate(words):
        clean = word.rstrip(".,;")
        if i == 0:
            kept.append(clean)
            continue
        if (
            clean in _STRAIN_TOKENS
            or (clean.upper() == clean and len(clean) > 1)
            or any(ch.isdigit() for ch in clean)
        ):
            break
        kept.append(clean)
        if clean.lower() == "virus":
            break
    return " ".join(kept)


def _extract_organism(header: str) -> str | None:
    """Pull out a binomial organism name from a FASTA header description."""
    m = re.match(
        r"(\S+)\s+(.+?)(?:,| complete| whole| genomic scaffold"
        r"| genome| chromosome| str\.| strain| substr\.| isolate)",
        header,
    )
    if m:
        desc = m.group(2).strip()
    else:
        parts = header.split(None, 1)
        desc = parts[1].strip() if len(parts) > 1 else ""

    if not desc:
        return None
    trimmed = _trim_to_species(desc)
    # Reject if it looks like a contig ID rather than an organism name
    if not trimmed or trimmed.startswith("NODE_") or re.search(r"\d", trimmed):
        return None
    return trimmed


# ---------------------------------------------------------------------------
# Taxid resolution — reads_mapping strategy
# ---------------------------------------------------------------------------

def _load_reads_mapping(mapping_path: Path) -> tuple[dict, dict]:
    """
    Parse a reads_mapping .tsv or .tsv.gz.

    Columns (tab-separated, first line is a comment header):
      #anonymous_read_id  genome_id  tax_id  read_id

    read_id examples:
      NODE_53_length_21423_cov_84.979292-1386/1   <- SPAdes contig + position
      CP009288.1-10831/1                          <- NCBI accession + position

    Returns:
      genome_taxid : { genome_id  -> taxid }
      contig_genome: { contig_name -> genome_id }   (NODE-based reads only)
    """
    print(f"   📖 Parsing reads mapping: {mapping_path.name} …")
    genome_taxid:  dict[str, str] = {}
    contig_genome: dict[str, str] = {}

    with _open(mapping_path) as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            genome_id = parts[1]
            tax_id    = parts[2]
            read_id   = parts[3]

            if genome_id not in genome_taxid:
                genome_taxid[genome_id] = tax_id

            if read_id.startswith("NODE_"):
                # contig name = read_id up to the last "-<position>" suffix
                contig = read_id.rsplit("-", 1)[0]
                if contig not in contig_genome:
                    contig_genome[contig] = genome_id

    print(f"      ✅ {len(genome_taxid):,} genome IDs, {len(contig_genome):,} contig names")
    return genome_taxid, contig_genome


def _taxid_from_mapping(
    fasta_path: Path,
    genome_taxid: dict,
    contig_genome: dict,
) -> str | None:
    """
    Scan FASTA headers; return the taxid as soon as one NODE contig is found
    in contig_genome.
    """
    for header in _fasta_headers(fasta_path):
        contig = header.split()[0]
        gid = contig_genome.get(contig)
        if gid:
            return genome_taxid.get(gid)
    return None


# ---------------------------------------------------------------------------
# Taxid resolution — NCBI strategies
# ---------------------------------------------------------------------------

def _ncbi_esearch(term: str, db: str = "taxonomy") -> list[str]:
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        f"?db={db}&term={urllib.parse.quote(term)}&retmode=json"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read()).get("esearchresult", {}).get("idlist", [])
    except Exception as exc:
        print(f"      ⚠️  NCBI query failed: {exc}")
        return []


def _taxid_from_accession(accession: str) -> str | None:
    ids = _ncbi_esearch(f"{accession}[accn]", db="nuccore")
    if not ids:
        return None
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi"
        f"?dbfrom=nuccore&db=taxonomy&id={ids[0]}&retmode=json"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            for ls in json.loads(resp.read()).get("linksets", []):
                for lsd in ls.get("linksetdbs", []):
                    if lsd.get("dbto") == "taxonomy":
                        links = lsd.get("links", [])
                        if links:
                            return str(links[0])
    except Exception as exc:
        print(f"      ⚠️  elink failed: {exc}")
    return None


def _taxid_from_ncbi(header: str) -> str | None:
    """Try organism name, then accession, then give up."""
    organism = _extract_organism(header)
    accession = _parse_accession(header)

    if organism:
        print(f"      🔎 NCBI name lookup: {organism}")
        ids = _ncbi_esearch(organism)
        time.sleep(0.35)
        if ids:
            return ids[0]

    if accession and re.match(r"[A-Z]{1,2}_?\d", accession):
        print(f"      🔎 NCBI accession lookup: {accession}")
        time.sleep(0.35)
        taxid = _taxid_from_accession(accession)
        if taxid:
            return taxid

    return None


# ---------------------------------------------------------------------------
# Per-source processing
# ---------------------------------------------------------------------------

def process_source(source: dict) -> dict[Path, str]:
    """
    Resolve taxids for every FASTA file in one genome_source entry.

    source keys:
      path          : str  (required) directory of FASTA files
      reads_mapping : str  (optional) path to reads_mapping .tsv[.gz]

    Returns {dest_path_in_Custom -> taxid}.
    """
    src_dir  = Path(source["path"])
    map_path = Path(source["reads_mapping"]) if "reads_mapping" in source else None

    fasta_files = [
        f for f in sorted(src_dir.iterdir())
        if f.suffix in FASTA_SUFFIXES
        or (f.suffix == ".gz" and Path(f.stem).suffix in FASTA_SUFFIXES)
    ]

    print(f"\n📁 Source: {src_dir}  ({len(fasta_files):,} files)")

    # Pre-load reads mapping if provided
    genome_taxid:  dict[str, str] = {}
    contig_genome: dict[str, str] = {}
    if map_path:
        genome_taxid, contig_genome = _load_reads_mapping(map_path)

    file_taxids: dict[Path, str] = {}
    skipped: list[str] = []

    for fasta in fasta_files:
        first_hdr = _first_header(fasta)
        if not first_hdr:
            skipped.append(fasta.name)
            continue

        taxid = None

        # Strategy 1: reads_mapping (for NODE-based SPAdes contigs)
        if contig_genome and _is_node_header(first_hdr.split()[0]):
            taxid = _taxid_from_mapping(fasta, genome_taxid, contig_genome)
            if taxid:
                print(f"   [mapping] {fasta.name} → taxid {taxid}")

        # Strategy 2 & 3: NCBI (organism name then accession)
        if not taxid:
            taxid = _taxid_from_ncbi(first_hdr)
            if taxid:
                print(f"   [NCBI]    {fasta.name} → taxid {taxid}")

        if taxid:
            dest = CUSTOM_DIR / fasta.name
            if not dest.exists():
                shutil.copy2(fasta, dest)
            file_taxids[dest] = taxid
        else:
            print(f"   ❌ Could not resolve taxid for {fasta.name} — skipping")
            skipped.append(fasta.name)

    print(f"   ✅ Resolved {len(file_taxids):,}  |  skipped {len(skipped):,}")
    return file_taxids


# ---------------------------------------------------------------------------
# NCBI taxonomy download
# ---------------------------------------------------------------------------

def download_taxonomy() -> None:
    print("\n📥 Checking NCBI taxonomy data …")
    taxdump = TAX_DIR / "taxdump.tar.gz"
    if not taxdump.exists():
        print("   Fetching taxdump.tar.gz (~55 MB) …")
        urllib.request.urlretrieve(
            "https://ftp.ncbi.nih.gov/pub/taxonomy/taxdump.tar.gz", taxdump
        )
    else:
        print("   taxdump.tar.gz already present — skipping download")

    needed = {"nodes.dmp", "merged.dmp", "names.dmp"}
    with tarfile.open(taxdump, "r:gz") as tar:
        for member in tar.getmembers():
            if member.name in needed and not (TAX_DIR / member.name).exists():
                tar.extract(member, TAX_DIR)

    (DB_DIR / ".taxondata").touch()
    print("   ✅ Taxonomy data ready")


# ---------------------------------------------------------------------------
# Write CLARK metadata
# ---------------------------------------------------------------------------

def write_clark_metadata(all_file_taxids: dict[Path, str]) -> None:
    print(f"\n📝 Writing CLARK metadata ({len(all_file_taxids):,} genomes) …")

    with open(DB_DIR / ".custom", "w") as fh:
        for fasta in all_file_taxids:
            fh.write(f"/db/Custom/{fasta.name}\n")

    with open(DB_DIR / ".custom.fileToAccssnTaxID", "w") as fh:
        for fasta, taxid in all_file_taxids.items():
            fh.write(f"/db/Custom/{fasta.name}\t{fasta.stem}\t{taxid}\n")

    print("   ✅ .custom and .custom.fileToAccssnTaxID written")


# ---------------------------------------------------------------------------
# Run set_targets.sh inside Docker
# ---------------------------------------------------------------------------

def build_clark_targets(image: str) -> None:
    print("\n🔨 Running set_targets.sh inside Docker …")
    db_abs = DB_DIR.resolve().as_posix()
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{db_abs}:/db",
        "-w", "/usr/local/opt/clark",
        image,
        "sh", "-c",
        "./set_targets.sh /db custom --species",
    ]
    subprocess.run(cmd, check=True)

    targets = DB_DIR / "targets.txt"
    if targets.exists() and targets.stat().st_size > 0:
        count = len(targets.read_text().strip().splitlines())
        print(f"   ✅ targets.txt ready ({count:,} targets)")
    else:
        raise RuntimeError("set_targets.sh completed but targets.txt is missing or empty")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("🧬 CLARK-l Universal Database Builder\n")

    with open("config.yaml") as fh:
        cfg = yaml.safe_load(fh)

    image   = cfg["clark"]["image"]
    sources = cfg.get("genome_sources", [])

    if not sources:
        print("❌ No genome_sources defined in config.yaml")
        return

    CUSTOM_DIR.mkdir(parents=True, exist_ok=True)
    TAX_DIR.mkdir(exist_ok=True)

    # Process each genome source
    all_file_taxids: dict[Path, str] = {}
    for source in sources:
        file_taxids = process_source(source)
        all_file_taxids.update(file_taxids)

    if not all_file_taxids:
        print("\n❌ No genomes with resolved taxids — cannot build database.")
        return

    download_taxonomy()
    write_clark_metadata(all_file_taxids)
    build_clark_targets(image)

    print(f"\n🎉 CLARK-l database ready!")
    print(f"   Location : {DB_DIR.resolve()}")
    print(f"   Genomes  : {len(all_file_taxids):,}")
    print("\nNext step:  snakemake --cores 8")


if __name__ == "__main__":
    main()
