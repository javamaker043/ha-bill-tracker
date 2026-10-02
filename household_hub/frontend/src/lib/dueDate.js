// Shared by Bills and Payment Plans so "due soon" means the same thing
// (and looks the same) on both pages instead of two separate definitions
// drifting apart.
export function daysUntilDue(dueDate) {
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(dueDate) - today) / 86400000);
}
