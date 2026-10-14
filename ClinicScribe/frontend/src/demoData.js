// Generated from one real run of the sample recording (synthetic speech, no patient data).
export const FIXTURE = {
    "id":  "demo-0001",
    "created_at":  "2026-10-14T14:00:06.558615",
    "patient_ref":  "MRN-DEMO-001",
    "language":  "",
    "template":  "soap",
    "status":  "ready",
    "error":  null,
    "segments":  [
                     {
                         "start":  0.0,
                         "end":  6.5,
                         "text":  "Good afternoon. Please sit down. What seems to be the problem?",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  6.5,
                         "end":  14.28,
                         "text":  "Doctor, I have had fever and a headache for two days. I also have a dry cough since yesterday.",
                         "speaker":  "Speaker 2"
                     },
                     {
                         "start":  14.28,
                         "end":  21.28,
                         "text":  "Okay. Do you have any other medical conditions, or take any regular medicines?",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  21.28,
                         "end":  28.48,
                         "text":  "Yes, I have diabetes. I take metformin 500 mg twice a day.",
                         "speaker":  "Speaker 2"
                     },
                     {
                         "start":  28.48,
                         "end":  31.56,
                         "text":  "Any allergies to medicines?",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  31.56,
                         "end":  38.12,
                         "text":  "Yes. I am allergic to sulfa drugs. I got a rash once.",
                         "speaker":  "Speaker 2"
                     },
                     {
                         "start":  38.12,
                         "end":  49.92,
                         "text":  "Noted. Let me check you. Your temperature is 100.4 Fahrenheit, blood pressure is 130 over 85, and your lungs are clear.",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  49.92,
                         "end":  55.44,
                         "text":  "This looks like a viral fever. Your diabetes seems stable.",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  55.44,
                         "end":  62.04,
                         "text":  "I will prescribe paracetamol 650 mg, up to three times a day when you have fever.",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  62.04,
                         "end":  67.68,
                         "text":  "Please continue your metformin. Drink lots of fluids and rest.",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  67.68,
                         "end":  76.88,
                         "text":  "If the fever lasts more than three days, come back and we will do a blood test. Otherwise, a follow-up in one week.",
                         "speaker":  "Speaker 1"
                     },
                     {
                         "start":  76.88,
                         "end":  83.84,
                         "text":  "Thank you doctor. You can reach me on [PHONE].",
                         "speaker":  "Speaker 2"
                     }
                 ],
    "redactions":  1,
    "approved_at":  null,
    "note":  {
                 "sections":  {
                                  "subjective":  {
                                                     "text":  "Fever and headache for two days, dry cough since yesterday. Diabetes, takes metformin 500 mg twice a day. Allergic to sulfa drugs.",
                                                     "sources":  [
                                                                     1,
                                                                     3,
                                                                     5
                                                                 ]
                                                 },
                                  "objective":  {
                                                    "text":  "Temperature: 100.4 Fahrenheit, blood pressure: 130 over 85, lungs are clear.",
                                                    "sources":  [
                                                                    6
                                                                ]
                                                },
                                  "assessment":  {
                                                     "text":  "Viral fever, diabetes seems stable.",
                                                     "sources":  [
                                                                     7
                                                                 ]
                                                 },
                                  "plan":  {
                                               "text":  "Prescribe paracetamol 650 mg up to three times a day when you have fever. Continue metformin. Drink lots of fluids and rest. Follow-up in one week if the fever lasts less than three days; otherwise, do a blood test.",
                                               "sources":  [
                                                               8,
                                                               9,
                                                               10
                                                           ]
                                           }
                              },
                 "allergies":  [
                                   {
                                       "text":  "Sulfa drugs",
                                       "sources":  [
                                                       5
                                                   ]
                                   }
                               ],
                 "medications":  [
                                     {
                                         "text":  "Metformin 500 mg twice a day",
                                         "sources":  [
                                                         3
                                                     ]
                                     }
                                 ],
                 "action_items":  [
                                      {
                                          "text":  "Follow-up in one week if the fever lasts less than three days; otherwise, do a blood test.",
                                          "sources":  [
                                                          10
                                                      ]
                                      },
                                      {
                                          "text":  "Drink lots of fluids and rest.",
                                          "sources":  [
                                                          9
                                                      ]
                                      }
                                  ],
                 "flags":  [

                           ],
                 "disclaimer":  "Draft generated by software from a consultation transcript. It must be reviewed and approved by the treating clinician."
             }
};
