# Hackathon Tasks - DICOM Annotation Viewer

**Atomorphic Mini Hackathon - NUS Q1 2026**  
**Duration**: 2 hours (16:00–18:00) + 30 min report writing (18:00–18:30)

---

## Overview

You have a working DICOM viewer built with Cornerstone3D. DICOM images load automatically on startup. Your mission is to implement the four disabled buttons in the toolbar.

**Where to code**: `src/App.tsx` — look for the four `handle*` functions with TODO markers

**Tasks to implement**:

| Task | Description | Points |
|------|-------------|--------|
| Task 1 | Load & Display Ground Truth | 30 pts |
| Task 2 | Export Annotations as XML | 30 pts |
| Task 3 | Load & Display AI Segmentation | 40 pts |
| Bonus A | One-Click AI Pipeline | 30 pts |
| Bonus B | UI Polish & Extra Tools | 20 pts |

**Total: 100 pts + 50 bonus**

**Partial credit is awarded!** Even incomplete implementations earn points.

---

## Task 1: Load Ground Truth Annotations (30 pts)

**Goal**: When the "Load Ground Truth" button is clicked, load LIDC-IDRI XML annotations and display nodule contours on the appropriate slices.

### Requirements

1. **Fetch the XML file** from `data/sample_annotations/`
2. **Parse the XML** to extract nodule contours with their Z positions
3. **Display as annotations** using Cornerstone3D's PlanarFreehandROI tool

### Hints

```typescript
// Fetch XML
const response = await fetch('/data/sample_annotations/069.xml');
const xmlText = await response.text();

// Parse with DOMParser
const parser = new DOMParser();
const doc = parser.parseFromString(xmlText, 'text/xml');

// Find ROIs (handle XML namespace with wildcard)
const rois = doc.getElementsByTagNameNS('*', 'roi');
Array.from(rois).forEach(roi => {
  const zPos = roi.getElementsByTagNameNS('*', 'imageZposition')[0]?.textContent;
  const edgeMaps = roi.getElementsByTagNameNS('*', 'edgeMap');
  // Extract x,y from each edgeMap
});
```

### Coordinate Conversion

LIDC annotations are in **image pixel coordinates** (x, y) with a **Z position in mm**. You need **world coordinates** (all in mm) for Cornerstone3D annotations.

The viewport's image data exposes the affine transform:

```typescript
const vp = re.getViewport(VIEWPORT_ID) as Types.IStackViewport
const imageData = vp.getImageData()
const { origin, spacing, direction } = imageData

// Pixel (col, row) → World (x, y, z)
// world_x = origin[0] + col * spacing[0] * direction[0][0]
//                     + row * spacing[1] * direction[1][0]
// world_y = origin[1] + col * spacing[0] * direction[0][1]
//                     + row * spacing[1] * direction[1][1]
// world_z comes directly from the XML <imageZposition> value

// Simpler: use the imageToWorldCoords utility from @cornerstonejs/core
import { utilities } from '@cornerstonejs/core'
const worldPoint = utilities.imageToWorldCoords(imageId, [col, row])
```

---

## Task 2: Export Annotations as XML (30 pts)

**Goal**: When "Export XML" is clicked, export user-drawn annotations to LIDC-compatible XML format and trigger a download.

### Requirements

1. **Get all annotations** from Cornerstone3D state
2. **Convert world coordinates** back to image pixel coordinates
3. **Generate valid XML** with proper structure
4. **Trigger a file download**

### Sample Output Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LidcReadMessage>
  <readingSession>
    <unblindedReadNodule>
      <noduleID>user-annotation-1</noduleID>
      <roi>
        <imageZposition>-150.5</imageZposition>
        <edgeMap><xCoord>256</xCoord><yCoord>312</yCoord></edgeMap>
        <edgeMap><xCoord>258</xCoord><yCoord>315</yCoord></edgeMap>
        <!-- more points -->
      </roi>
    </unblindedReadNodule>
  </readingSession>
</LidcReadMessage>
```

### Hints

```typescript
import { annotation } from '@cornerstonejs/tools';

// Get all annotations
const allAnnotations = annotation.state.getAllAnnotations();

// Filter for freehand ROIs
const freehandAnnotations = allAnnotations.filter(
  a => a.metadata.toolName === 'PlanarFreehandROI'
);

