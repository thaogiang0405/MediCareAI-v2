import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { User } from "firebase/auth";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Profile } from "@/features/profile/profile";
import { watchConnections, type ConnectionRecord } from "@/features/connection/connection";
import {
  loadPrescriptionImage, prescriptionErrorMessage, watchPrescriptions,
  type PrescriptionRecord,
} from "@/features/medication/prescriptions";
import { colors } from "@/theme";

export default function PrescriptionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ seniorUid?: string }>();
  const { user, profile } = useAuth();
  if (!user || !profile) return null;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace(profile.role === "senior" ? "/home/senior" : "/home/family");
        }}>
          <Text style={styles.back}>‹ Quay lại</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ảnh đơn thuốc</Text>
      </View>
      <PrescriptionContent
        user={user}
        profile={profile}
        requestedUid={typeof params.seniorUid === "string" ? params.seniorUid : ""}
      />
    </SafeAreaView>
  );
}

function PrescriptionContent({
  user, profile, requestedUid,
}: {
  user: User;
  profile: Profile;
  requestedUid: string;
}) {
  const family = profile.role === "family";
  const [connections, setConnections] = useState<ConnectionRecord[] | null>(family ? null : []);
  const [chosenUid, setChosenUid] = useState(requestedUid);
  const [connectionError, setConnectionError] = useState("");
  const [records, setRecords] = useState<PrescriptionRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [image, setImage] = useState<{ id: string; uri: string } | null>(null);

  useEffect(() => {
    if (!family) return;
    return watchConnections(user.uid, "family", value => {
      setConnections(value);
      setConnectionError("");
      setChosenUid(current => value.some(item => item.seniorUid === current)
        ? current
        : value[0]?.seniorUid ?? "");
      setImage(null);
    }, () => {
      setConnections(null);
      setConnectionError("Không thể tải danh sách kết nối. Hãy kiểm tra mạng và thử lại.");
      setRecords(null);
      setImage(null);
    });
  }, [family, user.uid]);

  const selectedConnection = family
    ? connections?.find(item => item.seniorUid === chosenUid) ?? connections?.[0]
    : undefined;
  const seniorUid = family ? selectedConnection?.seniorUid ?? "" : user.uid;

  useEffect(() => {
    setImage(null);
    setRecords(null);
    setLoadError("");
    if (!seniorUid) return;
    return watchPrescriptions(seniorUid, value => {
      setRecords(value);
      setLoadError("");
    }, error => {
      setRecords(null);
      setImage(null);
      setLoadError(prescriptionErrorMessage(error));
    });
  }, [seniorUid]);

  async function openImage(record: PrescriptionRecord) {
    if (loadingId) return;
    setLoadingId(record.id);
    try {
      const uri = await loadPrescriptionImage(user, profile, seniorUid, record);
      setImage({ id: record.id, uri });
    } catch (error) {
      Alert.alert("Ảnh đơn thuốc", prescriptionErrorMessage(error));
      setImage(null);
    } finally {
      setLoadingId("");
    }
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>{family ? "Ảnh đơn thuốc của người thân" : "Ảnh đơn thuốc của bạn"}</Text>
          <Text style={styles.muted}>
            Ảnh được lưu trong hồ sơ người cao tuổi. Chỉ chủ hồ sơ và người chăm sóc đang kết nối mới xem được.
          </Text>
        </View>

        {family && (
          <View style={styles.card}>
            <Text style={styles.label}>Chọn hồ sơ người cao tuổi</Text>
            {connections === null
              ? <ActivityIndicator color={colors.primary} />
              : connections.length === 0
                ? <Text style={styles.muted}>Bạn chưa có kết nối gia đình đang hoạt động.</Text>
                : connections.map(item => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: seniorUid === item.seniorUid }}
                    onPress={() => { setChosenUid(item.seniorUid); setImage(null); }}
                    style={[styles.person, seniorUid === item.seniorUid && styles.personActive]}
                  >
                    <Text style={styles.personText}>{item.seniorDisplayName}</Text>
                    <Text style={styles.personCheck}>{seniorUid === item.seniorUid ? "✓" : "›"}</Text>
                  </Pressable>
                ))}
            {!!connectionError && <Text style={styles.error}>{connectionError}</Text>}
          </View>
        )}

        {!!seniorUid && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Đơn thuốc đã lưu</Text>
            {records === null && !loadError
              ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải danh sách ảnh...</Text></View>
              : !!loadError
                ? <Text style={styles.error}>{loadError}</Text>
                : records?.length === 0
                  ? <Text style={styles.muted}>Chưa có ảnh đơn thuốc nào được lưu.</Text>
                  : records?.map(record => (
                    <View key={record.id} style={styles.record}>
                      <View style={styles.recordInfo}>
                        <Text style={styles.recordTitle}>
                          {record.source === "camera" ? "Ảnh chụp bằng camera" : "Ảnh từ thư viện"}
                        </Text>
                        <Text style={styles.muted}>
                          Tải lên bởi {record.uploadedByRole === "caregiver" ? "người chăm sóc" : "người cao tuổi"}
                        </Text>
                        <Text style={styles.muted}>
                          {record.createdAt?.toDate().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) ?? "Đang cập nhật"}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={!!loadingId}
                        onPress={() => void openImage(record)}
                        style={styles.viewButton}
                      >
                        {loadingId === record.id
                          ? <ActivityIndicator color="#FFFFFF" />
                          : <Text style={styles.viewButtonText}>Xem ảnh gốc</Text>}
                      </Pressable>
                    </View>
                  ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!image} transparent animationType="fade" onRequestClose={() => setImage(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Ảnh đơn thuốc gốc</Text>
              <Pressable accessibilityRole="button" onPress={() => setImage(null)}>
                <Text style={styles.close}>Đóng</Text>
              </Pressable>
            </View>
            {image && <Image source={{ uri: image.uri }} style={styles.fullImage} resizeMode="contain" />}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10 },
  back: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  content: { padding: 16, paddingTop: 4, gap: 14, paddingBottom: 32 },
  intro: { gap: 6 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.text, fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  person: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  personActive: { borderColor: colors.primary, backgroundColor: "#E6F4F1" },
  personText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  personCheck: { color: colors.primary, fontSize: 18, fontWeight: "800" },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { color: "#B42318", backgroundColor: "#FEE4E2", borderRadius: 9, padding: 10, fontSize: 14, lineHeight: 20 },
  record: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 },
  recordInfo: { gap: 3 },
  recordTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  viewButton: { backgroundColor: colors.primary, borderRadius: 10, minHeight: 44, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  viewButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", padding: 12, justifyContent: "center" },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, height: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8 },
  close: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  fullImage: { width: "100%", flex: 1, minHeight: 300, backgroundColor: "#111111" },
});
