import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
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

type Notice = { tone: "success" | "error"; text: string };
type BusyAction = "create" | "copy" | "check" | "confirm" | "disconnect" | null;

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
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expandedConnection, setExpandedConnection] = useState<string | null>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stop = watchConnections(
      user.uid,
      profile.role,
      setPeople,
      error => setLoadError(connectionErrorMessage(error)),
    );
    const stopSlot = family
      ? watchConnectionInviteSlot(
          user.uid,
          value => { setSlot(value); setSlotReady(true); },
          error => setLoadError(connectionErrorMessage(error)),
        )
      : undefined;
    return () => { stop(); stopSlot?.(); };
  }, [user.uid, profile.role, family, retry]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const busy = busyAction !== null;
  const ready = people !== null && slotReady && !loadError;
  const expiry = slot?.createdAt?.toMillis?.() ?? 0;
  const remainingMs = Math.max(0, expiry + INVITE_TTL - now);
  const active = slot?.status === "active" && remainingMs > 0;
  const title = family ? "Người tôi chăm sóc" : "Người thân của tôi";
  const description = family
    ? "Danh sách người cao tuổi bạn đang hỗ trợ chăm sóc."
    : "Danh sách người thân đang đồng hành và chăm sóc bạn.";
  const personName = (connection: ConnectionRecord) =>
    family ? connection.seniorDisplayName : connection.familyDisplayName;

  async function perform(action: Exclude<BusyAction, null>, task: () => Promise<void>, successText?: string) {
    if (busy || !ready) return;
    setBusyAction(action);
    setNotice(null);
    try {
      await task();
      if (successText) setNotice({ tone: "success", text: successText });
    } catch (error) {
      setNotice({ tone: "error", text: connectionErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  function askDisconnect(connection: ConnectionRecord) {
    Alert.alert(
      "Hủy kết nối?",
      "Bạn sẽ hủy kết nối với " + personName(connection) + ". Những kết nối khác vẫn được giữ nguyên.",
      [
        { text: "Giữ kết nối", style: "cancel" },
        {
          text: "Hủy kết nối",
          style: "destructive",
          onPress: () => void perform(
            "disconnect",
            () => disconnectConnection(user, profile, connection.id),
            "Đã hủy kết nối với " + personName(connection) + ".",
          ),
        },
      ],
    );
  }

  function checkCode() {
    setPreview(null);
    void perform("check", async () => {
      const result = await getConnectionInvitePreview(user, profile, code);
      setPreview(result);
    });
  }

  function askConfirm() {
    if (!preview) return;
    Alert.alert(
      "Xác nhận kết nối",
      "Bạn có muốn kết nối với " + preview.familyDisplayName + " không?",
      [
        { text: "Kiểm tra lại", style: "cancel" },
        {
          text: "Xác nhận",
          onPress: () => void perform("confirm", async () => {
            await confirmConnection(user, profile, preview);
            setPreview(null);
            setCode("");
          }, "Kết nối thành công với " + preview.familyDisplayName + "."),
        },
      ],
    );
  }

  function retryLoading() {
    setPeople(null);
    setSlotReady(!family);
    setLoadError("");
    setNotice(null);
    setRetry(value => value + 1);
  }

  function requestCreateInvite() {
    const create = () => void perform(
      "create",
      () => createConnectionInvite(user, profile),
      "Đã tạo mã. Hãy gửi mã cho người cao tuổi để xác nhận.",
    );
    if (slot?.status === "active") {
      Alert.alert(
        "Tạo mã kết nối mới?",
        active
          ? "Mã mới sẽ vô hiệu hóa mã hiện tại nếu mã đó chưa được sử dụng. Các kết nối đã xác nhận không bị ảnh hưởng."
          : "Mã hiện tại đã hết hạn. Tạo mã mới sẽ thay thế mã cũ; các kết nối đã xác nhận không bị ảnh hưởng.",
        [
          { text: "Để sau", style: "cancel" },
          { text: "Tạo mã mới", onPress: create },
        ],
      );
      return;
    }
    create();
  }

  if (family) {
    return (
      <View style={styles.caregiverStack}>
        <View style={styles.caregiverCard}>
          <View style={styles.caregiverSectionHeader}>
            <View style={styles.caregiverHeadingCopy}>
              <Text style={styles.caregiverEyebrow}>GIA ĐÌNH</Text>
              <Text style={styles.caregiverTitle}>Người thân đang kết nối</Text>
              <Text style={styles.caregiverDescription}>Quản lý những người cao tuổi bạn đang hỗ trợ.</Text>
            </View>
            <View style={styles.caregiverCountBadge}>
              <Text style={styles.caregiverCount}>{people?.length ?? "—"}</Text>
              <Text style={styles.caregiverCountCaption}>kết nối</Text>
            </View>
          </View>

          {!ready && !loadError && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.mutedText}>Đang tải danh sách kết nối...</Text>
            </View>
          )}

          {!!loadError && (
            <View style={styles.noticeError}>
              <Text style={styles.noticeIcon}>!</Text>
              <Text style={styles.noticeText}>{loadError}</Text>
              <Pressable accessibilityRole="button" style={styles.retryButton} onPress={retryLoading}>
                <Text style={styles.retryText}>Thử tải lại</Text>
              </Pressable>
            </View>
          )}

          {ready && people.length === 0 && (
            <View style={styles.caregiverEmpty}>
              <View style={styles.caregiverEmptyIcon}><Text style={styles.caregiverEmptySymbol}>+</Text></View>
              <Text style={styles.caregiverEmptyTitle}>Chưa có người thân nào được kết nối</Text>
              <Text style={styles.mutedText}>Tạo mã ở bên dưới và gửi cho người cao tuổi để bắt đầu kết nối.</Text>
            </View>
          )}

          {ready && (showAllPeople ? people : people.slice(0, 3)).map(connection => {
            const expanded = expandedConnection === connection.id;
            const name = personName(connection);
            return (
              <View key={connection.id} style={styles.caregiverPersonCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={"Thông tin kết nối với " + name}
                  accessibilityHint={expanded ? "Thu gọn thông tin" : "Mở thông tin kết nối"}
                  accessibilityState={{ expanded }}
                  style={styles.caregiverPersonMain}
                  onPress={() => setExpandedConnection(expanded ? null : connection.id)}
                >
                  <View style={styles.caregiverAvatar}>
                    <Text style={styles.caregiverAvatarText}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
                  </View>
                  <View style={styles.caregiverPersonCopy}>
                    <Text style={styles.caregiverPersonName} numberOfLines={1}>{name}</Text>
                    <View style={styles.caregiverStatusRow}>
                      <View style={styles.statusDot} />
                      <Text style={styles.caregiverConnectedText}>Đã kết nối</Text>
                    </View>
                  </View>
                  <Text style={styles.caregiverChevron}>{expanded ? "−" : "+"}</Text>
                </Pressable>
                {expanded && (
                  <View style={styles.caregiverPersonDetails}>
                    <Text style={styles.detailText}>
                      Kết nối từ: {connection.connectedAt?.toDate?.().toLocaleDateString("vi-VN") ?? "Đang cập nhật"}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={[styles.caregiverDisconnectButton, busy && styles.disabled]}
                      onPress={() => askDisconnect(connection)}
                    >
                      <Text style={styles.caregiverDisconnectText}>Hủy kết nối</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          {ready && people.length > 3 && (
            <Pressable
              accessibilityRole="button"
              style={styles.caregiverShowMore}
              onPress={() => setShowAllPeople(value => !value)}
            >
              <Text style={styles.caregiverShowMoreText}>
                {showAllPeople ? "Thu gọn danh sách" : "Xem tất cả " + people.length + " người thân"}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.caregiverCard}>
          <View style={styles.caregiverSectionHeader}>
            <View style={styles.caregiverHeadingCopy}>
              <Text style={styles.caregiverEyebrow}>THIẾT LẬP KẾT NỐI</Text>
              <Text style={styles.caregiverTitle}>Tạo mã kết nối</Text>
              <Text style={styles.caregiverDescription}>Người cao tuổi nhập mã và tự xác nhận kết nối với bạn.</Text>
            </View>
            <View style={styles.caregiverCodeIcon}><Text style={styles.caregiverCodeIconText}>#</Text></View>
          </View>

          <View style={styles.caregiverSteps}>
            <Text style={styles.caregiverStepsTitle}>Thực hiện trong 3 bước</Text>
            <View style={styles.caregiverStepRow}>
              <Text style={styles.caregiverStepNumber}>1</Text>
              <Text style={styles.caregiverStepText}>Tạo mã kết nối trên ứng dụng.</Text>
            </View>
            <View style={styles.caregiverStepRow}>
              <Text style={styles.caregiverStepNumber}>2</Text>
              <Text style={styles.caregiverStepText}>Gửi mã 8 ký tự cho người cao tuổi.</Text>
            </View>
            <View style={styles.caregiverStepRow}>
              <Text style={styles.caregiverStepNumber}>3</Text>
              <Text style={styles.caregiverStepText}>Người cao tuổi kiểm tra tên bạn và xác nhận.</Text>
            </View>
          </View>

          {active && slot && (
            <View style={styles.caregiverInviteCard}>
              <View style={styles.caregiverInviteTop}>
                <View style={styles.caregiverInviteStatus}>
                  <View style={styles.statusDot} />
                  <Text style={styles.caregiverInviteStatusText}>Mã đang có hiệu lực</Text>
                </View>
                <Text style={styles.caregiverExpiry}>Còn {formatRemaining(remainingMs)}</Text>
              </View>
              <Text selectable style={styles.caregiverCode}>{slot.inviteCode}</Text>
              <Text style={styles.mutedText}>
                Hết hạn lúc {new Date(expiry + INVITE_TTL).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={[styles.caregiverCopyButton, busy && styles.disabled]}
                onPress={() => void perform("copy", async () => {
                  await Clipboard.setStringAsync(slot.inviteCode);
                }, "Đã sao chép mã kết nối.")}
              >
                {busyAction === "copy"
                  ? <ActivityIndicator color={colors.primaryDark} />
                  : <Text style={styles.caregiverCopyText}>Sao chép mã</Text>}
              </Pressable>
            </View>
          )}

          {slot?.status === "active" && !active && (
            <View style={styles.noticeWarning}>
              <Text style={styles.noticeIcon}>!</Text>
              <Text style={styles.noticeText}>Mã đã hết hạn. Hãy tạo mã mới để tiếp tục.</Text>
            </View>
          )}
          {slot?.status === "used" && (
            <View style={styles.noticeSuccess}>
              <Text style={styles.noticeIcon}>✓</Text>
              <Text style={styles.noticeText}>Mã đã được sử dụng để xác nhận kết nối.</Text>
            </View>
          )}
          {!slot && ready && (
            <View style={styles.caregiverNoCode}>
              <Text style={styles.caregiverNoCodeTitle}>Chưa có mã kết nối</Text>
              <Text style={styles.mutedText}>Tạo mã mới để người cao tuổi có thể gửi yêu cầu kết nối.</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={busy || !ready}
            style={[styles.caregiverPrimaryButton, (busy || !ready) && styles.disabled]}
            onPress={requestCreateInvite}
          >
            {busyAction === "create"
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.caregiverPrimaryText}>{active ? "Tạo mã mới" : "Tạo mã kết nối"}</Text>}
          </Pressable>
          <Text style={styles.caregiverHint}>
            Mã gồm đúng 8 ký tự, có hiệu lực 15 phút và chỉ sử dụng một lần. Tạo mã mới sẽ vô hiệu hóa mã cũ chưa sử dụng; những kết nối đã xác nhận không bị ảnh hưởng.
          </Text>
        </View>

        {busyAction === "disconnect" && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mutedText}>Đang cập nhật kết nối...</Text>
          </View>
        )}

        {notice && (
          <View style={notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}>
            <Text style={styles.noticeIcon}>{notice.tone === "success" ? "✓" : "!"}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice.text}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <View style={styles.headingCopy}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.sectionDescription}>{description}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{people?.length ?? "—"}</Text>
          </View>
        </View>

        {!ready && !loadError && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.mutedText}>Đang tải danh sách kết nối...</Text>
          </View>
        )}

        {!!loadError && (
          <View style={styles.noticeError}>
            <Text style={styles.noticeIcon}>!</Text>
            <Text style={styles.noticeText}>{loadError}</Text>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={retryLoading}>
              <Text style={styles.retryText}>Thử tải lại</Text>
            </Pressable>
          </View>
        )}

        {ready && people.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Chưa có kết nối nào</Text>
            <Text style={styles.mutedText}>
              {family
                ? "Bạn có thể kết nối với nhiều người cao tuổi."
                : "Bạn có thể kết nối với nhiều người thân."}
            </Text>
          </View>
        )}

        {ready && people.map(connection => {
          const expanded = expandedConnection === connection.id;
          const name = personName(connection);
          return (
            <View key={connection.id} style={styles.personCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={"Xem thông tin kết nối với " + name}
                accessibilityHint={expanded ? "Thu gọn thông tin" : "Mở thông tin kết nối"}
                accessibilityState={{ expanded }}
                style={styles.personMain}
                onPress={() => setExpandedConnection(expanded ? null : connection.id)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
                </View>
                <View style={styles.personCopy}>
                  <Text style={styles.personName} numberOfLines={1}>{name}</Text>
                  <View style={styles.statusRow}>
                    <View style={styles.statusDot} />
                    <Text style={styles.connectedText}>Đã kết nối</Text>
                  </View>
                </View>
                <Text style={styles.expandIcon}>{expanded ? "⌃" : "⌄"}</Text>
              </Pressable>

              {expanded && (
                <View style={styles.detailBox}>
                  <Text style={styles.detailText}>
                    Vai trò: {family ? "Người cao tuổi bạn chăm sóc" : "Người thân chăm sóc bạn"}
                  </Text>
                  <Text style={styles.detailText}>
                    Kết nối từ: {connection.connectedAt?.toDate?.().toLocaleDateString("vi-VN") ?? "Đang cập nhật"}
                  </Text>
                </View>
              )}

              <View style={styles.personActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={"Hủy kết nối với " + name}
                  disabled={busy}
                  style={[styles.disconnectButton, busy && styles.disabled]}
                  onPress={() => askDisconnect(connection)}
                >
                  <Text style={styles.disconnectText}>Hủy kết nối</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {family ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingCopy}>
              <Text style={styles.sectionTitle}>Tạo mã kết nối</Text>
              <Text style={styles.sectionDescription}>Mỗi người cao tuổi xác nhận bằng một mã riêng.</Text>
            </View>
            <View style={styles.codeIcon}>
              <Text style={styles.codeIconText}>#</Text>
            </View>
          </View>

          <View style={styles.stepsBox}>
            <Text style={styles.stepsTitle}>Cách kết nối</Text>
            <Text style={styles.stepText}>1. Tạo mã kết nối bên dưới.</Text>
            <Text style={styles.stepText}>2. Gửi mã 8 ký tự cho người cao tuổi.</Text>
            <Text style={styles.stepText}>3. Người cao tuổi nhập mã và xác nhận kết nối.</Text>
          </View>

          {active && slot && (
            <View style={styles.inviteCard}>
              <View style={styles.inviteTopRow}>
                <View style={styles.activeBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.activeText}>Mã đang hoạt động</Text>
                </View>
                <Text style={styles.expiryText}>Còn {formatRemaining(remainingMs)}</Text>
              </View>
              <Text selectable style={styles.code}>{slot.inviteCode}</Text>
              <Text style={styles.mutedText}>
                Hết hạn lúc {new Date(expiry + INVITE_TTL).toLocaleTimeString("vi-VN", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={[styles.copyButton, busy && styles.disabled]}
                onPress={() => void perform("copy", async () => {
                  await Clipboard.setStringAsync(slot.inviteCode);
                }, "Đã sao chép mã kết nối.")}
              >
                <Text style={styles.copyText}>{busyAction === "copy" ? "Đang sao chép..." : "Sao chép mã"}</Text>
              </Pressable>
            </View>
          )}

          {slot?.status === "active" && !active && (
            <View style={styles.noticeWarning}>
              <Text style={styles.noticeIcon}>!</Text>
              <Text style={styles.noticeText}>Mã đã hết hạn. Hãy tạo mã mới để tiếp tục.</Text>
            </View>
          )}
          {slot?.status === "used" && (
            <View style={styles.noticeSuccess}>
              <Text style={styles.noticeIcon}>✓</Text>
              <Text style={styles.noticeText}>Mã đã được sử dụng để xác nhận kết nối.</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={busy || !ready}
            style={[styles.primaryButton, (busy || !ready) && styles.disabled]}
            onPress={() => void perform(
              "create",
              () => createConnectionInvite(user, profile),
              "Đã tạo mã. Hãy gửi mã cho người cao tuổi để xác nhận.",
            )}
          >
            {busyAction === "create"
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.primaryButtonText}>{active ? "Tạo mã mới" : "Tạo mã kết nối"}</Text>}
          </Pressable>
          <Text style={styles.hint}>
            Mã gồm 8 chữ cái và chữ số, có hiệu lực 15 phút và chỉ dùng một lần. Tạo mã mới sẽ vô hiệu hóa mã chưa dùng trước đó, không ảnh hưởng kết nối hiện tại.
          </Text>
        </View>
      ) : (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingCopy}>
              <Text style={styles.sectionTitle}>Kết nối với người thân</Text>
              <Text style={styles.sectionDescription}>Nhập mã do người thân gửi cho bạn.</Text>
            </View>
            <View style={styles.codeIcon}>
              <Text style={styles.codeIconText}>#</Text>
            </View>
          </View>

          <View style={styles.stepsBox}>
            <Text style={styles.stepsTitle}>Cách kết nối</Text>
            <Text style={styles.stepText}>1. Nhận mã 8 ký tự từ người thân.</Text>
            <Text style={styles.stepText}>2. Nhập mã và chọn “Kiểm tra mã”.</Text>
            <Text style={styles.stepText}>3. Kiểm tra tên người thân rồi xác nhận.</Text>
          </View>

          <TextInput
            accessibilityLabel="Mã kết nối gồm 8 ký tự"
            value={code}
            editable={!busy}
            onChangeText={value => {
              setCode(normalizeConnectionCode(value).slice(0, 8));
              setPreview(null);
              setNotice(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="Ví dụ: ABCD2345"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.hint}>Mã gồm đúng 8 chữ cái hoặc chữ số. Không phân biệt chữ hoa và chữ thường.</Text>

          <Pressable
            accessibilityRole="button"
            disabled={busy || !ready || code.length !== 8}
            style={[styles.primaryButton, (busy || !ready || code.length !== 8) && styles.disabled]}
            onPress={checkCode}
          >
            {busyAction === "check"
              ? <View style={styles.buttonLoading}><ActivityIndicator color={colors.white} /><Text style={styles.primaryButtonText}>Đang kiểm tra mã...</Text></View>
              : <Text style={styles.primaryButtonText}>Kiểm tra mã</Text>}
          </Pressable>

          {preview && (
            <View style={styles.previewCard}>
              <View style={styles.activeBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.activeText}>Đã tìm thấy lời mời</Text>
              </View>
              <Text style={styles.previewLabel}>Người thân muốn kết nối</Text>
              <Text style={styles.personName}>{preview.familyDisplayName}</Text>
              <Text style={styles.hint}>Chỉ xác nhận nếu bạn biết và tin tưởng người này.</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={[styles.primaryButton, busy && styles.disabled]}
                onPress={askConfirm}
              >
                {busyAction === "confirm"
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.primaryButtonText}>Xác nhận kết nối</Text>}
              </Pressable>
            </View>
          )}
        </View>
      )}

      {busyAction === "disconnect" && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Đang cập nhật kết nối...</Text>
        </View>
      )}

      {notice && (
        <View style={notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}>
          <Text style={styles.noticeIcon}>{notice.tone === "success" ? "✓" : "!"}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice.text}</Text>
        </View>
      )}
    </View>
  );
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

const styles = StyleSheet.create({
  caregiverStack: { gap: 12 },
  caregiverCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, padding: 15, gap: 13,
  },
  caregiverSectionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  caregiverHeadingCopy: { flex: 1, gap: 4 },
  caregiverEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  caregiverTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  caregiverDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  caregiverCountBadge: {
    minWidth: 48, minHeight: 46, borderRadius: 14, backgroundColor: colors.soft,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  caregiverCount: { color: colors.primaryDark, fontSize: 18, fontWeight: "900" },
  caregiverCountCaption: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  caregiverEmpty: { alignItems: "center", backgroundColor: colors.background, borderRadius: 15, padding: 16, gap: 6 },
  caregiverEmptyIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverEmptySymbol: { color: colors.primary, fontSize: 25, fontWeight: "700" },
  caregiverEmptyTitle: { color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  caregiverPersonCard: { backgroundColor: colors.background, borderRadius: 15, padding: 10, gap: 8 },
  caregiverPersonMain: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  caregiverAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverAvatarText: { color: colors.primaryDark, fontSize: 17, fontWeight: "900" },
  caregiverPersonCopy: { flex: 1, gap: 4 },
  caregiverPersonName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  caregiverStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  caregiverConnectedText: { color: "#176B3A", fontSize: 12, fontWeight: "700" },
  caregiverChevron: { color: colors.primaryDark, fontSize: 20, fontWeight: "700", paddingHorizontal: 7 },
  caregiverPersonDetails: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 8 },
  caregiverDisconnectButton: { minHeight: 42, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: "#E8C9C6", backgroundColor: colors.surface },
  caregiverDisconnectText: { color: "#A3342B", fontSize: 12, fontWeight: "700" },
  caregiverShowMore: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.background },
  caregiverShowMoreText: { color: colors.primaryDark, fontSize: 13, fontWeight: "800" },
  caregiverCodeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  caregiverCodeIconText: { color: colors.primaryDark, fontSize: 21, fontWeight: "900" },
  caregiverSteps: { backgroundColor: colors.background, borderRadius: 15, padding: 12, gap: 9 },
  caregiverStepsTitle: { color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 1 },
  caregiverStepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  caregiverStepNumber: { width: 23, height: 23, borderRadius: 8, backgroundColor: colors.soft, color: colors.primaryDark, textAlign: "center", textAlignVertical: "center", fontSize: 12, fontWeight: "900", overflow: "hidden" },
  caregiverStepText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  caregiverInviteCard: { backgroundColor: colors.soft, borderRadius: 16, padding: 14, gap: 9 },
  caregiverInviteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  caregiverInviteStatus: { flexDirection: "row", alignItems: "center", gap: 7 },
  caregiverInviteStatusText: { color: "#176B3A", fontSize: 12, fontWeight: "800" },
  caregiverExpiry: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  caregiverCode: { color: colors.text, fontSize: 30, lineHeight: 38, fontWeight: "900", letterSpacing: 4, textAlign: "center" },
  caregiverCopyButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  caregiverCopyText: { color: colors.primaryDark, fontSize: 14, fontWeight: "900" },
  caregiverNoCode: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 4 },
  caregiverNoCodeTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  caregiverPrimaryButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.primary, paddingHorizontal: 14 },
  caregiverPrimaryText: { color: colors.white, fontSize: 15, fontWeight: "900" },
  caregiverHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  stack: { gap: 12 },
  sectionCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: 14, gap: 12,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  sectionDescription: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  countBadge: {
    minWidth: 34, height: 34, borderRadius: 12, backgroundColor: colors.soft,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  countText: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingVertical: 8 },
  mutedText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  emptyState: { backgroundColor: colors.background, borderRadius: 13, padding: 13, gap: 4 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  personCard: { backgroundColor: colors.background, borderRadius: 14, padding: 10, gap: 8 },
  personMain: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46 },
  avatar: {
    width: 38, height: 38, borderRadius: 13, backgroundColor: colors.soft,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.primaryDark, fontSize: 17, fontWeight: "800" },
  personCopy: { flex: 1, gap: 4 },
  personName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#16834A" },
  connectedText: { color: "#176B3A", fontSize: 12, fontWeight: "700" },
  expandIcon: { color: colors.muted, fontSize: 20, paddingHorizontal: 5 },
  detailBox: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 },
  detailText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  personActions: { alignItems: "flex-end" },
  disconnectButton: {
    minHeight: 44, justifyContent: "center", paddingHorizontal: 12,
    borderRadius: 11, borderWidth: 1, borderColor: "#E8C9C6", backgroundColor: colors.surface,
  },
  disconnectText: { color: "#A3342B", fontSize: 13, fontWeight: "700" },
  stepsBox: { backgroundColor: colors.soft, borderRadius: 13, padding: 11, gap: 5 },
  stepsTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "800", marginBottom: 1 },
  stepText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  inviteCard: { backgroundColor: colors.soft, borderRadius: 14, padding: 12, gap: 8 },
  inviteTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  activeText: { color: "#176B3A", fontSize: 12, fontWeight: "800" },
  expiryText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  code: { color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: "900", letterSpacing: 4 },
  copyButton: {
    minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 12,
  },
  copyText: { color: colors.primaryDark, fontSize: 14, fontWeight: "800" },
  codeIcon: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: colors.soft,
    alignItems: "center", justifyContent: "center",
  },
  codeIconText: { color: colors.primaryDark, fontSize: 19, fontWeight: "900" },
  noticeWarning: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFF6E8", borderColor: "#F1D8A8", borderWidth: 1, borderRadius: 12, padding: 11,
  },
  noticeSuccess: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#EAF6EE", borderColor: "#B9DEC4", borderWidth: 1, borderRadius: 12, padding: 11,
  },
  noticeError: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#FFF0EF", borderColor: "#F0C7C3", borderWidth: 1, borderRadius: 12, padding: 11,
  },
  noticeIcon: { color: colors.primaryDark, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  noticeText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 19 },
  retryButton: {
    minHeight: 40, alignSelf: "flex-start", justifyContent: "center",
    borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.surface,
  },
  retryText: { color: colors.primaryDark, fontSize: 13, fontWeight: "800" },
  primaryButton: {
    minHeight: 48, borderRadius: 13, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 14, paddingVertical: 10,
  },
  primaryButtonText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: "800", textAlign: "center" },
  buttonLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 52, backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, color: colors.text,
    fontSize: 19, fontWeight: "800", letterSpacing: 2,
  },
  previewCard: { backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 8 },
  previewLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
