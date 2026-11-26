export type Role = "senior" | "family";
export const isRole = (value: unknown): value is Role => value === "senior" || value === "family";
export const validEmail = (value: string) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value.trim());
// Match the existing Firestore Rules: 2–120 characters after trimming.
export const validName = (value: string) => value.trim().length >= 2 && value.trim().length <= 120;
export function authError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  switch (code) {
    case "auth/invalid-email": return "Vui lòng nhập địa chỉ email hợp lệ.";
    case "auth/invalid-credential": case "auth/wrong-password": case "auth/user-not-found": return "Email hoặc mật khẩu chưa chính xác.";
    case "auth/email-already-in-use": return "Không thể tạo tài khoản với thông tin này. Hãy thử đăng nhập hoặc đặt lại mật khẩu.";
    case "auth/weak-password": case "auth/password-does-not-meet-requirements": return "Mật khẩu chưa đáp ứng yêu cầu bảo mật.";
    case "auth/network-request-failed": case "unavailable": return "Không có kết nối mạng. Vui lòng thử lại.";
    case "auth/user-disabled": return "Tài khoản không thể đăng nhập. Vui lòng liên hệ hỗ trợ.";
    case "auth/too-many-requests": return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.";
    case "permission-denied": return "Không đủ quyền truy cập hồ sơ.";
    default: return "Chưa thể xử lý yêu cầu. Vui lòng thử lại.";
  }
}
