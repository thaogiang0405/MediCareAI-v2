import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { colors } from "@/theme";
import FamilyConnectionPanel from "@/features/connection/FamilyConnectionPanel";
import MedicationPanel from "@/features/medication/MedicationPanel";

export default function FamilyHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const initials = profile?.fullName.trim().charAt(0).toUpperCase() || "B";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandSymbol}>+</Text>
            </View>
            <Text style={styles.brandName}>MediCare AI</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở hồ sơ cá nhân và đăng xuất"
            style={styles.accountButton}
            onPress={() => router.push("/profile")}
          >
            <View style={styles.accountAvatar}>
              <Text style={styles.accountInitial}>{initials}</Text>
            </View>
            <Text style={styles.accountLabel}>Tài khoản</Text>
          </Pressable>
        </View>

        <View style={styles.greeting}>
          <View style={styles.roleBadge}>
            <View style={styles.roleDot} />
            <Text style={styles.roleText}>NGƯỜI CHĂM SÓC</Text>
          </View>
          <Text style={styles.greetingTitle}>Xin chào, {profile?.fullName ?? "bạn"}!</Text>
          <Text style={styles.greetingDescription}>
            Theo dõi thuốc và đồng hành cùng sức khỏe người thân.
          </Text>
        </View>

        <FamilyConnectionPanel />
        <MedicationPanel />

        <Text style={styles.footer}>
          MediCare AI · Cùng gia đình chăm sóc sức khỏe mỗi ngày
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
    gap: 16,
  },
  topBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandSymbol: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "800",
  },
  brandName: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  accountButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountAvatar: {
    width: 27,
    height: 27,
    borderRadius: 10,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInitial: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800",
  },
  accountLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  greeting: {
    gap: 5,
    paddingTop: 2,
    paddingBottom: 1,
  },
  roleBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 2,
  },
  roleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  roleText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  greetingTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900",
  },
  greetingDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    paddingTop: 2,
  },
});
