import subprocess, time, sys
while True:
    r = subprocess.run(["tasklist", "/FI", "PID eq 8272"], capture_output=True, text=True)
    if "8272" not in r.stdout:
        print(f"[{time.strftime('%H:%M:%S')}] SCP process completed!")
        break
    print(f"[{time.strftime('%H:%M:%S')}] SCP still running...")
    time.sleep(60)
