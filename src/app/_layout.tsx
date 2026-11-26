import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Button, Text, View } from "react-native";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";

function Routes() {
  const session = useAuth();
  if (session.status === "loading") return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator size="large"/><Text>Đang kiểm tra tài khoản...</Text></View>;
  if (session.status === "error") return <View style={{flex:1,justifyContent:"center",padding:24,gap:16}}><Text>{session.message}</Text><Button title="Thử lại" onPress={()=>void session.refresh()}/>{session.user && <Button title="Đăng xuất" onPress={()=>void session.logout().catch(()=>{})}/>}</View>;
  return <Stack screenOptions={{headerShown:false}} initialRouteName="auth/login">
    <Stack.Protected guard={session.status === "guest"}>
      <Stack.Screen name="auth/login"/>
      <Stack.Screen name="index"/>
      <Stack.Screen name="auth/register"/>
      <Stack.Screen name="role-select"/>
      <Stack.Screen name="auth/forgot"/>
    </Stack.Protected>
    <Stack.Protected guard={session.status === "missing"}>
      <Stack.Screen name="auth/complete-profile"/>
    </Stack.Protected>
    <Stack.Protected guard={session.status === "ready" && session.profile?.role === "senior"}>
      <Stack.Screen name="home/senior"/>
    </Stack.Protected>
    <Stack.Protected guard={session.status === "ready" && session.profile?.role === "family"}>
      <Stack.Screen name="home/family"/>
    </Stack.Protected>
    <Stack.Protected guard={session.status === "ready"}>
      <Stack.Screen name="profile"/>
    </Stack.Protected>
  </Stack>;
}
export default function RootLayout(){return <SafeAreaProvider><StatusBar style="dark"/><AuthProvider><Routes/></AuthProvider></SafeAreaProvider>}
