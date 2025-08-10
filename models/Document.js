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
    default: Date.now
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

// Index for better query performance
documentSchema.index({ documentId: 1 });
documentSchema.index({ uploadDate: -1 });

module.exports = mongoose.model('Document', documentSchema);

