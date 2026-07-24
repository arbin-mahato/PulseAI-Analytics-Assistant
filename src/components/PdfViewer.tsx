'use client';

import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// React-PDF bundles its own pdfjs-dist dependency (seen in package-lock: 5.4.296). We must use a worker of SAME version.
// Force workerSrc to that version explicitly to avoid mismatch errors.
if (typeof window !== 'undefined') {
  // Now versions are aligned (package.json pins pdfjs-dist). Use dynamic version.
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.js`;
}

interface PdfViewerProps {
  file: string;
  onClose?: () => void;
}

export default function PdfViewer({ file, onClose }: PdfViewerProps) {
  const THEME_COLOR = '#0C499C';
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('📄 PdfViewer mounted with file:', file);
    setLoading(true);
    setError(null);
  }, [file]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
    setLoading(false);
    setError(null);
    console.log('✅ PDF loaded successfully:', numPages, 'pages');
  }

  function onDocumentLoadError(error: Error) {
    console.error('❌ PDF load error:', error);
    const msg = error.message || 'Failed to load PDF';
    // If mismatch error still occurs, force reapply correct worker version and retry once.
  // Version mismatch should not occur now; if it does, advise hard reload.
    setError(msg);
    setLoading(false);
  }

  function changePage(offset: number) {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  function zoomIn() {
    setScale(prev => Math.min(prev + 0.25, 2.5));
  }

  function zoomOut() {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  }

  function resetZoom() {
    setScale(1.0);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-slate-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">PDF Document Viewer</h3>
              <p className="text-xs text-slate-500">
                {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : 'Loading...'}
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-all focus:outline-none"
            aria-label="Close PDF viewer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 p-3 border-b border-gray-200 bg-slate-50">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={previousPage}
              disabled={pageNumber <= 1}
              className="px-3 py-2 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none hover:opacity-90"
              style={{ border: `1px solid ${THEME_COLOR}`, color: THEME_COLOR }}
              aria-label="Previous page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <button
              onClick={nextPage}
              disabled={pageNumber >= numPages}
              className="px-3 py-2 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none hover:opacity-90"
              style={{ border: `1px solid ${THEME_COLOR}`, color: THEME_COLOR }}
              aria-label="Next page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              disabled={scale <= 0.5}
              className="px-3 py-2 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none hover:opacity-90"
              style={{ border: `1px solid ${THEME_COLOR}`, color: THEME_COLOR }}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="8" y1="11" x2="14" y2="11"></line>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <span className="text-sm font-medium min-w-[60px] text-center" style={{ color: THEME_COLOR }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={scale >= 2.5}
              className="px-3 py-2 bg-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none hover:opacity-90"
              style={{ border: `1px solid ${THEME_COLOR}`, color: THEME_COLOR }}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button
              onClick={resetZoom}
              className="px-3 py-2 bg-white rounded-lg transition-all focus:outline-none hover:opacity-90 text-sm"
              style={{ border: `1px solid ${THEME_COLOR}`, color: THEME_COLOR }}
              aria-label="Reset zoom"
              title="Reset zoom to 100%"
            >
              Reset
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-slate-100 p-4 rounded-b-xl">
          <div className="flex justify-center items-center min-h-full">
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex flex-col items-center justify-center p-12">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0C499C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>
                  </div>
                  <p className="mt-4 text-slate-600 font-medium">Loading PDF...</p>
                  <p className="text-sm text-slate-400 mt-1">Please wait</p>
                </div>
              }
              error={
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow-md border border-red-200">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <p className="text-red-600 font-bold text-lg">Failed to Load PDF</p>
                  <p className="text-sm text-slate-600 mt-2 text-center max-w-md">
                    {error || 'The PDF file could not be loaded. Please check the file path or try again.'}
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                  >
                    Close
                  </button>
                </div>
              }
            >
              {!loading && !error && (
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-2xl rounded-lg"
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 border-t-blue-600"></div>
                    </div>
                  }
                />
              )}
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
}
