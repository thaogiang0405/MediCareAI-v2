import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { colors } from "@/theme";
import SeniorConnectionPanel from "@/features/connection/SeniorConnectionPanel";

const features = [
  {
    symbol: "＋",
    title: "Thuốc của tôi",
    description: "Danh sách thuốc và giờ uống.",
  },
  {
    symbol: "♡",
    title: "Sức khỏe",
    description: "Theo dõi các chỉ số cơ thể.",
  },
  {
    symbol: "◷",
    title: "Nhắc nhở",
    description: "Lịch chăm sóc mỗi ngày.",
  },
];

export default function SeniorHomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandSymbol}>✚</Text>
          </View>
          <Text style={styles.brandName}>MediCare AI</Text>
          <View style={styles.previewBadge}>
            <Text style={styles.previewText}>TÀI KHOẢN</Text>
          </View>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>Xin chào, {profile?.fullName}!</Text>
          <Text style={styles.greetingDescription}>
            Chúc bạn một ngày vui khỏe và bình an.
          </Text>
        </View>

        <SeniorConnectionPanel />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tiện ích chăm sóc</Text>
          <Text style={styles.sectionCaption}>3 tiện ích</Text>
        </View>

        <View style={styles.featureGrid}>
          {features.map((feature) => (
            <View key={feature.title} style={styles.featureCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{feature.symbol}</Text>
              </View>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Sắp ra mắt</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>MediCare AI đồng hành cùng bạn</Text>
          <Text style={styles.footerDescription}>
            Các tiện ích sẽ được mở lần lượt sau khi hoàn thiện kết nối và kiểm thử.
          </Text>
        </View>

        <Text onPress={() => router.push("/profile")} style={styles.link}>Hồ sơ cá nhân và đăng xuất</Text>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  header: {
    minHeight: 42,
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
    fontSize: 19,
    fontWeight: "800",
  },
  brandName: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
  },
  previewBadge: {
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  greeting: {
    gap: 3,
  },
  greetingTitle: {
    color: colors.text,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
  },
  greetingDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
  },
  sectionCaption: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  featureCard: {
    width: "48%",
    flexGrow: 1,
    minHeight: 150,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  iconText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  featureTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  featureDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  comingSoonBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: "auto",
  },
  comingSoonText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "700",
  },
  footerCard: {
    backgroundColor: colors.soft,
    borderRadius: 16,
    padding: 15,
    gap: 4,
  },
  footerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  footerDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  link: {
    color: colors.primary,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 14,
    paddingTop: 2,
  },
  secondaryLink: {
    color: colors.primaryDark,
    textAlign: "center",
    fontWeight: "600",
    fontSize: 13,
    paddingBottom: 4,
  },
});
