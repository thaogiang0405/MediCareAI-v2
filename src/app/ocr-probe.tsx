import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { WebView } from "react-native-webview";
import { colors } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  createMedicationRequestsFromPrescription, createMedicationsFromPrescription, medicationErrorMessage,
} from "@/features/medication/medication";
import {
  MEDICATION_FORMS, medicationValidationError, normalizeMedicationDraft,
  type MedicationDraft, type MedicationForm,
} from "@/features/medication/validation";
import { parsePrescriptionText } from "@/features/medication/prescriptionParser";

type SelectedImage = { uri: string; base64: string; width: number; height: number; source: "camera" | "library" };
type Job = { image: string | null; width: number; height: number; source: "camera" | "library" | "sample"; started: number };
type OcrCandidate = { id: string; label: string; confidence: number; text: string };

const MAX_BASE64_CHARS = 10 * 1024 * 1024;
const MAX_OCR_MS = 240_000;

function probeHtml(image: string | null): string {
  const script = [
    "const input = " + JSON.stringify(image) + ";",
    "const send = value => window.ReactNativeWebView.postMessage(JSON.stringify(value));",
    "const clamp = n => Math.max(0, Math.min(255, n));",
    "function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}",
    "function sample(){const c=canvas(1500,1000),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,1500,1000);x.fillStyle='#111';x.font='bold 42px Arial';x.fillText('ĐƠN THUỐC MẪU - KHÔNG DÙNG ĐIỀU TRỊ',45,75);x.font='34px Arial';['1. DemoCare Alpha 250 mg','Mỗi lần 1 viên, ngày 2 lần.','08:00 và 20:00, sau ăn. Số lượng: 14 viên.','2. VitamiX Beta 10 mg','Mỗi lần 1 viên, ngày 1 lần.','07:30, sau bữa sáng.'].forEach((t,i)=>x.fillText(t,55,190+i*105));return c;}",
    "function working(src){const sw=src.naturalWidth||src.width,sh=src.naturalHeight||src.height;if(!sw||!sh)throw Error('invalid-image');const scale=Math.min(1,2000/Math.max(sw,sh)),w=Math.round(sw*scale),h=Math.round(sh*scale),c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(src,0,0,w,h);return c;}",
    "function lum(d,i){return .299*d[i]+.587*d[i+1]+.114*d[i+2];}",
    "function percentile(hist,total,p){let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=total*p)return i;}return 255;}",
    "function contrast(src){const w=src.width,h=src.height,id=src.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h),d=id.data,hist=new Uint32Array(256),total=w*h;for(let i=0;i<d.length;i+=4)hist[Math.round(lum(d,i))]++;const lo=percentile(hist,total,.02),hi=percentile(hist,total,.98),range=Math.max(32,hi-lo);for(let i=0;i<d.length;i+=4){const v=clamp((lum(d,i)-lo)*255/range);d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}const c=canvas(w,h);c.getContext('2d').putImageData(id,0,0);return c;}",
    "function shadowCorrect(src){const w=src.width,h=src.height,tw=Math.max(24,Math.round(w/24)),th=Math.max(24,Math.round(h/24)),small=canvas(tw,th);small.getContext('2d').drawImage(src,0,0,tw,th);const bg=small.getContext('2d',{willReadFrequently:true}).getImageData(0,0,tw,th).data,id=src.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h),d=id.data;for(let y=0;y<h;y++){const by=Math.min(th-1,Math.floor(y*th/h));for(let x=0;x<w;x++){const i=(y*w+x)*4,bi=(by*tw+Math.min(tw-1,Math.floor(x*tw/w)))*4,v=clamp(245+(lum(d,i)-Math.max(80,lum(bg,bi)))*1.65);d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}}const c=canvas(w,h);c.getContext('2d').putImageData(id,0,0);return c;}",
    "function otsu(hist,total){let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sb=0,wb=0,max=-1,t=180;for(let i=0;i<256;i++){wb+=hist[i];if(!wb)continue;const wf=total-wb;if(!wf)break;sb+=i*hist[i];const mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*Math.pow(mb-mf,2);if(v>max){max=v;t=i;}}return Math.max(100,Math.min(225,t));}",
    "function binary(src){const w=src.width,h=src.height,id=src.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h),d=id.data,hist=new Uint32Array(256);for(let i=0;i<d.length;i+=4)hist[Math.round(d[i])]++;const t=otsu(hist,w*h);for(let i=0;i<d.length;i+=4){const v=d[i]<t?0:255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}const c=canvas(w,h);c.getContext('2d').putImageData(id,0,0);return c;}",
    "async function loadRuntime(){await new Promise((ok,bad)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';s.onload=ok;s.onerror=bad;document.head.appendChild(s);});}",
    "async function run(){let worker;let original,shadow;try{let src;if(input){src=new Image();src.src='data:image/jpeg;base64,'+input;await src.decode();}else src=sample();original=working(src);const passes=[{label:'Ảnh gốc · tự động (PSM 3)',image:original,psm:'3'},{label:'Tăng tương phản (PSM 6)',build:()=>contrast(original),psm:'6'},{label:'Khử bóng · một cột (PSM 4)',build:()=>shadowCorrect(original),psm:'4'},{label:'Nhị phân · chữ rải rác (PSM 11)',build:()=>{if(!shadow)shadow=shadowCorrect(original);return binary(shadow);},psm:'11'}];send({type:'progress',status:'loading'});await loadRuntime();let active=0,label='';worker=await Tesseract.createWorker('vie+eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0',cacheMethod:'none',logger:m=>send({type:'progress',status:m.status,progress:m.progress,pass:active,total:passes.length,label}),errorHandler:()=>send({type:'error'})});const results=[];for(let i=0;i<passes.length;i++){const p=passes[i];active=i+1;label=p.label;send({type:'progress',status:'recognizing text',progress:0,pass:active,total:passes.length,label});let image=p.image;if(!image){image=p.build();if(p.psm==='4')shadow=image;}await worker.setParameters({tessedit_pageseg_mode:p.psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await worker.recognize(image);results.push({id:'pass-'+active,label:p.label,confidence:Math.round(Number(r.data.confidence)||0),text:String(r.data.text||'').slice(0,20000)});if(image!==original&&image!==shadow){image.width=0;image.height=0;}}results.sort((a,b)=>b.confidence-a.confidence);send({type:'result',candidates:results,width:original.width,height:original.height});}catch(e){send({type:'error'});}finally{if(worker)await worker.terminate().catch(()=>{});if(original){original.width=0;original.height=0;}if(shadow){shadow.width=0;shadow.height=0;}}}run();",
  ].join("\n");
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\' https://cdn.jsdelivr.net blob:; worker-src blob:; connect-src https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; img-src data: blob:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<style>body{margin:0;background:#fff}</style></head><body><script>' + script + '</script></body></html>';
}

