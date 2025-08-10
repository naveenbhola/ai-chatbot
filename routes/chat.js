const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Document = require('../models/Document');
const Chat = require('../models/Chat');
const { search: vectorSearch } = require('../services/vector');

const router = express.Router();

// Prompt sizing controls to avoid provider 413 errors
const MAX_CONTEXT_CHUNKS = parseInt(process.env.MAX_CONTEXT_CHUNKS || '3', 10);
const CONTEXT_CHARS_PER_CHUNK = parseInt(process.env.CONTEXT_CHARS_PER_CHUNK || '1200', 10);
const HISTORY_MESSAGES = parseInt(process.env.HISTORY_MESSAGES || '4', 10); // total messages (user+assistant)

// Config for model provider
const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const MODEL_NAME = process.env.MODEL_NAME || 'llama3.2:3b';
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

    // Add conversation history for context (trimmed)
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-HISTORY_MESSAGES);
      messages.splice(1, 0, ...recentHistory);
    }

    // Route to provider (OpenAI-compatible default: Groq)
    if (AI_PROVIDER === 'openai') {
      // Lazy-load OpenAI SDK only if used
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: OPENAI_BASE_URL
      });

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages,
        max_tokens: 1000,
        temperature: 0.2
      });
      return completion.choices?.[0]?.message?.content || '';
    }

    // Default: Ollama via REST API
    // Convert messages to Ollama format is similar; Ollama accepts {role, content}
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
    // Ollama returns {message: {content}, done: true}
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

// POST /api/chat - Chat with document
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

// GET /api/chat/:sessionId - Get chat history
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

// GET /api/chat/document/:documentId - Get all chat sessions for a document
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

// DELETE /api/chat/:sessionId - Delete chat session
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

