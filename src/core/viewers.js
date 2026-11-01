const { sanitizeUserName, sanitizeWishText } = require('../util/sanitize');

// Giới hạn số người xem lưu trữ mỗi phòng: mỗi người vào phòng đều được ghi nhận, live đông người
// sẽ làm file trạng thái phình to và việc sắp xếp bảng xếp hạng chậm dần theo thời gian
const MAX_VIEWERS = 3000;
const PRUNE_TO_VIEWERS = 2000;
const TOP_CACHE_SIZE = 24;

/**
 * Bảng điểm người xem dùng chung cho mọi chế độ (Công Đức ở chùa, quãng đường khi chạy bộ,
 * điểm đóng góp cho phe khi battle...). Mỗi người: { name, uniqueId, avatar, points, stats, lastNote }.
 */
class ViewerBoard {
  constructor(saved = {}) {
    this.viewers = {};
    for (const [key, v] of Object.entries(saved || {})) {
      this.viewers[key] = normalizeViewer(v);
    }
    this.dirty = true;
    this.topCache = [];
  }

  /**
   * Ghi nhận một lượt tương tác.
   * @param {{user?: string, uniqueId?: string, avatar?: string}} who
   * @param {{points?: number, stats?: Record<string, number>, note?: string}} delta
   */
  record(who = {}, { points = 0, stats = {}, note = '' } = {}) {
    const displayName = sanitizeUserName(who.user || who.uniqueId);
    const uniqueId = who.uniqueId || '';
    const key = (uniqueId || displayName).slice(0, 40);
    if (!this.viewers[key]) {
      this.viewers[key] = {
        name: displayName,
        uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
        avatar: who.avatar || '',
        points: 0,
        stats: {},
        lastNote: ''
      };
    }
    const v = this.viewers[key];
    v.name = displayName;
    if (who.avatar) v.avatar = who.avatar;
    v.points += Number(points) || 0;
    for (const [k, n] of Object.entries(stats)) {
      v.stats[k] = (v.stats[k] || 0) + (Number(n) || 0);
    }
    const cleanNote = sanitizeWishText(note);
    if (cleanNote) v.lastNote = cleanNote;

    // Điểm chỉ tăng, nên chỉ cần sắp xếp lại khi người này đang/đủ điểm lọt Top
    if (
      !this.dirty &&
      (this.topCache.length < TOP_CACHE_SIZE ||
        this.topCache.includes(v) ||
        v.points >= this.topCache[this.topCache.length - 1].points)
    ) {
      this.dirty = true;
    }
    return v;
  }

  top(limit = 6) {
    if (this.dirty) {
      this.topCache = Object.values(this.viewers)
        .sort((a, b) => b.points - a.points)
        .slice(0, TOP_CACHE_SIZE);
      this.dirty = false;
    }
    return this.topCache.slice(0, limit);
  }

  prune() {
    const keys = Object.keys(this.viewers);
    if (keys.length <= MAX_VIEWERS) return;
    const keep = keys
      .map((k) => [k, this.viewers[k]])
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, PRUNE_TO_VIEWERS);
    this.viewers = Object.fromEntries(keep);
    this.dirty = true;
  }

  reset() {
    this.viewers = {};
    this.topCache = [];
    this.dirty = true;
  }

  get size() {
    return Object.keys(this.viewers).length;
  }

  toJSON() {
    this.prune();
    return this.viewers;
  }
}

function normalizeViewer(v = {}) {
  // Hỗ trợ dữ liệu cũ (merit-state.json: merit / incense / gifts / lastWish)
  const stats = { ...(v.stats || {}) };
  if (v.incense != null && stats.incense == null) stats.incense = Number(v.incense) || 0;
  if (v.gifts != null && stats.gifts == null) stats.gifts = Number(v.gifts) || 0;
  return {
    name: v.name || '',
    uniqueId: v.uniqueId || '',
    avatar: v.avatar || '',
    points: Number(v.points ?? v.merit) || 0,
    stats,
    lastNote: v.lastNote ?? v.lastWish ?? ''
  };
}

module.exports = { ViewerBoard };
