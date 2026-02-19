#!/usr/bin/env python3
"""
LIDC-IDRI XML Annotation Parser
===============================
Parses LIDC-IDRI XML annotation files and extracts nodule contours.

This script helps understand the XML structure and can convert 
annotations to different formats (JSON, CSV).

Usage:
    python parse_lidc_xml.py <xml_file> [--output <format>]

Example:
    python parse_lidc_xml.py ./data/sample_annotations/069.xml
    python parse_lidc_xml.py ./data/sample_annotations/069.xml --output json

Output formats: json, csv, summary (default)

Requirements:
    Standard library only (xml.etree.ElementTree)
"""

import sys
import json
import csv
from pathlib import Path
from xml.etree import ElementTree as ET
from typing import List, Dict, Any, Tuple


def parse_lidc_xml(xml_path: str) -> Dict[str, Any]:
    """
    Parse LIDC-IDRI XML file and extract all nodule annotations.
    
    Args:
        xml_path: Path to LIDC XML file
        
    Returns:
        Dictionary with parsed data structure
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    # Handle namespaces (LIDC XML uses default namespace)
    ns = {'lidc': 'http://www.nih.gov'}
    
    # Try to find namespace from root
    if root.tag.startswith('{'):
        ns_uri = root.tag[1:root.tag.index('}')]
        ns = {'lidc': ns_uri}
    
    result = {
        "file": str(xml_path),
        "reading_sessions": [],
        "total_nodules": 0,
        "total_rois": 0,
    }
    
    # Find all reading sessions
    for session_elem in root.iter():
        if 'readingSession' in session_elem.tag:
            session = parse_reading_session(session_elem, ns)
            result["reading_sessions"].append(session)
            result["total_nodules"] += len(session["nodules"])
            for nodule in session["nodules"]:
                result["total_rois"] += len(nodule["rois"])
    
    return result


def parse_reading_session(session_elem: ET.Element, ns: dict) -> Dict[str, Any]:
    """Parse a single reading session."""
    session = {
        "nodules": [],
        "non_nodules": [],
    }
    
    # Find nodules (unblinded or marked)
    for nodule_elem in session_elem.iter():
        if any(tag in nodule_elem.tag for tag in ['unblindedReadNodule', 'nodule']):
            nodule = parse_nodule(nodule_elem, ns)
            if nodule["rois"]:  # Only add if it has ROIs
                session["nodules"].append(nodule)
    
    return session


def parse_nodule(nodule_elem: ET.Element, ns: dict) -> Dict[str, Any]:
    """Parse a single nodule with all its ROIs."""
    nodule = {
        "nodule_id": "",
        "characteristics": {},
        "rois": [],
    }
    
    # Get nodule ID
    for child in nodule_elem:
        if 'noduleID' in child.tag:
            nodule["nodule_id"] = child.text or ""
        elif 'characteristics' in child.tag:
            nodule["characteristics"] = parse_characteristics(child)
        elif 'roi' in child.tag.lower():
            roi = parse_roi(child)
            if roi["contour_points"]:
                nodule["rois"].append(roi)
    
    return nodule


def parse_characteristics(char_elem: ET.Element) -> Dict[str, Any]:
    """Parse nodule characteristics."""
    chars = {}
    for child in char_elem:
        tag = child.tag.split('}')[-1]  # Remove namespace
        chars[tag] = child.text
    return chars


def parse_roi(roi_elem: ET.Element) -> Dict[str, Any]:
    """Parse a single ROI (region of interest) on one slice."""
    roi = {
        "image_z_position": None,
        "image_sop_uid": "",
        "contour_points": [],
        "inclusion": True,
    }
    
    for child in roi_elem:
        tag = child.tag.split('}')[-1].lower()
        
        if 'imagez' in tag or 'zposition' in tag:
            try:
                roi["image_z_position"] = float(child.text)
            except (ValueError, TypeError):
                pass
        elif 'imagesop' in tag or 'sopuid' in tag:
            roi["image_sop_uid"] = child.text or ""
        elif 'inclusion' in tag:
            roi["inclusion"] = child.text == "TRUE"
        elif 'edgemap' in tag:
            point = parse_edge_point(child)
            if point:
                roi["contour_points"].append(point)
    
    return roi


def parse_edge_point(edge_elem: ET.Element) -> Tuple[float, float]:
    """Parse a single edge point (x, y coordinates)."""
    x, y = None, None
    
    for child in edge_elem:
        tag = child.tag.split('}')[-1].lower()
        if 'xcoord' in tag:
            try:
                x = float(child.text)
            except (ValueError, TypeError):
                pass
        elif 'ycoord' in tag:
            try:
                y = float(child.text)
            except (ValueError, TypeError):
                pass
    
    if x is not None and y is not None:
        return (x, y)
    return None


def to_json(data: Dict[str, Any]) -> str:
    """Convert parsed data to JSON string."""
    return json.dumps(data, indent=2)


def to_csv(data: Dict[str, Any], output_path: str = None) -> str:
    """Convert parsed data to CSV format (one row per contour point)."""
    rows = []
    headers = ["session", "nodule_id", "roi_index", "z_position", "point_index", "x", "y"]
    
    for session_idx, session in enumerate(data["reading_sessions"]):
        for nodule in session["nodules"]:
            for roi_idx, roi in enumerate(nodule["rois"]):
                for point_idx, (x, y) in enumerate(roi["contour_points"]):
                    rows.append({
                        "session": session_idx,
                        "nodule_id": nodule["nodule_id"],
                        "roi_index": roi_idx,
                        "z_position": roi["image_z_position"],
                        "point_index": point_idx,
                        "x": x,
                        "y": y,
                    })
    
    if output_path:
        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)
        return f"Written to {output_path}"
    else:
        import io
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue()


def print_summary(data: Dict[str, Any]) -> None:
    """Print a human-readable summary of the parsed data."""
    print("=" * 60)
    print("LIDC-IDRI Annotation Summary")
    print("=" * 60)
    print(f"File: {data['file']}")
    print(f"Reading Sessions: {len(data['reading_sessions'])}")
    print(f"Total Nodules: {data['total_nodules']}")
    print(f"Total ROIs: {data['total_rois']}")
    print()
    
    for session_idx, session in enumerate(data["reading_sessions"]):
        print(f"Session {session_idx + 1}:")
        print(f"  Nodules: {len(session['nodules'])}")
        
        for nodule in session["nodules"]:
            print(f"    - ID: {nodule['nodule_id']}")
            print(f"      ROIs (slices): {len(nodule['rois'])}")
            
            if nodule['rois']:
                z_positions = [r['image_z_position'] for r in nodule['rois'] 
                               if r['image_z_position'] is not None]
                if z_positions:
                    print(f"      Z range: {min(z_positions):.2f} to {max(z_positions):.2f}")
                
                total_points = sum(len(r['contour_points']) for r in nodule['rois'])
                print(f"      Total contour points: {total_points}")
        print()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    xml_path = sys.argv[1]
    output_format = "summary"
    
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_format = sys.argv[idx + 1].lower()
    
    if not Path(xml_path).exists():
        print(f"ERROR: File not found: {xml_path}")
        sys.exit(1)
    
    try:
        data = parse_lidc_xml(xml_path)
        
        if output_format == "json":
            print(to_json(data))
        elif output_format == "csv":
            print(to_csv(data))
        else:
            print_summary(data)
            
    except ET.ParseError as e:
        print(f"ERROR: Failed to parse XML: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
