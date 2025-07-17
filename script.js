// Enhanced Music Maker - script.js

// Audio context and global variables
let audioCtx;
let tracks = [];
let recordingStream;
let mediaRecorder;
let recordedChunks = [];
let isPlaying = false;
let selectedTrackIndex = -1;
let audioSources = [];
let trackPlayStates = []; // Track individual play states
let trackAudioSources = []; // Track individual audio sources
let bpm = 120;
let playbackStartTime = 0;
let playbackPositionInterval;
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };

// Initialize audio context (user gesture required)
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Sample data with durations and categories
const sampleData = {
  // Drums
  kick: { duration: 0.5, category: 'drums', color: '#FF6B6B' },
  snare: { duration: 0.3, category: 'drums', color: '#FF8E53' },
  hihat: { duration: 0.1, category: 'drums', color: '#FF6B9D' },
  crash: { duration: 2.0, category: 'drums', color: '#C44569' },
  ride: { duration: 1.5, category: 'drums', color: '#F8B500' },
  tom: { duration: 0.8, category: 'drums', color: '#FD79A8' },
  
  // Bass
  bass1: { duration: 1.0, category: 'bass', color: '#00B894' },
  bass2: { duration: 1.2, category: 'bass', color: '#00CEC9' },
  subbass: { duration: 2.0, category: 'bass', color: '#6C5CE7' },
  synthbass: { duration: 1.5, category: 'bass', color: '#A29BFE' },
  
  // Synths
  lead: { duration: 2.0, category: 'synths', color: '#FD79A8' },
  pad: { duration: 4.0, category: 'synths', color: '#FDCB6E' },
  pluck: { duration: 0.5, category: 'synths', color: '#E17055' },
  arp: { duration: 1.0, category: 'synths', color: '#81ECEC' },
  
  // Other
  vocal: { duration: 3.0, category: 'other', color: '#FAB1A0' },
  fx: { duration: 1.0, category: 'other', color: '#E84393' }
};

// Create synthetic audio buffers (since we don't have actual audio files)
function createSyntheticBuffer(name) {
  const data = sampleData[name];
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * data.duration;
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const output = buffer.getChannelData(0);
  
  // Generate different sounds based on instrument type
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    switch (data.category) {
      case 'drums':
        // Drum sounds with decay envelope
        const decay = Math.exp(-t * 5);
        if (name === 'kick') {
          sample = Math.sin(2 * Math.PI * (60 - t * 40) * t) * decay;
        } else if (name === 'snare') {
          sample = (Math.random() * 2 - 1) * decay * 0.5 + Math.sin(2 * Math.PI * 200 * t) * decay * 0.3;
        } else if (name === 'hihat') {
          sample = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.3;
        } else if (name === 'crash') {
          sample = (Math.random() * 2 - 1) * Math.exp(-t * 2) * 0.4;
        } else {
          sample = Math.sin(2 * Math.PI * 150 * t) * decay;
        }
        break;
        
      case 'bass':
        // Bass sounds
        const bassFreq = name === 'subbass' ? 40 : 80;
        sample = Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-t * 0.5);
        if (name === 'synthbass') {
          sample += Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.3 * Math.exp(-t * 0.5);
        }
        break;
        
      case 'synths':
        // Synth sounds
        if (name === 'lead') {
          sample = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 0.3);
        } else if (name === 'pad') {
          sample = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t)) * 0.3;
        } else if (name === 'pluck') {
          sample = Math.sin(2 * Math.PI * 660 * t) * Math.exp(-t * 8);
        } else {
          sample = Math.sin(2 * Math.PI * 880 * t * (1 + 0.1 * Math.sin(t * 4))) * Math.exp(-t * 0.5);
        }
        break;
        
      default:
        // Generic sound
        sample = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 1);
    }
    
    output[i] = Math.max(-1, Math.min(1, sample));
  }
  
  return buffer;
}

