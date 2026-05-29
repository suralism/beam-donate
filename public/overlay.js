// ========== Local Configuration State ==========
let overlaySettings = {
  duration: 8,
  soundEnabled: true,
  soundChoice: 'chime',
  soundVolume: 0.5,
  ttsEnabled: false,
  ttsVolume: 0.8,
  ttsRate: 1.0,
  ttsLanguage: 'th-TH',
  messageTemplate: '{donor} ได้บริจาค {amount} บาท! 🎉',
  showDonorMessage: true,
  minAmount: 1,
  theme: 'glassmorphism',
  animation: 'slide-down',
  fontFamily: 'Noto Sans Thai',
  primaryColor: '#667eea',
  secondaryColor: '#764ba2',
  backgroundColor: 'rgba(15, 15, 25, 0.88)',
  textColor: '#ffffff',
  borderColor: 'rgba(255, 255, 255, 0.25)',
  particleCount: 15
};

// ========== Queue System ==========
const alertQueue = [];
let isShowing = false;

// ========== SSE Connection ==========
let eventSource = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

// ========== Initialize & Load Settings ==========
async function loadInitialSettings() {
  try {
    const res = await fetch('/api/overlay/settings');
    if (res.ok) {
      const settings = await res.json();
      console.log('📋 Loaded overlay settings from server:', settings);
      applySettings(settings);
    }
  } catch (err) {
    console.error('Failed to load initial settings, using defaults:', err);
    applySettings(overlaySettings);
  }
}

// ========== Apply Settings Dynamically ==========
function applySettings(settings) {
  overlaySettings = { ...overlaySettings, ...settings };
  
  // Inject style values to document element
  const doc = document.documentElement;
  doc.style.setProperty('--primary-color', overlaySettings.primaryColor);
  doc.style.setProperty('--secondary-color', overlaySettings.secondaryColor);
  doc.style.setProperty('--bg-color', overlaySettings.backgroundColor);
  doc.style.setProperty('--text-color', overlaySettings.textColor);
  doc.style.setProperty('--border-color', overlaySettings.borderColor);
  doc.style.setProperty('--font-family', `'${overlaySettings.fontFamily}', 'Segoe UI', sans-serif`);
  doc.style.setProperty('--glow-color', hexToRgbA(overlaySettings.primaryColor, 0.25));

  console.log('⚡ Applied settings:', overlaySettings.theme, overlaySettings.animation);
}

// Helper to convert hex color to rgba with transparency
function hexToRgbA(hex, alpha = 1) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
  }
  return hex;
}

// ========== Connect to SSE stream ==========
function connectSSE() {
  const baseUrl = window.location.origin;
  eventSource = new EventSource(`${baseUrl}/api/alerts/stream`);

  eventSource.onopen = () => {
    console.log('✅ SSE connected');
    reconnectAttempts = 0;
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'connected') {
        console.log('🔗 Overlay stream active');
        return;
      }

      // Real-time Settings Sync!
      if (data.type === 'settings_update') {
        console.log('🔄 SSE Settings Update received:', data.settings);
        applySettings(data.settings);
        return;
      }

      // Donation Alert Event
      if (data.type === 'donation') {
        console.log('💝 Donation event received:', data);
        
        // Client-side minimum amount filter
        const amount = Number(data.amount) || 0;
        if (amount < overlaySettings.minAmount) {
          console.log(`⚠️ Donation filtered out (฿${amount} is below threshold ฿${overlaySettings.minAmount})`);
          return;
        }

        alertQueue.push(data);
        processQueue();
      }
    } catch (err) {
      console.error('Error parsing SSE data:', err);
    }
  };

  eventSource.onerror = () => {
    console.warn('⚠️ SSE connection lost. Reconnecting...');
    eventSource.close();

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    setTimeout(connectSSE, delay);
  };
}

// ========== Queue Processor ==========
function processQueue() {
  if (isShowing || alertQueue.length === 0) return;

  isShowing = true;
  const alertData = alertQueue.shift();
  showAlert(alertData);
}

