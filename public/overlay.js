// ========== Configuration ==========
const params = new URLSearchParams(window.location.search);
const ALERT_DURATION = parseInt(params.get('duration')) || 8000; // ms
const ALERT_SOUND = params.get('sound') !== 'false'; // default: on

// ========== Alert Queue ==========
const alertQueue = [];
let isShowing = false;

// ========== SSE Connection ==========
let eventSource = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function connectSSE() {
  // สร้าง EventSource เชื่อมต่อ server
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
        console.log('🔗 Overlay connected to server');
        return;
      }

      if (data.type === 'donation') {
        console.log('💝 Donation received:', data);
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

    // Exponential backoff
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

// ========== Show Alert ==========
function showAlert(data) {
  const template = document.getElementById('alertTemplate');
  const clone = template.content.cloneNode(true);
  const alertBox = clone.querySelector('.alert-box');

  // Fill data
  alertBox.querySelector('.donor-name').textContent = data.donor || 'Anonymous';
  alertBox.querySelector('.alert-amount').textContent = `฿${Number(data.amount).toLocaleString()}`;
  alertBox.querySelector('.alert-message').textContent = data.message || '';

  // Set progress bar animation duration
  const progressBar = alertBox.querySelector('.alert-progress-bar');
  progressBar.style.animation = `progressShrink ${ALERT_DURATION}ms linear forwards`;

  // Add to container
  const container = document.getElementById('alertContainer');
  container.appendChild(alertBox);

  // Play sound
  if (ALERT_SOUND) {
    playNotificationSound();
  }

  // Spawn particles
  setTimeout(() => spawnParticles(alertBox), 300);

  // Remove after duration
  setTimeout(() => {
    alertBox.classList.add('exit');

    setTimeout(() => {
      alertBox.remove();
      isShowing = false;
      processQueue(); // Process next in queue
    }, 500); // Exit animation duration
  }, ALERT_DURATION);
}

// ========== Notification Sound (Web Audio API) ==========
let audioCtx = null;

function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const now = audioCtx.currentTime;

    // สร้างเสียงแจ้งเตือนแบบ chime 2 โน้ต
    const notes = [
      { freq: 587.33, start: 0, duration: 0.15 },     // D5
      { freq: 880, start: 0.12, duration: 0.25 },      // A5
      { freq: 1174.66, start: 0.28, duration: 0.35 },  // D6
    ];

    notes.forEach(note => {
      // Oscillator
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Gain envelope
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(0.3, now + note.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);

      // Connect
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      // Play
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.1);
    });

    // เพิ่ม harmonic layer เบาๆ
    const harmOsc = audioCtx.createOscillator();
    harmOsc.type = 'triangle';
    harmOsc.frequency.setValueAtTime(1318.51, now + 0.15); // E6

    const harmGain = audioCtx.createGain();
    harmGain.gain.setValueAtTime(0, now + 0.15);
    harmGain.gain.linearRampToValueAtTime(0.1, now + 0.2);
    harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    harmOsc.connect(harmGain);
    harmGain.connect(audioCtx.destination);
    harmOsc.start(now + 0.15);
    harmOsc.stop(now + 0.7);

  } catch (err) {
    console.warn('Audio playback failed:', err);
  }
}

// ========== Particle Effects ==========
function spawnParticles(alertBox) {
  const rect = alertBox.getBoundingClientRect();
  const colors = ['#667eea', '#764ba2', '#f093fb', '#a78bfa', '#ffd700'];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    // Random position around the alert box
    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + Math.random() * rect.height;

    // Random direction
    const tx = (Math.random() - 0.5) * 150;
    const ty = (Math.random() - 0.7) * 120;

    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.width = `${4 + Math.random() * 4}px`;
    particle.style.height = particle.style.width;

    document.body.appendChild(particle);

    // Cleanup
    setTimeout(() => particle.remove(), 1000);
  }
}

// ========== Initialize ==========
connectSSE();
console.log(`🎬 Overlay ready | Duration: ${ALERT_DURATION}ms | Sound: ${ALERT_SOUND}`);
