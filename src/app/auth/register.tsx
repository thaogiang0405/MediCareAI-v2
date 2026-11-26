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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createUserWithEmailAndPassword, validatePassword } from "firebase/auth";
import { services } from "@/lib/firebase";
import { completeProfile } from "@/features/profile/profile";
import { authError, isRole, validEmail, validName } from "@/features/auth/validation";
import { useAuth } from "@/features/auth/AuthProvider";
import { colors } from "@/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { role } = useLocalSearchParams<{role?: string}>();
  const { refresh } = useAuth();
  const [confirm,setConfirm] = useState("");
  const [show,setShow] = useState(false);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const handleRegister = async () => {
    if (lock.current) return;
    if (!isRole(role)) { router.replace("/role-select"); return; }
    if (!validName(name) || !validEmail(email)) { Alert.alert("Kiểm tra thông tin","Vui lòng nhập họ tên và email hợp lệ."); return; }
    if (password.length < 6 || password !== confirm) { Alert.alert("Kiểm tra mật khẩu","Mật khẩu cần ít nhất 6 ký tự và xác nhận phải trùng khớp."); return; }
    if (!services) return;
    lock.current=true;setBusy(true);
    try {
      const policy = await validatePassword(services.auth,password);
      if (!policy.isValid) { Alert.alert("Mật khẩu","Mật khẩu chưa đáp ứng yêu cầu bảo mật."); return; }
      const credential = await createUserWithEmailAndPassword(services.auth,email.trim(),password);
      try { await completeProfile(credential.user,name,role); }
      catch { Alert.alert("Hoàn tất hồ sơ","Tài khoản đã được tạo. Vui lòng hoàn tất hồ sơ hoặc đăng nhập lại."); }
      await refresh();
    } catch(e) { Alert.alert("Đăng ký",authError(e)); }
    finally { lock.current=false;setBusy(false); }
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
            <Text style={styles.title}>Tạo tài khoản</Text>
            <Text style={styles.description}>
              Điền thông tin cơ bản để bắt đầu sử dụng MediCare AI.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Họ và tên</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Nguyễn Văn An"
                placeholderTextColor="#98A8AD"
                textContentType="name"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

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
                textContentType="newPassword"
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Xác nhận mật khẩu</Text>
              <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none" placeholder="Nhập lại mật khẩu"/>
            </View>
            <Text onPress={()=>setShow(v=>!v)} style={styles.linkText}>{show?"Ẩn mật khẩu":"Hiện mật khẩu"}</Text>
            <Text style={styles.label}>Vai trò: {role==="senior"?"Người cao tuổi":role==="family"?"Người thân":"Chưa chọn"}</Text>
            <Pressable
              disabled={busy}
              accessibilityRole="button"
              onPress={handleRegister}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>{busy?"Đang tạo tài khoản...":"Tạo tài khoản"}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/auth/login")}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>Đã có tài khoản? Đăng nhập</Text>
          </Pressable>

          <Text style={styles.notice}>
            Chỉ sử dụng thông tin kiểm thử trong Emulator.
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
    gap: 20,
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
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 16,
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
  linkButton: {
    alignSelf: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
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
