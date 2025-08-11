import React from 'react';
import { FileText, Calendar, Hash, MessageCircle, Plus } from 'lucide-react';

const DocumentInfo = ({ document, onNewChat }) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-4">
        <FileText className="h-6 w-6 text-primary-500 mr-2" />
        <h2 className="text-lg font-semibold text-gray-900">Document Info</h2>
      </div>

      <div className="space-y-4">
        {/* Document Name */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Document Name</h3>
          <p className="text-sm text-gray-900 break-words">{document.filename}</p>
        </div>

        {/* Document ID */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Document ID</h3>
          <div className="flex items-center">
            <Hash className="h-4 w-4 text-gray-400 mr-1" />
            <p className="text-xs text-gray-500 font-mono break-all">{document.documentId}</p>
          </div>
        </div>

        {/* File Size */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">File Size</h3>
          <p className="text-sm text-gray-900">{formatFileSize(document.fileSize)}</p>
        </div>

        {/* Pages */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Pages</h3>
          <p className="text-sm text-gray-900">{document.pages} pages</p>
        </div>

        {/* Upload Date */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Upload Date</h3>
          <div className="flex items-center">
            <Calendar className="h-4 w-4 text-gray-400 mr-1" />
            <p className="text-sm text-gray-900">{formatDate(document.uploadDate)}</p>
          </div>
        </div>

        {/* Status */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">Status</h3>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            document.status === 'completed' 
              ? 'bg-green-100 text-green-800' 
              : document.status === 'processing'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
          </span>
        </div>

        {/* Metadata */}
        {document.metadata && (
          <>
            {document.metadata.title && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Title</h3>
                <p className="text-sm text-gray-900">{document.metadata.title}</p>
              </div>
            )}
            
            {document.metadata.authors && document.metadata.authors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Authors</h3>
                <p className="text-sm text-gray-900">{document.metadata.authors.join(', ')}</p>
              </div>
            )}
          </>
        )}

        {/* New Chat Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </button>
        </div>

        {/* Quick Actions */}
        {/* <div className="pt-2">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Questions</h3>
          <div className="space-y-2">
            <button
              onClick={() => {
                // This would trigger a predefined question
                console.log('Quick question clicked');
              }}
              className="w-full text-left text-xs text-gray-600 hover:text-primary-600 p-2 rounded hover:bg-gray-50"
            >
              Who wrote this paper?
            </button>
            <button
              onClick={() => {
                console.log('Quick question clicked');
              }}
              className="w-full text-left text-xs text-gray-600 hover:text-primary-600 p-2 rounded hover:bg-gray-50"
            >
              What are the main findings?
            </button>
            <button
              onClick={() => {
                console.log('Quick question clicked');
              }}
              className="w-full text-left text-xs text-gray-600 hover:text-primary-600 p-2 rounded hover:bg-gray-50"
            >
              Summarize the methodology
            </button>
          </div>
        </div> */}
      </div>
    </div>
  );
};

export default DocumentInfo;

