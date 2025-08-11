# API Workflow Guide: Upload & Chat Flow

This guide provides a step-by-step process for using the Chat with PDF Documents, covering the complete workflow from document upload to AI-powered chat interactions.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [API Endpoints Overview](#api-endpoints-overview)
3. [Step-by-Step Upload Flow](#step-by-step-upload-flow)
4. [Step-by-Step Chat Flow](#step-by-step-chat-flow)
5. [Complete Workflow Example](#complete-workflow-example)
6. [Error Handling & Troubleshooting](#error-handling--troubleshooting)
7. [Testing with Swagger UI](#testing-with-swagger-ui)

## 🚀 Prerequisites

### Required Services
- **Backend API**: Running on port 5000
- **MongoDB**: Database for document metadata
- **Qdrant**: Vector database for embeddings
- **Ollama**: Local embedding generation
- **Groq**: LLM for chat completions

### Environment Variables
```env
# AI Configuration
AI_PROVIDER=openai
OPENAI_API_KEY=your_groq_api_key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=mxbai-embed-large

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=pdf_chunks
```

## 🔗 API Endpoints Overview

| Method | Endpoint | Description | Status |
|--------|----------|-------------|---------|
| `POST` | `/api/upload` | Upload PDF file | ✅ Active |
| `POST` | `/api/upload/url` | Upload PDF from URL | ✅ Active |
| `GET` | `/api/upload/:documentId` | Get document status | ✅ Active |
| `POST` | `/api/chat` | Chat with document | ✅ Active |
| `GET` | `/api/chat/:sessionId` | Get chat history | ✅ Active |
| `GET` | `/api/chat/document/:documentId` | Get document chats | ✅ Active |
| `DELETE` | `/api/chat/:sessionId` | Delete chat session | ✅ Active |
| `GET` | `/api/health` | Health check | ✅ Active |

## 📤 Step-by-Step Upload Flow

### Phase 1: Document Upload

#### Step 1.1: Upload PDF File
```bash
curl -X POST http://localhost:5000/api/upload \
  -F "pdf=@document.pdf"
```

**What happens internally:**
1. File validation (PDF only, max 10MB)
2. PDF text extraction using `pdf-parse`
3. Document metadata extraction (title, authors, pages)
4. Document record creation in MongoDB
5. Response with `documentId` and status

**Expected Response:**
```json
{
  "success": true,
  "documentId": "uuid-here",
  "message": "PDF uploaded and processed successfully",
  "status": "completed",
  "pages": 15,
  "fileSize": 2048576,
  "filename": "document.pdf",
  "uploadDate": "2025-08-10T12:34:56.789Z"
}
```

#### Step 1.2: Alternative - Upload from URL
```bash
curl -X POST http://localhost:5000/api/upload/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://arxiv.org/pdf/2506.23908"}'
```

**What happens internally:**
1. URL validation and PDF download
2. Same processing as file upload
3. Additional `sourceUrl` in response

#### Step 1.3: Verify Upload Status
```bash
curl http://localhost:5000/api/upload/uuid-here
```

**Expected Response:**
```json
{
  "documentId": "uuid-here",
  "filename": "document.pdf",
  "status": "completed",
  "pages": 15,
  "fileSize": 2048576,
  "uploadDate": "2025-08-10T12:34:56.789Z",
  "metadata": {
    "title": "Document Title",
    "authors": ["Author Name"],
    "keywords": []
  },
  "chunkCount": 0,
  "lastEmbeddedAt": null
}
```

### Phase 2: Document Processing

#### Step 2.1: Text Chunking (Automatic)
**What happens internally:**
1. PDF text is split into 2000-token chunks
2. 200-token overlap between chunks
3. Chunks stored with metadata (page, index)

#### Step 2.2: Embedding Generation (Automatic)
**What happens internally:**
1. Each text chunk sent to Ollama `mxbai-embed-large`
2. Vector embeddings generated (1536 dimensions)
3. Chunks and embeddings stored in Qdrant
4. `chunkCount` and `lastEmbeddedAt` updated

**Final Status Response:**
```json
{
  "documentId": "uuid-here",
  "filename": "document.pdf",
  "status": "completed",
  "pages": 15,
  "fileSize": 2048576,
  "uploadDate": "2025-08-10T12:34:56.789Z",
  "metadata": {
    "title": "Document Title",
    "authors": ["Author Name"],
    "keywords": []
  },
  "chunkCount": 128,
  "lastEmbeddedAt": "2025-08-10T12:35:10.000Z"
}
```

## 💬 Step-by-Step Chat Flow

### Phase 3: Chat Initialization

#### Step 3.1: Start Chat Session
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "uuid-here",
    "question": "What is the main topic of this document?",
    "sessionId": null
  }'
```

**What happens internally:**
1. Document validation and existence check
2. Question embedding generation
3. Vector similarity search in Qdrant
4. Top-k relevant chunks retrieved
5. Context preparation for LLM
6. LLM query to Groq API
7. Response generation with sources

**Expected Response:**
```json
{
  "success": true,
  "sessionId": "session-uuid",
  "answer": "The main topic of this document is...",
  "sources": [
    {
      "page": 1,
      "text": "Relevant excerpt from the document...",
      "confidence": 0.85
    }
  ],
  "documentId": "uuid-here",
  "timestamp": "2025-08-10T12:36:00.000Z"
}
```

### Phase 4: Follow-up Questions

#### Step 4.1: Continue Chat Session
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "uuid-here",
    "question": "Can you elaborate on that point?",
    "sessionId": "session-uuid"
  }'
```

**What happens internally:**
1. Previous conversation history retrieved
2. Context from previous questions included
3. New question processed with RAG
4. Response generated considering conversation flow

### Phase 5: Chat Management

#### Step 5.1: View Chat History
```bash
curl http://localhost:5000/api/chat/session-uuid
```

**Expected Response:**
```json
{
  "sessionId": "session-uuid",
  "documentId": "uuid-here",
  "messages": [
    {
      "role": "user",
      "content": "What is the main topic?",
      "timestamp": "2025-08-10T12:36:00.000Z"
    },
    {
      "role": "assistant",
      "content": "The main topic is...",
      "timestamp": "2025-08-10T12:36:05.000Z",
      "sources": [...]
    }
  ]
}
```

#### Step 5.2: View All Document Chats
```bash
curl http://localhost:5000/api/chat/document/uuid-here
```

#### Step 5.3: Delete Chat Session
```bash
curl -X DELETE http://localhost:5000/api/chat/session-uuid
```

## 🔄 Complete Workflow Example

### Scenario: Research Paper Analysis

#### 1. Upload Research Paper
```bash
# Upload PDF
curl -X POST http://localhost:5000/api/upload \
  -F "pdf=@research_paper.pdf"

# Response: documentId = "abc123-def456"
```

#### 2. Wait for Processing
```bash
# Check status until complete
curl http://localhost:5000/api/upload/abc123-def456

# Wait for: "chunkCount": 45, "lastEmbeddedAt": "2025-08-10T..."
```

#### 3. Start Research Questions
```bash
# Question 1: Main findings
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "abc123-def456",
    "question": "What are the main findings of this research?",
    "sessionId": null
  }'

# Response: sessionId = "session789"
```

#### 4. Follow-up Questions
```bash
# Question 2: Methodology
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "abc123-def456",
    "question": "What methodology did they use?",
    "sessionId": "session789"
  }'

# Question 3: Implications
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "abc123-def456",
    "question": "What are the practical implications?",
    "sessionId": "session789"
  }'
```

#### 5. Review Chat History
```bash
# Get complete conversation
curl http://localhost:5000/api/chat/session789
```

## ⚠️ Error Handling & Troubleshooting

### Common Upload Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Only PDF files are allowed` | Wrong file type | Upload PDF file only |
| `File too large` | > 10MB | Compress or split PDF |
| `Invalid URL` | Malformed URL | Check URL format |
| `Download failed` | Network/URL issue | Verify URL accessibility |

### Common Chat Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Document not found` | Invalid documentId | Check documentId |
| `Document not processed` | Embeddings incomplete | Wait for processing |
| `Request too large` | Context too long | Reduce question complexity |
| `AI service error` | Groq/Ollama issue | Check service status |

### Debug Commands

```bash
# Check service health
curl http://localhost:5000/api/health

# Check MongoDB connection
docker exec -it pdf-chat-mongodb mongosh

# Check Ollama status
curl http://localhost:11434/api/tags

# Check Qdrant status
curl http://localhost:6333/collections
```

## 🧪 Testing with Swagger UI

### Access Swagger Documentation
1. **Open**: http://localhost:5000/api-docs
2. **Navigate**: Upload → Chat → System tags
3. **Test Endpoints**: Use "Try it out" button
4. **View Schemas**: See request/response formats

### Interactive Testing Workflow

#### 1. Test Upload Endpoint
1. Go to `POST /api/upload`
2. Click "Try it out"
3. Upload a PDF file
4. Execute and copy `documentId`

#### 2. Test Chat Endpoint
1. Go to `POST /api/chat`
2. Click "Try it out"
3. Paste `documentId` from step 1
4. Enter a question
5. Execute and view response

#### 3. Test Status Endpoints
1. Go to `GET /api/upload/{documentId}`
2. Click "Try it out"
3. Paste `documentId`
4. Execute to see processing status

## 📊 Performance Considerations

### Upload Performance
- **Small PDFs (< 1MB)**: ~5-10 seconds
- **Medium PDFs (1-5MB)**: ~15-30 seconds
- **Large PDFs (5-10MB)**: ~30-60 seconds

### Chat Performance
- **Simple questions**: ~2-5 seconds
- **Complex questions**: ~5-10 seconds
- **Follow-up questions**: ~3-7 seconds

### Optimization Tips
1. **Chunk size**: 2000 tokens optimal for RAG
2. **Context limit**: Max 3 chunks × 1200 chars
3. **History limit**: Last 4 messages for context
4. **Batch processing**: Multiple documents simultaneously

## 🔐 Security & Best Practices

### API Security
- **Rate limiting**: Implement if needed
- **Authentication**: Ready for API key integration
- **Input validation**: All inputs sanitized
- **Error handling**: No sensitive data leakage

### Data Privacy
- **Local processing**: Embeddings generated locally
- **No data storage**: Chat history in MongoDB only
- **Secure transmission**: HTTPS recommended for production

## 📈 Monitoring & Analytics

### Key Metrics
- **Upload success rate**: % of successful uploads
- **Processing time**: Average embedding generation time
- **Chat response time**: Average LLM response time
- **Error rates**: Upload and chat error percentages

### Health Checks
```bash
# API Health
curl http://localhost:5000/api/health

# Service Status
docker ps | grep pdf-chat

# Log Monitoring
docker logs pdf-chat-backend -f
```

## 🚀 Next Steps

1. **Test the workflow** using Swagger UI
2. **Upload sample documents** to understand processing
3. **Experiment with questions** to test RAG capabilities
4. **Monitor performance** and optimize as needed
5. **Scale up** for production use

---

**Need Help?**
- **Swagger UI**: http://localhost:5000/api-docs
- **API Health**: http://localhost:5000/api/health
- **Documentation**: Check README.md and SWAGGER_SETUP.md
- **Issues**: Review error handling section above
