/**
 * The fake week both mock calendars show. Invented titles only: these pages
 * exist so store screenshots never need a real account.
 *
 * Times are decimal hours. `x`/`w` place overlapping events side by side as a
 * fraction of the day column.
 */

export const WEEK = {
  month: "October 2026",
  range: "October 26 – November 1, 2026",
  days: [
    ["Mon", 26], ["Tue", 27], ["Wed", 28], ["Thu", 29], ["Fri", 30], ["Sat", 31], ["Sun", 1],
  ],
  today: 4,
  now: 15.4,
  firstHour: 8,
  lastHour: 20,
};

/** Colour keys, mapped to each calendar's own palette. */
export const ALL_DAY = [
  { day: 0, title: "Q4 planning week", color: "teal", span: 3 },
  { day: 3, title: "Sam out of office", color: "grape" },
  { day: 5, title: "Jordan's birthday", color: "rose" },
];

export const EVENTS = [
  { day: 0, start: 9, end: 9.5, title: "Team standup", where: "Google Meet", color: "blue" },
  { day: 0, start: 10, end: 11.5, title: "Roadmap review", where: "Room 4B", color: "grape" },
  { day: 0, start: 13, end: 14, title: "Lunch with Priya", where: "Café on 5th", color: "sage" },
  { day: 0, start: 15, end: 16, title: "1:1 with Jordan", where: "Zoom", color: "blue" },

  { day: 1, start: 9, end: 9.5, title: "Team standup", where: "Google Meet", color: "blue" },
  { day: 1, start: 11, end: 12, title: "Interview: Senior Engineer", where: "Room 2A", color: "tomato" },
  { day: 1, start: 14, end: 15.5, title: "Design critique", where: "Main office", color: "grape" },
  { day: 1, start: 17.5, end: 18.5, title: "Dentist", where: "Dr. Lee", color: "banana" },

  { day: 2, start: 9, end: 9.5, title: "Team standup", where: "Google Meet", color: "blue" },
  { day: 2, start: 10, end: 12, title: "Focus time", where: "", color: "sage" },
  { day: 2, start: 13.5, end: 14.5, title: "Budget check-in", where: "Finance room", color: "banana" },
  { day: 2, start: 15, end: 16, title: "Vendor negotiation", where: "Zoom", color: "tomato", x: 0, w: 0.5 },
  { day: 2, start: 15.5, end: 16.5, title: "Hiring sync", where: "Room 4B", color: "blue", x: 0.5, w: 0.5 },

  { day: 3, start: 9, end: 9.5, title: "Team standup", where: "Google Meet", color: "blue" },
  { day: 3, start: 10.5, end: 11.5, title: "Customer call: Acme", where: "Teams", color: "grape" },
  { day: 3, start: 12.5, end: 13.5, title: "Therapy", where: "Downtown clinic", color: "rose" },
  { day: 3, start: 16, end: 17.5, title: "Board prep", where: "Exec suite", color: "tomato" },

  { day: 4, start: 9, end: 9.5, title: "Team standup", where: "Google Meet", color: "blue" },
  { day: 4, start: 10, end: 11, title: "Salary review", where: "HR", color: "tomato" },
  { day: 4, start: 12, end: 13, title: "Team lunch", where: "Rooftop", color: "sage" },
  { day: 4, start: 14, end: 15, title: "Product demo", where: "All-hands room", color: "grape" },
  { day: 4, start: 16, end: 17, title: "Retro", where: "Room 4B", color: "blue" },

  { day: 5, start: 10, end: 11.5, title: "Kids' swimming", where: "Leisure centre", color: "banana" },
  { day: 5, start: 18, end: 20, title: "Dinner with friends", where: "Luigi's", color: "rose" },

  { day: 6, start: 11, end: 12.5, title: "Brunch", where: "Home", color: "sage" },
  { day: 6, start: 15, end: 16, title: "Call Mum", where: "", color: "rose" },
];
