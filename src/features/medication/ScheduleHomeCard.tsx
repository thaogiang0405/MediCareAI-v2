import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { colors } from "@/theme";
import { buildDoses, vietnamDate } from "./schedule";
import { useClock, useScheduleData } from "./useScheduleData";

export default function ScheduleHomeCard() {
  const {user,profile}=useAuth();
  const router=useRouter();
  const senior=profile?.role==="senior";
  const now=useClock(), today=vietnamDate(now);
  const {medications,logs,medicationError,logError}=useScheduleData(senior?user?.uid??"":"",today);
  const doses=buildDoses(medications??[],today);
  const done=new Set((logs??[]).filter(log=>log.scheduledDate===today).map(log=>log.id));
  const count=doses.filter(d=>done.has(d.id)).length;
  const next=doses.find(d=>d.at>=now && !done.has(d.id));
  const ready=medications!==null && logs!==null;
  return <View style={styles.card}>
    <Text style={styles.title}>Lịch uống thuốc hôm nay</Text>
    <Text style={styles.copy}>{senior
      ? ready ? count+" / "+doses.length+" liều đã xác nhận"+(next?" · Tiếp theo "+next.time:"")
        : medicationError||logError?"Chưa đồng bộ được lịch.":"Đang tải lịch..."
      : "Theo dõi lịch và hỗ trợ ghi nhận cho người thân đã kết nối."}</Text>
    {senior&&ready&&doses.length>0&&<View style={styles.track}><View style={[styles.fill,{width:(count/doses.length*100)+"%" as `${number}%`}]} /></View>}
    <Pressable accessibilityRole="button" style={styles.button} onPress={()=>router.push("/medication-schedule")}><Text style={styles.buttonText}>Xem toàn bộ lịch  ›</Text></Pressable>
  </View>;
}
const styles=StyleSheet.create({
  card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:16,padding:14,gap:9},
  title:{fontSize:19,fontWeight:"800",color:colors.text},copy:{fontSize:15,lineHeight:21,color:colors.muted},
  track:{height:7,borderRadius:5,backgroundColor:colors.border,overflow:"hidden"},fill:{height:7,backgroundColor:colors.primary,borderRadius:5},
  button:{minHeight:48,backgroundColor:colors.primary,borderRadius:12,alignItems:"center",justifyContent:"center"},
  buttonText:{fontSize:16,color:colors.white,fontWeight:"800"},
});
