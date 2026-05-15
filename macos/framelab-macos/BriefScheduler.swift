//
//  BriefScheduler.swift
//  framelab-macos
//
//  Scheduler + render runner. Owns the timer that fires the daily render,
//  spawns the Hyperframes CLI, posts a macOS notification when ready, and
//  remembers the last-generated MP4 path.
//

import Foundation
import AppKit
import UserNotifications
import Combine

/// Thread-safe Data buffer the readability handler can write into from
/// any queue without tripping Swift 6 sendable checks.
private final class LockedBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()
    func append(_ chunk: Data) { lock.lock(); data.append(chunk); lock.unlock() }
    func value() -> Data { lock.lock(); defer { lock.unlock() }; return data }
}

@MainActor
final class BriefScheduler: ObservableObject {
    // TODO: make configurable — settings UI button "Pick composition folder".
    private let projectPath = "/Users/barath/Hackathons/morning-demo"

    // Persisted state.
    @Published var scheduledHour: Int {
        didSet { UserDefaults.standard.set(scheduledHour, forKey: "scheduledHour"); reschedule() }
    }
    @Published var scheduledMinute: Int {
        didSet { UserDefaults.standard.set(scheduledMinute, forKey: "scheduledMinute"); reschedule() }
    }
    @Published var enabled: Bool {
        didSet { UserDefaults.standard.set(enabled, forKey: "enabled"); reschedule() }
    }
    @Published var slackEnabled: Bool {
        didSet { UserDefaults.standard.set(slackEnabled, forKey: "slackEnabled") }
    }
    @Published var slackBotToken: String {
        didSet { UserDefaults.standard.set(slackBotToken, forKey: "slackBotToken") }
    }
    @Published var slackChannel: String {
        didSet { UserDefaults.standard.set(slackChannel, forKey: "slackChannel") }
    }

    // Runtime state.
    @Published var isRunning: Bool = false
    @Published var lastRenderPath: String?
    @Published var lastRenderAt: Date?
    @Published var lastError: String?
    @Published var nextFireAt: Date?
    @Published var liveLog: String = ""

    private var timer: Timer?

    init() {
        let d = UserDefaults.standard
        scheduledHour = d.object(forKey: "scheduledHour") as? Int ?? 8
        scheduledMinute = d.object(forKey: "scheduledMinute") as? Int ?? 0
        enabled = d.object(forKey: "enabled") as? Bool ?? true
        slackEnabled = d.object(forKey: "slackEnabled") as? Bool ?? false
        slackBotToken = d.string(forKey: "slackBotToken") ?? ""
        slackChannel = d.string(forKey: "slackChannel") ?? ""
        if let path = d.string(forKey: "lastRenderPath") {
            lastRenderPath = path
        }
        if let ts = d.object(forKey: "lastRenderAt") as? Date {
            lastRenderAt = ts
        }
        reschedule()
    }

