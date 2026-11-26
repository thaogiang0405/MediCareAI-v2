import { useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInWithEmailAndPassword } from "firebase/auth";
import { services } from "@/lib/firebase";
import { authError, validEmail } from "@/features/auth/validation";
import { colors } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy,setBusy] = useState(false);
  const [show,setShow] = useState(false);
  const lock = useRef(false);
  const handleLogin = async () => {
    if (lock.current) return;
    if (!validEmail(email) || !password) { Alert.alert("Kiểm tra thông tin","Vui lòng nhập email hợp lệ và mật khẩu."); return; }
    if (!services) return;
    lock.current = true; setBusy(true);
    try { await signInWithEmailAndPassword(services.auth,email.trim(),password); }
    catch(e) { Alert.alert("Đăng nhập",authError(e)); }
    finally { lock.current=false; setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹  Quay lại</Text>
          </Pressable>

          <View style={styles.headingGroup}>
            <Text style={styles.title}>Đăng nhập</Text>
            <Text style={styles.description}>Chào mừng bạn trở lại!</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor="#98A8AD"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mật khẩu</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Nhập mật khẩu"
                placeholderTextColor="#98A8AD"
                secureTextEntry={!show}
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <Text onPress={()=>setShow(v=>!v)} style={styles.linkText}>{show?"Ẩn mật khẩu":"Hiện mật khẩu"}</Text>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={handleLogin}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>{busy?"Đang đăng nhập...":"Đăng nhập"}</Text>
            </Pressable>
          </View>

          <View style={styles.links}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/role-select")}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Chưa có tài khoản? Đăng ký ngay</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/auth/forgot")}
              style={styles.linkButton}
            >
              <Text style={styles.secondaryLinkText}>Quên mật khẩu?</Text>
            </Pressable>
          </View>

          <Text style={styles.notice}>
            Chỉ sử dụng tài khoản kiểm thử trong môi trường Emulator.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 22,
  },
  backButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 42,
    paddingRight: 12,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  headingGroup: {
    gap: 6,
    marginTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    width: "100%",
    minHeight: 56,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.82,
  },
  links: {
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  linkButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryLinkText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  notice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: "auto",
  },
});
