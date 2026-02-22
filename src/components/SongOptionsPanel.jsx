import { FileArrowDown, Users, PencilSimple, Trash } from '@phosphor-icons/react';
import { XIcon } from '../utils/icons';

export default function SongOptionsPanel({ songActions, isOpen, onClose }) {
  if (!songActions) return null;

  const {
    chordMode,
    handleChordModeChange,
    handleExportPdfClick,
    handleShareClick,
    handleEditClick,
    handleDeleteClick,
    hasChords,
    isCreator,
    canEdit,
  } = songActions;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-[45] transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] max-[320px]:w-full bg-gray-50 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="font-['Alice',_serif] font-normal text-[28px] text-gray-900">
              Song Options
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Display - Chord view (only when song has chords) */}
            {hasChords && (
              <section className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Display
                </h3>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="chordMode"
                      value="inline"
                      checked={chordMode === 'inline'}
                      onChange={() => handleChordModeChange('inline')}
                      className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-gray-900">Inline Chords</span>
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="radio"
                      name="chordMode"
                      value="above"
                      checked={chordMode === 'above'}
                      onChange={() => handleChordModeChange('above')}
                      className="h-4 w-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-gray-900">Chords Above</span>
                  </label>
                </div>
              </section>
            )}

            {/* Export & Share */}
            <section className="mb-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Export & Share
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    handleExportPdfClick?.();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <FileArrowDown weight="light" className="h-5 w-5 text-gray-500" />
                  <span>Export as PDF</span>
                </button>
                {isCreator && (
                  <button
                    onClick={() => {
                      handleShareClick();
                      onClose();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Users weight="light" className="h-5 w-5 text-gray-500" />
                    <span>Share with Group</span>
                  </button>
                )}
              </div>
            </section>

            {/* Edit */}
            {canEdit && (
              <section className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Edit
                </h3>
                <button
                  onClick={() => {
                    handleEditClick();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <PencilSimple weight="light" className="h-5 w-5 text-gray-500" />
                  <span>Edit</span>
                </button>
              </section>
            )}

            {/* Delete */}
            {isCreator && (
              <section>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Delete
                </h3>
                <button
                  onClick={() => {
                    handleDeleteClick();
                    onClose();
                  }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash weight="light" className="h-5 w-5" />
                  <span>Delete</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
