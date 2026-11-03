/**
 * Bản tiếng Anh của phòng Đèn Xanh – Đèn Đỏ (cài đặt lang = 'en'). Bản tiếng Việt giữ nguyên trong index.js / items.js;
 * file này chỉ chứa phần thay thế khi phòng chọn English: giọng đọc, bảng kỹ năng, tên người máy, tên người ảo.
 */

// Giọng đọc (cùng khoá với LINES trong index.js)
const LINES = {
  fakeTurn: ['Boo! Just kidding, keep running!', 'Got you! Just a joke!', 'Boo! Who just froze?'],
  dollSleep: ['The doll fell asleep! Run, run, run!', 'Shh, the doll is snoring. Run as fast as you can!'],
  lobby: [
    'How to play: comment to join. When the music plays, tap the screen to send hearts non stop. More hearts, more distance. Stop before the music stops. If your hearts still arrive after the music stops, you get shot!',
    'A new round is about to start! When the music plays, keep tapping hearts or comment to run faster. Let go when the music is about to stop. Reach the finish line before time runs out to survive!'
  ],
  start: ['Go! Green light, run!', 'Start! Send hearts to run!'],
  green: ['Green light!', 'Run!', 'Green light, go go go!'],
  red: ['Red light!', 'Freeze!', 'The doll is looking, freeze!', 'Red light! The guards are watching!'],
  timeUp: ["Time's up!"],
  noWinner: ['Nobody survived this round. Better luck next round!']
};

// Giọng đọc khi dùng vật phẩm (cùng khoá với ITEM_SAY trong index.js)
const ITEM_SAY = {
  turbo: (n) => `${n} speeds up!`,
  shield: (n) => `${n} got a shield!`,
  clones: (n) => `${n} made a clone!`,
  crowd: (n) => `${n} called five clones!`,
  wind: (n) => `${n} made the doll scream and pushed the leaders back!`,
  giant: (n) => `${n} turned into a giant!`,
  chicken: (n) => `${n} turned the leader into a chicken!`,
  teamShield: (n) => `${n} gave shields to everyone nearby!`,
  stomp: (n) => `${n} called the peg-leg pirate giant to stomp on people!`
};

// Người máy lấp chỗ khi vắng người chơi: biệt danh vui
const NPC_NAMES = ['Lil Bean', 'Captain Nap', 'Sir Wobbles', 'Nugget', 'Pickle', 'Biscuit', 'Tater Tot', 'Mr. Waffles', 'Noodle', 'Cupcake',
  'Sneaky Pete', 'Muffin', 'Gummy Bear', 'Sprinkles', 'Snail Mail', 'Taco Tuesday', 'Dumpling', 'Jellybean', 'Popcorn', 'Meatball',
  'Couch Potato', 'Pancake', 'Peanut', 'Bubbles', 'Cheeseball', 'Banana Bob', 'Hot Sauce', 'Marshmallow', 'Ninja Nana', 'Turbo Turtle'];

// Bảng kỹ năng dưới màn hình (theo kind trong LEGEND); "gift" dùng tên quà TikTok tiếng Anh
const LEGEND = {
  turbo: { label: 'Speed boost', short: 'JOIN + DASH', desc: 'join right away + dash a few steps' },
  clones: { label: 'Clone', short: '1 CLONE', desc: 'a clone dies for you' },
  shove: { label: 'Shove', short: 'SHOVE', desc: 'shove the nearest player down, they get shot' },
  shield: { label: 'Shield', short: 'SHIELD', desc: 'blocks 1 shot, tap safely while the doll looks' },
  revive: { label: 'Revive', short: 'REVIVE 2', desc: 'bring back 2 players who were just shot' },
  wind: { label: 'Doll scream', short: 'PUSH BACK 5', desc: 'push the top 5 players back' },
  giant: { label: 'Giant', short: 'GIANT', desc: 'run 2x for 15 sung seconds, can’t be shot, stomped or shoved' },
  fart: { label: 'Fart bomb', short: 'BOOM 5', desc: 'fart that knocks out the 5 players around you, they get shot' },
  teamShield: { label: 'Team shield', short: 'TEAM SHIELD', desc: 'shields for 10 players around you' },
  stomp: { label: 'Pirate giant', short: (n) => `STOMP ${n}`, desc: (n) => `turn into a giant and stomp up to ${n} players` },
  crowd: { label: '5 clones', short: '5 CLONES', desc: '5 clones run around you and die for you' },
  chicken: { label: 'Chicken', short: 'CHICKEN', desc: 'the leader slows down for 5 seconds' }
};

// Người ảo (chỉ khi chơi thử, chưa live)
const SIM = {
  FIRST: 'Emma Liam Olivia Noah Ava Mason Mia Lucas Zoe Ethan Lily Jack Chloe Leo Ruby Max Ella Sam Grace Ben'.split(' '),
  LAST: 'Smith Johnson Brown Lee Garcia Miller Davis Wilson Moore Taylor Clark Lewis Young King Hill'.split(' '),
  NICKS: ['Lil Bean', 'Captain Nap', 'Sir Wobbles', 'Nugget', 'Pickle', 'Biscuit', 'Tater Tot', 'Mr. Waffles', 'Noodle', 'Cupcake'],
  CHATS: ['join', 'me', '1', 'let me play', 'running!', 'lol', 'who wins', 'red light!', '❤️', 'go go go']
};

// Tên quà TikTok tiếng Anh theo khoá ITEMS (TikTok trả tên quà theo ngôn ngữ vùng kết nối)
const titleCase = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());

module.exports = { LINES, ITEM_SAY, NPC_NAMES, LEGEND, SIM, titleCase };
