import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { WebView } from "react-native-webview";
import { colors } from "@/theme";

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

export default function OcrProbe() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedImage | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [picking, setPicking] = useState(false);
  const pickLock = useRef(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<OcrCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [processedSize, setProcessedSize] = useState<{ width: number; height: number } | null>(null);
  const source = useMemo(() => job ? { html: probeHtml(job.image), baseUrl: "https://localhost/" } : null, [job]);
  const selectedCandidate = candidates[selectedCandidateIndex] ?? candidates[0] ?? null;

  useEffect(() => {
    if (!job) return;
    const timer = setTimeout(() => { setJob(null); setError("Quá thời gian nhận diện. Kiểm tra mạng hoặc thử ảnh nhỏ hơn."); }, MAX_OCR_MS);
    return () => clearTimeout(timer);
  }, [job]);

  function resetResult() {
    setError(""); setCandidates([]); setSelectedCandidateIndex(0); setElapsed(null); setProgress(null); setProcessedSize(null);
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
      const normalized = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.94, base64: true });
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.back()}><Text style={styles.secondaryText}>‹ Quay lại</Text></Pressable>
        <Text style={styles.title}>Thử nghiệm OCR</Text>
        <Text style={styles.warning}>Chỉ dùng ảnh đơn thuốc giả lập hoặc đã ẩn danh hoàn toàn. Bản thử nghiệm tải bộ OCR từ Internet, chưa xử lý đơn thuốc thật và không lưu vào Firebase.</Text>
        {selected ? <Image source={{ uri: selected.uri }} style={styles.preview} resizeMode="contain" /> :
          <View style={styles.empty}><Text style={styles.body}>Ảnh mẫu tích hợp có hai loại thuốc giả lập. Bạn cũng có thể chụp ảnh hoặc chọn ảnh từ thư viện.</Text></View>}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={!!job || picking} style={styles.secondary} onPress={() => void pick(true)}><Text style={styles.secondaryText}>{picking ? "Đang chuẩn hóa ảnh..." : "Chụp ảnh"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!!job || picking} style={styles.secondary} onPress={() => void pick(false)}><Text style={styles.secondaryText}>Chọn ảnh</Text></Pressable>
        </View>
        {selected && !job && <View style={styles.meta}>
          <Text style={styles.body}>Nguồn: {selected.source === "camera" ? "Camera iPhone" : "Thư viện ảnh"}</Text>
          <Text style={styles.muted}>Ảnh đã chuẩn hóa: {selected.width} × {selected.height} px</Text>
          <Pressable style={styles.secondary} onPress={() => { setSelected(null); resetResult(); }}><Text style={styles.secondaryText}>Dùng ảnh mẫu tích hợp</Text></Pressable>
        </View>}
        {!job && <Pressable accessibilityRole="button" disabled={picking} style={styles.primary} onPress={start}><Text style={styles.primaryText}>Bắt đầu nhận diện (4 lượt)</Text></Pressable>}
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
                  setCandidates(next); setSelectedCandidateIndex(0); setJob(null);
                } else if (message.type === "error") fail();
              } catch { fail(); }
            }}
          />
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
        {candidates.length > 0 && <View style={styles.empty}>
          <Text style={styles.heading}>Các kết quả OCR để đối chiếu</Text>
          <Text style={styles.muted}>Đã chạy 4 cách xử lý. Độ tin cậy là chỉ số kỹ thuật của Tesseract, không phải xác suất thuốc được nhận diện đúng.</Text>
          <View style={styles.candidateList}>
            {candidates.map((candidate, index) => <Pressable key={candidate.id} accessibilityRole="button"
              style={[styles.candidateButton, selectedCandidateIndex === index && styles.candidateButtonActive]}
              onPress={() => setSelectedCandidateIndex(index)}>
              <Text style={styles.candidateText}>Kết quả {index + 1}</Text><Text style={styles.muted}>{candidate.confidence}%</Text>
            </Pressable>)}
          </View>
          {selectedCandidate && <>
            <Text style={styles.heading}>{selectedCandidate.label}</Text>
            <Text style={styles.body}>Thời gian: {elapsed?.toFixed(1)} giây</Text>
            <Text style={styles.muted}>Ảnh xử lý: {processedSize?.width} × {processedSize?.height} px</Text>
            <Text selectable style={styles.body}>{selectedCandidate.text.trim() || "Không nhận diện được chữ."}</Text>
          </>}
        </View>}
      </ScrollView>
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
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  meta: { gap: 8 },
  secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, minHeight: 48, justifyContent: "center", alignItems: "center" },
  secondaryText: { fontSize: 15, color: colors.primary, fontWeight: "700" },
  primary: { backgroundColor: colors.primary, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", padding: 12 },
  primaryText: { color: "white", fontSize: 16, fontWeight: "700" },
  preview: { width: "100%", height: 240, backgroundColor: "white", borderRadius: 10 },
  empty: { backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 },
  candidateList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  candidateButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, justifyContent: "center", gap: 2 },
  candidateButtonActive: { borderColor: colors.primary, backgroundColor: "#E6F4F1" },
  candidateText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  web: { height: 260, backgroundColor: "white", flex: 0 }
});
