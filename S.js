// Tu código JavaScript
document.addEventListener('DOMContentLoaded', function () {
  var midiDevices = [];
  var notesToPlay = [];
  var currentGroupStartIndex = 0;
  var activeNotes = {};
  var sustainPedal = false;
  var lastNoteTime = 0;

  const SIMULTANEOUS_NOTE_THRESHOLD = 50;

  function populateMIDIDeviceSelect() {
    var selectElement = document.getElementById('midiDeviceSelect');
    selectElement.innerHTML = '';
    midiDevices.forEach(function (device) {
      var option = document.createElement('option');
      option.text = device.name;
      option.value = device.id;
      selectElement.add(option);
    });
  }

  WebMidi.enable(function (err) {
    if (err) {
      console.error('Web MIDI is not enabled:', err);
      return;
    }
    
    midiDevices = WebMidi.outputs;
    populateMIDIDeviceSelect();

    midiDevices.forEach(output => {
      output.sendProgramChange(0, 1);
    });

    WebMidi.inputs.forEach(function(input) {
      input.addListener('noteon', "all", function(e) {
        var triggeredVelocity = e.velocity;
        var currentTime = new Date().getTime();
        if (currentTime - lastNoteTime < SIMULTANEOUS_NOTE_THRESHOLD) {
          return;
        }
        lastNoteTime = currentTime;

        if (notesToPlay.length > 0 && document.getElementById('midiDeviceSelect').value) {
          var deviceId = document.getElementById('midiDeviceSelect').value;
          var output = WebMidi.getOutputById(deviceId);

          let currentGroupEndIndex = findNextGroupStartIndex(currentGroupStartIndex);

          if (output && currentGroupStartIndex < notesToPlay.length) {
            for (let i = currentGroupStartIndex; i < currentGroupEndIndex; i++) {
              var note = notesToPlay[i];
              output.playNote(note.noteNumber, 1, {
                velocity: triggeredVelocity
              });
              if (!activeNotes.hasOwnProperty(e.note.number)) {
                activeNotes[e.note.number] = [];
              }
              activeNotes[e.note.number].push(note.noteNumber);
            }
            currentGroupStartIndex = currentGroupEndIndex;
          }
        }
      });

      input.addListener('noteoff', "all", function(e) {
        if (document.getElementById('midiDeviceSelect').value) {
          var deviceId = document.getElementById('midiDeviceSelect').value;
          var output = WebMidi.getOutputById(deviceId);

          if (output && e.note && activeNotes.hasOwnProperty(e.note.number)) {
            var notesToStop = activeNotes[e.note.number];
            notesToStop.forEach(noteNumber => {
              output.stopNote(noteNumber, 1);
            });
            delete activeNotes[e.note.number];
          }
        }
      });

      input.addListener('controlchange', "all", function(e) {
        if (e.controller.number === 64) {
          sustainPedal = e.value > 63;
          applySustainEffect();
        }
      });
    });
  });

  document.getElementById('midiFile').addEventListener('change', function(e) {
    selectButton('fileButton');
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var midi = new MidiFile(e.target.result);
        extractNotesFromMidi(midi);
      } catch (error) {
        console.error("Error parsing MIDI file:", error);
      }
    };
    reader.readAsBinaryString(e.target.files[0]);
    
    document.getElementById('fileName').textContent = e.target.files[0].name;
  });

  document.getElementById('useBmidButton').addEventListener('click', function() {
    selectButton('useBmidButton');
    loadAndUseMidi('https://cdn.jsdelivr.net/gh/rafgim/NUEVO@main/1.mid', 'Preludio nº1 (Bach).mid');
  });

  document.getElementById('useAmidButton').addEventListener('click', function() {
    selectButton('useAmidButton');
    loadAndUseMidi('https://cdn.jsdelivr.net/gh/rafgim/NUEVO@main/2.mid', 'Dream nº1 (Rafael Gimeno).mid');
  });

  document.getElementById('midiLocalControlOn').addEventListener('click', function() {
    sendLocalControlMessage(true);
    document.getElementById('midiLocalControlOn').classList.add('selected');
    document.getElementById('midiLocalControlOff').classList.remove('selected');
  });

  document.getElementById('midiLocalControlOff').addEventListener('click', function() {
    sendLocalControlMessage(false);
    document.getElementById('midiLocalControlOff').classList.add('selected');
    document.getElementById('midiLocalControlOn').classList.remove('selected');
  });

  document.getElementById('buyButton').addEventListener('click', function() {
    window.location.href = "https://07127f-5c.myshopify.com/products/midis-for-dream-it";
  });

  function selectButton(buttonId) {
    document.querySelectorAll('.button').forEach(button => {
      button.classList.remove('selected');
    });
    document.getElementById(buttonId).classList.add('selected');
  }

  function loadAndUseMidi(url, fileName) {
    fetch(url)
      .then(response => response.arrayBuffer())
      .then(data => {
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            var midi = new MidiFile(e.target.result);
            extractNotesFromMidi(midi);
          } catch (error) {
            console.error("Error parsing MIDI file:", error);
          }
        };
        reader.readAsBinaryString(new Blob([data])); // Elimina el tipo 'audio/midi'
        
        document.getElementById('fileName').textContent = fileName;
      })
      .catch(error => console.error(`Error fetching ${fileName}:`, error));
  }

  function extractNotesFromMidi(midi) {
    notesToPlay = [];
    currentGroupStartIndex = 0;
    var absoluteTime = 0;
    
    midi.tracks.forEach(track => {
      absoluteTime = 0;
      track.forEach(event => {
        if (event.deltaTime) {
          absoluteTime += event.deltaTime;
        }
        if (event.subtype === 'noteOn') {
          notesToPlay.push({
            noteNumber: event.noteNumber,
            velocity: event.velocity,
            channel: 1,
            time: absoluteTime
          });
        }
      });
    });

    notesToPlay.sort((a, b) => a.time - b.time);
  }

  function findNextGroupStartIndex(startIndex) {
    if (startIndex >= notesToPlay.length) return startIndex;
    let currentTime = notesToPlay[startIndex].time;
    let index = startIndex + 1;
    while (index < notesToPlay.length && notesToPlay[index].time === currentTime) {
      index++;
    }
    return index;
  }

  function applySustainEffect() {
    if (!document.getElementById('midiDeviceSelect').value) return;
    var deviceId = document.getElementById('midiDeviceSelect').value;
    var output = WebMidi.getOutputById(deviceId);
    output.sendControlChange(64, sustainPedal ? 127 : 0);
  }

  function sendLocalControlMessage(enable) {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
      .then(function(midiAccess) {
        var outputs = midiAccess.outputs.values();
        for (var output = outputs.next(); output && !output.done; output = outputs.next()) {
          output.value.send([0xB0, 0x7A, enable ? 0x7F : 0x00]);
        }
      })
      .catch(function(error) {
        console.log('Error accessing MIDI devices: ' + error);
      });
    } else {
      console.log('Web MIDI API is not available in this browser.');
    }
  }
});
