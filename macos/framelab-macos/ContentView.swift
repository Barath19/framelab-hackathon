//
//  ContentView.swift
//  framelab-macos
//
//  The menubar popover. Shows status, a Generate Now button, the daily
//  schedule, and a way to open the most recent rendered MP4.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var scheduler: BriefScheduler
    @State private var slackConfigExpanded: Bool = false

    private var hourBinding: Binding<Int> {
        Binding(get: { scheduler.scheduledHour },
                set: { scheduler.scheduledHour = $0 })
    }
    private var minuteBinding: Binding<Int> {
        Binding(get: { scheduler.scheduledMinute },
                set: { scheduler.scheduledMinute = $0 })
    }

    private var lastSummary: String {
        if let date = scheduler.lastRenderAt {
            let fmt = RelativeDateTimeFormatter()
            fmt.unitsStyle = .short
            return "Last: " + fmt.localizedString(for: date, relativeTo: Date())
        }
        return "Never run yet."
    }

    private var nextSummary: String {
        guard let next = scheduler.nextFireAt else { return "Paused." }
        let f = DateFormatter()
        f.dateFormat = "EEE · h:mm a"
        return "Next: " + f.string(from: next)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {

            // Header
            HStack(spacing: 8) {
                Image(systemName: "sun.max.fill")
                    .foregroundStyle(.orange)
                Text("Morning")
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Toggle("", isOn: Binding(
                    get: { scheduler.enabled },
                    set: { scheduler.enabled = $0 }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)
            }

            Divider()

            // Status block
            VStack(alignment: .leading, spacing: 4) {
                Text(lastSummary)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Text(nextSummary)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                if let err = scheduler.lastError {
                    Text(err)
                        .font(.system(size: 11))
                        .foregroundStyle(.red)
                        .lineLimit(3)
                }
            }

            // Generate button
            Button {
                Task { await scheduler.generate() }
            } label: {
                HStack {
                    if scheduler.isRunning {
                        ProgressView().controlSize(.small)
                        Text("Generating…")
                    } else {
                        Image(systemName: "wand.and.stars")
                        Text("Generate now")
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(scheduler.isRunning)

            // Open / reveal latest
            HStack(spacing: 8) {
                Button {
                    scheduler.openLatest()
                } label: {
                    Label("Play latest", systemImage: "play.circle")
                        .frame(maxWidth: .infinity)
                }
                .disabled(scheduler.lastRenderPath == nil)
                .buttonStyle(.bordered)

                Button {
                    scheduler.revealLatest()
                } label: {
                    Label("Reveal", systemImage: "folder")
                }
                .disabled(scheduler.lastRenderPath == nil)
                .buttonStyle(.bordered)
            }

            Divider()

            // Schedule pickers
            HStack(spacing: 6) {
                Text("Daily at").font(.system(size: 12)).foregroundStyle(.secondary)
                Picker("", selection: hourBinding) {
                    ForEach(0..<24, id: \.self) { h in
                        Text(String(format: "%02d", h)).tag(h)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(width: 70)

                Text(":")
                Picker("", selection: minuteBinding) {
                    ForEach(Array(stride(from: 0, to: 60, by: 5)), id: \.self) { m in
                        Text(String(format: "%02d", m)).tag(m)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(width: 70)

                Spacer()
            }

            Divider()

            // Slack delivery
            HStack(spacing: 8) {
                Image(systemName: "paperplane.fill")
                    .foregroundStyle(.purple)
                Text("Post to Slack")
                    .font(.system(size: 12))
                Spacer()
                Toggle("", isOn: Binding(
                    get: { scheduler.slackEnabled },
                    set: { scheduler.slackEnabled = $0 }
                ))
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.small)
            }
            if scheduler.slackEnabled {
                let configured = !scheduler.slackBotToken.isEmpty && !scheduler.slackChannel.isEmpty
                if configured && !slackConfigExpanded {
                    HStack(spacing: 6) {
                        Text("→ \(scheduler.slackChannel)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Edit") { slackConfigExpanded = true }
                            .buttonStyle(.borderless)
                            .controlSize(.small)
                            .font(.system(size: 10))
                    }
                } else {
                    SecureField(
                        "xoxb-… bot token",
                        text: Binding(
                            get: { scheduler.slackBotToken },
                            set: { scheduler.slackBotToken = $0 }
                        )
                    )
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11, design: .monospaced))
                    .disableAutocorrection(true)

                    TextField(
                        "Channel ID (C0…) or #channel-name",
                        text: Binding(
                            get: { scheduler.slackChannel },
                            set: { scheduler.slackChannel = $0 }
                        )
                    )
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11, design: .monospaced))
                    .disableAutocorrection(true)

                    HStack {
                        Text("Uploads the MP4 inline after each render.")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        Spacer()
                        if configured {
                            Button("Done") { slackConfigExpanded = false }
                                .buttonStyle(.borderless)
                                .controlSize(.small)
                                .font(.system(size: 10))
                        }
                    }
                }
            }

            // Live log (collapsible)
            if !scheduler.liveLog.isEmpty && scheduler.isRunning {
                Divider()
                ScrollViewReader { proxy in
                    ScrollView {
                        Text(scheduler.liveLog)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(8)
                            .id("log-tail")
                    }
                    .frame(maxHeight: 120)
                    .background(Color.black.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .onChange(of: scheduler.liveLog) { _, _ in
                        proxy.scrollTo("log-tail", anchor: .bottom)
                    }
                }
            }

            Divider()

            HStack {
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .keyboardShortcut("q")
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
                    .controlSize(.small)
            }
        }
        .padding(16)
    }
}

#Preview {
    ContentView()
        .environmentObject(BriefScheduler())
        .frame(width: 360)
}
