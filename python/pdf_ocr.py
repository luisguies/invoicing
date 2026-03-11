#!/usr/bin/env python3
"""
PDF OCR service using Google Vision + Gemini to extract load data from PDF files.
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional

import pdfplumber


def get_safe_default() -> Dict:
    """Return a safe default object when extraction fails."""
    return {
        "carrier_name": None,
        "load_number": None,
        "pickup_date": None,
        "delivery_date": None,
        "pickup_city": None,
        "pickup_state": None,
        "delivery_city": None,
        "delivery_state": None,
        "carrier_pay": None,
        "needs_review": True,
        "warnings": ["Extraction failed"],
    }


def is_extraction_failed(data: Dict) -> bool:
    """Treat extraction as failed when required dates are missing."""
    if not data:
        return True
    has_pickup_date = data.get("pickup_date") not in (None, "", "NOT_FOUND")
    has_delivery_date = data.get("delivery_date") not in (None, "", "NOT_FOUND")
    return not (has_pickup_date and has_delivery_date)


def extract_text_from_pdf(pdf_path: str) -> Optional[str]:
    """Extract text from all PDF pages."""
    try:
        text_content = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_content.append(text)
        return "\n".join(text_content) if text_content else None
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return None


def is_text_based_pdf(text: str) -> bool:
    """Quick heuristic for whether extracted text is useful."""
    if not text or len(text.strip()) < 100:
        return False
    keywords = [
        "load",
        "carrier",
        "pickup",
        "delivery",
        "date",
        "rate",
        "confirmation",
        "invoice",
        "number",
        "amount",
        "city",
        "state",
    ]
    text_lower = text.lower()
    keyword_count = sum(1 for keyword in keywords if keyword in text_lower)
    return keyword_count >= 3


def _gemini_json_to_legacy(extracted_json: Dict, warnings_prefix: str) -> Dict:
    """Convert Gemini JSON shape into the legacy payload expected by Node."""
    def parse_date(date_str: str) -> Optional[str]:
        if not date_str or date_str == "NOT_FOUND":
            return None
        try:
            from datetime import datetime
            dt = datetime.strptime(date_str, "%m/%d/%Y")
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return None

    def parse_location(loc_str: str) -> tuple:
        if not loc_str or loc_str == "NOT_FOUND":
            return (None, None)
        try:
            parts = loc_str.split(",")
            if len(parts) >= 2:
                return (parts[0].strip(), parts[1].strip())
        except Exception:
            pass
        return (None, None)

    origin_city, origin_state = parse_location(extracted_json.get("origin", "NOT_FOUND"))
    dest_city, dest_state = parse_location(extracted_json.get("destination", "NOT_FOUND"))

    return {
        "carrier_name": extracted_json.get("company_name") if extracted_json.get("company_name") != "NOT_FOUND" else None,
        "driver_name": extracted_json.get("driver_name") if extracted_json.get("driver_name") != "NOT_FOUND" else None,
        "load_number": extracted_json.get("reference_number") if extracted_json.get("reference_number") != "NOT_FOUND" else None,
        "carrier_pay": extracted_json.get("amount") if extracted_json.get("amount") != "NOT_FOUND" else None,
        "pickup_date": parse_date(extracted_json.get("pickup_date", "NOT_FOUND")),
        "delivery_date": parse_date(extracted_json.get("delivery_date", "NOT_FOUND")),
        "pickup_city": origin_city,
        "pickup_state": origin_state,
        "delivery_city": dest_city,
        "delivery_state": dest_state,
        "needs_review": False,
        "warnings": [warnings_prefix],
    }


def extract_with_gemini(raw_text: str) -> Optional[Dict]:
    """Use Gemini directly on extracted text."""
    try:
        import gemini_extract_key_fields as gekf

        model = gekf.setup_gemini()
        if not model:
            return None

        extracted = gekf.extract_data_with_gemini(model, raw_text)
        if not extracted or not isinstance(extracted, dict):
            return None

        return _gemini_json_to_legacy(extracted, "Extracted with Gemini")
    except Exception as e:
        print(f"Error in Gemini extraction: {e}")
        return None


def extract_with_google_vision(pdf_path: str) -> Optional[Dict]:
    """Use Google Vision OCR, then Gemini to extract structured fields."""
    try:
        from google.cloud import vision
        import google_vision_pipeline as gvp

        if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            keys_dir = Path(__file__).parent / "keys"
            if keys_dir.exists():
                json_files = sorted(keys_dir.glob("*.json"))
                if json_files:
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(json_files[0])
                    print(f"Using Google credentials from: {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")

        client = vision.ImageAnnotatorClient()
        raw_text = gvp.process_pdf_with_vision(Path(pdf_path), client)
        if not raw_text or not raw_text.strip():
            return None

        legacy = extract_with_gemini(raw_text)
        if legacy:
            legacy.setdefault("warnings", [])
            legacy["warnings"].append("OCR_text_source=google_vision_pipeline")
        return legacy
    except Exception as e:
        print(f"Error in Google Vision + Gemini flow: {e}")
        return None


def process_pdf(pdf_path: str) -> Dict:
    """
    Process a PDF file and extract load data using Google services only.
    Priority:
    1) Text extraction + Gemini
    2) Google Vision OCR + Gemini
    """
    try:
        if not os.path.exists(pdf_path):
            raise Exception(f"PDF file not found: {pdf_path}")

        extracted_text = extract_text_from_pdf(pdf_path)
        if extracted_text and is_text_based_pdf(extracted_text):
            gemini_result = extract_with_gemini(extracted_text)
            if gemini_result and not is_extraction_failed(gemini_result):
                return gemini_result

        vision_result = extract_with_google_vision(pdf_path)
        if vision_result and not is_extraction_failed(vision_result):
            return vision_result

        return get_safe_default()
    except Exception as e:
        print(f"Error processing PDF: {e}")
        return get_safe_default()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        result = process_pdf(pdf_path)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python pdf_ocr.py <pdf_path>")
