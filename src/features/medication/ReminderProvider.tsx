import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { services } from "@/lib/firebase";
import { reminderPlan } from "./schedule";
import { useScheduleData,useToday } from "./useScheduleData";
import { clearMedicationReminders,notificationPermission,reconcileMedicationReminders,supportsReminders } from "./reminders";
type State={enabled:boolean;busy:boolean;message:string;supported:boolean;toggle:()=>Promise<void>};
const Context=createContext<State>({enabled:false,busy:false,message:"",supported:false,toggle:async()=>{}});
const prefKey=(uid:string)=>"medicare-reminders:"+uid;
export function ReminderProvider({children}:{children:ReactNode}){
  const session=useAuth();
  const uid=session.status==="ready"&&session.profile?.role==="senior"?session.user?.uid??"":"";
  const loading=session.status==="loading";
  const today=useToday();
  const {medications,logs}=useScheduleData(uid,today);
  const [pref,setPref]=useState<{uid:string;enabled:boolean}|null>(null);
  const [feedback,setFeedback]=useState<{uid:string;message:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [foreground,setForeground]=useState(0);
  const lock=useRef(false);
  const enabled=uid&&pref?.uid===uid?pref.enabled:null;
  const message=feedback?.uid===uid?feedback.message:"";
  useEffect(()=>{
    if(!uid){if(!loading)void clearMedicationReminders().catch(()=>{});return;}
    let active=true;
    const valid=()=>active&&services?.auth.currentUser?.uid===uid;
    void reconcileMedicationReminders(uid,null,valid).catch(()=>{});
    void AsyncStorage.getItem(prefKey(uid)).then(value=>{if(valid())setPref({uid,enabled:value==="true"});})
      .catch(()=>{if(valid()){setPref({uid,enabled:false});setFeedback({uid,message:"Không đọc được cài đặt nhắc nhở."});}});
    return()=>{active=false;};
  },[uid,loading]);
  useEffect(()=>{
    const listener=AppState.addEventListener("change",state=>{if(state==="active")setForeground(v=>v+1);});
    return()=>listener.remove();
  },[]);
  useEffect(()=>{
    if(!uid||enabled===null||!supportsReminders)return;
    let active=true;
    const valid=()=>active&&services?.auth.currentUser?.uid===uid;
    const report=(message:string)=>{if(valid())setFeedback({uid,message});};
    async function sync(){
      if(!enabled){await reconcileMedicationReminders(uid,[],valid);report("Đã tắt nhắc nhở trên thiết bị.");return;}
      if(!await notificationPermission()){await reconcileMedicationReminders(uid,[],valid);report("Thiết bị chưa cấp quyền thông báo. Kiểm tra Cài đặt.");return;}
      if(!medications||!logs){report("Chưa đồng bộ lịch mới; nhắc nhở đã lập trước đó có thể chưa được cập nhật.");return;}
      const confirmed=new Set(logs.filter(l=>l.scheduledDate===today).map(l=>l.id));
      const count=await reconcileMedicationReminders(uid,reminderPlan(medications,confirmed),valid);
      report("Đã đồng bộ "+count+" mốc nhắc sắp tới (tối đa 7 ngày, 48 mốc).");
    }
    void sync().catch(()=>report("Không thể đồng bộ nhắc nhở. Kiểm tra quyền và mở lại ứng dụng."));
    return()=>{active=false;};
  },[uid,enabled,medications,logs,today,foreground]);
  async function toggle(){
    if(!uid||lock.current||enabled===null||!supportsReminders)return;
    lock.current=true;setBusy(true);
    const valid=()=>services?.auth.currentUser?.uid===uid;
    const report=(message:string)=>{if(valid())setFeedback({uid,message});};
    try{
      const next=!enabled;
      if(next&&!await notificationPermission(true)){report("Chưa được cấp quyền. Bạn có thể bật thông báo trong Cài đặt hệ thống.");return;}
      if(!valid())return;
      if(!next)await reconcileMedicationReminders(uid,[],valid);
      await AsyncStorage.setItem(prefKey(uid),String(next));
      if(valid()){setPref({uid,enabled:next});setForeground(v=>v+1);}
    }catch{report("Không thể thay đổi nhắc nhở. Vui lòng thử lại.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <Context.Provider value={{enabled:enabled===true,busy:busy||enabled===null,message,supported:supportsReminders,toggle}}>{children}</Context.Provider>;
}
export function useReminderSettings(){return useContext(Context);}
