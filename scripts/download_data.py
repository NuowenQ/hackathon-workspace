#!/usr/bin/env python3
"""
Download and unpack the LIDC-IDRI sample data for the Atomorphic Mini Hackathon.

Usage:
    python scripts/download_data.py

Requirements:
    pip install gdown        # Google Drive downloader
"""

import os
import sys
import zipfile
import subprocess

# ── Configuration ─────────────────────────────────────────────────────────────
# Google Drive shared link or file ID for the data archive
DRIVE_URL = "https://drive.google.com/file/d/REPLACE_WITH_FILE_ID/view?usp=sharing"

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
ARCHIVE  = os.path.join(DATA_DIR, 'lidc_data.zip')
# ──────────────────────────────────────────────────────────────────────────────

def check_gdown():
    try:
        import gdown
        return gdown
    except ImportError:
        print("Installing gdown...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'gdown', '-q'])
        import gdown
        return gdown

def main():
    if DRIVE_URL.startswith("https://drive.google.com/file/d/REPLACE"):
        print("ERROR: Edit scripts/download_data.py and set DRIVE_URL to the real Google Drive link.")
        sys.exit(1)

    os.makedirs(DATA_DIR, exist_ok=True)

    if os.path.exists(ARCHIVE):
        print(f"Archive already exists: {ARCHIVE}")
    else:
        print(f"Downloading data from Google Drive...")
        gdown = check_gdown()
        gdown.download(url=DRIVE_URL, output=ARCHIVE, fuzzy=True)
        print(f"Downloaded: {ARCHIVE}")

    print("Unpacking...")
    with zipfile.ZipFile(ARCHIVE, 'r') as zf:
        zf.extractall(DATA_DIR)
    print("Done. Data is ready in data/")

    os.remove(ARCHIVE)
    print("Removed archive.")

if __name__ == '__main__':
    main()
