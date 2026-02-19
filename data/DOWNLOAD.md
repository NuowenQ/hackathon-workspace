# Data — Download Required

The DICOM data is too large for GitHub. Download it before running the viewer.

## Quick Download (Recommended)

```bash
pip install gdown
python scripts/download_data.py
```

This downloads and unpacks all data into `data/` automatically.

## Manual Download

1. Download the archive from Google Drive:
   **https://drive.google.com/file/d/REPLACE_WITH_FILE_ID/view?usp=sharing**
2. Unzip into this `data/` folder so the structure looks like:

```
data/
├── LIDC-IDRI-0001/
│   ├── ct/             ← 133 DICOM slices
│   └── annotations/    ← 069.xml + 2 SEG files
├── LIDC-IDRI-0002/ … LIDC-IDRI-0010/
└── manifest.json
```

## What's Included

| Patient | CT Slices | Nodules |
|---------|-----------|---------|
| LIDC-IDRI-0001 | 133 | 10 |
| LIDC-IDRI-0002 | 261 | 23 |
| LIDC-IDRI-0003 | 140 | 13 |
| LIDC-IDRI-0004 | 241 | 4 |
| LIDC-IDRI-0005 | 133 | 5 |
| LIDC-IDRI-0006 | 133 | 4 |
| LIDC-IDRI-0007 | 145 | 4 |
| LIDC-IDRI-0008 | 133 | 4 |
| LIDC-IDRI-0009 | 256 | 2 |
| LIDC-IDRI-0010 | 277 | 5 |

Each patient folder contains:
- `ct/` — CT DICOM slices (`1-001.dcm` … `1-NNN.dcm`)
- `annotations/` — LIDC XML + LIDC Combined SEG + TotalSegmentator lung nodule SEG

The viewer auto-loads `LIDC-IDRI-0001` on startup via `public/data → ../data`.
