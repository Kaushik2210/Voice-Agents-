// A stand-in for the API used by the hosted demo build (VITE_DEMO=true).
//
// The real backend needs a local speech model and a local language model, and by
// design recordings never leave the clinic's machine, so it is not hosted. The
// demo serves one note produced by the real pipeline from a synthetic clip (a
// computer voice reading a script) and lets visitors try the review controls.
// State lives in memory only: a reload resets it, and nothing is sent anywhere.
import { FIXTURE } from "./demoData.js";

export const DEMO_UPLOAD_MESSAGE =
  "Uploads are turned off in this demo. Run ClinicScribe locally to process a recording.";

const SECTIONS = ["subjective", "objective", "assessment", "plan"];
const ROLES = ["Clinician", "Patient"];
const clone = (v) => JSON.parse(JSON.stringify(v));
let state = clone(FIXTURE);

function applyEdit(changes) {
  if (state.status !== "ready") throw new Error("This note cannot be edited.");
  const note = state.note;
  for (const [name, text] of Object.entries(changes.sections || {})) {
    if (!SECTIONS.includes(name)) throw new Error(`Unknown section: ${name}`);
    note.sections[name].text = text;
  }
  for (const key of ["allergies", "medications"]) {
    if (Array.isArray(changes[key])) {
      note[key] = changes[key]
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ text, sources: [], edited: true }));
    }
  }
  if (changes.speaker_roles) {
    const speakers = new Set(state.segments.map((s) => s.speaker).filter(Boolean));
    const entries = Object.entries(changes.speaker_roles);
    if (entries.some(([s, r]) => !speakers.has(s) || !ROLES.includes(r))) {
      throw new Error("Unknown speaker or role.");
    }
    if (new Set(entries.map(([, r]) => r)).size !== entries.length) {
      throw new Error("Each role can be given to one speaker only.");
    }
    note.speaker_roles = { ...changes.speaker_roles };
  }
}

function toMarkdown(c) {
  const n = c.note;
  const lines = [`# Consultation note: ${c.patient_ref}`, "", "Status: " + (c.approved_at ? "approved (clinician approved)" : "ready (DRAFT)"), ""];
  for (const flag of n.flags || []) lines.push(`> **Safety flag:** ${flag}`, "");
  lines.push("## Allergies", ...((n.allergies || []).map((a) => `- ${a.text}`).length ? n.allergies.map((a) => `- ${a.text}`) : ["None stated"]), "");
  lines.push("## Current medications", ...((n.medications || []).map((m) => `- ${m.text}`).length ? n.medications.map((m) => `- ${m.text}`) : ["None stated"]), "");
  for (const name of SECTIONS) {
    lines.push(`## ${name[0].toUpperCase()}${name.slice(1)}`, n.sections[name].text, "");
  }
  if (n.action_items?.length) lines.push("## Action items", ...n.action_items.map((i) => `- ${i.text}`), "");
  lines.push(`> ${n.disclaimer}`);
  return lines.join("\n");
}

export const demoApi = {
  demo: true,
  health: async () => ({ api: true, demo: true }),
  list: async () => [
    { id: state.id, created_at: state.created_at, patient_ref: state.patient_ref, status: state.status },
  ],
  get: async () => clone(state),
  create: async () => {
    throw new Error(DEMO_UPLOAD_MESSAGE);
  },
  edit: async (_id, changes) => {
    applyEdit(changes);
    return clone(state);
  },
  approve: async (_id, acknowledged = false) => {
    if (state.status !== "ready") throw new Error("Only a ready note can be approved.");
    if ((state.note.flags || []).length && !acknowledged) {
      throw new Error("This note has safety flags that must be acknowledged.");
    }
    state.status = "approved";
    state.approved_at = new Date().toISOString();
    return clone(state);
  },
  remove: async () => {
    throw new Error("Deleting is turned off in this demo. Reload the page to reset it.");
  },
  exportMarkdown: async () => toMarkdown(state),
};
