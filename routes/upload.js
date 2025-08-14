// Upload routes: handles PDF ingestion from file and URL, extraction, chunking, and vector upsert
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

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload and process a PDF file
 *     description: |
 *       Uploads a PDF file, extracts text content, chunks it into 2000-token segments,
 *       generates embeddings, and stores them in the vector database for RAG.
 *       
 *       The file is processed asynchronously and stored in the uploads directory.
 *       Text extraction uses pdf-parse library and chunking uses tiktoken tokenization.
 *       
 *       **Supported file types:** PDF only
 *       **Maximum file size:** 10MB
 *       **Chunking strategy:** 2000 tokens per chunk with 200 token overlap
 *       
 *     tags: [Upload]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: pdf
 *         type: file
 *         required: true
 *         description: PDF file to upload and process
 *     responses:
 *       201:
 *         description: PDF successfully uploaded and processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the uploaded document
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 message:
 *                   type: string
 *                   example: "PDF uploaded and processed successfully"
 *                 status:
 *                   type: string
 *                   enum: [processing, completed, failed]
 *                   example: "completed"
 *                 pages:
 *                   type: integer
 *                   description: Number of pages extracted from the PDF
 *                   example: 15
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                   example: 2048576
 *                 filename:
 *                   type: string
 *                   description: Original filename
 *                   example: "research_paper.pdf"
 *                 uploadDate:
 *                   type: string
 *                   format: date-time
 *                   description: ISO timestamp of upload
 *                   example: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Bad request - no file provided or invalid file type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No PDF file provided"
 *       500:
 *         description: Internal server error during processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to process PDF"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl -X POST http://localhost:5000/api/upload \
 *             -F "pdf=@document.pdf" \
 *             -H "Accept: application/json"
 *       - lang: JavaScript
 *         source: |
 *           const formData = new FormData();
 *           formData.append('pdf', fileInput.files[0]);
 *           
 *           const response = await fetch('/api/upload', {
 *             method: 'POST',
 *             body: formData
 *           });
 *           const result = await response.json();
 */
// Multer configuration
// Stores the uploaded PDF to disk before parsing
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
// Saves the response bytes to uploads folder; returns path info
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
// Uses pdf-parse to convert PDF to raw text; includes basic metadata
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
// Converts text to tokens, slices windows with overlap, decodes to string chunks
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


/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload and process a PDF file
 *     description: |
 *       Uploads a PDF file, extracts text content, chunks it into 2000-token segments,
 *       generates embeddings, and stores them in the vector database for RAG.
 *       
 *       The file is processed asynchronously and stored in the uploads directory.
 *       Text extraction uses pdf-parse library and chunking uses tiktoken tokenization.
 *       
 *       **Supported file types:** PDF only
 *       **Maximum file size:** 10MB
 *       **Chunking strategy:** 2000 tokens per chunk with 200 token overlap
 *       
 *     tags: [Upload]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: pdf
 *         type: file
 *         required: true
 *         description: PDF file to upload and process
 *     responses:
 *       201:
 *         description: PDF successfully uploaded and processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the uploaded document
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 message:
 *                   type: string
 *                   example: "PDF uploaded and processed successfully"
 *                 status:
 *                   type: string
 *                   enum: [processing, completed, failed]
 *                   example: "completed"
 *                 pages:
 *                   type: integer
 *                   description: Number of pages extracted from the PDF
 *                   example: 15
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                   example: 2048576
 *                 filename:
 *                   type: string
 *                   description: Original filename
 *                   example: "research_paper.pdf"
 *                 uploadDate:
 *                   type: string
 *                   format: date-time
 *                   description: ISO timestamp of upload
 *                   example: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Bad request - no file provided or invalid file type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No PDF file provided"
 *       500:
 *         description: Internal server error during processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to process PDF"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl -X POST http://localhost:5000/api/upload \
 *             -F "pdf=@document.pdf" \
 *             -H "Accept: application/json"
 *       - lang: JavaScript
 *         source: |
 *           const formData = new FormData();
 *           formData.append('pdf', fileInput.files[0]);
 *           
 *           const response = await fetch('/api/upload', {
 *             method: 'POST',
 *             body: formData
 *           });
 *           const result = await response.json();
 */
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
      uploadDate: new Date(), // Explicitly set upload date
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
      const chunks = chunkTextByTokens(pdfData.text, { chunkTokens: 800, overlapTokens: 100, model: 'gpt-3.5-turbo' });
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
      filename: req.file.originalname,
      uploadDate: document.uploadDate ? document.uploadDate.toISOString() : new Date().toISOString()
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to process PDF',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/upload/url:
 *   post:
 *     summary: Upload and process a PDF from URL
 *     description: |
 *       Downloads a PDF from a provided URL, extracts text content, chunks it,
 *       generates embeddings, and stores them in the vector database.
 *       
 *       **Supported protocols:** HTTP/HTTPS
 *       **Timeout:** 30 seconds for download
 *       **Chunking strategy:** Same as file upload (2000 tokens, 200 overlap)
 *       
 *     tags: [Upload]
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - url
 *           properties:
 *             url:
 *               type: string
 *               format: uri
 *               description: URL of the PDF to download
 *               example: "https://arxiv.org/pdf/2506.23908"
 *     responses:
 *       201:
 *         description: PDF successfully downloaded and processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 message:
 *                   type: string
 *                   example: "PDF downloaded and processed successfully"
 *                 status:
 *                   type: string
 *                   enum: [processing, completed, failed]
 *                   example: "completed"
 *                 pages:
 *                   type: integer
 *                   example: 12
 *                 fileSize:
 *                   type: integer
 *                   example: 1536000
 *                 filename:
 *                   type: string
 *                   example: "2506.23908.pdf"
 *                 sourceUrl:
 *                   type: string
 *                   format: uri
 *                   example: "https://arxiv.org/pdf/2506.23908"
 *                 uploadDate:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Bad request - invalid URL or missing parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid URL provided"
 *       500:
 *         description: Internal server error during download or processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to download PDF"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl -X POST http://localhost:5000/api/upload/url \
 *             -H "Content-Type: application/json" \
 *             -d '{"url": "https://arxiv.org/pdf/2506.23908"}'
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/upload/url', {
 *             method: 'POST',
 *             headers: { 'Content-Type': 'application/json' },
 *             body: JSON.stringify({
 *               url: 'https://arxiv.org/pdf/2506.23908'
 *             })
 *           });
 *           const result = await response.json();
 */
