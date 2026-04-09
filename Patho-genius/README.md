# Patho-genius

Pathogen detection pipeline using Kraken2 for metagenomic classification of FASTQ sequencing data.

## Features

- **Custom Database Builder** - Build Kraken2 databases from custom pathogen genomes
- **Dockerized Workflow** - Snakemake pipeline with Kraken2 in Docker
- **JSON Output** - Structured pathogen detection results

## Requirements

- Windows 10/11 or Linux
- Docker Desktop
- Python 3.8+
- Snakemake

## Quick Start

### 1. Build Custom Kraken2 Database

Place your pathogen genome files (`.fna` format) in `kraken_db/` directory, then run:

```bash
python build_kraken_db.py
```

This script will:
- Download NCBI taxonomy
- Extract organism names from FASTA headers
- Fetch taxonomy IDs from NCBI
- Add genomes to Kraken2 library
- Build the database

**Note:** The database build can take 10-30 minutes depending on the number of genomes.

### 2. Run Classification Workflow

Place your FASTQ files in `fastQ_reads/` directory. Update `config.yaml` with paths and settings:

```yaml
paths:
  db_host_windows: "./kraken_db"
  data_host_windows: "./fastQ_reads"

kraken2:
  image: "staphb/kraken2:latest"
  threads: 8
  confidence: 0.0  # 0.0 = no filtering, 0.1 = stringent
```

Run the workflow:

```bash
python -m snakemake --cores 1
```

### 3. View Results

Results are saved in `results/kraken2/`:
- `<sample>.report` - Full Kraken2 classification report
- `<sample>.kraken` - Per-read classifications
- `<sample>.json` - Structured summary (species with >0.01% abundance)

## Project Structure

```
├── build_kraken_db.py    # Custom database builder
├── Snakefile             # Snakemake workflow
├── config.yaml           # Configuration
├── kraken_db/            # Kraken2 database (excluded from git)
│   ├── *.fna            # Pathogen genome files
│   ├── taxonomy/        # NCBI taxonomy
│   └── library/         # Processed sequences
├── fastQ_reads/          # Input FASTQ files (excluded from git)
└── results/              # Output files (excluded from git)
```

## Output Format

Each sample generates a JSON file with detected pathogens:

```json
{
  "sample_id": "SRR7497167_1-001",
  "processed_date": "2026-02-16 19:11:17",
  "pathogens_detected": [
    {
      "name": "Pseudomonas aeruginosa",
      "tax_id": 287,
      "abundance": 0.58,
      "reads": 3650
    },
    {
      "name": "Vibrio cholerae",
      "tax_id": 666,
      "abundance": 0.55,
      "reads": 3468
    }
  ]
}
```

## Configuration

### Adjusting Confidence Threshold

The `confidence` parameter filters classifications:
- `0.0` - No filtering (default, recommended)
- `0.1` - Stringent filtering (fewer false positives, more false negatives)
- Higher values = more conservative

### Database Contents

Current database includes 17 pathogen species:
- Escherichia coli, Vibrio cholerae, Pseudomonas aeruginosa
- Acinetobacter baumannii, Staphylococcus aureus
- Mycobacterium tuberculosis, Helicobacter pylori
- And more (see `kraken_db/*.fna` files)

## Troubleshooting

### Database Build Issues

**Problem:** "Completed processing of 0 sequences"
- **Solution:** Ensure `seqid2taxid.map` is in `kraken_db/library/` and `nucl_gb.accession2taxid` is in `kraken_db/taxonomy/`

**Problem:** "Could not extract organism name"
- **Solution:** Check FASTA headers match format: `>ACCESSION.VERSION Genus species ...`

### Classification Issues

**Problem:** 100% unclassified reads
- **Solution:** Rebuild database completely (delete `*.k2d` files and rerun `build_kraken_db.py`)
- Check that `confidence` is set to `0.0` in `config.yaml`

**Problem:** Docker permission errors
- **Solution:** Verify Docker Desktop file sharing for workspace directory

## Notes

- Database files (`kraken_db/`) and results (`results/`) are excluded from git
- Original genome files should be kept in `kraken_db/` directory
- FASTQ files can be large; store them locally in `fastQ_reads/`
