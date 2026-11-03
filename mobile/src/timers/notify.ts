import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Notifier, RunningTimer } from "../../../src/mobile/timers";

// Without this the notification is delivered silently while the app is open, which is the
// case that matters most: the cook is looking at the recipe with their hands full, and a
// banner they have to notice is the whole point.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL = "timers";

/**
 * Android delivers nothing without a channel, and a channel created after the first
 * notification does not retroactively apply to it. Importance MAX is deliberate: a quiet
 * timer in a kitchen is a burnt dinner, which is a different thing from a missed message.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Cooking timers",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 200, 400],
  });
}

/**
 * Asked for the first time when a cook starts a timer, not at launch: permission asked in
 * the moment it is needed, with the reason visible on screen behind the dialog, is the one
 * people grant. Returns false rather than throwing, so a refusal degrades to an on-screen
 * timer instead of an error.
 */
export async function canNotify(): Promise<boolean> {
  const held = await Notifications.getPermissionsAsync();
  if (held.granted) return true;
  if (!held.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export const notifier: Notifier = {
  async schedule(timer: RunningTimer) {
    if (!(await canNotify())) return;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      // The timer's own id, so `cancel` can reach exactly this one. An auto-generated
      // identifier would leave us cancelling by nothing.
      identifier: timer.id,
      content: { title: "Timer finished", body: timer.label, sound: "default" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(timer.endsAt),
        channelId: CHANNEL,
      },
    });
  },
  async cancel(id: string) {
    // Cancelling an identifier that is not scheduled is not an error, which is what makes
    // `rescheduleAll`'s unconditional cancel safe.
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};
