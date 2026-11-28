import { Platform } from "react-native";

const namespace = "medicare-ai-v2-medication";
export const supportsReminders = Platform.OS === "ios" || Platform.OS === "android";
// Load native notifications lazily so an unsupported Expo Go runtime never blocks auth or medication screens.
let native: Promise<typeof import("expo-notifications")> | undefined;
function loadNotifications() {
  if (!native) {
    native = import("expo-notifications").then(module => {
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
        }),
      });
      return module;
    }).catch(error => { native = undefined; throw error; });
  }
  return native;
}
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}
export async function notificationPermission(ask = false): Promise<boolean> {
  if (!supportsReminders) return false;
  const Notifications = await loadNotifications();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("medication", {
      name: "Nhắc uống thuốc", importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (ask && !permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission.granted;
}
type Slot = {at: number; date: string; time: string};
export function reconcileMedicationReminders(uid: string, slots: Slot[] | null, active: () => boolean = () => true) {
  return serial(async () => {
    if (!supportsReminders || !active()) return 0;
    const Notifications = await loadNotifications();
    if (!active()) return 0;
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync())
      .filter(item => item.content.data?.namespace === namespace);
    // null = no authoritative data yet; retain matching account's last synchronized schedule.
    const desired = slots === null ? null : new Map(slots.map(slot => [
      namespace + ":" + uid + ":" + slot.date + ":" + slot.time, slot,
    ]));
    for (const item of scheduled) {
      if (!active()) return 0;
      if (item.content.data?.ownerUid !== uid || (desired && !desired.has(item.identifier))) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
    if (!desired || !uid) return 0;
    const existing = new Set(scheduled.filter(item => item.content.data?.ownerUid === uid).map(item => item.identifier));
    let count = 0;
    for (const [identifier, slot] of desired) {
      if (!active()) return count;
      if (slot.at <= Date.now()) continue;
      if (!existing.has(identifier)) {
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: "MediCare AI",
            body: "Đến giờ uống thuốc. Hãy mở MediCare AI để xem lịch uống thuốc.",
            data: { namespace, ownerUid: uid },
            sound: "default",
          },
          trigger: {type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(slot.at), channelId: "medication"},
        });
      }
      count++;
    }
    return count;
  });
}
export function clearMedicationReminders() {
  return reconcileMedicationReminders("", []);
}