// Load or create audio sample
async function loadSample(name) {
  try {
    // Try to load from samples folder first
    const response = await fetch(`samples/${name}.wav`);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return audioCtx.decodeAudioData(arrayBuffer);
    }
  } catch (error) {
    console.log(`Creating synthetic sound for ${name}`);
  }
  
  // Create synthetic buffer if file doesn't exist
  return createSyntheticBuffer(name);
}

// Create a new track
function createTrack() {
  const track = { 
    events: [], 
    volume: 0.8, 
    loop: false,
    muted: false,
    solo: false
  };
  tracks.push(track);
  
  // Initialize play state for this track
  trackPlayStates.push(false);
  trackAudioSources.push([]);
  
  renderTracks();
  return tracks.length - 1;
}

// Delete a track
function deleteTrack(index) {
  if (tracks.length > 1) {
    // Stop the track if it's playing
    if (trackPlayStates[index]) {
      stopTrack(index);
    }
    
    tracks.splice(index, 1);
    trackPlayStates.splice(index, 1);
    trackAudioSources.splice(index, 1);
    
    if (selectedTrackIndex >= tracks.length) {
      selectedTrackIndex = tracks.length - 1;
    }
    renderTracks();
  }
}

// Delete a sample event
function deleteSampleEvent(trackIndex, eventIndex) {
  tracks[trackIndex].events.splice(eventIndex, 1);
  renderTracks();
}

// Calculate total duration of all tracks
function getTotalDuration() {
  let maxDuration = 0;
  
  tracks.forEach(track => {
    track.events.forEach(event => {
      const eventEnd = event.time + event.duration;
      if (eventEnd > maxDuration) {
        maxDuration = eventEnd;
      }
    });
  });
  
  // Minimum 10 seconds, but extend if tracks are longer
  return Math.max(10, Math.ceil(maxDuration));
}

// Update playback position indicator
function updatePlaybackPosition() {
  if (!isPlaying) return;
  
  const elapsed = audioCtx.currentTime - playbackStartTime;
  const totalDuration = getTotalDuration();
  const tempoMultiplier = bpm / 120;
  const adjustedElapsed = elapsed * tempoMultiplier;
  
  const timelineWidth = document.querySelector('.timeline-container').clientWidth;
  const position = (adjustedElapsed / totalDuration) * timelineWidth;
  
  const positionElement = document.querySelector('.playback-position');
  if (positionElement) {
    positionElement.style.left = `${Math.min(position, timelineWidth)}px`;
  }
  
  // Auto-stop when reaching the end
  if (adjustedElapsed >= totalDuration && !tracks.some(t => t.loop)) {
    stopAll();
  }
}

// Setup BPM control
function setupBPMControl() {
  const bpmSlider = document.getElementById('bpm-slider');
  const bpmDisplay = document.getElementById('bpm-display');
  
  bpmSlider.addEventListener('input', e => {
    bpm = parseInt(e.target.value);
    bpmDisplay.textContent = bpm;
  });
}

