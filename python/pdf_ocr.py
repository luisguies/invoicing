#!/usr/bin/env python3
"""
PDF OCR service using OpenAI Vision API to extract load data from PDF files.
"""

import os
import json
from pdf2image import convert_from_path
from openai import OpenAI
from typing import Dict, Optional, List
import base64
from io import BytesIO
import pdfplumber

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# JSON Schema for structured output
RATE_CON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["carrier", "load_number", "pickup", "delivery", "rate_total", "needs_review", "warnings"],
    "properties": {
        "carrier": {"type": ["string", "null"]},
        "load_number": {"type": ["string", "null"]},
        "pickup": {
            "type": "object",
            "additionalProperties": False,
            "required": ["city", "state", "date"],
            "properties": {
                "city": {"type": ["string", "null"]},
                "state": {"type": ["string", "null"]},
                "date": {"type": ["string", "null"], "description": "YYYY-MM-DD"}
            }
        },
        "delivery": {
            "type": "object",
            "additionalProperties": False,
            "required": ["city", "state", "date"],
            "properties": {
                "city": {"type": ["string", "null"]},
                "state": {"type": ["string", "null"]},
                "date": {"type": ["string", "null"], "description": "YYYY-MM-DD"}
            }
        },
        "rate_total": {"type": ["number", "null"]},
        "needs_review": {"type": "boolean"},
        "warnings": {"type": "array", "items": {"type": "string"}}
    }
}


def pdf_to_images(pdf_path: str) -> List:
    """
    Convert PDF pages to images.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        List of PIL Image objects
    """
    try:
        images = convert_from_path(pdf_path)
        return images
    except Exception as e:
        raise Exception(f"Error converting PDF to images: {str(e)}")


def image_to_base64(image) -> str:
    """
    Convert PIL Image to base64 string.
    
    Args:
        image: PIL Image object
        
    Returns:
        Base64 encoded string
    """
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return img_str


def extract_text_from_pdf(pdf_path: str) -> Optional[str]:
    """
    Extract text from a PDF file.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Extracted text as string, or None if extraction fails
    """
    try:
        text_content = []
        with pdfplumber.open(pdf_path) as pdf:
            # Extract text from all pages
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_content.append(text)
        
        if text_content:
            return "\n".join(text_content)
        return None
    except Exception as e:
        print(f"Error extracting text from PDF: {str(e)}")
        return None


def is_text_based_pdf(text: str) -> bool:
    """
    Determine if a PDF is text-based by checking if we got meaningful text.
    
    Args:
        text: Extracted text from PDF
        
    Returns:
        True if PDF appears to be text-based, False otherwise
    """
    if not text:
        return False
    
    # Check if we have a reasonable amount of text (at least 100 characters)
    # and it contains some recognizable patterns
    if len(text.strip()) < 100:
        return False
    
    # Check for common invoice/load document keywords
    keywords = ['load', 'carrier', 'pickup', 'delivery', 'date', 'rate', 'confirmation', 
                'invoice', 'number', 'pay', 'amount', 'city', 'state']
    text_lower = text.lower()
    keyword_count = sum(1 for keyword in keywords if keyword in text_lower)
    
    # If we found at least 3 keywords, it's likely text-based
    return keyword_count >= 3


def get_safe_default() -> Dict:
    """
    Return a safe default object with needs_review = true when structured output fails.
    
    Returns:
        Dictionary in legacy format with all fields set to None and needs_review = True
    """
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
        "warnings": ["Structured output failed"]
    }


