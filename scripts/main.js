'use strict';

// These will be initialized later
var recognizer, isRecognizerReady, recorder, callbackManager, audioContext, outputContainer;

var startBtn = document.getElementById('startBtn');
var stopBtn = document.getElementById('stopBtn');
var recordingIndicator = document.getElementById('recordingIndicator');
var currentStatus = document.getElementById('currentStatus');
var ohyp = [];

// Only when both recorder and recognizer do we have a ready application
var isRecorderReady = isRecognizerReady = false;

/* A convenience function to post a message to the recognizer and associate
 * a callback to its response
 */
function postRecognizerJob(message, callback) {
  var msg = message || {};

  if (callbackManager) {
    msg.callbackId = callbackManager.add(callback);
  }

  if (recognizer) {
    recognizer.postMessage(msg);
  }
}

/* This function initializes an instance of the recorder
 * it posts a message right away and calls onReady when it
 * is ready so that onmessage can be properly set
 */
function spawnWorker(workerURL, onReady) {
  recognizer = new Worker(workerURL);

  recognizer.onmessage = function(event) {
    onReady(recognizer);
  };

  recognizer.postMessage('');
}

// To display the hypothesis sent by the recognizer
function updateHyp(hyp) {
  if (outputContainer) {
    outputContainer.innerHTML = hyp;
  }
}

/*
 * This updates the UI when the app might be ready.
 * Only when both recorder and recognizer are ready do we enable the buttons.
 */
function updateUI() {
  if (isRecorderReady && isRecognizerReady) {
    startBtn.disabled = stopBtn.disabled = false;
  }
}

// This is just a logging window where we display the status
function updateStatus(newStatus) {
  currentStatus.innerHTML += ('<br/>' + newStatus);
}

// A not-so-great recording indicator
function displayRecording(display) {
  if (display) {
    recordingIndicator.style.display = 'inline-block';
  } else {
    recordingIndicator.style.display = 'none';
  }
}

/* Callback function once the user authorizes access to the microphone
 * in it, we instantiate the recorder
 */
function startUserMedia(stream) {
  var input = audioContext.createMediaStreamSource(stream);

  // Firefox hack https://support.mozilla.org/en-US/questions/984179
  window.firefox_audio_hack = input;

  var audioRecorderConfig = {errorCallback: function(x) {updateStatus('Error from recorder: ' + x);}};

  recorder = new AudioRecorder(input, audioRecorderConfig);

  // If a recognizer is ready, we pass it to the recorder
  if (recognizer) {
    recorder.consumers = [recognizer];
  }

  isRecorderReady = true;
  updateUI();
  updateStatus('Audio recorder ready');
}

// This starts recording.
function startRecording() {
  if (recorder && recorder.start()) {
    displayRecording(true);
  }
}

// Stops recording
function stopRecording() {
  recorder && recorder.stop();
  displayRecording(false);
}

/* Called once the recognizer is ready
 * We then add the grammars to the input select tag and update the UI
 */
function recognizerReady() {
  isRecognizerReady = true;
  updateUI();
  updateStatus('Recognizer ready');
}

// This initializes the recognizer.
function initRecognizer() {
  recognizer.postMessage({
    command: 'lazyLoad',
    callbackId: callbackManager.add(function() {
      recognizer.postMessage({
        command: 'load',
        callbackId: callbackManager.add(
          function() {
            recognizerReady();

            // We pass dictionary and keyword parameters to the recognizer
            postRecognizerJob({
              command: 'initialize',
              data: [
                ['-kws', '/keyphrase.list'],
                ['-dict', 'keyphrase.dict']
              ]
            }, function() {
              updateStatus("Loading finished!");
              startRecording();
            });

          }),
          data: [
            '/scripts/keyphrase-list.js'
          ]
      });
    }),
    data: {
      folders: [["/", "ru2"]],
      files: [['/ru2', 'means', '../ru2/means'],
              ['/ru2', 'feat.params', '../ru2/feat.params'],
              ['/ru2', 'feature_transform', '../ru2/feature_transform'],
              ['/ru2', 'mdef', '../ru2/mdef'],
              ['/ru2', 'mixture_weights', '../ru2/mixture_weights'],
              ['/ru2', 'noisedict', '../ru2/noisedict'],
              ['/ru2', 'transition_matrices', '../ru2/transition_matrices'],
              ['/ru2', 'variances', '../ru2/variances']]
    }
  });

}

