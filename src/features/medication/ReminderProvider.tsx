import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/features/auth/AuthProvider";
import { services } from "@/lib/firebase";
import { reminderPlan } from "./schedule";
import { useScheduleData, useToday } from "./useScheduleData";
import { clearMedicationReminders, notificationPermission, reconcileMedicationReminders, supportsReminders } from "./reminders";

type State = { enabled: boolean; busy: boolean; message: string; supported: boolean; toggle: () => Promise<void> };
const Context = createContext<State>({enabled:false,busy:false,message:"",supported:false,toggle:async()=>{}});
const prefKey = (uid:string) => "medicare-reminders:" + uid;

export function ReminderProvider({children}:{children:ReactNode}) {
  const session = useAuth();
  const uid = session.status === "ready" && session.profile?.role === "senior" ? session.user?.uid ?? "" : "";
  return <ReminderSession key={uid || session.status} uid={uid} loading={session.status === "loading"}>{children}</ReminderSession>;
}
function ReminderSession({uid,loading,children}:{uid:string;loading:boolean;children:ReactNode}) {
  const today = useToday();
  const {medications,logs} = useScheduleData(uid,today);
  const [enabled,setEnabled] = useState<boolean|null>(null);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [foreground,setForeground] = useState(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!uid) {
      if (!loading) void clearMedicationReminders().catch(()=>{});
      return;
    }
    let active = true;
    const valid = () => active && services?.auth.currentUser?.uid === uid;
    void reconcileMedicationReminders(uid,null,valid).catch(()=>{});
    void AsyncStorage.getItem(prefKey(uid)).then(value => {
      if (active) setEnabled(value === "true");
    }).catch(() => {if(active){setEnabled(false);setMessage("Không đọc được cài đặt nhắc nhở.");}});
    return () => {active=false;};
  },[uid,loading]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      if(state === "active") setForeground(value=>value+1);
    });
    return ()=>listener.remove();
  },[]);
  useEffect(() => {
    if (!uid || enabled === null || !supportsReminders) return;
    let active = true;
    const valid = () => active && services?.auth.currentUser?.uid === uid;
    async function sync() {
      if (!enabled) {
        await reconcileMedicationReminders(uid,[],valid);
        if(valid()) setMessage("Đã tắt nhắc nhở trên thiết bị.");
        return;
      }
      if (!await notificationPermission()) {
        await reconcileMedicationReminders(uid,[],valid);
        if(valid()) setMessage("Thiết bị chưa cấp quyền thông báo. Kiểm tra Cài đặt hệ thống.");
        return;
      }
      if (!medications || !logs) {
        if(valid()) setMessage("Chưa đồng bộ lịch mới; nhắc nhở đã lập trước đó có thể chưa được cập nhật.");
        return;
      }
      const confirmed = new Set(logs.filter(log=>log.scheduledDate === today).map(log=>log.id));
      const count = await reconcileMedicationReminders(uid,reminderPlan(medications,confirmed),valid);
      if(valid()) setMessage("Đã đồng bộ " + count + " mốc nhắc sắp tới (tối đa 7 ngày, 48 mốc).");
    }
    void sync().catch(()=>{if(valid())setMessage("Không thể đồng bộ nhắc nhở. Vui lòng kiểm tra quyền và thử mở lại ứng dụng.");});
    return ()=>{active=false;};
  },[uid,enabled,medications,logs,today,foreground]);

  async function toggle() {
    if (!uid || lock.current || enabled === null || !supportsReminders) return;
    lock.current=true;setBusy(true);
    try {
      const next = !enabled;
      if(next && !await notificationPermission(true)) {
        if(alive.current) setMessage("Quyền thông báo chưa được cấp. Bạn có thể bật trong Cài đặt hệ thống.");
        return;
      }
      if (!alive.current || services?.auth.currentUser?.uid !== uid) return;
      if(!next) await reconcileMedicationReminders(uid,[],()=>services?.auth.currentUser?.uid === uid);
      await AsyncStorage.setItem(prefKey(uid),String(next));
      if(alive.current){setEnabled(next);setForeground(value=>value+1);}
    } catch {if(alive.current)setMessage("Không thể thay đổi cài đặt nhắc nhở. Vui lòng thử lại.");}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  return <Context.Provider value={{enabled:enabled===true,busy:busy||enabled===null,message,supported:supportsReminders,toggle}}>{children}</Context.Provider>;
}
export function useReminderSettings(){return useContext(Context);}
