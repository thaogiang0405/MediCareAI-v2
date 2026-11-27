import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import type { User } from "firebase/auth";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Profile } from "@/features/profile/profile";
import { colors } from "@/theme";
import { watchConnections, type ConnectionRecord } from "@/features/connection/connection";
import {
  createMedicationRequest, deleteMedication, medicationErrorMessage, recordMedicationIntake,
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
  const [caregiverView, setCaregiverView] = useState<"medications" | "activity">("medications");
  const [activityTab, setActivityTab] = useState<"notifications" | "requests" | "history">("notifications");
  const [seniorPickerOpen, setSeniorPickerOpen] = useState(false);
  const [expandedMedicationId, setExpandedMedicationId] = useState<string | null>(null);
  const [moreMedicationActionsId, setMoreMedicationActionsId] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

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

  useEffect(() => {
    if (!family || !connections) return;
    if (!connections.some(item => item.seniorUid === seniorUid)) {
      setSeniorUid(connections[0]?.seniorUid ?? "");
      setTab("active");
      setCaregiverView("medications");
      setActivityTab("notifications");
      setExpandedMedicationId(null);
      setMoreMedicationActionsId(null);
      setExpandedRequestId(null);
      setShowAllNotifications(false);
      setShowAllRequests(false);
      setShowAllHistory(false);
    }
  }, [family, connections, seniorUid]);

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
  const pendingRequestCount = (requests ?? []).filter(item => item.status === "pending").length;

  function selectSenior(uid: string) {
    setSeniorUid(uid);
    setSeniorPickerOpen(false);
    setExpandedMedicationId(null);
    setMoreMedicationActionsId(null);
    setCaregiverView("medications");
    setActivityTab("notifications");
    setTab("active");
    setExpandedRequestId(null);
    setShowAllNotifications(false);
    setShowAllRequests(false);
    setShowAllHistory(false);
    setEditor(false);
    setCalendar(null);
  }

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

  function recordIntake(item: MedicationRecord) {
    Alert.alert(
      "Xác nhận đã uống thuốc?",
      "Chỉ xác nhận nếu người cao tuổi đã thực tế uống thuốc này. Ứng dụng sẽ lưu người ghi nhận và thời điểm.",
      [
        { text: "Để sau", style: "cancel" },
        {
          text: "Xác nhận đã uống",
          onPress: () => void perform(
            () => recordMedicationIntake(user, profile, selectedSeniorUid, item),
            "Đã ghi nhận uống thuốc.",
          ),
        },
      ],
    );
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

  if (family) {
    return (
      <View style={styles.caregiverPanel}>
        <View style={styles.caregiverHeading}>
          <Text style={styles.caregiverEyebrow}>CHĂM SÓC SỨC KHỎE</Text>
          <Text style={styles.caregiverTitle}>Theo dõi thuốc</Text>
          <Text style={styles.caregiverSubtitle}>Xem lịch dùng thuốc, ghi nhận và gửi đề xuất cho người thân.</Text>
        </View>

        <View style={styles.caregiverSelector}>
          <View style={styles.caregiverSelectorTop}>
            <View style={styles.caregiverPersonAvatar}>
              <Text style={styles.caregiverPersonAvatarText}>
                {selectedConnection?.seniorDisplayName.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <View style={styles.caregiverSelectorCopy}>
              <Text style={styles.caregiverEyebrow}>HỒ SƠ ĐANG XEM</Text>
              <Text style={styles.caregiverSelectedName} numberOfLines={1}>
                {selectedConnection?.seniorDisplayName ?? (connections === null ? "Đang tải..." : "Chưa chọn người thân")}
              </Text>
              {selectedConnection && <Text style={styles.caregiverConnectedLabel}>● Đã kết nối</Text>}
            </View>
            {!!connections && connections.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: seniorPickerOpen }}
                style={styles.caregiverChangeButton}
                onPress={() => setSeniorPickerOpen(value => !value)}
              >
                <Text style={styles.caregiverChangeText}>{seniorPickerOpen ? "Đóng" : "Đổi người"}</Text>
              </Pressable>
            )}
          </View>
          {seniorPickerOpen && (connections ?? []).map(person => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityState={{ selected: person.seniorUid === selectedSeniorUid }}
              style={[styles.caregiverPickerOption, person.seniorUid === selectedSeniorUid && styles.caregiverPickerOptionActive]}
              onPress={() => selectSenior(person.seniorUid)}
            >
              <View style={styles.caregiverPickerAvatar}>
                <Text style={styles.caregiverPickerAvatarText}>{person.seniorDisplayName.trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>
              <Text style={styles.caregiverPickerName}>{person.seniorDisplayName}</Text>
              <Text style={styles.caregiverPickerCheck}>{person.seniorUid === selectedSeniorUid ? "✓" : "›"}</Text>
            </Pressable>
          ))}
        </View>

        {connections === null && !connectionError && (
          <View style={styles.caregiverLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.caregiverMuted}>Đang tải danh sách người thân...</Text>
          </View>
        )}
        {!!connectionError && (
          <View style={styles.caregiverNoticeError}>
            <Text style={styles.caregiverErrorText}>{connectionError}</Text>
            <Pressable style={styles.caregiverRetryButton} onPress={() => setRetry(value => value + 1)}>
              <Text style={styles.caregiverRetryText}>Thử tải lại</Text>
            </Pressable>
          </View>
        )}
        {connections?.length === 0 && !connectionError && (
          <View style={styles.caregiverEmpty}>
            <Text style={styles.caregiverEmptyTitle}>Chưa có người thân được kết nối</Text>
            <Text style={styles.caregiverMuted}>Tạo mã kết nối ở phần bên trên để bắt đầu theo dõi thuốc.</Text>
          </View>
        )}
        {selectedSeniorUid && medications === null && !loadError && (
          <View style={styles.caregiverLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.caregiverMuted}>Đang tải dữ liệu thuốc...</Text>
          </View>
        )}
        {!!medicationError && (
          <View style={styles.caregiverNoticeError}>
            <Text style={styles.caregiverErrorText}>{medicationError}</Text>
            <Pressable style={styles.caregiverRetryButton} onPress={() => setRetry(value => value + 1)}>
              <Text style={styles.caregiverRetryText}>Tải lại dữ liệu</Text>
            </Pressable>
          </View>
        )}

        {isReady && (
          <>
            <View style={styles.caregiverOverview}>
              <View style={styles.caregiverMetric}>
                <Text style={styles.caregiverMetricValue}>{activeCount}</Text>
                <Text style={styles.caregiverMetricLabel}>Thuốc đang dùng</Text>
              </View>
              <View style={styles.caregiverMetricDivider} />
              <View style={styles.caregiverMetric}>
                <Text style={styles.caregiverMetricValue}>{requests === null ? "—" : pendingRequestCount}</Text>
                <Text style={styles.caregiverMetricLabel}>Đề xuất chờ</Text>
              </View>
              <View style={styles.caregiverMetricDivider} />
              <View style={styles.caregiverMetric}>
                <Text style={styles.caregiverMetricValue}>{intakeLogs === null ? "—" : intakeLogs.length}</Text>
                <Text style={styles.caregiverMetricLabel}>Ghi nhận gần đây</Text>
              </View>
            </View>

            <View style={styles.caregiverMainTabs}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: caregiverView === "medications" }}
                style={[styles.caregiverMainTab, caregiverView === "medications" && styles.caregiverMainTabActive]}
                onPress={() => setCaregiverView("medications")}
              >
                <Text style={[styles.caregiverMainTabText, caregiverView === "medications" && styles.caregiverMainTabTextActive]}>Thuốc</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: caregiverView === "activity" }}
                style={[styles.caregiverMainTab, caregiverView === "activity" && styles.caregiverMainTabActive]}
                onPress={() => setCaregiverView("activity")}
              >
                <Text style={[styles.caregiverMainTabText, caregiverView === "activity" && styles.caregiverMainTabTextActive]}>Hoạt động</Text>
                {pendingRequestCount > 0 && <View style={styles.caregiverTabBadge}><Text style={styles.caregiverTabBadgeText}>{pendingRequestCount}</Text></View>}
              </Pressable>
            </View>

            {caregiverView === "medications" ? (
              <>
                <View style={styles.caregiverListHeader}>
                  <View style={styles.caregiverListHeading}>
                    <Text style={styles.caregiverSectionTitle}>Danh sách thuốc</Text>
                    <Text style={styles.caregiverMuted}>Thông tin do người cao tuổi quản lý.</Text>
                  </View>
                  <Pressable accessibilityRole="button" disabled={busy} style={[styles.caregiverAddButton, busy && styles.disabled]} onPress={openCreate}>
                    <Text style={styles.caregiverAddButtonText}>+ Đề xuất thêm</Text>
                  </Pressable>
                </View>

                <View style={styles.caregiverMedicineTabs}>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "active" }} onPress={() => setTab("active")} style={[styles.caregiverMedicineTab, tab === "active" && styles.caregiverMedicineTabActive]}>
                    <Text style={[styles.caregiverMedicineTabText, tab === "active" && styles.caregiverMedicineTabTextActive]}>Đang dùng ({activeCount})</Text>
                  </Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === "inactive" }} onPress={() => setTab("inactive")} style={[styles.caregiverMedicineTab, tab === "inactive" && styles.caregiverMedicineTabActive]}>
                    <Text style={[styles.caregiverMedicineTabText, tab === "inactive" && styles.caregiverMedicineTabTextActive]}>Đã ngừng ({(medications ?? []).filter(item => item.status === "inactive").length})</Text>
                  </Pressable>
                </View>

                {visible.length === 0 ? (
                  <View style={styles.caregiverEmpty}>
                    <Text style={styles.caregiverEmptyTitle}>{tab === "active" ? "Chưa có thuốc đang sử dụng" : "Chưa có thuốc đã ngừng"}</Text>
                    <Text style={styles.caregiverMuted}>{tab === "active" ? "Bạn có thể gửi đề xuất thêm thuốc để người cao tuổi xem xét." : "Các thuốc đã ngừng sẽ xuất hiện tại đây."}</Text>
                    {tab === "active" && <Pressable style={styles.caregiverPrimaryButton} onPress={openCreate}><Text style={styles.caregiverPrimaryButtonText}>Đề xuất thêm thuốc</Text></Pressable>}
                  </View>
                ) : visible.map(item => {
                  const expanded = expandedMedicationId === item.id;
                  const showMore = moreMedicationActionsId === item.id;
                  const latestStatusEvent = notifications?.find(event =>
                    event.medicationId === item.id && (event.eventType === "medication_stopped" || event.eventType === "medication_reactivated")
                  );
                  const latestLog = intakeLogs?.find(log => log.medicationId === item.id);
                  return (
                    <View key={item.id} style={styles.caregiverMedicationCard}>
                      <View style={styles.caregiverMedicationHeader}>
                        <View style={styles.caregiverMedicineIcon}><Text style={styles.caregiverMedicineIconText}>Rx</Text></View>
                        <View style={styles.caregiverMedicationNameWrap}>
                          <Text style={styles.caregiverMedicationName}>{item.name}</Text>
                          {!!item.strengthText && <Text style={styles.caregiverMuted}>{item.strengthText}</Text>}
                        </View>
                        <Text style={[styles.caregiverStatusBadge, item.status === "active" ? styles.caregiverStatusActive : styles.caregiverStatusInactive]}>{item.status === "active" ? "Đang dùng" : "Đã ngừng"}</Text>
                      </View>

                      <View style={styles.caregiverMedicationFacts}>
                        <View style={styles.caregiverMedicationFact}>
                          <Text style={styles.caregiverFactLabel}>LIỀU DÙNG</Text>
                          <Text style={styles.caregiverFactValue}>{item.dosage} {item.dosageUnit}</Text>
                        </View>
                        <View style={styles.caregiverMedicationFact}>
                          <Text style={styles.caregiverFactLabel}>GIỜ UỐNG</Text>
                          <Text style={styles.caregiverFactValue}>{item.intakeTimes.length ? item.intakeTimes.join(" · ") : "Chưa thiết lập"}</Text>
                        </View>
                      </View>

                      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.caregiverDetailsToggle} onPress={() => setExpandedMedicationId(expanded ? null : item.id)}>
                        <Text style={styles.caregiverDetailsToggleText}>{expanded ? "Ẩn chi tiết" : "Xem chi tiết thuốc"}</Text>
                        <Text style={styles.caregiverDetailsChevron}>{expanded ? "−" : "+"}</Text>
                      </Pressable>

                      {expanded && (
                        <View style={styles.caregiverMedicationDetails}>
                          <Text style={styles.caregiverDetailText}>Số lần sử dụng: {item.frequency} lần/ngày</Text>
                          {!!item.directionsText && <Text style={styles.caregiverDetailText}>Hướng dẫn: {item.directionsText}</Text>}
                          {!!item.startDate && <Text style={styles.caregiverDetailText}>Ngày bắt đầu: {item.startDate}</Text>}
                          {!!item.endDate && <Text style={styles.caregiverDetailText}>Ngày kết thúc: {item.endDate}</Text>}
                          {!!item.notes && <Text style={styles.caregiverDetailText}>Ghi chú: {item.notes}</Text>}
                          {!!latestStatusEvent && <Text style={styles.caregiverMuted}>{latestStatusEvent.eventType === "medication_stopped" ? "Đã ngừng" : "Đã sử dụng lại"} lúc {latestStatusEvent.createdAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"} · {latestStatusEvent.actorName}</Text>}
                          {!!latestLog && <Text style={styles.caregiverMuted}>Ghi nhận gần nhất: {latestLog.takenAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"} · {latestLog.recordedByRole === "caregiver" ? "Người chăm sóc" : "Người cao tuổi"}</Text>}
                        </View>
                      )}

                      <View style={styles.caregiverMedicationActions}>
                        {item.status === "active" && (
                          <Pressable accessibilityRole="button" disabled={busy} style={[styles.caregiverPrimaryButton, styles.caregiverIntakeButton, busy && styles.disabled]} onPress={() => recordIntake(item)}>
                            <Text style={styles.caregiverPrimaryButtonText}>✓  Đã uống thuốc</Text>
                          </Pressable>
                        )}
                        <Pressable accessibilityRole="button" disabled={busy} style={[styles.caregiverSecondaryButton, busy && styles.disabled]} onPress={() => openEdit(item)}>
                          <Text style={styles.caregiverSecondaryButtonText}>Đề xuất chỉnh sửa</Text>
                        </Pressable>
                      </View>

                      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMore }} style={styles.caregiverMoreToggle} onPress={() => setMoreMedicationActionsId(showMore ? null : item.id)}>
                        <Text style={styles.caregiverMoreToggleText}>{showMore ? "Ẩn thao tác khác" : "Thao tác khác"}</Text>
                        <Text style={styles.caregiverMoreToggleText}>{showMore ? "−" : "+"}</Text>
                      </Pressable>
                      {showMore && (
                        <View style={styles.caregiverMoreActions}>
                          {item.status === "active" && <Pressable accessibilityRole="button" disabled={busy} style={[styles.caregiverWarningButton, busy && styles.disabled]} onPress={() => confirmStop(item)}><Text style={styles.caregiverWarningButtonText}>Đề xuất ngừng thuốc</Text></Pressable>}
                          <Pressable accessibilityRole="button" disabled={busy} style={[styles.caregiverDangerButton, busy && styles.disabled]} onPress={() => confirmDelete(item)}><Text style={styles.caregiverDangerButtonText}>Đề xuất xóa thuốc</Text></Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
                <Text style={styles.caregiverPermissionNote}>Bạn có thể ghi nhận đã uống và gửi đề xuất. Danh sách thuốc chỉ thay đổi sau khi người cao tuổi xem xét và quyết định.</Text>
              </>
            ) : (
              <>
                <View style={styles.caregiverActivityHeader}>
                  <Text style={styles.caregiverSectionTitle}>Hoạt động chăm sóc</Text>
                  <Text style={styles.caregiverMuted}>Thông tin được cập nhật theo thời gian thực.</Text>
                </View>
                <View style={styles.caregiverActivityTabs}>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: activityTab === "notifications" }} style={[styles.caregiverActivityTab, activityTab === "notifications" && styles.caregiverActivityTabActive]} onPress={() => setActivityTab("notifications")}>
                    <Text style={[styles.caregiverActivityTabText, activityTab === "notifications" && styles.caregiverActivityTabTextActive]}>Thông báo {notifications ? "(" + notifications.length + ")" : ""}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: activityTab === "requests" }} style={[styles.caregiverActivityTab, activityTab === "requests" && styles.caregiverActivityTabActive]} onPress={() => setActivityTab("requests")}>
                    <Text style={[styles.caregiverActivityTabText, activityTab === "requests" && styles.caregiverActivityTabTextActive]}>Đề xuất {requests ? "(" + requests.length + ")" : ""}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: activityTab === "history" }} style={[styles.caregiverActivityTab, activityTab === "history" && styles.caregiverActivityTabActive]} onPress={() => setActivityTab("history")}>
                    <Text style={[styles.caregiverActivityTabText, activityTab === "history" && styles.caregiverActivityTabTextActive]}>Lịch sử {intakeLogs ? "(" + intakeLogs.length + ")" : ""}</Text>
                  </Pressable>
                </View>

                {activityTab === "notifications" && (
                  <>
                    {!!notificationError && <Text style={styles.caregiverErrorText}>{notificationError}</Text>}
                    {notifications === null && !notificationError ? (
                      <View style={styles.caregiverLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.caregiverMuted}>Đang tải thông báo...</Text></View>
                    ) : notifications?.length === 0 ? (
                      <View style={styles.caregiverEmpty}><Text style={styles.caregiverEmptyTitle}>Chưa có thông báo thuốc</Text><Text style={styles.caregiverMuted}>Các cập nhật và quyết định liên quan đến thuốc sẽ xuất hiện tại đây.</Text></View>
                    ) : (notifications ?? []).slice(0, showAllNotifications ? 100 : 8).map(item => {
                      const tone = notificationTone(item);
                      const symbol = item.eventType === "proposal_submitted" ? "+" : item.eventType === "proposal_reviewed" ? (item.decision === "approved" ? "✓" : "×") : item.eventType === "medication_stopped" ? "!" : "↻";
                      return (
                        <View key={item.id} style={styles.caregiverEventCard}>
                          <View style={[styles.caregiverEventIcon, tone === "success" && styles.caregiverEventIconSuccess, tone === "warning" && styles.caregiverEventIconWarning, tone === "danger" && styles.caregiverEventIconDanger]}>
                            <Text style={styles.caregiverEventIconText}>{symbol}</Text>
                          </View>
                          <View style={styles.caregiverEventCopy}>
                            <Text style={styles.caregiverEventMessage}>{notificationMessage(item)}</Text>
                            <Text style={styles.caregiverEventMeta}>{item.actorName} · {item.actorRole === "caregiver" ? "Người chăm sóc" : "Người cao tuổi"}</Text>
                            <Text style={styles.caregiverEventTime}>{item.createdAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}</Text>
                          </View>
                        </View>
                      );
                    })}
                    {(notifications?.length ?? 0) > 8 && <Pressable style={styles.caregiverShowMore} onPress={() => setShowAllNotifications(value => !value)}><Text style={styles.caregiverShowMoreText}>{showAllNotifications ? "Thu gọn thông báo" : "Xem thêm thông báo"}</Text></Pressable>}
                  </>
                )}

                {activityTab === "requests" && (
                  <>
                    {!!requestError && <Text style={styles.caregiverErrorText}>{requestError}</Text>}
                    {requests === null && !requestError ? (
                      <View style={styles.caregiverLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.caregiverMuted}>Đang tải đề xuất...</Text></View>
                    ) : requests?.length === 0 ? (
                      <View style={styles.caregiverEmpty}><Text style={styles.caregiverEmptyTitle}>Bạn chưa gửi đề xuất nào</Text><Text style={styles.caregiverMuted}>Khi cần thêm, sửa, ngừng hoặc xóa thuốc, bạn có thể gửi đề xuất từ thẻ thuốc.</Text></View>
                    ) : (requests ?? []).slice(0, showAllRequests ? 50 : 8).map(request => {
                      const expanded = expandedRequestId === request.id;
                      const currentMedication = request.medicationId ? medications?.find(item => item.id === request.medicationId) : undefined;
                      const proposal = request.proposedData;
                      return (
                        <View key={request.id} style={styles.caregiverRequestCard}>
                          <View style={styles.caregiverRequestTop}>
                            <View style={styles.caregiverRequestCopy}>
                              <Text style={styles.caregiverRequestTitle}>{requestTypeLabel(request.requestType)} · {request.medicationName}</Text>
                              <Text style={styles.caregiverEventTime}>{request.createdAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}</Text>
                            </View>
                            <Text style={[styles.caregiverRequestStatus, request.status === "pending" ? styles.caregiverRequestPending : request.status === "approved" ? styles.caregiverRequestApproved : styles.caregiverRequestRejected]}>{requestStatusShortLabel(request.status)}</Text>
                          </View>
                          {!!currentMedication && <Text style={styles.caregiverDetailText}>Thông tin hiện tại: {currentMedication.dosage} {currentMedication.dosageUnit} · {currentMedication.frequency} lần/ngày</Text>}
                          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.caregiverDetailsToggle} onPress={() => setExpandedRequestId(expanded ? null : request.id)}>
                            <Text style={styles.caregiverDetailsToggleText}>{expanded ? "Ẩn nội dung" : "Xem nội dung đề xuất"}</Text>
                            <Text style={styles.caregiverDetailsChevron}>{expanded ? "−" : "+"}</Text>
                          </Pressable>
                          {expanded && (
                            <View style={styles.caregiverMedicationDetails}>
                              {!!proposal && <>
                                <Text style={styles.caregiverDetailText}>Tên thuốc: {proposal.name}{proposal.strengthText ? " · " + proposal.strengthText : ""}</Text>
                                <Text style={styles.caregiverDetailText}>Liều dùng: {proposal.dosage} {proposal.dosageUnit}</Text>
                                <Text style={styles.caregiverDetailText}>Số lần: {proposal.frequency} lần/ngày · Giờ: {proposal.intakeTimes.join(" · ")}</Text>
                                {!!proposal.directionsText && <Text style={styles.caregiverDetailText}>Hướng dẫn: {proposal.directionsText}</Text>}
                                <Text style={styles.caregiverDetailText}>Thời gian: {proposal.startDate || "Chưa đặt ngày bắt đầu"} – {proposal.endDate || "Không đặt ngày kết thúc"}</Text>
                                {!!proposal.notes && <Text style={styles.caregiverDetailText}>Ghi chú: {proposal.notes}</Text>}
                              </>}
                              {!!request.reason && <Text style={styles.caregiverDetailText}>Lý do: {request.reason}</Text>}
                              {!!request.reviewNote && <Text style={styles.caregiverDetailText}>Phản hồi: {request.reviewNote}</Text>}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {(requests?.length ?? 0) > 8 && <Pressable style={styles.caregiverShowMore} onPress={() => setShowAllRequests(value => !value)}><Text style={styles.caregiverShowMoreText}>{showAllRequests ? "Thu gọn đề xuất" : "Xem thêm đề xuất"}</Text></Pressable>}
                  </>
                )}

                {activityTab === "history" && (
                  <>
                    <Text style={styles.caregiverHistoryNote}>Nhật ký do người cao tuổi hoặc người chăm sóc ghi nhận; đây không phải xác minh y tế độc lập. Hiển thị tối đa 30 lần gần nhất.</Text>
                    {!!intakeError && <Text style={styles.caregiverErrorText}>{intakeError}</Text>}
                    {intakeLogs === null && !intakeError ? (
                      <View style={styles.caregiverLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.caregiverMuted}>Đang tải lịch sử...</Text></View>
                    ) : intakeLogs?.length === 0 ? (
                      <View style={styles.caregiverEmpty}><Text style={styles.caregiverEmptyTitle}>Chưa có lần uống thuốc được ghi nhận</Text><Text style={styles.caregiverMuted}>Các lần ghi nhận sẽ xuất hiện tại đây theo thời gian.</Text></View>
                    ) : (intakeLogs ?? []).slice(0, showAllHistory ? 30 : 8).map(log => (
                      <View key={log.id} style={styles.caregiverHistoryItem}>
                        <View style={styles.caregiverHistoryRail}><View style={styles.caregiverHistoryDot} /><View style={styles.caregiverHistoryLine} /></View>
                        <View style={styles.caregiverHistoryCopy}>
                          <Text style={styles.caregiverEventMessage}>{log.medicationName}</Text>
                          <Text style={styles.caregiverEventTime}>{log.takenAt?.toDate().toLocaleString("vi-VN") ?? "Đang cập nhật"}</Text>
                          <Text style={styles.caregiverEventMeta}>Ghi nhận bởi {log.recordedByRole === "caregiver" ? "người chăm sóc" : "người cao tuổi"}</Text>
                          {!!log.note && <Text style={styles.caregiverDetailText}>Ghi chú: {log.note}</Text>}
                        </View>
                      </View>
                    ))}
                    {(intakeLogs?.length ?? 0) > 8 && <Pressable style={styles.caregiverShowMore} onPress={() => setShowAllHistory(value => !value)}><Text style={styles.caregiverShowMoreText}>{showAllHistory ? "Thu gọn lịch sử" : "Xem thêm lịch sử"}</Text></Pressable>}
                  </>
                )}
              </>
            )}
          </>
        )}

        <Modal visible={editor && isReady && editorOwner === scope} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) { setEditor(false); setCalendar(null); } }}>
          <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}>
              <Pressable disabled={busy} onPress={() => setEditor(false)}><Text style={styles.modalCancel}>Đóng</Text></Pressable>
              <Text style={styles.modalTitle}>{editing ? "Đề xuất thay đổi thuốc" : "Đề xuất thêm thuốc"}</Text>
              <Pressable disabled={busy} onPress={() => void submit()}><Text style={styles.modalSave}>{busy ? "Đang gửi..." : "Gửi"}</Text></Pressable>
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
              <Field label="Lý do/ghi chú đề xuất" value={requestReason} onChange={setRequestReason} placeholder="Nêu lý do cần người cao tuổi xem xét" multiline />
              <Text style={styles.disclaimer}>Đây chỉ là đề xuất. Danh sách thuốc không thay đổi cho đến khi người cao tuổi duyệt.</Text>
              <Pressable disabled={busy} style={[styles.caregiverPrimaryButton, busy && styles.disabled]} onPress={() => void submit()}><Text style={styles.caregiverPrimaryButtonText}>{busy ? "Đang gửi..." : "Gửi đề xuất"}</Text></Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

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
                {item.status === "active" && <Pressable disabled={busy} style={styles.secondaryButton} onPress={() => recordIntake(item)}><Text style={styles.secondaryText}>Đã uống thuốc</Text></Pressable>}
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

