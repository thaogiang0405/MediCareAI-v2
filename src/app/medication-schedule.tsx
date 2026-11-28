import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Switch,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useFocusEffect,useLocalSearchParams,useRouter} from "expo-router";
import * as Speech from "expo-speech";
import type {User} from "firebase/auth";
import {useAuth} from "@/features/auth/AuthProvider";
import type {Profile} from "@/features/profile/profile";
import {watchConnections,type ConnectionRecord} from "@/features/connection/connection";
import {colors} from "@/theme";
import {Calendar} from "@/features/medication/MedicationPanel";
import {confirmScheduledDose,type MedicationIntakeLogRecord} from "@/features/medication/medication";
import {buildDoses,doseStatus,shiftDate,spokenSchedule,validDate,vietnamDate,type Dose} from "@/features/medication/schedule";
import {useClock,useScheduleData} from "@/features/medication/useScheduleData";
import {useReminderSettings} from "@/features/medication/ReminderProvider";
const dateLabel=(date:string)=>date.split("-").reverse().join("/");
function recorder(log:MedicationIntakeLogRecord,profile:Profile,uid:string,name:string){
  const actor=log.recordedByUid===profile.uid?"Bạn":log.recordedByUid===uid?name:log.recordedByRole==="caregiver"?"Người chăm sóc ("+log.recordedByUid.slice(0,6)+")":"Người cao tuổi";
  return actor+" · "+(log.takenAt?.toDate().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})??"Đang cập nhật");
}
function Action({label,onPress,primary=false,disabled=false}:{label:string;onPress:()=>void;primary?:boolean;disabled?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={[s.button,primary&&s.primary,disabled&&s.disabled]}><Text style={[s.buttonText,primary&&s.primaryText]}>{label}</Text></Pressable>;
}
export default function MedicationScheduleScreen(){
  const router=useRouter(),{user,profile}=useAuth();
  const params=useLocalSearchParams<{seniorUid?:string}>();
  if(!user||!profile)return null;
  return <SafeAreaView style={s.safe} edges={["top","bottom"]}>
    <View style={s.header}><Action label="‹  Quay lại" onPress={()=>{if(router.canGoBack())router.back();else router.replace(profile.role==="senior"?"/home/senior":"/home/family");}}/><Text style={s.headerTitle}>Lịch uống thuốc</Text></View>
    <Owner key={user.uid} user={user} profile={profile} requestedUid={typeof params.seniorUid==="string"?params.seniorUid:""}/>
  </SafeAreaView>;
}
function Owner({user,profile,requestedUid}:{user:User;profile:Profile;requestedUid:string}){
  const family=profile.role==="family";
  const [connections,setConnections]=useState<ConnectionRecord[]|null>(null);
  const [error,setError]=useState(false),[retry,setRetry]=useState(0),[chosen,setChosen]=useState(requestedUid),[picker,setPicker]=useState(false);
  useEffect(()=>{
    if(!family)return;
    let active=true;
    const stop=watchConnections(user.uid,"family",items=>{if(active){setConnections(items);setError(false);}},()=>{if(active){setConnections(null);setError(true);}});
    return()=>{active=false;stop();};
  },[family,user.uid,retry]);
  const selected=connections?.find(item=>item.seniorUid===chosen)??connections?.[0];
  const uid=family?selected?.seniorUid??"":user.uid;
  const name=family?selected?.seniorDisplayName??"":profile.fullName;
  return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    {family&&<View style={s.card}>
      <Text style={s.muted}>Hồ sơ đang theo dõi</Text><Text style={s.title}>{name||"Chưa chọn người thân"}</Text>
      {connections&&connections.length>1&&<Action label={picker?"Đóng danh sách":"Đổi người thân"} onPress={()=>setPicker(v=>!v)}/>}
      {picker&&connections?.map(item=><Action key={item.id} label={(uid===item.seniorUid?"✓  ":"")+item.seniorDisplayName} onPress={()=>{setChosen(item.seniorUid);setPicker(false);}}/>)}
      {!connections&&!error&&<ActivityIndicator color={colors.primary}/>}
      {error&&<><Text style={s.error}>Không thể tải kết nối.</Text><Action label="Thử lại" onPress={()=>setRetry(v=>v+1)}/></>}
      {connections?.length===0&&<Text style={s.muted}>Hãy kết nối người cao tuổi trước khi theo dõi lịch.</Text>}
    </View>}
    {!!uid&&<Content key={uid+":"+(selected?.id??"self")} user={user} profile={profile} uid={uid} name={name}/>}
  </ScrollView>;
}
function Content({user,profile,uid,name}:{user:User;profile:Profile;uid:string;name:string}){
  const now=useClock(),today=vietnamDate(now),family=profile.role==="family";
  const [date,setDate]=useState(today),[calendar,setCalendar]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[speaking,setSpeaking]=useState(false),[expanded,setExpanded]=useState<string|null>(null);
  const actionLock=useRef(false),speechVersion=useRef(0),mounted=useRef(true);
  const {medications,logs,incomplete,medicationError,logError}=useScheduleData(uid,date,retry);
  const reminders=useReminderSettings();
  const past=date<today;
  const doses=useMemo(()=>past?[]:buildDoses(medications??[],date),[past,medications,date]);
  const confirmed=useMemo(()=>new Map((logs??[]).filter(l=>l.scheduledDate===date).map(l=>[l.id,l])),[logs,date]);
  const count=doses.filter(d=>confirmed.has(d.id)).length;
  const ready=logs!==null&&(past||medications!==null);
  const history=(logs??[]).filter(log=>past||!doses.some(d=>d.id===log.id));
  const stopSpeech=useCallback(()=>{speechVersion.current++;void Speech.stop().catch(()=>{});setSpeaking(false);},[]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;speechVersion.current++;void Speech.stop().catch(()=>{});};},[]);
  useFocusEffect(useCallback(()=>()=>{stopSpeech();},[stopSpeech]));
  function chooseDate(value:string){if(validDate(value)){stopSpeech();setDate(value);setExpanded(null);setCalendar(false);}}
  async function speak(){
    if(!ready||date!==today||family)return;
    if(speaking){stopSpeech();return;}
    const ticket=++speechVersion.current;setSpeaking(true);
    try{
      await Speech.stop();
      const voices=await Speech.getAvailableVoicesAsync();
      if(ticket!==speechVersion.current||!mounted.current)return;
      const voice=voices.find(v=>v.language.toLowerCase().startsWith("vi"));
      if(!voice){setSpeaking(false);Alert.alert("Giọng nói tiếng Việt","Thiết bị chưa có giọng tiếng Việt. Kiểm tra cài đặt giọng nói trên iPhone.");return;}
      const finish=()=>{if(mounted.current&&ticket===speechVersion.current)setSpeaking(false);};
      const text=spokenSchedule(date,doses,new Set(confirmed.keys()));
      const chunks=text.match(/.{1,1400}(?:\s|$)|\S+/g)??[text];
      const next=(index:number)=>{
        if(!mounted.current||ticket!==speechVersion.current)return;
        if(index>=chunks.length){finish();return;}
        Speech.speak(chunks[index],{language:"vi-VN",voice:voice.identifier,rate:0.87,onDone:()=>next(index+1),onStopped:finish,onError:()=>{finish();if(mounted.current&&ticket===speechVersion.current)Alert.alert("Giọng nói","Kiểm tra âm lượng và chế độ im lặng.");}});
      };next(0);
    }catch{if(ticket===speechVersion.current&&mounted.current){setSpeaking(false);Alert.alert("Giọng nói","Không thể đọc lịch trên thiết bị này.");}}
  }
  function confirm(dose:Dose){
    if(!ready||date!==today||confirmed.has(dose.id)||actionLock.current)return;
    Alert.alert("Xác nhận liều "+dose.time+"?",name+" · "+dose.medication.name+". Chỉ xác nhận khi thuốc thực tế đã được uống.",[
      {text:"Để sau",style:"cancel"},
      {text:"Đã uống",onPress:()=>{
        if(actionLock.current||!mounted.current)return;
        actionLock.current=true;setBusy(true);
        void confirmScheduledDose(user,profile,uid,dose).then(result=>{
          if(mounted.current)Alert.alert("Lịch uống thuốc",result==="created"?"Đã ghi nhận liều thuốc.":"Liều này đã được ghi nhận trước đó.");
        }).catch(error=>{
          if(!mounted.current)return;
          const code=error instanceof Error?error.message:"";
          Alert.alert("Không thể xác nhận",code==="dose-changed"?"Thông tin thuốc đã thay đổi. Hãy tải lại lịch.":code==="dose-date"?"Chỉ xác nhận liều trong ngày hiện tại.":"Kiểm tra mạng, quyền truy cập và Firestore Rules Phase 05.");
        }).finally(()=>{actionLock.current=false;if(mounted.current)setBusy(false);});
      }}
    ]);
  }
  return <>
    <View style={s.card}>
      <Text style={s.muted}>{family?"Lịch của "+name:"Lịch của bạn"} · Giờ Việt Nam</Text>
      <View style={s.dateRow}><Action label="‹" disabled={date==="2000-01-01"} onPress={()=>chooseDate(shiftDate(date,-1))}/><View style={s.center}><Text style={s.title}>{date===today?"Hôm nay":past?"Lịch sử":"Lịch dự kiến"}</Text><Text style={s.muted}>{dateLabel(date)}</Text></View><Action label="›" disabled={date==="2099-12-31"} onPress={()=>chooseDate(shiftDate(date,1))}/></View>
      <View style={s.row}><View style={s.flex}><Action label="Chọn ngày" onPress={()=>setCalendar(v=>!v)}/></View><View style={s.flex}><Action label="Hôm nay" onPress={()=>chooseDate(today)}/></View></View>
      {calendar&&<Calendar value={date} onSelect={chooseDate} allowClear={false}/>}
    </View>
    {!ready&&(medicationError||logError)?<View style={s.card}><Text style={s.error}>Chưa tải được dữ liệu từ máy chủ. Không hiển thị trạng thái chưa xác minh.</Text><Action label="Thử lại" onPress={()=>setRetry(v=>v+1)}/></View>:!ready?<View style={s.card}><ActivityIndicator color={colors.primary}/><Text style={s.muted}>Đang tải lịch...</Text></View>:<>
      {past?<View style={s.card}><Text style={s.title}>Nhật ký thực tế · {logs?.length??0} bản ghi</Text><Text style={s.muted}>Không tái tạo lịch cũ từ thuốc hiện tại; chưa thể tính số liều thiếu trong quá khứ.</Text></View>:<>
        <View style={[s.card,s.stats]}>{[[doses.length,"Tổng liều"],[count,"Đã uống"],[doses.length-count,"Chưa xác nhận"]].map(([n,label])=><View key={label} style={s.metric}><Text style={s.number}>{n}</Text><Text style={s.metricLabel}>{label}</Text></View>)}</View>
        {incomplete>0&&<Text style={s.warning}>{incomplete} thuốc đang dùng chưa đủ thông tin lịch hoặc liều lượng hợp lệ. Cập nhật thuốc theo chỉ định chuyên môn.</Text>}
        {!family&&date===today&&<Action primary label={speaking?"■  Dừng đọc":"▷  Đọc lịch hôm nay"} onPress={()=>void speak()}/>}
        {doses.length===0&&<View style={s.card}><Text style={s.title}>Không có liều trong lịch ngày này</Text><Text style={s.muted}>Lịch chỉ lấy từ thuốc đang sử dụng, đủ thông tin và đúng thời gian.</Text></View>}
        {doses.map((dose,index)=>{
          const log=confirmed.get(dose.id),status=doseStatus(dose,!!log,now),m=dose.medication;
          return <View key={dose.id} style={s.group}>
            {(index===0||doses[index-1].time!==dose.time)&&<Text style={s.slot}>{dose.time}</Text>}
            <View style={s.card}>
              <View style={s.row}><Text style={[s.title,s.flex]}>{m.name}{m.strengthText?" · "+m.strengthText:""}</Text><Text style={[s.status,log?s.green:status==="Sắp đến giờ"?s.blue:s.orange]}>{status}</Text></View>
              <Text style={s.dosage}>{m.dosage} {m.dosageUnit}</Text>
              {!!m.directionsText&&<><Pressable accessibilityRole="button" accessibilityState={{expanded:expanded===dose.id}} onPress={()=>setExpanded(v=>v===dose.id?null:dose.id)} style={s.detailButton}><Text style={s.buttonText}>{expanded===dose.id?"Ẩn hướng dẫn":"Xem hướng dẫn sử dụng"}</Text></Pressable>{expanded===dose.id&&<Text style={s.muted}>{m.directionsText}</Text>}</>}
              {log?<Text style={s.muted}>Ghi nhận: {recorder(log,profile,uid,name)}</Text>:date===today&&<Action primary disabled={busy} label={busy?"Đang ghi nhận...":"✓  Xác nhận đã uống"} onPress={()=>confirm(dose)}/>}
            </View>
          </View>;
        })}
      </>}
      {!!history.length&&<View style={s.card}><Text style={s.title}>{past?"Các lần ghi nhận":"Ghi nhận ngoài lịch hiện tại"}</Text>{history.map(log=><View key={log.id} style={s.history}>
        <Text style={s.dosage}>{log.medicationName}{log.strengthText?" · "+log.strengthText:""}</Text>
        {!!log.scheduledTime&&<Text style={s.muted}>Liều {log.scheduledTime}{log.dosage?" · "+log.dosage+" "+(log.dosageUnit??""):""}</Text>}
        <Text style={s.muted}>{recorder(log,profile,uid,name)}</Text>{!log.scheduledTime&&<Text style={s.muted}>Nhật ký cũ — không xác định liều theo lịch.</Text>}{!!log.note&&<Text style={s.muted}>{log.note}</Text>}
      </View>)}</View>}
      {past&&!history.length&&<View style={s.card}><Text style={s.muted}>Không có ghi nhận trong ngày này.</Text></View>}
    </>}
    {!family&&<View style={s.card}>
      <View style={s.row}><View style={s.flex}><Text style={s.title}>Nhắc uống thuốc</Text><Text style={s.muted}>Trên thiết bị này</Text></View><Switch accessibilityLabel="Bật hoặc tắt nhắc uống thuốc" value={reminders.enabled} disabled={reminders.busy||!reminders.supported} onValueChange={()=>void reminders.toggle()} trackColor={{true:colors.primary}}/></View>
      <Text style={s.muted}>{reminders.supported?reminders.message||"Bật để xin quyền và lập nhắc nhở. Nội dung màn hình khóa không chứa tên thuốc.":"Thiết bị này chưa hỗ trợ nhắc nhở."}</Text>
      <Text style={s.muted}>Lịch được đồng bộ khi mở ứng dụng hoặc quay lại ứng dụng. Không phải hệ thống cảnh báo y tế.</Text>
    </View>}
    <Text style={s.muted}>Xác nhận do người dùng khai báo, không phải xác minh y tế độc lập. Không tự đổi liều hoặc uống bù dựa trên trạng thái lịch.</Text>
  </>;
}
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},header:{flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16,paddingVertical:6},
  headerTitle:{flex:1,color:colors.text,fontSize:21,fontWeight:"800"},content:{width:"100%",maxWidth:620,alignSelf:"center",padding:16,gap:12,paddingBottom:28},
  card:{padding:14,gap:10,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
  title:{color:colors.text,fontSize:17,fontWeight:"800",lineHeight:23},muted:{color:colors.muted,fontSize:14,lineHeight:20},
  row:{flexDirection:"row",alignItems:"center",gap:9,flexWrap:"wrap"},flex:{flex:1,minWidth:0},center:{flex:1,alignItems:"center",gap:3},
  dateRow:{flexDirection:"row",alignItems:"center",gap:10},button:{minHeight:46,borderRadius:11,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,alignItems:"center",justifyContent:"center",paddingHorizontal:12,paddingVertical:9},
  buttonText:{color:colors.primaryDark,fontSize:15,fontWeight:"800",textAlign:"center"},primary:{backgroundColor:colors.primaryDark,borderColor:colors.primaryDark},primaryText:{color:colors.white},disabled:{opacity:0.45},
  stats:{flexDirection:"row",alignItems:"center",paddingVertical:13},metric:{flex:1,alignItems:"center",gap:4},number:{fontSize:24,fontWeight:"800",color:colors.primaryDark},metricLabel:{fontSize:13,color:colors.muted,textAlign:"center"},
  group:{gap:6},slot:{fontSize:18,color:colors.primaryDark,fontWeight:"800",marginTop:4},dosage:{fontSize:17,color:colors.text,fontWeight:"700",lineHeight:23},
  status:{maxWidth:"48%",fontSize:12,fontWeight:"800",paddingVertical:5,paddingHorizontal:8,borderRadius:8,overflow:"hidden"},
  green:{backgroundColor:"#E7F5EB",color:"#20613A"},blue:{backgroundColor:"#E9F1FA",color:"#24567F"},orange:{backgroundColor:"#FFF0DA",color:"#86540F"},
  warning:{color:colors.warning,fontSize:14,lineHeight:20,padding:4},error:{color:"#A3342B",fontSize:15,lineHeight:21},
  detailButton:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},history:{borderTopWidth:1,borderColor:colors.border,paddingTop:10,gap:5},
});
