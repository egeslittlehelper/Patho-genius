import os
import json
from datetime import datetime

# Define the Windows-visible path to your Ubuntu home
UBUNTU_HOME_WIN = r"\\wsl.localhost\Ubuntu\home\yalid"

rule all:
    input:
        "results/kraken2/SRR7497167_1.json"

import shutil

rule kraken2_classify_native:
    input:
        fastq=ancient(os.path.join(UBUNTU_HOME_WIN,"fastq","SRR7497167_1.fastq"))
    output:
        report="results/kraken2/SRR7497167_1.report",
        kraken="results/kraken2/SRR7497167_1.kraken"
    run:
        # 1. Since files already exist in Ubuntu, we check before running
        # This prevents re-running the 10-minute Kraken process if not needed
        wsl_report = "/home/yalid/results/kraken2/SRR7497167_1.report"

        # Check if files are missing in Ubuntu; only then run Kraken2
        check_cmd = f'wsl -d Ubuntu [ -f {wsl_report} ]'
        if subprocess.call(check_cmd) != 0:
            shell('wsl -d Ubuntu bash -c "mkdir -p /home/yalid/results/kraken2 && '
                  'kraken2 --db /home/yalid/my_pathogen_db --threads 8 '
                  '--report /home/yalid/results/kraken2/SRR7497167_1.report '
                  '/home/yalid/fastq/SRR7497167_1.fastq > /home/yalid/results/kraken2/SRR7497167_1.kraken"')

        # 2. Ensure the Windows results directory exists
        os.makedirs("results/kraken2",exist_ok=True)

        # 3. Use Python to copy the files from WSL to Windows
        # UBUNTU_HOME_WIN should be r"\\wsl.localhost\Ubuntu\home\yalid"
        shutil.copy2(os.path.join(UBUNTU_HOME_WIN,"results","kraken2","SRR7497167_1.report"),output.report)
        shutil.copy2(os.path.join(UBUNTU_HOME_WIN,"results","kraken2","SRR7497167_1.kraken"),output.kraken)

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
                # Filter for Species (S) with > 0.1% abundance
                if rank == "S" and float(perc) > 0.1:
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