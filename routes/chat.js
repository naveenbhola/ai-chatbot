// Chat routes: retrieves context from vector DB, calls LLM, and persists conversation
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const { search: vectorSearch } = require('../services/vector');

const router = express.Router();

// Prompt sizing controls to avoid provider 413 errors
const MAX_CONTEXT_CHUNKS = parseInt(process.env.MAX_CONTEXT_CHUNKS || '40', 10);
const CONTEXT_CHARS_PER_CHUNK = parseInt(process.env.CONTEXT_CHARS_PER_CHUNK || '1200', 10);
const HISTORY_MESSAGES = parseInt(process.env.HISTORY_MESSAGES || '4', 10); // total messages (user+assistant)

// Config for model provider
const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const MODEL_NAME = process.env.MODEL_NAME || 'llama3.2:3b';
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Helper function to find relevant text chunks (simple overlap scoring)
function findRelevantChunks(content, question, maxChunks = 3) {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const questionWords = question.toLowerCase().split(/\s+/);
  
  const scoredChunks = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().split(/\s+/);
    const overlap = questionWords.filter(word => 
      sentenceWords.some(sw => sw.includes(word) || word.includes(sw))
    ).length;
    return { sentence, index, score: overlap };
  });
  
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(chunk => chunk.sentence.trim());
}