/* When the page is loaded, we spawn a new recognizer worker and call getUserMedia to request access to the microphone
*/
window.onload = function() {
  outputContainer = document.getElementById('output');

  updateStatus('Initializing web audio and speech recognizer, waiting for approval to access the microphone');

  navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        console.log('You let me use your mic!')
      })
      .catch(function(err) {
        console.log('No mic for you!')
      });

  callbackManager = new CallbackManager();

  spawnWorker('/scripts/recognizer.js', function(worker) {
    // This is the onmessage function, once the worker is fully loaded
    worker.onmessage = function(event) {
      console.log('event', event.data.hyp);

      // This is the case when we have a callback id to be called
      if (event.data.hasOwnProperty('id')) {
        var callback = callbackManager.get(event.data['id']);
        var data = {};

        if (event.data.hasOwnProperty('data')) {
          data = event.data.data;
        }

        if (callback) {
          callback(data);
        }
      }

      // This is a case when the recognizer has a new hypothesis
      if (event.data.hasOwnProperty('hyp')) {
        var newHyp = event.data.hyp;

        newHyp = newHyp.replace(/\s\s+/, ' ');

        var newHypSplit = newHyp.split(" ");
        //for (var i = 0; i < newHypSplit.length; i++)
        //console.log(i + " " + newHypSplit[i]);


        if (newHypSplit.length > ohyp.length) {
          var cnt = newHypSplit.length - ohyp.length;
          //console.log(newHyp);
          var lstn = "";
          for (var i = 0; i < cnt; i++) {
            if (newHypSplit[i] == "OTVET") {
              for (var j = i; j < cnt; j++) {
                if (newHypSplit[j] == "IGRA" && lstn != "") {
                  console.log("Answer: " + lstn);
                  ohyp = newHypSplit;
                  outputContainer.innerHTML = "Ответ: " + lstn;
                  setTimeout(function() {
                    new Audio("/audio/answer_accepted.mp3").play();
                  }, 500);
                  lstn = "";
                  break;
                } else if (newHypSplit[j] != "OTVET" && newHypSplit[j] != "IGRA" && newHypSplit[j].trim() != "") {
                  lstn = newHypSplit[j];
                }
              }
            }
          }

        }


        if (event.data.hasOwnProperty('final') &&  event.data.final) {
          newHyp = 'Final: ' + newHyp;
        }

      }

      // This is the case when we have an error
      if (event.data.hasOwnProperty('status') && (event.data.status === 'error')) {
        updateStatus('Error in ' + event.data.command + ' with code ' + event.data.code);
      }
    };

    // Once the worker is fully loaded, we can call the initialize function
    initRecognizer();
  });

  // The following is to initialize Web Audio
  try {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    window.URL = window.URL || window.webkitURL;
    audioContext = new AudioContext();
  } catch (error) {
    console.error(error);
    updateStatus('Error initializing Web Audio browser');
  }

  if (navigator.getUserMedia) {
    navigator.getUserMedia({
      audio: {
        mandatory: {
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false
        },
        optional: []
      }
    }, startUserMedia, function(e) {
      updateStatus('No live audio input in this browser');
    });
  } else {
    updateStatus('No web audio support in this browser');
  }

  // Wiring JavaScript to the UI
  startBtn.disabled = true;
  stopBtn.disabled = true;
  startBtn.onclick = startRecording;
  stopBtn.onclick = stopRecording;
};
