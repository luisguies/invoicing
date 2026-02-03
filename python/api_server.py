#!/usr/bin/env python3
"""
Flask API server for PDF OCR processing.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from pdf_ocr import process_pdf
from extract_old_invoice import extract_old_invoice
import traceback

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "pdf-ocr"}), 200


@app.route('/extract-old-invoice', methods=['POST'])
def extract_old_invoice_endpoint():
    """
    Extract structured data from an old invoice PDF (Bill To, dates, Driver sections, load lines).
    Accepts: multipart/form-data with 'file', or JSON with 'file_path'.
    Returns: JSON with carrierName, invoiceNumber, invoiceDate, dueDate, groups (driver -> lines), etc.
    """
    try:
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No file provided"}), 400
            upload_dir = '/app/uploads'
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, file.filename)
            file.save(file_path)
            try:
                result = extract_old_invoice(file_path)
                if result:
                    return jsonify({"success": True, "data": result, "filename": file.filename}), 200
                return jsonify({"success": False, "error": "Could not extract invoice data from PDF"}), 400
            finally:
                pass
        elif request.is_json:
            data = request.get_json()
            file_path = data.get('file_path')
            if not file_path:
                return jsonify({"error": "file_path not provided"}), 400
            if not os.path.exists(file_path):
                return jsonify({"error": f"File not found: {file_path}"}), 404
            result = extract_old_invoice(file_path)
            if result:
                return jsonify({"success": True, "data": result, "filename": os.path.basename(file_path)}), 200
            return jsonify({"success": False, "error": "Could not extract invoice data from PDF"}), 400
        else:
            return jsonify({"error": "No file or file_path provided"}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/process-pdf', methods=['POST'])
def process_pdf_endpoint():
    """
    Process a PDF file and extract load data.
    
    Accepts:
    - JSON with 'file_path' field pointing to PDF file
    - OR multipart/form-data with 'file' field containing PDF file
    
    Returns:
    - JSON with extracted load data
    """
    try:
        # Check if file is uploaded directly
        if 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No file provided"}), 400
            
            # Save uploaded file temporarily
            upload_dir = '/app/uploads'
            os.makedirs(upload_dir, exist_ok=True)
            
            file_path = os.path.join(upload_dir, file.filename)
            file.save(file_path)
            
            try:
                # Process the PDF
                result = process_pdf(file_path)
                
                if result:
                    return jsonify({
                        "success": True,
                        "data": result,
                        "filename": file.filename
                    }), 200
                else:
                    return jsonify({
                        "success": False,
                        "error": "Could not extract data from PDF. The OCR service may have failed to parse the document or the document format is not supported."
                    }), 400
            except Exception as e:
                error_msg = str(e)
                traceback.print_exc()
                return jsonify({
                    "success": False,
                    "error": f"Error processing PDF: {error_msg}"
                }), 500
            finally:
                # Clean up temporary file if needed
                # (or keep it for later use)
                pass
                
        # Check if file path is provided in JSON
        elif request.is_json:
            data = request.get_json()
            file_path = data.get('file_path')
            
            if not file_path:
                return jsonify({"error": "file_path not provided"}), 400
            
            if not os.path.exists(file_path):
                return jsonify({"error": f"File not found: {file_path}"}), 404
            
            # Process the PDF
            result = process_pdf(file_path)
            
            if result:
                return jsonify({
                    "success": True,
                    "data": result,
                    "filename": os.path.basename(file_path)
                }), 200
            else:
                return jsonify({
                    "success": False,
                    "error": "Could not extract data from PDF"
                }), 400
        else:
            return jsonify({"error": "No file or file_path provided"}), 400
            
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": error_msg
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)