// Helper function to generate AI response
// Composes a system prompt, prunes history, caps context size to prevent provider 413 errors
async function generateAIResponse(question, context, conversationHistory = []) {
  try {
    const systemPrompt = `You are an intelligent assistant that helps users understand PDF documents.
    You have access to the document content and conversation history.
    Always provide accurate, helpful answers based on the document content.
    If the information is not in the document, say so clearly.
    Include relevant citations when possible.`;

    const contextText = context.join('\n\n');
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Document Context:\n${contextText}\n\nQuestion: ${question}` }
    ];

    // Add conversation history for context, truncated
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-HISTORY_MESSAGES);
      messages.splice(1, 0, ...recentHistory);
    }

    // Route to provider
    if (AI_PROVIDER === 'openai') {
      const OpenAI = require('openai'); // Lazy-load OpenAI SDK
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL
      });

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages,
        max_tokens: 1000,
        temperature: 0.2
      });
      return completion.choices?.[0]?.message?.content || '';
    }

    // Default: Ollama via REST API
    const resp = await axios.post(
      `${OLLAMA_BASE_URL}/api/chat`,
      {
        model: MODEL_NAME,
        messages,
        stream: false,
        options: {
          temperature: 0.2
        }
      },
      { timeout: 120000 }
    );
    const content = resp.data?.message?.content || resp.data?.response || '';
    return content;
  } catch (error) {
    console.error('Model provider error:', error?.response?.data || error.message);
    throw new Error('Failed to generate response from AI');
  }
}

function coerceToString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(v => coerceToString(v)).join(' ');
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  const s = String(value);
  return s === '[object Object]' ? '' : s;
}

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Chat with a document using AI
 *     description: |
 *       Sends a question to the AI about a specific document. The system:
 *       1. Retrieves relevant document chunks using vector similarity search
 *       2. Generates an AI response using the retrieved context
 *       3. Stores the conversation in the chat session
 *       4. Returns the AI response with source citations
 *       
 *       **RAG Process:** Uses Qdrant vector database to find semantically similar text chunks
 *       **Context Limits:** Caps context at 3 chunks × 1200 chars to prevent LLM token limits
 *       **AI Providers:** Supports Groq (default) and Ollama fallback
 *       
 *     tags: [Chat]
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - documentId
 *             - question
 *           properties:
 *             documentId:
 *               type: string
 *               format: uuid
 *               description: ID of the document to chat about
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             question:
 *               type: string
 *               description: User's question about the document
 *               example: "What are the main findings of this research?"
 *             sessionId:
 *               type: string
 *               format: uuid
 *               description: Optional session ID to continue a conversation
 *               example: "456e7890-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: AI response generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                   description: Chat session identifier
 *                   example: "456e7890-e89b-12d3-a456-426614174000"
 *                 answer:
 *                   type: string
 *                   description: AI-generated response to the question
 *                   example: "Based on the research paper, the main findings include..."
 *                 sources:
 *                   type: array
 *                   description: Relevant document chunks used as context
 *                   items:
 *                     type: object
 *                     properties:
 *                       page:
 *                         type: integer
 *                         nullable: true
 *                         description: Page number if available
 *                         example: 5
 *                       text:
 *                         type: string
 *                         description: Text excerpt from the document
 *                         example: "The research demonstrates that..."
 *                       confidence:
 *                         type: number
 *                         format: float
 *                         description: Similarity score from vector search
 *                         example: 0.85
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   description: Document being discussed
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: When the response was generated
 *                   example: "2024-01-15T10:30:00.000Z"
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Document ID and question are required"
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
 *                   example: "Failed to process chat request"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl -X POST http://localhost:5000/api/chat \
 *             -H "Content-Type: application/json" \
 *             -d '{
 *               "documentId": "123e4567-e89b-12d3-a456-426614174000",
 *               "question": "What are the main findings?"
 *             }'
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/chat', {
 *             method: 'POST',
 *             headers: { 'Content-Type': 'application/json' },
 *             body: JSON.stringify({
 *               documentId: '123e4567-e89b-12d3-a456-426614174000',
 *               question: 'What are the main findings?'
 *             })
 *           });
 *           const result = await response.json();
 */
router.post('/', async (req, res) => {
  try {
    const { documentId, question, sessionId } = req.body;

    if (!documentId || !question) {
      return res.status(400).json({ 
        error: 'Document ID and question are required' 
      });
    }

    // Find the document
    const document = await Document.findOne({ documentId });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Document is still being processed' 
      });
    }

    // Find or create chat session
    let chatSession;
    if (sessionId) {
      chatSession = await Chat.findOne({ sessionId });
      if (!chatSession) {
        return res.status(404).json({ error: 'Chat session not found' });
      }
    } else {
      const newSessionId = uuidv4();
      chatSession = new Chat({
        sessionId: newSessionId,
        documentId,
        messages: []
      });
    }

    // Retrieve relevant context via vector DB (Qdrant + Ollama embeddings)
    // Retrieve relevant context via vector DB (bounded results)
    let contextResults = [];
    try {
      const vectorResults = await vectorSearch(documentId, question, MAX_CONTEXT_CHUNKS);
      contextResults = (vectorResults || []).map(r => ({
        text: r.payload?.text || '',
        page: r.payload?.page || null,
        score: r.score,
      }));
    } catch (e) {
      // Fallback to naive context if vector search fails
      contextResults = findRelevantChunks(document.content, question, MAX_CONTEXT_CHUNKS).map(text => ({ text, page: null, score: 0.5 }));
    }
    
    // Generate AI response
    const conversationHistory = chatSession.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    const normalizedContext = contextResults
      .slice(0, MAX_CONTEXT_CHUNKS)
      .map(c => coerceToString(c.text).slice(0, CONTEXT_CHARS_PER_CHUNK))
      .filter(t => typeof t === 'string' && t.length > 0);

    const aiResponse = await generateAIResponse(
      question,
      normalizedContext,
      conversationHistory
    );

    // Add user message to chat
    chatSession.messages.push({
      role: 'user',
      content: question,
      timestamp: new Date()
    });

    // Add AI response to chat
    chatSession.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
      sources: contextResults.slice(0, 4).map((c) => {
        const preview = coerceToString(c.text).slice(0, 200) + '...';
        return {
          page: c.page || null,
          text: preview,
          confidence: typeof c.score === 'number' ? c.score : 0.8,
        };
      })
    });

    await chatSession.save();

    res.json({
      success: true,
      sessionId: chatSession.sessionId,
      answer: aiResponse,
      sources: contextResults.slice(0, 4).map((c) => {
        const preview = coerceToString(c.text).slice(0, 200) + '...';
        return {
          page: c.page || null,
          text: preview,
          confidence: typeof c.score === 'number' ? c.score : 0.8,
        };
      }),
      documentId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat request',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/chat/{sessionId}:
 *   get:
 *     summary: Get chat session history
 *     description: |
 *       Retrieves the complete conversation history for a specific chat session.
 *       Returns all messages in chronological order with their sources and metadata.
 *       
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Chat session identifier
 *         example: "456e7890-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Chat session retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *             type: object
 *             properties:
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *                 example: "456e7890-e89b-12d3-a456-426614174000"
 *               documentId:
 *                 type: string
 *                 format: uuid
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                       example: "user"
 *                     content:
 *                       type: string
 *                       example: "What are the main findings?"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     sources:
 *                       type: array
 *                       nullable: true
 *                       items:
 *                         type: object
 *                         properties:
 *                           page:
 *                             type: integer
 *                             nullable: true
 *                           text:
 *                             type: string
 *                           confidence:
 *                             type: number
 *                             format: float
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T10:30:00.000Z"
 *               updatedAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-15T10:35:00.000Z"
 *       404:
 *         description: Chat session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Chat session not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve chat session"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl http://localhost:5000/api/chat/456e7890-e89b-12d3-a456-426614174000
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/chat/456e7890-e89b-12d3-a456-426614174000');
 *           const session = await response.json();
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const chatSession = await Chat.findOne({ sessionId });
    if (!chatSession) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({
      sessionId: chatSession.sessionId,
      documentId: chatSession.documentId,
      messages: chatSession.messages,
      createdAt: chatSession.createdAt,
      updatedAt: chatSession.updatedAt
    });

  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat history',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/chat/document/{documentId}:
 *   get:
 *     summary: Get all chat sessions for a document
 *     description: |
 *       Retrieves all chat sessions that have discussed a specific document.
 *       Useful for reviewing conversation history across multiple sessions.
 *       
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Document identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Chat sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   sessionId:
 *                     type: string
 *                     format: uuid
 *                     example: "456e7890-e89b-12d3-a456-426614174000"
 *                   documentId:
 *                     type: string
 *                     format: uuid
 *                     example: "123e4567-e89b-12d3-a456-426614174000"
 *                   messageCount:
 *                     type: integer
 *                     description: Number of messages in this session
 *                     example: 6
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-01-15T10:30:00.000Z"
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2024-01-15T10:35:00.000Z"
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
 *                   example: "Failed to retrieve chat sessions"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl http://localhost:5000/api/chat/document/123e4567-e89b-12d3-a456-426614174000
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/chat/document/123e4567-e89b-12d3-a456-426614174000');
 *           const sessions = await response.json();
 */
router.get('/document/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const chatSessions = await Chat.find({ documentId })
      .sort({ updatedAt: -1 })
      .select('sessionId createdAt updatedAt messages');

    res.json({
      documentId,
      sessions: chatSessions.map(session => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length
      }))
    });

  } catch (error) {
    console.error('Get document chats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve document chat sessions',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/chat/{sessionId}:
 *   delete:
 *     summary: Delete a chat session
 *     description: |
 *       Permanently removes a chat session and all its message history.
 *       This action cannot be undone.
 *       
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Chat session identifier to delete
 *         example: "456e7890-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Chat session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Chat session deleted successfully"
 *       404:
 *         description: Chat session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Chat session not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to delete chat session"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl -X DELETE http://localhost:5000/api/chat/456e7890-e89b-12d3-a456-426614174000
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/chat/456e7890-e89b-12d3-a456-426614174000', {
 *             method: 'DELETE'
 *           });
 *           const result = await response.json();
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await Chat.deleteOne({ sessionId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({
      success: true,
      message: 'Chat session deleted successfully'
    });

  } catch (error) {
    console.error('Delete chat session error:', error);
    res.status(500).json({
      error: 'Failed to delete chat session',
      message: error.message
    });
  }
});

module.exports = router;