    func reschedule() {
        timer?.invalidate()
        timer = nil
        guard enabled else {
            nextFireAt = nil
            return
        }
        let cal = Calendar.current
        let now = Date()
        var comps = cal.dateComponents([.year, .month, .day], from: now)
        comps.hour = scheduledHour
        comps.minute = scheduledMinute
        var fire = cal.date(from: comps) ?? now
        if fire <= now {
            fire = cal.date(byAdding: .day, value: 1, to: fire) ?? fire
        }
        nextFireAt = fire
        let interval = fire.timeIntervalSinceNow
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            Task { @MainActor in
                await self?.generate()
                self?.reschedule() // queue tomorrow
            }
        }
        // Allow the timer to fire while menus / popovers are open.
        if let timer = timer {
            RunLoop.main.add(timer, forMode: .common)
        }
    }

    /// Run `npm run render` in the composition project, then post a macOS notification
    /// with the resulting MP4 path. The path is stored in UserDefaults so the popover
    /// can show "Open latest" after a restart.
    func generate() async {
        guard !isRunning else { return }
        isRunning = true
        lastError = nil
        liveLog = ""
        defer { isRunning = false }

        do {
            let mp4 = try await runRender()
            lastRenderPath = mp4
            lastRenderAt = Date()
            UserDefaults.standard.set(mp4, forKey: "lastRenderPath")
            UserDefaults.standard.set(lastRenderAt, forKey: "lastRenderAt")
            postNotification(mp4Path: mp4)
            if slackEnabled { await postToSlack(mp4Path: mp4) }
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Post a metrics-summary message and upload the MP4 to Slack using a bot
    /// token. Channel accepts either `C0XXXXXXXXX` IDs or `#channel-name`.
    /// Uses the modern files.getUploadURLExternal → PUT → completeUploadExternal
    /// flow, then chat.postMessage for the metrics summary blocks.
    func postToSlack(mp4Path: String) async {
        let token = slackBotToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let channel = slackChannel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty, !channel.isEmpty else { return }

        // Pull metric summary from morning.json if it exists.
        var summaryLine = "Morning brief ready"
        let jsonPath = (projectPath as NSString).appendingPathComponent("morning.json")
        if let data = try? Data(contentsOf: URL(fileURLWithPath: jsonPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            var parts: [String] = []
            if let dau = json["dauNow"]   as? Int { parts.append("DAU \(dau)") }
            if let wau = json["wauNow"]   as? Int { parts.append("WAU \(wau)") }
            if let mrr = json["mrrNow"]   as? Double { parts.append(String(format: "MRR $%.1fK", mrr / 1000)) }
            if let arr = json["arrNow"]   as? Double { parts.append(String(format: "ARR $%.0fK", arr / 1000)) }
            if let s   = json["signups30d"] as? Int { parts.append("\(s) signups · 30d") }
            if !parts.isEmpty { summaryLine = parts.joined(separator: "  ·  ") }
        }

        let mp4Url = URL(fileURLWithPath: mp4Path)
        let filename = mp4Url.lastPathComponent
        guard let fileData = try? Data(contentsOf: mp4Url) else {
            lastError = "Slack: couldn't read MP4 at \(mp4Path)"
            return
        }

        do {
            // 1) Post the metrics blocks message — returns a ts we can thread the video under.
            let postBlocks: [String: Any] = [
                "channel": channel,
                "text": "🌅 Morning brief is ready",
                "blocks": [
                    [
                        "type": "header",
                        "text": ["type": "plain_text", "text": "🌅 Morning brief"]
                    ],
                    [
                        "type": "section",
                        "text": ["type": "mrkdwn", "text": summaryLine]
                    ]
                ]
            ]
            let postJson = try await slackPostJSON(
                token: token, path: "chat.postMessage", body: postBlocks
            )
            // chat.postMessage resolves a channel name → ID. files.completeUploadExternal
            // requires the ID, so always prefer the resolved one.
            let resolvedChannelId = (postJson["channel"] as? String) ?? channel
            _ = postJson["ts"] as? String

            // 2) Get an upload URL.
            var getReq = URLRequest(url: URL(string:
                "https://slack.com/api/files.getUploadURLExternal?filename=\(filename)&length=\(fileData.count)"
            )!)
            getReq.httpMethod = "GET"
            getReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (getData, _) = try await URLSession.shared.data(for: getReq)
            guard
                let getJson = try JSONSerialization.jsonObject(with: getData) as? [String: Any],
                (getJson["ok"] as? Bool) == true,
                let uploadUrlStr = getJson["upload_url"] as? String,
                let fileId = getJson["file_id"] as? String,
                let uploadUrl = URL(string: uploadUrlStr)
            else {
                lastError = "Slack getUploadURLExternal failed: \(String(data: getData, encoding: .utf8) ?? "")"
                return
            }

            // 3) PUT the binary to the upload URL.
            var putReq = URLRequest(url: uploadUrl)
            putReq.httpMethod = "POST"
            putReq.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            putReq.httpBody = fileData
            let (_, putResp) = try await URLSession.shared.data(for: putReq)
            if let http = putResp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                lastError = "Slack file PUT failed: HTTP \(http.statusCode)"
                return
            }

            // 4) Complete the upload and post into the channel as a top-level message.
            let complete: [String: Any] = [
                "files": [["id": fileId, "title": "Morning brief"]],
                "channel_id": resolvedChannelId
            ]
            let completeJson = try await slackPostJSON(
                token: token, path: "files.completeUploadExternal", body: complete
            )
            if (completeJson["ok"] as? Bool) == true {
                liveLog += "\nposted to Slack ✓ (\(filename))\n"
            } else {
                let err = completeJson["error"] as? String ?? "unknown"
                if err == "not_in_channel" {
                    lastError = "Slack: invite @Framelab Morning to that channel."
                } else {
                    lastError = "Slack completeUploadExternal: \(err)"
                }
            }
        } catch {
            lastError = "Slack error: \(error.localizedDescription)"
        }
    }

    private func slackPostJSON(
        token: String, path: String, body: [String: Any]
    ) async throws -> [String: Any] {
        var req = URLRequest(url: URL(string: "https://slack.com/api/\(path)")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await URLSession.shared.data(for: req)
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private func runRender() async throws -> String {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        // Use login shell so /opt/homebrew/bin (npm/node) is on PATH.
        proc.arguments = ["-lc", "cd \"\(projectPath)\" && bash render.sh"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe

        let handle = pipe.fileHandleForReading
        let buffer = LockedBuffer()
        handle.readabilityHandler = { [weak self] h in
            let chunk = h.availableData
            guard !chunk.isEmpty else { return }
            buffer.append(chunk)
            if let s = String(data: chunk, encoding: .utf8) {
                Task { @MainActor in
                    guard let self else { return }
                    self.liveLog.append(s)
                    if self.liveLog.count > 4000 {
                        self.liveLog = String(self.liveLog.suffix(4000))
                    }
                }
            }
        }

        try proc.run()
        proc.waitUntilExit()
        handle.readabilityHandler = nil
        let collected = buffer.value()

        guard proc.terminationStatus == 0 else {
            let tail = String(data: collected.suffix(800), encoding: .utf8) ?? ""
            throw NSError(
                domain: "framelab",
                code: Int(proc.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: "render failed: \(tail)"]
            )
        }

        // render.sh prints the final MP4 absolute path as its last line.
        let out = String(data: collected, encoding: .utf8) ?? ""
        let mp4 = out.split(whereSeparator: \.isNewline)
            .map(String.init)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .last(where: { $0.hasSuffix(".mp4") }) ?? ""
        guard !mp4.isEmpty else {
            throw NSError(
                domain: "framelab",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Render finished but produced no .mp4 path."]
            )
        }
        return mp4
    }

    func openLatest() {
        guard let path = lastRenderPath else { return }
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    func revealLatest() {
        guard let path = lastRenderPath else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    private func postNotification(mp4Path: String) {
        let content = UNMutableNotificationContent()
        content.title = "🌅 Morning brief ready"
        content.body = "Tap to play · \((mp4Path as NSString).lastPathComponent)"
        content.sound = .default
        content.userInfo = ["mp4Path": mp4Path]
        let req = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(req) { _ in }
    }
}
