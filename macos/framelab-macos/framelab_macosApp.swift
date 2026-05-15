//
//  framelab_macosApp.swift
//  framelab-macos
//
//  Morning brief — a macOS menubar app that renders a Hyperframes video
//  daily at a scheduled time and pings you with a notification.
//

import SwiftUI
import UserNotifications

@main
struct framelab_macosApp: App {
    @StateObject private var scheduler = BriefScheduler()

    init() {
        // Ask for notification permission once on first launch.
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge]
        ) { _, _ in }
    }

    var body: some Scene {
        MenuBarExtra {
            ContentView()
                .environmentObject(scheduler)
                .frame(width: 360)
        } label: {
            Image(systemName: scheduler.isRunning ? "sun.max.circle.fill" : "sun.max")
        }
        .menuBarExtraStyle(.window)
    }
}