// ========== Show Alert Panel ==========
function showAlert(data) {
  const template = document.getElementById('alertTemplate');
  const clone = template.content.cloneNode(true);
  const alertBox = clone.querySelector('.alert-box');

  // Apply Theme and Animation classes
  alertBox.classList.add(`theme-${overlaySettings.theme}`);
  alertBox.classList.add(`anim-${overlaySettings.animation}`);

  // Format header text using template
  const amountFormatted = Number(data.amount).toLocaleString('th-TH', { minimumFractionDigits: 0 });
  let headerText = overlaySettings.messageTemplate
    .replace(/{donor}/g, data.donor || 'Anonymous')
    .replace(/{amount}/g, amountFormatted);
  
  // Set content
  alertBox.querySelector('.donor-name').textContent = headerText;
  
  // ซ่อนป้าย "บริจาค" หากในเทมเพลตข้อความหลักมีจำนวนเงินหรือคำว่าบริจาคอยู่แล้ว เพื่อป้องกันคำซ้ำซ้อน
  const labelElement = alertBox.querySelector('.alert-label');
  if (labelElement) {
    const tempLower = overlaySettings.messageTemplate.toLowerCase();
    if (tempLower.includes('{amount}') || tempLower.includes('บริจาค') || tempLower.includes('donate')) {
      labelElement.style.display = 'none';
    } else {
      labelElement.style.display = 'inline-block';
      if (overlaySettings.theme === 'cyberpunk' || overlaySettings.theme === 'minimal') {
        labelElement.textContent = 'PAY';
      } else {
        labelElement.textContent = 'บริจาค';
      }
    }
  }

  // Adjust amount display (large font is standard, but since template might have it, let's keep it clean)
  alertBox.querySelector('.alert-amount').textContent = `฿${amountFormatted}`;

  // User private message
  const messageElement = alertBox.querySelector('.alert-message');
  if (overlaySettings.showDonorMessage && data.message) {
    messageElement.textContent = data.message;
  } else {
    messageElement.textContent = '';
  }

  // Set progress bar duration
  const progressBar = alertBox.querySelector('.alert-progress-bar');
  const alertDurationMs = (Number(overlaySettings.duration) || 8) * 1000;
  progressBar.style.animation = `progressShrink ${alertDurationMs}ms linear forwards`;

  // Append to overlay
  const container = document.getElementById('alertContainer');
  container.appendChild(alertBox);

  // Play Alert Audio Notification
  if (overlaySettings.soundEnabled) {
    playNotificationSound(overlaySettings.soundChoice, overlaySettings.soundVolume);
  }

  // Play Speech Synthesis (TTS) after a small delay
  if (overlaySettings.ttsEnabled) {
    const speakText = `${data.donor || 'ผู้บริจาค'} บริจาค ${data.amount} บาท. ${data.message ? `ฝากข้อความว่า ${data.message}` : ''}`;
    setTimeout(() => {
      speakMessage(speakText, overlaySettings.ttsLanguage, overlaySettings.ttsVolume, overlaySettings.ttsRate, overlaySettings.ttsVoice);
    }, 1200);
  }

  // Spawn visual particles
  setTimeout(() => spawnParticles(alertBox, overlaySettings.particleCount), 300);

  // Auto remove alert after duration
  setTimeout(() => {
    alertBox.classList.add('exit');

    setTimeout(() => {
      alertBox.remove();
      isShowing = false;
      processQueue(); // Loop to next in queue
    }, 550); // Exit animation transition time
  }, alertDurationMs);
}

// ========== Web Audio API Notification Synthesizer ==========
let audioCtx = null;

function playNotificationSound(soundChoice, volume) {
  try {
    if (soundChoice === 'none') return;
    
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const now = audioCtx.currentTime;
    
    // Create master gain control
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(Number(volume) || 0.5, now);
    masterGain.connect(audioCtx.destination);

    if (soundChoice === 'chime') {
      // 3-note classic chime (D5 -> A5 -> D6)
      const notes = [
        { freq: 587.33, start: 0, duration: 0.15 },
        { freq: 880.00, start: 0.12, duration: 0.25 },
        { freq: 1174.66, start: 0.28, duration: 0.35 }
      ];

      notes.forEach(note => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        
        gainNode.gain.setValueAtTime(0, now + note.start);
        gainNode.gain.linearRampToValueAtTime(0.25, now + note.start + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);
        
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        
        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration + 0.05);
      });
    } 
    else if (soundChoice === 'retro') {
      // 8-bit Arcade coin jump sound (Quick rising pitch)
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.25); // C6
      
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gainNode);
      gainNode.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 0.3);
    } 
    else if (soundChoice === 'modern') {
      // Warm modern synthesizer pad chord
      const oscTypes = ['sine', 'triangle'];
      const freqs = [329.63, 392.00, 523.25, 659.25]; // E4, G4, C5, E5
      
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = oscTypes[idx % oscTypes.length];
        osc.frequency.setValueAtTime(freq, now);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + (idx * 0.1));
        
        osc.connect(gainNode);
        gainNode.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + 1.0);
      });
    } 
    else if (soundChoice === 'bell') {
      // Soft high bell chime (Crystal resonance)
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1567.98, now); // G6
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.8); // G5
      
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc.connect(gainNode);
      gainNode.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 0.9);
    }
  } catch (err) {
    console.warn('Audio synthesis failed:', err);
  }
}