// POST /api/upload/url - Upload PDF from URL
router.post('/url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // if (!url.toLowerCase().endsWith('.pdf')) {
    //   return res.status(400).json({ error: 'URL must point to a PDF file' });
    // }

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
      uploadDate: new Date(), // Explicitly set upload date
      metadata: {
        title: pdfData.info?.Title || path.basename(url),
        authors: pdfData.info.Author ? [pdfData.info.Author] : [],
        keywords: []
      }
    });

    await document.save();

    // Embeddings + Qdrant upsert
    try {
      const chunks = chunkTextByTokens(pdfData.text, { chunkTokens: 800, overlapTokens: 100, model: 'gpt-3.5-turbo' });
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
      sourceUrl: url,
      uploadDate: document.uploadDate ? document.uploadDate.toISOString() : new Date().toISOString()
    });

  } catch (error) {
    console.error('URL upload error:', error);
    res.status(500).json({
      error: 'Failed to process PDF from URL',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/upload/{documentId}:
 *   get:
 *     summary: Get document status and metadata
 *     description: |
 *       Retrieves the current status, metadata, and processing information
 *       for a previously uploaded document.
 *       
 *       **Returns:** Document info, processing status, chunk count, and embedding status
 *       
 *     tags: [Upload]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique identifier of the document
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Document information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 filename:
 *                   type: string
 *                   example: "research_paper.pdf"
 *                 status:
 *                   type: string
 *                   enum: [processing, completed, failed]
 *                   example: "completed"
 *                 pages:
 *                   type: integer
 *                   example: 15
 *                 fileSize:
 *                   type: integer
 *                   example: 2048576
 *                 uploadDate:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00.000Z"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                       example: "Research Paper Title"
 *                     authors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["John Doe", "Jane Smith"]
 *                     keywords:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["AI", "Machine Learning"]
 *                 chunkCount:
 *                   type: integer
 *                   description: Number of text chunks created for RAG
 *                   example: 25
 *                 lastEmbeddedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of last embedding generation
 *                   example: "2024-01-15T10:31:00.000Z"
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Document not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve document"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl http://localhost:5000/api/upload/123e4567-e89b-12d3-a456-426614174000
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/upload/123e4567-e89b-12d3-a456-426614174000');
 *           const document = await response.json();
 */
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
      uploadDate: document.uploadDate ? document.uploadDate.toISOString() : new Date().toISOString(),
      metadata: document.metadata,
      chunkCount: document.chunkCount,
      lastEmbeddedAt: document.lastEmbeddedAt ? document.lastEmbeddedAt.toISOString() : null
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

