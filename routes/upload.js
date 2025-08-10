const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const Document = require('../models/Document');
const { upsertChunks } = require('../services/vector');
const { encoding_for_model } = require('@dqbd/tiktoken');
const { TextDecoder } = require('util');

const router = express.Router();

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to download PDF from URL
async function downloadPDF(url) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const filename = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}.pdf`;
    const filePath = path.join(__dirname, '..', 'uploads', filename);
    
    fs.writeFileSync(filePath, response.data);
    
    return {
      filename,
      filePath,
      fileSize: response.data.length
    };
  } catch (error) {
    throw new Error(`Failed to download PDF: ${error.message}`);
  }
}

// Helper function to extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    };
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

// Token-based chunking: 2000 tokens per chunk, 200 token overlap (pre-recursive version)
function chunkTextByTokens(rawText, opts = { chunkTokens: 2000, overlapTokens: 200, model: 'gpt-3.5-turbo' }) {
  const encoder = encoding_for_model(opts.model || 'gpt-3.5-turbo');
  try {
    const tokens = encoder.encode(rawText || '');
    const chunks = [];
    let start = 0;
    let chunkIndex = 0;
    const chunkSize = Math.max(1, opts.chunkTokens || 2000);
    const overlap = Math.max(0, opts.overlapTokens || 0);

    while (start < tokens.length) {
      const end = Math.min(start + chunkSize, tokens.length);
      const slice = tokens.slice(start, end);
      let decoded = encoder.decode(slice);
      let text;
      if (typeof decoded === 'string') {
        text = decoded;
      } else {
        try {
          text = new TextDecoder('utf-8').decode(decoded);
        } catch (_) {
          text = String(decoded);
        }
      }
      // Store text as an array of chunk strings under the `text` key
      chunks.push({ text: [text], page: null, chunkIndex });
      chunkIndex += 1;
      if (end === tokens.length) break;
      start = end - overlap;
      if (start < 0) start = 0;
    }

    return chunks;
  } finally {
    encoder.free();
  }
}


// POST /api/upload - Upload PDF file
router.post('/', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const documentId = uuidv4();
    const filePath = req.file.path;
    const fileSize = req.file.size;

    // Extract text from PDF
    const pdfData = await extractTextFromPDF(filePath);
    console.log(JSON.stringify(pdfData, null, 2));    
    // Create document record
    const document = new Document({
      documentId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath,
      fileSize,
      content: pdfData.text,
      pages: pdfData.pages,
      status: 'completed',
      embeddingStatus: 'pending',
      metadata: {
        title: pdfData.info?.Title || req.file.originalname,
        authors: pdfData.info?.Author ? [pdfData.info.Author] : [],
        keywords: []
      }
    });

    await document.save();

    // Embeddings + Qdrant upsert
    try {
      console.log('innn try================');
      const chunks = chunkTextByTokens(pdfData.text, { chunkTokens: 2000, overlapTokens: 200, model: 'gpt-3.5-turbo' });
      console.log(chunks);
      console.log('==============');
      const result = await upsertChunks(documentId, chunks, { filename: req.file.originalname });
      console.log(JSON.stringify(result, null, 2));

      document.chunkCount = result.upserted;
      document.lastEmbeddedAt = new Date();
      await document.save();
    } catch (e) {
      console.error('Embedding error:', e.message);
    }

    res.status(201).json({
      success: true,
      documentId,
      message: 'PDF uploaded and processed successfully',
      status: 'completed',
      pages: pdfData.pages,
      fileSize: fileSize,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      message: error.message
    });
  }
});

// POST /api/upload/url - Upload PDF from URL
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'URL must point to a PDF file' });
    }

    const documentId = uuidv4();

    // Download PDF from URL
    const fileData = await downloadPDF(url);
    
    // Extract text from PDF
    const pdfData = await extractTextFromPDF(fileData.filePath);
    
    // Create document record
    const document = new Document({
      documentId,
      filename: fileData.filename,
      originalName: path.basename(url),
      filePath: fileData.filePath,
      fileSize: fileData.fileSize,
      content: pdfData.text,
      pages: pdfData.pages,
      status: 'completed',
      embeddingStatus: 'pending',
      metadata: {
        title: pdfData.info?.Title || path.basename(url),
        authors: pdfData.info?.Author ? [pdfData.info.Author] : [],
        keywords: []
      }
    });

    await document.save();

    // Embeddings + Qdrant upsert
    try {
      const chunks = chunkTextByTokens(pdfData.text, { chunkTokens: 2000, overlapTokens: 200, model: 'gpt-3.5-turbo' });
      const result = await upsertChunks(documentId, chunks, { filename: path.basename(url), sourceUrl: url });
      document.chunkCount = result.upserted;
      document.lastEmbeddedAt = new Date();
      await document.save();
    } catch (e) {
      console.error('Embedding error (URL):', e.message);
    }

    res.status(201).json({
      success: true,
      documentId,
      message: 'PDF downloaded and processed successfully',
      status: 'completed',
      pages: pdfData.pages,
      fileSize: fileData.fileSize,
      filename: path.basename(url),
      sourceUrl: url
    });

  } catch (error) {
    console.error('URL upload error:', error);
    res.status(500).json({
      error: 'Failed to process PDF from URL',
      message: error.message
    });
  }
});

// GET /api/upload/:documentId - Get document status
router.get('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const document = await Document.findOne({ documentId });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      documentId: document.documentId,
      filename: document.originalName,
      status: document.status,
      pages: document.pages,
      fileSize: document.fileSize,
      uploadDate: document.uploadDate,
      metadata: document.metadata,
      chunkCount: document.chunkCount,
      lastEmbeddedAt: document.lastEmbeddedAt
    });

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      error: 'Failed to retrieve document',
      message: error.message
    });
  }
});

module.exports = router;

