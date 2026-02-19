#!/usr/bin/env python3
"""
TotalSegmentator Runner
=======================
Runs TotalSegmentator on a NIfTI CT scan and outputs segmentation.

Usage:
    python run_totalsegmentator.py <input_nifti> <output_nifti> [--fast]

Example:
    python run_totalsegmentator.py ./data/input.nii.gz ./data/segmentation.nii.gz
    python run_totalsegmentator.py ./data/input.nii.gz ./data/segmentation.nii.gz --fast

Requirements:
    pip install TotalSegmentator torch

Note: First run will download model weights (~1.5GB)
"""

import sys
from pathlib import Path

try:
    import numpy as np
    import nibabel as nib
except ImportError:
    print("ERROR: numpy/nibabel not installed. Run: pip install numpy nibabel")
    sys.exit(1)


# TotalSegmentator label names (subset - 104 total)
TOTALSEG_LABELS = {
    1: "spleen",
    2: "kidney_right",
    3: "kidney_left",
    4: "gallbladder",
    5: "liver",
    6: "stomach",
    7: "aorta",
    8: "inferior_vena_cava",
    9: "portal_vein_and_splenic_vein",
    10: "pancreas",
    11: "adrenal_gland_right",
    12: "adrenal_gland_left",
    13: "lung_upper_lobe_left",
    14: "lung_lower_lobe_left",
    15: "lung_upper_lobe_right",
    16: "lung_middle_lobe_right",
    17: "lung_lower_lobe_right",
    18: "vertebrae_L5",
    19: "vertebrae_L4",
    20: "vertebrae_L3",
    # ... more labels up to 104
    51: "heart",
    52: "pulmonary_artery",
    # Add more as needed
}


def run_totalsegmentator(input_path: str, output_path: str, fast: bool = False) -> bool:
    """
    Run TotalSegmentator on input NIfTI and save segmentation.
    
    Args:
        input_path: Path to input NIfTI file (CT scan)
        output_path: Path for output segmentation NIfTI
        fast: Use fast mode (lower quality but faster)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        from totalsegmentator.python_api import totalsegmentator
    except ImportError:
        print("ERROR: TotalSegmentator not installed.")
        print("Install with: pip install TotalSegmentator")
        print("Note: Requires PyTorch to be installed first")
        return False
    
    input_file = Path(input_path)
    if not input_file.exists():
        print(f"ERROR: Input file not found: {input_path}")
        return False
    
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Fast mode: {fast}")
    print()
    
    # Run TotalSegmentator
    print("Running TotalSegmentator...")
    print("(This may take a few minutes on first run while downloading models)")
    print()
    
    try:
        # TotalSegmentator returns a nibabel image
        output_img = totalsegmentator(
            input=input_file,
            output=None,  # Return image instead of writing
            fast=fast,
            device="gpu" if _has_cuda() else "cpu",
            quiet=False,
        )
        
        # Save the result
        nib.save(output_img, output_path)
        
        # Print statistics
        data = output_img.get_fdata()
        unique_labels = np.unique(data).astype(int)
        print()
        print(f"SUCCESS: Segmentation saved to {output_path}")
        print(f"Found {len(unique_labels) - 1} structures (excluding background)")
        print()
        print("Detected structures:")
        for label in unique_labels:
            if label == 0:
                continue
            name = TOTALSEG_LABELS.get(label, f"label_{label}")
            voxel_count = np.sum(data == label)
            print(f"  {label}: {name} ({voxel_count} voxels)")
        
        return True
        
    except Exception as e:
        print(f"ERROR: TotalSegmentator failed: {e}")
        return False


def _has_cuda() -> bool:
    """Check if CUDA is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def get_label_info(segmentation_path: str) -> dict:
    """
    Get information about labels in a segmentation file.
    
    Args:
        segmentation_path: Path to segmentation NIfTI
        
    Returns:
        Dictionary mapping label IDs to names and voxel counts
    """
    img = nib.load(segmentation_path)
    data = img.get_fdata()
    
    info = {}
    for label in np.unique(data).astype(int):
        if label == 0:
            continue
        info[label] = {
            "name": TOTALSEG_LABELS.get(label, f"unknown_{label}"),
            "voxels": int(np.sum(data == label)),
        }
    
    return info


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    fast = "--fast" in sys.argv
    
    success = run_totalsegmentator(input_path, output_path, fast)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
