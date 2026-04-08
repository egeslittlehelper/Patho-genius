#!/usr/bin/env python3
"""
Build a custom CLARK-l database from FASTA files with NCBI accessions.

Workflow:
  1. Find all .fna files in clark_db/ and copy them to clark_db/Custom/
  2. Extract organism names + accessions from FASTA headers
  3. Fetch NCBI taxids (organism name first, accession fallback)
  4. Download only taxdump.tar.gz (~55 MB) — skips the 4.5 GB nucl_accss files
  5. Pre-create .custom.fileToAccssnTaxID so set_targets.sh skips the nucl_accss lookup
  6. Run set_targets.sh inside Docker to produce a proper targets.txt
"""

import json
import re
import shutil
import subprocess
import tarfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

DB_DIR = Path("clark_db")
CUSTOM_DIR = DB_DIR / "Custom"
TAX_DIR = DB_DIR / "taxonomy"
IMAGE = "quay.io/biocontainers/clark:1.2.6.1--h4ac6f70_3"
CLARK_DIR = "/usr/local/opt/clark"

# Words that signal the end of a species name in a FASTA description
_STRAIN_TOKENS = {
    "str.", "strain", "substr.", "subsp.", "serovar", "bv.", "pv.",
    "RS", "ATCC", "DSM", "NCTC", "NCIMB", "CCUG", "JCM",
    "genomic", "scaffold", "contig", "plasmid", "chromosome",
    "complete", "whole", "isolate", "clone",
}


# ---------------------------------------------------------------------------
# File system helpers
# ---------------------------------------------------------------------------

def ensure_directories():
    print("📁 Ensuring directory structure...")
    DB_DIR.mkdir(exist_ok=True)
    CUSTOM_DIR.mkdir(exist_ok=True)
    TAX_DIR.mkdir(exist_ok=True)
    print("   ✅ Directories ready")


def copy_fasta_to_custom(fasta_file: Path) -> Path:
    dest = CUSTOM_DIR / fasta_file.name
    if not dest.exists():
        shutil.copy2(fasta_file, dest)
    return dest


# ---------------------------------------------------------------------------
# FASTA parsing
# ---------------------------------------------------------------------------

def _parse_fasta_header(fasta_path: Path):
    """Return (accession, raw_description) from the first header line."""
    with open(fasta_path) as f:
        for line in f:
            if line.startswith(">"):
                m = re.match(
                    r'>(\S+)\s+(.+?)(?:,| complete| whole| genomic scaffold'
                    r'| genome| chromosome| str\.| strain| substr\.| isolate)',
                    line,
                )
                if m:
                    return m.group(1), m.group(2).strip()
                # fallback: no terminator found — take everything after accession
                parts = line[1:].split(None, 1)
                accession = parts[0]
                description = parts[1].strip() if len(parts) > 1 else ""
                return accession, description
    return None, None


def _trim_to_species(description: str) -> str:
    """
    Return the organism name (genus + species, optionally + 'virus').

    Stops as soon as a token looks like a strain/isolate identifier:
    all-uppercase abbreviations, tokens containing digits, or known keywords.
    """
    words = description.split()
    kept = []
    for i, word in enumerate(words):
        clean = word.rstrip(".,;")
        if i == 0:
            kept.append(clean)
            continue
        # Stop at strain-like tokens
        if (
            clean in _STRAIN_TOKENS
            or clean.upper() == clean and len(clean) > 1  # all-caps abbreviation
            or any(ch.isdigit() for ch in clean)          # contains a digit
        ):
            break
        kept.append(clean)
        # "Genus species virus" → stop after "virus"
        if clean.lower() == "virus":
            break
    return " ".join(kept)


def extract_organism_from_fasta(fasta_path: Path) -> str | None:
    _, description = _parse_fasta_header(fasta_path)
    if not description:
        return None
    return _trim_to_species(description) or None


def extract_accession_from_fasta(fasta_path: Path) -> str | None:
    accession, _ = _parse_fasta_header(fasta_path)
    return accession


# ---------------------------------------------------------------------------
# NCBI taxonomy lookups
# ---------------------------------------------------------------------------

def _ncbi_esearch(term: str, db: str = "taxonomy") -> list[str]:
    """Return a list of NCBI IDs for the given search term."""
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        f"?db={db}&term={urllib.parse.quote(term)}&retmode=json"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get("esearchresult", {}).get("idlist", [])
    except Exception as exc:
        print(f"    ⚠️  NCBI query failed: {exc}")
        return []


def _taxid_from_accession(accession: str) -> str | None:
    """Look up a taxid using the nucleotide accession number."""
    ids = _ncbi_esearch(f"{accession}[accn]", db="nuccore")
    if not ids:
        return None
    # Fetch the taxid via elink
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi"
        f"?dbfrom=nuccore&db=taxonomy&id={ids[0]}&retmode=json"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
            linksets = data.get("linksets", [])
            for ls in linksets:
                for lsd in ls.get("linksetdbs", []):
                    if lsd.get("dbto") == "taxonomy":
                        ids2 = lsd.get("links", [])
                        if ids2:
                            return str(ids2[0])
    except Exception as exc:
        print(f"    ⚠️  elink failed: {exc}")
    return None


def fetch_taxid(organism: str, accession: str | None) -> str | None:
    """Try organism-name search first, then fall back to accession lookup."""
    print(f"    Searching NCBI Taxonomy for: {organism}")
    ids = _ncbi_esearch(organism)
    if ids:
        return ids[0]

    if accession:
        print(f"    ⚠️  Name lookup failed; trying accession {accession}...")
        time.sleep(0.4)  # be polite to NCBI
        taxid = _taxid_from_accession(accession)
        if taxid:
            return taxid

    return None


