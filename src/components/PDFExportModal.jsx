import { useState, useEffect, useRef, useCallback } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import SongPDFDocument from './SongPDFDocument';

const PAGE_SIZE_KEY = 'strumkey-pdf-export-page-size';

// Use largest page size (A4) proportions for preview so one full page fits with no cropping
const PREVIEW_ASPECT_RATIO = 595.28 / 841.89; // A4 portrait

function sanitizeFilename(str) {
  if (!str || typeof str !== 'string') return 'song';
  return str
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-.\u00C0-\u024F]/g, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'song';
}

export default function PDFExportModal({
  song,
  chords = [],
  chordDiagrams = [],
  instrument = 'ukulele',
  tuning = 'ukulele_standard',
  defaultChordMode = 'inline',
  isOpen,
  onClose,
}) {
  const [pageSize, setPageSize] = useState(() => {
    try {
      return localStorage.getItem(PAGE_SIZE_KEY) || 'A4';
    } catch {
      return 'A4';
    }
  });
  const [chordDisplayMode, setChordDisplayMode] = useState(defaultChordMode);
  const [chordDiagramPlacement, setChordDiagramPlacement] = useState('top');
  const [fitToOnePage, setFitToOnePage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    setChordDisplayMode(defaultChordMode);
  }, [defaultChordMode, isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_SIZE_KEY, pageSize);
    } catch (_) {}
  }, [pageSize]);

  const handleDownload = useCallback(async () => {
    if (!song) return;
    setDownloading(true);
    setError(null);
    try {
      const doc = (
        <SongPDFDocument
          song={song}
          chords={chords}
          chordDiagrams={chordDiagrams}
          pageSize={pageSize}
          chordDisplayMode={chordDisplayMode}
          chordDiagramPlacement={chordDiagramPlacement}
          fitToOnePage={fitToOnePage}
          lyricsFontSize={fitToOnePage ? 9 : 11}
          diagramScale={fitToOnePage ? 0.45 : 0.5}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const title = sanitizeFilename(song.title);
      const artist = sanitizeFilename(song.artist || '');
      const filename = artist ? `${title}-${artist}.pdf` : `${title}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      onClose();
    } catch (err) {
      console.error('PDF export failed:', err);
      setError(err?.message || 'Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [
    song,
    chords,
    chordDiagrams,
    pageSize,
    chordDisplayMode,
    chordDiagramPlacement,
    fitToOnePage,
    onClose,
  ]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      const firstFocusable = modalRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (firstFocusable) firstFocusable.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const docElement = (
    <SongPDFDocument
      song={song}
      chords={chords}
      chordDiagrams={chordDiagrams}
      pageSize={pageSize}
      chordDisplayMode={chordDisplayMode}
      chordDiagramPlacement={chordDiagramPlacement}
      fitToOnePage={fitToOnePage}
      lyricsFontSize={fitToOnePage ? 9 : 11}
      diagramScale={fitToOnePage ? 0.45 : 0.5}
    />
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl flex flex-col max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 id="pdf-export-title" className="text-xl font-bold">
            Export as PDF
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
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
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <div className="flex-1 min-h-0 md:w-[65%] flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-100 overflow-auto">
            <div
              className="shrink-0 bg-gray-100"
              style={{
                aspectRatio: PREVIEW_ASPECT_RATIO,
                width: `min(100%, ${70 * PREVIEW_ASPECT_RATIO}vh)`,
                height: 'auto',
              }}
            >
              <PDFViewer
                width="100%"
                height="100%"
                style={{ width: '100%', height: '100%', display: 'block' }}
                showToolbar={false}
              >
                {docElement}
              </PDFViewer>
            </div>
          </div>

          <div className="w-full md:w-[35%] p-4 overflow-y-auto flex-shrink-0">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Page size
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Choose paper size for printing or tablet size for on-screen viewing.
                </p>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  aria-label="Page size"
                >
                  <option value="A4">A4 (8.3" × 11.7")</option>
                  <option value="LETTER">Letter (8.5" × 11")</option>
                  <option value="TABLET_IPAD">Tablet - iPad (4:3)</option>
                  <option value="TABLET_ANDROID">Tablet - Android (16:10)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chord display mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chordDisplayMode"
                      value="inline"
                      checked={chordDisplayMode === 'inline'}
                      onChange={() => setChordDisplayMode('inline')}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">Inline chords – chords in brackets within the lyrics</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chordDisplayMode"
                      value="above"
                      checked={chordDisplayMode === 'above'}
                      onChange={() => setChordDisplayMode('above')}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">Chords above lyrics – chord line above each lyric line</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chord diagrams
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chordDiagramPlacement"
                      value="top"
                      checked={chordDiagramPlacement === 'top'}
                      onChange={() => setChordDiagramPlacement('top')}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">Top of page</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chordDiagramPlacement"
                      value="side"
                      checked={chordDiagramPlacement === 'side'}
                      onChange={() => setChordDiagramPlacement('side')}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">Side of page</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chordDiagramPlacement"
                      value="none"
                      checked={chordDiagramPlacement === 'none'}
                      onChange={() => setChordDiagramPlacement('none')}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">None</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fitToOnePage}
                    onChange={(e) => setFitToOnePage(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Fit to one page</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Automatically adjust font size to fit entire song on one page.
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
