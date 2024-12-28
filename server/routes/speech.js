import express from 'express';
import { ElevenLabsService } from '../services/elevenlabs.js';
import { validateSpeechRequest } from '../middleware/validateRequest.js';

const router = express.Router();

router.post('/generate-speech', validateSpeechRequest, async (req, res, next) => {
  try {
    const { text, voiceId } = req.body;
    const audioBase64 = await ElevenLabsService.generateSpeech(text, voiceId);
    res.json({ audioBase64 });
  } catch (error) {
    next(error);
  }
});

router.get('/voices', async (req, res, next) => {
  try {
    const voices = await ElevenLabsService.getVoices();
    res.json(voices);
  } catch (error) {
    next(error);
  }
});

export default router;