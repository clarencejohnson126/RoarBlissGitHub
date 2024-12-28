import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import speechRoutes from './routes/speech.js';
import { errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Routes
app.use('/api', speechRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Start server
const PORT = env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});