/**
 * Canh TikTok LIVE Studio giúp người dẫn: cứ vài giây chụp các cửa sổ của LIVE Studio, đọc chữ (Vision, tiếng Việt +
 * tiếng Anh); thấy hộp xác nhận / cảnh báo mới (ví dụ "Are you still there?", "Xác nhận", "LIVE ended") thì gửi thông
 * báo về điện thoại qua ntfy. Đồng thời hỏi server phòng game: live vừa bị ngắt kết nối thì cũng báo.
 * Chỉ BÁO để người dẫn tự vào bấm — không tự bấm thay.
 *
 * Cần: quyền "Ghi màn hình" cho ứng dụng chạy lệnh này (Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Ghi màn hình).
 *
 *   swiftc -O tools/live-watch/live-watch.swift -o tools/live-watch/live-watch
 *   tools/live-watch/live-watch --topic <tên-kênh-ntfy> [--room phong-squid-game] [--every 5]
 *   tools/live-watch/live-watch --image anh.png        (thử đọc chữ một ảnh, không gửi gì)
 *   tools/live-watch/live-watch --topic <kênh> --test  (gửi thử một thông báo)
 */
import AppKit
import CoreGraphics
import Foundation
import Vision

// Chữ trong hộp xác nhận / cảnh báo (so không phân biệt hoa thường)
let KEYWORDS = [
  "still there", "are you there", "still with us", "confirm", "verify", "verification", "captcha", "unattended",
  "live ended", "live has ended", "has been ended", "suspended", "violation", "warning", "interrupted", "reconnect",
  "còn ở đó", "xác nhận", "xác minh", "cảnh báo", "vi phạm", "đã kết thúc", "tạm ngưng", "bị gián đoạn", "kết nối lại"
]

var args = [String: String]()
var flags = Set<String>()
do {
  var i = 1
  let a = CommandLine.arguments
  while i < a.count {
    let k = a[i]
    if k.hasPrefix("--"), i + 1 < a.count, !a[i + 1].hasPrefix("--") {
      args[String(k.dropFirst(2))] = a[i + 1]
      i += 2
    } else {
      flags.insert(String(k.dropFirst(2)))
      i += 1
    }
  }
}
let topic = args["topic"] ?? ProcessInfo.processInfo.environment["NTFY_TOPIC"] ?? ""
let room = args["room"] ?? "phong-squid-game"
let every = max(2.0, Double(args["every"] ?? "5") ?? 5)
let server = args["server"] ?? "http://localhost:3000"

func log(_ s: String) {
  let f = DateFormatter()
  f.dateFormat = "HH:mm:ss"
  print("[\(f.string(from: Date()))] \(s)")
  fflush(stdout)
}

func readText(_ cg: CGImage) -> [String] {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["vi-VT", "en-US"]
  req.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: cg).perform([req])
  return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}

func matches(_ lines: [String]) -> [String] {
  lines.filter { line in
    let l = line.lowercased()
    return KEYWORDS.contains { l.contains($0) }
  }
}

func notify(_ title: String, _ body: String, high: Bool = true) {
  guard !topic.isEmpty, let url = URL(string: "https://ntfy.sh/\(topic)") else {
    log("(chưa có --topic, không gửi) \(title): \(body)")
    return
  }
  var r = URLRequest(url: url)
  r.httpMethod = "POST"
  r.httpBody = body.data(using: .utf8)
  // tiêu đề header phải là ASCII → để tiếng Việt trong nội dung, tiêu đề tiếng Anh ngắn
  r.setValue(title, forHTTPHeaderField: "Title")
  r.setValue(high ? "urgent" : "default", forHTTPHeaderField: "Priority")
  r.setValue("rotating_light", forHTTPHeaderField: "Tags")
  let sem = DispatchSemaphore(value: 0)
  URLSession.shared.dataTask(with: r) { _, resp, err in
    let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
    log(err == nil && code == 200 ? "đã gửi thông báo: \(title)" : "gửi thông báo lỗi (\(code)) \(err?.localizedDescription ?? "")")
    sem.signal()
  }.resume()
  _ = sem.wait(timeout: .now() + 10)
}

