#!/bin/bash
# Chạy công cụ canh LIVE Studio (xem live-watch.swift). Chạy trong ứng dụng Terminal đã được cấp quyền Ghi màn hình:
#   bash tools/live-watch/start.sh
# Lần đầu tự tạo tên kênh ntfy ngẫu nhiên (lưu ở tools/live-watch/.topic) — đăng ký đúng tên đó trong app ntfy trên điện thoại.
cd "$(dirname "$0")"
if [ ! -s .topic ]; then
  echo "den-do-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 12)" > .topic
fi
TOPIC=$(cat .topic)
if [ ! -x live-watch ] || [ live-watch.swift -nt live-watch ]; then
  echo "Đang biên dịch..."
  swiftc -O live-watch.swift -o live-watch || exit 1
fi
echo "Kênh thông báo ntfy: $TOPIC"
echo "(Điện thoại: cài app ntfy → + → nhập đúng tên kênh trên)"
exec ./live-watch --topic "$TOPIC" "$@"
