from app.services.summarize import parse_note
from app.services.verify import (check_conditionals, check_quantities, dose_triples,
                                 numbers, quantities, verify_note, words_to_digits)

# The transcript of the two-voice clip used in the end-to-end runs.
TRANSCRIPT = [
    "Good afternoon. Please sit down. What seems to be the problem?",
    "Doctor, I have had fever and a headache for two days. I also have a dry cough since yesterday.",
    "Okay. Do you have any other medical conditions, or take any regular medicines?",
    "Yes, I have diabetes. I take metformin 500 mg twice a day.",
    "Any allergies to medicines?",
    "Yes. I am allergic to sulfa drugs. I got a rash once.",
    "Noted. Let me check you. Your temperature is 100.4 Fahrenheit, blood pressure is 130 over 85, and your lungs are clear.",
    "This looks like a viral fever. Your diabetes seems stable.",
    "I will prescribe paracetamol 650 mg, up to three times a day when you have fever.",
    "Please continue your metformin. Drink lots of fluids and rest.",
    "If the fever lasts more than three days, come back and we will do a blood test. Otherwise, a follow-up in one week.",
    "Thank you doctor. You can reach me on [PHONE].",
]
SEGMENTS = [{"text": t} for t in TRANSCRIPT]
FULL = " ".join(TRANSCRIPT)

CORRECT_PLAN = (
    "Prescribe paracetamol 650 mg up to three times a day when having fever; continue "
    "metformin; drink lots of fluids and rest. Follow-up in one week if fever lasts "
    "less than three days; otherwise, do blood test"
)
# The wording the model produced on the run that got the rule backwards.
INVERTED_PLAN = (
    "Prescribe paracetamol 650 mg up to three times a day when having fever; continue "
    "metformin; drink lots of fluids and rest; follow-up in one week if fever lasts "
    "more than three days"
)


def _note(plan: str, **sections) -> dict:
    note = parse_note("{}", len(SEGMENTS))
    note["sections"]["plan"]["text"] = plan
    for name, text in sections.items():
        note["sections"][name]["text"] = text
    return note


# --- number words -----------------------------------------------------------

def test_spoken_numbers_become_digits():
    assert words_to_digits("one hundred and one point two") == "101.2"
    assert words_to_digits("paracetamol six fifty milligrams") == "paracetamol 650 milligrams"
    assert words_to_digits("one thirty over eighty five") == "130 over 85"
    assert words_to_digits("five hundred") == "500"
    assert words_to_digits("twice a day") == "2 times a day"
    assert words_to_digits("nine eight seven six") == "9876"


def test_words_that_only_look_like_numbers_are_left_alone():
    assert words_to_digits("the point of care") == "the point of care"
    assert words_to_digits("someone phoned") == "someone phoned"


def test_quantities_unify_spoken_and_written_forms():
    assert ("650", "mg") in quantities("six fifty milligrams")
    assert ("3", "day") in quantities("for three days")
    assert quantities("twice a day") == quantities("two times a day")
    assert "101.2" in numbers("one hundred and one point two")


# --- quantities -------------------------------------------------------------

def test_a_correct_note_raises_no_flags():
    note = _note(
        CORRECT_PLAN,
        subjective="Fever and headache for two days, dry cough since yesterday",
        objective="Temperature: 100.4 Fahrenheit, Blood pressure: 130 over 85, Lungs clear",
        assessment="Viral fever, diabetes seems stable",
    )
    note["medications"] = [{"text": "Metformin 500 mg twice a day", "sources": [3]}]
    note["allergies"] = [{"text": "Sulfa drugs (rash)", "sources": [5]}]
    assert verify_note(note, SEGMENTS)["flags"] == []


def test_a_dose_borrowed_from_another_drug_is_flagged():
    # 500 mg is in the transcript, but as the metformin dose, not paracetamol's.
    flags = check_quantities("plan", "Prescribe paracetamol 500 mg three times a day", FULL)
    assert len(flags) == 1
    assert "paracetamol 500 mg" in flags[0] and "650 mg" in flags[0]


def test_a_dose_for_a_drug_never_mentioned_is_flagged():
    flags = check_quantities("plan", "Give ibuprofen 400 mg", FULL)
    assert len(flags) == 1 and "ibuprofen 400 mg" in flags[0]


def test_dose_written_before_the_drug_is_tied_to_that_drug():
    assert ("paracetamol", "650", "mg") in dose_triples("take 650 mg of paracetamol")
    assert ("metformin", "500", "mg") in dose_triples("I take metformin five hundred milligrams")
    assert check_quantities("plan", "650 mg of paracetamol", FULL) == []


def test_a_correct_dose_with_different_wording_is_not_flagged():
    note = "Paracetamol six fifty milligrams up to three times a day"
    assert check_quantities("plan", note, FULL) == []


def test_a_changed_duration_is_flagged_but_same_number_in_words_is_not():
    assert check_quantities("plan", "Fever for 5 days", FULL)
    assert check_quantities("plan", "Fever for two days", FULL) == []


def test_a_number_that_is_not_in_the_transcript_is_flagged():
    flags = check_quantities("objective", "Blood pressure 140 over 90", FULL)
    assert len(flags) == 2 and any("140" in f for f in flags)


def test_the_word_one_inside_prose_is_not_treated_as_a_number():
    assert check_quantities("subjective", "No one else was mentioned", FULL) == []


# --- conditionals -----------------------------------------------------------

def test_the_inverted_follow_up_rule_is_caught():
    flags = check_conditionals("plan", INVERTED_PLAN, FULL)
    assert len(flags) == 1
    assert "follow-up in one week" in flags[0].lower()
    assert "other case" in flags[0]


def test_the_correct_negated_wording_is_not_flagged():
    assert check_conditionals("plan", CORRECT_PLAN, FULL) == []


def test_the_same_direction_wording_with_the_right_outcome_is_not_flagged():
    note = "Return for a blood test if the fever lasts more than three days"
    assert check_conditionals("plan", note, FULL) == []


def test_an_if_first_sentence_is_checked_too():
    note = "If the fever lasts more than three days, follow-up in one week"
    assert check_conditionals("plan", note, FULL)


def test_a_flipped_comparator_with_no_otherwise_is_caught():
    transcript = "If the fever lasts more than three days, come back for a blood test."
    flags = check_conditionals("plan", "Come back for a blood test if the fever lasts less than three days", transcript)
    assert len(flags) == 1


def test_a_note_with_no_condition_or_a_transcript_without_one_raises_nothing():
    assert check_conditionals("plan", "Drink lots of fluids and rest", FULL) == []
    assert check_conditionals("plan", INVERTED_PLAN, "Drink fluids. Rest.") == []


# --- wiring -----------------------------------------------------------------

def test_verify_note_adds_flags_once_and_keeps_existing_ones():
    note = _note(INVERTED_PLAN + "; take 500 mg")
    note["flags"] = ["an earlier flag"]
    verify_note(note, SEGMENTS)
    verify_note(note, SEGMENTS)  # running again must not duplicate
    assert note["flags"][0] == "an earlier flag"
    assert len(note["flags"]) == len(set(note["flags"]))
    assert any("500 mg" in f for f in note["flags"])
    assert any("other case" in f for f in note["flags"])
