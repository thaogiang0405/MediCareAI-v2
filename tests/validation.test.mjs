import test from "node:test";
import assert from "node:assert/strict";
import { validEmail, validName, isRole, authError } from "../src/features/auth/validation.ts";
test("email validation",()=>{assert.equal(validEmail("test@example.com"),true);assert.equal(validEmail("test@"),false);assert.equal(validEmail("a b@example.com"),false);});
test("profile name",()=>{assert.equal(validName("Nguyễn Văn An"),true);assert.equal(validName(" "),false);assert.equal(validName("a"),false);assert.equal(validName("a".repeat(121)),false);});
test("role allowlist",()=>{assert.equal(isRole("senior"),true);assert.equal(isRole("family"),true);assert.equal(isRole("admin"),false);assert.equal(isRole(undefined),false);});
test("login error does not distinguish email and password",()=>{assert.equal(authError({code:"auth/user-not-found"}),authError({code:"auth/wrong-password"}));});

test("network and disabled-account errors are translated safely",()=>{
  assert.equal(authError({code:"auth/network-request-failed"}),"Không có kết nối mạng. Vui lòng thử lại.");
  assert.equal(authError({code:"auth/user-disabled"}),"Tài khoản không thể đăng nhập. Vui lòng liên hệ hỗ trợ.");
});
test("permission and rate-limit errors are translated safely",()=>{
  assert.equal(authError({code:"permission-denied"}),"Không đủ quyền truy cập hồ sơ.");
  assert.equal(authError({code:"auth/too-many-requests"}),"Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.");
});
test("unknown Firebase errors do not expose internal messages",()=>{
  assert.equal(authError({code:"auth/internal-error",message:"internal secret"}),"Chưa thể xử lý yêu cầu. Vui lòng thử lại.");
});