// ========== Web Speech API (TTS) Speak Engine ==========
function speakMessage(text, lang = 'th-TH', volume = 0.8, rate = 1.0, voiceName = 'default') {
  try {
    const voices = window.speechSynthesis.getVoices();
    let voice = null;
    
    // 1. ถ้าผู้ใช้กำหนดให้ใช้เสียง เปรมวดี, นิวัฒน์, อัจฉรา (ไม่เป็น default) ให้ลองใช้เสียงพรีเมียมในเครื่องก่อน
    if (voiceName && voiceName !== 'default') {
      const targetName = voiceName.toLowerCase();
      // ค้นหาเสียงที่มีคำว่า 'premwadee', 'niwat' หรือ 'achara' ในชื่อเสียงพูด
      voice = voices.find(v => v.name.toLowerCase().includes(targetName));
    }
    
    if (voice) {
      // เล่นด้วยเสียงพรีเมียม Edge TTS ที่ตรวจพบในเครื่อง
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.volume = Number(volume) || 0.8;
      utterance.rate = Number(rate) || 1.0;
      
      window.speechSynthesis.speak(utterance);
      console.log('🗣️ Selected premium Edge TTS voice:', voice.name);
    } else {
      // 2. หากผู้ใช้เลือกเป็น default หรือไม่มีเสียงพรีเมียมตัวนั้นติดตั้งในระบบ (เช่น OBS)
      // ให้สลับมาใช้ Google Translate Cloud TTS (ภาษาไทยแท้ ทำงานได้ 100% ทุกอุปกรณ์)
      const shortLang = lang.split('-')[0] || 'th';
      const truncatedText = text.substring(0, 180);
      const encodedText = encodeURIComponent(truncatedText);
      const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${shortLang}&client=tw-ob&q=${encodedText}`;
      
      console.log(`📣 No local premium voice found. Using Google Translate TTS (${shortLang}):`, truncatedText);
      
      const audio = new Audio(googleTtsUrl);
      audio.volume = Number(volume) || 0.8;
      audio.defaultPlaybackRate = Number(rate) || 1.0;
      audio.playbackRate = Number(rate) || 1.0;
      
      audio.play()
        .then(() => {
          console.log('🗣️ Google TTS playing successfully:', truncatedText);
        })
        .catch(err => {
          console.warn('⚠️ Google TTS autoplay blocked or failed, playing with browser default speech:', err.message);
          // Fallback สุดท้าย: เล่นด้วยเสียงสังเคราะห์ของระบบทั่วไป
          playDefaultWebSpeech(text, lang, volume, rate);
        });
    }
  } catch (err) {
    console.warn('⚠️ Speech engine error, playing with browser default speech:', err);
    playDefaultWebSpeech(text, lang, volume, rate);
  }
}

// ฟังก์ชันสำหรับเล่นเสียงพากย์ฉุกเฉิน (Fallback สุดท้าย)
function playDefaultWebSpeech(text, lang, volume, rate) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.volume = Number(volume) || 0.8;
    utterance.rate = Number(rate) || 1.0;
    
    // พยายามหาเสียงภาษาไทยทั่วไปในระบบถ้ามี
    const voices = window.speechSynthesis.getVoices();
    const targetLang = lang.toLowerCase().replace('_', '-');
    let voice = voices.find(v => {
      const voiceLang = v.lang.toLowerCase().replace('_', '-');
      return voiceLang === targetLang || voiceLang.startsWith(targetLang);
    });
    
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.error('Final fallback speaking failed:', e);
  }
}

// ========== Particle Effects Generator ==========
function spawnParticles(alertBox, particleCount = 12) {
  const rect = alertBox.getBoundingClientRect();
  const colors = [
    overlaySettings.primaryColor, 
    overlaySettings.secondaryColor, 
    '#f093fb', 
    '#ffd700', 
    '#00f3ff'
  ];
  
  const count = Number(particleCount) || 0;
  if (count <= 0) return;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + Math.random() * rect.height;

    const tx = (Math.random() - 0.5) * 180;
    const ty = (Math.random() - 0.7) * 140;

    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    
    const size = 4 + Math.random() * 5;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
  }
}

// ========== Boot Sequence ==========
window.addEventListener('DOMContentLoaded', async () => {
  // Pre-fetch voices so TTS voice resolution works quickly on load
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }

  await loadInitialSettings();
  connectSSE();
});
