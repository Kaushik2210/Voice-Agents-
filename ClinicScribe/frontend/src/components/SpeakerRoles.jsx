export const ROLES = ["Clinician", "Patient"];

// One segmented control per speaker: two exclusive choices, applied immediately.
export default function SpeakerRoles({ speakers, roles, disabled, onChange }) {
  return (
    <div className="roles">
      {speakers.map((speaker) => (
        <fieldset key={speaker} className="role-row" disabled={disabled}>
          <legend>Who is {speaker}?</legend>
          <div className="segmented">
            {ROLES.map((role) => (
              <label key={role}>
                <input
                  type="radio"
                  name={`role-${speaker}`}
                  value={role}
                  checked={roles[speaker] === role}
                  onChange={() => onChange(speaker, role)}
                />
                <span>{role}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
