import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { User } from "firebase/auth";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Profile } from "@/features/profile/profile";
import { colors } from "@/theme";
import {
  confirmConnection, connectionErrorMessage, createConnectionInvite, disconnectConnection,
  getConnectionInvitePreview, INVITE_TTL, normalizeConnectionCode, watchConnections,
  watchConnectionInviteSlot, type ConnectionInvitePreview, type ConnectionInviteSlot, type ConnectionRecord,
} from "./connection";

export default function ConnectionPanel({ role }: { role: Profile["role"] }) {
  const { user, profile } = useAuth();
  if (!user || !profile || profile.role !== role) return null;
  return <ConnectionContent key={user.uid} user={user} profile={profile} />;
}
function ConnectionContent({ user, profile }: { user: User; profile: Profile }) {
  const family = profile.role === "family";
  const [people, setPeople] = useState<ConnectionRecord[] | null>(null);
  const [slot, setSlot] = useState<ConnectionInviteSlot | null>(null);
  const [slotReady, setSlotReady] = useState(!family);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ConnectionInvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stop = watchConnections(user.uid, profile.role, setPeople, error => setLoadError(connectionErrorMessage(error)));
    const stopSlot = family ? watchConnectionInviteSlot(user.uid, value => {
      setSlot(value); setSlotReady(true);
    }, error => setLoadError(connectionErrorMessage(error))) : undefined;
    return () => { stop(); stopSlot?.(); };
  }, [user.uid, profile.role, family, retry]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const ready = people !== null && slotReady && !loadError;
  const expiry = slot?.createdAt.toMillis() ?? 0;
  const active = slot?.status === "active" && expiry + INVITE_TTL > now;
  const title = family ? "Người tôi chăm sóc" : "Người thân của tôi";
  const name = (c: ConnectionRecord) => family ? c.seniorDisplayName : c.familyDisplayName;
  async function perform(action: () => Promise<void>) {
    if (busy || !ready) return;
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(connectionErrorMessage(error)); }
    finally { setBusy(false); }
  }
  function askDisconnect(c: ConnectionRecord) {
    Alert.alert("Hủy kết nối?", "Hủy kết nối với " + name(c) + "? Các kết nối khác vẫn giữ nguyên.", [
      { text: "Giữ kết nối", style: "cancel" },
      { text: "Hủy kết nối", style: "destructive",
        onPress: () => void perform(() => disconnectConnection(user, profile, c.id)) },
    ]);
  }
  function checkCode() {
    setPreview(null);
    void perform(async () => setPreview(await getConnectionInvitePreview(user, profile, code)));
  }
  function askConfirm() {
    if (!preview) return;
    Alert.alert("Xác nhận kết nối", "Bạn có muốn kết nối với " + preview.familyDisplayName + " không?", [
      { text: "Kiểm tra lại", style: "cancel" },
      { text: "Xác nhận", onPress: () => void perform(async () => {
        await confirmConnection(user, profile, preview);
        setPreview(null); setCode("");
      }) },
    ]);
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}{people !== null ? " (" + people.length + ")" : ""}</Text>
      {!ready && !loadError && <ActivityIndicator color={colors.primary} />}
      {!!loadError && <>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable style={styles.secondary} onPress={() => {
          setPeople(null); setSlotReady(!family); setLoadError(""); setRetry(n => n + 1);
        }}><Text style={styles.secondaryText}>Thử tải lại</Text></Pressable>
      </>}
      {ready && <>
        {people.length === 0 && <Text style={styles.body}>Chưa có kết nối. Bạn có thể thêm nhiều người.</Text>}
        {people.map(c => (
          <View key={c.id} style={styles.person}>
            <Text style={styles.name}>{name(c)}</Text>
            <Text style={styles.status}>Đã kết nối</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={"Hủy kết nối với " + name(c)}
              disabled={busy} style={styles.secondary} onPress={() => askDisconnect(c)}>
              <Text style={styles.secondaryText}>Hủy kết nối</Text>
            </Pressable>
          </View>
        ))}
        {family ? <>
          <Text style={styles.body}>Tạo mã mới cho mỗi người cao tuổi. Người nhận mã sẽ tự xác nhận.</Text>
          {active && slot && <View style={styles.person}>
            <Text style={styles.status}>MÃ KẾT NỐI</Text>
            <Text selectable style={styles.code}>{slot.inviteCode}</Text>
            <Text style={styles.body}>Hết hạn lúc {new Date(expiry + INVITE_TTL).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</Text>
            <Pressable style={styles.secondary} onPress={() => void perform(async () => {
              await Clipboard.setStringAsync(slot.inviteCode); setMessage("Đã sao chép mã.");
            })} disabled={busy}><Text style={styles.secondaryText}>Sao chép mã</Text></Pressable>
          </View>}
          {slot?.status === "active" && !active && <Text style={styles.body}>Mã cũ đã hết hạn.</Text>}
          {slot?.status === "used" && <Text style={styles.body}>Mã trước đã được sử dụng.</Text>}
          <Pressable accessibilityRole="button" disabled={busy} style={[styles.primary, busy && styles.disabled]}
            onPress={() => void perform(() => createConnectionInvite(user, profile))}>
            <Text style={styles.primaryText}>{active ? "Tạo mã thay thế" : "+ Tạo mã kết nối"}</Text>
          </Pressable>
          <Text style={styles.hint}>8 ký tự, hiệu lực 15 phút, dùng một lần. Tạo mã mới vô hiệu hóa mã chưa dùng trước đó, không hủy các kết nối hiện tại.</Text>
        </> : <>
          <Text style={styles.body}>Thêm người thân bằng mã họ gửi cho bạn.</Text>
          <TextInput accessibilityLabel="Mã kết nối" value={code} editable={!busy}
            onChangeText={value => { setCode(normalizeConnectionCode(value).slice(0, 8)); setPreview(null); setMessage(""); }}
            autoCapitalize="characters" autoCorrect={false} placeholder="Ví dụ: ABCD2345"
            placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable accessibilityRole="button" disabled={busy || code.length !== 8}
            style={[styles.primary, (busy || code.length !== 8) && styles.disabled]} onPress={checkCode}>
            <Text style={styles.primaryText}>Kiểm tra mã</Text>
          </Pressable>
          {preview && <View style={styles.person}>
            <Text style={styles.status}>THÔNG TIN NGƯỜI THÂN</Text>
            <Text style={styles.name}>{preview.familyDisplayName}</Text>
            <Text style={styles.body}>Chỉ xác nhận nếu bạn biết và tin tưởng người này.</Text>
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.primary, busy && styles.disabled]} onPress={askConfirm}>
              <Text style={styles.primaryText}>Xác nhận kết nối</Text>
            </Pressable>
          </View>}
        </>}
      </>}
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  person: { backgroundColor: colors.soft, borderRadius: 14, padding: 14, gap: 8 },
  name: { color: colors.text, fontSize: 19, fontWeight: "800" },
  status: { color: colors.primaryDark, fontSize: 14, fontWeight: "700" },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  code: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: 3 },
  primary: { backgroundColor: colors.primary, borderRadius: 14, minHeight: 52, alignItems: "center", justifyContent: "center", padding: 12 },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: "800", textAlign: "center" },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", padding: 10 },
  secondaryText: { color: colors.primaryDark, fontSize: 15, fontWeight: "700" },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 14, minHeight: 56, paddingHorizontal: 14, color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: 2 },
  disabled: { opacity: 0.55 },
  error: { color: "#B42318", fontSize: 15, lineHeight: 21 },
});
