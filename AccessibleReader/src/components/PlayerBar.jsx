import { useState } from "react";
import { NextChapterIcon, NextSentenceIcon, PauseIcon, PlayIcon, PrevChapterIcon, PrevSentenceIcon } from "./Icons.jsx";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export default function PlayerBar({
  supported, playing, sentence, sentenceCount, chapter, chapterCount, timeLeft,
  rate, voices, voiceURI, error,
  onToggle, onPrev, onNext, onPrevChapter, onNextChapter, onRate, onVoice,
}) {
  // On a phone, speed and voice sit behind a toggle so the text keeps the screen.
  const [more, setMore] = useState(false);
  return (
    <div className="player" role="region" aria-label="Read-aloud controls">
      {!supported && (
        <p className="player-note" role="note">
          This browser cannot read aloud. You can still read and adjust the page; try Chrome, Edge or Safari for speech.
        </p>
      )}
      {error && (
        <p className="player-note error" role="alert">
          Speech stopped: {error}. Press play to try again.
        </p>
      )}
      <div className="player-row">
        <div className="transport">
          <button type="button" className="icon" onClick={onPrevChapter} disabled={chapter === 0} aria-label="Previous chapter" title="Previous chapter ( [ )">
            <PrevChapterIcon />
          </button>
          <button type="button" className="icon" onClick={onPrev} disabled={sentence === 0} aria-label="Previous sentence" title="Previous sentence ( ← )">
            <PrevSentenceIcon />
          </button>
          <button type="button" className="icon play" onClick={onToggle} disabled={!supported} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause ( Space )" : "Play ( Space )"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="icon" onClick={onNext} disabled={sentence >= sentenceCount - 1} aria-label="Next sentence" title="Next sentence ( → )">
            <NextSentenceIcon />
          </button>
          <button type="button" className="icon" onClick={onNextChapter} disabled={chapter >= chapterCount - 1} aria-label="Next chapter" title="Next chapter ( ] )">
            <NextChapterIcon />
          </button>
        </div>

        <p className="where" aria-label="Position">
          <strong>
            Chapter {chapter + 1} of {chapterCount}
          </strong>
          <span className="muted">
            {" "}
            · sentence {Math.min(sentence + 1, sentenceCount)} of {sentenceCount}
            <span className="left"> · {timeLeft}</span>
          </span>
        </p>

        <button type="button" className="more-toggle" aria-expanded={more} aria-controls="player-pickers" onClick={() => setMore((m) => !m)}>
          Speed, voice
        </button>

        <div id="player-pickers" className={more ? "pickers show" : "pickers"}>
          <label className="pill-select">
            <span className="cap">Speed</span>
            <select value={rate} onChange={(e) => onRate(Number(e.target.value))} disabled={!supported}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <label className="pill-select">
            <span className="cap">Voice</span>
            <select value={voiceURI ?? ""} onChange={(e) => onVoice(e.target.value || null)} disabled={!supported || voices.length === 0}>
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
