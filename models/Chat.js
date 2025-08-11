// Mongoose model to store chat sessions per document
// Structure:
// - sessionId: UUID to track a conversation thread
// - documentId: reference to the ingested document
// - messages: array of message objects with role, content, and optional sources
// - timestamps: createdAt/updatedAt maintained for sorting and housekeeping
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sources: [{
    page: Number,
    text: String,
    confidence: Number
  }]
});

const chatSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  documentId: {
    type: String,
    required: true
  },
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
chatSchema.index({ sessionId: 1 });
chatSchema.index({ documentId: 1 });
chatSchema.index({ createdAt: -1 });

// Update the updatedAt field before saving
chatSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Chat', chatSchema);

