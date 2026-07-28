import db from '../db/index.js';
import { getPersons } from './homeAssistant.js';

// On first boot (no members yet), seed the household from Home Assistant's
// person.* entities so nobody has to type family members in by hand. The
// first imported person is made admin so someone can promote/revoke others
// from Settings afterward.
export async function importMembersOnFirstBoot() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM members').get();
  if (count > 0) return;

  const persons = await getPersons();
  if (!persons.length) return;

  const insert = db.prepare(
    'INSERT INTO members (name, ha_person_entity_id, is_admin) VALUES (?, ?, ?)'
  );
  persons.forEach((person, index) => {
    const name = person.attributes?.friendly_name || person.entity_id.replace('person.', '');
    insert.run(name, person.entity_id, index === 0 ? 1 : 0);
  });

  const adminName = persons[0].attributes?.friendly_name || persons[0].entity_id;
  console.log(
    `[bootstrap] imported ${persons.length} household member(s) from Home Assistant (${adminName} set as admin)`
  );
}
