import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, MessageCircle, FileText, Send, Loader2, Download } from 'lucide-react';
import PDFUpload from './components/PDFUpload';
import ChatInterface from './components/ChatInterface';
import DocumentInfo from './components/DocumentInfo';

function App() {
  const [currentDocument, setCurrentDocument] = useState(null);
  const [chatSession, setChatSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDocumentUpload = async (documentData) => {
    setCurrentDocument(documentData);
    setChatSession(null);
    setError(null);
  };

  const handleURLUpload = async (url) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('http://localhost:5000/api/upload/url', { url });
      setCurrentDocument(response.data);
      setChatSession(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF from URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setChatSession(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            PDF Chat API
          </h1>
          <p className="text-lg text-gray-600">
            Intelligent conversational interface for PDF documents
          </p>
        </header>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          {!currentDocument ? (
            /* Upload Section */
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-center mb-8">
                <FileText className="mx-auto h-16 w-16 text-primary-500 mb-4" />
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Upload Your PDF Document
                </h2>
                <p className="text-gray-600">
                  Upload a PDF file or provide a URL to start chatting with your document
                </p>
              </div>

              <PDFUpload 
                onUpload={handleDocumentUpload}
                onURLUpload={handleURLUpload}
                isLoading={isLoading}
              />

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              {/* Test Document Section */}
              <div className="mt-8 p-6 bg-blue-50 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">
                  Try with Test Document
                </h3>
                <p className="text-blue-700 mb-4">
                  Test the system with the research paper: "Beyond Statistical Learning: Exact Learning Is Essential for General Intelligence"
                </p>
                <button
                  onClick={() => handleURLUpload('https://arxiv.org/pdf/2506.23908')}
                  disabled={isLoading}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Load Test Document
                </button>
              </div>
            </div>
          ) : (
            /* Chat Section */
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Document Info Sidebar */}
              <div className="lg:col-span-1">
                <DocumentInfo 
                  document={currentDocument}
                  onNewChat={handleNewChat}
                />
              </div>

              {/* Chat Interface */}
              <div className="lg:col-span-3">
                <ChatInterface
                  documentId={currentDocument.documentId}
                  sessionId={chatSession}
                  onSessionChange={setChatSession}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-500">
          <p>PDF Chat API - Built with MERN Stack</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

