// Read a list of sentences aloud, one at a time.
//
// The browser's speech engine is injected as `speak` and `cancel`, so the logic
// here (advancing, pausing, skipping, ignoring stale callbacks) is testable
// without a browser. Cancelling an utterance makes browsers fire its end or
// error event late, so every call to `speak` gets a run number and callbacks
// from an earlier run are ignored.
//
// Pausing stops the current sentence and resuming starts it again from its
// beginning. That is deliberate: the browsers' own pause and resume are
// unreliable, especially on Chrome.

export const MIN_RATE = 0.5;
export const MAX_RATE = 3;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function createPlayer({ speak, cancel, onChange = () => {}, onFinish = () => {} }) {
  const state = { sentences: [], index: 0, playing: false, rate: 1, voice: null, error: null };
  let run = 0;

  const emit = () => onChange({ ...state, sentences: undefined, count: state.sentences.length });

  function speakCurrent() {
    const id = ++run;
    state.error = null;
    speak(state.sentences[state.index], { rate: state.rate, voice: state.voice }, {
      onend: () => {
        if (id !== run || !state.playing) return;
        if (state.index < state.sentences.length - 1) {
          state.index += 1;
          emit();
          speakCurrent();
        } else {
          state.playing = false;
          emit();
          onFinish();
        }
      },
      onerror: (reason) => {
        if (id !== run) return;
        if (reason === "interrupted" || reason === "canceled") return;
        state.playing = false;
        state.error = String(reason || "The speech engine reported an error.");
        emit();
      },
    });
  }

  return {
    state,
    load(sentences, startIndex = 0) {
      run += 1;
      cancel();
      state.sentences = sentences;
      state.index = clamp(startIndex, 0, Math.max(0, sentences.length - 1));
      state.playing = false;
      state.error = null;
      emit();
    },
    play() {
      if (state.playing || state.sentences.length === 0) return;
      state.playing = true;
      emit();
      speakCurrent();
    },
    pause() {
      if (!state.playing) return;
      state.playing = false;
      run += 1;
      cancel();
      emit();
    },
    toggle() {
      if (state.playing) this.pause();
      else this.play();
    },
    seek(index) {
      if (state.sentences.length === 0) return;
      state.index = clamp(index, 0, state.sentences.length - 1);
      emit();
      if (state.playing) {
        cancel();
        speakCurrent();
      }
    },
    next() {
      this.seek(state.index + 1);
    },
    prev() {
      this.seek(state.index - 1);
    },
    setRate(rate) {
      state.rate = clamp(Number(rate) || 1, MIN_RATE, MAX_RATE);
      emit();
      if (state.playing) {
        cancel();
        speakCurrent();
      }
    },
    setVoice(voice) {
      state.voice = voice;
      emit();
      if (state.playing) {
        cancel();
        speakCurrent();
      }
    },
    stop() {
      state.playing = false;
      run += 1;
      cancel();
      emit();
    },
  };
}
