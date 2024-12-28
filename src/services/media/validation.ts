export const validateFileUpload = (file: File): string[] => {
  const errors: string[] = [];
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB

  if (file.size > MAX_SIZE) {
    errors.push('File size exceeds 100MB limit');
  }

  const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

  if (!allowedAudioTypes.includes(file.type) && !allowedVideoTypes.includes(file.type)) {
    errors.push('Unsupported file type. Please upload MP3, WAV, MP4, or WebM files.');
  }

  return errors;
};

export const validateYouTubeUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return youtubeRegex.test(url);
};