def convert_to_legacy_format(data: Dict) -> Dict:
    """
    Convert the new schema format to the legacy format expected by the rest of the system.
    
    Args:
        data: Data in new schema format (carrier, load_number, pickup, delivery, rate_total, etc.)
        
    Returns:
        Dictionary in legacy format (carrier_name, driver_name, load_number, carrier_pay, etc.)
    """
    try:
        # Handle both new schema and legacy format
        if "carrier_name" in data:
            # Already in legacy format
            return data
        
        legacy = {
            "carrier_name": data.get("carrier"),
            "driver_name": None,  # Not in new schema, will be extracted separately if needed
            "load_number": data.get("load_number"),
            "carrier_pay": data.get("rate_total"),
            "pickup_date": data.get("pickup", {}).get("date") if isinstance(data.get("pickup"), dict) else None,
            "delivery_date": data.get("delivery", {}).get("date") if isinstance(data.get("delivery"), dict) else None,
            "pickup_city": data.get("pickup", {}).get("city") if isinstance(data.get("pickup"), dict) else None,
            "pickup_state": data.get("pickup", {}).get("state") if isinstance(data.get("pickup"), dict) else None,
            "delivery_city": data.get("delivery", {}).get("city") if isinstance(data.get("delivery"), dict) else None,
            "delivery_state": data.get("delivery", {}).get("state") if isinstance(data.get("delivery"), dict) else None,
            "needs_review": data.get("needs_review", False),
            "warnings": data.get("warnings", [])
        }
        return legacy
    except Exception as e:
        print(f"Error converting to legacy format: {str(e)}")
        return data  # Return original if conversion fails


def extract_load_data_from_text(text: str) -> Dict:
    """
    Use OpenAI Responses API to extract load data from PDF text.
    
    Args:
        text: Extracted text from PDF
        
    Returns:
        Dictionary with extracted load data (always returns a valid dict)
    """
    try:
        # Prepare the prompt for extraction
        prompt = """Extract the following information from this rate confirmation/load document text:
- carrier: The name of the carrier
- load_number: The load number or reference
- pickup: First pickup location (city, state) and date (YYYY-MM-DD)
- delivery: Final delivery location (city, state) and date (YYYY-MM-DD)
- rate_total: The total rate or carrier pay amount (as a number)
- needs_review: Set to true if the document is unclear or data seems incorrect
- warnings: Array of any warnings or issues found (e.g., "Multiple pickups found, using first", "Date format unclear")

If there are multiple pickups, use only the FIRST pickup date and location.
If there are multiple deliveries, use only the FINAL delivery date and location.

Document text:
""" + text[:8000]  # Limit text to avoid token limits

        # Get model from environment variable, default to gpt-5-mini
        model = os.getenv('OPENAI_MODEL', 'gpt-5-mini')
        
        # Validate API key
        if not os.getenv('OPENAI_API_KEY'):
            print("Warning: OPENAI_API_KEY environment variable is not set")
            return get_safe_default()
        
        # Call OpenAI Responses API with structured outputs
        print(f"Calling OpenAI Responses API with model: {model} (structured outputs)")
        
        try:
            response = client.responses.create(
                model=model,
                input=prompt,
                text={
                "format": {
                    "type": "json_schema",
                    "name": "ratecon_extract",
                    "json_schema": {
                        "strict": True,
                        "schema": RATE_CON_SCHEMA
                    }
                }
            },
            max_output_tokens=500
            )
            
            # Read output ONLY from response.output_parsed
            if hasattr(response, 'output_parsed') and response.output_parsed:
                print("Successfully extracted structured output from OpenAI Responses API")
                return convert_to_legacy_format(response.output_parsed)
            else:
                print("Warning: response.output_parsed is empty or missing")
                return get_safe_default()
                
        except Exception as api_error:
            print(f"OpenAI Responses API call failed: {str(api_error)}")
            import traceback
            traceback.print_exc()
            return get_safe_default()
            
    except Exception as e:
        print(f"Error extracting data from text: {str(e)}")
        import traceback
        traceback.print_exc()
        return get_safe_default()