// Setup sample event dragging
function setupSampleDragging(eventEl, trackIndex, eventIndex) {
  const dragHandle = document.createElement('div');
  dragHandle.className = 'drag-handle';
  eventEl.appendChild(dragHandle);
  
  let isDragging = false;
  let startX = 0;
  let startLeft = 0;
  
  // Mouse events
  eventEl.addEventListener('mousedown', startDrag);
  
  // Touch events
  eventEl.addEventListener('touchstart', startDrag, { passive: false });
  
  function startDrag(e) {
    // Don't start dragging if clicking on volume slider or delete button
    if (e.target.classList.contains('sample-volume') || 
        e.target.classList.contains('delete-sample') ||
        e.target.type === 'range') {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    isDragging = true;
    eventEl.classList.add('dragging');
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    startX = clientX;
    startLeft = parseFloat(eventEl.style.left);
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', endDrag);
    
    // Highlight valid drop zones
    document.querySelectorAll('.track').forEach(track => {
      track.classList.add('drag-over');
    });
  }
  
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startX;
    const trackRect = eventEl.parentElement.getBoundingClientRect();
    const totalDuration = getTotalDuration();
    const newLeft = startLeft + (deltaX / trackRect.width) * 100;
    
    // Constrain to track bounds
    const constrainedLeft = Math.max(0, Math.min(95, newLeft));
    eventEl.style.left = `${constrainedLeft}%`;
    
    // Check if dragging over a different track
    const elementBelow = document.elementFromPoint(clientX, e.clientY || e.touches[0].clientY);
    const targetTrack = elementBelow?.closest('.track');
    
    // Highlight target track
    document.querySelectorAll('.track').forEach(track => {
      track.classList.remove('drag-over');
    });
    if (targetTrack) {
      targetTrack.classList.add('drag-over');
    }
  }
  
  function endDrag(e) {
    if (!isDragging) return;
    
    isDragging = false;
    eventEl.classList.remove('dragging');
    
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('touchend', endDrag);
    
    // Remove highlight from all tracks
    document.querySelectorAll('.track').forEach(track => {
      track.classList.remove('drag-over');
    });
    
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const elementBelow = document.elementFromPoint(clientX, clientY);
    const targetTrack = elementBelow?.closest('.track');
    
    if (targetTrack) {
      const targetTrackIndex = parseInt(targetTrack.dataset.index);
      const trackRect = targetTrack.getBoundingClientRect();
      const relativeX = clientX - trackRect.left;
      const totalDuration = getTotalDuration();
      const newTime = (relativeX / trackRect.width) * totalDuration; // Use dynamic duration
      
      // Update the event's time and position
      const event = tracks[trackIndex].events[eventIndex];
      const newLeft = (newTime / totalDuration) * 100;
      event.time = Math.max(0, newTime);
      
      // If dropping on a different track, move the event
      if (targetTrackIndex !== trackIndex) {
        tracks[targetTrackIndex].events.push(event);
        tracks[trackIndex].events.splice(eventIndex, 1);
      }
      
      renderTracks();
    } else {
      // If not dropped on a track, revert position
      eventEl.style.left = `${startLeft}%`;
    }
  }
}

