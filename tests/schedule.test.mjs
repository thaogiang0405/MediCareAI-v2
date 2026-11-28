import {test} from "node:test";
import assert from "node:assert/strict";
import {buildDoses, doseId, doseStatus, doseTime, isScheduleMedication, reminderPlan, shiftDate, vietnamDate} from "../src/features/medication/schedule.ts";
const med = {id:"m1", ownerUid:"s1", name:"Thuốc thử", strengthText:"", dosage:"1", dosageUnit:"viên", directionsText:"", startDate:"2026-11-28", endDate:"2026-11-29", frequency:2, intakeTimes:["20:00","08:00"],status:"active"};
test("Vietnam date and day transitions",()=>{
  assert.equal(vietnamDate(Date.parse("2026-11-27T18:00:00Z")),"2026-11-28");
  assert.equal(shiftDate("2026-12-31",1),"2027-01-01");
});
test("schedule honors dates and does not invent missing fields",()=>{
  assert.equal(buildDoses([med],"2026-11-27").length,0);
  assert.equal(buildDoses([med],"2026-11-30").length,0);
  assert.deepEqual(buildDoses([med],"2026-11-28").map(d=>d.time),["08:00","20:00"]);
  assert.equal(isScheduleMedication({...med,intakeTimes:[]}),false);
  assert.equal(buildDoses([{...med,status:"inactive"}],"2026-11-28").length,0);
});
test("distinct canonical IDs and explicit status",()=>{
  const d=buildDoses([med],"2026-11-28")[0];
  assert.equal(d.id,doseId("m1","2026-11-28","08:00"));
  assert.equal(doseStatus(d,true,d.at),"Đã uống");
  assert.equal(doseStatus(d,false,d.at+3600000),"Quá giờ — chưa xác nhận");
});
test("reminders are unique per slot, skip confirmations and respect end dates",()=>{
  const now=doseTime("2026-11-28","07:00");
  const plan=reminderPlan([med,{...med,id:"m2"}],new Set([doseId("m1","2026-11-28","08:00"),doseId("m2","2026-11-28","08:00")]),now);
  assert.equal(plan.length,3);
  assert.equal(plan[0].time,"20:00");
  assert.equal(plan.at(-1).date,"2026-11-29");
});