def extract_load_data_from_image(image) -> Dict:
    """
    Use OpenAI Responses API to extract load data from a PDF page image.
    
    Args:
        image: PIL Image object
        
    Returns:
        Dictionary with extracted load data (always returns a valid dict)
    """
    try:
        # Convert image to base64
        base64_image = image_to_base64(image)
        
        # Prepare the prompt for extraction
        prompt = """Extract the following information from this rate confirmation/load document:
- carrier: The name of the carrier
- load_number: The load number or reference
- pickup: First pickup location (city, state) and date (YYYY-MM-DD)
- delivery: Final delivery location (city, state) and date (YYYY-MM-DD)
- rate_total: The total rate or carrier pay amount (as a number)
- needs_review: Set to true if the document is unclear or data seems incorrect
- warnings: Array of any warnings or issues found (e.g., "Multiple pickups found, using first", "Date format unclear")

If there are multiple pickups, use only the FIRST pickup date and location.
If there are multiple deliveries, use only the FINAL delivery date and location."""

        # Get model from environment variable, default to gpt-5-mini
        model = os.getenv('OPENAI_MODEL', 'gpt-5-mini')
        
        # Validate API key
        if not os.getenv('OPENAI_API_KEY'):
            print("Warning: OPENAI_API_KEY environment variable is not set")
            return get_safe_default()
        
        # Call OpenAI Responses API with structured outputs and multimodal input
        print(f"Calling OpenAI Responses API with model: {model} (structured outputs, multimodal)")
        
        try:
            response = client.responses.create(
                model=model,
                input=[
                    {
                        "type": "input_text",
                        "text": prompt
                    },
                    {
                        "type": "input_image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": base64_image
                        }
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "ratecon_extract",
                        "json_schema": {
                            "strict": True,
                            "schema": RATE_CON_SCHEMA
                        }
                    }
                },
                max_output_tokens=500
            )
            
            # Read output ONLY from response.output_parsed
            if hasattr(response, 'output_parsed') and response.output_parsed:
                print("Successfully extracted structured output from OpenAI Responses API")
                return convert_to_legacy_format(response.output_parsed)
            else:
                print("Warning: response.output_parsed is empty or missing")
                return get_safe_default()
                
        except Exception as api_error:
            print(f"OpenAI Responses API call failed: {str(api_error)}")
            import traceback
            traceback.print_exc()
            return get_safe_default()
            
    except Exception as e:
        print(f"Error extracting data from image: {str(e)}")
        import traceback
        traceback.print_exc()
        return get_safe_default()


def process_pdf(pdf_path: str) -> Dict:
    """
    Process a PDF file and extract load data.
    First tries text extraction, then falls back to OCR if needed.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dictionary with extracted load data (always returns a valid dict)
    """
    try:
        # Validate file exists
        if not os.path.exists(pdf_path):
            raise Exception(f"PDF file not found: {pdf_path}")
        
        print(f"Processing PDF: {pdf_path}")
        
        # Step 1: Try to extract text from PDF
        print("Attempting text extraction...")
        extracted_text = extract_text_from_pdf(pdf_path)
        
        # Step 2: Check if PDF is text-based
        if extracted_text and is_text_based_pdf(extracted_text):
            print("PDF appears to be text-based. Using text extraction...")
            extracted_data = extract_load_data_from_text(extracted_text)
            print(f"Successfully extracted data from text: {list(extracted_data.keys())}")
            return extracted_data
        else:
            print("PDF appears to be image-based or text extraction failed. Using OCR...")
        
        # Step 3: Fall back to image-based OCR
        print("Converting PDF to images for OCR...")
        images = pdf_to_images(pdf_path)
        
        if not images:
            print("Warning: No pages found in PDF")
            return get_safe_default()
        
        print(f"PDF converted to {len(images)} page(s). Processing first page with OCR...")
        
        # Process the first page with OCR
        extracted_data = extract_load_data_from_image(images[0])
        print(f"Successfully extracted data from image: {list(extracted_data.keys())}")
        
        return extracted_data
        
    except Exception as e:
        print(f"Error processing PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        return get_safe_default()


if __name__ == "__main__":
    # Test the OCR service
    import sys
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
        result = process_pdf(pdf_path)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python pdf_ocr.py <pdf_path>")

