#!/usr/bin/env python3
"""
Build a custom Kraken2 database from FASTA files with NCBI accessions.
This script:
1. Downloads NCBI taxonomy using kraken2-build
2. Extracts organism names from FASTA headers
3. Fetches taxonomy IDs for each organism
4. Adds each FASTA file to the library with proper taxid headers
5. Builds the Kraken2 database using Docker
"""

import os
import re
import subprocess
import urllib.request
import urllib.parse
import json
import tempfile
from pathlib import Path

DB_DIR = Path("kraken_db")

def download_taxonomy():
    """Download NCBI taxonomy using kraken2-build."""
    print("📥 Downloading NCBI taxonomy using Kraken2...")
    
    db_abs = DB_DIR.absolute().as_posix()
    
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{db_abs}:/db",
        "staphb/kraken2:latest",
        "kraken2-build", "--download-taxonomy", "--db", "/db"
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print("✅ Taxonomy downloaded and extracted")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Taxonomy download had issues, but continuing (may already exist)")
    
    return DB_DIR / "taxonomy"

def extract_organism_from_fasta(fasta_path):
    """Extract organism name from FASTA headers."""
    organism = None
    
    with open(fasta_path, "r") as f:
        for line in f:
            if line.startswith(">"):
                # Extract organism name from header
                # E.g., ">NC_000913.3 Escherichia coli str. K-12 substr. MG1655, complete genome"
                # Extract "Escherichia coli" or "Hepatitis A virus"
                match = re.match(r'>([A-Z_]+\d+\.\d+)\s+(.+?)(?:,| complete| genome| chromosome| str\.| strain| substr\.| isolate)', line)
                if match:
                    description = match.group(2).strip()
                    # Get genus and species (first two words, or three if ends with "virus")
                    org_match = re.match(r'^([A-Z][a-z]+(?:\s+[A-Z])?[a-z]+(?:\s+[a-z]+)?(?:\s+virus)?)', description)
                    if org_match:
                        organism = org_match.group(1)
                        break
    
    return organism

def fetch_taxid_by_organism(organism):
    """Fetch taxonomy ID for an organism name from NCBI Taxonomy."""
    if not organism:
        return None
        
    print(f"    Searching NCBI Taxonomy for: {organism}")
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=taxonomy&term={urllib.parse.quote(organism)}&retmode=json"
    
    try:
        with urllib.request.urlopen(url) as response:
            data = response.read().decode()
            result = json.loads(data)
            
            if 'esearchresult' in result and 'idlist' in result['esearchresult']:
                ids = result['esearchresult']['idlist']
                if ids:
                    return ids[0]  # Return first match
    except Exception as e:
        print(f"    ⚠️  Failed to fetch taxid for {organism}: {e}")
    
    return None

def add_library_to_kraken(fasta_file, taxid):
    """Add FASTA file to Kraken2 library using kraken2-build --add-to-library."""
    print(f"➕ Adding {fasta_file.name} to library (taxid: {taxid})...")
    
    # Create a temporary file with taxid in headers
    temp_dir = Path(tempfile.gettempdir())
    temp_fasta = temp_dir / f"temp_{fasta_file.name}"
    
    # Modify FASTA headers to include [taxid=...]
    with open(fasta_file, "r") as infile, open(temp_fasta, "w") as outfile:
        for line in infile:
            if line.startswith(">"):
                # Add taxid to header if not already there
                if "[taxid=" not in line:
                    line = line.rstrip() + f" [taxid={taxid}]\n"
            outfile.write(line)
    
    # Use kraken2-build to add this file to the library
    db_abs = DB_DIR.absolute().as_posix()
    temp_abs = temp_fasta.absolute().as_posix()
    
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{db_abs}:/db",
        "-v", f"{temp_abs}:/temp.fna",
        "staphb/kraken2:latest",
        "kraken2-build", "--add-to-library", "/temp.fna", "--db", "/db"
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"   ✅ Successfully added to library")
    except subprocess.CalledProcessError as e:
        print(f"   ❌ Failed to add to library: {e.stderr}")
    finally:
        # Clean up temp file
        if temp_fasta.exists():
            temp_fasta.unlink()

