# Pathogenius

A desktop application for real-time pathogen detection from metagenomic FASTQ sequencing data. Combines an **Electron** UI with a **Snakemake/CLARK-l** classification backend, supporting both local Docker-based classification and GPU-accelerated edge computing on a Jetson Nano.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
  - [1. Build the Reference Database](#1-build-the-reference-database)
  - [2. Install Frontend Dependencies](#2-install-frontend-dependencies)
  - [3. Launch the Application](#3-launch-the-application)
- [Classification Pipeline (Snakefile)](#classification-pipeline-snakefile)
  - [Pipeline Steps](#pipeline-steps)
  - [CPU Mode (Docker)](#cpu-mode-docker)
  - [GPU Mode (Jetson Nano)](#gpu-mode-jetson-nano)
  - [Running the Pipeline Standalone](#running-the-pipeline-standalone)
- [Database Builder (build_clark_db.py)](#database-builder-build_clark_dbpy)
  - [Genome Sources](#genome-sources)
  - [Taxid Resolution Strategies](#taxid-resolution-strategies)
- [Configuration (config.yaml)](#configuration-configyaml)
- [Frontend Architecture](#frontend-architecture)
  - [Main Process (main.js)](#main-process-mainjs)
  - [Preload Bridge (preload.js)](#preload-bridge-preloadjs)
  - [Analysis Service](#analysis-service)
  - [Mock Mode](#mock-mode)
- [Environment Variables](#environment-variables)
- [Output Format](#output-format)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Dual Classification Engines** — CPU (CLARK-l via Docker) or GPU (CU-CLARK-L on Jetson Nano via SSH)
- **Universal Database Builder** — accepts any FASTA input (`.fna`, `.fasta`, `.fa`, `.fsa`, `.gz`), resolves taxids via reads-mapping or NCBI lookup
- **Electron Desktop UI** — file picker, real-time progress tracking, result visualization, analysis history
- **Snakemake Pipeline** — reproducible 3-step workflow: classify → abundance → JSON
- **Authentication & Encryption** — user login/registration, optional data encryption at rest

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) — ships with npm |
| **Python** | 3.8+ | Needed for Snakemake and `build_clark_db.py` |
| **Snakemake** | 7+ | `pip install snakemake` |
| **Docker Desktop** | latest | Required for CPU-mode classification |
| **PyYAML** | any | `pip install pyyaml` (used by `build_clark_db.py`) |

> **GPU mode only:** A Jetson Nano reachable via [Tailscale](https://tailscale.com/) SSH with CU-CLARK-L installed. Configure connection in `config.yaml → jetson_nano`.

---

## Project Structure

```
Patho-genius/                       # Repository root
│
├── README.md                       # ← You are here
│
├── Patho-genius/                   # Backend — Snakemake pipeline + database builder
│   ├── Snakefile                   # 3-rule dual-engine classification workflow
│   ├── config.yaml                 # All pipeline configuration (paths, engines, genome sources)
│   ├── build_clark_db.py           # Universal CLARK database builder
│   ├── clark_db/                   # Reference database (FASTA genomes, taxonomy, targets.txt)
│   │   ├── *.fna                   # Pathogen genome files
│   │   ├── Custom/                 # Processed genomes for CLARK
│   │   └── taxonomy/              # NCBI taxdump (nodes.dmp, names.dmp, ...)
│   ├── fastQ_reads/                # Input FASTQ files
│   └── results/clark/              # Pipeline output (CSV + JSON per sample)
│
└── frontend/                       # Electron desktop application
    ├── package.json                # App metadata, scripts, dependencies
    ├── package-lock.json           # Locked dependency versions (commit this to git)
    ├── results/                    # Analysis output copied here for the UI
    └── src/
        ├── main/                   # Electron main process (Node.js)
        │   ├── main.js             # Entry point — window creation, IPC handlers
        │   ├── preload.js          # Context bridge — exposes safe APIs to renderer
        │   └── services/
        │       ├── analysis-service.js   # Snakemake orchestration (CPU + GPU)
        │       ├── auth-service.js       # Authentication (login, register, sessions)
        │       └── encryption-service.js # Data encryption at rest
        └── renderer/               # Electron renderer (browser context)
            ├── index.html          # Main HTML shell
            ├── assets/             # Icons, images, fonts
            ├── js/                 # Client-side JavaScript
            ├── pages/              # Page modules
            └── templates/          # Reusable HTML templates
```

---

## Quick Start

### 1. Build the Reference Database

Place pathogen genome files (`.fna`, `.fasta`, `.fa`, `.fsa`, or gzipped variants) into `Patho-genius/clark_db/`, then run:

```bash
cd Patho-genius
pip install pyyaml
python build_clark_db.py
```

This will:
1. Scan all genome sources listed in `config.yaml`
2. Resolve taxonomy IDs (via reads-mapping or NCBI lookup)
3. Copy genomes into `clark_db/Custom/`
4. Download NCBI taxdump (~55 MB)
5. Run `set_targets.sh` inside Docker to produce `targets.txt`

> **Note:** The database build requires Docker to be running and an internet connection for NCBI lookups.

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Launch the Application

```bash
npm start
```

This opens the Electron app. From the UI you can:
- Select a FASTQ file via the file picker
- Choose CPU or GPU engine
- Start analysis and monitor real-time progress
- View detected pathogens, abundance, and classification results

---

## Classification Pipeline (Snakefile)

The Snakemake pipeline in `Patho-genius/Snakefile` runs a 3-rule workflow that produces a JSON results file from raw FASTQ input.

### Pipeline Steps

```
FASTQ input
    │
    ▼
┌──────────────────────────┐
│ Rule 1: clark_lite_classify │   Classify reads → .clark.csv
│   CPU: Docker CLARK-l       │
│   GPU: SSH → CU-CLARK-L     │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Rule 2: clark_abundance_report │   Estimate species abundance → .abundance.csv
│   CPU: Docker estimate_abundance │
│   GPU: Local Python computation  │
└──────────┬───────────────────┘
           │
           ▼
┌────────────────────────┐
│ Rule 3: clark_to_json    │   Convert to UI-friendly JSON → .json
│   (always runs locally)  │
└──────────────────────────┘
```

### CPU Mode (Docker)

The default engine. Runs CLARK-l classification and abundance estimation inside a Docker container:

```yaml
# config.yaml
engine: "cpu"
clark:
  image: "quay.io/biocontainers/clark:1.2.6.1--h4ac6f70_3"
  threads: 8
  kmer_length: 27
  sampling_factor: 2
```

**Requirements:** Docker Desktop running with file sharing enabled for the workspace directory.

### GPU Mode (Jetson Nano)

Runs CU-CLARK-L on a Jetson Nano via Tailscale SSH for GPU-accelerated classification:

```yaml
# config.yaml
engine: "gpu"
jetson_nano:
  host: "100.71.242.74"          # Tailscale IP
  user: "pathogen"               # SSH username
  ssh_batch_mode: false          # false = allows password prompts
  remote_db: "/home/pathogen/cuclark_db"
  remote_workspace: "/home/pathogen/pathogenius_ws"
  cuclark_dir: "/home/pathogen/cuclark"
```

**GPU workflow:** Upload FASTQ → free GPU memory → run CU-CLARK-L → download results → cleanup → local abundance estimation.

### Running the Pipeline Standalone

You can run the Snakemake pipeline without the Electron UI:

```bash
cd Patho-genius

# CPU mode (default)
python -m snakemake --cores 8 --config sample=SRR7497167_1

# GPU mode
python -m snakemake --cores 8 --config sample=SRR7497167_1 engine=gpu
```

Input files must be placed in `fastQ_reads/{sample}.fastq`. Results are written to `results/clark/{sample}.json`.

---

## Database Builder (build_clark_db.py)

The universal database builder reads genome source directories from `config.yaml` and produces a CLARK-compatible reference database.

### Genome Sources

Configured in `config.yaml`:

```yaml
genome_sources:
  - path: "./clark_db"          # FASTA genomes with NCBI headers

  # Add SPAdes-assembled contigs with reads-mapping for taxid resolution:
  # - path: "./my_genomes/simulation/genomes"
  #   reads_mapping: "./my_reads/reads_mapping.tsv.gz"
```

Each source directory is scanned for FASTA files with any supported extension: `.fna`, `.fasta`, `.fa`, `.fsa`, and all `.gz` compressed variants.

### Taxid Resolution Strategies

For each FASTA file, the builder tries these strategies in order:

1. **Reads-mapping** — if the source provides a `reads_mapping.tsv(.gz)` and the FASTA headers look like SPAdes contigs (`NODE_*`), map contig IDs → genome IDs → taxids
2. **NCBI organism-name lookup** — extract binomial name from the header (e.g., "Escherichia coli") and query NCBI Taxonomy
3. **NCBI accession lookup** — use the accession number in the header as a fallback

After resolving taxids, the builder:
- Copies all FASTA files to `clark_db/Custom/`
- Writes `.custom` and `.custom.fileToAccssnTaxID` metadata (bypasses the 4.5 GB `nucl_accss` download)
- Downloads NCBI taxdump (~55 MB) if not already present
- Runs `set_targets.sh` inside Docker to produce `targets.txt`

---

## Configuration (config.yaml)

All pipeline settings live in `Patho-genius/config.yaml`:

| Section | Key | Description |
|---|---|---|
| `engine` | `"cpu"` or `"gpu"` | Classification engine (overridden from UI or `--config engine=...`) |
| `paths.db_host_windows` | `"./clark_db"` | Path to the CLARK reference database |
| `paths.data_host_windows` | `"./fastQ_reads"` | Path to input FASTQ files |
| `sample` | `"SRR7497167_1"` | Default sample basename |
| `clark.image` | Docker image tag | CLARK-l Docker image for CPU mode |
| `clark.threads` | `8` | Number of classification threads |
| `clark.kmer_length` | `27` | k-mer length for CLARK-l |
| `clark.sampling_factor` | `2` | Sampling factor (higher = faster, less sensitive) |
| `jetson_nano.*` | Various | Jetson Nano SSH connection details for GPU mode |
| `genome_sources` | List of `{path, reads_mapping?}` | Directories of FASTA files for database building |

---

## Frontend Architecture

### Main Process (main.js)

The Electron main process (`frontend/src/main/main.js`) creates the application window and registers IPC handlers for:

- **Authentication** — login, register, logout, password reset
- **File System** — native file/folder picker dialogs
- **Analysis** — start, pause, resume, cancel, delete analyses
- **System Stats** — CPU, RAM, disk, GPU, network info for the dashboard
- **Database Management** — database info, import, species CRUD
- **Encryption** — initialize, lock/unlock, encrypt/decrypt data
- **Cloud Sync** — upload/download results (placeholder)

### Preload Bridge (preload.js)

Securely exposes main-process APIs to the renderer via `contextBridge.exposeInMainWorld('api', ...)`. The renderer accesses functionality through namespaced objects:

```javascript
// In renderer JavaScript:
await api.analysis.start(config);      // Start analysis
await api.auth.login(user, pass);      // Login
await api.files.selectFile();          // Open file picker
await api.system.getStats();           // Get system info
```

### Analysis Service

The analysis service (`analysis-service.js`) orchestrates the full workflow:

1. Validates input files exist
2. Copies/decompresses FASTQ into `Patho-genius/fastQ_reads/`
3. Spawns Snakemake with `--config sample=... engine=cpu|gpu`
4. Parses stdout/stderr for progress updates (engine-specific patterns)
5. Emits real-time progress to the UI via IPC
6. Reads the pipeline's JSON output and merges UI metadata

### Mock Mode

For UI development without Docker or a database:

```bash
# Windows
set PATHOGENIUS_MOCK_ANALYSIS=1
cd frontend && npm start

# Linux / macOS
PATHOGENIUS_MOCK_ANALYSIS=1 npm start
```

Returns synthetic results with realistic data after a simulated delay.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SNAKEMAKE_WORKFLOW_DIR` | `<repo>/Patho-genius` | Path to the Snakemake workflow directory |
| `RESULTS_DIR` | `<repo>/frontend/results` | Where analysis output JSON is saved |
| `PATHOGENIUS_MOCK_ANALYSIS` | `0` | Set to `1` to skip real classification and return mock data |

---

## Output Format

Each analysis produces a JSON file with this structure:

```json
{
  "analysis_name": "SRR7497167_1",
  "sample_type": "clinical",
  "completed_at": "2026-04-19T22:30:00.000Z",
  "classifier": "CLARK-l",
  "summary": {
    "total_reads": 11890000,
    "classified_reads": 7560000,
    "classification_rate": 63.6,
    "species_detected": 342,
    "pathogens_detected": 4
  },
  "pathogens": [
    {
      "name": "Escherichia coli",
      "strain": "Escherichia coli",
      "tax_id": 562,
      "abundance": 45.2,
      "reads": 3420000,
      "confidence": 95,
      "risk_level": "high"
    }
  ],
  "taxonomy": {
    "bacteria": 63.6,
    "viruses": 4.8,
    "proteobacteria": 48.0,
    "firmicutes": 18.0
  }
}
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm start` fails with "electron not found" | Run `npm install` in the `frontend/` directory first |
| "Workflow directory not found" | Ensure `Patho-genius/` exists alongside `frontend/` |
| Analysis stuck at "Starting..." | Check Docker Desktop is running (CPU) or Tailscale is connected (GPU) |
| "Could not start Snakemake" | Install Python 3 and run `pip install snakemake` |
| Database build fails at NCBI lookup | Check internet connection; NCBI rate-limits requests |
| `build_clark_db.py` — "No genome_sources defined" | Add entries under `genome_sources` in `config.yaml` |
| 100% unclassified reads | Rebuild the database: delete `clark_db/Custom/` and `targets.txt`, then rerun `build_clark_db.py` |
| Docker permission errors | Enable file sharing for the workspace directory in Docker Desktop settings |
| GPU mode — "Cannot reach Jetson Nano" | Verify Tailscale VPN is up; if using password auth, set `ssh_batch_mode: false` in `config.yaml` |
| Blank Electron window | Uncomment `mainWindow.webContents.openDevTools()` in `main.js` line 42 to debug |
