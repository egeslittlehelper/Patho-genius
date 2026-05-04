# Pathogenius

A desktop application for real-time pathogen detection from metagenomic FASTQ sequencing data. Combines an **Electron** UI with a **Snakemake/CLARK-l** classification backend, supporting both local Docker-based classification and GPU-accelerated edge computing on a Jetson Nano. Features AI-powered clinical summaries via a local MedGemma LLM, interactive data visualizations, Firebase cloud sync with end-to-end encryption, and a modern dark-themed interface.

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
  - [GPU Pipeline Details](#gpu-pipeline-details)
  - [Running the Pipeline Standalone](#running-the-pipeline-standalone)
- [Database Builder (build_clark_db.py)](#database-builder-build_clark_dbpy)
  - [Genome Sources](#genome-sources)
  - [Taxid Resolution Strategies](#taxid-resolution-strategies)
- [Configuration (config.yaml)](#configuration-configyaml)
- [Frontend Architecture](#frontend-architecture)
  - [Main Process (main.js)](#main-process-mainjs)
  - [Preload Bridge (preload.js)](#preload-bridge-preloadjs)
  - [Services](#services)
  - [Renderer & UI Pages](#renderer--ui-pages)
  - [Visualization Suite](#visualization-suite)
  - [Mock Mode](#mock-mode)
- [Environment Variables](#environment-variables)
- [Output Format](#output-format)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Dual Classification Engines** — CPU (CLARK-l via Docker) or GPU (CU-CLARK-L on Jetson Nano via Tailscale SSH)
- **Universal Database Builder** — accepts any FASTA input (`.fna`, `.fasta`, `.fa`, `.fsa`, `.gz`), resolves taxids via reads-mapping or NCBI lookup
- **AI-Powered Clinical Summaries** — local MedGemma 4B model (GGUF) runs fully offline via `node-llama-cpp` to generate clinical interpretation of results
- **Interactive Visualizations** — SVG-based Sunburst, Sankey, Treemap, and Radar charts with tooltips, all driven by real classification data
- **Firebase Cloud Sync** — encrypted upload/download of results via Firebase Storage + Firestore metadata; AES-256-GCM encryption at rest
- **Firebase Authentication** — user registration, login, password reset, and guest mode via Firebase Auth REST API
- **Electron Desktop UI** — file picker, real-time progress tracking, result visualization, analysis history, settings management
- **Snakemake Pipeline** — reproducible 3-step workflow: classify → abundance → JSON
- **Batch Processing** — automatic FASTQ splitting for large files with sequential part-by-part classification
- **Data Encryption** — AES-256-GCM encryption for results at rest, managed via OS keychain (`keytar`)
- **System Dashboard** — real-time CPU, RAM, disk, and GPU monitoring via `systeminformation`
- **User Manual** — comprehensive LaTeX user guide with screenshots (`user_guide/`)

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 22+ | [nodejs.org](https://nodejs.org/) — ships with npm |
| **Python** | 3.8+ | Needed for Snakemake and `build_clark_db.py` |
| **Snakemake** | 7+ | `pip install snakemake` |
| **Docker Desktop** | latest | Required for CPU-mode classification |
| **PyYAML** | any | `pip install pyyaml` (used by `build_clark_db.py`) |

> **GPU mode only:** A Jetson Nano reachable via [Tailscale](https://tailscale.com/) SSH with CU-CLARK-L installed. Configure connection in `config.yaml → jetson_nano`.

> **AI Summaries (optional):** Place a GGUF model file (e.g., `google_medgemma-4b-it-Q4_K_L.gguf`) in `frontend/models/`. The app auto-discovers any single `.gguf` file in that directory.

---

## Project Structure

```
Pathogenius/                            # Repository root
│
├── README.md                           # ← You are here
├── .firebaserc                         # Firebase project alias
├── firebase.json                       # Firebase hosting / functions config
│
├── Patho-genius/                       # Backend — Snakemake pipeline + database builder
│   ├── Snakefile                       # 4-rule dual-engine classification workflow
│   ├── config.yaml                     # All pipeline configuration (paths, engines, genome sources)
│   ├── build_clark_db.py               # Universal CLARK database builder
│   ├── merge_abundance.py              # Utility for merging abundance CSV outputs
│   ├── setup_sudoers.sh                # Jetson Nano sudoers setup for passwordless drop_caches
│   ├── clark_db/                       # Reference database (FASTA genomes, taxonomy, targets.txt)
│   │   ├── *.fna                       # Pathogen genome files
│   │   ├── Custom/                     # Processed genomes for CLARK
│   │   └── taxonomy/                   # NCBI taxdump (nodes.dmp, names.dmp, ...)
│   ├── fastQ_reads/                    # Input FASTQ files
│   └── results/clark/                  # Pipeline output (CSV + JSON per sample)
│
├── functions/                          # Firebase Cloud Functions
│   ├── index.js                        # deleteSelf, deleteUser Cloud Function handlers
│   └── package.json                    # Cloud Functions dependencies
│
├── user_guide/                         # LaTeX user manual
│   ├── pathogenius_user_guide.tex      # Source document
│   ├── pathogenius_user_guide.pdf      # Compiled PDF
│   └── figures/                        # Screenshots and diagrams
│
└── frontend/                           # Electron desktop application
    ├── package.json                    # App metadata, scripts, dependencies
    ├── db-settings.json                # Persistent database configuration state
    ├── models/                         # GGUF model files for local AI (e.g., MedGemma)
    ├── results/                        # Analysis output copied here for the UI
    └── src/
        ├── main/                       # Electron main process (Node.js)
        │   ├── main.js                 # Entry point — window creation, IPC handlers
        │   ├── preload.js              # Context bridge — exposes safe APIs to renderer
        │   └── services/
        │       ├── analysis-service.js       # Snakemake orchestration (CPU + GPU)
        │       ├── firebase-auth-service.js  # Firebase Auth REST API (login, register, tokens, self-delete)
        │       ├── firebase-config.js        # Firebase project configuration
        │       ├── cloud-service.js          # Firebase Storage upload/download + Firestore metadata
        │       ├── encryption-service.js     # AES-256-GCM encryption at rest (via keytar)
        │       ├── llm-service.js            # Local LLM via node-llama-cpp (MedGemma)
        │       ├── db-settings.js            # Database info and management
        │       └── local-storage-service.js  # Persistent local storage for analysis history
        └── renderer/                   # Electron renderer (browser context)
            ├── index.html              # Main HTML shell
            ├── assets/
            │   ├── css/                # Modular CSS (variables, base, components, charts, layout)
            │   │   ├── variables.css   # CSS custom properties (colors, spacing, fonts)
            │   │   ├── base.css        # Reset and body defaults
            │   │   ├── components.css  # Reusable UI components (buttons, cards, inputs)
            │   │   ├── charts.css      # Chart container and SVG styling
            │   │   ├── layout.css      # Page layout, sidebar, grid
            │   │   ├── modals.css      # Modal dialog styles
            │   │   └── pages/          # Page-specific stylesheets
            │   └── fonts/              # Local font files (Inter)
            ├── js/                     # Client-side JavaScript
            │   ├── app.js              # Global navigation, tab switching, theme management
            │   ├── charts.js           # SVG chart renderers + data transformers
            │   ├── template-loader.js  # Dynamic HTML template loading
            │   └── utils.js            # Shared utilities (formatting, debounce, etc.)
            ├── pages/                  # Page controller modules
            │   ├── dashboard.js        # System stats, recent activity
            │   ├── database.js         # Database management UI
            │   ├── login.js            # Login page controller
            │   ├── register.js         # Registration page controller
            │   ├── newanalysis.js      # New analysis wizard (file picker, engine select)
            │   ├── results.js          # Results viewer (pathogen cards, charts, AI summary)
            │   ├── settings.js         # Application settings controller
            │   └── terminal.js         # Live process log viewer
            └── templates/              # Reusable HTML templates
                ├── analysis.html       # New analysis form
                ├── dashboard.html      # Dashboard layout
                ├── database.html       # Database management
                ├── login.html          # Login form
                ├── register.html       # Registration form
                ├── results.html        # Results detail view with chart containers
                ├── settings.html       # Settings panel
                ├── sidebar.html        # Navigation sidebar
                ├── terminal.html       # Terminal log view
                └── modals.html         # Modal dialogs
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
5. Generate `targets.txt` directly from the resolved file-to-taxid mappings

> **Note:** The database build requires an internet connection for NCBI lookups. Docker is **not** required for database building (only for CPU-mode classification).

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

This installs Electron, Firebase SDK, `node-llama-cpp`, `keytar`, `systeminformation`, and other dependencies.

### 3. Launch the Application

```bash
cd frontend
npm start
```

This opens the Electron app. From the UI you can:
- Select a FASTQ file via the file picker
- Choose CPU or GPU engine
- Start analysis and monitor real-time progress
- View detected pathogens with interactive charts (Sunburst, Sankey, Treemap, Radar)
- Generate AI-powered clinical summaries using the local MedGemma model
- Upload/download encrypted results to/from Firebase cloud storage
- Manage database, view system stats, and configure settings

---

## Classification Pipeline (Snakefile)

The Snakemake pipeline in `Patho-genius/Snakefile` runs a 4-rule workflow (3 processing rules + 1 target rule) that produces a JSON results file from raw FASTQ input.

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
│        (NCBI taxonomy download)  │
└──────────┬───────────────────┘
           │
           ▼
┌────────────────────────┐
│ Rule 3: clark_to_json    │   Convert to UI-friendly JSON → .json
│   Risk scoring + confidence │
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
  ssh_batch_mode: true           # true = SSH key auth, false = allows password prompts
  remote_db: "/home/pathogen/cuclark_db"
  remote_workspace: "/home/pathogen/pathogenius_ws"
  cuclark_dir: "/home/pathogen/cuclark"
```

### GPU Pipeline Details

The GPU workflow performs the following steps via SSH:

1. **Connectivity check** — SSH pre-check with clear error message if unreachable
2. **FASTQ upload** — `scp` to Jetson Nano (skipped if file already exists remotely)
3. **GPU memory cleanup** — drops page caches to free unified memory
4. **Stale result removal** — deletes previous `.clark.csv` and logs to prevent false completion detection
5. **CU-CLARK-L launch** — runs in background via `setsid` (fully detaches from SSH session) with `-b 128` batch size to avoid CUDA watchdog timeouts
6. **Polling loop** — checks every 30s: process still running → RUNNING; process exited + file exists → DONE; process exited + no file → FAILED. Uses `pgrep -f '[c]uCLARK-l'` (bracket trick to avoid self-matching)
7. **CSV validation** — verifies the downloaded CSV has more than just a header row (catches watchdog timeout crashes)
8. **Result download** — `scp` the classification CSV back to the local machine
9. **Remote cleanup** — removes intermediate files (keeps FASTQ for next run)
10. **Local abundance estimation** — parses NCBI taxonomy (cached after first download), counts reads per taxid, computes abundance percentages

### Running the Pipeline Standalone

You can run the Snakemake pipeline without the Electron UI:

```bash
cd Patho-genius

# CPU mode (default)
python -m snakemake --cores 8 --config sample=SRR7497167_1

# GPU mode
python -m snakemake --cores 8 --config sample=SRR7497167_1 engine=gpu

# Force re-run (ignore cached results)
python -m snakemake --cores 8 --rerun-incomplete --config sample=SRR7497167_1 engine=gpu
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
- Generates `targets.txt` directly from the file-to-taxid mappings (no Docker required)

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
| `jetson_nano.host` | IP address | Jetson Nano Tailscale IP |
| `jetson_nano.user` | Username | SSH username on the Jetson |
| `jetson_nano.ssh_batch_mode` | `true`/`false` | `true` for key auth, `false` for password auth |
| `jetson_nano.remote_db` | Path | CLARK database path on the Jetson |
| `jetson_nano.remote_workspace` | Path | Working directory on the Jetson for FASTQ and results |
| `jetson_nano.cuclark_dir` | Path | CU-CLARK-L installation directory on the Jetson |
| `genome_sources` | List of `{path, reads_mapping?}` | Directories of FASTA files for database building |

---

## Frontend Architecture

### Main Process (main.js)

The Electron main process (`frontend/src/main/main.js`) creates the application window and registers IPC handlers for:

- **Authentication** — Firebase login, register, logout, password reset, guest mode
- **File System** — native file/folder picker dialogs
- **Analysis** — start, cancel, delete analyses
- **System Stats** — CPU, RAM, disk, GPU, network info for the dashboard
- **Database Management** — database info, import, species CRUD
- **Encryption** — initialize, lock/unlock, encrypt/decrypt data
- **Cloud Sync** — upload/download encrypted results to/from Firebase
- **LLM** — generate AI clinical summaries via local MedGemma model

### Preload Bridge (preload.js)

Securely exposes main-process APIs to the renderer via `contextBridge.exposeInMainWorld('api', ...)`. The renderer accesses functionality through namespaced objects:

```javascript
// In renderer JavaScript:
await api.analysis.start(config);           // Start analysis
await api.auth.login(user, pass);           // Firebase login
await api.files.selectFile();               // Open file picker
await api.system.getStats();                // Get system info
await api.cloud.uploadResult(analysisId);   // Upload to Firebase
await api.llm.generateSummary(resultData);  // Generate AI clinical summary
```

### Services

| Service | File | Purpose |
|---|---|---|
| **Analysis** | `analysis-service.js` | Snakemake orchestration — validates inputs, copies FASTQ, spawns Snakemake, parses progress, reads results. Includes pre-run stale file cleanup and database validation. |
| **Firebase Auth** | `firebase-auth-service.js` | Firebase Authentication via REST API — sign-up, sign-in, token refresh, password reset. No Firebase SDK dependency in main process. |
| **Cloud Sync** | `cloud-service.js` | Firebase Storage for encrypted result upload/download. Firestore for analysis metadata (sample name, status, timestamps). |
| **Encryption** | `encryption-service.js` | AES-256-GCM encryption/decryption. Master key stored in OS keychain via `keytar`. |
| **LLM** | `llm-service.js` | Local LLM inference via `node-llama-cpp`. Auto-loads GGUF model from `frontend/models/`. Configurable context size, temperature, and max tokens. |
| **DB Settings** | `db-settings.js` | CLARK database introspection — reads `targets.txt`, lists species, provides database statistics. |
| **Local Storage** | `local-storage-service.js` | Persistent JSON storage for analysis history and app state. |

### Renderer & UI Pages

| Page | Controller | Description |
|---|---|---|
| **Login** | `login.js` | Firebase authentication + guest mode |
| **Register** | `register.js` | New user registration with password strength validation |
| **Dashboard** | `dashboard.js` | System stats (CPU, RAM, GPU), recent analyses, quick actions |
| **New Analysis** | `newanalysis.js` | FASTQ file picker, engine selection (CPU/GPU), analysis configuration |
| **Results** | `results.js` | Analysis history, detail view with pathogen cards, chart rendering, AI summary generation, cloud sync, result export |
| **Database** | `database.js` | Database info, species list, import/export |
| **Settings** | `settings.js` | Theme, confidence thresholds, AI model config, encryption, cloud settings, account management (password change, self-delete) |
| **Terminal** | `terminal.js` | Live process log viewer — streams stdout/stderr from the analysis pipeline |

### Visualization Suite

The `charts.js` module renders four interactive SVG chart types, each with real data transformation from the pipeline's JSON output:

| Chart | Container | Description |
|---|---|---|
| **Treemap** | `abundance-treemap-chart` | Proportional area chart of pathogen abundance. Color-coded by risk level with hover tooltips. |
| **Sunburst** | `sunburst-chart` | Hierarchical taxonomy view (domain → phylum → class → species). Interactive ring segments with drill-down. |
| **Sankey** | `sankey-chart` | Flow diagram showing read classification path: Total Reads → Classified/Unclassified → Taxonomic groups → Species. |
| **Radar** | `radar-chart` | Multi-axis comparison of top pathogens across metrics (abundance, confidence, read count, virulence, AMR genes). |

All charts use `Charts.transformApiData(result, chartType)` to convert raw API data into chart-ready formats, with mock data fallback for development.

### Mock Mode

For UI development without Docker or a database:

```bash
# Windows (CMD)
set PATHOGENIUS_MOCK_ANALYSIS=1
cd frontend && npm start

# Windows (PowerShell)
$env:PATHOGENIUS_MOCK_ANALYSIS = "1"
cd frontend; npm start

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
  "analysis_name": "anonymous_reads",
  "sample_type": "clinical",
  "completed_at": "2026-04-25T20:20:00.000Z",
  "classifier": "CU-CLARK-L",
  "summary": {
    "total_reads": 908893,
    "classified_reads": 14585,
    "classification_rate": 1.6,
    "species_detected": 23,
    "pathogens_detected": 3
  },
  "pathogens": [
    {
      "name": "Escherichia coli",
      "strain": "Escherichia coli",
      "tax_id": 562,
      "abundance": 45.2,
      "reads": 6594,
      "confidence": 95,
      "risk_level": "high",
      "amr_genes": 5,
      "virulence_genes": 12
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

The `clark_to_json` rule in the Snakefile generates risk levels and confidence scores using heuristic algorithms based on abundance, read counts, and known pathogen databases.

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
| GPU — header-only CSV / 0 taxa | CUDA watchdog timeout. Ensure `-b 128` is in the CU-CLARK-L command. Alternatively, disable watchdog: `echo 0 \| sudo tee /sys/kernel/debug/gpu.0/timeouts_enabled` |
| GPU — poll loop stuck on RUNNING | The `pgrep` self-match bug. Ensure the poll uses `pgrep -f '[c]uCLARK-l'` (bracket trick) |
| GPU — "Nothing to be done" | Stale cached results. The analysis service auto-cleans `.clark.csv`, `.abundance.csv`, and `.json` before each run. If running standalone, add `--rerun-incomplete` |
| `csv.field_size_limit` error | Already handled — the Snakefile auto-raises the CSV field size limit on startup |
| LLM — "Failed to load model" | Ensure Node.js 22+ is installed (`node-llama-cpp` v3 requires it). Check the `.gguf` file exists in `frontend/models/` |
| LLM — "Unexpected token 'with'" | Upgrade Node.js to v22+ and reinstall: `rm -rf node_modules && npm install` |
| Blank Electron window | Uncomment `mainWindow.webContents.openDevTools()` in `main.js` to debug |
| Cloud sync — "Not authenticated" | Login with a registered account (cloud features unavailable in guest mode) |