// Render all tracks
function renderTracks() {
  const container = document.querySelector('.track-list');
  container.innerHTML = '';
  
  const totalDuration = getTotalDuration();
  
  tracks.forEach((track, trackIndex) => {
    const trackEl = document.createElement('div');
    trackEl.className = 'track';
    if (trackIndex === selectedTrackIndex) {
      trackEl.style.border = '2px solid #FFD700';
    }
    trackEl.dataset.index = trackIndex;
    
    // Track header with controls
    const header = document.createElement('div');
    header.className = 'track-header';
    header.innerHTML = `
      <span>Track ${trackIndex + 1} ${track.loop ? '🔄' : ''} ${track.muted ? '🔇' : '🔊'}</span>
      <div class="track-controls">
        <button class="play-track" title="Play Track">▶️</button>
        <input type="range" min="0" max="1" step="0.01" class="volume-control" value="${track.volume}" title="Volume">
        <button class="loop-toggle ${track.loop ? 'active' : ''}" title="Loop">🔄</button>
        <button class="mute-toggle ${track.muted ? 'active' : ''}" title="Mute">🔇</button>
        <button class="delete-track" title="Delete Track">❌</button>
      </div>
    `;
    trackEl.appendChild(header);
    
    // Event listeners for track controls
    header.querySelector('.volume-control').addEventListener('input', e => {
      track.volume = parseFloat(e.target.value);
    });
    
    header.querySelector('.play-track').addEventListener('click', e => {
      e.stopPropagation();
      playTrack(trackIndex);
    });
    
    header.querySelector('.loop-toggle').addEventListener('click', e => {
      track.loop = !track.loop;
      renderTracks();
    });
    
    header.querySelector('.mute-toggle').addEventListener('click', e => {
      track.muted = !track.muted;
      renderTracks();
    });
    
    header.querySelector('.delete-track').addEventListener('click', e => {
      e.stopPropagation();
      deleteTrack(trackIndex);
    });
    
    // Track click to select
    trackEl.addEventListener('click', () => {
      selectedTrackIndex = trackIndex;
      renderTracks();
    });
    
    // Setup drag and drop
    trackEl.addEventListener('dragover', e => e.preventDefault());
    trackEl.addEventListener('drop', async e => {
      e.preventDefault();
      initAudioContext();
      const name = e.dataTransfer.getData('text');
      const buffer = await loadSample(name);
      const rect = trackEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = (x / rect.width) * totalDuration; // Use dynamic duration
      
      track.events.push({ 
        buffer, 
        time, 
        name, 
        volume: 0.8,
        duration: sampleData[name]?.duration || 1.0
      });
      renderTracks();
    });
    
    // Draw sample events
    track.events.forEach((event, eventIndex) => {
      const eventEl = document.createElement('div');
      eventEl.className = 'sample-event';
      const leftPercent = (event.time / totalDuration) * 100; // Use dynamic duration
      const widthPercent = (event.duration / totalDuration) * 100;
      
      eventEl.style.left = `${Math.min(leftPercent, 95)}%`;
      eventEl.style.width = `${Math.min(widthPercent, 100 - leftPercent)}%`;
      eventEl.style.backgroundColor = sampleData[event.name]?.color || 'rgba(255,255,255,0.3)';
      
      // Create the main content
      const contentDiv = document.createElement('div');
      contentDiv.className = 'sample-content';
      contentDiv.textContent = event.name;
      eventEl.appendChild(contentDiv);
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-sample';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = '×';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        deleteSampleEvent(trackIndex, eventIndex);
      });
      eventEl.appendChild(deleteBtn);
      
      // Create volume slider
      const volumeSlider = document.createElement('input');
      volumeSlider.type = 'range';
      volumeSlider.min = '0';
      volumeSlider.max = '1';
      volumeSlider.step = '0.01';
      volumeSlider.value = event.volume;
      volumeSlider.className = 'sample-volume';
      volumeSlider.title = `Volume: ${Math.round(event.volume * 100)}%`;
      volumeSlider.addEventListener('input', e => {
        e.stopPropagation();
        e.preventDefault();
        event.volume = parseFloat(e.target.value);
        e.target.title = `Volume: ${Math.round(event.volume * 100)}%`;
      });
      volumeSlider.addEventListener('mousedown', e => e.stopPropagation());
      volumeSlider.addEventListener('touchstart', e => e.stopPropagation());
      eventEl.appendChild(volumeSlider);
      
      // Setup dragging for this sample event
      setupSampleDragging(eventEl, trackIndex, eventIndex);
      
      trackEl.appendChild(eventEl);
    });
    
    container.appendChild(trackEl);
  });
  
  // Update timeline ruler to show correct duration
  updateTimelineRuler(totalDuration);
  
  // Update all track play button states after rendering
  tracks.forEach((track, index) => {
    updateTrackPlayButton(index);
  });
}

// Update timeline ruler with dynamic duration
function updateTimelineRuler(totalDuration) {
  const ruler = document.querySelector('.timeline-ruler');
  if (!ruler) return;
  
  // Generate time markers based on total duration
  let markers = '';
  const step = totalDuration <= 10 ? 1 : Math.ceil(totalDuration / 10);
  
  for (let i = 0; i <= totalDuration; i += step) {
    markers += `${i}s `;
  }
  
  // Update the CSS content
  const spacing = totalDuration <= 10 ? 80 : (800 / (totalDuration / step));
  ruler.style.setProperty('--marker-spacing', `${spacing}px`);
  
  // Update ruler content
  ruler.setAttribute('data-markers', markers.trim());
}

// Setup drag and drop for instruments
function setupInstruments() {
  document.querySelectorAll('.instrument').forEach(el => {
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text', el.dataset.name);
    });
  });
}

