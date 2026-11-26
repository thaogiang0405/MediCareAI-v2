import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  connectionErrorMessage,
  createConnectionInvite,
  disconnectConnection,
  watchConnection,
  watchConnectionInviteSlot,
  watchConnectionMember,
  type ConnectionInviteSlot,
  type ConnectionMember,
  type ConnectionRecord,
} from "@/features/connection/connection";
import { colors } from "@/theme";

function expiryText(value: ConnectionInviteSlot["expiresAt"]) {
  return value.toDate().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function FamilyConnectionPanel() {
  const { user, profile } = useAuth();
  const [member, setMember] = useState<ConnectionMember | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [slot, setSlot] = useState<ConnectionInviteSlot | null>(null);
  const [connection, setConnection] = useState<ConnectionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !profile || profile.role !== "family") return;
    return watchConnectionMember(user.uid, value => {
      setMember(value);
      setMemberLoaded(true);
    }, error => setMessage(connectionErrorMessage(error)));
  }, [user?.uid, profile?.role]);

  useEffect(() => {
    if (!user || !profile || profile.role !== "family") return;
    return watchConnectionInviteSlot(user.uid, setSlot, error => {
      setMessage(connectionErrorMessage(error));
    });
  }, [user?.uid, profile?.role]);

  useEffect(() => {
    if (!member || member.status !== "connected") {
      setConnection(null);
      return;
    }
    return watchConnection(member.connectionId, setConnection, error => {
      setMessage(connectionErrorMessage(error));
    });
  }, [member?.connectionId, member?.status]);

  if (!user || !profile || profile.role !== "family") return null;

  const connected = member?.status === "connected";
  const inviteActive = slot?.status === "active" && slot.expiresAt.toMillis() > Date.now();
  const inviteExpired = slot?.status === "active" && slot.expiresAt.toMillis() <= Date.now();

  async function createCode() {
    if (busy || !user || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      const created = await createConnectionInvite(user, profile);
      setSlot(created);
    } catch (error) {
      setMessage(connectionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!slot?.inviteCode) return;
    try {
      await Clipboard.setStringAsync(slot.inviteCode);
      Alert.alert("MediCare AI", "Đã sao chép mã kết nối.");
    } catch {
      setMessage("Chưa thể sao chép mã. Vui lòng thử lại.");
    }
  }

  async function performDisconnect() {
    if (busy || !user || !profile) return;
    setBusy(true);
    setMessage("");
    try {
      await disconnectConnection(user, profile);
    } catch (error) {
      setMessage(connectionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function askDisconnect() {
    Alert.alert(
      "Hủy kết nối?",
      "Hai tài khoản sẽ không còn được liên kết. Lịch sử kết nối vẫn được giữ lại và bạn có thể kết nối lại bằng mã mới.",
      [
        { text: "Giữ kết nối", style: "cancel" },
        { text: "Hủy kết nối", style: "destructive", onPress: () => void performDisconnect() },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}><Text style={styles.icon}>⌂</Text></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Kết nối người thân</Text>
          <Text style={styles.subtitle}>Chia sẻ trạng thái kết nối với người cao tuổi</Text>
        </View>
      </View>

      {!memberLoaded ? (
        <ActivityIndicator color={colors.primary} />
      ) : connected ? (
        <View style={styles.connectedBox}>
          <Text style={styles.status}>ĐÃ KẾT NỐI</Text>
          <Text style={styles.personName}>{connection?.seniorDisplayName ?? "Đang tải thông tin..."}</Text>
          <Text style={styles.description}>Tài khoản người cao tuổi đã được liên kết với bạn.</Text>
          <Pressable style={[styles.secondaryButton, busy && styles.disabled]} disabled={busy} onPress={askDisconnect}>
            <Text style={styles.secondaryButtonText}>{busy ? "Đang xử lý..." : "Hủy kết nối"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.status}>CHƯA KẾT NỐI</Text>
          <Text style={styles.description}>
            Tạo mã và gửi cho người cao tuổi. Người cao tuổi sẽ xem tên của bạn rồi tự xác nhận kết nối.
          </Text>

          {inviteActive && slot ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>MÃ KẾT NỐI</Text>
              <Text selectable style={styles.code}>{slot.inviteCode}</Text>
              <Text style={styles.expiry}>Có hiệu lực đến {expiryText(slot.expiresAt)}</Text>
              <Pressable style={styles.copyButton} onPress={() => void copyCode()}>
                <Text style={styles.copyButtonText}>Sao chép mã</Text>
              </Pressable>
            </View>
          ) : inviteExpired ? (
            <Text style={styles.warning}>Mã trước đã hết hạn. Hãy tạo mã mới.</Text>
          ) : slot?.status === "used" ? (
            <Text style={styles.description}>Mã đã được sử dụng. Đang cập nhật trạng thái kết nối...</Text>
          ) : null}

          {member?.status === "disconnected" && (
            <Text style={styles.warning}>Kết nối trước đã được hủy. Bạn có thể tạo mã mới.</Text>
          )}

          <Pressable style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={() => void createCode()}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{slot ? "Tạo mã mới" : "Tạo mã kết nối"}</Text>}
          </Pressable>
          <Text style={styles.hint}>Mã gồm 8 ký tự, dùng một lần và hết hạn sau 15 phút. Tạo mã mới sẽ vô hiệu hóa mã cũ.</Text>
        </View>
      )}

      {!!message && <Text style={styles.error}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 14 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconCircle: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  icon: { color: colors.primary, fontSize: 23, fontWeight: "800" },
  headingCopy: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  body: { gap: 10 },
  status: { color: colors.primaryDark, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  connectedBox: { backgroundColor: colors.soft, borderRadius: 15, padding: 14, gap: 8 },
  personName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  codeBox: { backgroundColor: colors.soft, borderRadius: 15, padding: 14, alignItems: "center", gap: 7 },
  codeLabel: { color: colors.primaryDark, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  code: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: 4 },
  expiry: { color: colors.muted, fontSize: 12 },
  copyButton: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  copyButtonText: { color: colors.primaryDark, fontSize: 14, fontWeight: "800" },
  primaryButton: { minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  secondaryButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  secondaryButtonText: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  error: { color: "#B42318", fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.55 },
});
