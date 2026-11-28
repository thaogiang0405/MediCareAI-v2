import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import type { User } from "firebase/auth";
import { useRouter } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Profile } from "@/features/profile/profile";
import { colors } from "@/theme";
import { watchConnections, type ConnectionRecord } from "@/features/connection/connection";
import {
  createMedicationRequest, deleteMedication, medicationErrorMessage,
  reactivateMedication, reviewMedicationRequest, saveMedication, stopMedication,
  watchMedicationIntakeLogs, watchMedicationNotifications, watchMedicationRequests,
  watchMedications, type MedicationIntakeLogRecord, type MedicationNotificationRecord,
  type MedicationRecord, type MedicationRequestRecord, type MedicationRequestType,
} from "./medication";
import {
  MEDICATION_FORMS, medicationValidationError, normalizeMedicationDraft, isCalendarDate,
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
  const router = useRouter();
  const [connections, setConnections] = useState<ConnectionRecord[] | null>(family ? null : []);
  const [seniorUid, setSeniorUid] = useState(family ? "" : user.uid);
  const [medicationSnapshot, setMedicationSnapshot] = useState<{
    scope: string;
    medications: MedicationRecord[];
  } | null>(null);
  const [medicationFailure, setMedicationFailure] = useState<{
    scope: string;
    message: string;
  } | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<MedicationRecord | null>(null);
  const [draft, setDraft] = useState<MedicationDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [retry, setRetry] = useState(0);
  const [editorOwner, setEditorOwner] = useState("");
  const [calendar, setCalendar] = useState<"startDate" | "endDate" | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSnapshot, setRequestSnapshot] = useState<{ scope: string; items: MedicationRequestRecord[] } | null>(null);
  const [intakeSnapshot, setIntakeSnapshot] = useState<{ scope: string; items: MedicationIntakeLogRecord[] } | null>(null);
  const [notificationSnapshot, setNotificationSnapshot] = useState<{ scope: string; items: MedicationNotificationRecord[] } | null>(null);
  const [requestError, setRequestError] = useState("");
  const [intakeError, setIntakeError] = useState("");
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    if (!family) return;
    return watchConnections(
      user.uid,
      "family",
      value => {
        setConnections(value);
        setConnectionError("");
      },
      error => { setConnections(null); setConnectionError(medicationErrorMessage(error)); },
    );
  }, [family, user.uid, retry]);

  const selectedConnection = family && !connectionError
    ? connections?.find(item => item.seniorUid === seniorUid)
    : undefined;
  const selectedSeniorUid = family ? selectedConnection?.seniorUid ?? "" : user.uid;
  const scope = selectedSeniorUid ? selectedSeniorUid + ":" + (selectedConnection?.id ?? "self") + ":" + retry : "";

  useEffect(() => {
    if (!selectedSeniorUid) return;
    return watchMedications(
      selectedSeniorUid,
      value => {
        setMedicationSnapshot({ scope, medications: value });
        setMedicationFailure(null);
      },
      error => {
        setMedicationSnapshot(null);
        setMedicationFailure({ scope, message: medicationErrorMessage(error) });
      },
    );
  }, [selectedSeniorUid, scope]);

  useEffect(() => {
    if (!selectedSeniorUid) return;
    return watchMedicationRequests(
      selectedSeniorUid,
      user.uid,
      profile.role,
      value => {
        setRequestSnapshot({ scope, items: value });
        setRequestError("");
      },
      error => {
        setRequestSnapshot(null);
        setRequestError(medicationErrorMessage(error));
      },
    );
  }, [selectedSeniorUid, scope, user.uid, profile.role]);

  useEffect(() => {
    if (!selectedSeniorUid) return;
    return watchMedicationIntakeLogs(
      selectedSeniorUid,
      value => {
        setIntakeSnapshot({ scope, items: value });
        setIntakeError("");
      },
      error => {
        setIntakeSnapshot(null);
        setIntakeError(medicationErrorMessage(error));
      },
    );
  }, [selectedSeniorUid, scope]);

  useEffect(() => {
    if (!selectedSeniorUid) return;
    return watchMedicationNotifications(
      selectedSeniorUid,
      value => {
        setNotificationSnapshot({ scope, items: value });
        setNotificationError("");
      },
      error => {
        setNotificationSnapshot(null);
        setNotificationError(medicationErrorMessage(error));
      },
    );
  }, [selectedSeniorUid, scope]);

  const requests = scope && requestSnapshot?.scope === scope ? requestSnapshot.items : null;
  const intakeLogs = scope && intakeSnapshot?.scope === scope ? intakeSnapshot.items : null;
  const notifications = scope && notificationSnapshot?.scope === scope ? notificationSnapshot.items : null;

  const medications = scope && medicationSnapshot?.scope === scope
    ? medicationSnapshot.medications
    : null;
  const medicationError = scope && medicationFailure?.scope === scope
    ? medicationFailure.message
    : "";
  const loadError = connectionError || medicationError;

  const visible = useMemo(
    () => (medications ?? []).filter(item => item.status === tab),
    [medications, tab],
  );
  const activeCount = (medications ?? []).filter(item => item.status === "active").length;

  function openCreate() {
    setEditorOwner(scope);
    setCalendar(null);
    setEditing(null);
    setRequestReason("");
    setDraft(EMPTY);
    setEditor(true);
  }

  function openEdit(item: MedicationRecord) {
    setEditorOwner(scope);
    setCalendar(null);
    setEditing(item);
    setRequestReason("");
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

  function changeFrequency(count: number) {
    if (count < 1 || count > 6) return;
    setDraft(current => ({
      ...current,
      frequency: count,
      intakeTimes: Array.from({ length: count }, (_, index) => current.intakeTimes[index] ?? ""),
    }));
  }

  async function submit() {
    if (actionLock.current || !isReady || editorOwner !== scope) return;
    const error = medicationValidationError(draft);
    if (error) {
      Alert.alert("Thông tin thuốc", error);
      return;
    }
    actionLock.current = true;
    setBusy(true);
    try {
      const normalized = normalizeMedicationDraft(draft);
      if (family) {
        await createMedicationRequest(
          user, profile, selectedSeniorUid,
          editing ? "update" : "create",
          editing?.id ?? null,
          normalized.name,
          normalized,
          requestReason,
        );
      } else {
        await saveMedication(user, profile, selectedSeniorUid, editing, normalized);
      }
      setEditor(false);
      Alert.alert("Quản lý thuốc", family
        ? "Đã gửi đề xuất. Người cao tuổi và những người chăm sóc đang kết nối sẽ thấy thông báo trong ứng dụng."
        : (editing ? "Đã cập nhật thông tin thuốc." : "Đã thêm thuốc mới."));
    } catch (error) {
      Alert.alert("Quản lý thuốc", medicationErrorMessage(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  function confirmStop(item: MedicationRecord) {
    const title = family ? "Đề xuất ngừng thuốc?" : "Ngừng sử dụng thuốc?";
    const message = family
      ? "Đề xuất sẽ được gửi cho người cao tuổi. Thuốc vẫn được giữ nguyên cho đến khi họ quyết định."
      : "Thuốc sẽ chuyển sang mục Đã ngừng. Ứng dụng ghi lại thời điểm và thông báo cho những người chăm sóc đang kết nối.";
    Alert.alert(title, message, [
      { text: "Để sau", style: "cancel" },
      {
        text: family ? "Gửi đề xuất" : "Ngừng sử dụng",
        style: "destructive",
        onPress: () => void perform(async () => {
          if (family) {
            await createMedicationRequest(user, profile, selectedSeniorUid, "stop", item.id, item.name, null, "Đề xuất ngừng sử dụng thuốc.");
          } else {
            await stopMedication(user, profile, selectedSeniorUid, item);
            setTab("inactive");
          }
        }, family
          ? "Đã gửi đề xuất ngừng thuốc và thông báo cho gia đình."
          : "Đã ngừng sử dụng thuốc và thông báo cho những người chăm sóc đang kết nối."),
      },
    ]);
  }

  function confirmReactivate(item: MedicationRecord, closeEditor = false) {
    Alert.alert(
      "Sử dụng lại thuốc?",
      "Thuốc sẽ chuyển từ mục Đã ngừng sang Đang sử dụng. Ứng dụng sẽ ghi lại thời điểm và thông báo cho những người chăm sóc đang kết nối.",
      [
        { text: "Để sau", style: "cancel" },
        {
          text: "Sử dụng lại",
          onPress: () => void perform(async () => {
            await reactivateMedication(user, profile, selectedSeniorUid, item);
            setTab("active");
            if (closeEditor) setEditor(false);
          }, "Đã khôi phục thuốc và gửi thông báo cho người chăm sóc."),
        },
      ],
    );
  }

  function confirmDelete(item: MedicationRecord) {
    const title = family ? "Đề xuất xóa thuốc?" : "Xóa thuốc?";
    const message = family
      ? "Đề xuất sẽ được gửi cho người cao tuổi. Thuốc chưa bị xóa khỏi danh sách."
      : "Thuốc sẽ được ẩn khỏi danh sách. Dữ liệu không bị xóa vĩnh viễn.";
    Alert.alert(title, message, [
      { text: "Hủy", style: "cancel" },
      {
        text: family ? "Gửi đề xuất" : "Xóa thuốc",
        style: "destructive",
        onPress: () => void perform(
          () => family
            ? createMedicationRequest(user, profile, selectedSeniorUid, "delete", item.id, item.name, null, "Đề xuất xóa thuốc.")
            : deleteMedication(user, profile, selectedSeniorUid, item),
          family ? "Đã gửi đề xuất xóa thuốc và thông báo cho gia đình." : "Đã chuyển thuốc vào mục đã xóa.",
        ),
      },
    ]);
  }

  function confirmReview(item: MedicationRequestRecord, decision: "approved" | "rejected") {
    const approve = decision === "approved";
    Alert.alert(
      approve ? "Duyệt đề xuất?" : "Từ chối đề xuất?",
      approve
        ? "Nếu đồng ý, thay đổi sẽ được áp dụng vào danh sách thuốc chính thức."
        : "Đề xuất sẽ được đánh dấu từ chối; danh sách thuốc không thay đổi.",
      [
        { text: "Để sau", style: "cancel" },
        {
          text: approve ? "Đồng ý" : "Từ chối",
          style: approve ? "default" : "destructive",
          onPress: () => void perform(
            () => reviewMedicationRequest(user, profile, selectedSeniorUid, item, decision),
            approve ? "Đã duyệt và áp dụng đề xuất." : "Đã từ chối đề xuất.",
          ),
        },
      ],
    );
  }

  function openSchedule() {
    if (!isReady) return;
    router.push({pathname:"/medication-schedule",params:{seniorUid:selectedSeniorUid}});
  }

  async function perform(task: () => Promise<void>, success: string) {
    if (actionLock.current || !isReady) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await task();
      Alert.alert("Quản lý thuốc", success);
    } catch (error) {
      Alert.alert("Quản lý thuốc", medicationErrorMessage(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  const isReady = !!selectedSeniorUid && medications !== null && !loadError;

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.flex}>
          <Text style={styles.title}>{family ? "Quản lý thuốc người thân" : "Thuốc của tôi"}</Text>
          <Text style={styles.subtitle}>{family
            ? "Bạn có thể xem thuốc, ghi nhận đã uống và gửi đề xuất. Chỉ người cao tuổi quyết định thay đổi danh sách thuốc."
            : "Bạn quyết định và quản lý danh sách thuốc của mình. Người chăm sóc chỉ có thể gửi đề xuất."}</Text>
        </View>
        <View style={styles.count}><Text style={styles.countText}>{isReady ? activeCount : "—"}</Text></View>
      </View>

      {family && (
        <View style={styles.selectorGroup}>
          <Text style={styles.fieldLabel}>Người cao tuổi</Text>
          {connections === null ? <ActivityIndicator color={colors.primary} /> : connections.length === 0 ? (
            <Text style={styles.muted}>Bạn chưa có kết nối đang hoạt động.</Text>
          ) : connections.map(person => (
            <Pressable key={person.id} disabled={busy} onPress={() => { setSeniorUid(person.seniorUid); setEditor(false); setCalendar(null); setRetry(value => value + 1); }} style={[styles.personOption, seniorUid === person.seniorUid && styles.personSelected]}>
              <Text style={styles.personOptionText}>{person.seniorDisplayName}</Text>
              <Text style={styles.personCheck}>{seniorUid === person.seniorUid ? "✓" : "›"}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!!loadError && <View style={styles.field}><Text style={styles.error}>{loadError}</Text><Pressable style={styles.secondaryButton} onPress={() => { setEditor(false); setCalendar(null); setRetry(value => value + 1); }}><Text style={styles.secondaryText}>Thử tải lại</Text></Pressable></View>}
      {!selectedSeniorUid && family && <Text style={styles.empty}>Chọn một người cao tuổi để xem danh sách thuốc.</Text>}
      {selectedSeniorUid && medications === null && !loadError && <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải danh sách thuốc...</Text></View>}

      {isReady && (
        <>
          <View style={styles.requestPanel}>
            <Text style={styles.requestHeading}>Thông báo thuốc</Text>
            <Text style={styles.muted}>Thông báo cập nhật theo thời gian thực cho người cao tuổi và tất cả người chăm sóc đang kết nối.</Text>
            {notificationError ? <Text style={styles.error}>{notificationError}</Text> : notifications === null
              ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải thông báo...</Text></View>
              : notifications.length === 0
                ? <Text style={styles.muted}>Chưa có thông báo về thuốc.</Text>
                : notifications.slice(0, 10).map(item => (
                  <View key={item.id} style={styles.notificationCard}>
                    <Text style={styles.detail}>{notificationMessage(item)}</Text>
                    <Text style={styles.muted}>
                      {item.createdAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}
                      {" · "}{item.actorRole === "caregiver" ? "Người chăm sóc" : "Người cao tuổi"}
                    </Text>
                  </View>
                ))}
          </View>
          <View style={styles.requestPanel}>
            <Text style={styles.requestHeading}>{family ? "Đề xuất của bạn" : "Đề xuất từ người chăm sóc"}</Text>
            {requestError ? <Text style={styles.error}>{requestError}</Text> : requests === null
              ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải đề xuất...</Text></View>
              : requests.length === 0
                ? <Text style={styles.muted}>{family ? "Bạn chưa gửi đề xuất nào." : "Chưa có đề xuất cần xem xét."}</Text>
                : requests.slice(0, 8).map(request => {
                  const currentMedication = request.medicationId
                    ? medications?.find(item => item.id === request.medicationId)
                    : undefined;
                  const proposal = request.proposedData;
                  return (
                    <View key={request.id} style={styles.requestCard}>
                      <Text style={styles.medicationName}>{requestTypeLabel(request.requestType)}: {request.medicationName}</Text>
                      <Text style={styles.muted}>Người gửi: {request.requestedByUid.slice(0, 8)} · {requestStatusLabel(request.status)}</Text>
                      {!!currentMedication && <Text style={styles.detail}>
                        Thông tin hiện tại: {currentMedication.name} · {currentMedication.dosage} {currentMedication.dosageUnit} · {currentMedication.frequency} lần/ngày
                      </Text>}
                      {!!proposal && (
                        <View style={styles.requestDetails}>
                          <Text style={styles.requestHeading}>Thông tin đề xuất</Text>
                          <Text style={styles.detail}>Tên thuốc: {proposal.name}{proposal.strengthText ? " · " + proposal.strengthText : ""}</Text>
                          <Text style={styles.detail}>Liều dùng: {proposal.dosage} {proposal.dosageUnit} · Dạng: {MEDICATION_FORMS.find(form => form.value === proposal.dosageForm)?.label ?? "Khác"}</Text>
                          <Text style={styles.detail}>Số lần: {proposal.frequency} lần/ngày · Giờ: {proposal.intakeTimes.join(" · ")}</Text>
                          {!!proposal.directionsText && <Text style={styles.detail}>Hướng dẫn: {proposal.directionsText}</Text>}
                          <Text style={styles.detail}>Thời gian: {proposal.startDate || "Chưa đặt ngày bắt đầu"} – {proposal.endDate || "Không đặt ngày kết thúc"}</Text>
                          {!!proposal.notes && <Text style={styles.detail}>Ghi chú: {proposal.notes}</Text>}
                        </View>
                      )}
                      {!!request.reason && <Text style={styles.detail}>Lý do: {request.reason}</Text>}
                      {!!request.reviewNote && <Text style={styles.detail}>Phản hồi: {request.reviewNote}</Text>}
                      {!family && request.status === "pending" && (
                        <View style={styles.actions}>
                          <Pressable disabled={busy} style={styles.primaryButton} onPress={() => confirmReview(request, "approved")}><Text style={styles.primaryText}>Duyệt và áp dụng</Text></Pressable>
                          <Pressable disabled={busy} style={styles.deleteButton} onPress={() => confirmReview(request, "rejected")}><Text style={styles.deleteText}>Từ chối</Text></Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
          </View>
          {!!intakeError && <Text style={styles.error}>{intakeError}</Text>}
          <View style={styles.requestPanel}>
            <Text style={styles.requestHeading}>Lịch sử ghi nhận uống thuốc</Text>
            <Text style={styles.muted}>Nhật ký do người cao tuổi hoặc người chăm sóc ghi nhận; không phải xác minh y tế độc lập.</Text>
            {intakeLogs === null
              ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Đang tải lịch sử...</Text></View>
              : intakeLogs.length === 0
                ? <Text style={styles.muted}>Chưa có lần uống thuốc nào được ghi nhận.</Text>
                : intakeLogs.slice(0, 10).map(log => (
                  <View key={log.id} style={styles.historyRow}>
                    <View style={styles.flex}>
                      <Text style={styles.detail}>{log.medicationName}</Text>
                      <Text style={styles.muted}>{log.takenAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}</Text>
                    </View>
                    <Text style={styles.historyActor}>{log.recordedByRole === "caregiver" ? "Người chăm sóc" : "Người cao tuổi"}</Text>
                  </View>
                ))}
          </View>
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
              {(() => {
                const latestStatusEvent = notifications?.find(event =>
                  event.medicationId === item.id
                  && (event.eventType === "medication_stopped" || event.eventType === "medication_reactivated")
                );
                if (!latestStatusEvent) return null;
                return <Text style={styles.muted}>
                  {latestStatusEvent.eventType === "medication_stopped" ? "Đã ngừng" : "Đã sử dụng lại"} ngày
                  {" "}{latestStatusEvent.createdAt?.toDate().toLocaleString("vi-VN") ?? "đang cập nhật"}
                  {" · "}{latestStatusEvent.actorName}
                </Text>;
              })()}
              {(() => {
                const latestLog = intakeLogs?.find(log => log.medicationId === item.id);
                return latestLog ? <Text style={styles.muted}>
                  Ghi nhận gần nhất: {latestLog.takenAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}
                  {" · "}{latestLog.recordedByRole === "caregiver" ? "Người chăm sóc" : "Người cao tuổi"}
                </Text> : null;
              })()}
              <View style={styles.actions}>
                {item.status === "active" && <Pressable disabled={busy} style={styles.secondaryButton} onPress={openSchedule}><Text style={styles.secondaryText}>Xác nhận theo lịch</Text></Pressable>}
                <Pressable style={styles.secondaryButton} onPress={() => openEdit(item)}><Text style={styles.secondaryText}>{family ? "Đề xuất chỉnh sửa" : "Chỉnh sửa"}</Text></Pressable>
                {item.status === "active" && <Pressable style={styles.secondaryButton} onPress={() => confirmStop(item)}><Text style={styles.secondaryText}>{family ? "Đề xuất ngừng" : "Ngừng dùng"}</Text></Pressable>}
                {!family && item.status === "inactive" && <Pressable disabled={busy} style={styles.primaryButton} onPress={() => confirmReactivate(item)}><Text style={styles.primaryText}>Sử dụng lại</Text></Pressable>}
                <Pressable style={styles.deleteButton} onPress={() => confirmDelete(item)}><Text style={styles.deleteText}>{family ? "Đề xuất xóa" : "Xóa"}</Text></Pressable>
              </View>
            </View>
          ))}
          <Pressable style={styles.primaryButton} onPress={openCreate}><Text style={styles.primaryText}>{family ? "＋  Đề xuất thêm thuốc" : "＋  Thêm thuốc"}</Text></Pressable>
        </>
      )}

      <Modal visible={editor && isReady && editorOwner === scope} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) { setEditor(false); setCalendar(null); } }}>
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalHeader}>
            <Pressable disabled={busy} onPress={() => setEditor(false)}><Text style={styles.modalCancel}>Đóng</Text></Pressable>
            <Text style={styles.modalTitle}>{family
              ? (editing ? "Đề xuất thay đổi thuốc" : "Đề xuất thêm thuốc")
              : (editing ? "Chỉnh sửa thuốc" : "Thêm thuốc mới")}</Text>
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
            <Text style={styles.fieldLabel}>Số lần sử dụng trong ngày</Text>
            <View style={styles.frequencyRow}>
              <Pressable accessibilityLabel="Giảm số lần" disabled={busy || draft.frequency <= 1} onPress={() => changeFrequency(draft.frequency - 1)} style={[styles.stepButton, draft.frequency <= 1 && styles.disabled]}><Text style={styles.stepText}>−</Text></Pressable>
              <Text style={styles.frequencyValue}>{draft.frequency} lần/ngày</Text>
              <Pressable accessibilityLabel="Tăng số lần" disabled={busy || draft.frequency >= 6} onPress={() => changeFrequency(draft.frequency + 1)} style={[styles.stepButton, draft.frequency >= 6 && styles.disabled]}><Text style={styles.stepText}>+</Text></Pressable>
            </View>
            <Text style={styles.muted}>Chọn từ 1 đến 6 lần theo đơn thuốc.</Text>
            {draft.intakeTimes.map((time, index) => <Field key={index} label={"Giờ uống lần " + (index + 1)} value={time} onChange={value => patch("intakeTimes", draft.intakeTimes.map((current, i) => i === index ? value : current))} placeholder="08:00" />)}
            <Field label="Hướng dẫn sử dụng" value={draft.directionsText} onChange={value => patch("directionsText", value)} placeholder="Theo chỉ định của bác sĩ" multiline />
            <CalendarField label="Ngày bắt đầu" value={draft.startDate} expanded={calendar === "startDate"} onToggle={() => { Keyboard.dismiss(); setCalendar(calendar === "startDate" ? null : "startDate"); }} onSelect={value => { patch("startDate", value); setCalendar(null); }} />
            <CalendarField label="Ngày kết thúc (nếu có)" value={draft.endDate} minDate={draft.startDate} expanded={calendar === "endDate"} onToggle={() => { Keyboard.dismiss(); setCalendar(calendar === "endDate" ? null : "endDate"); }} onSelect={value => { patch("endDate", value); setCalendar(null); }} />
            <Field label="Ghi chú" value={draft.notes} onChange={value => patch("notes", value)} placeholder="Ghi chú thêm" multiline />
            {family && <Field label="Lý do/ghi chú đề xuất" value={requestReason} onChange={setRequestReason} placeholder="Nêu lý do cần người cao tuổi xem xét" multiline />}
            {!family && editing?.status === "inactive" && (
              <Pressable disabled={busy} style={styles.primaryButton} onPress={() => confirmReactivate(editing, true)}>
                <Text style={styles.primaryText}>Sử dụng lại thuốc này</Text>
              </Pressable>
            )}
            <Text style={styles.disclaimer}>{family
              ? "Đây chỉ là đề xuất. Danh sách thuốc không thay đổi cho đến khi người cao tuổi duyệt."
              : "Thông tin thuốc cần căn cứ đơn thuốc hoặc chỉ định chuyên môn. Ứng dụng không tự đề xuất hay thay đổi liều thuốc."}</Text>
            <Pressable disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void submit()}><Text style={styles.primaryText}>{busy ? "Đang xử lý..." : family ? "Gửi đề xuất" : "Lưu thuốc"}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function requestAction(type: MedicationRequestType | null) {
  switch (type) {
    case "create": return "thêm";
    case "update": return "chỉnh sửa";
    case "stop": return "ngừng";
    case "delete": return "xóa";
    default: return "thay đổi";
  }
}

function notificationMessage(item: MedicationNotificationRecord) {
  switch (item.eventType) {
    case "proposal_submitted":
      return item.actorName + " đã đề xuất " + requestAction(item.requestType) + " thuốc " + item.medicationName + ".";
    case "proposal_reviewed":
      return "Người cao tuổi đã " + (item.decision === "approved" ? "duyệt" : "từ chối")
        + " đề xuất " + requestAction(item.requestType) + " thuốc " + item.medicationName + ".";
    case "medication_stopped":
      return item.actorName + " đã ngừng sử dụng thuốc " + item.medicationName + ".";
    case "medication_reactivated":
      return item.actorName + " đã sử dụng lại thuốc " + item.medicationName + ".";
  }
}

function requestTypeLabel(type: MedicationRequestType) {
  switch (type) {
    case "create": return "Đề xuất thêm thuốc";
    case "update": return "Đề xuất chỉnh sửa";
    case "stop": return "Đề xuất ngừng thuốc";
    case "delete": return "Đề xuất xóa thuốc";
  }
}

function requestStatusLabel(status: MedicationRequestRecord["status"]) {
  switch (status) {
    case "pending": return "Chờ người cao tuổi quyết định";
    case "approved": return "Đã được đồng ý";
    case "rejected": return "Đã bị từ chối";
  }
}

function formatDate(value: string) {
  return isCalendarDate(value) ? value.split("-").reverse().join("/") : "Chọn ngày";
}

function CalendarField({ label, value, minDate, expanded, onToggle, onSelect }: {
  label: string; value: string; minDate?: string; expanded: boolean;
  onToggle: () => void; onSelect: (value: string) => void;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable accessibilityRole="button" onPress={onToggle} style={[styles.input, styles.dateButton]}>
      <Text style={styles.dateText}>{formatDate(value)}</Text><Text style={styles.secondaryText}>{expanded ? "Đóng lịch" : "Chọn lịch"}</Text>
    </Pressable>
    {expanded && <Calendar value={value} minDate={minDate} onSelect={onSelect} />}
  </View>;
}

export function Calendar({ value, minDate, onSelect, allowClear = true }: { value: string; minDate?: string; onSelect: (value: string) => void; allowClear?: boolean }) {
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const anchor = isCalendarDate(value) ? value : minDate && isCalendarDate(minDate) && minDate > today ? minDate : today;
  const [month, setMonth] = useState(() => Number(anchor.slice(0, 4)) * 12 + Number(anchor.slice(5, 7)) - 1);
  const year = Math.floor(month / 12);
  const monthIndex = month % 12;
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = Math.ceil((offset + count) / 7);
  return <View style={styles.calendar}>
    <View style={styles.frequencyRow}>
      <Pressable accessibilityLabel="Tháng trước" disabled={month <= 2000 * 12} onPress={() => setMonth(m => m - 1)} style={styles.stepButton}><Text style={styles.stepText}>‹</Text></Pressable>
      <Text style={styles.fieldLabel}>Tháng {monthIndex + 1}/{year}</Text>
      <Pressable accessibilityLabel="Tháng sau" disabled={month >= 2099 * 12 + 11} onPress={() => setMonth(m => m + 1)} style={styles.stepButton}><Text style={styles.stepText}>›</Text></Pressable>
    </View>
    <View style={styles.calendarRow}>{["T2","T3","T4","T5","T6","T7","CN"].map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
    {Array.from({ length: weeks }, (_, week) => <View key={week} style={styles.calendarRow}>
      {Array.from({ length: 7 }, (_, column) => {
        const day = week * 7 + column - offset + 1;
        if (day < 1 || day > count) return <View key={column} style={styles.calendarCell} />;
        const iso = [year, String(monthIndex + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
        const disabled = !!minDate && iso < minDate;
        return <Pressable key={column} accessibilityLabel={formatDate(iso)} accessibilityState={{ selected: iso === value, disabled }} disabled={disabled} onPress={() => onSelect(iso)} style={[styles.calendarCell, iso === value && styles.choiceActive, disabled && styles.disabled]}><Text style={styles.calendarDay}>{day}</Text></Pressable>;
      })}
    </View>)}
    <View style={styles.frequencyRow}>
      {allowClear && <Pressable style={styles.secondaryButton} onPress={() => onSelect("")}><Text style={styles.secondaryText}>Bỏ chọn ngày</Text></Pressable>}
      <Pressable style={[styles.secondaryButton, !!minDate && today < minDate && styles.disabled]} disabled={!!minDate && today < minDate} onPress={() => onSelect(today)}><Text style={styles.secondaryText}>Hôm nay</Text></Pressable>
    </View>
  </View>;
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
  requestPanel: { gap: 9, padding: 12, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  requestHeading: { color: colors.text, fontSize: 16, fontWeight: "800" },
  requestCard: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  requestDetails: { gap: 4, padding: 9, borderRadius: 10, backgroundColor: colors.background },
  notificationCard: { gap: 5, padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyActor: { color: colors.primaryDark, fontSize: 11, fontWeight: "700" },
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
  frequencyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  stepButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft, borderRadius: 12 },
  stepText: { color: colors.primaryDark, fontSize: 27, fontWeight: "800" },
  frequencyValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  dateButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  dateText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  calendar: { padding: 8, gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  calendarRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", color: colors.muted, fontSize: 12, fontWeight: "700" },
  calendarCell: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  calendarDay: { color: colors.text, fontSize: 16, fontWeight: "600" },
  disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
