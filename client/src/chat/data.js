export const ME = "me";

export const PEOPLE = {
  riya: { name: "Riya Sharma", tone: "violet" },
  kabir: { name: "Kabir Mehta", tone: "mint" },
  meera: { name: "Meera Iyer", tone: "butter" },
  arjun: { name: "Arjun Rao", tone: "coral" },
  zoya: { name: "Zoya Khan", tone: "sky" },
};

export function rememberPerson(userId, name) {
  const key = `u${userId}`;
  PEOPLE[key] ??= { name: name || "Someone", tone: "sky" };
  return key;
}

export const firstName = (name) => name.trim().split(/\s+/)[0] || "";

export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

let seq = 0;
export const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

const HOUR = 3_600_000;

const SCRIPTS = {
  trek: [
    ["riya", "Okay, planning thread for the Kalsubai trek 🏔️", 50.4],
    ["riya", "Saturday or Sunday?", 50.38],
    ["kabir", "Saturday. Sunday I'm dead to the world", 50.1],
    ["meera", "Saturday works for me", 49.9],
    [ME, "Saturday 👍", 49.6],
    ["riya", "Saturday it is", 49.58],
    ["kabir", "Does anyone have a second headlamp? Mine died on the last trip", 27.2],
    ["meera", "I have two, I'll bring the spare", 27.0],
    ["kabir", "legend", 26.98],
    ["riya", "Train or car?", 26.4],
    [ME, "Car is easier for four. I can drive if someone splits fuel", 26.2],
    ["meera", "Splitting fuel 🙋‍♀️", 26.1],
    ["kabir", "Same. I'll handle snacks too", 26.08],
    ["riya", "Kabir's snacks = six packets of chips", 26.0],
    ["kabir", "and? balanced diet", 25.98],
    ["riya", "Weather check: clear till 2pm, some clouds after", 3.1],
    ["riya", "So we should be at the base village by 6:30 latest", 3.08],
    ["meera", "Pickup at 5:45 then?", 2.6],
    [ME, "5:45 works. I'll leave mine at 5:15 and get Meera first", 2.4],
    ["meera", "Perfect", 2.38],
    ["kabir", "I'm setting 3 alarms", 1.2],
    ["riya", "Set 4.", 1.18],
    ["kabir", "Bringing the big thermos btw ☕", 0.5],
    ["meera", "☕☕", 0.45],
    ["riya", "Last thing: everyone carries 2L of water minimum.\nNo excuses this time.", 0.1],
  ],
  riya: [
    ["riya", "Hey! Are you free for a call later?", 30],
    [ME, "After 7 works", 29.8],
    ["riya", "Cool, I'll ring you", 29.7],
    [ME, "Thanks for sorting out the route btw", 4.2],
    ["riya", "Of course 😊", 4.0],
    ["riya", "Did you book parking at the base village?", 0.3],
  ],
  flat: [
    ["arjun", "Rent reminder: due on the 1st 🏠", 74],
    ["zoya", "Paid!", 73.5],
    [ME, "Paid as well", 72.9],
    ["zoya", "Shopping list for the weekend:\n- milk\n- eggs\n- bread\n- dish soap (we're out again)", 6.5],
    ["arjun", "I'll pick those up on the way back", 6.1],
    [ME, "Wifi is acting up again, I've restarted the router", 1.6, "delivered"],
  ],
  zoya: [
    ["zoya", "Sending you the photos from Sunday", 22],
    ["zoya", "📸", 21.99],
    [ME, "These are so good. The sunset one!!", 21.5],
    ["zoya", "Right?? Framing that one", 21.4],
  ],
  arjun: [
    [ME, "Did you get the package I left at the door?", 220],
    ["arjun", "Yep, got it. Thanks!", 219.5],
    ["arjun", "🙏", 219.49],
  ],
};

export const REPLIES = {
  trek: ["Haha fair", "👍", "Noted!", "Can someone remind me on Friday night?", "Okay this is actually happening 🔥", "Kabir, please don't be late"],
  riya: ["Okay cool", "Perfect, thanks!", "😂", "Let me check and get back to you"],
  flat: ["Agreed", "Who's taking the trash out though", "I'll pay you back tonight", "👀"],
  zoya: ["Haha yes", "Omg send more", "📸✨", "Same time next week?"],
  arjun: ["Sounds good", "On it", "👌"],
};

export const INCOMING = [
  { after: 20_000, convo: "flat", from: "arjun", text: "Whoever finished the milk: I see you 🥛" },
  { after: 45_000, convo: "trek", from: "kabir", text: "Also, who's bringing the first aid kit?" },
];

export function seedConversations(now) {
  const build = (id) =>
    SCRIPTS[id].map(([from, text, hoursAgo, status = "read"]) => ({
      id: nextId(),
      from,
      text,
      at: Math.round(now - hoursAgo * HOUR),
      ...(from === ME ? { status } : {}),
    }));

  return [
    { id: "trek", kind: "group", title: "Weekend trek", tone: "butter", members: ["riya", "kabir", "meera"], messages: build("trek"), unread: 3, typing: null },
    { id: "riya", kind: "direct", title: PEOPLE.riya.name, tone: PEOPLE.riya.tone, members: ["riya"], messages: build("riya"), unread: 1, typing: null },
    { id: "flat", kind: "group", title: "Flat 4B", tone: "coral", members: ["arjun", "zoya"], messages: build("flat"), unread: 0, typing: null },
    { id: "zoya", kind: "direct", title: PEOPLE.zoya.name, tone: PEOPLE.zoya.tone, members: ["zoya"], messages: build("zoya"), unread: 0, typing: null },
    { id: "arjun", kind: "direct", title: PEOPLE.arjun.name, tone: PEOPLE.arjun.tone, members: ["arjun"], messages: build("arjun"), unread: 0, typing: null },
  ];
}
