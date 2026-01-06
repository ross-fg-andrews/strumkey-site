import { useState, useRef, useCallback } from 'react';
import { extractTextFromPDF, isTextBasedPDF } from '../utils/pdf-parser';
import { extractTextFromScannedPDF } from '../utils/ocr-service';
import { parseSongFromText } from '../utils/song-parser';

/**
 * PDF Import Modal Component
 * Handles PDF file upload, parsing, and returns parsed song data
 */
export default function PDFImportModal({ isOpen, onClose, onImport }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFile = useCallback(async (file) => {
    // Validate file
    if (!file) return;
    
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.');
      return;
    }
    
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    setProgress({ status: 'analyzing', message: 'Analyzing PDF...' });
    
    try {
      // Check if PDF is text-based or scanned
      const textBased = await isTextBasedPDF(file);
      
      let extractedText;
      
      if (textBased) {
        setProgress({ status: 'extracting', message: 'Extracting text from PDF...' });
        extractedText = await extractTextFromPDF(file);
      } else {
        setProgress({ status: 'ocr', message: 'PDF appears to be scanned. Performing OCR (this may take a while)...' });
        extractedText = await extractTextFromScannedPDF(file, (progressData) => {
          if (progressData.status === 'ocr') {
            setProgress({
              status: 'ocr',
              message: `Processing page ${progressData.page} of ${progressData.totalPages}...`,
              progress: progressData.progress,
            });
          } else {
            setProgress({
              status: progressData.status,
              message: `Converting page ${progressData.page} of ${progressData.totalPages}...`,
              progress: progressData.progress,
            });
          }
        });
      }
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text could be extracted from the PDF.');
      }
      
      setProgress({ status: 'parsing', message: 'Parsing song data...' });
      
      // Parse the extracted text
      const parsedData = parseSongFromText(extractedText);
      
      if (!parsedData.title && !parsedData.lyricsText) {
        throw new Error('Could not extract song data from PDF. Please ensure the PDF contains lyrics and chords.');
      }
      
      // Return parsed data to parent
      onImport(parsedData);
      
      // Close modal
      onClose();
    } catch (err) {
      console.error('Error importing PDF:', err);
      setError(err.message || 'Failed to import PDF. Please try again.');
      setProgress(null);
    } finally {
      setIsProcessing(false);
    }
  }, [onImport, onClose]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Import Song from PDF</h2>
          {!isProcessing && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Supported formats: PDF files (text-based or scanned)
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Maximum file size: {MAX_FILE_SIZE / (1024 * 1024)}MB
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />

        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragging 
              ? 'border-primary-500 bg-primary-50' 
              : isProcessing 
                ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }
          `}
        >
          {isProcessing ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{progress?.message || 'Processing...'}</p>
                {progress?.progress !== undefined && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress.progress * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-gray-700 font-medium">
                Drag and drop PDF here
              </p>
              <p className="text-gray-500 text-sm">
                or click to select file
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

