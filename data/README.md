# Data Directory

This directory contains 10 LIDC-IDRI chest CT cases with radiologist annotations and pre-computed AI segmentations.

## Structure

```
data/
├── LIDC-IDRI-0001/
│   ├── ct/                              # CT DICOM slices (1-001.dcm … 1-133.dcm)
│   └── annotations/
│       ├── 069.xml                      # LIDC radiologist XML annotations
│       ├── LIDC-IDRI-0001_Combined_SEG.dcm      # LIDC nodule masks (DICOM SEG)
│       └── LIDC-IDRI-0001_lung_nodules_seg.dcm  # TotalSegmentator output (DICOM SEG)
├── LIDC-IDRI-0002/ … LIDC-IDRI-0010/   # Same structure for each patient
└── README.md
```

## Cases

| Patient | CT Slices | XML File | Nodules |
|---------|-----------|----------|---------|
| LIDC-IDRI-0001 | 133 | 069.xml | 10 |
| LIDC-IDRI-0002 | 261 | 071.xml | 23 |
| LIDC-IDRI-0003 | 140 | 072.xml | 13 |
| LIDC-IDRI-0004 | 241 | 074.xml | 4 |
| LIDC-IDRI-0005 | 133 | 076.xml | 5 |
| LIDC-IDRI-0006 | 133 | 078.xml | 4 |
| LIDC-IDRI-0007 | 145 | 081.xml | 4 |
| LIDC-IDRI-0008 | 133 | 082.xml | 4 |
| LIDC-IDRI-0009 | 256 | 085.xml | 2 |
| LIDC-IDRI-0010 | 277 | 086.xml | 5 |

## How the Viewer Accesses Data

Vite serves `public/data` → `../data` via a symlink, so all files are accessible at:

```
/data/LIDC-IDRI-0001/ct/1-001.dcm
/data/LIDC-IDRI-0001/annotations/069.xml
/data/LIDC-IDRI-0001/annotations/LIDC-IDRI-0001_Combined_SEG.dcm
...
```

The viewer auto-loads `LIDC-IDRI-0001` on startup. You can load any case by fetching from these URLs.

## Annotation Format

The XML files follow the LIDC-IDRI schema. Each `<roi>` element contains:
- `<imageZposition>` — Z coordinate in mm
- `<imageSOP_UID>` — which DICOM slice this contour belongs to
- `<edgeMap>` elements — pixel (x, y) coordinates of the contour

See `pre-hackathon-materials/docs/LIDC_DATA_GUIDE.md` for full format details.

## Segmentation Files

- `*_Combined_SEG.dcm` — DICOM SEG rasterized from the LIDC XML contours (binary, per-annotator)
- `*_lung_nodules_seg.dcm` — TotalSegmentator lung nodule segmentation output
