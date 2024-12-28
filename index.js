const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

const ELEVEN_LABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Helper function to call ElevenLabs API
async function generateSpeech(text, voiceId) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: text,
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
        },
      },
      {
        headers: {
          'xi-api-key': ELEVEN_LABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );
    return Buffer.from(response.data).toString('base64');
  } catch (err) {
    console.error("Error generating speech:", err.response?.data || err.message);
    throw new Error("Failed to generate speech");
  }
}

// Route for generating speech
app.post('/api/generate-speech', async (req, res) => {
  const { text, voiceId } = req.body;

  if (!text || !voiceId) {
    return res.status(400).json({ error: "Missing required fields: text or voiceId" });
  }

  try {
    const audioBase64 = await generateSpeech(text, voiceId);
    res.json({ audioBase64 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RoarBliss server running on port ${PORT}`);
});