// Build XML string and trigger download
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<LidcReadMessage>\n';
// ... add structure ...
const blob = new Blob([xml], { type: 'text/xml' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'annotations.xml';
a.click();
```

---

## Task 3: Load & Display AI Segmentation (40 pts)

**Goal**: When "Load AI Result" is clicked, load a pre-computed DICOM SEG segmentation file and display it as a colored overlay on the CT images.

### Requirements

1. **Load the DICOM SEG file** from `data/LIDC-IDRI-0001/annotations/`
2. **Create a segmentation representation** in Cornerstone3D
3. **Display with appropriate colors** per segment

### Files Available

```
/data/LIDC-IDRI-0001/annotations/LIDC-IDRI-0001_Combined_SEG.dcm    ← LIDC nodule masks
/data/LIDC-IDRI-0001/annotations/LIDC-IDRI-0001_lung_nodules_seg.dcm ← TotalSegmentator output
```

### Approach: Using cornerstoneWADOImageLoader

```typescript
// Fetch the DICOM SEG file and add it as an imageId
const response = await fetch('/data/LIDC-IDRI-0001/annotations/LIDC-IDRI-0001_Combined_SEG.dcm')
const buffer = await response.arrayBuffer()
const file = new File([buffer], 'seg.dcm')
const segImageId = wadouri.fileManager.add(file)

// cornerstoneWADOImageLoader can decode DICOM SEG into per-frame pixel data
const image = await imageLoader.loadAndCacheImage(segImageId)
```

### Alternative: DIY labelmap from raw pixel data

If the DICOM SEG decode is complex, create a synthetic labelmap to demonstrate the overlay mechanism:

```typescript
// Create a typed array matching the CT volume dimensions
const labelmap = new Uint8Array(rows * cols * numSlices)
// Fill with your segment values (1 = nodule, 0 = background)

// Add to segmentation state
segmentation.addSegmentations([{
  segmentationId: 'mySegmentation',
  representation: {
    type: ToolEnums.SegmentationRepresentations.Labelmap,
    data: { /* labelmap typed array */ },
  },
}])
```

---

## Bonus Task A: One-Click AI Pipeline (30 pts)

**Goal**: Implement "Run AI" to execute TotalSegmentator on the current scan and automatically display results.

### Requirements

1. **Convert current DICOM to NIfTI**
2. **Run TotalSegmentator** (via Python backend or instructions)
3. **Auto-load results** when complete

### Suggested Approach

Since TotalSegmentator requires Python, you'll need a backend or a creative workaround:

```typescript
// Option 1: Call a local Python server
const response = await fetch('http://localhost:5000/segment', {
  method: 'POST',
  body: JSON.stringify({ input: 'current-volume' }),
});

// Option 2: Show instructions to user to run manually:
// python scripts/run_totalsegmentator.py input.nii.gz output.nii.gz
```

### Alternative (No Backend)

Earn partial credit by:
- Showing a modal with step-by-step instructions to run the Python scripts
- Creating a "poll for results" feature that checks for new files
- Providing a drag-and-drop for the segmentation output file

---

## Bonus Task B: UI Polish & Extra Tools (20 pts)

**Goal**: Make the viewer genuinely better — cleaner UI, more useful tools, improved user experience. Impress the judges.

### Ideas (pick any, or invent your own)

**Viewer tools:**
- Crosshair tool — click a point and show its world coordinates (x, y, z in mm)
- Slice slider — a range input that lets users scrub through slices visually
- Invert display — toggle between normal and inverted (negative) image
- Magnifier — a zoom lens that follows the cursor
- Measurement history — list all Length/Rect measurements with values in the Annotations panel

**UI improvements:**
- Keyboard shortcuts (e.g. `W` = W/L, `P` = Pan, `Z` = Zoom, arrow keys = next/prev slice)
- Annotation labels — show a tooltip or badge on each annotation with its tool name and slice number
- Segment visibility toggles — checkboxes in the Segments panel to show/hide individual labels
- Loading progress bar — show progress when loading many DICOM slices
- Dark/light theme toggle

**Data display:**
- DICOM metadata panel — show patient name, study date, slice thickness, pixel spacing from the loaded scan
- Nodule summary — after loading ground truth, show a table of nodule IDs, malignancy scores, and slice counts
- Colorbar legend — display a color-to-label legend alongside the segmentation overlay

### Judging

Points are awarded for **quality and usefulness**, not quantity. One well-implemented, genuinely helpful feature scores higher than five half-finished ones. Judges will also consider visual design — does it look professional?

---

## Tips for Success

1. **Start with Task 1** — it's the most straightforward
2. **Use console.log() liberally** — debugging in the browser is easy
3. **Partial solutions count** — don't get stuck, move on and return later
4. **Ask mentors** — we're here to unblock you

---

## Submission

When time is up (18:00):

1. Commit your code:
   ```bash
   git add .
   git commit -m "Hackathon submission"
   git push
   ```
2. **Grant repo access** to `atomorphic@gmail.com` (Settings → Collaborators)
3. **Email** `team@atomorphic.ai` with:
   - Your GitHub repo link
   - Confirmation that access has been granted
4. **Write your report** (18:00–18:30) — see logistics page for format

---

## Judging Criteria

| Criterion | Weight |
|-----------|--------|
| Functionality — does it work? | 60% |
| Code quality — clean and well-structured? | 20% |
| Creativity — clever solutions or bonus features? | 10% |
| Presentation — can you explain your approach? | 10% |

---

**Good luck! May the best engineer win!**
