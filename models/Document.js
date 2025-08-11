// Mongoose model to persist uploaded document metadata and extracted content
// Fields:
// - documentId: stable UUID to reference this document externally
// - filename/originalName: stored + original upload names
// - filePath/size: storage location and size in bytes
// - content: extracted text (for fallback/search)
// - pages: number of pages extracted
// - uploadDate/status: ingestion lifecycle
// - metadata: optional PDF metadata
const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true,
    unique: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  pages: {
    type: Number,
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  // (embedding fields removed in revert)
  metadata: {
    title: String,
    authors: [String],
    abstract: String,
    keywords: [String]
  }
}, {
  timestamps: true
});

// Virtual getter to ensure uploadDate is always returned as ISO string
documentSchema.virtual('uploadDateISO').get(function() {
  return this.uploadDate ? this.uploadDate.toISOString() : null;
});

// Ensure virtual fields are included when converting to JSON
documentSchema.set('toJSON', { virtuals: true });
documentSchema.set('toObject', { virtuals: true });

// Index for better query performance
documentSchema.index({ documentId: 1 });
documentSchema.index({ uploadDate: -1 });

module.exports = mongoose.model('Document', documentSchema);

