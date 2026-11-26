import { useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { services } from "@/lib/firebase";
import { validEmail, authError } from "@/features/auth/validation";
export default function Forgot(){
 const router=useRouter();const [email,setEmail]=useState("");const [busy,setBusy]=useState(false);const lock=useRef(false);
 const success=()=>Alert.alert("Đặt lại mật khẩu","Nếu email hợp lệ và có tài khoản, yêu cầu đặt lại mật khẩu sẽ được xử lý.");
 async function submit(){if(lock.current)return;if(!validEmail(email)){Alert.alert("Email","Vui lòng nhập địa chỉ email hợp lệ.");return;}if(!services)return;lock.current=true;setBusy(true);try{await sendPasswordResetEmail(services.auth,email.trim());success();}catch(e){if(typeof e==="object"&&e&&"code" in e&&e.code==="auth/user-not-found")success();else Alert.alert("Đặt lại mật khẩu",authError(e));}finally{lock.current=false;setBusy(false);}}
 return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.link} onPress={()=>router.replace("/auth/login")}>‹ Quay lại đăng nhập</Text><Text style={s.title}>Quên mật khẩu</Text><Text style={s.desc}>Nhập email tài khoản của bạn.</Text><TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="Email"/><Pressable style={s.button} disabled={busy} onPress={submit}><Text style={s.buttonText}>{busy?"Đang gửi...":"Gửi yêu cầu"}</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:24,gap:16},title:{fontSize:28,fontWeight:"800",color:colors.text},label:{fontSize:16,fontWeight:"700",color:colors.text},input:{minHeight:56,borderWidth:1,borderColor:colors.border,borderRadius:15,padding:16,backgroundColor:colors.surface,color:colors.text,fontSize:16},button:{backgroundColor:colors.primary,minHeight:56,borderRadius:16,justifyContent:"center",alignItems:"center"},buttonText:{color:colors.white,fontSize:18,fontWeight:"800"},link:{color:colors.primary,fontSize:16,fontWeight:"700",paddingVertical:12},desc:{color:colors.muted,fontSize:16,lineHeight:23}});