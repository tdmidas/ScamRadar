"""
Utility script to run local stack for dapp testing:
- Start Hardhat node
- Start static server for dapp at http://localhost:8080

Usage:
    python run.py

Requires Node/npm. Assumes you have run `npm install` in this folder.
"""
import subprocess
import sys
import os
import shlex


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    dapp_dir = os.path.join(root, "dapp")

    processes = []

    def start(cmd, cwd):
        print(f"Starting: {cmd} (cwd={cwd})")
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        processes.append(proc)
        return proc

    try:
        # 1) Hardhat node (port 8545, chainId 31337)
        start("npx hardhat node", cwd=root)

        # 2) Static server for dapp (port 8080)
        start("npx serve -l 8080 .", cwd=dapp_dir)

        print("\nLogs (Ctrl+C to stop both):\n")
        # Stream combined logs
        while True:
            for proc in list(processes):
                line = proc.stdout.readline()
                if line:
                    prefix = "[hardhat]" if proc is processes[0] else "[serve]"
                    print(f"{prefix} {line}", end="")
                if proc.poll() is not None:
                    processes.remove(proc)
                    print(f"\nProcess exited: {proc.args}")
            if not processes:
                break
    except KeyboardInterrupt:
        print("\nStopping processes...")
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    sys.exit(main())