def create_seqid2taxid_map():
    """Create seqid2taxid.map file by reading all .fna files in library/added/."""
    print("\n🔍 Creating sequence ID to taxonomy ID mapping...")
    
    library_dir = DB_DIR / "library"
    added_dir = library_dir / "added"
    map_file = library_dir / "seqid2taxid.map"
    
    if not added_dir.exists():
        print("   ❌ No added library directory found!")
        return
    
    fna_files = list(added_dir.glob("*.fna"))
    if not fna_files:
        print("   ❌ No .fna files found in library/added/!")
        return
    
    print(f"   Found {len(fna_files)} library files")
    
    with open(map_file, "w") as out:
        out.write("ACCESSION\tACCESSION.VERSION\tTAXID\tGI\n")
        
        for fna_file in fna_files:
            with open(fna_file, "r") as f:
                for line in f:
                    if line.startswith(">"):
                        # Extract accession and taxid from header
                        # Format: >NC_000913.3 Escherichia coli ... [taxid=562]
                        acc_match = re.match(r'>([A-Z_]+\d+\.\d+)', line)
                        taxid_match = re.search(r'\[taxid=(\d+)\]', line)
                        
                        if acc_match and taxid_match:
                            accession_version = acc_match.group(1)
                            base_acc = accession_version.split('.')[0]
                            taxid = taxid_match.group(1)
                            out.write(f"{base_acc}\t{accession_version}\t{taxid}\t0\n")
    
    print(f"   ✅ Mapping saved to {map_file}")
    return map_file

def build_database():
    """Build the Kraken2 database."""
    print("\n🔨 Building Kraken2 database (this may take a while)...")
    db_abs = DB_DIR.absolute().as_posix()
    
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{db_abs}:/db",
        "staphb/kraken2:latest",
        "kraken2-build", "--build", "--db", "/db", "--threads", "8"
    ]
    
    subprocess.run(cmd, check=True)
    print("✅ Database built successfully!")

def main():
    print("🧬 Kraken2 Custom Database Builder\n")
    
    # 1. Download taxonomy using kraken2-build
    download_taxonomy()
    
    # 2. Find all FASTA files in the kraken_db directory (not in subdirectories)
    fasta_files = list(DB_DIR.glob("*.fna"))
    print(f"\n📁 Found {len(fasta_files)} FASTA files")
    
    if not fasta_files:
        print("❌ No .fna files found in kraken_db directory!")
        return
    
    # 3. Build a mapping of fasta_file -> taxid
    print("\n🔍 Fetching taxonomy IDs for each file...")
    file_taxids = {}
    for fasta_file in fasta_files:
        print(f"  Processing {fasta_file.name}...")
        organism = extract_organism_from_fasta(fasta_file)
        
        if not organism:
            print(f"    ⚠️  Could not extract organism name")
            continue
        
        taxid = fetch_taxid_by_organism(organism)
        if taxid:
            file_taxids[fasta_file] = taxid
            print(f"    ✅ {organism} -> taxid {taxid}")
        else:
            print(f"    ❌ Could not find taxid for {organism}")
    
    if not file_taxids:
        print("\n❌ No valid taxonomy IDs found! Cannot build database.")
        return
    
    # 4. Add each file to the Kraken2 library using kraken2-build
    print("\n📚 Adding genomes to Kraken2 library...")
    for fasta_file, taxid in file_taxids.items():
        add_library_to_kraken(fasta_file, taxid)
    
    # 5. Build the database
    build_database()
    
    print("\n🎉 All done! Your custom Kraken2 database is ready.")
    print(f"   Database location: {DB_DIR.absolute()}")
    print(f"   Added {len(file_taxids)} genomes to the database")

if __name__ == "__main__":
    main()
