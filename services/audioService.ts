
// Web Audio API Context (Lazy loaded)
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// Sintetizador de Efeitos Sonoros (Zero Assets externos)
export const playSound = (type: 'success' | 'error' | 'message' | 'click') => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'success':
        // Ding! (High E to High G#)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(659.25, now); // E5
        oscillator.frequency.exponentialRampToValueAtTime(830.61, now + 0.1); // G#5
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        oscillator.start(now);
        oscillator.stop(now + 0.6);
        break;

      case 'error':
        // Buzz (Low Sawtooth)
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.linearRampToValueAtTime(100, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;

      case 'message':
        // Pop (Short Sine)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;
        
      case 'click':
        // Mechanical Click
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(200, now);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
        break;
    }
  } catch (e) {
    console.warn("Audio play failed", e);
  }
};

// Text to Speech
let currentUtterance: SpeechSynthesisUtterance | null = null;

const cleanTextForSpeech = (text: string) => {
  // Remover blocos de código grandes (```...```) para não ler código
  let clean = text.replace(/```[\s\S]*?```/g, " Bloco de código gerado. ");
  
  // Remover formatação markdown
  clean = clean.replace(/\*\*/g, ""); // Bold
  clean = clean.replace(/`/g, "");     // Inline code
  clean = clean.replace(/#{1,6}\s/g, ""); // Headers
  
  return clean;
};

export const speakText = (text: string) => {
  if (!('speechSynthesis' in window)) return;

  stopSpeech();

  const clean = cleanTextForSpeech(text);
  
  currentUtterance = new SpeechSynthesisUtterance(clean);
  currentUtterance.lang = 'pt-BR';
  currentUtterance.rate = 1.1;
  currentUtterance.pitch = 1;
  currentUtterance.volume = 0.8;

  // Tentar selecionar uma voz melhor se disponível
  const voices = window.speechSynthesis.getVoices();
  const googleVoice = voices.find(v => v.name.includes("Google") && v.lang.includes("pt-BR"));
  if (googleVoice) {
      currentUtterance.voice = googleVoice;
  }

  window.speechSynthesis.speak(currentUtterance);
};

export const stopSpeech = () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};
