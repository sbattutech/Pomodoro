/**
 * FocusFlow - Modern Web-based Pomodoro Timer
 * Features:
 * - 25-minute countdown display with SVG circular progress
 * - Start / Pause / Reset / Skip controls
 * - Synthesized audio notification sound via native Web Audio API
 * - Sound selector (Zen Chime, Digital Bell, Marimba, Classic Beep)
 * - Volume slider and mute toggle
 * - Tab title synchronization & desktop notifications
 * - Session cycle tracker
 * - Drift-free timestamp-based timer engine
 */

(() => {
  'use strict';

  // --- Configuration & State ---
  const CIRCUMFERENCE = 2 * Math.PI * 140; // ~879.6459

  const DEFAULT_SETTINGS = {
    pomodoro: 25,     // minutes
    shortBreak: 5,    // minutes
    longBreak: 15,    // minutes
    autoStartBreaks: false,
    autoStartPomodoros: false,
    notifications: false,
    volume: 0.8,
    isMuted: false,
    soundPreset: 'zenChime'
  };

  let settings = loadSettings();

  const state = {
    mode: 'pomodoro',        // 'pomodoro' | 'shortBreak' | 'longBreak'
    status: 'IDLE',          // 'IDLE' | 'RUNNING' | 'PAUSED'
    timeRemaining: settings.pomodoro * 60,
    totalDuration: settings.pomodoro * 60,
    timerId: null,
    targetEndTime: null,
    completedPomodoros: 0,
    cycle: 1
  };

  // --- Audio Synthesis via Web Audio API ---
  class SoundSynthesizer {
    constructor() {
      this.audioCtx = null;
    }

    init() {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    play(preset = settings.soundPreset, volume = settings.volume) {
      if (settings.isMuted || volume <= 0) return;

      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const masterGain = this.audioCtx.createGain();
      masterGain.gain.setValueAtTime(volume, now);
      masterGain.connect(this.audioCtx.destination);

      switch (preset) {
        case 'digitalBell':
          this.playDigitalBell(now, masterGain);
          break;
        case 'marimba':
          this.playMarimba(now, masterGain);
          break;
        case 'classicBeep':
          this.playClassicBeeps(now, masterGain);
          break;
        case 'zenChime':
        default:
          this.playZenChime(now, masterGain);
          break;
      }
    }

    /**
     * Zen Chime: Rich Tibetan Singing Bowl chime with harmonic overtones
     * Fundamental: 528 Hz (Clarity / Peace)
     */
    playZenChime(startTime, outputNode) {
      const partials = [
        { freq: 528, gain: 0.7, decay: 3.5 },
        { freq: 1056, gain: 0.35, decay: 2.8 },
        { freq: 1584, gain: 0.2, decay: 2.2 },
        { freq: 2112, gain: 0.1, decay: 1.6 }
      ];

      partials.forEach(p => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.freq, startTime);

        // Gentle envelope: quick attack, long exponential decay
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(p.gain, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + p.decay);

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(startTime);
        osc.stop(startTime + p.decay + 0.05);
      });
    }

    /**
     * Digital Bell: Clean melodic arpeggio (C6, E6, G6, C7)
     */
    playDigitalBell(startTime, outputNode) {
      const notes = [1046.5, 1318.51, 1567.98, 2093.0]; // C6, E6, G6, C7
      notes.forEach((freq, idx) => {
        const noteStart = startTime + idx * 0.11;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.4, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.7);

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(noteStart);
        osc.stop(noteStart + 0.75);
      });
    }

    /**
     * Marimba: Warm acoustic triplet strike
     */
    playMarimba(startTime, outputNode) {
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const noteStart = startTime + idx * 0.15;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.5, noteStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.9);

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(noteStart);
        osc.stop(noteStart + 0.95);
      });
    }

    /**
     * Classic Beeps: Three gentle high-pitched electronic alert pulses
     */
    playClassicBeeps(startTime, outputNode) {
      for (let i = 0; i < 3; i++) {
        const beepStart = startTime + i * 0.22;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, beepStart);

        gain.gain.setValueAtTime(0.0001, beepStart);
        gain.gain.linearRampToValueAtTime(0.2, beepStart + 0.02);
        gain.gain.setValueAtTime(0.2, beepStart + 0.12);
        gain.gain.linearRampToValueAtTime(0.0001, beepStart + 0.14);

        osc.connect(gain);
        gain.connect(outputNode);

        osc.start(beepStart);
        osc.stop(beepStart + 0.15);
      }
    }
  }

  const synthesizer = new SoundSynthesizer();

  // --- DOM Elements ---
  const dom = {
    body: document.body,
    timeDisplay: document.getElementById('timeDisplay'),
    ringProgress: document.getElementById('ringProgress'),
    modeBadge: document.getElementById('modeBadge'),
    timerStatus: document.getElementById('timerStatus'),
    startPauseBtn: document.getElementById('btnStartPause'),
    startPauseText: document.getElementById('startPauseText'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    resetBtn: document.getElementById('btnReset'),
    skipBtn: document.getElementById('btnSkip'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    muteBtn: document.getElementById('btnMuteToggle'),
    iconSoundOn: document.querySelector('.icon-sound-on'),
    iconSoundOff: document.querySelector('.icon-sound-off'),
    soundPresetSelect: document.getElementById('soundPresetSelect'),
    btnTestSound: document.getElementById('btnTestSound'),
    sessionDots: document.querySelectorAll('#sessionDots .dot'),
    currentCycleNumber: document.getElementById('currentCycleNumber'),
    cycleSummary: document.getElementById('cycleSummary'),
    // Settings modal elements
    settingsBtn: document.getElementById('btnSettings'),
    closeSettingsBtn: document.getElementById('btnCloseSettings'),
    settingsModal: document.getElementById('settingsModal'),
    inputPomodoro: document.getElementById('inputPomodoro'),
    inputShortBreak: document.getElementById('inputShortBreak'),
    inputLongBreak: document.getElementById('inputLongBreak'),
    toggleAutoBreak: document.getElementById('toggleAutoBreak'),
    toggleAutoPomodoro: document.getElementById('toggleAutoPomodoro'),
    toggleNotifications: document.getElementById('toggleNotifications'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    btnRestoreDefaults: document.getElementById('btnRestoreDefaults'),
    circularWrapper: document.querySelector('.circular-progress-wrapper')
  };

  // --- Helper Functions ---
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getModeTitle(mode) {
    switch (mode) {
      case 'pomodoro': return 'Pomodoro';
      case 'shortBreak': return 'Short Break';
      case 'longBreak': return 'Long Break';
      default: return 'Timer';
    }
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem('focusflow_settings');
      return saved ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(saved)) : Object.assign({}, DEFAULT_SETTINGS);
    } catch {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('focusflow_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage:', e);
    }
  }

  // --- Core Timer Operations ---
  function updateDisplay() {
    // 1. Text display
    const formatted = formatTime(state.timeRemaining);
    dom.timeDisplay.textContent = formatted;

    // 2. SVG Circular Progress (smoothly drains as time passes)
    const progress = state.totalDuration > 0 ? state.timeRemaining / state.totalDuration : 0;
    const strokeOffset = CIRCUMFERENCE * (1 - progress);
    dom.ringProgress.style.strokeDashoffset = strokeOffset;

    // 3. Document Title
    const modeName = getModeTitle(state.mode);
    if (state.status === 'RUNNING') {
      document.title = `(${formatted}) ${modeName} - FocusFlow`;
      dom.timerStatus.textContent = state.mode === 'pomodoro' ? 'Stay focused!' : 'Time to recharge';
    } else if (state.status === 'PAUSED') {
      document.title = `[Paused] ${formatted} - FocusFlow`;
      dom.timerStatus.textContent = 'Timer paused';
    } else {
      document.title = `${modeName} | ${formatted} - FocusFlow`;
      dom.timerStatus.textContent = state.mode === 'pomodoro' ? 'Ready to focus' : 'Ready for a break';
    }
  }

  function setMode(newMode, autoStart = false) {
    state.mode = newMode;
    dom.body.className = `mode-${newMode}`;

    // Update Tab UI
    dom.modeTabs.forEach(tab => {
      const isActive = tab.dataset.mode === newMode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update Badge
    if (newMode === 'pomodoro') {
      dom.modeBadge.textContent = 'Focus Time';
    } else if (newMode === 'shortBreak') {
      dom.modeBadge.textContent = 'Short Break';
    } else {
      dom.modeBadge.textContent = 'Long Break';
    }

    // Reset durations
    const durationMinutes = settings[newMode] || 25;
    state.totalDuration = durationMinutes * 60;
    state.timeRemaining = state.totalDuration;

    // Stop current timer
    stopTimer();
    updateDisplay();

    if (autoStart) {
      startTimer();
    }
  }

  function startTimer() {
    synthesizer.init();

    if (state.status === 'RUNNING') return;

    dom.circularWrapper.classList.remove('timer-completed');
    state.status = 'RUNNING';
    state.targetEndTime = Date.now() + state.timeRemaining * 1000;

    // Update Play/Pause Button
    dom.iconPlay.classList.add('hidden');
    dom.iconPause.classList.remove('hidden');
    dom.startPauseText.textContent = 'Pause';
    dom.startPauseBtn.setAttribute('aria-label', 'Pause Timer');

    updateDisplay();

    // High frequency interval (200ms) with Date.now() delta avoids background tab throttling drift
    state.timerId = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.round((state.targetEndTime - now) / 1000));
      state.timeRemaining = diff;
      updateDisplay();

      if (diff <= 0) {
        completeTimer();
      }
    }, 200);
  }

  function pauseTimer() {
    if (state.status !== 'RUNNING') return;

    clearInterval(state.timerId);
    state.timerId = null;
    state.status = 'PAUSED';

    // Recalculate remaining exact seconds
    if (state.targetEndTime) {
      state.timeRemaining = Math.max(0, Math.round((state.targetEndTime - Date.now()) / 1000));
    }

    // Update Play/Pause Button
    dom.iconPlay.classList.remove('hidden');
    dom.iconPause.classList.add('hidden');
    dom.startPauseText.textContent = 'Resume';
    dom.startPauseBtn.setAttribute('aria-label', 'Resume Timer');

    updateDisplay();
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    state.status = 'IDLE';
    dom.iconPlay.classList.remove('hidden');
    dom.iconPause.classList.add('hidden');
    dom.startPauseText.textContent = 'Start';
    dom.startPauseBtn.setAttribute('aria-label', 'Start Timer');
    dom.circularWrapper.classList.remove('timer-completed');
  }

  function resetTimer() {
    stopTimer();
    const durationMinutes = settings[state.mode] || 25;
    state.totalDuration = durationMinutes * 60;
    state.timeRemaining = state.totalDuration;
    updateDisplay();
  }

  function completeTimer() {
    stopTimer();
    state.timeRemaining = 0;
    updateDisplay();

    // Visual pulse effect
    dom.circularWrapper.classList.add('timer-completed');
    document.title = `⏰ Time's up! - FocusFlow`;

    // 1. Play Audio Notification Sound via Web Audio API
    synthesizer.play(settings.soundPreset, settings.volume);

    // 2. Browser Desktop Notification (if enabled)
    sendBrowserNotification();

    // 3. Advance Session / Modes
    if (state.mode === 'pomodoro') {
      state.completedPomodoros++;
      updateSessionTracker();

      // Check if completed 4 pomodoros -> Long Break
      if (state.completedPomodoros % 4 === 0) {
        dom.timerStatus.textContent = 'Great work! Long break time.';
        setTimeout(() => {
          setMode('longBreak', settings.autoStartBreaks);
        }, 1200);
      } else {
        dom.timerStatus.textContent = 'Pomodoro done! Take a breather.';
        setTimeout(() => {
          setMode('shortBreak', settings.autoStartBreaks);
        }, 1200);
      }
    } else {
      // Finished a break -> back to Pomodoro
      dom.timerStatus.textContent = 'Break finished! Ready to focus?';
      setTimeout(() => {
        setMode('pomodoro', settings.autoStartPomodoros);
      }, 1200);
    }
  }

  function skipSession() {
    dom.circularWrapper.classList.remove('timer-completed');
    if (state.mode === 'pomodoro') {
      state.completedPomodoros++;
      updateSessionTracker();
      if (state.completedPomodoros % 4 === 0) {
        setMode('longBreak', false);
      } else {
        setMode('shortBreak', false);
      }
    } else {
      setMode('pomodoro', false);
    }
  }

  function updateSessionTracker() {
    const currentCompleted = state.completedPomodoros % 4;
    const currentCycle = Math.floor(state.completedPomodoros / 4) + 1;

    dom.currentCycleNumber.textContent = currentCycle;
    dom.cycleSummary.textContent = `${currentCompleted} of 4 Completed`;

    dom.sessionDots.forEach(dot => {
      const idx = parseInt(dot.dataset.index, 10);
      dot.classList.toggle('completed', idx <= currentCompleted);
    });
  }

  // --- Browser Desktop Notifications ---
  function sendBrowserNotification() {
    if (!settings.notifications || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const title = state.mode === 'pomodoro' ? 'Pomodoro Completed! 🍅' : 'Break Finished! ⚡';
      const body = state.mode === 'pomodoro'
        ? 'Time to step away and rest your mind.'
        : 'Time to dive back into deep work!';
      try {
        new Notification(title, {
          body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f43f5e"><circle cx="12" cy="12" r="10"/></svg>'
        });
      } catch (err) {
        console.warn('Notification failed:', err);
      }
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        settings.notifications = (permission === 'granted');
        dom.toggleNotifications.checked = settings.notifications;
        saveSettings();
      });
    }
  }

  // --- Audio Volume & Mute Controls ---
  function updateVolumeUI() {
    dom.volumeSlider.value = Math.round(settings.volume * 100);
    dom.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;

    const isMutedOrZero = settings.isMuted || settings.volume === 0;
    dom.iconSoundOn.classList.toggle('hidden', isMutedOrZero);
    dom.iconSoundOff.classList.toggle('hidden', !isMutedOrZero);
    dom.muteBtn.setAttribute('title', isMutedOrZero ? 'Unmute (Key: M)' : 'Mute (Key: M)');
  }

  function toggleMute() {
    synthesizer.init();
    settings.isMuted = !settings.isMuted;
    updateVolumeUI();
    saveSettings();
  }

  function setVolume(newVal) {
    synthesizer.init();
    settings.volume = Math.max(0, Math.min(1, newVal / 100));
    if (settings.volume > 0 && settings.isMuted) {
      settings.isMuted = false;
    }
    updateVolumeUI();
    saveSettings();
  }

  // --- Settings Modal ---
  function openSettings() {
    dom.inputPomodoro.value = settings.pomodoro;
    dom.inputShortBreak.value = settings.shortBreak;
    dom.inputLongBreak.value = settings.longBreak;
    dom.toggleAutoBreak.checked = settings.autoStartBreaks;
    dom.toggleAutoPomodoro.checked = settings.autoStartPomodoros;
    dom.toggleNotifications.checked = settings.notifications;

    dom.settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    dom.settingsModal.classList.add('hidden');
  }

  function saveModalSettings() {
    const pVal = parseInt(dom.inputPomodoro.value, 10);
    const sbVal = parseInt(dom.inputShortBreak.value, 10);
    const lbVal = parseInt(dom.inputLongBreak.value, 10);

    if (pVal && pVal > 0) settings.pomodoro = pVal;
    if (sbVal && sbVal > 0) settings.shortBreak = sbVal;
    if (lbVal && lbVal > 0) settings.longBreak = lbVal;

    settings.autoStartBreaks = dom.toggleAutoBreak.checked;
    settings.autoStartPomodoros = dom.toggleAutoPomodoro.checked;
    settings.notifications = dom.toggleNotifications.checked;

    if (settings.notifications && 'Notification' in window && Notification.permission !== 'granted') {
      requestNotificationPermission();
    }

    saveSettings();
    closeSettings();

    // If timer is currently idle, update current duration immediately
    if (state.status === 'IDLE') {
      resetTimer();
    }
  }

  function restoreDefaultSettings() {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    dom.inputPomodoro.value = settings.pomodoro;
    dom.inputShortBreak.value = settings.shortBreak;
    dom.inputLongBreak.value = settings.longBreak;
    dom.toggleAutoBreak.checked = settings.autoStartBreaks;
    dom.toggleAutoPomodoro.checked = settings.autoStartPomodoros;
    dom.toggleNotifications.checked = settings.notifications;
    settings.volume = 0.8;
    settings.isMuted = false;
    settings.soundPreset = 'zenChime';
    dom.soundPresetSelect.value = settings.soundPreset;
    updateVolumeUI();
    saveSettings();
    if (state.status === 'IDLE') {
      resetTimer();
    }
  }

  // --- Event Bindings ---
  function setupEventListeners() {
    // Start / Pause button
    dom.startPauseBtn.addEventListener('click', () => {
      if (state.status === 'RUNNING') {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    // Reset button
    dom.resetBtn.addEventListener('click', resetTimer);

    // Skip button
    dom.skipBtn.addEventListener('click', skipSession);

    // Mode tab buttons
    dom.modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (mode && mode !== state.mode) {
          setMode(mode, false);
        }
      });
    });

    // Sound Controls
    dom.muteBtn.addEventListener('click', toggleMute);

    dom.volumeSlider.addEventListener('input', (e) => {
      setVolume(parseInt(e.target.value, 10));
    });

    dom.soundPresetSelect.addEventListener('change', (e) => {
      settings.soundPreset = e.target.value;
      saveSettings();
    });

    dom.btnTestSound.addEventListener('click', () => {
      synthesizer.init();
      synthesizer.play(settings.soundPreset, settings.volume);
    });

    // Settings Modal
    dom.settingsBtn.addEventListener('click', openSettings);
    dom.closeSettingsBtn.addEventListener('click', closeSettings);
    dom.btnSaveSettings.addEventListener('click', saveModalSettings);
    dom.btnRestoreDefaults.addEventListener('click', restoreDefaultSettings);

    dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) {
        closeSettings();
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') closeSettings();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.status === 'RUNNING') {
          pauseTimer();
        } else {
          startTimer();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        resetTimer();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'Escape') {
        closeSettings();
      }
    });
  }

  // --- Initialization ---
  function init() {
    // Restore preset selection
    dom.soundPresetSelect.value = settings.soundPreset || 'zenChime';

    // Set initial display
    updateVolumeUI();
    setMode('pomodoro', false);
    updateSessionTracker();
    setupEventListeners();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
