// Danh sách chế độ chơi. Thêm chế độ mới: tạo thư mục src/modes/<id>/ theo hướng dẫn
// trong src/modes/README.md rồi đăng ký vào đây.
const temple = require('./temple');

const MODES = {
  [temple.id]: temple
};

function listModes() {
  return Object.values(MODES).map((m) => ({ id: m.id, name: m.name, description: m.description || '' }));
}

module.exports = { MODES, listModes };
