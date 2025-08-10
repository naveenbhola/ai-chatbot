# PDF Chat API

A REST API built with the MERN stack that enables conversational interaction with PDF documents. The system provides intelligent document processing and accurate question-answering capabilities using OpenAI's GPT models.

## Features

- **PDF Upload & Processing**: Upload PDF files for document ingestion
- **Intelligent Chat Interface**: Ask questions about uploaded documents with AI-powered responses
- **Source Citations**: Get answers with relevant page references and text excerpts
- **Conversation History**: Maintain chat sessions with follow-up question support
- **Modern UI**: Beautiful React frontend with drag-and-drop file upload
- **Docker Support**: Complete containerized setup with Docker Compose

## Tech Stack

- **Backend**: Node.js, Express.js, MongoDB, Mongoose
- **Frontend**: React.js, Tailwind CSS, Axios
- **LLM**: Groq (OpenAI-compatible API) for chat/completions
- **Embeddings**: Ollama `mxbai-embed-large`
- **Vector Search**: Qdrant (RAG retrieval)
- **PDF Processing**: pdf-parse library
- **File Upload**: Multer with drag-and-drop support
- **Containerization**: Docker & Docker Compose
 - (Optional RAG vector search removed in this version)

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v6.0 or higher)
- Groq API key (for LLM via OpenAI-compatible endpoint)
- Docker & Docker Compose (for containerized setup)

### Environment Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd pdf-chat-api
```

2. Create environment file:
```bash
cp env.example .env
```

3. Update `.env` with your configuration (Groq LLM + Ollama embeddings by default):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/pdf-chat
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# AI Provider
AI_PROVIDER=openai

# Groq (OpenAI-compatible) LLM
OPENAI_API_KEY=your_groq_api_key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Embeddings via Ollama
OLLAMA_BASE_URL=http://localhost:11434
MODEL_NAME=llama3.2:3b
EMBEDDING_MODEL=mxbai-embed-large

# Qdrant Vector DB
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=pdf_chunks

# Prompt size caps (prevent 413 from provider)
MAX_CONTEXT_CHUNKS=3
CONTEXT_CHARS_PER_CHUNK=1200
HISTORY_MESSAGES=4
```

### Installation & Running

#### Option 1: Local Development

1. Install dependencies:
```bash
npm run install:all
```

2. Start MongoDB (if not running):
```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Ubuntu/Debian
sudo systemctl start mongod

# Or use MongoDB Atlas (cloud)
```

3. Start the application:
```bash
# Development mode (both frontend and backend)
npm run dev:full

# Or start separately
npm run server  # Backend only
npm run client  # Frontend only
```

#### Option 2: Docker Compose (Recommended)

1. Build and start all services (MongoDB, Qdrant, Ollama, Ollama init, Backend, Frontend):
```bash
docker-compose up --build
```

2. Access the application:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MongoDB: localhost:27017
- Ollama: http://localhost:11434
- Qdrant: http://localhost:6333

Note: The `ollama-init` service waits for Ollama and ensures `mxbai-embed-large` is pulled automatically. If you prefer to pull manually:
```bash
docker exec -it pdf-chat-ollama ollama pull mxbai-embed-large
```

3. Pull embedding model into Ollama (first run only):
```bash
# In a separate terminal
docker exec -it pdf-chat-ollama ollama pull mxbai-embed-large
```

You can also try other models, for example:
```bash
docker exec -it pdf-chat-ollama ollama pull mistral:7b-instruct
docker exec -it pdf-chat-ollama ollama pull qwen2.5:7b-instruct
```

## API Endpoints

### Document Upload

#### POST /api/upload
Upload a PDF file for processing.

**Request:**
```bash
curl -X POST http://localhost:5000/api/upload \
  -F "pdf=@document.pdf"
```

**Response:**
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

#### GET /api/upload/:documentId
Get document status and information.

**Response:**
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

### Chat Interface

#### POST /api/chat
Ask a question about the uploaded document.

