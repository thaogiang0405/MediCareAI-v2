import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import type { User } from "firebase/auth";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Profile } from "@/features/profile/profile";
import { colors } from "@/theme";
import { watchConnections, type ConnectionRecord } from "@/features/connection/connection";
import {
  deleteMedication, medicationErrorMessage, saveMedication, stopMedication,
  watchMedications, type MedicationRecord,
} from "./medication";
import {
  MEDICATION_FORMS, medicationValidationError, normalizeMedicationDraft,
  type MedicationDraft, type MedicationForm,
} from "./validation";

const EMPTY: MedicationDraft = {
  name: "", strengthText: "", dosage: "", dosageUnit: "viên", dosageForm: "tablet",
  frequency: 1, intakeTimes: ["08:00"], directionsText: "", startDate: "", endDate: "", notes: "",
};

export default function MedicationPanel() {
  const { user, profile } = useAuth();
  if (!user || !profile) return null;
  return <MedicationContent key={user.uid} user={user} profile={profile} />;
}

function MedicationContent({ user, profile }: { user: User; profile: Profile }) {
  const family = profile.role === "family";
  const [connections, setConnections] = useState<ConnectionRecord[] | null>(family ? null : []);
  const [seniorUid, setSeniorUid] = useState(family ? "" : user.uid);
  const [medications, setMedications] = useState<MedicationRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<MedicationRecord | null>(null);
  const [draft, setDraft] = useState<MedicationDraft>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!family) return;
    return watchConnections(user.uid, "family", setConnections, error => setLoadError(medicationErrorMessage(error)));
  }, [family, user.uid]);

  useEffect(() => {
    if (family && connections && seniorUid && !connections.some(item => item.seniorUid === seniorUid)) {
      setSeniorUid("");
      setMedications(null);
    }
  }, [family, connections, seniorUid]);

  useEffect(() => {
    setMedications(null);
    setLoadError("");
    if (!seniorUid) return;
    return watchMedications(
      seniorUid,
      setMedications,
      error => setLoadError(medicationErrorMessage(error)),
    );
  }, [seniorUid]);

  const visible = useMemo(
    () => (medications ?? []).filter(item => item.status === tab),
    [medications, tab],
  );
  const activeCount = (medications ?? []).filter(item => item.status === "active").length;
  const selectedSenior = connections?.find(item => item.seniorUid === seniorUid);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setEditor(true);
  }

  function openEdit(item: MedicationRecord) {
    setEditing(item);
    setDraft({
      name: item.name, strengthText: item.strengthText, dosage: item.dosage,
      dosageUnit: item.dosageUnit, dosageForm: item.dosageForm,
      frequency: item.frequency, intakeTimes: item.intakeTimes.length ? item.intakeTimes : ["08:00"],
      directionsText: item.directionsText, startDate: item.startDate,
      endDate: item.endDate, notes: item.notes,
    });
    setEditor(true);
  }

  function patch<K extends keyof MedicationDraft>(key: K, value: MedicationDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function changeFrequency(value: string) {
    const count = Math.max(1, Math.min(6, Number.parseInt(value, 10) || 1));
    setDraft(current => ({
      ...current,
      frequency: count,
      intakeTimes: Array.from({ length: count }, (_, index) => current.intakeTimes[index] ?? ""),
    }));
  }

  async function submit() {
    if (busy) return;
    const error = medicationValidationError(draft);
    if (error) {
      Alert.alert("Thông tin thuốc", error);
      return;
    }
    setBusy(true);
    try {
      await saveMedication(user, profile, seniorUid, editing, normalizeMedicationDraft(draft));
      setEditor(false);
      Alert.alert("Quản lý thuốc", editing ? "Đã cập nhật thông tin thuốc." : "Đã thêm thuốc mới.");
    } catch (error) {
      Alert.alert("Quản lý thuốc", medicationErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmStop(item: MedicationRecord) {
    Alert.alert("Ngừng sử dụng thuốc?", "Thuốc sẽ chuyển sang mục Đã ngừng. Dữ liệu vẫn được lưu.", [
      { text: "Để sau", style: "cancel" },
      { text: "Ngừng sử dụng", style: "destructive", onPress: () => void perform(() => stopMedication(user, profile, seniorUid, item), "Đã ngừng sử dụng thuốc.") },
    ]);
  }

  function confirmDelete(item: MedicationRecord) {
    Alert.alert("Xóa thuốc?", "Thuốc sẽ được ẩn khỏi danh sách. Dữ liệu không bị xóa vĩnh viễn.", [
      { text: "Hủy", style: "cancel" },
      { text: "Xóa thuốc", style: "destructive", onPress: () => void perform(() => deleteMedication(user, profile, seniorUid, item), "Đã chuyển thuốc vào mục đã xóa.") },
    ]);
  }

  async function perform(task: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      Alert.alert("Quản lý thuốc", success);
    } catch (error) {
      Alert.alert("Quản lý thuốc", medicationErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const isReady = !!seniorUid && medications !== null && !loadError;

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.flex}>
          <Text style={styles.title}>{family ? "Quản lý thuốc người thân" : "Thuốc của tôi"}</Text>
          <Text style={styles.subtitle}>{family ? "Chọn người cao tuổi để xem và hỗ trợ quản lý thuốc." : "Theo dõi danh sách thuốc đang sử dụng."}</Text>
        </View>
        <View style={styles.count}><Text style={styles.countText}>{family ? (selectedSenior ? activeCount : "—") : activeCount}</Text></View>
      </View>

      {family && (
        <View style={styles.selectorGroup}>
          <Text style={styles.fieldLabel}>Người cao tuổi</Text>
          {connections === null ? <ActivityIndicator color={colors.primary} /> : connections.length === 0 ? (
            <Text style={styles.muted}>Bạn chưa có kết nối đang hoạt động.</Text>
          ) : connections.map(person => (
            <Pressable key={person.id} onPress={() => setSeniorUid(person.seniorUid)} style={[styles.personOption, seniorUid === person.seniorUid && styles.personSelected]}>
              <Text style={styles.personOptionText}>{person.seniorDisplayName}</Text>
              <Text style={styles.personCheck}>{seniorUid === person.seniorUid ? "✓" : "›"}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!loadError && <Text style={styles.error}>{loadError}</Text>}
      {!seniorUid && family && <Text style={styles.empty}>Chọn một người cao tuổi để xem danh sách thuốc.</Text>}
      {seniorUid && medications === null && !loadError && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải danh sách thuốc...</Text></View>}

      {isReady && (
        <>
          <View style={styles.tabs}>
            <Pressable onPress={() => setTab("active")} style={[styles.tab, tab === "active" && styles.tabActive]}>
              <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>Đang sử dụng ({activeCount})</Text>
            </Pressable>
            <Pressable onPress={() => setTab("inactive")} style={[styles.tab, tab === "inactive" && styles.tabActive]}>
              <Text style={[styles.tabText, tab === "inactive" && styles.tabTextActive]}>Đã ngừng ({(medications ?? []).filter(item => item.status === "inactive").length})</Text>
            </Pressable>
          </View>
          {visible.length === 0 ? (
            <Text style={styles.empty}>{tab === "active" ? "Chưa có thuốc nào. Hãy thêm thuốc đầu tiên." : "Chưa có thuốc nào đã ngừng sử dụng."}</Text>
          ) : visible.map(item => (
            <View key={item.id} style={styles.medicationCard}>
              <View style={styles.medicationTop}>
                <View style={styles.flex}>
                  <Text style={styles.medicationName}>{item.name}</Text>
                  {!!item.strengthText && <Text style={styles.muted}>{item.strengthText}</Text>}
                </View>
                <Text style={[styles.status, item.status === "active" ? styles.statusActive : styles.statusInactive]}>{item.status === "active" ? "Đang dùng" : "Đã ngừng"}</Text>
              </View>
              <Text style={styles.detail}>Liều dùng: {item.dosage} {item.dosageUnit}</Text>
              <Text style={styles.detail}>Giờ uống: {item.intakeTimes.length ? item.intakeTimes.join(" · ") : "Chưa thiết lập"}</Text>
              {!!item.directionsText && <Text style={styles.detail}>Hướng dẫn: {item.directionsText}</Text>}
              {!!item.startDate && <Text style={styles.detail}>Bắt đầu: {item.startDate}{item.endDate ? "  •  Kết thúc: " + item.endDate : ""}</Text>}
              {!!item.notes && <Text style={styles.detail}>Ghi chú: {item.notes}</Text>}
              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={() => openEdit(item)}><Text style={styles.secondaryText}>Chỉnh sửa</Text></Pressable>
                {item.status === "active" && <Pressable style={styles.secondaryButton} onPress={() => confirmStop(item)}><Text style={styles.secondaryText}>Ngừng dùng</Text></Pressable>}
                <Pressable style={styles.deleteButton} onPress={() => confirmDelete(item)}><Text style={styles.deleteText}>Xóa</Text></Pressable>
              </View>
            </View>
          ))}
          <Pressable style={styles.primaryButton} onPress={openCreate}><Text style={styles.primaryText}>＋  Thêm thuốc</Text></Pressable>
        </>
      )}

      <Modal visible={editor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && setEditor(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable disabled={busy} onPress={() => setEditor(false)}><Text style={styles.modalCancel}>Đóng</Text></Pressable>
            <Text style={styles.modalTitle}>{editing ? "Chỉnh sửa thuốc" : "Thêm thuốc mới"}</Text>
            <Pressable disabled={busy} onPress={() => void submit()}><Text style={styles.modalSave}>{busy ? "Đang lưu..." : "Lưu"}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Field label="Tên thuốc *" value={draft.name} onChange={value => patch("name", value)} placeholder="Ví dụ: Paracetamol" />
            <Field label="Hàm lượng" value={draft.strengthText} onChange={value => patch("strengthText", value)} placeholder="Ví dụ: 500 mg" />
            <View style={styles.row}>
              <View style={styles.half}><Field label="Liều lượng *" value={draft.dosage} onChange={value => patch("dosage", value)} placeholder="Ví dụ: 1" /></View>
              <View style={styles.half}><Field label="Đơn vị *" value={draft.dosageUnit} onChange={value => patch("dosageUnit", value)} placeholder="viên" /></View>
            </View>
            <Text style={styles.fieldLabel}>Dạng thuốc</Text>
            <View style={styles.formChoices}>{MEDICATION_FORMS.map(form => <Pressable key={form.value} onPress={() => patch("dosageForm", form.value as MedicationForm)} style={[styles.choice, draft.dosageForm === form.value && styles.choiceActive]}><Text style={[styles.choiceText, draft.dosageForm === form.value && styles.choiceTextActive]}>{form.label}</Text></Pressable>)}</View>
            <Field label="Số lần sử dụng trong ngày" value={String(draft.frequency)} onChange={changeFrequency} keyboardType="number-pad" />
            {draft.intakeTimes.map((time, index) => <Field key={index} label={"Giờ uống lần " + (index + 1)} value={time} onChange={value => patch("intakeTimes", draft.intakeTimes.map((current, i) => i === index ? value : current))} placeholder="08:00" />)}
            <Field label="Hướng dẫn sử dụng" value={draft.directionsText} onChange={value => patch("directionsText", value)} placeholder="Theo chỉ định của bác sĩ" multiline />
            <Field label="Ngày bắt đầu (YYYY-MM-DD)" value={draft.startDate} onChange={value => patch("startDate", value)} placeholder="2026-11-27" />
            <Field label="Ngày kết thúc (nếu có)" value={draft.endDate} onChange={value => patch("endDate", value)} placeholder="2026-12-27" />
            <Field label="Ghi chú" value={draft.notes} onChange={value => patch("notes", value)} placeholder="Ghi chú thêm" multiline />
            <Text style={styles.disclaimer}>Thông tin liều dùng do người chăm sóc nhập theo đơn hoặc chỉ định chuyên môn. Ứng dụng không tự đề xuất hay thay đổi liều thuốc.</Text>
            <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void submit()}><Text style={styles.primaryText}>{busy ? "Đang lưu..." : "Lưu thuốc"}</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChange: (value: string) => void;
  placeholder?: string; keyboardType?: "default" | "number-pad"; multiline?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} maxLength={500} style={[styles.input, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 15 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 19, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  count: { minWidth: 38, height: 38, borderRadius: 13, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countText: { color: colors.primaryDark, fontWeight: "800", fontSize: 16 },
  selectorGroup: { gap: 7 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 5 },
  personOption: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center" },
  personSelected: { borderColor: colors.primary, backgroundColor: colors.soft },
  personOptionText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  personCheck: { color: colors.primary, fontSize: 19, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: "#B42318", fontSize: 13 },
  loading: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 12 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 18, lineHeight: 21 },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 6, backgroundColor: colors.background, alignItems: "center" },
  tabActive: { backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.primaryDark },
  medicationCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 12, gap: 6 },
  medicationTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  medicationName: { color: colors.text, fontSize: 17, fontWeight: "800" },
  status: { fontSize: 10, fontWeight: "800", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5, overflow: "hidden" },
  statusActive: { backgroundColor: colors.soft, color: colors.primaryDark },
  statusInactive: { backgroundColor: "#F2F4F7", color: colors.muted },
  detail: { color: colors.text, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 5 },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  secondaryText: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  deleteButton: { backgroundColor: "#FFF1F0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  deleteText: { color: "#B42318", fontSize: 12, fontWeight: "700" },
  primaryButton: { backgroundColor: colors.primary, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, paddingHorizontal: 15 },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { minHeight: 58, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  modalCancel: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  modalSave: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  form: { padding: 18, gap: 13, paddingBottom: 35 },
  field: { gap: 2 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 78, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  formChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12 },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  choiceText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  choiceTextActive: { color: colors.primaryDark },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
