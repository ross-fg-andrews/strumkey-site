/**
 * OCR Service Utility
 * Uses Tesseract.js for client-side OCR on scanned PDFs
 * This is optional and can be lazy-loaded due to large bundle size
 */

/**
 * Initialize Tesseract.js OCR
 * Lazy loads the library to reduce initial bundle size
 * @returns {Promise<Object>} Tesseract instance
 */
async function initTesseract() {
  try {
    // Dynamic import to lazy load tesseract.js
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    return worker;
  } catch (error) {
    throw new Error('Tesseract.js is not installed. Please install it with: npm install tesseract.js');
  }
}

/**
 * Extract text from an image using OCR
 * @param {HTMLImageElement|ImageData|string} image - Image element, ImageData, or image URL
 * @param {Function} onProgress - Optional progress callback (progress) => void
 * @returns {Promise<string>} Extracted text
 */
export async function extractTextFromImage(image, onProgress) {
  try {
    const worker = await initTesseract();
    
    // Perform OCR with progress tracking
    const { data: { text } } = await worker.recognize(image, {
      logger: onProgress ? (m) => {
        if (m.status === 'recognizing text') {
          onProgress(m.progress);
        }
      } : undefined,
    });
    
    await worker.terminate();
    return text;
  } catch (error) {
    console.error('Error performing OCR:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Convert PDF page to image for OCR
 * @param {File} pdfFile - PDF file
 * @param {number} pageNum - Page number (1-indexed)
 * @returns {Promise<HTMLImageElement>} Image element
 */
export async function pdfPageToImage(pdfFile, pageNum = 1) {
  try {
    // Dynamic import of pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker if not already set
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    // Convert canvas to image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = canvas.toDataURL('image/png');
    });
  } catch (error) {
    console.error('Error converting PDF page to image:', error);
    throw new Error(`Failed to convert PDF page to image: ${error.message}`);
  }
}

/**
 * Extract text from scanned PDF using OCR
 * @param {File} pdfFile - PDF file
 * @param {Function} onProgress - Optional progress callback (progress) => void
 * @returns {Promise<string>} Extracted text
 */
export async function extractTextFromScannedPDF(pdfFile, onProgress) {
  try {
    // Dynamic import of pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker if not already set
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const totalPages = pdf.numPages;
    
    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress({ 
          page: pageNum, 
          totalPages, 
          status: 'converting',
          progress: (pageNum - 1) / totalPages 
        });
      }
      
      // Convert page to image
      const image = await pdfPageToImage(pdfFile, pageNum);
      
      if (onProgress) {
        onProgress({ 
          page: pageNum, 
          totalPages, 
          status: 'ocr',
          progress: (pageNum - 1) / totalPages 
        });
      }
      
      // Perform OCR on image
      const pageText = await extractTextFromImage(image, (ocrProgress) => {
        if (onProgress) {
          onProgress({ 
            page: pageNum, 
            totalPages, 
            status: 'ocr',
            progress: ((pageNum - 1) + ocrProgress) / totalPages 
          });
        }
      });
      
      fullText += pageText + '\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from scanned PDF:', error);
    throw new Error(`Failed to extract text from scanned PDF: ${error.message}`);
  }
}