**Request:**
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "uuid-here",
    "question": "Who wrote this paper and where do they work?",
    "sessionId": "optional-session-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session-uuid",
  "answer": "...",
  "sources": [
    {
      "page": 1,
      "text": "Relevant excerpt ...",
      "confidence": 0.73
    }
  ],
  "documentId": "uuid-here",
  "timestamp": "2025-08-10T12:36:00.000Z"
}
```

#### GET /api/chat/:sessionId
Get chat history for a session.

#### GET /api/chat/document/:documentId
Get all chat sessions for a document.

#### DELETE /api/chat/:sessionId
Delete a chat session.

### Health Check

#### GET /api/health
Check API health status.

**Response:**
```json
{
  "status": "OK",
  "message": "PDF Chat API is running"
}
```

## Test Questions

The system is designed to handle these example interactions with the test document:

1. **"Who wrote this paper and where do they work?"**
   - Extracts author information and affiliations

2. **"What problems do the authors identify with current AI systems?"**
   - Identifies limitations and issues discussed in the paper

3. **"What does Theorem 3.2 state?"**
   - Locates and explains specific mathematical content

4. **"How does statistical learning differ from exact learning?"**
   - Compares and contrasts the two learning paradigms

## Frontend Usage

1. **Upload Document**: Drag and drop a PDF file or provide a URL
2. **Start Chat**: Ask questions about the uploaded document
3. **View Sources**: See page references and text excerpts for answers
4. **New Chat**: Start a fresh conversation session
5. **Document Info**: View document metadata and statistics

## Project Structure

```
pdf-chat-api/
├── server.js                 # Main server file
├── package.json              # Backend dependencies
├── env.example              # Environment variables template
├── docker-compose.yml       # Docker Compose configuration
├── Dockerfile.backend       # Backend Dockerfile
├── mongo-init.js            # MongoDB initialization script
├── models/                  # MongoDB schemas
│   ├── Document.js
│   └── Chat.js
├── routes/                  # API routes
│   ├── upload.js
│   └── chat.js
├── uploads/                 # PDF file storage
└── client/                  # React frontend
    ├── package.json
    ├── public/
    ├── src/
    │   ├── App.js
    │   ├── index.js
    │   ├── index.css
    │   └── components/
    │       ├── PDFUpload.js
    │       ├── ChatInterface.js
    │       └── DocumentInfo.js
    ├── Dockerfile.frontend
    ├── tailwind.config.js
    └── postcss.config.js
```

## LLM via Groq (online) + Embeddings via Ollama

This setup queries the LLM using Groq’s OpenAI-compatible API and generates embeddings locally via Ollama:

- Set `.env`:
  - `AI_PROVIDER=openai`
  - `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
  - `OPENAI_MODEL=meta-llama/llama-4-scout-17b-16e-instruct`
  - `OPENAI_API_KEY=your_groq_api_key`
- Embeddings:
  - `OLLAMA_BASE_URL=http://localhost:11434`
  - `EMBEDDING_MODEL=mxbai-embed-large`
- Vector DB:
  - `QDRANT_URL=http://localhost:6333`
  - `QDRANT_COLLECTION=pdf_chunks`

Chunking strategy:
- Fixed 2000-token chunks with 200-token overlap (token-aware splitter). Each chunk stored as `{ text: [string], page: null, chunkIndex }`.

RAG flow:
- On upload: extract PDF text, split into chunks, embed with Ollama `mxbai-embed-large`, upsert into Qdrant.
- On chat: retrieve top-k from Qdrant; cap and truncate context using `MAX_CONTEXT_CHUNKS` and `CONTEXT_CHARS_PER_CHUNK`; send to Groq LLM.

## Development

### Running Tests

```bash
# Backend tests (if implemented)
npm test

# Frontend tests
cd client && npm test
```

### Code Quality

The codebase follows these practices:
- Clean, commented implementation
- Error handling and validation
- RESTful API design
- Responsive UI with modern UX
- Security best practices

### Performance Considerations

- File size limits (10MB max)
- Database indexing for queries
- Efficient PDF text extraction
- Conversation history management with size caps
- Source citation accuracy via stored chunk excerpts
- Prompt size caps to avoid provider 413 errors (see env vars above)

## Deployment

### Production Setup

1. Set environment variables for production
2. Use MongoDB Atlas or production MongoDB instance
3. Configure proper CORS settings
4. Set up reverse proxy (nginx)
5. Use PM2 or similar for process management

### Docker Production

```bash
# Build production images
docker-compose -f docker-compose.prod.yml up --build

# Or use individual services
docker build -f Dockerfile.backend -t pdf-chat-backend .
docker build -f client/Dockerfile.frontend -t pdf-chat-frontend .
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the API documentation
- Review the test examples
- Ensure all dependencies are installed
- Verify environment configuration

## Acknowledgments

- OpenAI for GPT integration
- MongoDB for database solution
- React and Express communities
- PDF parsing libraries

