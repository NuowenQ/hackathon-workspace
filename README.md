# Atomorphic Mini Hackathon - DICOM Annotation Workspace

Welcome to the Atomorphic Mini Hackathon! This workspace contains a working DICOM viewer built with Cornerstone3D. Your challenge is to extend it with annotation and AI segmentation features.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

## What's Already Working

- DICOM image loading (drag & drop or file picker)
- Image navigation (scroll through slices)
- Window/Level adjustment
- Pan and zoom
- Basic annotation tools (Length, Rectangle, Freehand)
- Export annotations to JSON

## Your Hackathon Tasks

The viewer has four disabled buttons that need YOUR implementation:

| Button | Task | Points |
|--------|------|--------|
| **Load Ground Truth** | Parse LIDC XML annotations and display them | 30 pts |
| **Export XML** | Export drawn annotations to LIDC-compatible XML | 30 pts |
| **Load AI Result** | Load and display pre-computed segmentation | 40 pts |
| **Run AI** | Execute TotalSegmentator and display results | 30 pts (bonus A) |
| *(open-ended)* | UI polish and extra viewer tools | 20 pts (bonus B) |

See `HACKATHON_TASKS.md` for detailed instructions on each task.

## Project Structure

```
hackathon-workspace/
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Main React component (YOUR TASKS HERE!)
│   ├── core/
│   │   ├── init.ts          # Cornerstone3D initialisation
│   │   └── loader.ts        # DICOM loading functions
│   └── styles.css           # Application styles
├── data/
│   └── LIDC-IDRI-XXXX/      # One folder per patient case
│       ├── ct/              # CT DICOM slices (1-001.dcm … 1-NNN.dcm)
│       └── annotations/     # XML + LIDC SEG + TotalSeg SEG
├── scripts/                 # Python utility scripts
├── public/
│   └── data/               # Symlink → data/ (served at /data/ URL)
├── index.html              # Vite HTML entry
├── package.json            # Node.js dependencies
├── vite.config.ts          # Vite bundler configuration
└── tsconfig.json           # TypeScript configuration
```

## Key File to Modify

### `src/App.tsx`

This file is the main React component. It contains four async handler functions with TODO markers — one per task:

```typescript
// TASK 1 — implement this:
const handleLoadGT = useCallback(async () => {
  // TODO: fetch LIDC XML, parse, display as PlanarFreehandROI annotations
}, [])

// TASK 2 — implement this:
const handleExportXML = useCallback(() => {
  // TODO: get annotations, convert to XML, trigger download
}, [])

// TASK 3 — implement this:
const handleLoadAI = useCallback(async () => {
  // TODO: fetch NIfTI, create labelmap segmentation overlay
}, [])

// BONUS A — implement this:
const handleRunAI = useCallback(async () => {
  // TODO: trigger AI pipeline or guide user
}, [])
```

## Helpful Cornerstone3D APIs

### Adding Freehand Annotations
```typescript
import { annotation } from '@cornerstonejs/tools';

// Create annotation programmatically
const annotationUID = annotation.state.addAnnotation({
  annotationUID: crypto.randomUUID(),
  metadata: {
    toolName: 'PlanarFreehandROI',
    referencedImageId: imageId,
    // ...
  },
  data: {
    handles: {
      points: [/* world coordinates */],
    },
    // ...
  },
});
```

### Working with Segmentations (Stack viewport)
```typescript
import { segmentation, Enums as ToolEnums } from '@cornerstonejs/tools'

// Add a segmentation (labelmap data as a typed array)
segmentation.addSegmentations([{
  segmentationId: 'mySegmentation',
  representation: {
    type: ToolEnums.SegmentationRepresentations.Labelmap,
    data: { /* your labelmap data */ },
  },
}])

// Display on the viewport
await segmentation.addLabelmapRepresentationToViewportMap({
  [VIEWPORT_ID]: [{ segmentationId: 'mySegmentation' }],
})
```

## Data Files

### Ground Truth (LIDC XML)
- Location: `data/LIDC-IDRI-XXXX/annotations/*.xml`
- Format: LIDC-IDRI XML with `<roi>` elements containing `<edgeMap>` pixel coordinates
- The viewer auto-loads `LIDC-IDRI-0001` on startup via `public/data` → `data/`

### Pre-computed Segmentation (DICOM SEG)
- Location: `data/LIDC-IDRI-XXXX/annotations/*_Combined_SEG.dcm` (LIDC nodule masks)
- Location: `data/LIDC-IDRI-XXXX/annotations/*_lung_nodules_seg.dcm` (TotalSegmentator output)
- Format: DICOM SEG (multi-frame binary segmentation)

## Tips for Success

1. **Start with Task 1** - It's the most straightforward
2. **Use the browser console** - `console.log()` is your friend
3. **Check the Cornerstone3D docs** - https://www.cornerstonejs.org/docs/
4. **Ask questions** - Mentors are here to help!

## Troubleshooting

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### CORS errors
Make sure you're accessing via `http://localhost:3000`, not `file://`

### Viewport is black
- Check browser console for errors
- Ensure DICOM files are valid
- Try the Reset button

## Good Luck!

Remember: The goal is to learn and demonstrate your problem-solving skills. Partial implementations are valued - show your thought process!