// Play all tracks
function playAll() {
  if (isPlaying) return;
  
  initAudioContext();
  isPlaying = true;
  audioSources = [];
  playbackStartTime = audioCtx.currentTime;
  
  document.getElementById('play-all').textContent = '⏸️ Playing...';
  
  // Start playback position animation
  playbackPositionInterval = setInterval(updatePlaybackPosition, 50);
  
  // Calculate tempo-adjusted timing
  const tempoMultiplier = bpm / 120; // 120 BPM is our base tempo
  const totalDuration = getTotalDuration();
  
  tracks.forEach((track, trackIndex) => {
    if (track.muted) return;
    
    const trackGain = audioCtx.createGain();
    trackGain.gain.value = track.volume;
    trackGain.connect(audioCtx.destination);
    
    track.events.forEach(event => {
      const source = audioCtx.createBufferSource();
      const sampleGain = audioCtx.createGain();
      
      source.buffer = event.buffer;
      sampleGain.gain.value = event.volume;
      
      // Apply tempo adjustment to playback rate
      source.playbackRate.value = tempoMultiplier;
      
      source.connect(sampleGain);
      sampleGain.connect(trackGain);
      
      const startTime = audioCtx.currentTime + (event.time / tempoMultiplier);
      source.start(startTime);
      
      audioSources.push(source);
      
      // Handle looping
      if (track.loop) {
        source.loop = true;
      }
    });
  });
  
  // Auto-stop after adjusted duration if not looping
  const duration = (totalDuration * 1000) / tempoMultiplier; // Convert to milliseconds and adjust for tempo
  setTimeout(() => {
    if (isPlaying && !tracks.some(t => t.loop)) {
      stopAll();
    }
  }, duration);
}

// Stop all playback
function stopAll() {
  // Stop main playback
  audioSources.forEach(source => {
    try {
      source.stop();
    } catch (e) {
      // Source may already be stopped
    }
  });
  audioSources = [];
  isPlaying = false;
  document.getElementById('play-all').textContent = '▶️ Play All';
  
  // Stop all individual tracks
  tracks.forEach((track, index) => {
    if (trackPlayStates[index]) {
      stopTrack(index);
    }
  });
  
  // Stop playback position animation
  if (playbackPositionInterval) {
    clearInterval(playbackPositionInterval);
    playbackPositionInterval = null;
  }
  
  // Reset playback position
  const positionElement = document.querySelector('.playback-position');
  if (positionElement) {
    positionElement.style.left = '0px';
  }
}

// Clear all tracks
function clearAll() {
  if (confirm('Are you sure you want to clear all tracks?')) {
    // Stop all playback first
    stopAll();
    
    tracks = [];
    trackPlayStates = [];
    trackAudioSources = [];
    
    createTrack();
    selectedTrackIndex = 0;
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT') return;
    
    switch (e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        if (isPlaying) {
          stopAll();
        } else {
          playAll();
        }
        break;
      case 't':
        e.preventDefault();
        createTrack();
        break;
      case 'delete':
      case 'backspace':
        e.preventDefault();
        if (selectedTrackIndex >= 0) {
          deleteTrack(selectedTrackIndex);
        }
        break;
      case 'arrowup':
        e.preventDefault();
        selectedTrackIndex = Math.max(0, selectedTrackIndex - 1);
        renderTracks();
        break;
      case 'arrowdown':
        e.preventDefault();
        selectedTrackIndex = Math.min(tracks.length - 1, selectedTrackIndex + 1);
        renderTracks();
        break;
      case 'arrowleft':
        // Decrease BPM
        e.preventDefault();
        bpm = Math.max(60, bpm - 5);
        document.getElementById('bpm-slider').value = bpm;
        document.getElementById('bpm-display').textContent = bpm;
        break;
      case 'arrowright':
        // Increase BPM
        e.preventDefault();
        bpm = Math.min(200, bpm + 5);
        document.getElementById('bpm-slider').value = bpm;
        document.getElementById('bpm-display').textContent = bpm;
        break;
      case 'r':
        e.preventDefault();
        document.getElementById('record-vocals').click();
        break;
      case 's':
        e.preventDefault();
        document.getElementById('download-song').click();
        break;
    }
  });
}