// Cửa sổ đang hiện của LIVE Studio (bỏ các ô nhỏ xíu như biểu tượng)
func studioWindows() -> [(id: CGWindowID, w: Int, h: Int)] {
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
  return list.compactMap { w in
    guard (w[kCGWindowOwnerName as String] as? String ?? "").contains("TikTok LIVE Studio"),
          let id = w[kCGWindowNumber as String] as? CGWindowID,
          let b = w[kCGWindowBounds as String] as? [String: Any],
          let ww = (b["Width"] as? NSNumber)?.intValue, let hh = (b["Height"] as? NSNumber)?.intValue,
          ww >= 120, hh >= 80 else { return nil }
    return (id, ww, hh)
  }
}

let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("live-watch-\(getpid()).png")
func capture(_ id: CGWindowID) -> CGImage? {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
  p.arguments = ["-x", "-o", "-l", String(id), tmp.path]
  p.standardError = FileHandle.nullDevice
  try? p.run()
  p.waitUntilExit()
  guard p.terminationStatus == 0, let img = NSImage(contentsOf: tmp) else { return nil }
  defer { try? FileManager.default.removeItem(at: tmp) }
  return img.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

func tiktokConnected() -> Bool? {
  guard let url = URL(string: "\(server)/api/state?room=\(room)") else { return nil }
  var out: Bool?
  let sem = DispatchSemaphore(value: 0)
  URLSession.shared.dataTask(with: url) { data, _, _ in
    if let data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let t = j["tiktok"] as? [String: Any] { out = t["connected"] as? Bool }
    sem.signal()
  }.resume()
  _ = sem.wait(timeout: .now() + 5)
  return out
}

// ---- chế độ thử ----
if let path = args["image"] {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Không mở được ảnh \(path)")
    exit(1)
  }
  let lines = readText(cg)
  print(lines.joined(separator: "\n"))
  print("--- khớp: \(matches(lines))")
  exit(0)
}
if flags.contains("test") {
  notify("LIVE Studio test", "Thử thông báo từ máy Mac: nếu bạn thấy tin này là đã nhận được cảnh báo LIVE Studio.", high: false)
  exit(0)
}

// ---- canh liên tục ----
if topic.isEmpty { log("Chưa đặt --topic: chỉ in ra màn hình, không gửi về điện thoại.") }
log("Bắt đầu canh LIVE Studio mỗi \(Int(every)) giây (phòng \(room)). Ctrl+C để dừng.")
var seen = Set<String>() // dòng chữ khớp đã thấy ở lần quét trước (chỉ báo dòng MỚI xuất hiện)
var lastSent = [String: Date]()
var firstScan = true
var warnedPermission = false
var wasConnected: Bool?
var lastWindowCount = -1

while true {
  autoreleasepool {
    let wins = studioWindows()
    var now = Set<String>()
    var captured = 0
    for w in wins {
      guard let cg = capture(w.id) else { continue }
      captured += 1
      for m in matches(readText(cg)) { now.insert(m) }
    }
    if !wins.isEmpty && captured == 0 && !warnedPermission {
      warnedPermission = true
      log("⚠️ Không chụp được cửa sổ LIVE Studio — cấp quyền Ghi màn hình cho ứng dụng đang chạy lệnh này rồi chạy lại.")
    }
    if lastWindowCount >= 0 && wins.count > lastWindowCount { log("LIVE Studio mở thêm cửa sổ (\(lastWindowCount) → \(wins.count))") }
    lastWindowCount = wins.count
    let fresh = now.subtracting(seen)
    if !firstScan && !fresh.isEmpty {
      let key = fresh.sorted().joined(separator: " | ")
      if Date().timeIntervalSince(lastSent[key] ?? .distantPast) > 180 {
        lastSent[key] = Date()
        notify("LIVE Studio needs you", "LIVE Studio đang hỏi: \(String(key.prefix(160)))")
      }
    } else if firstScan && !now.isEmpty {
      log("Bỏ qua chữ có sẵn lúc bắt đầu: \(now.sorted().joined(separator: " | ").prefix(200))")
    }
    seen = now
    firstScan = false

    if let c = tiktokConnected() {
      if wasConnected == true && c == false { notify("LIVE disconnected", "Phòng \(room): live vừa bị ngắt kết nối với TikTok. Kiểm tra LIVE Studio.") }
      if wasConnected == false && c == true { log("Phòng \(room) đã kết nối live.") }
      wasConnected = c
    }
  }
  Thread.sleep(forTimeInterval: every)
}
