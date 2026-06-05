const Database = require("better-sqlite3");
const path = require("path");
const os = require("os");

const DB_PATH =
  process.env.TODO_DB_PATH ||
  path.join(os.homedir(), "AppData", "Roaming", "Projects", "tasks.db");

const PROJECT_NAME = "BandsScope";

const DONE_TASKS = [
  "When you go back to the musicians or events main page it should not revert to your location filter.",
  "X button filter bubble not good for mobile, make it easier to click the small x in mobile mode",
  "Text input bar on message needs to be dynamic",
  "Implement message edit. Users that send a message can be able to edit their message for typos within the first 1 minute after sending.",
  "Notifications for following and messaging should be formatted {display_name} send you a message/started following you with their profile pic instead of Someone sent you a message/started following you.",
  "Users should be able to clear their notifications history.",
  "Show age on profiles for musician accounts.",
  "Age Range Filter needs fixin it can only say 13 - 99 because the number inputs are messed up",
  "SSO",
  "Last Active",
  "Messages need to be ordered by most recent first in messages page",
  "Age filter doesn't work (shows no results)",
  "Age selection doesn't allow 1st and 2nd of the month",
  "Move the profile circle in the nav bar on mobile to the right hand side.",
  "Move the more button from the nav bar in mobile to inside of the profile page.",
  "Date of birth selector reworked",
  "Event posting date selector and time selector reworked",
  "Delay notification settings pop up",
  "Time zone events (pulls time zone from location field)",
  "Reset password check for SSO compatibility",
  "Small not now on nudge",
  "Strong password through apple doesn't give the user a special character, which is needed for the signup",
  "Add a new core page for finding venues + bands and musicians that are not seeking people to jam with. Musicians and bands on the musicians page should not show if they are not seeking anything. Nav icon page for all users, especially fan users to find established bands, venues, and solo performing musicians to follow.",
  "Notify event post. User notified if a venue or band they follow posts an event. User notified if a band they follow is set as a performer in a new event post. Avoid double notifications when band posts event and puts themselves as performer.",
  "Events page sorts the events cards by the event happening soonest, not by posted date",
  "Events should be editable, even if they are expired. Allow users to re-use event posts, make sure it's clear they can do so.",
  "Remove edit profile button in more page",
  "When a user has an unread message the message nav icon should have a green notification count like alerts. New messages should not be in alerts — handled in messages nav icon. Unread messages highlighted in messages page until clicked.",
  "Search filters should have a has profile pic option",
  "Events picture sizing needs to be changed to better fit normal sized flyer sizes when applying picture and viewing an event",
  "Profiles should have an option to have a max of 5 photos",
  "Events post should buffer before they expire — expire 2 hours after the event time so people can still see details if late",
  "Change the title of the discover page to something like 'Find, Follow, or Book Established musicians and bands'",
  "Email templates",
  "Remove genres in common from matching logic and add influences in common.",
  "Age filter doesn't work again",
  "Pagination",
  "Search Bar needs to work better with geocoding",
  "When viewing the list of profiles who someone follows or vice versa have 2 columns of profiles show instead of one on mobile in /following and /followers pages",
  "Re-implement swiping (mobile) / clicking through profile pages when viewing them. Profiles visible when scrolling/clicking should have the same current filters applied on the musicians page.",
  "Add matching toggles in filters to toggle on/off each match case (they're looking for, you're seeking, genres in common). Start toggled on.",
  "Re-order the filters",
  "Exiting filters without pushing apply still applies filters for UX",
  "Changed look of mobile following cards",
  "Blocking Profiles",
  "Reporting Profiles",
  "Change profile/more UI",
  "Fun animation for card loading",
  "Mobile profile view UI",
  "After user uses an email with SSO check if the user is in the system. If not, notify that email does not have an account yet and ask cancel or create account.",
  "When users click follow, message, or viewing RSVP account when not signed in, redirect to sign UP page instead of sign in.",
  "Add more information to the notify signup email and reformat look of it",
  "Remove 'Send another message' button after submitting feedback. Include that it's for Feedback or Questions!",
  "Add quick link to profile fields when the user has an incomplete account (location, Instrument)",
  "Add a view public profile button in profile page",
  "Make sure when entering a profile page from anywhere it always lands at the top of the page",
  "Landing on the connect page should always land at the top when coming from any page BUT a profile page",
  "Things to include in the FAQ: How to block or report someone / How to change your profile info",
  "App seems to be refreshing about every minute or after page reload or entering connect page — causing card animation to re-run. Fix this.",
  "ON MOBILE: entering a profile page should always land at the top (doesn't happen every time)",
  "ON MOBILE: auto scroll down to the last visited profile card after exiting a profile is slow and jittery",
  "Users should be able to share their own profile.",
  "My events and create a new event page need a respective back button to the page last visited",
  "Edit and trash icons on events page should have background so they can be seen on black backgrounds on event cards in my events",
  "Re-word 'They play what you want' and 'You play what they want' on matching card to 'They Play, They Want'",
];

const TODO_TASKS = [
  "DELAYED: SSO through apple and facebook",
];

function main() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  let project = db
    .prepare("SELECT id FROM projects WHERE name = ?")
    .get(PROJECT_NAME);

  if (project) {
    db.prepare("DELETE FROM tasks WHERE project_id = ?").run(project.id);
    db.prepare("DELETE FROM project_notes WHERE project_id = ?").run(project.id);
    console.log(`Cleared existing tasks for "${PROJECT_NAME}" (id ${project.id})`);
  } else {
    const result = db.prepare("INSERT INTO projects (name) VALUES (?)").run(PROJECT_NAME);
    project = { id: result.lastInsertRowid };
    console.log(`Created project "${PROJECT_NAME}" (id ${project.id})`);
  }

  const insertDone = db.prepare(
    "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 1, ?)"
  );
  const insertTodo = db.prepare(
    "INSERT INTO tasks (project_id, text, is_done, position) VALUES (?, ?, 0, ?)"
  );

  const seed = db.transaction(() => {
    DONE_TASKS.forEach((text, i) => {
      insertDone.run(project.id, text, i);
    });
    TODO_TASKS.forEach((text, i) => {
      insertTodo.run(project.id, text, i);
    });
  });

  seed();

  console.log(`Seeded ${DONE_TASKS.length} done tasks and ${TODO_TASKS.length} todo tasks.`);
  db.close();
  process.exit(0);
}

main();
