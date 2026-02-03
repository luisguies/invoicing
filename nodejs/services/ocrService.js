const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-scripts:8000';

/**
 * Send PDF file to Python OCR service for processing
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Object>} Extracted load data
 */
async function processPDF(filePath) {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/process-pdf`, {
      file_path: filePath
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 second timeout for OCR processing
    });

    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.error || 'OCR processing failed');
    }
  } catch (error) {
    console.error('OCR Service Error (processPDF):', error.message);
    if (error.response) {
      const errorMsg = error.response.data?.error || error.response.data?.message || error.message;
      console.error('OCR Service Response:', error.response.data);
      throw new Error(`OCR service error: ${errorMsg}`);
    } else if (error.request) {
      console.error('OCR Service Request Error:', error.request);
      throw new Error('OCR service is not responding. Please check if the Python service is running.');
    } else {
      throw new Error(`OCR request error: ${error.message}`);
    }
  }
}

/**
 * Send PDF file buffer to Python OCR service for processing
 * @param {Buffer} fileBuffer - PDF file buffer
 * @param {string} filename - Original filename
 * @returns {Promise<Object>} Extracted load data
 */
async function processPDFBuffer(fileBuffer, filename) {
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: filename,
      contentType: 'application/pdf'
    });

    const response = await axios.post(`${PYTHON_SERVICE_URL}/process-pdf`, form, {
      headers: form.getHeaders(),
      timeout: 60000 // 60 second timeout for OCR processing
    });

    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.error || 'OCR processing failed');
    }
  } catch (error) {
    console.error('OCR Service Error (processPDFBuffer):', error.message);
    if (error.response) {
      const errorMsg = error.response.data?.error || error.response.data?.message || error.message;
      console.error('OCR Service Response:', error.response.data);
      throw new Error(`OCR service error: ${errorMsg}`);
    } else if (error.request) {
      console.error('OCR Service Request Error:', error.request);
      throw new Error('OCR service is not responding. Please check if the Python service is running.');
    } else {
      throw new Error(`OCR request error: ${error.message}`);
    }
  }
}

/**
 * Check if OCR service is healthy
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5000
    });
    return response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}

/**
 * Extract structured data from an old invoice PDF (carrier, dates, driver sections, load lines).
 * @param {string} filePath - Absolute path to PDF (must be readable by Python service, e.g. /app/uploads/old-invoices/xxx.pdf)
 * @returns {Promise<Object>} Extracted invoice data (carrierName, invoiceNumber, groups, etc.)
 */
async function extractOldInvoice(filePath) {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/extract-old-invoice`,
      { file_path: filePath },
      { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(response.data.error || 'Extract failed');
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

module.exports = {
  processPDF,
  processPDFBuffer,
  checkHealth,
  extractOldInvoice
};