function stageLabel(status: unknown) {
  switch (status) {
    case "loading language traineddata": return "Đang tải dữ liệu tiếng Việt và tiếng Anh";
    case "initializing api": return "Đang khởi tạo OCR";
    case "initializing tesseract": return "Đang khởi tạo bộ nhận diện";
    case "recognizing text": return "Đang nhận diện văn bản";
    default: return "Đang chuẩn bị bộ nhận diện";
  }
}

function emptyDraft(): MedicationDraft {
  return { name: "", strengthText: "", dosage: "", dosageUnit: "", dosageForm: "other",
    frequency: 0, intakeTimes: [], directionsText: "", startDate: "", endDate: "", notes: "" };
}

export default function OcrProbe() {
  const router = useRouter();
  const params = useLocalSearchParams<{ seniorUid?: string }>();
  const { user, profile } = useAuth();
  const seniorUid = profile?.role === "senior" ? user?.uid ?? "" : (typeof params.seniorUid === "string" ? params.seniorUid : "");
  const family = profile?.role === "family";
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [picking, setPicking] = useState(false);
  const pickLock = useRef(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<OcrCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [drafts, setDrafts] = useState<MedicationDraft[]>([]);
  const [sourceNameLines, setSourceNameLines] = useState<string[]>([]);
  const [nameConfirmed, setNameConfirmed] = useState<boolean[]>([]);
  const [timePickerTarget, setTimePickerTarget] = useState<{ draftIndex: number; timeIndex: number } | null>(null);
  const [pickerHour, setPickerHour] = useState<number | null>(null);
  const [pickerMinute, setPickerMinute] = useState<number | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const source = useMemo(() => job ? { html: probeHtml(job.image), baseUrl: "https://localhost/" } : null, [job]);
  const selectedCandidate = candidates[selectedCandidateIndex] ?? candidates[0] ?? null;
  const canSave = drafts.length > 0 && drafts.every((draft, index) => medicationValidationError(draft) === null && nameConfirmed[index] === true);

  useEffect(() => {
    if (!job) return;
    const timer = setTimeout(() => { setJob(null); setError("Quá thời gian nhận diện. Kiểm tra mạng hoặc thử ảnh nhỏ hơn."); }, MAX_OCR_MS);
    return () => clearTimeout(timer);
  }, [job]);

  function resetResult() {
    setError(""); setCandidates([]); setSelectedCandidateIndex(0); setElapsed(null); setProgress(null); setProcessedSize(null);
    setDrafts([]); setSourceNameLines([]); setNameConfirmed([]); setTimePickerTarget(null); setParseWarnings([]); setSaveError("");
  }

  async function pick(camera: boolean) {
    if (job || pickLock.current) return;
    pickLock.current = true; setPicking(true);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert("Quyền camera", "Bạn vẫn có thể chọn ảnh từ thư viện."); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, base64: false, allowsEditing: false };
      const output = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (output.canceled) return;
      const asset = output.assets[0];
      if (!asset?.uri) { setError("Không lấy được ảnh. Vui lòng thử lại."); return; }
      const context = ImageManipulator.manipulate(asset.uri, { maxWidth: 2000, maxHeight: 2800 });
      const rendered = await context.renderAsync();
      const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.94, base64: true });
      if (!normalized.base64 || normalized.base64.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(normalized.base64)) {
        resetResult(); setSelected(null); setError("Ảnh không hợp lệ hoặc quá lớn sau khi chuẩn hóa. Hãy thử ảnh khác."); return;
      }
      resetResult();
      setSelected({ uri: normalized.uri, base64: normalized.base64, width: normalized.width, height: normalized.height, source: camera ? "camera" : "library" });
    } catch {
      setError("Không thể xử lý ảnh. Hãy thử chụp lại hoặc chọn ảnh khác.");
    } finally {
      pickLock.current = false; setPicking(false);
    }
  }

  function start() {
    if (job || picking) return;
    resetResult(); setStatus("Đang chuẩn bị ảnh và bộ nhận diện");
    setJob({ image: selected?.base64 ?? null, width: selected?.width ?? 1500, height: selected?.height ?? 1000, source: selected?.source ?? "sample", started: Date.now() });
  }

  function fail() { setJob(null); setError("Không thể nhận diện ảnh. Hãy kiểm tra kết nối mạng và thử lại."); }

  function analyzeSelectedText() {
    if (!selectedCandidate?.text.trim()) {
      Alert.alert("Phân tích đơn thuốc", "Chưa có văn bản OCR để phân tích.");
      return;
    }
    const parsed = parsePrescriptionText(selectedCandidate.text);
    setDrafts(parsed.medications);
    setSourceNameLines(parsed.sourceNameLines);
    setNameConfirmed(parsed.medications.map(() => false));
    setParseWarnings(parsed.warnings);
    setSaveError("");
    if (parsed.medications.length === 0) Alert.alert("Chưa tìm thấy thuốc", parsed.warnings.join("\n"));
  }

  function updateDraft(index: number, changes: Partial<MedicationDraft>) {
    setDrafts(current => current.map((draft, itemIndex) => itemIndex === index ? { ...draft, ...changes } : draft));
    if (changes.name !== undefined) {
      setNameConfirmed(current => current.map((confirmed, itemIndex) => itemIndex === index ? false : confirmed));
    }
  }

  function removeDraft(index: number) {
    setDrafts(current => current.filter((_, itemIndex) => itemIndex !== index));
    setSourceNameLines(current => current.filter((_, itemIndex) => itemIndex !== index));
    setNameConfirmed(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function changeFrequency(index: number, count: number) {
    if (count < 1 || count > 6) return;
    setDrafts(current => current.map((draft, itemIndex) => itemIndex === index
      ? { ...draft, frequency: count, intakeTimes: Array.from({ length: count }, (_, timeIndex) => draft.intakeTimes[timeIndex] ?? "") }
      : draft));
  }

  function updateTime(index: number, timeIndex: number, value: string) {
    setDrafts(current => current.map((draft, itemIndex) => itemIndex === index
      ? { ...draft, intakeTimes: draft.intakeTimes.map((time, currentIndex) => currentIndex === timeIndex ? value : time) }
      : draft));
  }

  function openTimePicker(index: number, timeIndex: number, currentTime: string) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(currentTime);
    setPickerHour(match ? Number(match[1]) : null);
    setPickerMinute(match ? Number(match[2]) : null);
    setTimePickerTarget({ draftIndex: index, timeIndex });
  }

  function confirmTimeSelection() {
    if (!timePickerTarget || pickerHour === null || pickerMinute === null) return;
    updateTime(timePickerTarget.draftIndex, timePickerTarget.timeIndex,
      String(pickerHour).padStart(2, "0") + ":" + String(pickerMinute).padStart(2, "0"));
    setTimePickerTarget(null);
  }

  function addManualDraft() {
    if (drafts.length >= 10) return;
    setDrafts(current => [...current, emptyDraft()]);
    setSourceNameLines(current => [...current, ""]);
    setNameConfirmed(current => [...current, false]);
  }

  async function saveReviewedDrafts() {
    if (saving || !canSave || !user || !profile || !seniorUid) {
      Alert.alert("Chưa thể lưu", "Hãy kiểm tra tên thuốc với ảnh gốc, xác nhận từng tên, rồi hoàn thiện liều lượng, đơn vị, số lần/ngày và giờ uống.");
      return;
    }
    setSaving(true); setSaveError("");
    try {
      const normalized = drafts.map(normalizeMedicationDraft);
      const image = selected ? {
        base64: selected.base64,
        source: selected.source,
        width: selected.width,
        height: selected.height,
      } : undefined;
      if (family) await createMedicationRequestsFromPrescription(user, profile, seniorUid, normalized, image);
      else if (profile.role === "senior") await createMedicationsFromPrescription(user, profile, seniorUid, normalized, image);
      else throw new Error("wrong-role");
      const photoMessage = selected
        ? " Ảnh gốc đã được lưu riêng tư trong hồ sơ người cao tuổi; người chăm sóc đang kết nối có thể xem."
        : " Đây là ảnh mẫu thử nghiệm nên không có ảnh gốc để lưu.";
      const message = family
        ? "Đã gửi " + normalized.length + " đề xuất thuốc. Người cao tuổi phải duyệt trước khi thuốc được thêm chính thức." + photoMessage
        : "Đã thêm " + normalized.length + " loại thuốc vào danh sách quản lý thuốc." + photoMessage;
      Alert.alert("Nhập thuốc từ đơn thuốc", message, [{ text: "Đóng", onPress: () => router.back() }]);
    } catch (cause) {
      setSaveError(medicationErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.back()}><Text style={styles.secondaryText}>‹ Quay lại</Text></Pressable>
        <Text style={styles.title}>Nhập thuốc từ ảnh đơn thuốc</Text>
        <Text style={styles.warning}>Bản thử nghiệm tải bộ OCR từ Internet. Chỉ dùng ảnh giả lập hoặc đã ẩn danh hoàn toàn. Khi xác nhận thuốc, ảnh thật sẽ được lưu riêng tư vào hồ sơ người cao tuổi; ảnh mẫu không được lưu. Mọi thông tin phải được kiểm tra thủ công trước khi xác nhận.</Text>
        {!user || !profile || !seniorUid
          ? <Text style={styles.warning}>Không xác định được hồ sơ người cao tuổi. Hãy quay lại Quản lý thuốc và mở chức năng này từ hồ sơ cần nhập.</Text>
          : <Text style={styles.muted}>{family ? "Kết quả sẽ được gửi thành đề xuất để người cao tuổi duyệt." : "Bạn đang nhập thuốc vào hồ sơ của chính mình."}</Text>}
        {selected ? <Image source={{ uri: selected.uri }} style={styles.preview} resizeMode="contain" />
          : <View style={styles.empty}><Text style={styles.body}>Chụp ảnh hoặc chọn ảnh đơn thuốc để nhận diện nhiều loại thuốc.</Text></View>}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={!!job || picking || saving} style={styles.secondary} onPress={() => void pick(true)}><Text style={styles.secondaryText}>{picking ? "Đang chuẩn hóa ảnh..." : "Chụp ảnh"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!!job || picking || saving} style={styles.secondary} onPress={() => void pick(false)}><Text style={styles.secondaryText}>Chọn ảnh</Text></Pressable>
        </View>
        {selected && !job && <View style={styles.meta}>
          <Text style={styles.body}>Nguồn: {selected.source === "camera" ? "Camera iPhone" : "Thư viện ảnh"}</Text>
          <Text style={styles.muted}>Ảnh đã chuẩn hóa: {selected.width} × {selected.height} px</Text>
          <Pressable style={styles.secondary} disabled={saving} onPress={() => { setSelected(null); resetResult(); }}><Text style={styles.secondaryText}>Chọn ảnh khác</Text></Pressable>
        </View>}
        {!job && <Pressable accessibilityRole="button" disabled={picking || saving} style={styles.primary} onPress={start}><Text style={styles.primaryText}>Bắt đầu nhận diện (4 lượt)</Text></Pressable>}
        {job && source && <>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.body}>{status}{progress !== null ? " · " + progress + "%" : ""}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { setJob(null); setStatus(""); setProgress(null); }}><Text style={styles.secondaryText}>Hủy nhận diện</Text></Pressable>
          <WebView
            style={styles.web} source={source} originWhitelist={["*"]}
            onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === "https://localhost/" || request.url === "https://localhost"}
            javaScriptEnabled domStorageEnabled={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito
            onError={fail} onContentProcessDidTerminate={fail}
            onMessage={event => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === "progress") {
                  setStatus(message.status === "recognizing text" && message.pass
                    ? "Lượt " + message.pass + "/" + message.total + ": " + String(message.label || "đang nhận diện")
                    : stageLabel(message.status));
                  setProgress(message.status === "recognizing text" && typeof message.progress === "number" && Number.isFinite(message.progress)
                    ? Math.round(Math.max(0, Math.min(1, message.progress)) * 100) : null);
                } else if (message.type === "result" && Array.isArray(message.candidates)) {
                  const next = message.candidates.filter((candidate: unknown): candidate is OcrCandidate => {
                    if (!candidate || typeof candidate !== "object") return false;
                    const value = candidate as OcrCandidate;
                    return typeof value.id === "string" && typeof value.label === "string" && typeof value.text === "string" && typeof value.confidence === "number";
                  }).slice(0, 4);
                  setElapsed((Date.now() - job.started) / 1000);
                  setProcessedSize({ width: Number(message.width) || job.width, height: Number(message.height) || job.height });
                  setCandidates(next); setSelectedCandidateIndex(0); setDrafts([]); setParseWarnings([]); setJob(null);
                } else if (message.type === "error") fail();
              } catch { fail(); }
            }}
          />
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
        {candidates.length > 0 && <View style={styles.empty}>
          <Text style={styles.heading}>Các kết quả OCR để đối chiếu</Text>
          <Text style={styles.muted}>Độ tin cậy là chỉ số kỹ thuật của Tesseract, không phải xác suất thuốc được nhận diện đúng.</Text>
          <View style={styles.candidateList}>
            {candidates.map((candidate, index) => <Pressable key={candidate.id} accessibilityRole="button"
              style={[styles.candidateButton, selectedCandidateIndex === index && styles.candidateButtonActive]}
              onPress={() => { setSelectedCandidateIndex(index); setDrafts([]); setSourceNameLines([]); setNameConfirmed([]); setParseWarnings([]); }}>
              <Text style={styles.candidateText}>Kết quả {index + 1}</Text><Text style={styles.muted}>{candidate.confidence}%</Text>
            </Pressable>)}
          </View>
          {selectedCandidate && <>
            <Text style={styles.heading}>{selectedCandidate.label}</Text>
            <Text style={styles.body}>Thời gian: {elapsed?.toFixed(1)} giây</Text>
            <Text style={styles.muted}>Ảnh OCR: {processedSize?.width} × {processedSize?.height} px</Text>
            <Text selectable style={styles.body}>{selectedCandidate.text.trim() || "Không nhận diện được chữ."}</Text>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={analyzeSelectedText}><Text style={styles.primaryText}>Phân tích thành danh sách thuốc</Text></Pressable>
          </>}
        </View>}
        {drafts.length > 0 && <View style={styles.empty}>
          <Text style={styles.heading}>Kiểm tra {drafts.length} mục thuốc</Text>
          <Text style={styles.warning}>OCR chỉ đọc văn bản, không xác minh được tên thuốc. Hãy đối chiếu từng tên với ảnh đơn thuốc hoặc bao bì. Nếu không đọc chắc chắn, không xác nhận và không lưu. Trường chưa nhận diện được phải tự chọn hoặc nhập; ứng dụng không tự đoán liều hay giờ.</Text>
          {parseWarnings.map((warning, index) => <Text key={index} style={styles.warning}>{warning}</Text>)}
          {drafts.map((draft, index) => {
            const validation = medicationValidationError(draft);
            return <View key={index} style={styles.medicationDraftCard}>
              <View style={styles.draftHeader}>
                <Text style={styles.heading}>Thuốc {index + 1}</Text>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => removeDraft(index)}><Text style={styles.removeText}>Bỏ mục này</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Tên thuốc *</Text>
              <Text style={styles.muted}>{sourceNameLines[index] ? "Dòng OCR gốc: " + sourceNameLines[index] : "Tên thuốc nhập thủ công. Hãy kiểm tra chính tả trước khi xác nhận."}</Text>
              <TextInput value={draft.name} onChangeText={value => updateDraft(index, { name: value })} style={styles.input} placeholder="Nhập đúng tên trên bao bì/đơn thuốc" />
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: nameConfirmed[index] === true }} disabled={saving || !draft.name.trim()} style={[styles.nameConfirmButton, nameConfirmed[index] && styles.nameConfirmButtonActive]} onPress={() => setNameConfirmed(current => current.map((confirmed, itemIndex) => itemIndex === index ? !confirmed : confirmed))}>
                <View style={[styles.checkboxBox, nameConfirmed[index] && styles.checkboxBoxActive]}>
                  <Text style={styles.checkboxMark}>{nameConfirmed[index] ? "✓" : ""}</Text>
                </View>
                <Text style={styles.nameConfirmText}>Tôi đã đối chiếu tên thuốc với ảnh gốc và xác nhận chính xác.</Text>
              </Pressable>
              {!nameConfirmed[index] && <Text style={styles.warning}>Tên thuốc chưa được xác nhận. Nếu OCR đọc sai, hãy sửa tên trước khi tích xác nhận.</Text>}
              <Text style={styles.fieldLabel}>Hàm lượng</Text>
              <TextInput value={draft.strengthText} onChangeText={value => updateDraft(index, { strengthText: value })} style={styles.input} placeholder="Ví dụ: 500 mg" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>Liều lượng *</Text>
                  <TextInput value={draft.dosage} onChangeText={value => updateDraft(index, { dosage: value })} style={styles.input} placeholder="Ví dụ: 1" />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>Đơn vị *</Text>
                  <TextInput value={draft.dosageUnit} onChangeText={value => updateDraft(index, { dosageUnit: value })} style={styles.input} placeholder="viên, ml, gói..." />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Dạng thuốc</Text>
              <View style={styles.formChoices}>
                {MEDICATION_FORMS.map(form => <Pressable key={form.value} disabled={saving} onPress={() => updateDraft(index, { dosageForm: form.value as MedicationForm })} style={[styles.choice, draft.dosageForm === form.value && styles.choiceActive]}>
                  <Text style={[styles.choiceText, draft.dosageForm === form.value && styles.choiceTextActive]}>{form.label}</Text>
                </Pressable>)}
              </View>
              <Text style={styles.fieldLabel}>Số lần sử dụng trong ngày *</Text>
              <View style={styles.formChoices}>
                {[1, 2, 3, 4, 5, 6].map(count => <Pressable key={count} accessibilityRole="button" accessibilityState={{ selected: draft.frequency === count }} disabled={saving} onPress={() => changeFrequency(index, count)} style={[styles.choice, draft.frequency === count && styles.choiceActive]}>
                  <Text style={[styles.choiceText, draft.frequency === count && styles.choiceTextActive]}>{count} lần</Text>
                </Pressable>)}
              </View>
              {draft.intakeTimes.map((time, timeIndex) => <View key={timeIndex} style={styles.field}>
                <Text style={styles.fieldLabel}>Giờ uống lần {timeIndex + 1} *</Text>
                <Pressable accessibilityRole="button" disabled={saving} onPress={() => openTimePicker(index, timeIndex, time)} style={[styles.input, styles.timeButton]}>
                  <Text style={[styles.timeButtonText, !time && styles.timePlaceholder]}>{time || "Chạm để chọn giờ uống"}</Text>
                  <Text style={styles.timeButtonAction}>Chọn giờ</Text>
                </Pressable>
              </View>)}
              <Text style={styles.fieldLabel}>Hướng dẫn sử dụng</Text>
              <TextInput value={draft.directionsText} onChangeText={value => updateDraft(index, { directionsText: value })} style={[styles.input, styles.multiline]} multiline placeholder="Ví dụ: sau ăn" />
              {!!validation && <Text style={styles.error}>{validation}</Text>}
            </View>;
          })}
          <Pressable accessibilityRole="button" disabled={saving || drafts.length >= 10} style={styles.secondary} onPress={addManualDraft}><Text style={styles.secondaryText}>＋ Thêm thuốc thủ công</Text></Pressable>
          {!!saveError && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
          <Text style={styles.muted}>{family
            ? "Khi gửi, mỗi thuốc sẽ thành một đề xuất riêng. Người cao tuổi phải duyệt trước khi thuốc được thêm chính thức."
            : "Khi lưu, tất cả mục thuốc hợp lệ sẽ được thêm cùng một giao dịch. Bạn cần kiểm tra từng trường trước khi xác nhận."}</Text>
          <Pressable accessibilityRole="button" disabled={saving || !canSave || !user || !profile || !seniorUid} style={[styles.primary, (saving || !canSave) && styles.disabled]} onPress={() => void saveReviewedDrafts()}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{family ? "Gửi đề xuất thuốc" : "Xác nhận và thêm thuốc"}</Text>}
          </Pressable>
          {!canSave && <Text style={styles.muted}>Chưa thể lưu: hãy hoàn thiện thông tin, chọn giờ uống và xác nhận đã đối chiếu tên của từng thuốc với ảnh gốc.</Text>}
        </View>}
      </ScrollView>
      <Modal visible={timePickerTarget !== null} transparent animationType="slide" onRequestClose={() => setTimePickerTarget(null)}>
        <View style={styles.timePickerOverlay}>
          <View style={styles.timePickerCard}>
            <Text style={styles.heading}>Chọn giờ uống</Text>
            <Text style={styles.muted}>Chạm chọn một số ở cột giờ và một số ở cột phút.</Text>
            <View style={styles.timePickerColumns}>
              <View style={styles.timePickerColumn}>
                <Text style={styles.fieldLabel}>Giờ</Text>
                <ScrollView style={styles.timePickerScroll} contentContainerStyle={styles.timePickerOptions}>
                  {Array.from({ length: 24 }, (_, hour) => <Pressable key={hour} accessibilityRole="button" accessibilityState={{ selected: pickerHour === hour }} onPress={() => setPickerHour(hour)} style={[styles.timePickerOption, pickerHour === hour && styles.timePickerOptionActive]}>
                    <Text style={[styles.timePickerOptionText, pickerHour === hour && styles.timePickerOptionTextActive]}>{String(hour).padStart(2, "0")}</Text>
                  </Pressable>)}
                </ScrollView>
              </View>
              <View style={styles.timePickerColumn}>
                <Text style={styles.fieldLabel}>Phút</Text>
                <ScrollView style={styles.timePickerScroll} contentContainerStyle={styles.timePickerOptions}>
                  {Array.from({ length: 60 }, (_, minute) => <Pressable key={minute} accessibilityRole="button" accessibilityState={{ selected: pickerMinute === minute }} onPress={() => setPickerMinute(minute)} style={[styles.timePickerOption, pickerMinute === minute && styles.timePickerOptionActive]}>
                    <Text style={[styles.timePickerOptionText, pickerMinute === minute && styles.timePickerOptionTextActive]}>{String(minute).padStart(2, "0")}</Text>
                  </Pressable>)}
                </ScrollView>
              </View>
            </View>
            <Text style={styles.timePickerPreview}>Giờ đã chọn: {pickerHour === null || pickerMinute === null ? "Chưa chọn đủ" : String(pickerHour).padStart(2, "0") + ":" + String(pickerMinute).padStart(2, "0")}</Text>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" style={[styles.secondary, styles.timePickerAction]} onPress={() => setTimePickerTarget(null)}><Text style={styles.secondaryText}>Hủy</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={pickerHour === null || pickerMinute === null} style={[styles.primary, styles.timePickerAction, (pickerHour === null || pickerMinute === null) && styles.disabled]} onPress={confirmTimeSelection}><Text style={styles.primaryText}>Xác nhận giờ</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  heading: { fontSize: 18, fontWeight: "700", color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  warning: { fontSize: 15, lineHeight: 22, color: "#854D0E", backgroundColor: "#FEF3C7", padding: 12, borderRadius: 10 },
  error: { fontSize: 14, lineHeight: 20, color: "#B42318", backgroundColor: "#FEE4E2", padding: 10, borderRadius: 9 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { flex: 1, minWidth: 120, gap: 4 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  meta: { gap: 8 },
  secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, minHeight: 46, justifyContent: "center", alignItems: "center" },
  secondaryText: { fontSize: 15, color: colors.primary, fontWeight: "700" },
  primary: { backgroundColor: colors.primary, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center", padding: 12 },
  primaryText: { color: "white", fontSize: 16, fontWeight: "700", textAlign: "center" },
  preview: { width: "100%", height: 240, backgroundColor: "white", borderRadius: 10 },
  empty: { backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 },
  candidateList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  candidateButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, justifyContent: "center", gap: 2 },
  candidateButtonActive: { borderColor: colors.primary, backgroundColor: "#E6F4F1" },
  candidateText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  medicationDraftCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 9 },
  nameConfirmButton: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  nameConfirmButtonActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  checkboxBox: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.muted, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  checkboxBoxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxMark: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  nameConfirmText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  timeButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeButtonText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  timePlaceholder: { color: colors.muted, fontWeight: "400" },
  timeButtonAction: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  timePickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 16 },
  timePickerCard: { width: "100%", maxWidth: 420, maxHeight: "85%", backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  timePickerColumns: { flexDirection: "row", gap: 12 },
  timePickerColumn: { flex: 1, gap: 6 },
  timePickerScroll: { height: 220, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  timePickerOptions: { padding: 6, gap: 4 },
  timePickerOption: { minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  timePickerOptionActive: { backgroundColor: colors.primary },
  timePickerOptionText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  timePickerOptionTextActive: { color: "#FFFFFF" },
  timePickerPreview: { textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "800" },
  timePickerAction: { flex: 1 },

  draftHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  removeText: { color: "#B42318", fontSize: 14, fontWeight: "700" },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 11, paddingVertical: 9, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  formChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 10 },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  choiceText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  choiceTextActive: { color: colors.primaryDark },
  disabled: { opacity: 0.45 },
  web: { height: 260, backgroundColor: "white", flex: 0 },
});