function notificationTone(item: MedicationNotificationRecord): "info" | "success" | "warning" | "danger" {
  if (item.eventType === "proposal_reviewed") return item.decision === "approved" ? "success" : "danger";
  if (item.eventType === "medication_stopped") return "warning";
  if (item.eventType === "medication_reactivated") return "success";
  return "info";
}

function requestStatusShortLabel(status: MedicationRequestRecord["status"]) {
  switch (status) {
    case "pending": return "Chờ duyệt";
    case "approved": return "Đã duyệt";
    case "rejected": return "Bị từ chối";
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

function Calendar({ value, minDate, onSelect }: { value: string; minDate?: string; onSelect: (value: string) => void }) {
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
      <Pressable style={styles.secondaryButton} onPress={() => onSelect("")}><Text style={styles.secondaryText}>Bỏ chọn ngày</Text></Pressable>
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
  caregiverPanel: { gap: 12, backgroundColor: "transparent" },
  caregiverHeading: { gap: 4, paddingHorizontal: 2 },
  caregiverEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  caregiverTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "900" },
  caregiverSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  caregiverSelector: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 12, gap: 10 },
  caregiverSelectorTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  caregiverPersonAvatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverPersonAvatarText: { color: colors.primaryDark, fontSize: 18, fontWeight: "900" },
  caregiverSelectorCopy: { flex: 1, gap: 3 },
  caregiverSelectedName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  caregiverConnectedLabel: { color: "#176B3A", fontSize: 11, fontWeight: "700" },
  caregiverChangeButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverChangeText: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  caregiverPickerOption: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  caregiverPickerOptionActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  caregiverPickerAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  caregiverPickerAvatarText: { color: colors.primaryDark, fontSize: 14, fontWeight: "900" },
  caregiverPickerName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  caregiverPickerCheck: { color: colors.primary, fontSize: 18, fontWeight: "900", paddingHorizontal: 5 },
  caregiverOverview: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 7 },
  caregiverMetric: { flex: 1, alignItems: "center", gap: 3 },
  caregiverMetricValue: { color: colors.primaryDark, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  caregiverMetricLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  caregiverMetricDivider: { width: 1, height: 33, backgroundColor: colors.border },
  caregiverMainTabs: { flexDirection: "row", backgroundColor: "#EAF1F3", borderRadius: 14, padding: 4, gap: 4 },
  caregiverMainTab: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 11 },
  caregiverMainTabActive: { backgroundColor: colors.surface, shadowColor: "#163B45", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  caregiverMainTabText: { color: colors.muted, fontSize: 14, fontWeight: "800" },
  caregiverMainTabTextActive: { color: colors.primaryDark },
  caregiverTabBadge: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  caregiverTabBadgeText: { color: colors.white, fontSize: 10, fontWeight: "900" },
  caregiverListHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  caregiverListHeading: { flex: 1, gap: 3 },
  caregiverSectionTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  caregiverMuted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  caregiverAddButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary },
  caregiverAddButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  caregiverMedicineTabs: { flexDirection: "row", gap: 8 },
  caregiverMedicineTab: { flex: 1, minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 5 },
  caregiverMedicineTabActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  caregiverMedicineTabText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  caregiverMedicineTabTextActive: { color: colors.primaryDark },
  caregiverMedicationCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 13, gap: 11 },
  caregiverMedicationHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  caregiverMedicineIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverMedicineIconText: { color: colors.primaryDark, fontSize: 13, fontWeight: "900" },
  caregiverMedicationNameWrap: { flex: 1, gap: 2 },
  caregiverMedicationName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "900" },
  caregiverStatusBadge: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  caregiverStatusActive: { backgroundColor: colors.soft, color: colors.primaryDark },
  caregiverStatusInactive: { backgroundColor: "#EEF1F3", color: colors.muted },
  caregiverMedicationFacts: { flexDirection: "row", gap: 8 },
  caregiverMedicationFact: { flex: 1, minWidth: 0, backgroundColor: colors.background, borderRadius: 12, padding: 9, gap: 4 },
  caregiverFactLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  caregiverFactValue: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  caregiverDetailsToggle: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 },
  caregiverDetailsToggleText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  caregiverDetailsChevron: { color: colors.primaryDark, fontSize: 18, fontWeight: "900" },
  caregiverMedicationDetails: { backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 6 },
  caregiverDetailText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  caregiverMedicationActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  caregiverPrimaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primary },
  caregiverPrimaryButtonText: { color: colors.white, fontSize: 13, fontWeight: "900", textAlign: "center" },
  caregiverIntakeButton: { flexGrow: 1 },
  caregiverSecondaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  caregiverSecondaryButtonText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800", textAlign: "center" },
  caregiverMoreToggle: { minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3 },
  caregiverMoreToggleText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  caregiverMoreActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  caregiverWarningButton: { minHeight: 43, justifyContent: "center", paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#FFF6E8", borderWidth: 1, borderColor: "#F1D8A8" },
  caregiverWarningButtonText: { color: "#87540F", fontSize: 12, fontWeight: "800" },
  caregiverDangerButton: { minHeight: 43, justifyContent: "center", paddingHorizontal: 12, borderRadius: 11, backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#F0C7C3" },
  caregiverDangerButtonText: { color: "#A3342B", fontSize: 12, fontWeight: "800" },
  caregiverPermissionNote: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 4 },
  caregiverActivityHeader: { gap: 4 },
  caregiverActivityTabs: { flexDirection: "row", backgroundColor: colors.background, borderRadius: 13, padding: 4, gap: 3 },
  caregiverActivityTab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 2 },
  caregiverActivityTabActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  caregiverActivityTabText: { color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: "center" },
  caregiverActivityTabTextActive: { color: colors.primaryDark },
  caregiverEventCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 11 },
  caregiverEventIcon: { width: 33, height: 33, borderRadius: 11, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverEventIconSuccess: { backgroundColor: "#EAF6EE" },
  caregiverEventIconWarning: { backgroundColor: "#FFF6E8" },
  caregiverEventIconDanger: { backgroundColor: "#FFF1F0" },
  caregiverEventIconText: { color: colors.primaryDark, fontSize: 16, fontWeight: "900" },
  caregiverEventCopy: { flex: 1, gap: 4 },
  caregiverEventMessage: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  caregiverEventMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  caregiverEventTime: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  caregiverRequestCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 11, gap: 8 },
  caregiverRequestTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  caregiverRequestCopy: { flex: 1, gap: 4 },
  caregiverRequestTitle: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "900" },
  caregiverRequestStatus: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  caregiverRequestPending: { backgroundColor: "#FFF6E8", color: "#87540F" },
  caregiverRequestApproved: { backgroundColor: "#EAF6EE", color: "#176B3A" },
  caregiverRequestRejected: { backgroundColor: "#FFF1F0", color: "#A3342B" },
  caregiverHistoryNote: { color: colors.muted, fontSize: 11, lineHeight: 17, backgroundColor: colors.background, borderRadius: 12, padding: 10 },
  caregiverHistoryItem: { flexDirection: "row", gap: 10, minHeight: 67 },
  caregiverHistoryRail: { width: 14, alignItems: "center" },
  caregiverHistoryDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4 },
  caregiverHistoryLine: { flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 },
  caregiverHistoryCopy: { flex: 1, gap: 3, paddingBottom: 12 },
  caregiverShowMore: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.background },
  caregiverShowMoreText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  caregiverEmpty: { alignItems: "center", backgroundColor: colors.background, borderRadius: 14, padding: 15, gap: 6 },
  caregiverEmptyTitle: { color: colors.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
  caregiverLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingVertical: 14 },
  caregiverNoticeError: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#F0C7C3", borderRadius: 13, padding: 12, gap: 8 },
  caregiverErrorText: { color: "#A3342B", fontSize: 12, lineHeight: 18 },
  caregiverRetryButton: { alignSelf: "flex-start", minHeight: 39, justifyContent: "center", paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.surface },
  caregiverRetryText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
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
