import os
from glob import glob

########################################
# Configuration
########################################

configfile: "config.yaml"

FASTQ_DIR = "data/fastq"

SAMPLES = [
    os.path.basename(f).rsplit(".", 1)[0]
    for f in glob(f"{FASTQ_DIR}/*.fastq")
]

os.makedirs("results/kraken2", exist_ok=True)
os.makedirs("logs/kraken2", exist_ok=True)

PROJECT_ROOT = os.getcwd().replace("\\", "/")

########################################
# Final target
########################################

rule all:
    input:
        expand("results/kraken2/{sample}.json", sample=SAMPLES)

########################################
# 1. Kraken2 classification (Docker)
########################################

rule kraken2_classify:
    input:
        fastq="data/fastq/{sample}.fastq"
    output:
        kraken="results/kraken2/{sample}.kraken",
        report="results/kraken2/{sample}.report"
    threads:
        config["kraken2"]["threads"]
    log:
        "logs/kraken2/{sample}.log"
    shell:
        """
        docker run --rm \
          -v "{config[paths][db_host]}:{config[kraken2][db_container_path]}" \
          -v "{PROJECT_ROOT}:/work" \
          {config[kraken2][image]} \
          kraken2 \
            --db {config[kraken2][db_container_path]} \
            --threads {threads} \
            --confidence {config[kraken2][confidence]} \
            --report /work/{output.report} \
            /work/{input.fastq} \
            > /work/{output.kraken} \
            2> /work/{log}
        """

########################################
# 2. Convert Kraken2 report to JSON
########################################

rule kraken2_to_json:
    input:
        report="results/kraken2/{sample}.report"
    output:
        json="results/kraken2/{sample}.json"
    run:
        import json
        from datetime import datetime

        results = []

        with open(input.report) as f:
            for line in f:
                cols = line.rstrip("\n").split("\t")
                if len(cols) < 6:
                    continue

                percent, reads_clade, reads_direct, rank, taxid, name = cols

                if rank == "S":
                    results.append({
                        "rank": "species",
                        "taxon": name.strip(),
                        "taxid": int(taxid),
                        "reads": int(reads_clade),
                        "percentage": float(percent)
                    })

        output_data = {
            "sample": wildcards.sample,
            "analysis_timestamp": datetime.utcnow().isoformat() + "Z",
            "tool": "kraken2",
            "database": "local_kraken2_db",
            "parameters": {
                "confidence": config["kraken2"]["confidence"],
                "threads": config["kraken2"]["threads"]
            },
            "results": results
        }

        with open(output.json, "w") as out:
            json.dump(output_data, out, indent=2)
