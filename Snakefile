import os
import csv
import json
from datetime import datetime

configfile: "config.yaml"

SAMPLE     = config.get("sample", "sample")
FASTQ_EXT  = config.get("fastq_ext", "fastq")
DB_HOST    = os.path.abspath(config["paths"]["db_host_windows"]).replace("\\", "/")
DATA_HOST  = os.path.abspath(config["paths"]["data_host_windows"]).replace("\\", "/")
RESULTS_HOST = os.path.abspath(os.path.join("results", "clark")).replace("\\", "/")
IMAGE      = config["clark"]["image"]
CLARK_DIR  = "/usr/local/opt/clark"

rule all:
    input:
        f"results/clark/{SAMPLE}.json"


rule clark_lite_classify:
    """
    Run CLARK-l classification directly (bypasses classify_metagenome.sh
    which requires a .settings file that does not persist between Docker runs).

    CLARK-l output CSV columns:
      Object_ID, Length, 1st_assignment (taxid), hit_count_1,
      2nd_assignment, hit_count_2, confidence_score
    """
    input:
        fastq=os.path.join(DATA_HOST, f"{SAMPLE}.{FASTQ_EXT}")
    output:
        clark_csv=f"results/clark/{SAMPLE}.clark.csv"
    params:
        db=DB_HOST,
        data=DATA_HOST,
        out=RESULTS_HOST,
        image=IMAGE,
        sample=SAMPLE,
        ext=FASTQ_EXT,
        threads=config["clark"]["threads"],
        kmer=config["clark"].get("kmer_length", 27),
    run:
        os.makedirs(RESULTS_HOST, exist_ok=True)
        # -T  targets definition built by build_clark_db.py (set_targets.sh)
        # -D  database directory (k-mer index is built/cached here on first run)
        # -m 2  express mode (fastest; default=1, full=0)
        # -k  k-mer length (must match what was used when building targets)
        shell(
            'docker run --rm '
            '-v "{params.db}:/db" '
            '-v "{params.data}:/data" '
            '-v "{params.out}:/out" '
            '{params.image} '
            'sh -c "'
            'CLARK-l '
            '-T /db/targets.txt '
            '-D /db/ '
            '-O /data/{params.sample}.{params.ext} '
            '-R /out/{params.sample}.clark '
            '-n {params.threads} '
            '-k {params.kmer} '
            '-m 2'
            '"'
        )


rule clark_abundance_report:
    """
    Estimate species-level abundance from the CLARK-l CSV output.

    estimate_abundance.sh wraps getAbundance which reads:
      -D  database directory (for targets.txt / taxonomy names)
      -F  CLARK result CSV

    Output CSV columns: Name, TaxID, Lineage, Count, Proportion(%)
    """
    input:
        clark_csv=f"results/clark/{SAMPLE}.clark.csv"
    output:
        abundance=f"results/clark/{SAMPLE}.abundance.csv"
    params:
        db=DB_HOST,
        out=RESULTS_HOST,
        image=IMAGE,
        sample=SAMPLE,
        clark_dir=CLARK_DIR,
    run:
        shell(
            'docker run --rm '
            '-v "{params.db}:/db" '
            '-v "{params.out}:/out" '
            '-w {params.clark_dir} '
            '{params.image} '
            'sh -c "'
            './estimate_abundance.sh '
            '-D /db/ '
            '-F /out/{params.sample}.clark.csv '
            '> /out/{params.sample}.abundance.csv'
            '"'
        )


rule clark_to_json:
    """
    Convert the CLARK abundance report to the canonical JSON format used
    by the rest of the Patho-genius pipeline.

    Input CSV  (estimate_abundance.sh output):
      Name, TaxID, Lineage, Count, Proportion(%)

    Output JSON:
      {
        "sample_id": "...",
        "processed_date": "...",
        "classifier": "CLARK-l",
        "pathogens_detected": [
          {"name": "...", "tax_id": ..., "abundance": ..., "reads": ...}
        ]
      }
    """
    input:
        abundance="results/clark/{sample}.abundance.csv"
    output:
        json="results/clark/{sample}.json"
    run:
        pathogens = []

        with open(input.abundance) as f:
            reader = csv.reader(f)
            for row in reader:
                if not row or row[0].startswith("#") or row[0].strip() == "Name":
                    continue
                if len(row) < 5:
                    continue

                name = row[0].strip()
                try:
                    taxid = int(row[1].strip())
                except (ValueError, IndexError):
                    continue
                try:
                    reads = int(row[3].strip())
                except (ValueError, IndexError):
                    reads = 0
                try:
                    proportion = float(row[4].strip())
                except (ValueError, IndexError):
                    proportion = 0.0

                # Keep species with > 0.01 % abundance
                if proportion > 0.01 and name != "UNKNOWN":
                    pathogens.append({
                        "name": name,
                        "tax_id": taxid,
                        "abundance": proportion,
                        "reads": reads,
                    })

        output_data = {
            "sample_id": wildcards.sample,
            "processed_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "classifier": "CLARK-l",
            "pathogens_detected": pathogens,
        }

        with open(output.json, "w") as out:
            json.dump(output_data, out, indent=2)
