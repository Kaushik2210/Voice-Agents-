# Design notes

What went wrong while building ClinicScribe, what caused it, and what changed.
Every item below was found by running the pipeline or by a test, not by reading
the code, and each has a regression test.

The recordings used were synthetic (a computer voice reading a script), so none
of this says how the system behaves on real speech. See "What is not verified".

## 1. The note lost a stated allergy

**Seen:** in the first end-to-end run the patient said "I am allergic to
penicillin" and the drafted note left it out. A clinical note that silently drops
an allergy is the worst failure this tool can have.

**Cause:** a small local model (llama3, 8B) sometimes drops a fact when it
summarises, and nothing downstream noticed.

**Fix:** allergies and medications became separate fields. A scan of the
transcript guarantees that any segment mentioning an allergy ends up in the
allergy list, word for word if the model left it out, and the note is flagged.
A flagged note cannot be approved until the clinician acknowledges it.

**Along the way:** my first version listed the doctor's question "Are you
allergic to anything?" as an allergy. A question is only useful with its answer,
and the answer may not repeat the word ("Penicillin."), so a question is now kept
together with the reply that follows it.

## 2. The model copied my prompt's example into the note

**Seen:** the Subjective section read "patient-reported symptoms and history", the
placeholder text from the example JSON in my prompt, and the real symptoms were
missing.

**Fix:** the example now has empty values and the section guidance is written in
prose. A test asserts that the example contains no placeholder text.

## 3. Polling flooded the audit log

**Seen:** ten status polls for one note wrote nine "viewed" events, which would
have buried the real trail.

**Fix:** nothing is logged while a note is still processing, and a view straight
after another view of the same note within five minutes is not repeated.

## 4. A dose borrowed from another drug

**Seen:** while testing number checks, "paracetamol 500 mg" passed because 500 mg
does appear in the transcript, as the metformin dose. A check that only asks
whether a number appears anywhere is not enough.

**Fix:** doses are tied to the drug named next to them, and number words are
normalised first ("six fifty milligrams" is 650 mg). The note is flagged when a
dose belongs to a different medicine or does not appear at all.

## 5. The follow-up rule came out backwards

**Seen:** the doctor said that if the fever lasts more than three days the patient
should come back for a blood test, otherwise a follow-up in one week. The model
wrote the follow-up under "more than three days". Every number and comparator in
that sentence was correct; the outcome was attached to the wrong case.

On six runs of the same transcript the rule was reversed in 3 of 3 runs before I
changed the prompt, which means the earlier correct run had been luck.

**Fix:** two changes. The prompt now says to keep each "if A, X; otherwise Y"
branch with its own outcome. And a deterministic check compares the note's "X if
C" with the transcript's own "if C, A. Otherwise B", including the case where the
note flips the comparator ("less than three days" is right when the doctor said
"more than three days ... otherwise X"). After the change the model reversed the
rule in 1 of 3 runs, and every reversal was flagged. There were no false alarms.

**Limit:** six runs of one clip show the check works on the failure that was seen.
They are not an error rate.

## 6. Who is speaking

**Choice:** VoiceStudio's own speaker separation is only exposed inside its
video-dubbing jobs and needs a gated model that requires accepting terms with a
Hugging Face account. I used sherpa-onnx instead: two small ungated models, CPU
only. On the two-voice test clip it labelled 12 of 12 segments correctly.

**Decision:** speakers are numbered by first appearance and never guessed to be
doctor or patient. The clinician sets the roles with a Clinician / Patient
control. The two test voices were very different, which is the easy case.

## 7. Only the interface is hosted

The pipeline needs a local speech model and a local language model, and the
product's promise is that recordings never leave the clinic, so it is not hosted.
The public demo serves two notes that the real pipeline produced from a synthetic
clip, one clean and one the checks flagged, and the review controls work on them.

## 8. The interface redesign found safety problems

Restyling the interface in the same system as the Accessible Reader was meant to be a
visual change, but looking at real screenshots turned up four problems that matter for
a safety tool.

- **The safety flags were below the first screen on a phone.** A banner and a card sat
  above them. The copy is shorter, the redundant card is hidden on phones, and a test
  now fails if a flag is not on the first screen.
- **A floating action bar covered a flag's text on a phone.** Always-reachable buttons
  suit a desktop, but on a small screen they hid the very information they sat above.
  On a phone the bar is now part of the page, and a test checks directly whether
  anything covers a flag.
- **The note's text boxes had no accessible name.** A heading sat above each one but was
  not tied to it, so a screen reader announced an unlabelled box. They are now labelled.
- **Any failed action replaced the whole note with an error.** The error now appears
  next to the actions and the note stays on screen.

I also checked that the new test can fail, since it passed first time: I removed the
acknowledgement gate from the source on purpose, and the test failed on exactly that
check. The gate was then restored.

## What is not verified

- Real human speech: accents, noise, overlapping talk, Hinglish. Nothing here has
  been measured on it.
- More than two speakers, and speakers with similar voices.
- The checks only parse what they can: a rule reworded without "if", or a drug
  named differently in the note and the recording, passes unchecked.
- Medications have no deterministic backstop of the kind allergies have.
- No user login, and the database is not encrypted at rest.
- The interface has not been tried with a screen reader or by clinicians. The structure
  is checked by automation, so treat accessibility as built to the guidance, not
  verified.
