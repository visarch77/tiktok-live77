// Danh sách chế độ chơi. Thêm chế độ mới: tạo thư mục src/modes/<id>/ theo hướng dẫn
// trong src/modes/README.md rồi đăng ký vào đây.
const chanting = require('./chanting');
const temple = require('./temple');
const redlight = require('./redlight');
const keoco = require('./keoco');

// Chế độ đầu tiên là mặc định khi tạo phòng mới
const MODES = {
  [chanting.id]: chanting,
  [temple.id]: temple,
  [redlight.id]: redlight,
  [keoco.id]: keoco
};

function listModes() {
  return Object.values(MODES).map((m) => ({ id: m.id, name: m.name, description: m.description || '' }));
}

module.exports = { MODES, listModes };
