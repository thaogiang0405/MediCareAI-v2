import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { watchDailyIntake, watchScheduleMedications, type MedicationIntakeLogRecord } from "./medication";
import { vietnamDate, type ScheduleMedication } from "./schedule";

export function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") setNow(Date.now());
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  return now;
}

export function useScheduleData(uid: string, date: string, retry = 0) {
  const scope = uid + ":" + retry;
  const logScope = scope + ":" + date;
  const [meds, setMeds] = useState<{scope: string; items: ScheduleMedication[]; incomplete: number} | null>(null);
  const [logs, setLogs] = useState<{scope: string; items: MedicationIntakeLogRecord[]} | null>(null);
  const [medError, setMedError] = useState("");
  const [logError, setLogError] = useState("");
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = watchScheduleMedications(uid, (items, incomplete) => {
      if (active) { setMeds({scope, items, incomplete}); setMedError(""); }
    }, () => {
      if (active) { setMeds(null); setMedError(scope); }
    });
    return () => { active = false; stop(); };
  }, [uid, scope]);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = watchDailyIntake(uid, date, items => {
      if (active) { setLogs({scope: logScope, items}); setLogError(""); }
    }, () => {
      if (active) { setLogs(null); setLogError(logScope); }
    });
    return () => { active = false; stop(); };
  }, [uid, date, logScope]);
  return {
    medications: uid && meds?.scope === scope ? meds.items : null,
    incomplete: uid && meds?.scope === scope ? meds.incomplete : 0,
    logs: uid && logs?.scope === logScope ? logs.items : null,
    medicationError: !!uid && medError === scope,
    logError: !!uid && logError === logScope,
  };
}
export function useToday() {
  return vietnamDate(useClock());
}
