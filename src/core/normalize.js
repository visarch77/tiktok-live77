/**
 * Bộ chuẩn hoá sự kiện: đưa dữ liệu thô của TikTok (hoặc nền tảng khác sau này) về dạng chung
 * mà mọi chế độ chơi đều hiểu. Chế độ chơi KHÔNG đọc trực tiếp dữ liệu TikTok.
 *
 * Các loại sự kiện chuẩn (event.type):
 *   chat    { user, text }
 *   like    { user, count }                  — đã gộp theo người mỗi ~1,2s
 *   gift    { user, giftName, giftId, coins, count }  — đã tính phần chênh lệch combo
 *   follow  { user }
 *   share   { user }
 *   join    { user }
 * Trong đó user = { user: tên hiển thị, uniqueId: @handle, avatar: url }.
 */

function extractUser(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Thí Chủ';
  const avatar =
    u.profilePictureUrl ||
    u.profilePicture?.url?.[0] ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    u.avatarLarge?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

/**
 * Quà combo (streak) gửi nhiều gói với repeatCount tăng dần rồi 1 gói kết thúc (repeatEnd):
 * chỉ tính phần chênh lệch so với gói trước để không cộng trùng.
 */
class GiftComboTracker {
  constructor(limit = 500) {
    this.map = new Map();
    this.limit = limit;
  }

  normalize(data) {
    const user = extractUser(data);
    const giftObj = data?.gift || data?.giftDetails || data?.extendedGiftInfo || {};
    const giftId = String(data?.giftId || giftObj?.id || 'rose');
    const groupKey = `${user.uniqueId}_${giftId}_${data?.groupId || ''}`;
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));
    const isEnd = Boolean(data?.repeatEnd);

    const prevCount = this.map.get(groupKey) || 0;
    this.map.delete(groupKey);
    if (isEnd) {
      if (repeatCount <= prevCount) return null;
    } else {
      this.map.set(groupKey, repeatCount);
      if (this.map.size > this.limit) {
        this.map.delete(this.map.keys().next().value);
      }
    }
    const count = Math.max(1, repeatCount - prevCount);
    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
    // tiktok-live-connector 2.x: tên quà nằm ở giftDetails.giftName (theo ngôn ngữ vùng kết nối); describe là câu "sent …"
    const giftName = giftObj?.giftName || giftObj?.name || data?.giftName || data?.extendedGiftInfo?.name || giftObj?.describe || 'Hoa Hồng Tâm Thành';

    return {
      type: 'gift',
      user,
      giftId,
      giftName,
      count,
      coins: diamondCount * count
    };
  }
}

/**
 * Gộp lượt thả tim theo từng người trong một khoảng thời gian: TikTok bắn LIKE rất dày,
 * mỗi gói tim mà xử lý riêng thì phải lưu + phát state liên tục.
 */
class LikeBatcher {
  constructor(onFlush, intervalMs = 1200) {
    this.onFlush = onFlush;
    this.intervalMs = intervalMs;
    this.pending = new Map();
    this.timer = null;
  }

  add(user, count) {
    const key = user.uniqueId || user.user || 'anon';
    const entry = this.pending.get(key) || { user, count: 0 };
    entry.count += count;
    if (user.avatar) entry.user = { ...entry.user, avatar: user.avatar };
    this.pending.set(key, entry);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const batch = [...this.pending.values()];
    this.pending.clear();
    for (const { user, count } of batch) {
      this.onFlush({ type: 'like', user, count: Math.min(50, count) });
    }
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}

module.exports = { extractUser, GiftComboTracker, LikeBatcher };
