# Public Data Directory

This directory should contain (or link to) the data files that need to be served by Vite.

## Setup

**Option A: Symlink (recommended)**
```bash
cd public
ln -s ../data data
```

**Option B: Copy**
```bash
cp -r data public/
```

## Required Files

After setup, ensure these paths are accessible:
- `/data/manifest.json` - List of DICOM files
- `/data/sample_dicom/*.dcm` - DICOM image files
- `/data/sample_annotations/*.xml` - LIDC XML annotations
- `/data/sample_annotations/segmentation.nii.gz` - (Optional) Pre-computed AI results
