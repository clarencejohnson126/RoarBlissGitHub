export const validateSpeechRequest = (req, res, next) => {
  const { text, voiceId } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!voiceId?.trim()) {
    return res.status(400).json({ error: 'Voice ID is required' });
  }

  next();
};