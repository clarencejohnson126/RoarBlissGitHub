export const createAudioFromBase64 = (base64Audio: string): HTMLAudioElement => {
  const audio = new Audio();
  audio.src = `data:audio/mpeg;base64,${base64Audio}`;
  return audio;
};