// Recording vocals with improved functionality
async function recordVocals() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  
  try {
    initAudioContext();
    recordingStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    mediaRecorder = new MediaRecorder(recordingStream);
    recordedChunks = [];
    
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'audio/wav' });
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      // Add recorded audio to selected track
      if (selectedTrackIndex >= 0) {
        tracks[selectedTrackIndex].events.push({
          buffer: audioBuffer,
          time: 0,
          name: 'recorded',
          volume: 0.8,
          duration: audioBuffer.duration
        });
        renderTracks();
      }
      
      recordingStream.getTracks().forEach(track => track.stop());
      document.getElementById('record-vocals').textContent = '🎤 Record Vocals';
    };
    
    mediaRecorder.start();
    document.getElementById('record-vocals').textContent = '⏹️ Stop Recording';
    
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Could not access microphone. Please check permissions.');
  }
}

// Download functionality
function downloadSong() {
  if (!audioCtx) {
    alert('Please play the song first before downloading.');
    return;
  }
  
  // Create offline context for rendering
  const offlineCtx = new OfflineAudioContext(2, audioCtx.sampleRate * 10, audioCtx.sampleRate);
  
  tracks.forEach(track => {
    if (track.muted) return;
    
    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = track.volume;
    trackGain.connect(offlineCtx.destination);
    
    track.events.forEach(event => {
      const source = offlineCtx.createBufferSource();
      const sampleGain = offlineCtx.createGain();
      
      source.buffer = event.buffer;
      sampleGain.gain.value = event.volume;
      
      source.connect(sampleGain);
      sampleGain.connect(trackGain);
      
      source.start(event.time);
    });
  });
  
  offlineCtx.startRendering().then(buffer => {
    // Convert to WAV and download
    const wav = audioBufferToWav(buffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `music-maker-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

// Convert AudioBuffer to WAV format
function audioBufferToWav(buffer) {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const chunkSize = 36 + dataSize;
  
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, chunkSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
}

// Initialize application
function init() {
  // Initialize arrays
  trackPlayStates = [];
  trackAudioSources = [];
  
  // Create initial track
  createTrack();
  selectedTrackIndex = 0;
  
  // Setup event listeners
  document.getElementById('add-track').addEventListener('click', createTrack);
  document.getElementById('play-all').addEventListener('click', playAll);
  document.getElementById('stop-all').addEventListener('click', stopAll);
  document.getElementById('download-song').addEventListener('click', downloadSong);
  document.getElementById('record-vocals').addEventListener('click', recordVocals);
  document.getElementById('clear-all').addEventListener('click', clearAll);
  
  // Setup BPM control
  setupBPMControl();
  
  // Setup instruments and keyboard shortcuts
  setupInstruments();
  setupKeyboardShortcuts();
  
  // Initialize timeline with default duration
  updateTimelineRuler(10);
  
  // Handle window resize for timeline
  window.addEventListener('resize', () => {
    if (isPlaying) {
      updatePlaybackPosition();
    }
    // Re-render timeline on resize
    const totalDuration = getTotalDuration();
    updateTimelineRuler(totalDuration);
  });
  
  console.log('🎵 Music Maker Enhanced - Ready to rock!');
  console.log('🎛️ New features: Draggable samples, BPM control, dynamic playback position indicator');
}

// Play individual track
function playTrack(trackIndex) {
  console.log(`=== Playing track ${trackIndex} ===`);
  
  // Stop if already playing
  if (trackPlayStates[trackIndex]) {
    console.log('Track already playing, stopping it');
    stopTrack(trackIndex);
    return;
  }
  
  const track = tracks[trackIndex];
  console.log('Track data:', track);
  
  if (!track) {
    console.log('No track found');
    return;
  }
  
  if (track.muted) {
    console.log('Track is muted');
    return;
  }
  
  if (track.events.length === 0) {
    console.log('Track has no events');
    alert('This track is empty. Add some instruments first!');
    return;
  }
  
  // Initialize audio context
  try {
    initAudioContext();
    console.log('Audio context initialized');
  } catch (error) {
    console.error('Failed to initialize audio context:', error);
    return;
  }
  
  // Set track as playing
  trackPlayStates[trackIndex] = true;
  if (!trackAudioSources[trackIndex]) {
    trackAudioSources[trackIndex] = [];
  } else {
    trackAudioSources[trackIndex] = [];
  }
  
  console.log(`Starting playback of ${track.events.length} events`);
  
  // Calculate tempo-adjusted timing
  const tempoMultiplier = bpm / 120;
  console.log('Tempo multiplier:', tempoMultiplier);
  
  // Create track gain node
  const trackGain = audioCtx.createGain();
  trackGain.gain.value = track.volume;
  trackGain.connect(audioCtx.destination);
  
  // Play each event
  track.events.forEach((event, eventIndex) => {
    console.log(`Playing event ${eventIndex}:`, { name: event.name, time: event.time, volume: event.volume });
    
    try {
      const source = audioCtx.createBufferSource();
      const sampleGain = audioCtx.createGain();
      
      source.buffer = event.buffer;
      sampleGain.gain.value = event.volume;
      source.playbackRate.value = tempoMultiplier;
      
      source.connect(sampleGain);
      sampleGain.connect(trackGain);
      
      const startTime = audioCtx.currentTime + (event.time / tempoMultiplier);
      console.log(`Starting at time: ${startTime}`);
      
      source.start(startTime);
      trackAudioSources[trackIndex].push(source);
      
      // Handle looping
      if (track.loop) {
        source.loop = true;
        console.log('Loop enabled for this event');
      }
      
    } catch (error) {
      console.error(`Error playing event ${eventIndex}:`, error);
    }
  });
  
  // Update button state
  updateTrackPlayButton(trackIndex);
  console.log('Track play state updated');
  
  // Auto-stop after track duration if not looping
  if (!track.loop) {
    const trackDuration = getTrackDuration(trackIndex);
    const duration = (trackDuration * 1000) / tempoMultiplier;
    console.log(`Will auto-stop after ${duration}ms`);
    
    setTimeout(() => {
      if (trackPlayStates[trackIndex]) {
        console.log('Auto-stopping track');
        stopTrack(trackIndex);
      }
    }, duration + 500);
  }
  
  console.log('=== Track playback started ===');
}

// Stop individual track
function stopTrack(trackIndex) {
  console.log(`Stopping track ${trackIndex}`);
  
  if (trackAudioSources[trackIndex]) {
    trackAudioSources[trackIndex].forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
        console.log('Source already stopped:', e);
      }
    });
    trackAudioSources[trackIndex] = [];
  }
  
  trackPlayStates[trackIndex] = false;
  updateTrackPlayButton(trackIndex);
}

// Get duration of a specific track
function getTrackDuration(trackIndex) {
  const track = tracks[trackIndex];
  let maxDuration = 0;
  
  track.events.forEach(event => {
    const eventEnd = event.time + event.duration;
    if (eventEnd > maxDuration) {
      maxDuration = eventEnd;
    }
  });
  
  return Math.max(1, maxDuration); // Minimum 1 second
}

// Update track play button appearance
function updateTrackPlayButton(trackIndex) {
  console.log(`Updating track ${trackIndex} button, playing: ${trackPlayStates[trackIndex]}`);
  
  const trackEl = document.querySelector(`.track[data-index="${trackIndex}"]`);
  if (!trackEl) {
    console.log(`Track element not found for index ${trackIndex}`);
    return;
  }
  
  const playBtn = trackEl.querySelector('.play-track');
  if (!playBtn) {
    console.log(`Play button not found for track ${trackIndex}`);
    return;
  }
  
  if (trackPlayStates[trackIndex]) {
    playBtn.textContent = '⏸️';
    playBtn.classList.add('playing');
    playBtn.title = 'Stop Track';
  } else {
    playBtn.textContent = '▶️';
    playBtn.classList.remove('playing');
    playBtn.title = 'Play Track';
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);