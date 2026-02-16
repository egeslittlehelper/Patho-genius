import os
import json
from datetime import datetime

configfile: "config.yaml"

SAMPLE = "SRR7497167_1-001"
# Convert relative paths to absolute for Docker mounts
DB_HOST = os.path.abspath(config["paths"]["db_host_windows"]).replace("\\", "/")
DATA_HOST = os.path.abspath(config["paths"]["data_host_windows"]).replace("\\", "/")
RESULTS_HOST = os.path.abspath(os.path.join("results", "kraken2")).replace("\\", "/")
IMAGE = config["kraken2"]["image"]

rule all:
    input:
        f"results/kraken2/{SAMPLE}.json"

rule kraken2_classify_container:
    input:
        fastq=os.path.join(DATA_HOST, f"{SAMPLE}.fastq")
    output:
        report=f"results/kraken2/{SAMPLE}.report",
        kraken=f"results/kraken2/{SAMPLE}.kraken"
    params:
        db=DB_HOST,
        data=DATA_HOST,
        out=RESULTS_HOST,
        image=IMAGE,
        sample=SAMPLE,
        threads=config["kraken2"]["threads"],
        confidence=config["kraken2"].get("confidence")
    run:
        os.makedirs(RESULTS_HOST, exist_ok=True)
        conf_arg = ""
        if params.confidence is not None:
            conf_arg = f"--confidence {params.confidence}"
        shell(
            'docker run --rm '
            '-v "{params.db}:/db" '
            '-v "{params.data}:/data" '
            '-v "{params.out}:/out" '
            '{params.image} '
            'sh -c "kraken2 --db /db --threads {params.threads} {conf_arg} '
            '--report /out/{params.sample}.report '
            '/data/{params.sample}.fastq > /out/{params.sample}.kraken"'
        )

rule kraken2_to_json:
    input:
        report="results/kraken2/{sample}.report"
    output:
        json="results/kraken2/{sample}.json"
    run:
        pathogens = []
        with open(input.report,"r") as f:
            for line in f:
                cols = line.strip().split("\t")
                if len(cols) < 6: continue
                perc, reads, _, rank, taxid, name = cols
                # Filter for Species (S) with > 0.01% abundance
                if rank == "S" and float(perc) > 0.01:
                    pathogens.append({
                        "name": name.strip(),
                        "tax_id": int(taxid),
                        "abundance": float(perc),
                        "reads": int(reads)
                    })

        output_data = {
            "sample_id": wildcards.sample,
            "processed_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "pathogens_detected": pathogens
        }

        with open(output.json,"w") as out:
            json.dump(output_data,out,indent=2)