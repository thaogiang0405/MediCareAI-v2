import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme";

const features = [
  {
    symbol: "⌂",
    title: "Hồ sơ người thân",
    description: "Thông tin và kết nối gia đình.",
  },
  {
    symbol: "♡",
    title: "Sức khỏe",
    description: "Theo dõi chỉ số sức khỏe.",
  },
  {
    symbol: "◷",
    title: "Lịch chăm sóc",
    description: "Các lịch trình cần lưu ý.",
  },
];

export default function FamilyHomeScreen() {
  const router = useRouter();

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
            <Text style={styles.previewText}>XEM TRƯỚC</Text>
          </View>
        </View>

        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>Xin chào gia đình!</Text>
          <Text style={styles.greetingDescription}>
            Cùng quan tâm và chăm sóc sức khỏe người thân.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Text style={styles.statusSymbol}>♡</Text>
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Chưa kết nối người thân</Text>
            <Text style={styles.statusDescription}>
              Tính năng kết nối sẽ được bổ sung ở giai đoạn tiếp theo.
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tiện ích gia đình</Text>
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

        <Text onPress={() => router.replace("/role-select")} style={styles.link}>
          Đổi vai trò xem trước
        </Text>
        <Text onPress={() => router.replace("/")} style={styles.secondaryLink}>
          Về màn hình chào mừng
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
    fontSize: 25,
    lineHeight: 32,
    fontWeight: "800",
  },
  greetingDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
  },
  statusIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  statusSymbol: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  statusCopy: {
    flex: 1,
    gap: 3,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  statusDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
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