# ---------------------------------------------------------------------------
# Taxonomy download (only taxdump, ~55 MB)
# ---------------------------------------------------------------------------

def download_taxonomy():
    """Download NCBI taxdump.tar.gz and extract nodes/merged/names.dmp."""
    print("\n📥 Downloading NCBI taxonomy data (taxdump only, ~55 MB)...")

    taxdump = TAX_DIR / "taxdump.tar.gz"
    if not taxdump.exists():
        url = "https://ftp.ncbi.nih.gov/pub/taxonomy/taxdump.tar.gz"
        print("   Fetching taxdump.tar.gz ...")
        urllib.request.urlretrieve(url, taxdump)
    else:
        print("   taxdump.tar.gz already present — skipping download")

    print("   Extracting nodes.dmp / merged.dmp / names.dmp ...")
    needed = {"nodes.dmp", "merged.dmp", "names.dmp"}
    with tarfile.open(taxdump, "r:gz") as tar:
        for member in tar.getmembers():
            if member.name in needed and not (TAX_DIR / member.name).exists():
                tar.extract(member, TAX_DIR)

    # Create the .taxondata flag so CLARK skips its own download attempt
    flag = DB_DIR / ".taxondata"
    flag.touch()
    print("   ✅ Taxonomy data ready")


# ---------------------------------------------------------------------------
# CLARK metadata files
# ---------------------------------------------------------------------------

def create_custom_metadata(file_taxids: dict) -> None:
    """
    Pre-create .custom and .custom.fileToAccssnTaxID so that set_targets.sh
    skips the expensive nucl_accss (4.5 GB) download/lookup step.
    """
    print("\n📝 Creating CLARK metadata files...")

    # .custom  — list of container-side paths to every .fna in Custom/
    custom_list = DB_DIR / ".custom"
    with open(custom_list, "w") as f:
        for fasta in file_taxids:
            f.write(f"/db/Custom/{fasta.name}\n")

    # .custom.fileToAccssnTaxID  — filepath \t accession \t taxid
    accssn_file = DB_DIR / ".custom.fileToAccssnTaxID"
    with open(accssn_file, "w") as f:
        for fasta, taxid in file_taxids.items():
            accession = extract_accession_from_fasta(fasta) or "NA"
            f.write(f"/db/Custom/{fasta.name}\t{accession}\t{taxid}\n")

    print(f"   ✅ .custom ({len(file_taxids)} entries)")
    print(f"   ✅ .custom.fileToAccssnTaxID")


# ---------------------------------------------------------------------------
# Run set_targets.sh inside Docker
# ---------------------------------------------------------------------------

def build_clark_targets() -> None:
    """
    Run set_targets.sh to produce targets.txt (and .settings inside the
    container — we don't need .settings because the Snakefile calls
    CLARK-l directly with -T).
    """
    print("\n🔨 Running set_targets.sh to build targets.txt...")

    db_abs = DB_DIR.resolve().as_posix()

    cmd = [
        "docker", "run", "--rm",
        "-v", f"{db_abs}:/db",
        "-w", CLARK_DIR,
        IMAGE,
        "sh", "-c",
        "./set_targets.sh /db custom --species",
    ]

    subprocess.run(cmd, check=True)
    targets = DB_DIR / "targets.txt"
    if targets.exists() and targets.stat().st_size > 0:
        lines = targets.read_text().strip().splitlines()
        print(f"   ✅ targets.txt created ({len(lines)} targets)")
    else:
        raise RuntimeError("set_targets.sh finished but targets.txt is missing or empty!")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("🧬 CLARK-l Custom Database Builder\n")

    ensure_directories()

    fasta_files = list(DB_DIR.glob("*.fna"))
    print(f"\n📁 Found {len(fasta_files)} FASTA files")
    if not fasta_files:
        print("❌ No .fna files found in clark_db/")
        return

    # Collect taxids
    print("\n🔍 Fetching taxonomy IDs for each file...")
    file_taxids: dict[Path, str] = {}
    for fasta in fasta_files:
        print(f"  Processing {fasta.name}...")
        organism = extract_organism_from_fasta(fasta)
        if not organism:
            print("    ⚠️  Could not extract organism name — skipping")
            continue

        accession = extract_accession_from_fasta(fasta)
        taxid = fetch_taxid(organism, accession)
        time.sleep(0.34)  # stay within NCBI rate limit (3 req/s without API key)

        if taxid:
            custom_fasta = copy_fasta_to_custom(fasta)
            file_taxids[custom_fasta] = taxid
            print(f"    ✅ {organism} → taxid {taxid}")
        else:
            print(f"    ❌ Could not find taxid for {organism} — skipping")

    if not file_taxids:
        print("\n❌ No valid taxonomy IDs found — cannot build database.")
        return

    # Download minimal taxonomy data (taxdump.tar.gz only, ~55 MB)
    download_taxonomy()

    # Pre-create CLARK metadata to bypass the 4.5 GB nucl_accss download
    create_custom_metadata(file_taxids)

    # Run set_targets.sh to produce targets.txt
    build_clark_targets()

    print("\n🎉 CLARK-l database ready!")
    print(f"   Location : {DB_DIR.resolve()}")
    print(f"   Genomes  : {len(file_taxids)}")
    print()
    print("Next step: run  snakemake --cores 1  to classify your sample.")


if __name__ == "__main__":
    main()
