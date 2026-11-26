import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  confirmConnection,
  connectionErrorMessage,
  disconnectConnection,
  getConnectionInvitePreview,
  normalizeConnectionCode,
  watchConnection,
  watchConnectionMember,
  type ConnectionInvitePreview,
  type ConnectionMember,
  type ConnectionRecord,
} from "@/features/connection/connection";
import { colors } from "@/theme";

export default function SeniorConnectionPanel() {
  const { user, profile } = useAuth();
  const [member, setMember] = useState<ConnectionMember | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [connection, setConnection] = useState<ConnectionRecord | null>(null);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ConnectionInvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !profile || profile.role !== "senior") return;
    return watchConnectionMember(user.uid, value => {
      setMember(value);
      if (!value || value.status !== "connected") setConnection(null);
      setMemberLoaded(true);
    }, error => setMessage(connectionErrorMessage(error)));
  }, [user, profile]);

  useEffect(() => {
    if (!member || member.status !== "connected") return;
    return watchConnection(member.connectionId, setConnection, error => {
      setMessage(connectionErrorMessage(error));
    });
  }, [member]);

  if (!user || !profile || profile.role !== "senior") return null;

  const connected = member?.status === "connected";

  async function checkCode() {
    if (busy || !user || !profile) return;
    setBusy(true);
    setMessage("");
    setPreview(null);
    try {
      const result = await getConnectionInvitePreview(user, profile, code);
      setPreview(result);
    } catch (error) {
      setMessage(connectionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function performConfirm() {
    if (!preview || !user || !profile || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await confirmConnection(user, profile, preview);
      setPreview(null);
      setCode("");
    } catch (error) {
      setMessage(connectionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function askConfirm() {
    if (!preview) return;
    Alert.alert(
      "Xác nhận kết nối",
      "Bạn có muốn kết nối với " + preview.familyDisplayName + " không?",
      [
        { text: "Kiểm tra lại", style: "cancel" },
        { text: "Xác nhận kết nối", onPress: () => void performConfirm() },
      ],
    );
  }

  async function performDisconnect() {
    if (!user || !profile || busy) return;
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
      "Bạn và người thân sẽ không còn được liên kết. Lịch sử kết nối vẫn được giữ lại và có thể kết nối lại bằng mã mới.",
      [
        { text: "Giữ kết nối", style: "cancel" },
        { text: "Hủy kết nối", style: "destructive", onPress: () => void performDisconnect() },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}><Text style={styles.icon}>♡</Text></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Kết nối người thân</Text>
          <Text style={styles.subtitle}>Nhập mã do người thân gửi cho bạn</Text>
        </View>
      </View>

      {!memberLoaded ? (
        <ActivityIndicator color={colors.primary} />
      ) : connected ? (
        <View style={styles.connectedBox}>
          <Text style={styles.status}>ĐÃ KẾT NỐI</Text>
          <Text style={styles.personName}>{connection?.familyDisplayName ?? "Đang tải thông tin..."}</Text>
          <Text style={styles.description}>Người thân đã được liên kết với tài khoản của bạn.</Text>
          <Pressable style={[styles.secondaryButton, busy && styles.disabled]} disabled={busy} onPress={askDisconnect}>
            <Text style={styles.secondaryButtonText}>{busy ? "Đang xử lý..." : "Hủy kết nối"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.status}>CHƯA KẾT NỐI</Text>
          {member?.status === "disconnected" && (
            <Text style={styles.warning}>Kết nối trước đã được hủy. Bạn có thể nhập mã mới để kết nối lại.</Text>
          )}
          <Text style={styles.description}>Nhập mã 8 ký tự do người thân cung cấp. Bạn sẽ được xem tên người thân trước khi xác nhận.</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={value => {
              setCode(normalizeConnectionCode(value).slice(0, 8));
              setPreview(null);
              setMessage("");
            }}
            placeholder="Ví dụ: ABCD2345"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={() => void checkCode()}
          />
          <Pressable style={[styles.primaryButton, (busy || code.length !== 8) && styles.disabled]} disabled={busy || code.length !== 8} onPress={() => void checkCode()}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Kiểm tra mã</Text>}
          </Pressable>

          {preview && (
            <View style={styles.previewBox}>
              <Text style={styles.status}>THÔNG TIN NGƯỜI THÂN</Text>
              <Text style={styles.personName}>{preview.familyDisplayName}</Text>
              <Text style={styles.description}>Hãy kiểm tra đúng người thân trước khi xác nhận kết nối.</Text>
              <Pressable style={[styles.confirmButton, busy && styles.disabled]} disabled={busy} onPress={askConfirm}>
                <Text style={styles.primaryButtonText}>Xác nhận kết nối</Text>
              </Pressable>
            </View>
          )}
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
  input: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 15, backgroundColor: colors.background, color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: 2 },
  primaryButton: { minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  confirmButton: { minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", marginTop: 4 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  secondaryButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  secondaryButtonText: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  previewBox: { backgroundColor: colors.soft, borderRadius: 15, padding: 14, gap: 8 },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  error: { color: "#B42318", fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.55 },
});
